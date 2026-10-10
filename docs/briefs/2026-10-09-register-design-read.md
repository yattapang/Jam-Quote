# Brief: independent read of the third-party register design (build plan A5)

**Rule 0 first:** read `docs/RULES.md` and state which rules apply before starting. **You have no subagents; you do
this work yourself** (Rule 16.6).

**Agent:** commit-reviewer, **Opus** (Rule 16.5: choosing where personal data goes, and upload security, are
judgement-class; this is adversarial reading of a design, not a mechanical check).
**Brief step:** build plan A5 (`docs/BUILD-PLAN.md`), phase A — a planning step, whose "review" is an independent read.
**Under review:** `docs/design/third-party-register.md`, approved by the owner on 2026-10-09 (RG1-RG9, with the
Canadian company holding the mailbox and the PDF residual accepted), and the changes it made on approval to
`docs/SERVICE-REGISTER.md`, `docs/OWNER-ACTIONS.md` (OA6, OA12), `docs/THREAT-MODEL.md`,
`docs/DATA-PROTECTION-READING.md` and `docs/design/environments-and-operations.md` (OP4, OP10).
**Read it against:** Rules 5, 10, 15, 18 and 20 (`docs/RULES.md`); ADRs 0021, 0032, 0033, 0034 and 0035 (`docs/adr/`);
`docs/design/environments-and-operations.md` (OP1-OP12, approved); `docs/design/api-layer.md` (AP9, AP10, AP11);
`docs/design/support-and-feedback.md` (SF2, SF5, SF7); `docs/design/privilege-model.md`; `docs/PRD.md` (R1.16,
R1.16a, R1.33-R1.37, §9 items 1c and 1d); `docs/PLANNING-AUDIT.md` §7 item 5.
**Do not touch:** anything. This is a read. `original-app/` is read-only in any case.

**As with A2-A4, the owner relies on our judgement:** besides finding gaps, say for each of RG1-RG9 whether you would
recommend the same, and if not, what and why. You may search the web to check a provider's capability, region, terms
or price — the design marks several as unconfirmed, and confirming or refuting any of them is valuable.

## What to attack

1. **"Never read unscanned" (RG3).** Find the path by which an upload that has not been scanned clean is stored in the
   files bucket, served by a signed URL, rendered into a PDF, or opened by staff. Consider: the scan job's key and the
   quarantine bucket's tag condition; who else can write tags; GuardDuty's verdicts and timeouts; the logo path into
   the renderer; a race between the job and the one-day lifecycle rule; a tenant re-uploading under the same key.
2. **The eight steps (RG3).** Is each step's limit, order and failure honest? Type from the bytes, polyglot files, a
   PDF that is also a valid image, decoder exploits before or after the scan, metadata, the decision not to disarm
   PDFs and the accepted residual — is the residual stated truly, or understated?
3. **Duplicates across tenants (RG3, R1.36).** Does the cross-tenant match leak one tenant's data to another, or to
   staff beyond need? Is "flag, never block" right against Rule 13?
4. **Where personal data goes (RG1, RG2, RG4, RG6, RG8; ADR 0035).** Is every holder of personal data in the
   sub-processor list, with a true location? Is "Sentry holds no personal data" achievable as designed, including the
   browser-error route? Is the mailbox's 90-day deletion actually available on Business Basic, and does a Canadian
   company's Microsoft tenant actually keep Exchange data in Canada?
5. **Backups and files (RG2, RG7; OP6).** Does the files archive keep OP6's promises — the second company, Object Lock,
   35 days, the drill, the erasure ledger? Does the 35-day version lifecycle on Spaces fit "deletion means at most 35
   days"? Are the three AWS accounts' keys as narrow as claimed?
6. **Free plans and costs (RG1 test 4, RG9, OP10).** Commercial-use terms of each free plan; whether the totals add up
   across RG9, OP3 and OP10; any trigger that is missing or set where it would bite too late.
7. **Consistency and gaps.** Every place this design disagrees with the rules, the ADRs, the other designs, the
   register, the threat model or the owner actions; anything a builder of B3 or B5 would have to make up; anything the
   register rewrite left stale.

## How to work

- Read; do not edit anything, commit, stash, `git checkout --` or `git restore`. Write your findings only in your
  reply. Synthetic data only.
- Report findings **as you find them** in your reply's order, so a run cut short still leaves what it found (Rule 16.3).

## What to report

Findings numbered **RR1, RR2, …**, each with severity (blocker / major / minor), where, the evidence (quote the line,
or the command and its output), and a recommendation. Then a table RG1-RG9: **agree** / **disagree** (with your
alternative, one line). Then what you did **not** examine (Rule 21.4). Then one line: **the design is sound to build
from**, or **sound after the named changes**, or **not yet**. Then `git status --short`, which must be empty.

## Expectations

```check
$ grep -c "^## [0-9]*\. RG[0-9] ·" docs/design/third-party-register.md
9
```

```check
$ grep -c "APPROVED by the owner, 2026-10-09 — every recommendation, RG1-RG9" docs/design/third-party-register.md
1
```

```check
$ grep -c "Rewritten 2026-10-09 for the rebuilt application" docs/SERVICE-REGISTER.md
1
```

```check
$ for t in check_rules check_dispositions check_citations check_schema_citations check_build_plan; do python3 tools/$t.py 2>&1 | tail -1; done
All citations resolve, and no rule has changed unreviewed.
Every Closed disposition cites every document its finding named.
Every cited filename and symbol resolves. (Paths are checked by tools/check_schema_citations.py, not here.)
Every citation in the forms this tool checks resolves (its docstring lists them, and what it does not check).
Every ticked step carries its evidence.
```
