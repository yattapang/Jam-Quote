-- A wrong document can be withdrawn once nothing is still billed on it, and credit notes are bounded per
-- invoice rather than per issue (findings K4 with J15, K1 and K2 of the J4 re-review).
--
-- Design: `docs/design/scope-reduction.md`, amended 2026-09-27 with the owner's decision on K4.
--
-- ## K4 · THE WRONG-DOCUMENT REMEDY REOPENED THE CEILING
--
-- PRD R1.15b's remedy for a wrong document once money has been demanded is "a credit note and a fresh
-- quote". Since `20260926200000_scope_reduction` a credit note lowers the invoiced figure, so crediting
-- the wrong issue's invoice in full left its whole ceiling open again — the re-review executed a second
-- 100,000 invoice against it. Nothing could close it: withdrawal was refused because an invoice EXISTED,
-- and J10 refuses a new revision while an accepted one has money. So the fresh quote had to be a separate
-- quote, and the job carried two live ceilings — the shape J10 exists to prevent.
--
-- **The owner's decision (2026-09-27):** an acceptance may be withdrawn once every invoice against the
-- issue is voided or fully credited, and no variation exists. Withdrawal already drops the ceiling to 0
-- (`issue_ceiling_minor()`), so the reopened room disappears, and the fresh quote becomes the next
-- revision of the same quote, because J10's guard ignores a withdrawn acceptance.
--
-- ## J15 · A VOIDED INVOICE BLOCKED WITHDRAWAL FOREVER
--
-- `acceptance_withdrawal_guard()` counted invoices, voided ones included, so voiding a mistaken invoice
-- never restored the remedy. The same change answers it: an invoice blocks withdrawal only while it still
-- has something billed on it.
--
-- Variations still block, for H4's reason: they are agreed work, and withdrawing would leave them
-- pointing at a dead issue. A negative variation that cancels a positive one is still two agreements.
--
-- The guard now takes the balance row lock first, through `issue_balance_apply()`. Without it, a
-- withdrawal and an invoice in two transactions could each see the other's absence and both commit,
-- leaving money invoiced on a withdrawn issue: invoiced above a ceiling of 0 at rest. With it they
-- serialise on the same row as every other write that moves a total.
--
-- ## K1 · AN OLD OVER-CREDITED INVOICE COULD STRAND ITS WHOLE ISSUE
--
-- The over-credit check scanned every invoice on the issue, voided ones too, inside
-- `issue_balance_apply()`. A credit note written before that check existed and larger than its invoice
-- would therefore make EVERY later write on the issue raise — void included, so there was no exit. Now:
--
--   * the check runs once, in `issue_balance_enforce()`, against the one invoice the new credit note
--     names — so it refuses the write that would over-credit, and never judges history;
--   * the netting counts an invoice as `GREATEST(0, amount − credits)`, so an over-credited invoice
--     contributes nothing rather than a negative amount that would manufacture room under the ceiling.
--
-- ## K2 · THE VOIDED-INVOICE REFUSAL GAVE A FALSE REASON
--
-- The message said a credit on a voided invoice "would subtract money the void already removed". It
-- would not: the netting excludes a voided invoice whole, credits included, so the figure is unchanged.
-- The refusal stands for the reason that is true — crediting a document that no longer counts records a
-- reduction of nothing, which is noise on a client's statement — and the message now says that.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It does not recompute existing balance rows. A migration runs with no tenant in context, and row
--   security (FORCED, so the owner too) hides every balance row from it. A cached `invoiced_total_minor`
--   written before credit netting stays gross until the issue's next write. Every refusal re-sums, so no
--   decision reads the stale figure; a reader of the cached column could.
-- - It does not decide what withdrawing means for money the client has already PAID on a fully credited
--   invoice. That is invoice status and refunds (PRD R1.25), not built.
-- - It does not prove behaviour under real concurrency. The lock is taken; that it serialises is read,
--   not raced, on one PGlite connection.

-- ---------------------------------------------------------------------------
-- 1. The balance function: no issue-wide over-credit scan, and a floor of zero per invoice.
--    Everything else is unchanged from `20260926200000_scope_reduction`.
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

  -- Net of credit notes, over unvoided invoices only, and never below zero per invoice (K1): an
  -- over-credited invoice counts as nothing, not as room.
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

-- ---------------------------------------------------------------------------
-- 2. The trigger function: the over-credit check moves here, scoped to the credited invoice, and the
--    voided-invoice refusal gives its true reason. Unchanged otherwise from
--    `20260926210000_live_ceiling_every_revision`.
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

  -- Takes the balance row lock, re-sums, refuses past the ceiling. Everything below runs under that lock.
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
    -- K2. A voided invoice is already excluded whole, credits and all, so a credit against it changes no
    -- figure. It is refused because it records a reduction of nothing on a client's statement.
    IF EXISTS (SELECT 1 FROM "invoice_void" z WHERE z."invoice_id" = NEW."invoice_id") THEN
      RAISE EXCEPTION 'invoice % is voided and no longer counts; a credit note against it would record '
                      'a reduction of nothing', NEW."invoice_id"
        USING ERRCODE = 'check_violation';
    END IF;

    -- K1. Credits on THIS invoice may not total more than it. Scoped to the invoice being credited, so a
    -- refusal is about the write in front of it and never about history elsewhere on the issue.
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
-- 3. Withdrawal: refused while anything is still billed, or any variation exists (K4, J15).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION acceptance_withdrawal_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_issue_id   UUID;
  v_billed     BIGINT;
  v_variations BIGINT;
BEGIN
  SELECT a."issue_id" INTO v_issue_id FROM "acceptance" a WHERE a."id" = NEW."acceptance_id";

  -- The balance row lock, so a withdrawal and an invoice cannot each miss the other. Only an accepted
  -- issue has a balance row; a withdrawal of anything else has no money to race with.
  IF EXISTS (SELECT 1 FROM "issue_balance" b WHERE b."issue_id" = v_issue_id) THEN
    PERFORM issue_balance_apply(v_issue_id);
  END IF;

  -- Invoices that still have something billed on them: not voided, and not fully credited.
  SELECT count(*) INTO v_billed
    FROM "invoice" i
   WHERE i."issue_id" = v_issue_id
     AND NOT EXISTS (SELECT 1 FROM "invoice_void" z WHERE z."invoice_id" = i."id")
     AND i."amount_minor"
         > (SELECT COALESCE(SUM(c."amount_minor"), 0) FROM "credit_note" c WHERE c."invoice_id" = i."id");
  SELECT count(*) INTO v_variations FROM "variation" v WHERE v."issue_id" = v_issue_id;

  IF v_billed > 0 THEN
    RAISE EXCEPTION
      'cannot withdraw this acceptance: % invoice(s) against the issue still have money billed. The '
      'remedy for a wrong document is a credit note and a fresh quote: void or fully credit each '
      'invoice, then withdraw, then issue the next revision', v_billed
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_variations > 0 THEN
    RAISE EXCEPTION
      'cannot withdraw this acceptance: % recorded variation(s) exist against the issue. Withdrawing '
      'would leave immutable agreed work pointing at a superseded issue, unbillable and '
      'unmovable (finding H4)', v_variations
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
