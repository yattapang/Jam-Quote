-- The balance row's creator takes the quote lock too, and three sentences in the previous migration are
-- corrected here because that migration cannot be edited (findings Q1, Q2 and Q5 of the fifth J4
-- re-review; Rule 6).
--
-- ## Q5 · `issue_balance_open()` WAS THE ONE FINANCIAL WRITE THAT SKIPPED THE LOCK
--
-- `20260927120000_lock_isolation_and_tenancy` says every financial path reaches `quote_money_lock()`.
-- `issue_balance_open()`, which creates the balance row in the acceptance transaction, did not: it ran
-- under REPEATABLE READ, and for an issue with no acceptance at all. The re-review found no wrong figure
-- from it — the acceptance's own BEFORE INSERT trigger usually took the lock first — but "every path"
-- was false, and a caller that opens a balance without inserting an acceptance got neither the lock nor
-- the isolation check. It now takes the shared quote lock first, which also brings the READ COMMITTED
-- check with it. It still does not require an acceptance to exist; an unaccepted issue's ceiling is 0,
-- so its balance row can bill nothing.
--
-- ## CORRECTIONS TO `20260927120000_lock_isolation_and_tenancy`, WHICH CANNOT BE EDITED
--
-- - **"so no single-quote cycle exists" (its P3 section) is false (Q2).** Taking the quote lock first
--   removed the cycle P3 found, but a transaction that holds the SHARED lock and then asks for the
--   EXCLUSIVE one on the same quote — writing and then sealing, as the documented wrong-document remedy
--   does if run as one transaction — deadlocks against another holder. The same migration's own "what
--   this does not do" section says so; its P3 sentence contradicted it. PostgreSQL detects the deadlock
--   (SQLSTATE 40P01) and aborts one side; nothing is left wrong, and the step must be retried or run as
--   separate transactions. Executed by the re-review (its D5 and D6).
-- - **"every financial path reaches it" was false (Q5)** until this migration; see above.
-- - **"one tenant can no longer take or wait on another's" is true of `quote_money_lock()`, not of the
--   database (Q1).** The key is a published recipe, and any session can call PostgreSQL's own
--   `pg_advisory_*` functions with it. Only our own server holds a SQL session, so this needs a
--   SQL-injection-class defect in our code to reach; the owner accepted it as LOW on 2026-09-27, with the
--   fix named for later in `docs/THREAT-MODEL.md` §4d.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It does not prevent the shared-to-exclusive deadlock above; it states it.
-- - It does not revoke the advisory-lock functions from the application role (Q1's deferred fix).

CREATE OR REPLACE FUNCTION issue_balance_open(p_issue_id UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_tenant UUID;
  v_total  BIGINT;
BEGIN
  -- Q5. The shared quote lock — and with it the READ COMMITTED check — before the row is created, so
  -- opening a balance is ordered like every other financial write on the quote.
  PERFORM quote_money_lock_for_issue(p_issue_id);

  SELECT q."tenant_id", q."total_minor" INTO v_tenant, v_total
    FROM "quote_issue" q WHERE q."id" = p_issue_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'cannot open a balance for unknown issue %', p_issue_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  PERFORM set_config('pryvis.balance_write', 'on', true);

  INSERT INTO "issue_balance"
      ("issue_id", "tenant_id", "accepted_total_minor", "variations_total_minor",
       "invoiced_total_minor", "recomputed_at")
  VALUES (p_issue_id, v_tenant, v_total, 0, 0, now())
  ON CONFLICT ("issue_id") DO NOTHING;

  PERFORM set_config('pryvis.balance_write', '', true);
END;
$$;
