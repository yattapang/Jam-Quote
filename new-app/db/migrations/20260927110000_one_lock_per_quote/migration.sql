-- One lock per quote: a seal excludes every financial write on the same quote (findings N4 and N2 of
-- the third J4 re-review).
--
-- Design: `docs/design/scope-reduction.md` §3c, approved by the owner 2026-09-27.
--
-- ## N4 · THE L6 LOCK COVERED ONLY WHAT THE SEAL COULD ALREADY SEE
--
-- `20260927100000_withdrawal_with_variations` made a seal lock the latest revision's balance row and
-- claimed a racing variation "waits and is then refused". The third re-review raced real PostgreSQL 16
-- sessions and showed two ways through:
--
--   (a) the seal of revision 2 is open; meanwhile revision 1 is ACCEPTED and INVOICED 50,000 in other
--       sessions. The seal saw no acceptance on revision 1, so it locked nothing; both commit. Revision 1
--       is superseded with 50,000 billed against a ceiling of 0 — K6's stuck state, entered by timing.
--   (b) the seal chose "the latest revision" BEFORE waiting on the lock and never chose again, so two
--       concurrent seals could each judge a revision the other had already superseded.
--
-- A row lock can only protect a row that exists and is visible. What the seal must exclude is "any
-- financial write on this quote", including ones that create the rows it would lock.
--
-- ## THE FIX
--
-- A transaction-scoped advisory lock keyed on the quote. A SEAL takes it EXCLUSIVELY, at the top of its
-- guard, before it reads anything. Every financial write — acceptance, invoice, void, credit note,
-- variation, withdrawal — takes it SHARED, before it takes the issue's balance row lock. So:
--
--   * a seal and any financial write on the same quote cannot interleave: whichever starts second waits
--     for the other to commit, and then reads the committed state (READ COMMITTED gives each statement a
--     fresh snapshot, so a statement run after the wait sees what the other committed);
--   * financial writes on one quote do not block each other (shared locks are compatible), and writes on
--     different quotes do not touch the same lock;
--   * the order is always quote lock, then balance row lock, so no single-quote cycle exists.
--
-- **Advisory, not a row lock on `quote`,** for two reasons: a draft quote is edited through ordinary
-- UPDATEs, which a `FOR SHARE` held by invoicing would block; and a locking read on `quote` is checked
-- against its UPDATE policy, which financial writes should not need. The key is `(725001, hashtext(quote
-- id))`. `725001` is an arbitrary namespace for this lock and nothing else; two quotes whose ids hash
-- alike merely share a lock, which costs waiting and never correctness.
--
-- ## N2 · THE SEAL NO LONGER NEEDS A BALANCE ROW
--
-- The L6 fix called `issue_balance_apply()` inside the seal to take the balance row lock, and that raises
-- when an accepted issue has no balance row — so a legitimate seal was refused with a message about the
-- wrong thing. The quote lock replaces the balance lock in the seal, so the call is gone.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It does not prevent a DEADLOCK between transactions that mix writes on two quotes, or that write on a
--   quote and then seal the same quote in one transaction (a shared lock cannot be upgraded while another
--   holder waits). PostgreSQL detects it and aborts one transaction with SQLSTATE 40P01; nothing is left
--   wrong, and the application must retry. Finding N5, stated rather than fixed.
-- - It serialises financial writes against seals on a quote, not financial writes against each other;
--   those still rely on the balance row lock, as before.
-- - What it proves is proved against real PostgreSQL in `db/test/concurrency.pg.test.ts`; the PGlite
--   suites run one connection and can only show the functions still behave serially.

-- ---------------------------------------------------------------------------
-- 1. The lock, in one place.
-- ---------------------------------------------------------------------------
CREATE FUNCTION quote_money_lock(p_quote_id UUID, p_exclusive BOOLEAN) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF p_quote_id IS NULL THEN
    RETURN;  -- the caller raises its own, more specific error for an unresolvable row
  END IF;
  IF p_exclusive THEN
    PERFORM pg_advisory_xact_lock(725001, hashtext(p_quote_id::text));
  ELSE
    PERFORM pg_advisory_xact_lock_shared(725001, hashtext(p_quote_id::text));
  END IF;
END;
$$;

-- The shared form, from an issue. A foreign or unknown issue resolves to no quote under row security,
-- and then nothing is locked: the write that asked is refused by its own checks a moment later.
CREATE FUNCTION quote_money_lock_for_issue(p_issue_id UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM quote_money_lock(
    (SELECT i."quote_id" FROM "quote_issue" i WHERE i."id" = p_issue_id),
    false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. The seal: exclusive quote lock FIRST, then choose and judge the latest revision.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION quote_issue_one_live_ceiling() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_latest     UUID;
  v_revision   INTEGER;
  v_invoices   BIGINT;
  v_variations BIGINT;
BEGIN
  -- N4. Before reading anything: from here until this transaction ends, no acceptance, invoice, void,
  -- credit note, variation or withdrawal on this quote can commit, and any that were in flight have.
  PERFORM quote_money_lock(NEW."quote_id", true);

  -- N4 (b). Chosen AFTER the wait, so a revision sealed by the transaction we waited for is seen.
  SELECT prior."id", prior."revision" INTO v_latest, v_revision
    FROM "quote_issue" prior
   WHERE prior."quote_id" = NEW."quote_id"
     AND prior."revision" < NEW."revision"
   ORDER BY prior."revision" DESC
   LIMIT 1;

  IF v_latest IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM "acceptance" a
        WHERE a."issue_id" = v_latest
          AND a."outcome" = 'accepted'
          AND NOT EXISTS (
            SELECT 1 FROM "acceptance_withdrawal" w WHERE w."acceptance_id" = a."id"
          )
     ) THEN
    RETURN NEW;
  END IF;

  -- N2: no `issue_balance_apply()` here any more. The quote lock is what excludes a racing write.
  SELECT count(*) INTO v_invoices FROM "invoice" i WHERE i."issue_id" = v_latest;
  SELECT count(*) INTO v_variations FROM "variation" v WHERE v."issue_id" = v_latest;

  IF v_invoices > 0 OR v_variations > 0 THEN
    RAISE EXCEPTION
      'cannot seal revision % of this quote: revision % is accepted and has % invoice(s) and % '
      'variation(s) against it. Money has moved, so the change is a variation — or, for a wrong '
      'document, void or fully credit each invoice, withdraw the acceptance, then issue this revision. '
      'Sealing it now would leave two live ceilings on one job (finding J10)',
      NEW."revision", v_revision, v_invoices, v_variations
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. An acceptance takes the shared lock before it exists. A trigger rather than a line in
--    `issue_balance_open()`, so an acceptance written without opening its balance is covered too.
-- ---------------------------------------------------------------------------
CREATE FUNCTION acceptance_takes_quote_lock() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM quote_money_lock_for_issue(NEW."issue_id");
  RETURN NEW;
END;
$$;

CREATE TRIGGER acceptance_quote_lock
  BEFORE INSERT ON "acceptance"
  FOR EACH ROW EXECUTE FUNCTION acceptance_takes_quote_lock();

-- ---------------------------------------------------------------------------
-- 4. Invoice, void, credit note and variation: the shared quote lock before the balance row lock.
--    Unchanged otherwise from `20260926220000_withdrawal_after_full_credit`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION issue_balance_enforce() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_issue_id UUID;
  v_amount   BIGINT;
  v_credited BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'invoice' OR TG_TABLE_NAME = 'variation' THEN
    v_issue_id := NEW."issue_id";
  ELSIF TG_TABLE_NAME = 'invoice_void' THEN
    SELECT i."issue_id" INTO v_issue_id FROM "invoice" i WHERE i."id" = NEW."invoice_id";
  ELSIF TG_TABLE_NAME = 'credit_note' THEN
    SELECT i."issue_id" INTO v_issue_id FROM "invoice" i WHERE i."id" = NEW."invoice_id";
  ELSE
    RAISE EXCEPTION 'issue_balance_enforce() has no rule for table %; add one rather than letting the '
                    'ceiling go unchecked', TG_TABLE_NAME
      USING ERRCODE = 'feature_not_supported';
  END IF;

  IF v_issue_id IS NULL THEN
    RAISE EXCEPTION 'could not resolve an issue for % row %; refusing rather than skipping the ceiling',
      TG_TABLE_NAME, NEW."id"
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- N4. The shared quote lock, before the balance row lock and before any state is read, so a seal of
  -- another revision either finished first (and is seen) or waits for this write to commit.
  PERFORM quote_money_lock_for_issue(v_issue_id);

  -- Takes the balance row lock, re-sums, refuses past the ceiling. Everything below runs under it.
  PERFORM issue_balance_apply(v_issue_id);

  -- K6's twin: a variation needs a live accepted issue.
  IF TG_TABLE_NAME = 'variation' THEN
    IF quote_issue_state(v_issue_id) = 'superseded'
       OR NOT EXISTS (
         SELECT 1 FROM "acceptance" a
          WHERE a."issue_id" = v_issue_id
            AND a."outcome" = 'accepted'
            AND NOT EXISTS (
              SELECT 1 FROM "acceptance_withdrawal" w WHERE w."acceptance_id" = a."id"
            )
       ) THEN
      RAISE EXCEPTION 'issue % is superseded or no longer accepted; a variation can only be recorded '
                      'against the live accepted revision', v_issue_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Nested IFs: PL/pgSQL plans the whole condition, and `NEW."invoice_id"` does not exist on an
  -- `invoice` or `variation` row.
  IF TG_TABLE_NAME = 'credit_note' THEN
    IF EXISTS (SELECT 1 FROM "invoice_void" z WHERE z."invoice_id" = NEW."invoice_id") THEN
      RAISE EXCEPTION 'invoice % is voided and no longer counts; a credit note against it would record '
                      'a reduction of nothing', NEW."invoice_id"
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT i."amount_minor",
           (SELECT COALESCE(SUM(c."amount_minor"), 0) FROM "credit_note" c WHERE c."invoice_id" = i."id")
      INTO v_amount, v_credited
      FROM "invoice" i WHERE i."id" = NEW."invoice_id";
    IF v_credited > v_amount THEN
      RAISE EXCEPTION 'credit notes on invoice % would total more than the invoice itself', NEW."invoice_id"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NULL;  -- AFTER trigger; the return value is ignored.
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Withdrawal: the shared quote lock before the balance row lock. Unchanged otherwise from
--    `20260927100000_withdrawal_with_variations`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION acceptance_withdrawal_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_issue_id UUID;
  v_billed   BIGINT;
BEGIN
  SELECT a."issue_id" INTO v_issue_id FROM "acceptance" a WHERE a."id" = NEW."acceptance_id";

  PERFORM quote_money_lock_for_issue(v_issue_id);

  IF EXISTS (SELECT 1 FROM "issue_balance" b WHERE b."issue_id" = v_issue_id) THEN
    PERFORM issue_balance_apply(v_issue_id);
  END IF;

  SELECT count(*) INTO v_billed
    FROM "invoice" i
   WHERE i."issue_id" = v_issue_id
     AND NOT EXISTS (SELECT 1 FROM "invoice_void" z WHERE z."invoice_id" = i."id")
     AND i."amount_minor"
         > (SELECT COALESCE(SUM(c."amount_minor"), 0) FROM "credit_note" c WHERE c."invoice_id" = i."id");

  IF v_billed > 0 THEN
    RAISE EXCEPTION
      'cannot withdraw this acceptance: % invoice(s) against the issue still have money billed. The '
      'remedy for a wrong document is a credit note and a fresh quote: void or fully credit each '
      'invoice, then withdraw, then issue the next revision', v_billed
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
