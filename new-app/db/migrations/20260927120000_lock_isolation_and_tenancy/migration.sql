-- The quote lock requires READ COMMITTED, locks only a quote the caller can see, and is taken by every
-- path that takes a balance row lock (findings P1, P2 and P3 of the fourth J4 re-review).
--
-- Design: `docs/design/scope-reduction.md` §3c, amended; the owner approved P1's remedy 2026-09-27.
--
-- ## P1 · THE LOCK WAS ONLY CORRECT UNDER READ COMMITTED, AND NOTHING SAID SO
--
-- `20260927110000_one_lock_per_quote` makes a writer wait for a seal and then judge the ceiling. That is
-- right only if the judgement reads what the seal committed — true under READ COMMITTED, where each
-- statement takes a fresh snapshot, and false under REPEATABLE READ or SERIALIZABLE, where the
-- transaction keeps the snapshot it took first. The fourth re-review executed it on PostgreSQL 16.13:
-- a writer that had read once, then invoiced after a seal committed, billed 50,000 against a superseded
-- revision with a ceiling of 0 — N4's end state, with no race needed. One `isolationLevel` option in the
-- application, or a database default, would have switched the fix off silently.
--
-- **The owner's decision:** financial writes are refused outside READ COMMITTED. The check lives in
-- `quote_money_lock()`, which every financial path reaches, so the assumption is enforced where it is
-- relied on. The cost, stated: the application cannot run these writes in a SERIALIZABLE transaction.
-- It has no need to — the locks do the serialising — and a refusal is loud, where the alternative was a
-- silent wrong figure.
--
-- ## P2 · ONE TENANT COULD HOLD ANOTHER TENANT'S QUOTE LOCK
--
-- Advisory locks are cluster-wide and bypass row security. The key was `hashtext(quote id)`, 32 bits,
-- so two tenants' quotes could share a lock; any session could call `quote_money_lock()` with another
-- tenant's quote id; and a seal naming another tenant's quote waited on that tenant's lock before its
-- foreign key refused it — a timing answer to "is this quote busy?", where Rule 4 says a foreign id is
-- answered exactly as one that does not exist. Now:
--
--   * the lock is taken only on a quote the caller can SEE under row security. An invisible quote locks
--     nothing, and the write that named it is refused by its own checks, exactly as for a quote that
--     does not exist;
--   * the key is 64 bits of `md5(quote id)` (single-key advisory space, apart from every two-key lock).
--     Not the UUID's own bits, because the pg_locks system view is readable by the application role and would then
--     show half of another tenant's quote id. A collision needs ~2^32 quotes to become likely.
--
-- ## P3 · A DIRECT BALANCE RECOMPUTE TOOK THE LOCKS IN THE OTHER ORDER
--
-- `issue_balance_apply()` is public and took the balance row lock without the quote lock, so a
-- transaction that called it and then wrote could deadlock against a seal (executed: SQLSTATE 40P01).
-- It now takes the shared quote lock itself, first, so every path orders quote lock then balance row
-- lock. The callers that already took the quote lock take it again in the same transaction, which is a
-- no-op for a lock the transaction already holds.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It does not stop a deadlock between transactions that write on TWO quotes, or that write on a quote
--   and then seal it (a shared lock cannot be upgraded while another holder waits). Detected by
--   PostgreSQL, SQLSTATE 40P01, and retried by the application (N5), which does not exist yet.
-- - The pg_locks system view still shows that SOME quote lock with a given hashed key is held. It no longer reveals
--   which quote, and one tenant can no longer take or wait on another's.
-- - Proved against real PostgreSQL in `db/test/concurrency.pg.test.ts`; PGlite shows serial behaviour.

-- ---------------------------------------------------------------------------
-- 1. The lock: READ COMMITTED only, visible quotes only, a 64-bit hashed key.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION quote_money_lock(p_quote_id UUID, p_exclusive BOOLEAN) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_key BIGINT;
BEGIN
  -- P1. Checked before anything else, and for every caller, including one naming no quote: the rule is
  -- about the transaction doing a financial write, not about the quote.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'financial writes must run under READ COMMITTED, not %: the per-quote lock relies '
                    'on each statement seeing what the transaction it waited for committed',
      current_setting('transaction_isolation')
      USING ERRCODE = 'invalid_transaction_state';
  END IF;

  -- P2. Row security decides visibility: another tenant's quote, or none at all, locks nothing.
  IF p_quote_id IS NULL OR NOT EXISTS (SELECT 1 FROM "quote" q WHERE q."id" = p_quote_id) THEN
    RETURN;
  END IF;

  v_key := ('x' || substr(md5(p_quote_id::text), 1, 16))::bit(64)::bigint;
  IF p_exclusive THEN
    PERFORM pg_advisory_xact_lock(v_key);
  ELSE
    PERFORM pg_advisory_xact_lock_shared(v_key);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. The balance recompute takes the shared quote lock first (P3). Unchanged otherwise from
--    `20260926220000_withdrawal_after_full_credit`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION issue_balance_apply(p_issue_id UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_locked      UUID;
  v_variations  BIGINT;
  v_invoiced    BIGINT;
  v_ceiling     BIGINT;
  v_written     INTEGER;
  v_check_var   BIGINT;
  v_check_inv   BIGINT;
BEGIN
  -- P3. Quote lock before balance row lock, on every path, so no single-quote cycle exists.
  PERFORM quote_money_lock_for_issue(p_issue_id);

  -- The flag goes up before the lock: a locking read is checked against the UPDATE policy (G2).
  PERFORM set_config('pryvis.balance_write', 'on', true);

  SELECT b."issue_id" INTO v_locked
    FROM "issue_balance" b
   WHERE b."issue_id" = p_issue_id
     FOR UPDATE;

  IF v_locked IS NULL THEN
    RAISE EXCEPTION 'issue_balance row missing for issue %; it is created with the acceptance, and '
                    'a FOR UPDATE on no row takes no lock at all', p_issue_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT COALESCE(SUM(v."amount_minor"), 0) INTO v_variations
    FROM "variation" v WHERE v."issue_id" = p_issue_id;

  -- Net of credit notes, over unvoided invoices only, and never below zero per invoice (K1).
  SELECT COALESCE(SUM(GREATEST(0,
           i."amount_minor"
           - (SELECT COALESCE(SUM(c."amount_minor"), 0) FROM "credit_note" c WHERE c."invoice_id" = i."id")
         )), 0) INTO v_invoiced
    FROM "invoice" i
   WHERE i."issue_id" = p_issue_id
     AND NOT EXISTS (SELECT 1 FROM "invoice_void" z WHERE z."invoice_id" = i."id");

  UPDATE "issue_balance"
     SET "variations_total_minor" = v_variations,
         "invoiced_total_minor"   = v_invoiced,
         "recomputed_at"          = now()
   WHERE "issue_id" = p_issue_id;

  -- J3: zero rows written means something is wrong that must not be papered over.
  GET DIAGNOSTICS v_written = ROW_COUNT;
  IF v_written <> 1 THEN
    RAISE EXCEPTION 'issue_balance write for issue % affected % row(s), not 1; refusing rather than '
                    'judging the ceiling on figures that were never stored', p_issue_id, v_written
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT b."variations_total_minor", b."invoiced_total_minor"
    INTO v_check_var, v_check_inv
    FROM "issue_balance" b WHERE b."issue_id" = p_issue_id;
  IF v_check_var <> v_variations OR v_check_inv <> v_invoiced THEN
    RAISE EXCEPTION 'issue_balance for issue % reads back as (%, %) after writing (%, %)',
      p_issue_id, v_check_var, v_check_inv, v_variations, v_invoiced
      USING ERRCODE = 'data_corrupted';
  END IF;

  PERFORM set_config('pryvis.balance_write', '', true);

  v_ceiling := issue_ceiling_minor(p_issue_id);
  IF v_invoiced > v_ceiling THEN
    RAISE EXCEPTION 'invoiced total % exceeds the ceiling % for issue % by %',
      v_invoiced, v_ceiling, p_issue_id, v_invoiced - v_ceiling
      USING ERRCODE = 'check_violation',
            HINT = 'A reduction in scope below what is already invoiced needs that amount credited '
                   'against an invoice first, in the same transaction.';
  END IF;
END;
$$;
