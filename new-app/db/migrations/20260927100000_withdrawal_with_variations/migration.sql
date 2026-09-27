-- A wrong document can be withdrawn even once variations exist, and only the live revision can block a
-- new one (findings L1, L2 and L6 of the second J4 re-review).
--
-- Design: `docs/design/scope-reduction.md` §3b, the owner's decision of 2026-09-27.
--
-- ## L1 · THE WRONG-DOCUMENT REMEDY STILL FAILED ONCE A VARIATION EXISTED
--
-- `20260926220000_withdrawal_after_full_credit` let a wrong document be withdrawn once nothing was still
-- billed — unless a variation existed, which H4 made a permanent block. The second re-review executed the
-- consequence: accepted 100,000, a +10,000 variation, invoiced 110,000 and credited in full; withdrawal
-- refused, a new revision refused, so the fresh quote had to be a SEPARATE quote — and the old issue then
-- took another 110,000 invoice. Two live ceilings on one job, exactly K4 again.
--
-- H4 refused withdrawal over variations because it would leave agreed work on a dead issue, with two
-- copies and nothing marking which was live. That reasoning predates `20260926210000`, which refuses a
-- variation on a superseded or withdrawn issue. So a withdrawn issue's variations are now inert history:
-- nothing can be added to them, its ceiling is 0, and the live agreement is what the next revision
-- carries, re-priced into its lines. **The owner's decision (2026-09-27): withdrawal is allowed once
-- nothing is still billed, whether or not variations exist.**
--
-- ## L2 · A LEGACY VARIATION ON A SUPERSEDED REVISION BLOCKED THE QUOTE FOREVER
--
-- Until `20260926210000`, a variation could be recorded against a superseded revision. The J10 guard then
-- treated that revision as "accepted with money" and refused every later revision, saying "Money has
-- moved" about a revision whose ceiling is 0. Now the guard asks about **the latest existing revision
-- only**. It is the only one that can hold a live ceiling — every earlier one is superseded, and
-- `issue_ceiling_minor()` gives a superseded issue 0 — so it is the only one whose money a new revision
-- could strand. A superseded revision's history can no longer block anything.
--
-- ## L6 · A SEAL COULD RACE A VARIATION ON THE REVISION IT SUPERSEDES
--
-- The seal guard took no lock, so a variation on revision N and the seal of N+1 could each miss the other.
-- The guard now takes revision N's balance row lock, through `issue_balance_apply()`, before judging it.
-- The variation's own trigger holds the same lock while it checks the issue's state, so one waits for the
-- other; the variation that waits then sees the committed revision and is refused.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It does not prove the L6 serialisation. One PGlite connection cannot race it; the argument is read,
--   under READ COMMITTED, where each statement inside the function takes a fresh snapshot after the lock.
-- - It does not carry a withdrawn issue's variations onto the next revision. Re-pricing agreed work into
--   the new quote's lines is the tenant's act, in the application, which is not built.
-- - It does not change what a withdrawn issue shows: its variations stay readable, append-only, as the
--   record of what was agreed on a document later withdrawn.

-- ---------------------------------------------------------------------------
-- 1. Withdrawal: refused only while an invoice still has money billed on it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION acceptance_withdrawal_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_issue_id UUID;
  v_billed   BIGINT;
BEGIN
  SELECT a."issue_id" INTO v_issue_id FROM "acceptance" a WHERE a."id" = NEW."acceptance_id";

  -- The balance row lock, so a withdrawal and an invoice cannot each miss the other.
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

  -- Variations no longer block (L1). Since `20260926210000` a withdrawn issue takes no new variation, so
  -- its recorded ones are history, not a second live copy of the agreement.
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. A new revision is judged against the live revision only, under its lock.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION quote_issue_one_live_ceiling() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_latest     UUID;
  v_revision   INTEGER;
  v_invoices   BIGINT;
  v_variations BIGINT;
BEGIN
  -- The latest existing revision below the new one: the only one not already superseded.
  SELECT prior."id", prior."revision" INTO v_latest, v_revision
    FROM "quote_issue" prior
   WHERE prior."quote_id" = NEW."quote_id"
     AND prior."revision" < NEW."revision"
   ORDER BY prior."revision" DESC
   LIMIT 1;

  IF v_latest IS NULL THEN
    RETURN NEW;
  END IF;

  -- Not accepted, or withdrawn: it has no live ceiling, so superseding it strands nothing.
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

  -- L6. Its balance row lock, taken before the money is counted, so a variation or invoice on it in
  -- another transaction is serialised against this seal rather than slipping past it.
  PERFORM issue_balance_apply(v_latest);

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
