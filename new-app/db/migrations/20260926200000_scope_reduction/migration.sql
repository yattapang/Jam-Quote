-- Agreed scope can be reduced after it has been invoiced (finding J4).
--
-- Design: `docs/design/scope-reduction.md`, approved by the owner 2026-09-26.
--
-- ## WHAT WAS WRONG
--
-- `20260925120000_documents_core` says of `variation.amount_minor`: "May be negative: a variation can
-- remove scope as well as add it." Nothing executed a negative variation, and the ordinary case does not
-- work. Accepted 100,000; invoiced 90,000; the client removes 20,000 of work. The ceiling would fall to
-- 80,000, below what is invoiced, so the variation is refused — and there was no way to make room:
--
--   * `issue_balance_apply()` summed whole unvoided invoices, so a `credit_note` moved no figure the
--     ceiling reads. `20260926110000_withdrawal_preconditions` names "a credit note and a fresh quote"
--     as the path once money has been demanded, and the credit note half of that did nothing;
--   * the only thing that lowered the invoiced total was `invoice_void`, which removes a whole invoice
--     that may already be sent and part-paid.
--
-- Review 4 executed this before J2 and found the variation COMMITTED and then permanently uncounted.
-- J2's trigger changed that: the variation's own insert now calls `issue_balance_apply()`, which raises,
-- and the row rolls back. Two migrations written with J2 (`20260926130000_ceiling_enforced_by_trigger`,
-- `20260926190000_balance_write_is_checked`) still describe J4 as "strands the issue". That stopped being
-- true when they landed, and nobody re-ran the scenario to notice (MISTAKES.md M27). What was left is the
-- blocker in the finding's title: no path to reduce agreed scope.
--
-- ## THE FIX
--
-- **The invoiced figure is net of credit notes.** Per issue: the sum, over invoices that are not voided,
-- of the invoice's amount less the credit notes against it. `issue_ceiling_minor()` is untouched — a
-- credit note still never RAISES the ceiling; it reduces what is counted against it. So the remedy is one
-- transaction: credit the excess against an invoice, then record the negative variation.
--
-- Because a credit note now makes room, two ways to manufacture room are refused, under the same lock:
--
--   * **over-crediting** — credit notes on an invoice may not total more than the invoice;
--   * **crediting a voided invoice** — the void already removed the whole invoice from the figure, so a
--     credit there would subtract money twice. A voided invoice's EARLIER credit notes drop out with it
--     (owner's decision), which the netting below does by construction: it only reads unvoided invoices.
--
-- And the ceiling refusal now says by how much, because "exceeds the ceiling" with no amount is a number
-- the contractor cannot act on.
--
-- **No stuck state can be entered.** Every row that can raise the invoiced figure (`invoice`) or lower the
-- ceiling (a negative `variation`) is checked in its own transaction; the rest (`invoice_void`,
-- `credit_note`) only lower the invoiced figure. So the check never fires against history it cannot change.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It does not prove behaviour under real concurrency. The checks run after `issue_balance_apply()` has
--   taken the balance row lock, so two credit notes on one invoice serialise — but PGlite is one
--   connection, so that is read rather than raced. The two-connection Postgres test is still owed.
-- - It does not choose which invoice is credited, and it does not derive what a credit on a paid invoice
--   means for that invoice's status (money owed back). Both are application work, not built.
-- - It does not make a variation client-signed; that is release 2 (PRD R1.22d).

-- ---------------------------------------------------------------------------
-- The balance function, with the invoiced figure netted and credit notes bounded.
-- Everything not named in the header above is unchanged from `20260926190000_balance_write_is_checked`.
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
  v_overcredit  UUID;
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

  -- J4. Credit notes may not total more than their invoice. Checked under the lock, BEFORE the sum is
  -- trusted, because an over-credited invoice would count as negative and manufacture ceiling room.
  SELECT i."id" INTO v_overcredit
    FROM "invoice" i
   WHERE i."issue_id" = p_issue_id
     AND (SELECT COALESCE(SUM(c."amount_minor"), 0) FROM "credit_note" c WHERE c."invoice_id" = i."id")
         > i."amount_minor"
   LIMIT 1;
  IF v_overcredit IS NOT NULL THEN
    RAISE EXCEPTION 'credit notes on invoice % would total more than the invoice itself', v_overcredit
      USING ERRCODE = 'check_violation';
  END IF;

  -- Re-summed from the rows, never read from the cache we are about to write.
  SELECT COALESCE(SUM(v."amount_minor"), 0) INTO v_variations
    FROM "variation" v WHERE v."issue_id" = p_issue_id;

  -- J4. Net of credit notes, over unvoided invoices only — so a voided invoice's credits leave with it
  -- and are never subtracted twice.
  SELECT COALESCE(SUM(
           i."amount_minor"
           - (SELECT COALESCE(SUM(c."amount_minor"), 0) FROM "credit_note" c WHERE c."invoice_id" = i."id")
         ), 0) INTO v_invoiced
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
    -- The amount is the actionable part: an invoice that is too large by it, or a scope reduction that
    -- needs that much credited first, in the same transaction.
    RAISE EXCEPTION 'invoiced total % exceeds the ceiling % for issue % by %',
      v_invoiced, v_ceiling, p_issue_id, v_invoiced - v_ceiling
      USING ERRCODE = 'check_violation',
            HINT = 'A reduction in scope below what is already invoiced needs that amount credited '
                   'against an invoice first, in the same transaction.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- The trigger function, with one addition: a credit note against a voided invoice is refused.
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

  -- J4. Checked here rather than in `issue_balance_apply()` because it is about the ORDER of two events:
  -- a credit note written before the void is legitimate history and simply drops out with the invoice;
  -- one written after it is refused.
  --
  -- Two nested IFs, not one `AND`: PL/pgSQL plans the whole condition, and `NEW."invoice_id"` does not
  -- exist on an `invoice` or `variation` row, so a single `AND` fails for every table but this one.
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
