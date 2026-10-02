# Delegation log

One row per agent launch (Rule 16.8). Written when the outcome is known, in the commit that records it.

**Escalation cause** is filled only when a run had to be redone or its tier changed, from the fixed list in
Rule 16.8: *brief incomplete* · *tier too low* · *scope too broad* · *tooling or session*. A review that finds
defects has done its job and has not escalated, so its cause is "—".

**Backfill.** The rows up to and including 2026-10-01 were reconstructed on 2026-10-01 from the launch
declarations in `BRIEF-STATUS.md` (each written before its launch, per Rule 16.5), when this log was
created. Launches before 2026-09-27 are not reconstructed: their declarations were not recorded in a form
that states the tier's reason and the outcome together.

| Date | Task | Agent, tier | Why that tier | Outcome | Escalation cause |
|---|---|---|---|---|---|
| 2026-09-27 | Second re-review of J4, J10, J15 (`c35952d`, `8e8236a`) | commit-reviewer, Opus | Adversarial: money arithmetic, ceiling state, withdrawal preconditions — a defect leaves the suite green | L1-L6; none closable | — |
| 2026-09-27 | Third re-review of J4, J10, J15 (`23ca3a5`) | commit-reviewer, Opus | As above, plus a money oracle | N1-N10; J15 closable | — |
| 2026-09-27 | Fourth re-review of J4, J10, J15 (`cfeac92`) | commit-reviewer, Opus | Lock design over the money invariant, and its CI wiring | P1-P7 | — |
| 2026-09-27 | J4 closing check | commit-reviewer, Sonnet | Mechanical: every step and expected output named | Two expected outputs were wrong; the checker followed them exactly (M36) | brief incomplete |
| 2026-09-27 | J4 closing re-check | commit-reviewer, Sonnet | The same, with a corrected brief | Passed but for one item: the brief's own status entry, written after its expectations were run (M37) | brief incomplete |
| 2026-09-27 | Re-review of the seven (J1, J2, J3, J5, J9, J12, J16) | commit-reviewer, Opus | Tenant-isolation keys, the ceiling trigger and guards — adversarial | R1-R18; J2, J5, J16 closed | — |
| 2026-10-01 | Batched re-review of J1, J3, J9, J12, J13 | commit-reviewer, Opus | A guard fix, isolation keys, and a change to the lock contract | S1-S9 | — |
| 2026-10-01 | Second batched re-review: J1 (adversarial), J12 and J13 (closing) | commit-reviewer, Opus | J1's checker rebuilt on the catalogue is guard work; the bounded checks rode in the same brief (one agent live) | T findings | — |
| 2026-10-01 | Third re-review: J1 against its closing standard, J12, J13 | commit-reviewer, Opus | Adversarial guard work within a stated scope | U1-U14; J13 closed | — |
| 2026-10-01 | Fourth re-review: J1 and J12 | commit-reviewer, Opus | As the third; new minor J1 findings reported as candidate limits | V findings; limits accepted by the owner | — |
| 2026-10-01 | Closing check: J1, J12 | general-purpose, Sonnet | Mechanical; expectations run on the named HEAD | All nine items passed | — |
| 2026-10-01 | Closing check: J3, J9 | general-purpose, Sonnet | Mechanical: one plant, three rows to read | Passed | — |
| 2026-10-01 | Closing check: J11 | general-purpose, Sonnet | Mechanical: eight plants, a fixture sweep, two rows | Passed | — |
| 2026-10-01 | Re-review of J6, J7, J8 | commit-reviewer, Opus | New design: bypasses must be executed, not reasoned about | W1-W12; none closable | — |
| 2026-10-01 | Second re-review of J6, J7, J8, J11 | commit-reviewer, Opus | The tier that found W1-W12, re-executing each bypass | X1-X10 | — |
| 2026-10-01 | Third re-review, scoped to the X fixes | commit-reviewer, Opus | Converging findings; scoped, adversarial | Y1-Y6; the builder found Y7 from Y2 (the ceiling bypass) | — |
| 2026-10-01 | Fourth re-review, scoped to the Y fixes | commit-reviewer, Opus | Both protection layers attacked, ceiling races re-run | All five closable; Z1-Z5 stated as limits | — |
| 2026-10-01 | Closing check: J2, J6, J7, J8, J11 | general-purpose, Sonnet | Mechanical: 26 plants against each rule's current definition, in four chunks | All seven items passed; 26 of 26 caught | — |
| 2026-10-01 | Closing check: H17, H19, H20 | general-purpose, Sonnet | Documents only: phrases present or gone | Passed; one stale sentence noted and fixed | — |
| 2026-10-02 | Adversarial review of the privilege model (R5, J14, §4g), brief `docs/briefs/2026-10-01-privilege-model-review.md`, HEAD `01c3cdc` | commit-reviewer, Opus | Credential path and policy text (16.5 exceptions); bypasses executed | AA1-AA7; R5 closable with limits, J14's guard and §4g's check not closable | — |
| 2026-10-02 | Closing check of the privilege model after AA1-AA7, brief `docs/briefs/2026-10-02-privilege-model-closing-check.md`, HEAD `0ed552d` | general-purpose, Sonnet | Mechanical: five plants and five read items, every expected output written | Passed: 11 of 11, all items hold; R5, J14, §4g closable | — |
| 2026-10-02 | PRD review 5, adversarial with recommendations, brief `docs/briefs/2026-10-02-prd-review-5.md`, HEAD `9501483` | commit-reviewer, Opus | Product judgement over the plan of record; adversarial | B1-B28 (5 blocker, 16 major, 7 minor); recommends not approving yet; 14 owner decisions | — |
| 2026-10-02 | Re-read of the amended PRD, brief `docs/briefs/2026-10-02-prd-review-5-reread.md`, HEAD `9ac17c6` | commit-reviewer, Opus | Adversarial against the amendments themselves | C1-C10 (6 major, 4 minor); approve after named changes; interrupted once by a usage limit and resumed with its context, tree verified clean between | tooling or session |
| 2026-10-02 | Closing check of the re-read's fixes (C1-C10), brief `docs/briefs/2026-10-02-prd-reread-closing-check.md`, HEAD `c3cfe9f` | general-purpose, Sonnet | Mechanical: four plants and read items, every expected output written | Passed: 10 of 10, C1-C10 all hold; closable | — |
| 2026-10-02 | Independent read of the planning baseline audit, brief `docs/briefs/2026-10-02-planning-audit-read.md`, HEAD `fd10219` | general-purpose, Sonnet | Mechanical: every claim names its file | No row false in substance; PA1-PA9 (coverage gaps and imprecisions), all corrected | — |
| 2026-10-02 | Independent read of the tax and documents design (A1), brief `docs/briefs/2026-10-02-tax-design-read.md`, HEAD `8448b17` | commit-reviewer, Opus | Money arithmetic and the ceiling: judgement-class (Rule 16.5) | TD1-TD15 (1 blocker, 10 major, 4 minor); "not yet … sound after the named changes"; all answered in the design's §8 | — |
| 2026-10-02 | Closing check of the tax design's answers to TD1-TD15, brief `docs/briefs/2026-10-02-tax-design-closing-check.md`, HEAD `b666ee6` | general-purpose, Sonnet | Mechanical: every item names its text; arithmetic worked by hand | 6 of 6 expectations hold; TD1-TD15 all answered; closable. One imprecision (a pointer cited as §6.2 sits under §6.2a), corrected | — |
| 2026-10-02 | Independent read of the API layer design (A2), with an expert opinion on each recommendation, brief `docs/briefs/2026-10-02-api-layer-read.md`, HEAD `3f3254a` | commit-reviewer, Opus | Security architecture, and the owner relies on our judgement (Rule 16.5) | AL1-AL18 (12 major, 6 minor), the worst confirmed on a scratch PostgreSQL and Nest app outside the repository; agreed with AP1-AP11 in direction; "sound to build from after the named changes"; all answered in the design's §7 | — |
| 2026-10-02 | Closing check of the API layer design's answers to AL1-AL18, brief `docs/briefs/2026-10-02-api-layer-closing-check.md`, HEAD `941b399` | general-purpose, Sonnet | Mechanical: every item names its text | 5 of 5 expectations hold; AL1-AL18 all answered; every amended AP line adopted; closable | — |
| 2026-10-02 | Independent read of the support and feedback design (A3), with an expert opinion on each recommendation, brief `docs/briefs/2026-10-02-support-design-read.md`, HEAD `4a4b93e` | commit-reviewer, Opus | A privacy boundary, and the owner relies on our judgement (Rule 16.5) | SR1-SR15 (8 major, 7 minor); the search-library leak confirmed on a synthetic Pagefind index; agreed with SF1-SF4, SF6 and §4's phases; "sound after the named changes"; all answered in the design's §10 | — |
| 2026-10-02 | Closing check of the support design's answers to SR1-SR15, brief `docs/briefs/2026-10-02-support-design-closing-check.md`, HEAD `7d69e45` | general-purpose, Sonnet | Mechanical: every item names its text; cost arithmetic by hand | 5 of 5 expectations hold; 14 of 15 answered; **not closable**: SR5's change to ADR 0030 decision 4 unrecorded. Fixed; a scoped re-check follows | — |

**What the log shows so far.** Two escalations, both *brief incomplete*, both on one check (J4's), and both
fixed by the brief rather than the tier — the evidence Rule 16.9 rests on. Every Sonnet closing check since
the expectations were run on the named HEAD has passed first time. The Opus rounds on J6-J8 converged as
13, 10, 7, then nothing blocking.
