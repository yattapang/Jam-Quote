# Where we are against the development brief

**Why this file exists.** The owner asked on 2026-09-24 whether we were drifting — following the
brief and updating it — and the honest answer was partly yes. Nothing tracked our position
against the brief's own phases, so drift was possible without anyone noticing. This is that
tracker, and Rule 19 requires it to be read at the start of a task and updated at the end.

**Legend:** ✅ done · 🟡 partly done · ❌ not started · ⏭️ deliberately later

## Next three, in the owner's order (queued 2026-09-24, paused on a usage reset)

Written down because a context reset loses what was in flight, and the last time that happened
the work was picked up on an already-finished feature.

1. ~~**The keep-warm anomaly.**~~ ✅ **done 2026-09-24, and it was worse than the symptom.** `keep-api-warm.yml` is `active` but its last run was **11 September**
   — thirteen days before this was written — though it is scheduled every ten minutes. Not the
   60-day inactivity disable the service register describes, because the workflow is not disabled;
   something else. **My "last run was 11 September" was wrong** — a stale list entry reported
   without checking a second one. It runs; it simply never worked. GitHub fires the `*/10` schedule
   every three to five hours on a free runner, against a 15-minute spin-down, and **every run paid a
   full cold start** (42-72s) — the proof the instance was asleep each time. `|| true` kept it green
   throughout, including a 90-second timeout recording `HTTP 000`. Now an honest liveness check that
   fails loudly, with two planted failures proving it fires and the real endpoint as the control.
   The API sleeping is now recorded as an open decision in `SERVICE-REGISTER.md` §4a, with the two
   real fixes and their costs. *Delegation (Rule 16.5): in-session — a handful of read-only `gh`
   calls and one workflow file, below the threshold where briefing a cold agent pays.*
   *Coverage (Rule 21.3): `gitleaks` "430 commits scanned, no leaks"; liveness script
   "HTTP 200 / exit 0" on the control and "exit 1" on both plants.*
2. ~~**Next.js upgrade.**~~ ✅ **done 2026-09-24 — as a MAJOR, because my "patch" advice was wrong.**
   The advisory range is `0.9.9 - 16.3.0-preview.10` and the only fix is `next@16.3.6`, so every
   version of 14 *and* 15 was affected and a 14.2.x patch would have cleared nothing while looking
   like security work. Recorded as Rule 21.5. Now on [PR #2](https://github.com/yattapang/Jam-Quote/pull/2),
   CI green, awaiting the owner's merge. `next` is absent from `npm audit` afterwards, and `postcss`
   with it; new-app goes 19 advisories → 17, criticals 2 → 1.
   **Open decision for the owner:** Next 16 defaults to Turbopack, which cannot express the
   `.js` → `.ts` resolution this repo's import convention needs (measured: nine `Module not found`
   errors). `dev` and `build` now pass `--webpack`. The alternative is to drop `.js` specifiers in
   `@pryvis/web`, which needs no config but splits a recorded convention — so it was written up, not
   taken (Rule 1.2 cuts both ways).
   *Delegation (Rule 16.5): declared Sonnet, **was Opus, in breach** — three agent runs failed, the
   third capturing a baseline after changing the dependency. See Rule 16.6.*
   *Coverage (Rule 21.3): typecheck 5/5 packages; tests 20 files / 231 passed; build "Compiled
   successfully", 8 routes with all six authored pages present; `npm audit` no longer lists `next`;
   three plants — broken import → build exit 1, Google Fonts → the named guard failed, comment-only
   control → green.*
   **Deferred with reasons:** `vitest` → 5 (critical, but a dev dependency, so exposure is a
   malicious test file rather than a user); `@nestjs/*` → 12 for `multer`/`express`/`path-to-regexp`
   (wait for HTTP transport rather than landing a major on work in flight).

2a. ~~**Next.js patch upgrade, within 14.2.x.**~~ *(superseded by item 2 above — the premise was wrong.)* `next@14.2.18` carries the criticals found by the new
   audit, including unauthenticated RCE in the Image Optimization API and a middleware
   authorisation bypass. Patch, **not** 15.x: same security benefit without App Router changes to a
   site that works. `verify-new-app` already builds `@pryvis/web`, so the gate proves the site still
   compiles. *Delegation (Rule 16.5): Sonnet — a bounded upgrade against a gate.* Also still open:
   `multer@1.4.4-lts.1` (3 high, DoS) via `@nestjs/platform-express@10`, which needs Nest 11 and
   should wait for HTTP transport rather than land on work in flight.
3. ~~**The PRD.**~~ ✅ **written 2026-09-25 — [`PRD.md`](PRD.md), Proposed, awaiting approval.**
   Release 1 is *"price it and get paid"*: directory, recipes, pricing, issuing, share-and-accept,
   invoicing with deposit and progress claims, and self-service sign-up with manual-payment separation
   of duties. Free and Pro only; Business is R3.
   **The one hard call, made explicitly:** the site promises *"price the job while you are standing
   there"* and sells offline use on Pro, but a full sync engine is the old application's highest-risk
   component. Read precisely, the promise is a **number now**, not a PDF now — so R1 works offline for
   pricing and drafting, and requires connectivity to *issue*. Offline issuing with device number
   leases moves to R2. That keeps the claim honest and takes the riskiest component out of the critical
   path to revenue.
   Invoicing stays in R1 because it **is** the Pro line: a release with no invoicing has nothing
   anybody pays for. Variations move to R2 because they only bite after a job is won and changed.
   *Delegation (Rule 16.5): Opus — product decisions.*
   Previously unblocked 2026-09-25 — both questions answered (ADR 0022): one person may hold
   several businesses with a different email each, so global email uniqueness *enforces* that rule and
   the migration I proposed is withdrawn; and a tenant's clients have no login for now, so Documents
   keeps no outside reader and `share_link` carries the weight. Previously blocked on two questions, both from `docs/design/domain-model.md` §11,
   because either answer changes the document materially rather than cosmetically:
   - may one person hold **more than one business**? If so, `tenant`/`user` is the wrong shape and
     every policy sits on it;
   - do a tenant's **clients ever get a login**, or is a revocable share link enough? A portal makes
     Documents readable from outside.

   *Delegation (Rule 16.5): Opus — product decisions, 16.2's own category.*

**Governance, closed 2026-09-25.** Rules 21-24 are in force, each written from a specific failure
rather than from good intentions, and each with a mechanism behind it:

| Concern | Mechanism, not a reminder |
|---|---|
| A control that overstates its coverage | Rule 21 — scope quoted from the tool; a new control must be seen to fire |
| Scripted edits that land in the wrong place | Rule 22 — unique anchors, re-parse the result, prose through a file |
| Rule numbers drifting under the documents that cite them | Rule 23 + `tools/check_rules.py` + `docs/rules-manifest.json`, gated by the `docs` CI job: any change to a rule's number, title or text fails the build and prints every citation of it |
| Lessons lost between sessions | Rule 24 + [`MISTAKES.md`](MISTAKES.md) — 17 entries, each naming the rule that prevents recurrence or stating that none does |

The drift that prompted Rule 23 was real and is fixed: inserting Rule 1.2 had silently renumbered
Rule 1's list, leaving three ADRs and the Phase 0 audit citing rules that had moved. Those four are
corrected, and 307 citations across 40 rules now resolve.

**Repository visibility — deferred to commercial launch (owner, 2026-09-25).** It was switched to
private and switched back within the hour on the owner's instruction: *"Hold the private conversion
until we are ready to go commercial then."* The flip destroyed nothing (0 forks, 0 stars, 0 watchers
— going private deletes forks permanently, which is why that was checked before reverting).

What being public actually costs, so the deferral is a decision and not an oversight: `RULES.md` §17
publishes our unmitigated weaknesses and `MISTAKES.md` publishes seventeen defects with their
reasoning. Both are good practice and neither will be trimmed to look better — the answer is to make
the repository private, not to make the documents dishonest. **Trigger: before the first paying
tenant.** Actions minutes are free while public and metered when private, which is the other half of
the reason to wait.

**The first Rule 1.10 review is done and its findings are dispositioned** (`PRD-REVIEW.md`): 19 findings,
6 blockers. Five blockers closed by amending **both** documents in one change — because leaving them
disagreeing is what caused F1 in the first place. One blocker is half-closed and waits on the owner
(public copy), and four questions wait on the owner. **Two scope changes the owner should notice:** a
minimal priced variation moves **into R1** (F3 — without it, the commonest event in construction was
unrepresentable), and `price_observation` is confirmed as R1 capture-only because its consent cannot be
retro-fitted (F13). A **re-review of the amended pair** is the next step, since a fix I wrote is not
reviewed by me having written it.

**R1 launch blockers that are not engineering** (PRD §9): `info@pryvis.com` receiving mail · tier
prices set and the price guard updated · legal wording approved so the draft banners come off · the
**aggregate-data consent clause** in the terms, which blocks registration rather than the website ·
and a **second staff account** before the first is relied on, since there is deliberately no
self-service way to remove a second factor and separation of duties needs two people.

**Also open, owner-side:** It is public today, which
is why gitleaks and GitHub secret scanning are free here — but `THREAT-MODEL.md`, `RULES.md` §17 and
`REVIEW-FINDINGS.md` are publicly readable, and §17 is a deliberately honest list of *unmitigated*
weaknesses. The answer is to make the repository private or to unpublish that list, never to make
the list dishonest. Recommendation: private, since nothing about this project benefits from being
public yet.

Last reviewed: **2026-09-24**. Staff MFA is **built** (ADR 0021): TOTP proved against RFC 6238's
published vectors, secrets sealed with a rotatable key, enrolment that grants nothing until a code
is produced, replay refused, a lock that follows the person rather than the session, recovery codes,
a two-step sign-in, and enforcement in the resolver so a capability-holder without a confirmed
factor is refused on every request. Fourteen planted defects, two controls. Next: the domain model,
then the PRD — designed from what the product needs, not from the infrastructure tables (Rule 1.2). The marketing site is **built and
landed** against its approved design (`docs/design/marketing-site.md`), with nine guards proved by
planting. The independent review (Rule 9) ran, reported 15 findings, and **all 15 are now closed** —
each with the defect planted and the fix proved (`REVIEW-FINDINGS.md`).

---

## Review 4 remediation — J4, 2026-09-26

**J4 built, not closed.** Agreed scope can now be reduced after it has been invoiced: credit notes count
against the invoiced figure, so the remedy is one transaction — credit the excess, record the negative
variation — with over-crediting and crediting a voided invoice refused. Design
[`scope-reduction.md`](design/scope-reduction.md), approved by the owner 2026-09-26 (option 1 of three,
and the default that a voided invoice's credits drop out with it). Migration
`20260926200000_scope_reduction`; PRD R1.15b, R1.22a, R1.24, R1.25 and domain model §6.2a amended in
the same change. Re-running the review's scenario first showed J2 had already changed J4's shape — the
row is refused, not stranded — and two migrations still said otherwise (MISTAKES M27).
*Delegation (Rule 16.5): Opus, in-session, no agent — money arithmetic, one of the three named
exceptions.*
*Coverage (Rule 21.3): typecheck "5 successful, 5 total"; `npm test` api 183 / db 113 / contract 2 /
core 9 / web 11, all passed; five plants on the migration (netting, over-credit, voided credit, double
subtraction, shortfall message) each turned its named J4/J12 test red and each was restored
byte-identical; `check_schema_citations.py` "0 citations skipped" and fired on a planted phantom column
in the new migration; `check_dispositions.py` "40 dispositions … across 3 review files" — review 4 is
not yet in its set.*
**Owed before J4 is Closed (Rule 24.6):** an independent re-review of this commit; the two-connection
Postgres test (the credit checks' lock serialisation is read, not raced); J4's disposition row.

**Re-review of `06e9b73`, 2026-09-26.** *Delegation (Rule 16.5): `commit-reviewer` agent, Opus —
adversarial review of money arithmetic; one agent live, no build work alongside it (Rule 16.2).* Six
findings, K1-K6, appended to `PRD-REVIEW-4.md` (its findings file was in the scratchpad): the fix held for J4's own case, and "no stuck state can
be entered" was false (K6). K4 put a product question to the owner, answered 2026-09-27: a wrong-document
acceptance may be withdrawn once every invoice is voided or fully credited and no variation exists (this
also answers J15). **J10 is reopened by K6.**

**K6 fixed, 2026-09-27** — migration `20260926210000_live_ceiling_every_revision`: a new revision is
checked against every live earlier revision, and a variation on a superseded or withdrawn issue is
refused (K6's twin, found while preparing the fix). `no-stuck-state.test.ts` commits the random walk
that found K6 (MISTAKES M28). *Delegation (Rule 16.5): Opus, in-session — money arithmetic.*
*Coverage (Rule 21.3): two plants on the migration each turned their named J10 test red; the walk went
red on its `stuck` assertion with K6 reverted (7 and 8 stuck issues) and did NOT fire on the twin, which
its header states; restored byte-identical each time.*

**K4 with J15, K1, K2, K3, K5 fixed, 2026-09-27** — migration `20260926220000_withdrawal_after_full_credit`:
withdrawal allowed once every invoice is voided or fully credited and no variation exists, under the
balance lock; the over-credit check scoped to the invoice being credited, with an invoice never counting
below zero; the voided-credit refusal's reason corrected. A cross-issue test for K3. Six stale sentences
fixed and the arithmetic's restatements replaced with pointers to `issue_balance_apply()` (MISTAKES M29).
Design §3a records the owner's K4 decision. *Delegation (Rule 16.5): Opus, in-session — money
arithmetic and withdrawal preconditions.* *Coverage (Rule 21.3): seven plants on the migration —
withdrawal counting every invoice, ignoring credits, ignoring variations; netting without the zero floor;
no over-credit check; tenant-wide netting (the re-review's K3 plant); the original issue-wide over-credit
scan (K1's defect) — each turned its named test red, each restored byte-identical. The withdrawal
guard's lock is NOT proved: one PGlite connection cannot race it.* **Next:** a second independent
re-review of `c35952d` and this commit before J4, J10 or J15 is marked Closed.

**Second re-review of `c35952d` and `8e8236a`, launched 2026-09-27 on the owner's instruction.**
*Delegation (Rule 16.5), declared before launch: `commit-reviewer` agent, Opus — adversarial review of
money arithmetic, ceiling state and withdrawal preconditions, where a defect leaves the suite green;
one agent live, no build work, commits or full-gate runs alongside it (Rule 16.2). Findings are
written to a file as found and brought into `PRD-REVIEW-4.md` afterwards.* It reported L1-L6 and
advised that none of J4, J10, J15 be closed; brought into `PRD-REVIEW-4.md` as `7fd27cb`.

**L1-L6 fixed, 2026-09-27** — migration `20260927100000_withdrawal_with_variations`: withdrawal allowed
once nothing is still billed, variations or not (the owner's L1 decision, design §3b); the J10 guard
judges only the latest revision, under its balance lock (L2, L6). The walk now has an independent oracle
in TypeScript, asserts its reach, and checks J10 on the database's ceilings (L3). Tests for L1, L2 and
both L4 gaps; documents corrected (L5), with ADR 0025 amended by a dated note. MISTAKES M30, M31.
*Delegation (Rule 16.5): Opus, in-session — withdrawal preconditions, the ceiling guard, and a money
oracle.* *Coverage (Rule 21.3): eight plants, each restored byte-identical — on the walk: K6 back (15 and
9 stuck), credits subtracted twice (10 disagreements per seed), supersession removed from the ceiling
(88-89 disagreements, 43 quotes with two live ceilings), withdrawal ignoring billed invoices (20 and 15
stuck); on the unit tests: variations blocking withdrawal again, the guard judging an old revision, the
withdrawn half of the variation check removed, and the old K2 message restored. The walk's J10 check was
first vacuous (counted from the oracle) and was fixed after its plant printed 0. The L6 lock is NOT
proved.* **Next:** a third independent re-review before J4, J10 or J15 is marked Closed.

**Third re-review of `23ca3a5`, launched 2026-09-27 on the owner's instruction.** *Delegation (Rule
16.5), declared before launch: `commit-reviewer` agent, Opus — adversarial review of withdrawal
preconditions, the ceiling guard and a money oracle, where a defect leaves the suite green; one agent
live, no build work, commits or full-gate runs alongside it (Rule 16.2). Findings written to a file as
found and brought into `PRD-REVIEW-4.md` afterwards.* It reported N1-N10, raced real PostgreSQL for the
first time on this line, and advised J15 closable, J4 and J10 not; brought in as `682fdab`.

**N1-N10 answered, 2026-09-27** — the owner approved a per-quote lock and PostgreSQL in CI. Migration
`20260927110000_one_lock_per_quote`: a transaction-scoped advisory lock per quote, exclusive for a seal,
shared for every financial write, taken before any state is read (N4); the seal's balance-lock call
removed (N2). `db/test/concurrency.pg.test.ts` races six cases on real PostgreSQL; CI's `verify-new-app`
gains a `postgres:16` service; `turbo.json` passes the two variables through. The walk seals half its
issues with tax (N6), runs the wrong-document remedy end to end with its own floors (N7), and says where
each oracle rule comes from (N8). R1.15b rewritten whole and R1.22c corrected (N1, N9). MISTAKES M32.
N3 stays with J13; N5 is stated in the migration and design. *Delegation (Rule 16.5): Opus, in-session —
lock design over the money invariant, and a CI change.* *Coverage (Rule 21.3): on real PostgreSQL 16,
all six races pass and four plants each fail their own race — no shared lock (N4a and both L6 races,
"never waited on a lock"), seal locking after choosing (N4b), lock a no-op (four races), balance row lock
removed (the two-invoice race); on PGlite, N2 and N6 unit tests each red under their plant; the walk red
under the tax dropped (41 and 24 disagreements), K4 reverted and L1 reverted (reach floors) — the three
the reviewer showed the old walk missed. Through Turbo: `PRYVIS_REQUIRE_PG` without a URL FAILS; with a
URL the six races RUN. Each plant restored byte-identical.* **Next:** a fourth independent re-review
before J4 or J10 is marked Closed; J15 goes Closed in the disposition rows.

CI run 183 on `cfeac92`: all four jobs green; the `verify-new-app` log shows `concurrency.pg.test.ts
(6 tests)` run against the `postgres:16` service, not skipped, and db `134 passed` — the first raced
concurrency evidence in CI.

**Fourth re-review of `cfeac92`, launched 2026-09-27 on the owner's instruction.** *Delegation (Rule
16.5), declared before launch: `commit-reviewer` agent, Opus — adversarial review of lock design over
the money invariant and of the CI wiring that proves it; one agent live, no build work, commits or
full-gate runs alongside it (Rule 16.2). Findings written to a file as found and brought into
`PRD-REVIEW-4.md` afterwards.* It reported P1-P7 (150 unscheduled races, 0 violations under READ
COMMITTED) and advised J15 closable once a checkable disposition exists, J4 and J10 not; brought in as
`68c07b8`.

**P1-P6 answered, 2026-09-27** — the owner approved refusing financial writes outside READ COMMITTED.
Migration `20260927120000_lock_isolation_and_tenancy`: the quote lock enforces READ COMMITTED (P1), locks
only a quote visible under row security with a 64-bit hashed key (P2), and `issue_balance_apply()` takes it
first (P3). The race suite names the lock kind each race must observe (P5) and gains six races: isolation
refused, an invoice on an accepted revision against a seal with its reason asserted (P4), withdrawal
against a seal, two shared holders not blocking, cross-tenant lock attempts, and the P3 deadlock sequence.
Stale sentences fixed (P6); READ COMMITTED stated in `new-app/CLAUDE.md`. MISTAKES M33. P7 (disposition
rows) is the next commit. *Delegation (Rule 16.5): Opus, in-session — lock and isolation design over the
money invariant, and tenant isolation.* *Coverage (Rule 21.3): 12 races pass on PostgreSQL 16.13; five
plants each failed their named race — isolation check removed (P1), visibility check removed (P2),
recompute without the quote lock (P3), shared lock made exclusive (P5 plus both balance-row races, now
seeing the wrong lock kind), supersession removed from the ceiling (N4 c, which the old suite missed).
Each restored byte-identical.*

**P7 and item 2 of the owner's list, 2026-09-27** — `PRD-REVIEW-4.md` has its disposition table: J15
**Closed** (independently checked by the N and P re-reviews); J1, J2, J3, J5, J9, J12, J16 **Fixed,
re-review owed** (no independent check recorded, so Rule 24.6 does not let them read Closed); J4, J10
open pending a fifth re-review; J6, J7, J8, J11, J13, J14 open. `tools/check_dispositions.py` now reads
review 4 with path-level scope; widening it exposed ten legacy Closed rows in reviews 2-3 that never
cited a path their `Where:` line names, now printed on every run as owed an audit (MISTAKES M34).
*Delegation (Rule 16.5): Opus, in-session — the rows decide what counts as closed.* *Coverage (Rule
21.3): check_dispositions "41 dispositions claiming Closed, checked across 4 review files (path-level
scope enforced on 1 of them)", 10 legacy gaps listed; planted — J15's row without its migration fails,
naming it; restored byte-identical.*

**Fifth re-review of `2bf1816` and `e0b80a3`, launched 2026-09-27.** *Delegation (Rule 16.5), declared
before launch: `commit-reviewer` agent, Opus — adversarial review of the isolation guard, lock tenancy and
lock order over the money invariant, and of the disposition checker that gates Rule 24.6; one agent live,
no build work, commits or full-gate runs alongside it (Rule 16.2). Findings to a file as found, brought
into `PRD-REVIEW-4.md` afterwards.* It reported Q1-Q7 and judged J10 closable — **J10 Closed** in
`5920a37` — and J4 not yet, on Q3 plant C and the false sentences in Q2 and Q5.

**Q1-Q7 answered, 2026-09-27.** The owner accepted Q1 as LOW (tenants hold no SQL session; the fix is
named in `THREAT-MODEL.md` §4d) and approved Sonnet for J4's closing check. Migration
`20260927130000_balance_open_takes_lock`: `issue_balance_open()` takes the lock and the isolation check
(Q5), and its header corrects the committed P migration's false sentences (Q1, Q2, Q5; Rule 6). Three
races, one per property the P fixes claimed (Q3). `check_dispositions.py`: whole-token citation, a
finding that does not parse fails, a row with an unknown status fails (Q6). ADR 0025 decision 2 amended to
the real mechanism, so J2's row is true (Q7); Q4 recorded against J3. Design, CLAUDE.md and the race
suite's header corrected (Q2, Q5). MISTAKES M35. *Delegation (Rule 16.5): Opus, in-session — lock order
and isolation over the money invariant.* *Coverage (Rule 21.3): 15 races pass on PostgreSQL 16.13; the
reviewer's plants A (one key for all quotes), B (visibility on the exclusive path only), C (row lock before
quote lock) and a Q5 plant (open without the lock) each failed exactly their named race; the five checker
escapes Q6 listed each now fail; every plant restored byte-identical.*

**J4 closing check, launched 2026-09-27 on the owner's instruction.** *Delegation (Rule 16.5), declared
before launch: `commit-reviewer` agent run on **Sonnet** — a deviation from its Opus default, approved by
the owner, because this is mechanical verification against a written list: every plant, command and
expected output is named in the brief, so the cheapest reliable tier is the one that can follow it
exactly. If the brief proves incomplete, the escalation is recorded here with its cause (brief incomplete
vs genuinely hard). One agent live, no build work alongside it (Rule 16.2).*

**Closing check result, 2026-09-27: NOT PASSED on steps 5a-5c; plants and gate all passed.** 5a was real —
a third committed copy of "no single-quote cycle exists", in `20260927110000_one_lock_per_quote` — and is
answered by migration `20260927140000_quote_lock_contract`, which corrects it and puts the lock's contract
on the function as `COMMENT ON FUNCTION`. 5b and 5c were **defects in my brief**: single-line greps for a
wrapped sentence and a reworded one (MISTAKES M36). *Tier log: not an escalation — the tier was right; cause
recorded as BRIEF INCOMPLETE.* Report appended to `PRD-REVIEW-4.md`.

**J4 closing re-check, launched 2026-09-27.** *Delegation (Rule 16.5), declared before launch: the same
`commit-reviewer` on **Sonnet**, re-run with a corrected brief whose every expected output was first
executed against the current tree (M36's lesson applied before the handover). Scope: the three failed
steps, the new migration, and the gate.*

**Re-check result, 2026-09-27: every check passed except one list item** — check A found the phrase in
this file too, in the entry above, which I wrote after testing the brief (MISTAKES M37, a repeat of M36).
The checker read it and identified it as a register. **The owner accepted closing J4 on this evidence.**
*Tier log: Sonnet was right for both checks; both non-passes were brief errors, recorded as BRIEF
INCOMPLETE.*

**The J4 line is finished: J4, J10 and J15 Closed.** Review 4 now stands at: J4, J10, J15 Closed; J1, J2,
J3, J5, J9, J12, J16 Fixed, re-review owed; J6, J7, J8, J11, J13, J14 open. Also owed from this line: the
ten legacy disposition gaps in reviews 2-3; J3's re-review with Q4 (ON UPDATE CASCADE rewrites a sealed
issue's quote id); the "write flag in exactly one place" test narrower than its title; Q1's deferred
SQL-level fix; and the governance proposals awaiting the owner.

**Re-review of the seven "Fixed, re-review owed" findings (J1, J2, J3, J5, J9, J12, J16, with Q4 inside
J3), launched 2026-09-27 on the owner's instruction to continue in the recommended order.** *Delegation
(Rule 16.5), declared before launch: `commit-reviewer` agent, Opus — adversarial review of tenant-isolation
keys (J3), the ceiling trigger (J2) and the guards (J1, J9), where a defect leaves the suite green; one
agent live, no build work alongside it (Rule 16.2). Findings to a file as found, brought into
`PRD-REVIEW-4.md` afterwards.* It reported R1-R18 (probed on real PostgreSQL). **Closed:** J2, J16, and J5
after its stale "six grades" was corrected in four documents (R14). **Re-opened with named blockers:**
J1 (R11, R3), J3 (Q4 confirmed as R1, and R2 — a cross-tenant audit rewrite through ON UPDATE CASCADE),
J9 (R9, a blocker, reproduced by the author: an acceptance can bind another issue's render, or none), J12
(R13). Also found: R4, a tenant deleting its own audit trail by deleting its tenant row. Text claims R5,
R7 and R8 corrected in the ADR, the test header and the J16 row.

**Batched re-review of J1, J3, J9, J12 and J13, launched 2026-10-01 on the owner's instruction
("option 1").** *Delegation (Rule 16.5), declared before launch: `commit-reviewer` agent, **Opus** — J1 is
a guard fix (a defect in a guard leaves the suite green), J3 and J9 are tenant-isolation and evidence
keys, and J13 changes the lock contract; that is adversarial work, not a mechanical check, so Sonnet is
not the cheapest reliable tier here. One agent live, no build work, gate run or commit alongside it (Rule
16.2). Findings to a scratchpad file as found, copied into `PRD-REVIEW-4.md` and committed before anything
else. The brief's expectations are executed last, on the exact HEAD it names (M36, M37).* Every
expectation was re-run on `8257173` immediately before launch and held. **Reported 2026-10-01: S1-S9,
copied verbatim into `PRD-REVIEW-4.md`.** None of the five closed. J1 and J12 re-opened (S2-S6; S7). J3 and
J9 hold in the database (S1 for J3's Prisma claim). J13 holds for every part claimed (S8, S9 documentation).
*Tier log: Opus was right — S4 and S6 are guard weaknesses no mechanical check would have looked for.*

**Second batched re-review — J1 (adversarial), J12 and J13 (closing checks) — launched 2026-10-01 on the
owner's instruction.** *Delegation (Rule 16.5), declared before launch: one `commit-reviewer` agent,
**Opus**. J1's checker was rebuilt on the catalogue, which is guard work where a defect leaves the suite
green; J12 and J13 need only bounded closing checks, written into the same brief rather than a second
agent, because Rule 16.2 allows one agent live and a separate Sonnet run would cost about the same. No
build work, gate run or commit alongside it. Findings to a scratchpad file as found, copied into
`PRD-REVIEW-4.md` and committed before anything else; expectations executed last on the HEAD it names.*
Every expectation re-run on `df3bef4` immediately before launch and held. **Reported 2026-10-01: T1-T12,
copied verbatim into `PRD-REVIEW-4.md`. None closable.** J1: T1 and T7 major, the rest minor; the catalogue
replacement held for what it reads. J12: six more Rule 21.10 sentences (T10). J13: the deadlock rule does
not cover shape D (T11). *Tier log: Opus was right for Part A; Parts B and C were bounded and found real
gaps too, so the single-brief choice cost nothing.* T11 fixed in `c6506ce` (J13 owes a mechanical closing
check only).

**Owner's decisions, 2026-10-01 — not yet built, next in order:** (1) **T7:** the money rule becomes a
closed list — every numeric column that is not `bigint` is named in an allow-list with its reason, in
`new-app/db/test/money-convention.test.ts`. (2) **J1's closing standard:** fix the forms T1 and T2 showed
(`name()` functions, dotted settings, wrong-table `table.column`, `#anchor`, `:L12`, `:12:5`, upper-case
extensions) and T3, T4, T5, T6, T8, T12; narrow every claim (the tool's docstring, the verify.yml comment,
Rule 21.8) to exactly the forms checked, listing what is not; J1 closes when a review finds no overclaim and
no miss within that stated scope. Then J12's six T10 sentences (recording, not editing, the policies file
policy-parity ties to a committed migration), then one re-review of J1, J12 and J13.

**Owner's decisions, 2026-10-01 (second set) — recorded, not yet built:**
1. **R5** (the application can set the balance-write flag; `THREAT-MODEL.md` §4e): fixed **when the API
   layer starts**, together with the connection roles — a privilege model in the migrations, no write grant
   on `issue_balance`, `SECURITY DEFINER` balance functions. Stays owed, not accepted, until then.
2. **Responses on a superseded or unnumbered issue** (`design/acceptance-responses.md` §3a): **refused in
   the database**, by extending J13's response trigger, as a small item after J1.
3. **Tenant erasure** (R4's follow-on): designed **with the staff console and the retention ADR**; until
   then an erasure request is a manual staff process.
4. **Governance proposals of 2026-09-27:** adopt three — **briefs as checked files** that run their own
   expectations at launch (M36, M37); a **delegation log** of tier and escalation cause; **"cheapest reliable
   execution"** as the tier rule. Defer the rules-review block, sequence tests as a named obligation, and
   recurrence counts per mistake class. Writing the three into `docs/RULES.md` is owed.
5. **Root `CLAUDE.md`:** replaced by a short pointer — done in `eee4709`.

**Built 2026-10-01 (next session):** T7 (`4b12831`); T5, T6, T8 (`67078e9`); J1's closing standard — T1-T4,
T9, T12 (`b723904`); J12's T10 (`9e83436`). J1, J12 and J13 are "Fixed, re-review owed".

**Third re-review — J1 (against its closing standard), J12 and J13 (closing checks) — launched 2026-10-01
on the owner's approved order.** *Delegation (Rule 16.5), declared before launch: one `commit-reviewer`
agent, **Opus**. J1 is judged against the owner's closing standard — no overclaim and no miss WITHIN the
scope the tool now states — which is adversarial guard work; J12 and J13 are bounded checks in the same
brief, as last time (Rule 16.2, one agent live). No build work, gate run or commit alongside it. Findings to
a scratchpad file as found, copied into `PRD-REVIEW-4.md` and committed before anything else; expectations
executed last on the HEAD it names.* Every expectation re-run on `af956fe` before launch and held.
**Reported 2026-10-01: U1-U14, copied verbatim into `PRD-REVIEW-4.md`. J13 CLOSED** (deadlock guidance
verified 6 of 6 on PostgreSQL 16). **J1 Open** — U7 major (a money column behind a three-level domain
escapes the closed list), U1-U6, U8, U9, U14 minor; none hides a defect today. **J12 Open** — U10, U11
major (writer-set sentences in documents-core.test.ts and PRD R1.24a/R1.15c), U12, U13 minor. *Tier log:
Opus right again; every J1 finding was a planted edge case, which no mechanical check would have tried.*

**Built 2026-10-01:** J1's U1-U9, U14 (`7e48353`); J12's U10-U13 and two more (`7803990`).

**Fourth re-review — J1 and J12 — launched 2026-10-01 on the owner's instruction ("proceed").** *Delegation
(Rule 16.5), declared before launch: one `commit-reviewer` agent, **Opus**, for the same reasons as the
third. The owner's change to the brief (2026-10-01): a NEW minor J1 finding is reported as a **candidate
stated limit** for the owner to accept or reject, not as an automatic reopen; a major finding, a miss on a
form the tool already claims to check, or an overclaim still reopens it — otherwise J1 cannot converge. No
build work, gate run or commit alongside it.* Expectations re-run on `4a81a3d` before launch and held.
**Reported 2026-10-01: V1-V18, copied verbatim into `PRD-REVIEW-4.md` (`a056d05`). J1 Open** — all minor:
misses V1-V6, overclaims V7-V9, V11, V12; candidate limits V3 (spaced call), V10, V14. **J12 Open** —
V15-V18, V16 major.

**Owner's decision, 2026-10-01:** fix J1's bugs and overclaims, accept V1, V2, V3's spaced call, V10 and
V14 as stated limits, and close J1 on a MECHANICAL closing check rather than a fifth adversarial round.
Built in `03e7296` with J12's V15-V18.

**Closing check — J1 and J12, mechanical — launched 2026-10-01.** *Delegation (Rule 16.5), declared before
launch: one `general-purpose` agent, **Sonnet**. The owner chose a mechanical check: every item has a
stated command and expected output, run before launch on the HEAD the brief names (M36, M37), so the
cheapest reliable tier is the one that can follow it exactly. A deviation is reported, not interpreted.
No build work, gate run or commit alongside it.* **Reported 2026-10-01: all nine items PASSED, no
deviation. J1 and J12 CLOSED.** *Tier log: Sonnet was right — every item was followed exactly, and it also
noted two harmless differences between plants and findings rather than passing over them.*

**Review 4 now:** Closed — J1, J2, J4, J5, J10, J12, J13, J15, J16 · Open, fix incomplete — J3 (R17), J9
(R10, R18) · Open, not started — J6, J7, J8, J11, J14.

**Built 2026-10-01:** J3's R17 and J9's R10, R18 (`763e2ca`).

**Closing check — J3 and J9, mechanical — launched 2026-10-01 on the owner's instruction.** *Delegation
(Rule 16.5), declared before launch: one `general-purpose` agent, **Sonnet**. Both remaining items are
bounded — one plant with a stated expected result, and three rows of text to read — so the cheapest
reliable tier is the one that follows stated expectations exactly; every expectation run before launch on
the HEAD the brief names (M36, M37). No build work, gate run or commit alongside it.* **Reported 2026-10-01:
every item PASSED, no deviation. J3 and J9 CLOSED.**

**Review 4 now:** Closed — J1, J2, J3, J4, J5, J9, J10, J12, J13, J15, J16 (11) · Open, not started — J6,
J7, J8, J11, J14. **Next, in the owner's order:** size J6, J7, J8, J11 and J14 (J6 first); the small
refusal of responses on superseded or unnumbered issues; then review 3's H17, H19, H20 and the ten legacy
gaps; then writing the three adopted governance rules into `docs/RULES.md`.

**Owner's decisions, 2026-10-01 (sizing of the last five):** order — J11 first; then J6, J7, J8 as one
acceptance-evidence batch after a design pass with options; J14 with R5's privilege model when the API
layer starts, recorded now as a launch blocker (`docs/THREAT-MODEL.md` §4f). **J11:** a line total is
quantity × unit price rounded HALF AWAY FROM ZERO at the cent, as an exact integer check in the database
(half-up for positive amounts, matching the earlier application); discounts may be offered, so lines may be
negative and round symmetrically. Tax consistency is NOT part of J11 — owed as its own item with the GCT
rules.

**Built 2026-10-01: J11** (migration `20260927170000_issue_lines_add_up`) — each frozen line's total
is checked as quantity × unit price half away from zero, and an issue's subtotal as the sum of its lines,
at COMMIT. Eight plants red, restored by backup. The test's 1e20 case caught a real defect before commit:
NUMERIC `/` rounds its quotient, so the check uses `div()`. Every seal fixture now carries a matching line.
**J11 now: Fixed, re-review owed.** Next: the independent closing check for J11, then the J6/J7/J8 design
pass with options.

**Closing check — J11, mechanical — launched 2026-10-01 on the owner's instruction.** *Delegation
(Rule 16.5), declared before launch: one `general-purpose` agent, **Sonnet**. Every item is bounded: eight
plants with a stated expected result each, a fixture sweep with a stated expected list, and two rows of text
to read. So the cheapest reliable tier is the one that follows stated expectations exactly; every
expectation was run before launch on the HEAD the brief names (M36, M37). No build work, gate run or commit
alongside it.* **Reported 2026-10-01: all seven items PASSED, no deviation; one wording
note (the J11 row deferred "header total" to §6.2a) answered by stating it in the row. J11 CLOSED.**

**Review 4 now:** Closed — J1, J2, J3, J4, J5, J9, J10, J11, J12, J13, J15, J16 (12) · Open, not started —
J6, J7, J8 (one batch, design pass with options next) · J14 deferred to R5 (launch blocker).

**Owner's decisions, 2026-10-01 (J6, J7, J8):** every recommendation in `docs/design/acceptance-grade.md`
accepted — D1 the highest grade; D2 evidence only on the accepted acceptance; D3 no grade once withdrawn;
D4 one row per provider event across all tenants; D5 the reply address derived, nothing stored, release-1
quotes never earn grade 4; D6 the bar frozen at seal and not gating invoicing; D7 `document_settings`
built minimal.

**Built 2026-10-01: J6, J7, J8** (migration `20260927180000_acceptance_grade`). Fourteen plants red,
restored by backup; two new races on PostgreSQL 16. Every acceptance fixture now records its first
evidence row. **J6, J7, J8 now: Fixed, re-review owed.** Next: the independent check of the three.

**Re-review — J6, J7, J8, adversarial — launched 2026-10-01 on the owner's instruction.** *Delegation
(Rule 16.5), declared before launch: one `commit-reviewer` agent, **Opus**. These are new design, not
corrections with a stated expected output, so the check must hunt for what the build gets wrong — bypasses
executed, not reasoned about — which needs the strongest tier; a mechanical (Sonnet) closing check follows
only if it finds nothing blocking. It reviews `009a1c6`; no build work, gate run or commit alongside it.*
**Reported 2026-10-01: none of the three closable** — twelve findings (W1-W12, two major) and two
suspicions, all appended verbatim to `docs/PRD-REVIEW-4.md`. Reading W1, the builder found and executed W13:
the same skip-if-invisible pattern lets J11's subtotal check be bypassed by clearing the tenant before
COMMIT. **J6, J7, J8 and J11 reopened.** *Tier log: Opus was right — every finding was executed, and W1's
mechanism exposed a hole in a finding already Closed.*

**Owner's decisions, 2026-10-01 (on the re-review):** the evidence key per tenant (D4 reversed, W7); the
withdrawal deadlock documented as the fourth shape, a withdrawal alone in its transaction (W2); superseded
and unnumbered issues refuse responses and evidence, and a superseded issue has no grade (W4 — this also
closes the earlier "refuse responses on superseded or unnumbered issues" item); and **no deployed or shared
database holds a sealed quote** (W8).

**Built 2026-10-01: the W fixes** (migration `20260927190000_rereview_fixes`): W1 and W13 refuse instead of
skipping (ledger M40, guard `db/test/trigger-rules.test.ts`); W4, W5, W6, W7; W2's race; W10 and W11 held
by tests; W3, W9, W12, S1, S2 in the documents. Eleven plants red, restored by backup. Fixtures number an
issue before a client responds; the no-stuck walk aims responses at the current revision three times in
four, re-measured with no floor lowered. **J6, J7, J8 and J11 now: Fixed, re-review owed.** Next: the same
adversarial reviewer, then a mechanical closing check.

**J13 designed, 2026-09-27** — `docs/design/acceptance-responses.md`, the owner's choice of **C plus A**:
declines become reversible, at most one accepted row per issue, a decline after acceptance refused, and a
withdrawn issue reads `withdrawn` and is never re-accepted. Written while the review agent was live and
committed after it reported. Not yet built.

## The headline, stated plainly

**The code is in the right place. The documents are behind, and one required step was skipped.**

Everything built so far — tenancy with leak tests, authentication, the schema, CI — is exactly
§18's step 1, "Foundations". That is not drift. But:

1. **The brief-revision step in §5 was skipped.** The brief says that once the audit is complete
   and product scope is decided, Claude proposes specific edits to the brief reflecting what was
   found. That did not happen, and I did not flag it. It is the clearest single instance of drift
   and it is now item 1 of what is owed.
2. **Phase 1 (§6) is mostly unwritten** — no PRD, no domain model, no threat model, no approved
   target schema — while implementation has proceeded. Each piece of code was approved through an
   ADR and directed by the owner, so this is not unilateral, but the brief's order was not
   honoured and the gap was not named until asked.
3. **The audit log is missing from Foundations.** §18 lists it in step 1 alongside auth and
   tenancy. It has not been built.
4. **Seven of the fourteen open questions in §19 are unanswered**, and the brief says they should
   be surfaced early.
5. **The design-before-build gate was breached twice** — Foundations ahead of Phase 1's artefacts,
   and the marketing site with no design at all. On 2026-09-24 the owner made it a hard gate
   (Rule 1.1): designs live in `docs/design/`, and a task names its approved design before it
   starts. The site implementation is parked until its design is approved.
6. ~~The independent review did not happen.~~ **Done.** The first agent failed on a session limit
   and returned nothing; the second reported incrementally so its findings could survive that, and
   found a red gate plus a critical guard hole in code I had written and reviewed myself. All 15
   findings are closed. **Rule 9's breach is closed for this slice** — and the rule is no longer
   theoretical.

---

## Phase 0 — audit (§5)

| Deliverable | State | Evidence |
|---|---|---|
| Schema review | ✅ | `PHASE-0-AUDIT.md` §1 |
| Architecture review | ✅ | §2 |
| Requirement-gap review | ✅ | §3 |
| Risk list | ✅ | §4 — 23 findings |
| Migration notes | ✅ | §5 |
| Product & feature review from the live site | 🟡 | §6 — **there is no marketing site**, so it was derived from code and the public pages and is marked unverified |
| Feature inventory, keep/change/drop | ✅ | §6 — 34 items |
| Product-scope recommendation | ✅ | §6 — one product |
| **Owner's scope DECISION** (the brief's gate on Phase 1) | ✅ | **2026-09-24: one product, built to verticalise later** — ADR 0017. Trade behaviour becomes a data pack; tier ladder unchanged |
| **Portfolio review — what to add, what to take out** | ✅ | `PRODUCT-OPPORTUNITIES.md`, 2026-09-24. The owner's actual §5 question, which I first misread as the verticalisation question. One item carries a deadline: price-index consent must be in the terms before the first tenant signs up |
| **Proposed edits to the brief after the audit** | ✅ | `BRIEF-EDITS-PROPOSED.md`, 2026-09-24 — eight edits, **approved by the owner and applied to the brief** the same day |

## Phase 1 — requirements and design (§6)

| Deliverable | State | Note |
|---|---|---|
| PRD (users, workflows, scope for first country and release) | ❌ | Nothing written |
| Domain model | ❌ | Entities exist in ADRs and the schema, never mapped as a whole. **Must be written in trade-neutral language** (ADR 0017) |
| Threat model | ✅ | `THREAT-MODEL.md`, 2026-09-24 — 9 assets, 9 adversaries, 6 trust boundaries, every control marked BUILT / PARTIAL / OWED with test evidence. It endorsed the authentication design and named five gaps, the audit log first |
| ADRs | ✅ | 16, dated, with alternatives and consequences |
| Target database schema for approval | 🟡 | The authentication slice is built and approved piecemeal; the product schema has not been designed or approved |

## §18 delivery order

**1. Foundations**

| Item | State | Evidence |
|---|---|---|
| Authentication | 🟡 | Default-deny routes, identity re-resolved per request, revocable sessions, sign-in, rate limiting, staff MFA (ADRs 0013–0016, 0021). **Owed:** HTTP transport, sign-up, password reset, sign-out and session rotation, MFA re-enrolment |
| Tenancy with cross-tenant leak tests | ✅ | `tenant_id` + forced RLS + `withTenant`, proved against real Postgres; every table must now be protected or exempt with a reason |
| Schema | 🟡 | **Client-generated ids, row versions and tombstones done** 2026-09-24 (ADR 0019), with partial indexes and a convention guard. **Owed:** the audit log's tables, and the product schema itself |
| Audit log | ✅ | Built 2026-09-24 (ADR 0020): append-only by the absence of a policy, atomic with its change, tenant-readable including staff actions. **Owed:** the platform trail, capability-gated read redaction, and the retention job |
| CI | ✅ | Both workspaces gate on every push |

**2. First end-to-end vertical slice** (quote → email → accept) ❌ not started
**3.** Catalog, tax, PDF, tiers and entitlements, billing with manual-payment approval ⏭️
**4.** Offline sync, WhatsApp sending, support channel ⏭️
**5.** Second country (Trinidad & Tobago) ⏭️
**6.** Retire `original-app/` ⏭️ — only on the owner's explicit confirmation

## §19 open questions

| Question | State |
|---|---|
| Product scope | ✅ One product, as scoped |
| Current stack and storage problems | ✅ Audit §1–2 |
| First and second country | ✅ Jamaica, then Trinidad & Tobago |
| Tier definitions and limits | 🟡 Tiers and features settled (`TIERS.md`); per-feature numeric limits and prices not set |
| Mobile approach | ❌ Expo assumed because it exists; never decided |
| Offline scope, and may a quote be issued offline | ❌ |
| WhatsApp approach | ✅ Click-to-chat now, Business API on the Business tier |
| Support model, buy or build | ❌ |
| Payment approval staffing at launch | ❌ Rule 13 has a single-operator exception, but the actual headcount is unanswered |
| Payment and billing providers | ✅ WiPay; platform billing to confirm |
| Hosting region and data residency | ❌ Relevant: data currently leaves Jamaica (`SERVICE-REGISTER.md` §6) |
| Free-tier providers and the paid trigger | 🟡 Recorded in the service register; **the ADR Rule 10 requires is owed** |
| Data to migrate | ✅ None — no live tenants |
| Claude API budget cap | ❌ |

## What is owed, in the order I would do it

Items 1 and 2 were done on 2026-09-24. `COMPLIANCE-REVIEW.md` adds one that outranks the rest.

1. ~~Proposed edits to the brief~~ ✅ — approved and applied to `DEVELOPMENT-BRIEF.md`. The brief now carries §5a (the portfolio review), §17a (the public website), the design-before-build gate in §3, and the Foundations status in §18.
2. ~~Threat model~~ ✅.
3. ~~The independent review of `new-app`~~ ✅ **done, and its register is clear.**
3a. ~~The marketing site~~ ✅ — designed (`docs/design/marketing-site.md`), approved, and built
   against that design. Its sharpest dependency is still not code: if **`info@pryvis.com`** does not
   receive mail, the site's only call to action is broken. Also owner-side: approving the legal
   wording (which removes the draft banners), setting the tier prices, and deciding the
   aggregate-data consent clause — that last one blocks registration, not the website.
4. **PRD and domain model** (§6), in trade-neutral language (ADR 0017). The vertical slice needs
   both. The **domain model** is written and **Proposed** (`docs/design/domain-model.md`), designed
   from the eight steps of the job rather than from the tables that exist (Rule 1.2); it names five
   corrections to work already built, and asks the owner two questions — whether one person may hold
   more than one business, and whether a tenant's clients ever get a login — because both change the
   PRD materially. *Delegation (Rule 16.5): Opus. Architecture and product decisions, 16.2's own
   category.* The **PRD** is next.
5. ~~Audit log~~ ✅ **done 2026-09-24** (ADR 0020). Owed: `platform_audit_entry` for tenant-less
   staff actions, capability-gated read redaction, and the retention job that enforces the
   seven-year policy.
5a. ~~Staff MFA~~ ✅ **done 2026-09-24** (ADR 0021), the last of the three Foundations gaps.
   *Delegation (Rule 16.5): Opus, main session, no agent, **undeclared and in breach** — Rule 16.2
   places a build against an approved design with Sonnet. Rule 16.5 was written in response.* Owed and
   recorded there: the capability-gated re-enrolment path, a key-management service in place of
   configuration, and calling the re-authentication check at each dangerous action once those
   actions exist.
6. **Finish authentication:** sign-out and session
   rotation, HTTP transport, sign-up, password reset.
7. **Dependency scanning, secret scanning and an SBOM** — cheap, mechanical, and the only defence
   against a class we currently cannot see at all. Two of the three are **done 2026-09-24**: the
   `scan` job runs `gitleaks` over the full history (blocking) and `npm audit` over both workspace
   roots (a warning for now, to be made blocking once the first pass is clean). The **SBOM is still
   owed**, and it is the one that turns an advisory into a query. *Delegation (Rule 16.5):
   in-session — two file edits, below the threshold where briefing a cold agent pays for itself.*
8. ~~Schema: client-generated ids and row versioning~~ ✅ **done 2026-09-24** (ADR 0019). Owed
   with the persistence layer: a guard that every repository writes `AND version = $n`, and one
   that every query filters `deleted_at IS NULL`.
9. **A `TradePack` in core** with the guard that fails on a trade branch (ADR 0017), before the
   catalog work makes construction assumptions hard to remove.
10. Answer the seven open questions, each as an ADR or a PRD entry.
