# Brief: independent read of the document settings and PDF design (build plan A7)

**Rule 0 first:** read `docs/RULES.md` and state which rules apply before starting. **You have no subagents; you do
this work yourself** (Rule 16.6).

**Agent:** commit-reviewer, **Opus** (Rule 16.5: what a client receives as the record of a commitment, and the hash that
makes it evidence, are judgement-class; this is adversarial reading of a design).
**Brief step:** build plan A7 (`docs/BUILD-PLAN.md`), phase A — a planning step, whose "review" is an independent read.
**Under review:** `docs/design/document-settings-and-pdf.md`, approved by the owner on 2026-10-10 (DS1-DS8, with no
Pryvis line on any document and that stated in the tiers' marketing), and the changes made on approval to
`docs/TIERS.md`, `new-app/web/content/site.ts` and `new-app/web/test/site-guards.test.ts`.
**Read it against:** Rules 3, 5, 6, 7, 14, 20, 21 and 24 (`docs/RULES.md`); ADRs 0031 and 0035 (`docs/adr/`);
`docs/PRD.md` (R1.13, R1.13a, R1.16, R1.16a, R1.17, R1.18, R1.44); `docs/DEVELOPMENT-BRIEF.md` §10;
`docs/design/tax-and-documents.md` (T8, T9); `docs/design/third-party-register.md` (RG2, RG3);
`docs/design/outbound-messaging.md` (MS5); `docs/design/acceptance-evidence.md`; `docs/design/domain-model.md`;
`new-app/db/schema.prisma` (`DocumentRender`, `DocumentSettings`); `docs/TIERS.md`; `docs/MISTAKES.md`; and, read-only,
the original application's PDF code (`original-app/apps/web/lib/pdf/`, `original-app/apps/web/app/(app)/quotes/[id]/pdf/route.ts`).
**Do not touch:** anything. This is a read. `original-app/` is read-only in any case.

**As with A2-A6, the owner relies on our judgement:** besides finding gaps, say for each of DS1-DS8 whether you would
recommend the same, and if not, what and why. Vendor facts must come from the vendor's own pages (A5's RR6).

## What to attack

1. **"An issued PDF never changes, and serving it proves it" (DS6, R1.16a).** Find any path by which a client, the
   tenant or staff could see a document other than the hashed render: a re-render, a settings change, a logo replaced, a
   revision, a restore, a draft or internal copy reaching a client, a cache, the share page.
2. **What the snapshot must hold (R1.13; DS4, DS6).** Is everything the render reads frozen at seal — the logo object,
   colours, terms version, rule-pack version, client details (T8)? What happens to an issued document's logo when the
   tenant deletes or replaces it?
3. **Legibility and tiers (DS1-DS3).** Can a tenant make a document illegible, or get a Pro feature on Free? Is the
   4.5:1 rule sound for the uses stated?
4. **The renderer (DS5).** Tenant-supplied text and the logo pass through it in the API process — the process A5's RR1
   moved image decoding out of. Is the logo here a hostile-input risk? Can tenant text break the layout or the PDF?
   Are the stated renderer facts true on its own pages?
5. **Data and retention (DS8; ADR 0035).** Every copy of a PDF, its lifetime, and erasure — including the claim that a
   PDF is deleted when its document is anonymised.
6. **The marketing line.** `site.ts`'s new Free line: is it true of release 1, consistent with `docs/TIERS.md` and DS4,
   and within Rule 20's honesty and the site guard's rules?
7. **§11, the mistakes table.** Is each row's verdict honest? Name any recorded mistake this design could repeat that
   §11 does not list.
8. **Consistency and gaps** with the rules, ADRs, PRD, other designs, the schema and the original application;
   anything a builder of C4 would have to make up.

## How to work

- Read; do not edit anything, commit, stash, `git checkout --` or `git restore`. Write your findings only in your
  reply. Synthetic data only.
- Report findings **as you find them**, so a run cut short still leaves what it found (Rule 16.3).

## What to report

Findings numbered **DR1, DR2, …**, each with severity (blocker / major / minor), where, the evidence (the quoted line,
or the command and its output, or the vendor page), and a recommendation. Then a table DS1-DS8: **agree** /
**disagree** (with your alternative, one line). Then what you did **not** examine (Rule 21.4). Then one line: **the
design is sound to build from**, or **sound after the named changes**, or **not yet**. Then `git status --short`, which
must be empty.

## Expectations

```check
$ grep -c "^## [0-9]*\. DS[0-9] ·" docs/design/document-settings-and-pdf.md
8
```

```check
$ grep -c "APPROVED by the owner, 2026-10-10 — every recommendation, DS1-DS8" docs/design/document-settings-and-pdf.md; grep -c "no Pryvis branding, even on Free" new-app/web/content/site.ts new-app/web/test/site-guards.test.ts; grep -c "No Pryvis branding on the tenant's documents" docs/TIERS.md
1
new-app/web/content/site.ts:1
new-app/web/test/site-guards.test.ts:1
1
```

```check
$ for t in check_rules check_dispositions check_citations check_schema_citations check_build_plan check_deferrals; do python3 tools/$t.py 2>&1 | tail -1; done
All citations resolve, and no rule has changed unreviewed.
Every Closed disposition cites every document its finding named.
Every cited filename and symbol resolves. (Paths are checked by tools/check_schema_citations.py, not here.)
Every citation in the forms this tool checks resolves (its docstring lists them, and what it does not check).
Every ticked step carries its evidence.
No deferral names a decided step, in the forms this tool checks (its docstring lists what it does not).
```

```check
$ git status --short
```
