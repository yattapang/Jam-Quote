-- A new revision is checked against EVERY live earlier revision, and a dead issue takes no variation
-- (finding K6 of the J4 re-review, which reopens J10).
--
-- ## WHAT WAS WRONG
--
-- `20260926140000_one_live_ceiling_per_quote` refuses to seal a new revision while an accepted earlier
-- revision has money against it. It found that earlier revision with `LIMIT 1`, and its comment said
-- "At most one can match, because this trigger is what keeps it so". That is false. Revision 1 accepted
-- with nothing billed may be superseded — correctly — and revision 2 then accepted. Revision 1's
-- acceptance is still live (superseded is not withdrawn), so two earlier revisions match, and `LIMIT 1`
-- picked revision 1, which has no money. The J4 re-review executed it: revision 2 accepted and
-- invoiced 90,000, revision 3 sealed without complaint, and revision 2's ceiling fell to 0 with 90,000
-- still invoiced against it. Every invoice, variation and partial credit on it raised from then on —
-- a stuck state, and the design of J4 had claimed none could be entered.
--
-- ## AND ITS TWIN
--
-- The same superseded revision 1 would take a VARIATION. Its ceiling is 0, but so is what is invoiced
-- against it, so `issue_balance_apply()` found nothing to refuse. Executed while preparing this fix: a
-- +30,000 variation recorded against a superseded issue, after which withdrawing that acceptance is
-- refused (a variation exists) — and with the first half of this fix, that live-but-dead acceptance
-- would then block every later revision of the quote, permanently. Agreed work recorded against a
-- document nobody can bill is the H4 shape again.
--
-- ## THE FIX
--
-- 1. `quote_issue_one_live_ceiling()` asks about every earlier revision that is accepted and not
--    withdrawn, and refuses if ANY of them has an invoice or a variation.
-- 2. `issue_balance_enforce()` refuses a variation on an issue that is superseded or whose acceptance
--    is withdrawn. Invoices on such an issue were already refused, by a ceiling of 0.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It does not withdraw revision 1's acceptance when revision 2 is sealed. A superseded acceptance
--   stays live-but-inert: its ceiling is 0 by `issue_ceiling_minor()` and, now, nothing financial can
--   be added to it. Withdrawing automatically would be a write the tenant did not make.
-- - It does not prove behaviour under real concurrency (one PGlite connection). A seal and an invoice
--   racing on different revisions are not serialised by the balance row lock, because they lock
--   different rows; that is a known limit, recorded with the owed two-connection Postgres test.

-- ---------------------------------------------------------------------------
-- 1. Every live earlier revision, not the first one found.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION quote_issue_one_live_ceiling() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_blocking_revision INTEGER;
  v_invoices          BIGINT;
  v_variations        BIGINT;
BEGIN
  -- The earliest earlier revision that is accepted, not withdrawn, AND has money against it. Choosing
  -- by the money rather than by the acceptance is the fix: a revision with no money cannot block, and
  -- the one that has money must not hide behind one that does not.
  SELECT prior."revision",
         (SELECT count(*) FROM "invoice" i WHERE i."issue_id" = prior."id"),
         (SELECT count(*) FROM "variation" v WHERE v."issue_id" = prior."id")
    INTO v_blocking_revision, v_invoices, v_variations
    FROM "quote_issue" prior
   WHERE prior."quote_id" = NEW."quote_id"
     AND prior."revision" < NEW."revision"
     AND EXISTS (
       SELECT 1 FROM "acceptance" a
        WHERE a."issue_id" = prior."id"
          AND a."outcome" = 'accepted'
          AND NOT EXISTS (
            SELECT 1 FROM "acceptance_withdrawal" w WHERE w."acceptance_id" = a."id"
          )
     )
     AND (EXISTS (SELECT 1 FROM "invoice" i WHERE i."issue_id" = prior."id")
          OR EXISTS (SELECT 1 FROM "variation" v WHERE v."issue_id" = prior."id"))
   ORDER BY prior."revision"
   LIMIT 1;

  IF v_blocking_revision IS NOT NULL THEN
    RAISE EXCEPTION
      'cannot seal revision % of this quote: revision % is accepted and has % invoice(s) and % '
      'variation(s) against it. Money has moved, so the change is a variation, or a credit note and a '
      'fresh quote — a new revision would leave two live ceilings on one job (finding J10)',
      NEW."revision", v_blocking_revision, v_invoices, v_variations
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. A variation needs a live issue. Everything else is unchanged from
--    `20260926200000_scope_reduction`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION issue_balance_enforce() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_issue_id UUID;
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

  -- K6's twin. A superseded or withdrawn issue has a ceiling of 0, and with nothing invoiced a positive
  -- variation passes the ceiling check — recording agreed work against a document nobody can bill, and
  -- blocking every later revision of the quote. The state comes from the one definition of it.
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

  -- J4. A credit note written after the invoice's void is refused (nested IFs: PL/pgSQL plans the whole
  -- condition, and `NEW."invoice_id"` does not exist on an `invoice` or `variation` row).
  IF TG_TABLE_NAME = 'credit_note' THEN
    IF EXISTS (SELECT 1 FROM "invoice_void" z WHERE z."invoice_id" = NEW."invoice_id") THEN
      RAISE EXCEPTION 'invoice % is voided; a credit note against it would subtract money the void '
                      'already removed', NEW."invoice_id"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NULL;  -- AFTER trigger; the return value is ignored.
END;
$$;
