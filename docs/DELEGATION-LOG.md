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

**What the log shows so far.** Two escalations, both *brief incomplete*, both on one check (J4's), and both
fixed by the brief rather than the tier — the evidence Rule 16.9 rests on. Every Sonnet closing check since
the expectations were run on the named HEAD has passed first time. The Opus rounds on J6-J8 converged as
13, 10, 7, then nothing blocking.
