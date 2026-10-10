-- An issue's frozen lines are now the source of its subtotal, in the database (finding J11; rounding
-- decided by the owner 2026-10-01, recorded in `docs/BRIEF-STATUS.md`).
--
-- ## WHAT CHANGES
--
-- 1. Every frozen line's total is its quantity times its unit price, rounded HALF AWAY FROM ZERO to the
--    cent: `quantity_thousandths * unit_price_minor / 1000`, with an exact half going up for a positive
--    amount and down for a negative one. Discounts may be offered, so a line may be negative, and it
--    rounds symmetrically: 0.5 cents of credit is 1 cent of credit, as 0.5 cents of charge is 1 cent.
--    The product is taken in NUMERIC, so a large quantity times a large price cannot overflow a BIGINT
--    on the way to being compared; a total that does not fit the column was refused by its type already.
--    The division is `div()`, exact integer division, and NOT `/`: NUMERIC `/` rounds its quotient to a
--    scale PostgreSQL picks from the operands' size, so `floor((x + 500) / 1000)` came out one cent HIGH
--    for 999,999.999 × 999,999,999.99 — caught by the J11 test before this migration was committed.
-- 2. Every issue's `subtotal_minor` equals the sum of its own lines' totals (zero for an issue with no
--    lines). Checked by a DEFERRED constraint trigger, at COMMIT, because the header is inserted before
--    its lines: a check at the end of each statement would refuse every seal. It fires on the header's
--    insert and on any change to its subtotal, and on any insert, update or delete of a line — so a line
--    added to an already-sealed issue, which changes the sum, is refused too.
--
-- `quote_issue_total_check` already ties `total_minor` to `subtotal_minor + tax_minor`. With this, the
-- chain that decides how much may be billed — lines, subtotal, total, `accepted_total_minor`, the ceiling
-- — has a database witness at every step except tax (below).
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It does not check TAX. `tax_minor` against `tax_rate_basis_points` and each line's `tax_treatment` is
--   owed as its own item with the GCT rules (owner, 2026-10-01). Until then the tax figure is the
--   application's alone, and so is the part of the ceiling it makes up.
-- - It does not check the DRAFT lines (`quote_line`). A draft is meant to be wrong while it is edited; the
--   seal is the moment that matters, and the frozen copy is what is checked.
-- - It does not check that the frozen lines match the draft they were copied from. That is a copy the
--   application makes; nothing in the database records which draft state a seal read.
-- - A deferred trigger can be skipped by a superuser who sets `session_replication_role = replica`. So can
--   every trigger in this schema; that is a property of PostgreSQL, not of this one.
-- - The sum is re-read once per inserted line at COMMIT, so an issue of N lines is summed N + 1 times. At
--   the size of a quote that costs nothing worth trading the simplicity for.

-- ---------------------------------------------------------------------------
-- 1. A line's total is its quantity times its unit price, half away from zero.
-- ---------------------------------------------------------------------------
ALTER TABLE "quote_issue_line" ADD CONSTRAINT "quote_issue_line_total_check"
    CHECK ("line_total_minor" =
        sign("quantity_thousandths"::numeric * "unit_price_minor")
        * div(abs("quantity_thousandths"::numeric * "unit_price_minor") + 500, 1000));

-- ---------------------------------------------------------------------------
-- 2. An issue's subtotal is the sum of its lines, checked at COMMIT.
-- ---------------------------------------------------------------------------
CREATE FUNCTION quote_issue_subtotal_matches_lines() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_issue_ids UUID[];
  v_issue_id  UUID;
  v_subtotal  BIGINT;
  v_lines     NUMERIC;
BEGIN
  -- From a header row, the issue is the row itself; from a line, it is the line's issue — both the old
  -- and the new one, so a line moved between issues is checked on both sides.
  IF TG_TABLE_NAME = 'quote_issue' THEN
    v_issue_ids := ARRAY[NEW."id"];
  ELSIF TG_OP = 'INSERT' THEN
    v_issue_ids := ARRAY[NEW."issue_id"];
  ELSIF TG_OP = 'DELETE' THEN
    v_issue_ids := ARRAY[OLD."issue_id"];
  ELSE
    v_issue_ids := ARRAY[OLD."issue_id", NEW."issue_id"];
  END IF;

  FOREACH v_issue_id IN ARRAY v_issue_ids LOOP
    SELECT i."subtotal_minor" INTO v_subtotal FROM "quote_issue" i WHERE i."id" = v_issue_id;
    -- A header this transaction cannot see has nothing to be checked against here; the line's composite
    -- key to its issue refuses an orphan line on its own.
    CONTINUE WHEN NOT FOUND;
    SELECT COALESCE(sum(l."line_total_minor"), 0) INTO v_lines
      FROM "quote_issue_line" l WHERE l."issue_id" = v_issue_id;
    IF v_lines <> v_subtotal THEN
      RAISE EXCEPTION 'quote_issue % has subtotal_minor %, but its lines sum to %; an issue''s subtotal '
                      'is the sum of its own frozen lines', v_issue_id, v_subtotal, v_lines
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "quote_issue_subtotal_matches_lines"
  AFTER INSERT OR UPDATE OF "subtotal_minor" ON "quote_issue"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION quote_issue_subtotal_matches_lines();

CREATE CONSTRAINT TRIGGER "quote_issue_line_sum_matches_subtotal"
  AFTER INSERT OR UPDATE OR DELETE ON "quote_issue_line"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION quote_issue_subtotal_matches_lines();
