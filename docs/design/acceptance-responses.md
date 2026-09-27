# Design: what may follow a client's first answer on an issue

**Status: APPROVED by the owner 2026-09-27 · independent review OUTSTANDING (Rule 1.10, Rule 24.6).**

| Gate | Question | State |
|---|---|---|
| **Owner approval** | Is this what you want built? | ✅ **2026-09-27** — option **C plus A** of the four put to the owner |
| **Independent review** | Will this do what it says? | **Outstanding** — J13 is not closed until someone who did not write this checks it |

Date: 2026-09-27 · Answers finding **J13** (`PRD-REVIEW-4.md`) · Delegation (Rule 16.5): **Opus** — it changes
the rule the ceiling, the per-quote lock and the evidence ladder all key on.

---

## 1. The problem

`acceptance` allows one row per issue, ever (`acceptance_issue_key`, tenant-scoped since J3). Two
consequences the product cannot live with, and one it now must state honestly:

- **A decline is permanent.** A client who taps Decline by mistake, or declines and then agrees after
  negotiating, can never accept that issue. The contractor must seal and send an identical revision.
- **A withdrawn acceptance cannot be re-accepted**, while `quote_issue_state()` reports the issue as
  `issued` — a state that promises a transition the schema refuses.

Since K4 and L1, withdrawal is the **wrong-document remedy**: credit or void, withdraw, issue the next
revision. That separates the two halves: a decline is a client's everyday response; a withdrawal is the
contractor's deliberate "this document was wrong".

## 2. What this must achieve

1. A client can **accept after declining** the same issue — a mis-tap, or a negotiation — with no new
   revision and no re-send, and every decline stays on record.
2. **At most one accepted row per issue, ever**, so the ceiling, the balance row, the per-quote lock and
   the evidence ladder (J6) keep keying on a single acceptance.
3. A **decline after acceptance is refused**: retracting an acceptance is the tenant's withdrawal, not a
   client response.
4. After a withdrawal the issue reads **`withdrawn`**, and can never be accepted again; the remedy is the
   next revision, as K4 and L1 built it.
5. Every rule is held by the database — an index, a trigger — and has a test that goes red without it.

## 3. The shape

- **Uniqueness:** replace the tenant-scoped unique index on `(tenant_id, issue_id)` with a **partial**
  unique index `WHERE outcome = 'accepted'`. Declines are unlimited; accepted rows are one per issue.
- **Decline after acceptance:** a `BEFORE INSERT` trigger on `acceptance` refuses a `declined` row when an
  `accepted` row exists for the issue (withdrawn or not — a withdrawn issue takes no new response at all).
- **Acceptance after withdrawal:** refused by the same partial index, because the withdrawn acceptance
  still occupies the one accepted slot. That is the intended behaviour, now stated rather than accidental.
- **State:** `quote_issue_state()` gains `withdrawn`, returned when the issue's accepted row has a
  withdrawal; `accepted` wins over any earlier decline; `declined` is returned only when there is a decline
  and no accepted row. Superseded and awaiting-number keep their precedence.
- **Nothing else changes meaning.** `issue_ceiling_minor()`, the balance functions and the quote lock
  already key on "an accepted, un-withdrawn acceptance", which stays unique.

## 4. Rejected

- **Re-acceptance after withdrawal (option B):** re-accepting the document that was withdrawn *because it
  was wrong* contradicts what withdrawal now means, and multiplies acceptance and evidence rows per issue.
- **A full response-event log (option D):** flexible, but it rewrites the acceptance table, evidence
  grading, the ceiling and the state function for sequences no requirement asks for.
- **Decline stays terminal (A alone):** makes the commonest client error cost a new revision and a re-send.

## 5. How it will be proved

A new migration (Rule 6), tests in `new-app/db/test/documents-core.test.ts` for: accept after decline;
several declines then accept; a second accept refused; decline after accept refused; accept after
withdrawal refused; the state after each, including `withdrawn`. The test that asserts "issued again once
the acceptance is withdrawn" is changed explicitly, because this decision reverses it. Decline, and
accept-after-decline, join the random walk in `no-stuck-state.test.ts`, whose oracle learns the new state
rule; a race in `concurrency.pg.test.ts` for a decline and an accept arriving together. Each guard planted
against before it is reported (Rule 1.5, Rule 21.2), and every brief's expectations run last, on the exact
HEAD it names (M37).

## 6. What this does not prove (Rule 21.4)

- **What the client sees.** Whether the share page offers "change my answer" after a decline is the
  application's, not built.
- **Expiry.** A decline no longer closes a quote, so "declined" is not final until the quote expires or is
  superseded; quote expiry is not yet built.
- **Grade derivation per acceptance (J6)**, which stays open.
