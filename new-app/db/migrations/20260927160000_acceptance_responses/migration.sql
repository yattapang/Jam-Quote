-- What may follow a client's first answer on an issue (finding J13; design
-- `docs/design/acceptance-responses.md`, option C plus A, approved by the owner 2026-09-27; the per-issue
-- lock approved 2026-10-01).
--
-- ## WHAT CHANGES
--
-- 1. A client may DECLINE as often as they like and then ACCEPT the same issue — a mis-tap or a
--    negotiation no longer costs a new revision and a re-send. Every decline stays on record.
-- 2. At most ONE accepted row per issue, ever: the unique index on (tenant, issue) becomes partial,
--    WHERE outcome is accepted. The ceiling, the balance row, the per-quote lock and the evidence ladder
--    keep keying on a single acceptance. A withdrawn acceptance still occupies that slot, so an issue
--    whose acceptance was withdrawn can never be accepted again: the remedy is the next revision (K4, L1).
-- 3. A DECLINE AFTER AN ACCEPTANCE is refused, withdrawn or not. Retracting an acceptance is the
--    tenant's withdrawal, not a client response.
-- 4. Only an ACCEPTED row can be withdrawn. Before this, the withdrawal guard never read the outcome, so
--    a decline could be "withdrawn" — meaningless, and with many declines per issue, confusing.
-- 5. `quote_issue_state()` gains the state "withdrawn", and an acceptance now outranks an earlier decline.
--    Precedence: superseded, sealed awaiting a number, withdrawn, accepted, declined, issued.
--
-- ## WHY A PER-ISSUE LOCK
--
-- Rule 3 reads the acceptance rows of the issue. Responses take the per-quote lock SHARED, so a decline
-- and an accept arriving together would both pass: neither sees the other's uncommitted row. So the
-- response trigger takes a second, per-issue, EXCLUSIVE transaction lock, then re-reads. It is always
-- taken AFTER the quote lock (`acceptance_quote_lock` fires first: triggers fire in name order, and this
-- one is `acceptance_response_rules`), and nothing takes it in the other order, so it adds no deadlock
-- shape to the two `new-app/CLAUDE.md` lists. It uses the two-key advisory form, which PostgreSQL keeps
-- in a separate key space from the one-key form the quote lock uses, so the two can never collide. Like
-- the quote lock, it is taken only for an issue the caller can see under row security.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It does not refuse a response on a superseded or not-yet-numbered issue. Nothing did before either;
--   that is recorded as its own finding rather than widened into this one.
-- - It does not say what the client sees: whether the share page offers "change my answer" is the
--   application's, not built.
-- - It does not derive an evidence grade per acceptance (J6, open).

-- ---------------------------------------------------------------------------
-- 1. One accepted row per issue; declines unlimited.
-- ---------------------------------------------------------------------------
DROP INDEX "acceptance_issue_key";
CREATE UNIQUE INDEX "acceptance_accepted_issue_key"
    ON "acceptance" ("tenant_id", "issue_id") WHERE "outcome" = 'accepted';
-- Declines are now many per issue and every state read filters by issue.
CREATE INDEX "acceptance_issue_idx" ON "acceptance" ("tenant_id", "issue_id");

-- ---------------------------------------------------------------------------
-- 2. No decline after an acceptance, serialised per issue.
-- ---------------------------------------------------------------------------
CREATE FUNCTION acceptance_response_rules() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_hash TEXT;
BEGIN
  -- An issue the caller cannot see takes no lock; the composite key then refuses the row.
  IF NOT EXISTS (SELECT 1 FROM "quote_issue" i WHERE i."id" = NEW."issue_id") THEN
    RETURN NEW;
  END IF;

  v_hash := md5('acceptance-response:' || NEW."issue_id"::text);
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(v_hash, 1, 8))::bit(32)::integer,
    ('x' || substr(v_hash, 9, 8))::bit(32)::integer
  );

  -- A new statement after the wait, so under READ COMMITTED it sees a response that committed while
  -- this one waited (the per-quote lock already refuses any other isolation level).
  IF NEW."outcome" = 'declined' AND EXISTS (
       SELECT 1 FROM "acceptance" a
        WHERE a."issue_id" = NEW."issue_id" AND a."outcome" = 'accepted'
     ) THEN
    RAISE EXCEPTION 'issue % has been accepted; a decline cannot follow an acceptance. Retracting an '
                    'acceptance is the business''s withdrawal, not a client response', NEW."issue_id"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER acceptance_response_rules
  BEFORE INSERT ON "acceptance"
  FOR EACH ROW EXECUTE FUNCTION acceptance_response_rules();

-- ---------------------------------------------------------------------------
-- 3. Only an accepted row can be withdrawn. Otherwise unchanged from
--    `20260927110000_one_lock_per_quote`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION acceptance_withdrawal_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_issue_id UUID;
  v_outcome  TEXT;
  v_billed   BIGINT;
BEGIN
  SELECT a."issue_id", a."outcome" INTO v_issue_id, v_outcome
    FROM "acceptance" a WHERE a."id" = NEW."acceptance_id";

  IF v_outcome IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'only an acceptance can be withdrawn; response % is a %', NEW."acceptance_id",
      coalesce(v_outcome, 'response this session cannot see')
      USING ERRCODE = 'check_violation';
  END IF;

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

-- ---------------------------------------------------------------------------
-- 4. The state, with "withdrawn", and an acceptance outranking an earlier decline.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION quote_issue_state(p_issue_id UUID) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT CASE
    -- Superseded first: a later revision exists, whatever else is true.
    WHEN EXISTS (
      SELECT 1 FROM "quote_issue" later
        JOIN "quote_issue" self ON self."id" = p_issue_id
       WHERE later."quote_id" = self."quote_id" AND later."revision" > self."revision"
    ) THEN 'superseded'
    WHEN NOT EXISTS (SELECT 1 FROM "issue_number" n WHERE n."issue_id" = p_issue_id)
      THEN 'sealed_awaiting_number'
    -- The one accepted row, withdrawn: final for this issue; the remedy is the next revision.
    WHEN EXISTS (
      SELECT 1 FROM "acceptance" a
        JOIN "acceptance_withdrawal" w ON w."acceptance_id" = a."id"
       WHERE a."issue_id" = p_issue_id AND a."outcome" = 'accepted'
    ) THEN 'withdrawn'
    WHEN EXISTS (
      SELECT 1 FROM "acceptance" a WHERE a."issue_id" = p_issue_id AND a."outcome" = 'accepted'
    ) THEN 'accepted'
    WHEN EXISTS (
      SELECT 1 FROM "acceptance" a WHERE a."issue_id" = p_issue_id AND a."outcome" = 'declined'
    ) THEN 'declined'
    ELSE 'issued'
  END;
$$;
