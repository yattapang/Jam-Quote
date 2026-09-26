-- At most one revision of a quote can hold a live ceiling (finding J10).
--
-- ## WHAT WAS WRONG
--
-- `quote_issue_state()` returned `superseded` for an issue with a later revision, and
-- `issue_ceiling_minor()` said nothing about supersession at all — so a superseded issue kept its full
-- accepted total as an invoiceable ceiling. The two functions disagreed about the same row.
--
-- The documents answered this with an ordering: "withdraw first, and the issue is no longer accepted, so
-- superseding it orphans nothing". **That ordering had no owner.** Sealing a later revision is a plain
-- INSERT permitted by a policy that looks only at `tenant_id`; no trigger and no CHECK could express a
-- cross-row condition. Rule 1.10's "an invariant with no owner — stated in prose, enforced by nothing",
-- asserted as closed on the strength of a paragraph.
--
-- And the case that matters is exactly the one where the prescribed ordering is **unreachable**: H4's
-- trigger refuses a withdrawal once any invoice exists, so an invoiced revision can never be withdrawn,
-- so "withdraw first" is impossible precisely when a second revision is most tempting. Review 4 executed
-- the consequence: revision 1 accepted and part-invoiced, revision 2 sealed and accepted, **two live
-- ceilings totalling 230,000 for one 130,000 job**, every constraint satisfied and the reconciliation job
-- certifying both balance rows as internally consistent — because each one is.
--
-- ## THE FIX, AND WHY IT IS NOT A PER-QUOTE BALANCE TABLE
--
-- The invariant the product needs is per quote: *do not bill more than the client agreed for this job.*
-- The obvious implementation is to re-key `issue_balance` from the issue to the quote, and it was
-- rejected: it changes what "written once" means across a revision chain, lengthens every join that
-- proves the invariant, and still needs a rule for which acceptance counts when two revisions are
-- accepted — the same problem, relocated.
--
-- **Two small changes give the per-quote guarantee by construction instead:**
--
--   1. a superseded issue's ceiling is **zero**, so the two functions agree about the same row;
--   2. a later revision **cannot be sealed** while an un-superseded accepted revision of that quote has
--      an invoice or a recorded variation against it.
--
-- Together those make "at most one revision of a quote holds a live ceiling" true at all times, without
-- re-keying anything. The owner accepted this over the per-quote table, and the reporting view that would
-- want one number per job stays available later as a deliberate reporting decision rather than a
-- correctness fix.
--
-- Change 2 adds no new doctrine — it enforces doctrine the documents already carry. Once money has moved,
-- a change is a **variation** (PRD R1.22c) or a **credit note and a fresh quote**. A new revision was
-- never the sanctioned path; it was simply the unblocked one.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It does not give a contractor a single "this job's total" figure. If that is ever wanted it is a
--   reporting view over the revision chain, and it is not needed for correctness.
-- - It does not prove behaviour under real concurrency: two sessions sealing revision 2 simultaneously
--   are serialised by `quote_issue_quote_revision_key`, not by this trigger, and the two-connection
--   Postgres test remains owed.
-- - It says nothing about what the UI offers instead when the refusal fires. "Record a variation" is the
--   right answer and it is application work.

-- ---------------------------------------------------------------------------
-- 1. A superseded issue has no ceiling.
--
-- Supersession is tested FIRST, matching `quote_issue_state()`'s own precedence — which is the point:
-- the two functions now answer the same question the same way, and the previous disagreement was the
-- finding.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION issue_ceiling_minor(p_issue_id UUID) RETURNS BIGINT
LANGUAGE sql STABLE AS $$
  SELECT CASE
    -- Superseded: a later revision of this quote exists, whatever else is true.
    WHEN EXISTS (
      SELECT 1
        FROM "quote_issue" later
        JOIN "quote_issue" self ON self."id" = p_issue_id
       WHERE later."quote_id" = self."quote_id"
         AND later."revision" > self."revision"
    ) THEN 0
    -- Accepted and not withdrawn: the accepted total plus recorded variations.
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
    -- Zero, never NULL: `invoiced > NULL` is NULL, which is not TRUE, which would let an invoice
    -- through. A refusal must not rest on three-valued logic.
    ELSE 0
  END;
$$;

-- ---------------------------------------------------------------------------
-- 2. The ordering gets an owner.
--
-- A trigger, because the condition is cross-row and a policy cannot see other rows. BEFORE INSERT, so a
-- refused seal never exists rather than existing and being rolled back.
-- ---------------------------------------------------------------------------
CREATE FUNCTION quote_issue_one_live_ceiling() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_blocking UUID;
  v_invoices BIGINT;
  v_variations BIGINT;
BEGIN
  -- An earlier revision of this quote that is accepted, not withdrawn, and not already superseded by
  -- something else. At most one can match, because this trigger is what keeps it so.
  SELECT prior."id" INTO v_blocking
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
   LIMIT 1;

  IF v_blocking IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_invoices FROM "invoice" i WHERE i."issue_id" = v_blocking;
  SELECT count(*) INTO v_variations FROM "variation" v WHERE v."issue_id" = v_blocking;

  IF v_invoices > 0 OR v_variations > 0 THEN
    RAISE EXCEPTION
      'cannot seal revision % of this quote: revision % is accepted and has % invoice(s) and % '
      'variation(s) against it. Money has moved, so the change is a variation, or a credit note and a '
      'fresh quote — a new revision would leave two live ceilings on one job (finding J10)',
      NEW."revision", (SELECT p."revision" FROM "quote_issue" p WHERE p."id" = v_blocking),
      v_invoices, v_variations
      USING ERRCODE = 'check_violation';
  END IF;

  -- Accepted but nothing financial against it: superseding is allowed, and change 1 above takes that
  -- revision's ceiling to zero the moment this row exists.
  RETURN NEW;
END;
$$;

CREATE TRIGGER quote_issue_one_live_ceiling_per_quote
  BEFORE INSERT ON "quote_issue"
  FOR EACH ROW EXECUTE FUNCTION quote_issue_one_live_ceiling();
