-- The ceiling is enforced by the database, not by callers remembering to ask (finding J2).
--
-- ## WHAT WAS WRONG, AND IT WAS THE WORST DEFECT IN THIS PROJECT SO FAR
--
-- `20260925120000_documents_core` says, in a comment: "Raising here rolls the whole transaction back,
-- including the invoice that caused it. That is the refusal: **an invoice cannot exist without passing
-- through this function.**"
--
-- It can. Nothing required it. `invoice` has an ordinary tenant INSERT policy, so any code path — a
-- repository that forgets, a script, a fix applied at 2am — inserts an invoice and the ceiling is never
-- consulted. Review 4 executed it: an invoice for 5,000,000 against a ceiling of 100,000 inserted
-- cleanly, and `issue_balance` still reported `invoiced_total_minor = 0`.
--
-- Three documents claimed the guarantee. The mechanism was real and the *door to it* was never shut, so
-- the lock protected whoever chose to use it. That is the M14 class applied to a control rather than to a
-- citation: a comment crediting a mechanism that is not reachable.
--
-- ## THE FIX: HOOK THE FUNCTION TO THE WRITES INSTEAD OF ASKING CALLERS TO CALL IT
--
-- Every row that can move the ceiling or the invoiced total now fires `issue_balance_apply()` itself:
-- `invoice`, `invoice_void`, `credit_note`, `variation`. So the function is not something a caller
-- reaches for, it is something a write **cannot avoid** — which is the same reasoning that put tenant
-- isolation in policies rather than in a base repository class (Rule 4).
--
-- Why this and not a CHECK or a deferred constraint trigger that re-sums at commit:
--
--   * a CHECK cannot see other rows, and the ceiling is a cross-row aggregate;
--   * a deferred trigger that re-summed at COMMIT would be correct for one transaction and **wrong under
--     concurrency**: two transactions each inserting an invoice would each see only its own, both pass,
--     and together exceed the ceiling. Calling `issue_balance_apply()` takes the row lock, which
--     serialises them. Correctness here needs the lock, not just the arithmetic.
--
-- `issue_balance_apply()` is idempotent, so an explicit call alongside the trigger is harmless and
-- existing code that calls it keeps working.
--
-- ## A SECOND HOLE CLOSES WITH IT, AND IT WAS ALSO ONLY PROSE
--
-- `issue_balance_apply()` raises when there is no balance row, and a balance row exists only for an
-- accepted issue. So **invoicing an issue that was never accepted is now refused by the database too**.
-- That was previously a sentence in the PRD and nothing else.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It does not make the ceiling right, only enforced. J10 (the ceiling is scoped to the issue when the
--   product needs the quote) and J4 (a negative variation strands the issue) are separate findings and
--   are still open.
-- - It does not prove behaviour under real concurrency. PGlite is one connection, so the lock's
--   serialisation is still asserted by reading rather than by racing it, and the two-connection Postgres
--   test remains owed.
-- - `FOR EACH ROW` is deliberate rather than optimal: a bulk insert of N invoices calls the function N
--   times. Invoices arrive one at a time in this product, and a statement-level trigger would have to
--   re-derive the affected issues itself. If bulk invoicing ever exists, this is the thing to revisit.

-- ---------------------------------------------------------------------------
-- One trigger function, used by four tables, resolving the issue each row belongs to.
-- ---------------------------------------------------------------------------
CREATE FUNCTION issue_balance_enforce() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_issue_id UUID;
BEGIN
  -- Each of the four tables reaches its issue differently, and naming them here keeps the knowledge in
  -- one place rather than in four near-identical triggers.
  IF TG_TABLE_NAME = 'invoice' OR TG_TABLE_NAME = 'variation' THEN
    v_issue_id := NEW."issue_id";
  ELSIF TG_TABLE_NAME = 'invoice_void' THEN
    SELECT i."issue_id" INTO v_issue_id FROM "invoice" i WHERE i."id" = NEW."invoice_id";
  ELSIF TG_TABLE_NAME = 'credit_note' THEN
    SELECT i."issue_id" INTO v_issue_id FROM "invoice" i WHERE i."id" = NEW."invoice_id";
  ELSE
    -- A new table wired to this trigger without being named above would otherwise silently do nothing,
    -- which is exactly the failure this migration exists to correct.
    RAISE EXCEPTION 'issue_balance_enforce() has no rule for table %; add one rather than letting the '
                    'ceiling go unchecked', TG_TABLE_NAME
      USING ERRCODE = 'feature_not_supported';
  END IF;

  IF v_issue_id IS NULL THEN
    RAISE EXCEPTION 'could not resolve an issue for % row %; refusing rather than skipping the ceiling',
      TG_TABLE_NAME, NEW."id"
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Takes the row lock, re-sums from the rows, refuses if the ceiling would be exceeded. Raising here
  -- rolls back the row that fired the trigger — and now that is true for EVERY path, not only the one
  -- that remembered to ask.
  PERFORM issue_balance_apply(v_issue_id);

  RETURN NULL;  -- AFTER trigger; the return value is ignored.
END;
$$;

CREATE TRIGGER invoice_enforces_ceiling
  AFTER INSERT ON "invoice"
  FOR EACH ROW EXECUTE FUNCTION issue_balance_enforce();

CREATE TRIGGER invoice_void_enforces_ceiling
  AFTER INSERT ON "invoice_void"
  FOR EACH ROW EXECUTE FUNCTION issue_balance_enforce();

CREATE TRIGGER credit_note_enforces_ceiling
  AFTER INSERT ON "credit_note"
  FOR EACH ROW EXECUTE FUNCTION issue_balance_enforce();

CREATE TRIGGER variation_enforces_ceiling
  AFTER INSERT ON "variation"
  FOR EACH ROW EXECUTE FUNCTION issue_balance_enforce();
