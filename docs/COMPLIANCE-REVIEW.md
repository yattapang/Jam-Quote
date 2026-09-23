# Compliance review of the work to date

**Authorised by the owner on 2026-09-24**: "if we need to go back and review all the work done thus
far for compliance then we go ahead."

Scope: every rule in `RULES.md` against everything built since the rules were approved
(`76c8309` → `2a20f7b`), plus the brief's own requirements. `original-app/` is frozen and reviewed
only for whether we have respected that.

**Method.** Rule by rule: what the rule requires, what evidence exists, and the verdict. A verdict
of **BREACH** means the rule was not followed. **GAP** means the rule is not yet satisfiable because
the thing it governs does not exist. **MET** means there is evidence, not an intention.

Verdicts: **6 breaches, 11 gaps, 8 met.** The breaches are listed first because they are the point
of the exercise.

---

## Breaches — rules not followed

### B1. Rule 19 / brief §5 — the brief-revision step was skipped (**fixed today**)

The brief requires proposed edits to itself once the audit and scope decision are done. It did not
happen for a month of work, and I did not raise it; the owner did. Fixed by
`BRIEF-EDITS-PROPOSED.md` and by Rule 19 existing at all. **The rule was written because of this
breach, so it cannot be counted as compliance — only as a repair.**

### B2. Rule 1.1 and brief §6 — design before code, partially not followed

ADRs were written for every decision, but the **PRD, domain model and threat model** were not
written before Foundations was built. The threat model (written today) endorsed the authentication
design, which is luck as much as judgement. An ADR justifies one decision; a threat model shows the
decisions add up. Partially repaired: the threat model exists, the PRD and domain model do not.

### B3. Rule 9 — no independent review of any `new-app` work

Rule 9 requires that a module be attacked by someone who did not build it. **Every line of
`new-app` was written and reviewed by me**, which is exactly the arrangement the rule forbids, and
it is the largest process breach here. An independent adversarial review was commissioned today;
its findings will be recorded in `REVIEW-FINDINGS.md`. Until then, **no `new-app` module can be
called complete** by the rule's own definition.

### B4. Rule 18 — the service register was late

Required from the moment we depended on a service; written on 2026-09-23 only when the owner asked
for it. The rule now exists, which is again a repair rather than compliance.

### B5. Rule 8 — a guard shipped that proved less than it claimed

`policy-parity.test.ts` asserted every tenant-owned table had a policy, while only examining tables
that *had* a `tenant_id` — so a table without one was invisible. Three commits shipped with that
gap. Found when the MFA tables made it concrete; the guard now checks every table. The rule was met
in form (a guard existed, proved by planting) and failed in substance (the plant I chose could not
have exposed the hole).

### B6. Rule 8 — I nearly accepted a green summary over a broken file

A `grep` for the `Tests` line reported "10 passed" while one test file failed to compile and never
ran. Caught by luck, in the same session. The gate command now includes `Test Files`. No bad code
shipped, but the near-miss belongs here: **the verification was wrong, and being lucky is not a
control.**

---

## Gaps — rules not yet satisfiable

| # | Rule | What is missing | Blocks |
|---|---|---|---|
| G1 | 2 | `new-app` has no runbooks; `CLAUDE.md` exists | Operations, not code |
| G2 | 3 | No i18n layer; day boundaries not per jurisdiction; money ceiling decided (ADR 0011) but unbuilt | Second country |
| G3 | 4 | Exports, PDFs, cache keys, search and logs not yet tenant-scoped — none exist | Every feature that adds one |
| G4 | 5 | No dependency scan, no secret scan, no log redaction, no tested restore, no incident plan | Launch |
| G5 | 5.1 | **Staff MFA, named-capability enforcement, impersonation controls, audit trail** — schema only, service paused | **Launch blocker** |
| G6 | 6 | Immutable issued documents, atomic per-tenant numbering, audit log, soft deletes | The vertical slice |
| G7 | 7 | `packages/core` not yet ported, so "one rule, one place" has nothing to govern | The vertical slice |
| G8 | 10 | The free-tier-to-paid ADR the rule explicitly requires | Nothing yet; owed |
| G9 | 11–13 | Messaging, offline, payment controls — none built | Later phases |
| G10 | 14 | Entitlement resolver — the reason tiers are feature 1 | Every paid feature |
| G11 | 18 | No SBOM | Vulnerability response |

---

## Met — with evidence

| Rule | Evidence |
|---|---|
| **0** | Every commit message and ADR names the rules it acted under; this review exists |
| **1.2** | `original-app/` untouched since the audit began. Verified: `git log --oneline original-app/` shows only the rename commit |
| **1.3** | Every change is one scope, separately committed, each with the gate green |
| **1.5** | 17 ADRs, each with alternatives and consequences. Rejections are argued, not asserted |
| **2** | Module headers state what each owns, trusts and must never do; comments explain why; no `utils.ts`; enforced by the import-boundary guard |
| **4** | `tenant_id` + forced RLS + `withTenant`, proved against real Postgres, including a query with no `WHERE` returning nothing outside a tenant |
| **8** | Three layers present. **Every** behaviour claimed was proved by planting a defect: 3 boundary, 3 contract, 2 tenancy, 5 auth, 4 sign-in, 4 limiter |
| **17** | Weaknesses stated in the ADRs, the register, the threat model and this file — including two bugs found in my own code and one claim of mine a test disproved |

## Two things worth noting in our favour, since honesty runs both ways

**Tests caught defects that review did not.** Three real ones: an authentication bypass where a
zero-length salt and hash made every password verify; a policy that raised a database error instead
of denying when `app.tenant_id` was empty; and a claim in a comment about rate-limit ordering that a
test disproved. All three were mine, all three were caught before commit, and none would have been
found by reading.

**The costly lesson from the previous application held.** Nothing was called done because it looked
right. That discipline is why the breaches above are process breaches — order, review, and guard
scope — rather than defects in shipped behaviour.

## What this review changes

1. **`new-app` modules are not "complete"** until the independent review lands (B3). The module
   register must show that, not a tick.
2. **The PRD and domain model come before the vertical slice** (B2), not alongside it.
3. **Staff MFA, the audit log, and dependency plus secret scanning** are the three launch blockers
   (G4, G5, G6).
4. **Every guard gets a second, harder plant** — one designed to exploit the guard's *scope* rather
   than its subject, which is what B5 taught. Nothing exposes a guard that examines the wrong set
   except trying to slip past its edges.
5. **The gate command is `Test Files` plus `Tests`** (B6). A summary line is not a result.
