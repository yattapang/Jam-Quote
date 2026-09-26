-- Withdrawal was guarded against one dependant, and the accepted issue has three (finding H4).
--
-- ## WHAT WAS WRONG
--
-- `PRD.md` R1.15a allowed an acceptance to be withdrawn "only before any invoice exists against it".
-- The same commit that added the remedy also created two other things that hang off an acceptance:
--
--   1. `issue_balance`, created in the acceptance transaction and asserting an `accepted_total`.
--      After a withdrawal that row still existed, claiming an accepted total for an acceptance that
--      no longer existed — and the nightly reconciliation job would rebuild it and report it as
--      consistent, because it *was* internally consistent. Consistently wrong.
--   2. `variation`, which is **immutable** and may be **recorded offline**. So: a client accepts,
--      $400,000 of variations are recorded, a wrong client name is discovered, the acceptance is
--      withdrawn and the issue superseded. The variations are immutable rows pointing at a
--      superseded issue whose acceptance is gone. They cannot be moved or deleted, and the corrected
--      issue's `variations_total` is zero — so the agreed extra work is either unbillable, or it is
--      re-recorded, leaving two immutable copies of the same agreement with nothing marking which
--      pair is live.
--
-- The remedy for a typo had become a way to detach recorded money from the issue it was agreed
-- against. The feature was sound; it was specified against one guard condition when there were three
-- dependants.
--
-- ## AND ADR 0025 CONTRADICTED ITSELF, WHICH IS WHY THIS IS NOT A LITERAL IMPLEMENTATION OF IT
--
-- Decision 2 says `accepted_total` is written once, "never again". Decision 4 says that on withdrawal
-- "`accepted_total` returns to zero". Both cannot hold. The ADR is amended in the same change, and
-- the contradiction is resolved in favour of decision 2, because an immutable column is the thing
-- that makes the copy safe at all (Rule 7): it is safe precisely because the issue it derives from
-- cannot change.
--
-- So nothing is mutated on withdrawal. **The ceiling becomes state-aware instead.**
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- It does not give a tenant a way out after variations exist. That is deliberate and it is a product
-- consequence worth stating: once extra work has been agreed on top of an acceptance, the cheap
-- typo remedy is gone and the path is a credit note and a fresh quote — the same path money already
-- forces. A "wrong client name" discovered late therefore costs more than one discovered early, and
-- that is better than a remedy which silently orphans an agreement.
--
-- It also does not decide what a screen should say when the refusal happens. The message matters and
-- it is application work.

-- ---------------------------------------------------------------------------
-- 1. The ceiling knows whether the issue is still accepted.
--
-- CREATE OR REPLACE, so every existing caller — `issue_balance_apply` — picks up the new definition
-- without being touched. That is the payoff of ADR 0025's "one expression": the rule changed in one
-- place and nothing else in the database or the documents needed editing.
--
-- Zero, not NULL, when the issue is not accepted: NULL would make `invoiced > ceiling` evaluate to
-- NULL, which is not true, which would let an invoice through. A refusal must not depend on
-- three-valued logic.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION issue_ceiling_minor(p_issue_id UUID) RETURNS BIGINT
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM "acceptance" a
       WHERE a."issue_id" = p_issue_id
         AND a."outcome" = 'accepted'
         AND NOT EXISTS (
           SELECT 1 FROM "acceptance_withdrawal" w WHERE w."acceptance_id" = a."id"
         )
    )
    THEN COALESCE(
      (SELECT b."accepted_total_minor" + b."variations_total_minor"
         FROM "issue_balance" b WHERE b."issue_id" = p_issue_id),
      0
    )
    ELSE 0
  END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Withdrawal is refused while anything financial hangs off the acceptance.
--
-- A TRIGGER rather than a check in the application, for the reason every other rule in this schema is
-- where it is: the application is not the only writer, and a precondition a caller can forget is a
-- precondition. `acceptance_withdrawal` is append-only, so BEFORE INSERT is the whole surface.
-- ---------------------------------------------------------------------------
CREATE FUNCTION acceptance_withdrawal_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_issue_id   UUID;
  v_invoices   BIGINT;
  v_variations BIGINT;
BEGIN
  SELECT a."issue_id" INTO v_issue_id FROM "acceptance" a WHERE a."id" = NEW."acceptance_id";

  SELECT count(*) INTO v_invoices FROM "invoice" i WHERE i."issue_id" = v_issue_id;
  SELECT count(*) INTO v_variations FROM "variation" v WHERE v."issue_id" = v_issue_id;

  IF v_invoices > 0 THEN
    RAISE EXCEPTION
      'cannot withdraw this acceptance: % invoice(s) exist against the issue. The remedy once money '
      'has been demanded is a credit note and a fresh quote, not a withdrawal', v_invoices
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

CREATE TRIGGER acceptance_withdrawal_preconditions
  BEFORE INSERT ON "acceptance_withdrawal"
  FOR EACH ROW EXECUTE FUNCTION acceptance_withdrawal_guard();
