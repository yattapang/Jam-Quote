-- The balance write is checked, not assumed (finding J3, second consequence).
--
-- ## WHAT WAS WRONG
--
-- `issue_balance_apply()` ended with an UPDATE and never looked at `ROW_COUNT`:
--
--     UPDATE "issue_balance" SET … WHERE "issue_id" = p_issue_id;
--
-- When that matched nothing, the function carried on and evaluated the ceiling using figures it had
-- not written. The same function goes to real trouble to make a MISSING row an exception rather than
-- a no-op — finding G2, because `SELECT … FOR UPDATE` on no row takes no lock — and then left the
-- write itself as a silent no-op. The precaution and the omission are three statements apart.
--
-- Two ways the UPDATE can match nothing, and both are now refusals:
--
--   * the balance row belongs to another tenant, so the policy filters it out of the UPDATE. J3's
--      composite keys make that unreachable through the documents graph, and this is the second
--      layer: if a route were ever found, the write fails loudly instead of reporting a ceiling
--      derived from numbers nobody stored;
--   * the row was deleted between the lock and the write. It cannot be, today — `issue_balance` has
--      no DELETE policy — but the function should not depend on a fact stated in another file.
--
-- ## WHY THE RE-READ AND NOT JUST ROW_COUNT
--
-- `ROW_COUNT` proves a row was written. It does not prove the row now HOLDS what was written, and the
-- values are what the ceiling decision rests on. So the function re-reads the two columns it just
-- wrote and refuses if they differ. That closes the gap between "the write succeeded" and "the cache
-- is what I computed", which is the whole reason this row exists (ADR 0025 decision 2).
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It does not change the arithmetic. The sums are the same sums; J4 (a negative variation
--   stranding an issue) is still open and is about what the numbers MEAN, not whether they were
--   stored.
-- - It does not prove behaviour under real concurrency. PGlite is one connection, so the lock's
--   serialisation is still read rather than raced, and the two-connection Postgres test is owed.
-- - It does not make the function idempotent in a new way; it was and remains safe to call twice.

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
  -- THE FLAG GOES UP BEFORE THE LOCK, AND THIS ORDER IS NOT COSMETIC.
  --
  -- `SELECT … FOR UPDATE` is a locking read, so Postgres checks it against the UPDATE policy's
  -- USING clause — not only the SELECT policy. With the flag still down, the row is filtered out of
  -- the locking read and the function concluded "no balance row exists" for a row plainly sitting
  -- there. Found by running it, not by reading it (G2).
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

  -- Re-summed from the rows, never read from the cache we are about to write.
  SELECT COALESCE(SUM(v."amount_minor"), 0) INTO v_variations
    FROM "variation" v WHERE v."issue_id" = p_issue_id;

  SELECT COALESCE(SUM(i."amount_minor"), 0) INTO v_invoiced
    FROM "invoice" i
   WHERE i."issue_id" = p_issue_id
     AND NOT EXISTS (SELECT 1 FROM "invoice_void" z WHERE z."invoice_id" = i."id");

  UPDATE "issue_balance"
     SET "variations_total_minor" = v_variations,
         "invoiced_total_minor"   = v_invoiced,
         "recomputed_at"          = now()
   WHERE "issue_id" = p_issue_id;

  -- J3. The row was locked a few statements ago, so zero here means something is wrong that the
  -- function must not paper over by continuing to a ceiling check on figures it did not store.
  GET DIAGNOSTICS v_written = ROW_COUNT;
  IF v_written <> 1 THEN
    RAISE EXCEPTION 'issue_balance write for issue % affected % row(s), not 1; refusing rather than '
                    'judging the ceiling on figures that were never stored', p_issue_id, v_written
      USING ERRCODE = 'no_data_found';
  END IF;

  -- And the values are read back, because "a row was written" is not "the row holds what I wrote".
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
    -- Raising here rolls the whole transaction back, including the invoice that caused it — and
    -- since J2 that is true for every path, not only the one that remembered to ask.
    RAISE EXCEPTION 'invoiced total % exceeds the ceiling % for issue %',
      v_invoiced, v_ceiling, p_issue_id
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
