# Which rules a machine can hold, and which it cannot

**Date:** 2026-09-25 · **Asked by the owner:** *"Would it stand to reason then that all of the other
rules should be converted from prose to code?"* · **Answer: no, and the distinction is the useful part.**

## The method

ADR 0025 moved five invariants out of prose because prose could not hold them. Those five share a
property: each is a **proposition over data** — a ceiling, a uniqueness rule, a state derivation, a write
path, an immutability boundary. A database can *evaluate* them, which is why two prose copies could give
two answers to a computable question.

Most rules here are not that. So the question per rule is not "convert it?" but:

> **What part of this rule is a proposition a machine can evaluate?** Extract that. Leave the judgement
> in prose, and say plainly that it is judgement.

Forcing a judgement rule into code produces a check that passes while the rule is violated, which is the
failure mode of the three controls this project caught on 2026-09-24 (M3, M12, M14). **A rule that looks
enforced is worse than one honestly marked as judgement.**

### And the cost, because a checker is itself a control

Rule 21 applies to checkers: each must fire on purpose (21.2), state what it does not prove (21.4), and be
maintained. **Twenty checkers nobody runs is worse than five that gate** — and this project has three
corpses of exactly that: the ungated lint warnings, Rule 17's stale weakness list, and `Keep API warm`
reporting success for months while doing nothing.

So Rule 24.5's test governs: **build a checker where the rule has actually been broken**, not where it
might be. The ledger is the evidence, not intuition.

## Legend

- **E** — enforced now by a mechanical control that gates.
- **P** — partly enforced; a core is checked, the rest is judgement.
- **X** — has an extractable core that is **not** checked yet. Ranked below.
- **J** — judgement only. No mechanical form exists, and pretending otherwise would be worse than the gap.

## The audit

| Rule | | How it stands |
|---|---|---|
| 0 read the rules first | **J** | Cannot verify a person or an agent read anything. 16.1 puts it in every brief; that is the control |
| 1.1 design before code | **P** | Judgement, but `docs/design/README.md` carries a status per design. Extractable: a build commit naming no approved design. Broken once (the marketing site) |
| 1.2 design from the product | **J** | No program can judge whether a design was derived from product needs |
| 1.3 audit before rebuild, `original-app/` read-only | **X** | *"No commit touches `original-app/`"* is a three-line CI check. Never broken, so not built (24.5) — but the consequence is severe and adjacent to E4 |
| 1.4 small reviewable changes | **J** | "Small" is a judgement about scope |
| 1.5 tests first, proved by planting | **P** | The gate runs the tests. **Whether a defect was planted cannot be checked** — only the author's word, which is why 21.3's coverage line exists |
| 1.6 explain decisions as ADRs | **X** | Cheap: every ADR has Status, Date and a Delegation line. Not broken |
| 1.7 flag, don't assume | **J** | And it **works**: it caught global email uniqueness and the typed-name assumption before either cost a migration. Evidence that judgement rules are not second-class |
| 1.8 owner reviews every diff | **J** | Ours to respect, not to check |
| 1.9 living documents | **P** | `check_rules.py` catches a rule changing without its citations reviewed. Staleness of *content* is judgement |
| 1.10 a plan is attacked before build | **X** | Extractable: *a document marked Approved must reference a review file whose findings are dispositioned.* Broken once — the domain model was approved with no review |
| 2 code a stranger can follow | **J** | Comment density and clarity are not computable |
| 3 money, tax, country, time | **X** | **Strong.** *Every money column is a 64-bit integer; no float, no 32-bit, no money in a JS `number`.* This is the defect that motivated the entire rebuild — the old app capped at $21,474,836.47 — and it is checkable from the schema |
| 4 tenant isolation | **E** | `policy-parity.test.ts` reads `pg_get_expr` rather than counting policies; `tenant-isolation.test.ts` executes a leak attempt. The strongest control in the project and the model for the rest |
| 5 security from first commit | **P** | `scan` job (secrets, advisories), `route-protection-coverage.test.ts` (default-deny). "No secret in a log" is not checkable today |
| 5.1 staff MFA | **P** | Enforced in the resolver and proved by planting; no repo-level check that it stays required |
| 6 data integrity | **P** | `row-convention.test.ts` covers `version`/`deleted_at`. **Extractable and strong:** *a committed migration file is never modified* — a trivial git check for a severe failure |
| 7 one rule, one place | **P** | `check_rules.py` catches duplicate authority between the rulebook and its citations; duplication of *reasoning* is judgement |
| 8 testing, and what "done" means | **P** | The gate is the control; "done" is judgement |
| 9 independent review per module | **X** | Extractable: *the module register names a reviewer and a seam test per module.* The register is thin and this is worth doing when modules exist |
| 10 portability and infra staging | **J** | Plus the service register. The free-to-paid trigger is an owed ADR, not a check |
| 11 communications | **X** | *Every send goes through `outbound_message`* — a parser guard that nothing else calls a mail or messaging SDK. Build it **with** W5, not before |
| 12 offline (mobile) | **J** | Conflict rules per entity are design; the sync tests will enforce specific ones |
| 13 payments and activation controls | **X** | **Strong, when built:** approver ≠ activator is a database constraint, not a policy document. Belongs in the W9 migration |
| 14 entitlements and tiers | **X** | *No plan comparison at a call site* — a parser guard. Build with the entitlement resolver |
| 15 Claude-assisted maintenance | **J** | Budgets and caps live outside the repo. "No production data to the API" is ours to respect |
| 16.1 agents read the rules | **P** | The brief either contains the rules or it does not — checkable in principle, but briefs are not committed artefacts |
| 16.2 minimum capable model | **J** | Superseded in part by 16.6: the variable is protocol adherence, not tier |
| 16.3 silence is never a pass; evidence or failed | **J** | Mechanical as a *test I apply to a report*, not as code |
| 16.4 a report is evidence, not a verdict | **J** | |
| 16.5 the delegation decision is declared | **X** | Extractable: *every batch entry in `BRIEF-STATUS.md` carries a Delegation line.* Broken once (M1) |
| 16.6 what the agents got wrong | **J** | A finding, not an obligation |
| 17 weaknesses stated plainly | **J** | Went stale **twice** and was corrected by reading. A checker would have to know what is true, which is the thing being asserted |
| 18 the service register | **X** | **Extractable:** *every environment variable referenced in code or `render.yaml` appears in the register.* Broken (F11: no malware scanner, no object storage) |
| 19 the brief is the plan of record | **P** | Rule 23.5 covers the rulebook half; the brief's own accuracy is judgement |
| 20 the public site | **E** | `site-guards.test.ts`, 11 tests including the new tier guard, each proved by planting |
| 21.1 scope quoted from the tool | **J** | The judgement is what counts as coverage |
| 21.2 a control ships having fired | **J** | Cannot verify a plant happened. The strongest rule here and the least checkable, which is worth stating |
| 21.3 a coverage line closes each batch | **X** | Cheap, same shape as 16.5's |
| 21.4 "what this does not prove" on every control | **X** | **Strong.** *Every guard, workflow and checker file contains such a section.* Its absence from `verify.yml` is how the full-history claim went unchallenged (M3) |
| 21.5 a remediation claim quotes the authority | **J** | |
| 21.6 one sample is not a pattern | **J** | |
| 21.7 an exit code is not evidence of an effect | **J** | |
| 22.1 anchors asserted unique | **J** | Checks the author's script, which is not a committed artefact |
| 22.2 parse the result of a scripted edit | **J** | Same |
| 22.3 prose through a file, not inline | **J** | Same |
| 23.1–23.5 changing a rule | **E** | `check_rules.py` + `rules-manifest.json`, in CI. Numbers explicit, append-only, tombstones, and any change to a rule's text failing the build with the citation list |
| 24.1 every defect gets an entry | **J** | Requires knowing a defect occurred |
| 24.2 every entry names a mechanism | **X** | Cheap: every ledger entry contains a "Prevented by:" line. Not broken |
| 24.3 the rule lands with the entry | **J** | |
| 24.4 a repeat means the rule was decorative | **J** | And the most valuable line in the ledger |
| 24.5 would it have caught this mechanically | **J** | The test this audit applies |
| 24.6 a finding is not closed until cited and re-reviewed | **E** | `check_dispositions.py`, in CI. Failed its own author ten times on the day it was written |

**Totals: 5 enforced · 11 partly · 13 extractable · 34 judgement-only.**

That ratio is the answer to the question. Two thirds of this rulebook is judgement, and it is not a
weakness — Rule 1.7 alone caught two assumptions about the world before either cost a migration.

## What is missing from the rulebook entirely

One class of defect has happened **twice** and no rule names it:

> **A cited file, path or symbol must exist.** `PRD.md` credited a guard called `honest-claims.test.ts`
> which never existed (F5, logged as M14) — and then the *fix* for M14 put a comment in `site.ts` citing
> `honestClaims`, a symbol that does not exist either (H16). **The defect was re-committed inside its own
> fix**, which by Rule 24.4 means it needs a mechanism rather than more care.

This should become **a new sub-rule under Rule 21** with a checker, and it is the highest-priority item below. (Written without a number on purpose: `check_rules.py` treats a cited number as a claim that the rule exists, and citing an unborn rule turned the build red — the checker being right about its own author, again.)

## Recommended, in order, with the reason each earns its place

| # | Build | Why it, and not something else |
|---|---|---|
| 1 | **Cited paths and symbols exist** → a new sub-rule under Rule 21, plus `tools/check_citations.py` | **Broken twice, once inside its own fix.** ~30 lines. Scans committed Markdown and source comments for file paths and `symbol` references and asserts each resolves |
| 2 | **Money columns are 64-bit integers** (Rule 3) | The defect that motivated the rebuild. Becomes relevant the moment the Documents migration lands, which is the next batch — so it ships **with** it |
| 3 | **"What this does not prove" in every control file** (Rule 21.4) | Its absence from `verify.yml` is how a scanner claimed full history for 429 unscanned commits (M3) |
| 4 | **A committed migration is never modified** (Rule 6) | Not yet broken, but it is a trivial git check for a failure that corrupts a deployed database |
| 5 | **Every env var used appears in the register** (Rule 18) | Broken (F11). Cheap, and it makes an undecided service impossible to forget |

**Not recommended:** anything for a rule the ledger shows has never broken and whose consequence is
recoverable. That list includes 1.6, 21.3, 24.2 and the parser guards for Rules 11, 13 and 14 — the last
three because **the code they would guard does not exist yet**, and a guard with no subjects is a guard
that proves nothing (the mistake E2 came from).

## What this audit does not prove (Rule 21.4)

- Not that the 34 judgement rules are being followed. It claims only that no machine can tell.
- Not that the five enforced rules are enforced *correctly* — only that a control exists and fires. Rule 9
  answers correctness.
- The classifications are mine, and I am the author of most of these rules. An independent reviewer would
  likely move two or three between **X** and **J**, and the ones to argue about are 1.10, 9 and 18, where
  a check would cover part of the rule and might be read as covering all of it.
