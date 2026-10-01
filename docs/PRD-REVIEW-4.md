# PRD review 4 — the code, the acceptance design, and the previous round's closures

**Reviewer:** independent review agent (Opus class), 2026-09-26. **Did not write** any of the work
under review. Rule 0, Rule 1.10, Rule 9, Rule 21, Rule 24.6.

**Findings are numbered J1, J2, … and appended as they are found** (Rule 1.10), so an interrupted run
still leaves what it found on disk.

**Prior under test.** Reviews 1–3 found 19, 17 and 20 findings, and in each round the majority of the
blockers were *created by the amendments that closed the previous round*. This round examines the
first work nobody but the author has read: five migrations, 26 policies, four functions, one trigger,
a 67-test suite, and a design approved the day before with its independent review outstanding.

**Scope of what was actually read** is at the end, under "What this review did not examine" (Rule
21.4).

## Disposition — updated as findings close (added 2026-09-27, by the author, not the reviewer)

**Only an independently re-checked fix reads Closed (Rule 24.6).** Seven findings were fixed and planted
by the session that wrote them, and no independent reviewer has checked those fixes as a set; they read
**Fixed, re-review owed**, which `tools/check_dispositions.py` deliberately does not count as a closure.
The J4 line's four re-reviews are appended at the end of this file (K, L, N and P findings).

| # | Sev | Disposition |
|---|---|---|
| **J1** | blocker | **Closed.** Independently checked 2026-10-01 by the mechanical closing check the owner chose (Sonnet, at `62e41cc`, every item with a stated expected output): all nine items passed, including the V3-V9 plants matched against the reviewer's own examples and every earlier round's plants re-run, with no deviation; results appended at the end of this file. Four adversarial rounds (S, T, U, V) preceded it. What is checked and what is not is stated in `tools/check_schema_citations.py`, `tools/check_citations.py`, `new-app/db/test/money-convention.test.ts`, `new-app/db/test/reference-keys.test.ts` and `new-app/db/test/schema-objects.test.ts`; `docs/RULES.md` 21.8 and 21.9. V3-V9, V11, V12, V13 fixed: `tools/check_schema_citations.py` reads `git ls-files -z` (V6), allows `@` in a file name (V5), checks schema-qualified calls and `public.` names in any case (V3, V4), counts every file in a skipped tree (V7), and no longer prints "every cited path" (V11); its exemption date and `docs/ARCHITECTURE.md`'s are corrected (V12); `tools/check_citations.py` no longer says "every one with no skip" (V13); `new-app/db/test/money-convention.test.ts` resolves domain chains with no depth cap (V8); `new-app/db/test/reference-keys.test.ts` counts a key only if its triggers fire in a normal session (V9). Stated limits accepted by the owner and written into the docstrings: V1 (settings named in quoted text), V2 (`$`, non-ASCII and quoted identifiers), V3's spaced call, V10 (composite, range and materialised-view money), V14 (a leading slash is dropped). Plants: 14 for this round with controls; all earlier rounds re-run; all caught. The fourth re-review (2026-10-01) had found, all minor and each planted: misses within the stated scope V1-V6 and overclaims V7, V8, V9, V11, V12; candidate stated limits V3 (spaced call), V10, V14 await the owner; V13 noted outside the enumerated statements.** Before that: U1-U9 and U14 fixed 2026-10-01: domains resolved to any depth in `new-app/db/test/money-convention.test.ts` (U7, three plants including a four-level chain); a key whose triggers are disabled is no key in `new-app/db/test/reference-keys.test.ts` (U8); in `tools/check_schema_citations.py`, block comments stripped before reading settings (U1), paths with a leading slash, Next.js route folders and `~ + $` (U2), any underscore shape (U3), `public.fn()` (U4), `public.` limited to relations, functions and types (U5), skipped extensions counted in the banner (U6), sequences, types and schemas loaded (U9); `new-app/db/test/schema-objects.test.ts` docstring narrowed (U14). Plants: 3 for U7, 2 for U8, 13 for U1-U6 with controls, 1 for U9; the previous two rounds' 23 re-run — all caught. The third re-review (2026-10-01) had found the closing standard not yet met: U7 (major — a money column behind a three-level domain escapes the closed list); misses within the stated scope U1-U5 and overclaims U6, U9, U14 (minor); U8 (minor). Each planted; none hides a defect in the repository today.** Before that, the author claimed the owner's closing standard (2026-10-01) met: every form T1 and T2 showed is checked (calls `name()` against the migrations' functions and PostgreSQL's built-ins, dotted settings, `public.name`, a column checked against ITS table, any-case identifiers, `#anchor`, `:L12`, `:12:5`, upper-case extensions); T3 (`original-app/` and `.claude/` counted in the banner), T4 (two false exemption reasons, and ADR 0012's false "exists" corrected), T12 (a new-app citation no longer resolves through original-app; it found two, `mobile/`, now exempted as planned); and T9 — the tool's docstring, `.github/workflows/verify.yml` and Rule 21.8 now state exactly the forms checked and list those that are not. Plants: 13 for this round, and the previous round's 10 re-run, all caught. It closes when a review finds no overclaim and no miss within that stated scope. Before that: T7 fixed 2026-10-01 (owner's decision): `new-app/db/test/money-convention.test.ts` now holds a CLOSED list of every non-bigint numeric column with its reason, over every user schema, so a 32-bit money column fails whatever it is called; the reviewer's six T7 plants, a BIGINT[] amount and a stale entry all go red. T5, T6 and T8 fixed the same day: the object list and the reference-key test cover every user schema and every relation and type kind, a composite key counts only if no companion column is nullable (or it is MATCH FULL), and a NOT_A_REFERENCE entry must match a real column — each reviewer plant now red. T1-T4, T9, T12 remain.** The second batched re-review (2026-10-01) had found it not closable: T1 and T7 (major) — function citations written `name()`, every real setting, and a real table cited with another table's column pass silently; the money rule is a word list that `fees_jmd` and `gct_jmd` INTEGER pass; T2, T3, T4, T5, T6, T8, T9, T12 (minor).** The catalogue replacement held for what it reads. Previously: S2-S6 fixed 2026-10-01, the owner choosing replacement over a third patch (Rule 21.9): `tools/check_schema_citations.py` no longer parses SQL — it resolves against `new-app/db/schema-objects.json`, generated from the catalogue and held fresh by `new-app/db/test/schema-objects.test.ts` (S3, S4); "every row reference has a key" moved to `new-app/db/test/reference-keys.test.ts`, which reads the catalogue (S4); bare `.sh` paths, `:line` suffixes, directories and paths leaving the repository are checked (S2), with 16 named exemptions printed; the banner lists the 8 evidence documents not scanned and their citation counts (S5); `new-app/db/test/money-convention.test.ts` counts `_minor_units` and requires a money suffix on any numeric column naming an amount (S6). Plants, each restored with diff -q: the reviewer's six DDL forms plus a non-uuid `*_id` (all red in reference-keys), ten on the tool and the two catalogue tests, three on the money test. Rule 21.9 restated and `new-app/CLAUDE.md` tells a migration author to regenerate the list. The batched re-review had found the fix incomplete: S4 and S6 (major) — the key/column tracker misses ordinary DDL forms, and the money test misses `…_minor_units`; S2, S3, S5 (minor) — phantom paths outside the repo, `.sh`, `:line` or a directory pass silently, a dropped index still resolves, and the banner omits the evidence documents it skips.** What did hold, by its plants: the phrase window is gone, arrays, domains, `_cents` and the declared-type ceiling. Previously: R11, R3 and R12 fixed with the owner's decisions of 2026-09-30. R11: the phrase window is removed from `tools/check_schema_citations.py` and `tools/check_citations.py`; deliberate citations of absent things are exempted by file and name, printed every run, and an unused exemption fails; removing the window exposed a real near miss in `docs/PRD.md` R1.24b, corrected. The old tool's path check and migration text check are retired (one guard per class); `docs/RULES.md` 21.8 and 21.9 restated and `.github/workflows/verify.yml` comments corrected. R3: column type read as its first word, foreign keys tracked by constraint name in file order with every column of a composite key, non-UUID `*_id` columns printed by name. R12: `new-app/db/test/money-convention.test.ts` reads array element types and domain bases, counts `_cents` as an amount, and stores the ceiling through every real amount column's declared type. Plants, each restored with diff -q: 7 on the schema tool (the finding's two, a stale exemption, a dropped composite key, each half of the R3 fix removed on its own), 4 on the old tool, 6 on the money test (the finding's three, an amount narrowed to INTEGER, a BIGINT[] amount, a scalar control). Lesson in `docs/MISTAKES.md` M38. Not changed, by Rule 6: the documents-core migration's sentence "no floating-point type appears in this file" is wider than the test, which reads the final schema's columns, not that file's function bodies. Re-review found the fix incomplete: R11 (the new tool silently skips citations near phrases such as "rather than" while printing "0 citations skipped") and R3 (every NOT NULL `*_id` column is skipped); R12 minor. Previously: `becd1dd`: `tools/check_schema_citations.py` replaced the blind spot in `tools/check_citations.py` (no silent skip; identifiers against parsed DDL), and `new-app/db/test/money-convention.test.ts` now exists, asserting the money types across `20260925120000_documents_core` and every later migration. Plants recorded in MISTAKES M20 and M21 |
| **J2** | blocker | **Closed.** `683a638`, migration `20260926130000_ceiling_enforced_by_trigger`: every insert on `invoice`, `invoice_void`, `credit_note` and `variation` fires `issue_balance_apply()`, so the ceiling in `20260925120000_documents_core` is enforced for any caller that does not set the balance-write flag itself; the flag is not a secret, so a caller that sets it can write `issue_balance` directly (R5, stated in the ADR); the write policies in `new-app/db/policies/002-documents-isolation.sql` unchanged; executed in `new-app/db/test/documents-core.test.ts` (J2 block); ADR `0025-five-invariants-move-from-prose-to-code.md` decision 2 amended 2026-09-27 to the real mechanism and corrected for R5 and R7 the same day. **Independently checked:** the re-review of the seven (2026-09-27) removed each of the four triggers and watched its tests go red (18, 2, 2 and 1), and judged it closable on the mechanism |
| **J3** | blocker | **Closed.** Independently checked 2026-10-01 by a mechanical closing check (Sonnet, at `3ceef3f`): R17's plant matched the finding and the test went red without the ROW_COUNT check and green with it; R1/Q4, R2, R16 and R4 had been independently checked by the batched re-review; the five relations of S1 confirmed by `prisma migrate diff`. Covered by migrations `20260926180000_tenant_composite_keys` and `20260927150000_keys_cannot_rewrite_history`, `new-app/db/schema.prisma`, `new-app/db/policies/002-documents-isolation.sql` (unchanged), `new-app/db/test/documents-core.test.ts`, `db/test/tenant-isolation.test.ts`, `new-app/db/test/reference-keys.test.ts`, and `docs/RULES.md` Rule 4.1. R17 fixed 2026-10-01: a test in `new-app/db/test/documents-core.test.ts` suppresses the balance UPDATE with a trigger on a recompute whose figures would read back unchanged, so only the ROW_COUNT check in `issue_balance_apply()` (migration `20260927120000_lock_isolation_and_tenancy`) can refuse it; with that check removed — the reviewer's own plant — the test goes red. R1/Q4, R2, R16 and R4 independently checked and holding in the database (batched re-review, 2026-10-01). S1 fixed 2026-10-01: the five relations now say `onDelete: Restrict`, and `prisma migrate diff` from a freshly migrated PostgreSQL 16 database to `new-app/db/schema.prisma` now reports no foreign-key change at all (with the old schema it regenerated exactly the five cascades). Not closed until then on S1: five `new-app/db/schema.prisma` relations still say `onDelete: Cascade` against RESTRICT keys, so the claim that Prisma cannot regenerate a cascade holds for ON UPDATE only; R17 (no red test for the ROW_COUNT check) still open.** Migration `20260927150000_keys_cannot_rewrite_history` turns all 49 ON UPDATE CASCADE keys into ON UPDATE RESTRICT and asserts none remains (R1, R2), and gives the seven unkeyed references composite tenant keys (R16); `new-app/db/schema.prisma` states `onUpdate: Restrict` on every relation so Prisma cannot regenerate the cascade. Tested in the R block of `new-app/db/test/documents-core.test.ts`; each of the eight rules was planted out and its own test went red. The re-review of the seven had found Q4 confirmed (R1: ON UPDATE CASCADE rewrites sealed rows) and a cross-tenant write through a key J3 kept single-column (R2); the composite keys themselves held on every probe. Previously: `065154e`, migration `20260926180000_tenant_composite_keys`: composite tenant foreign keys on all parent-child relations of `20260925120000_documents_core` and `20260926120000_rejected_seals`, tenant-scoped unique indexes, policies in `new-app/db/policies/002-documents-isolation.sql` unchanged; behaviour and structure tested in `new-app/db/test/documents-core.test.ts` and `db/test/tenant-isolation.test.ts`; `docs/RULES.md` Rule 4.1 added. The fourth J4 re-review saw foreign-id writes refused with 23503 in passing. **For J3's re-review (Q4):** the composite keys use ON UPDATE CASCADE, so `UPDATE quote SET id = …` rewrites a sealed issue's `quote_id` — an UPDATE path on a document said to have none |
| **J4** | blocker | **Closed.** Agreed scope can be reduced after it is invoiced: credit notes net into the invoiced figure, so the remedy is credit-then-reduce in one transaction, and a wrong document is withdrawn once nothing is billed (owner's decisions 2026-09-26/27, `docs/design/scope-reduction.md`). This corrects what `20260925120000_documents_core` ("may be negative" with no path) and `20260926110000_withdrawal_preconditions` (a credit note that moved nothing) got wrong, through migrations `20260926200000` to `20260927140000`; tested in `new-app/db/test/documents-core.test.ts` (J4, K4, H4 blocks), `no-stuck-state.test.ts` (a seeded walk with its own oracle) and `concurrency.pg.test.ts` (15 races on real PostgreSQL, in CI); `docs/PRD.md` R1.15b, R1.22a, R1.22c, R1.24, R1.25 amended. Commits `06e9b73` to `422d9e8`. **Independently checked:** five Opus re-reviews (K, L, N, P, Q — their findings all answered), then two Sonnet closing checks: every plant failed exactly its named race and the gate matched; the one item not passed was the brief's own list omitting a register, as the checker read and stated. Closed on that evidence with the owner's acceptance, 2026-09-27 |
| **J5** | blocker | **Closed.** `683a638`: grade 5 retired in `docs/design/acceptance-evidence.md` (number tombstoned) so the ladder's third-party principle holds; `docs/PRD.md` R1.20c, `docs/adr/0024-acceptance-evidence.md` and `docs/design/domain-model.md` agree. **Independently checked:** the re-review of the seven found the four documents consistent and judged it closable once "six grades" was corrected (R14) — corrected 2026-09-27 in `docs/PRD.md` R1.20, `docs/design/README.md`, `docs/TIERS.md` and `docs/THREAT-MODEL.md`. R15 (grades 2 and 3 have no third party either) is PLAUSIBLE only and goes to the owner with J6 |
| **J6** | blocker | **Fixed, re-review owed.** Second re-review answered by `new-app/db/migrations/20260927200000_rereview2_fixes/migration.sql` and the documents (each fix planted, the reviewer's own plants for X4 and X5 included, restored with `diff -q` identical): X5: the lock-order guard strips comments before comparing. X7: `new-app/CLAUDE.md` says four shapes. X8: the evidence rules' unreachable unnumbered case removed. Built before: Re-review findings answered by `new-app/db/migrations/20260927190000_rereview_fixes/migration.sql` (owner's decisions 2026-10-01; each fix planted and caught, restored with `diff -q` identical). W1: the evidence rules refuse an acceptance they cannot see (a tenant cleared by `RETURNING set_config` no longer skips them; executed test). W2: the withdrawal deadlock is documented as the fourth shape in `new-app/CLAUDE.md` — a withdrawal runs alone in its transaction — and executed in `new-app/db/test/concurrency.pg.test.ts`. W4: a superseded issue has no grade and takes no evidence, and a client responds only to a numbered, current issue. W10: lock order held by `new-app/db/test/trigger-rules.test.ts`. Built before: `acceptance_grade()` is the highest grade among the kinds of evidence on the accepted acceptance; evidence attaches to nothing else; every acceptance has its first evidence row at COMMIT (migration `20260927180000_acceptance_grade`; `docs/design/acceptance-evidence.md`, `docs/PRD.md` R1.20f and `docs/design/domain-model.md` point at it). **Not done:** who may write the third-party kinds — R5's privilege model (J14) |
| **J7** | blocker | **Fixed, re-review owed.** Second re-review answered by `new-app/db/migrations/20260927200000_rereview2_fixes/migration.sql` and the documents (each fix planted, the reviewer's own plants for X4 and X5 included, restored with `diff -q` identical): X2: `docs/design/acceptance-evidence.md` §9 says once per tenant. X3: it now says the database would take a release-1 'inbound_reply' and grade it 4; only the writer prevents it. X6: an id may not begin or end with any whitespace. Built before: Re-review findings answered by `new-app/db/migrations/20260927190000_rereview_fixes/migration.sql` (owner's decisions 2026-10-01; each fix planted and caught, restored with `diff -q` identical). W7: the key is per tenant, `acceptance_evidence_tenant_source_external_id_key` (D4 reversed), pinned by a catalogue test; the J3 global-index exemption removed. W5: only the third-party kinds may carry a provider id. W6: the source is a fixed list, the id non-empty and unpadded. W9: "release-1 quotes never earn grade 4" restated as a consequence, not a rule, in `docs/PRD.md` R1.20h and `docs/design/acceptance-evidence.md` §9. Built before: one row per provider event (the M18 lesson of `new-app/db/migrations/20260926100000_variation_idempotency/migration.sql`, `docs/MISTAKES.md`); the reply-address preparation corrected, not built (D5) |
| **J8** | blocker | **Fixed, re-review owed.** Second re-review answered by `new-app/db/migrations/20260927200000_rereview2_fixes/migration.sql` and the documents (each fix planted, the reviewer's own plants for X4 and X5 included, restored with `diff -q` identical): X9: "the application states the bar it showed" is now marked owed, not built — no application seal exists. Built before: Re-review findings answered by `new-app/db/migrations/20260927190000_rereview_fixes/migration.sql` (owner's decisions 2026-10-01; each fix planted and caught, restored with `diff -q` identical). W3: `docs/design/acceptance-evidence.md` §4.4 and §7 now say what D6 decided and the build does (the ceiling ignores the grade; below-bar acceptance is recorded, not refused). W8: the bar column needs an empty database, and the owner confirmed no deployed or shared database holds a sealed quote. W11: the two exemptions that keep `version` are held by a test. W12: `docs/design/domain-model.md` §6.1 names the frozen bar; the policy comment corrected. S1, S2: a seal stating a stale bar is refused; that the application's seal states it is owed (X9). Built before: the bar is resolved by the database at seal from the quote, `document_settings` or 3, and never moves (migration `20260925120000_documents_core` untouched; Rule 6 in `docs/RULES.md`); `acceptance_meets_bar()`. **Not done:** the rest of `document_settings` |
| **J9** | blocker | **Closed.** Independently checked 2026-10-01 by a mechanical closing check (Sonnet, at `3ceef3f`): the two corrected rows and this row's scope statement read as required; R9 had been independently checked by the batched re-review. R10 and R18 answered 2026-10-01: `docs/design/domain-model.md`'s `document_render` row and ADR `0024-acceptance-evidence.md`'s integrity row now say the render points at its issue and an acceptance at its own issue's render, which makes the J9 migration's "amended to say so" true (R10). R18: this row's "guarded by `tools/check_schema_citations.py`" below covers the COLUMN half — every uuid `*_id` reference has a key, now asserted from the catalogue by `new-app/db/test/reference-keys.test.ts` — and NOT the prose half: a table named in a document that no migration creates is a stated limit of the tool (design documents name planned tables), accepted with J1's closing on 2026-10-01. R9 fixed and independently checked (batched re-review, 2026-10-01). Migration `20260927150000_keys_cannot_rewrite_history`: `acceptance.document_render_id` is NOT NULL and keyed on `(document_render_id, issue_id, tenant_id)`, so an acceptance records the render of its own issue (owner's decision, 2026-09-30); both halves planted out and seen red in the R block of `new-app/db/test/documents-core.test.ts`. The same migration fixes R4 (the application cannot delete a tenant; the audit trail's tenant key is ON DELETE RESTRICT). The re-review of the seven had found an acceptance could bind the render of a different issue, or none (R9, blocker; reproduced by the author). Previously: `becd1dd`, migration `20260926150000_document_render`: the table exists and `acceptance.document_render_id` has a foreign key, correcting `20260925120000_documents_core`; `new-app/db/schema.prisma`, `docs/PRD.md`, `docs/design/acceptance-evidence.md` and `docs/adr/0024-acceptance-evidence.md` agree; guarded by `tools/check_schema_citations.py` |
| **J10** | blocker | **Closed.** Reopened by K6 after `683a638` (migration `20260926140000_one_live_ceiling_per_quote`): its `LIMIT 1` guard was defeated by three revisions (K6), then by concurrency (N4) and by isolation level (P1). Fixed by `20260927100000_withdrawal_with_variations` (judge the live revision), `20260927110000_one_lock_per_quote` (a per-quote lock) and `20260927120000_lock_isolation_and_tenancy` (READ COMMITTED enforced), over `20260925120000_documents_core` and `20260926110000_withdrawal_preconditions`; tested in `new-app/db/test/documents-core.test.ts` (J10 block), `no-stuck-state.test.ts` (one live ceiling per quote, on the database's own ceilings) and `concurrency.pg.test.ts` (N4 a, b, c on real PostgreSQL, in CI); `docs/design/domain-model.md` and `docs/PRD.md` R1.15 and R1.22c amended; `docs/PRD-REVIEW-3.md` H5's row is history and left as written. **Independently checked:** the fifth re-review (2026-09-27) judged it closable — N4's three races pass and their plants are caught, P1 is refused on every path, and unscheduled stress found no quote with two live ceilings |
| **J11** | major | **Fixed, re-review owed.** Second re-review answered by `new-app/db/migrations/20260927200000_rereview2_fixes/migration.sql` and the documents (each fix planted, the reviewer's own plants for X4 and X5 included, restored with `diff -q` identical): X1: a role that bypasses row security may delete a sealed issue and its lines in one transaction again (the W13 refusal now applies only where a row can be hidden by its writer); executed test. X4: the guard matches every unconditional skip the reviewer used, comments stripped. Built before: Re-review findings answered by `new-app/db/migrations/20260927190000_rereview_fixes/migration.sql` (owner's decisions 2026-10-01; each fix planted and caught, restored with `diff -q` identical). W13: the subtotal check refuses an issue it cannot see at COMMIT, so clearing the tenant before COMMIT no longer skips it — executed test, guarded by `new-app/db/test/trigger-rules.test.ts`, recorded as M40. Built before (`1c97cbf`, migration `20260927170000_issue_lines_add_up`): each line's total is quantity × unit price, half away from zero, exact; the subtotal is the sum of the lines at COMMIT; tested in the J11 block of `new-app/db/test/documents-core.test.ts`. The defect was in `new-app/db/migrations/20260925120000_documents_core/migration.sql` (`new-app/db/schema.prisma` mirrors it; `docs/design/domain-model.md` §6.2a corrected). **Not done:** tax, owed with the GCT rules |
| **J12** | major | **Closed.** Independently checked 2026-10-01 by the mechanical closing check (Sonnet, at `62e41cc`): V15-V18 confirmed by reading, and the writer-set sweep returned exactly the 15 expected lines, each a history note, Rule 21.10's own text, ADR 0025's decision of its day, or unrelated. Rule 21.10 in `docs/RULES.md` governs the class; `docs/design/domain-model.md` §6.2a points at ADR `0025-five-invariants-move-from-prose-to-code.md` decision 2 and the J12 block of `new-app/db/test/documents-core.test.ts`. Before that, V15-V18 fixed 2026-10-01: ADR 0025 says row security enforces that a write carries the flag, not a writer set (V15), and that the ISSUE is immutable, not the column (V16); the `new-app/db/test/documents-core.test.ts` title and comment now say what they execute (V16, V18); `docs/PRD.md` R1.24a states the acceptance path MUST open the row and cites N2 (V17); `docs/design/domain-model.md` says at most one row per issue, not per accepted issue (V18). The fourth re-review (2026-10-01) had found twins the last fix left: V15 (ADR 0025 "what enforces the writer set is row security"), V16 (major, "an immutable copy" in a test title and ADR 0025), V17 (PRD R1.24a's indicative "is created in the same transaction"), V18 ("no acceptance means no balance row").** Before that: U10-U13 fixed 2026-10-01: in `new-app/db/test/documents-core.test.ts` the "exactly one writer" describe, the "only the function sets" comment, the "somebody may forget" title and a fourth ("stays written-once", found by the sweep) now say what the tests execute; `docs/PRD.md` R1.24a ("unconditionally"), R1.15c ("written-once") and R1.24b (the ceiling reads the cached accepted total); ADR `0025-five-invariants-move-from-prose-to-code.md` decision 2's "the writer set is enforced" and its heading, and `docs/adr/README.md`'s line. Before that, the third re-review (2026-10-01) found more sentences of Rule 21.10's kind, false by execution: three in `new-app/db/test/documents-core.test.ts` (U10, major), PRD R1.24a and R1.15c (U11, major), ADR 0025's "the decision stands" (U12) and R1.24b's "rather than trusting the cached figure" (U13).** Before that: T10 fixed 2026-10-01: all six sentences now say what is true or point at ADR 0025 decision 2 — `docs/PRD.md` R1.24b's first sentence, `new-app/db/test/row-convention.test.ts`, the `new-app/db/schema.prisma` totals comment, `new-app/db/test/policy-parity.test.ts` (which now states it does NOT check who sets the flag), ADR 0025's three un-built bullets marked as the decision of their day, and its misquote's tense — and a seventh found by the same sweep (ADR 0025 decision 1, "the function every writer calls"). Recorded and not edited, by Rule 6: `new-app/db/policies/002-documents-isolation.sql`, which policy-parity ties to a committed migration. Before that: the second batched re-review (2026-10-01) found six more sentences of Rule 21.10's kind (T10), four false by execution: PRD R1.24b's first sentence, `new-app/db/test/row-convention.test.ts`, a `new-app/db/schema.prisma` comment, `new-app/db/test/policy-parity.test.ts`, and ADR 0025's un-retracted bullets and its misquote. The eight sentences changed were clean.** Previously: S7 fixed 2026-10-01: the four sentences replaced by pointers to ADR 0025 decision 2 and the J12 test block, and four more of the same kind found by a sweep and fixed (`docs/PRD.md` R1.22b, ADR 0025's own "only", a `new-app/db/schema.prisma` field comment, and a test title). The batched re-review had found four sentences of the kind Rule 21.10 forbids still outside committed migrations (S7): `new-app/db/schema.prisma` on `issue_balance`, `docs/adr/README.md`'s ADR 0025 line, `docs/PRD.md` R1.24b, and the §6.3 "impossible transitions" list in `docs/design/domain-model.md`. The §6.2a deletion held.** Previously: R13 fixed with the owner's decisions of 2026-10-01: in `docs/design/domain-model.md` §6.2a the prose writer set is deleted (both paragraphs, "nothing else ever writes it", and the false "created unconditionally" opening), and the section points at ADR `0025-five-invariants-move-from-prose-to-code.md` decision 2 for the mechanism and its limits (R5, R7) and at the J12 block of `new-app/db/test/documents-core.test.ts` for what each insert moves; `docs/PRD-REVIEW-3.md` H2 row corrected for J4. `docs/RULES.md` Rule 21.10 added (a writer-set sentence cites its test or does not exist; no phrase guard, by the owner's decision). The R5 defect itself is recorded as owed in `docs/THREAT-MODEL.md` §4e, not fixed here. Lesson in `docs/MISTAKES.md` M39. Not changed, by Rule 6: the documents-core migration's comment that the writer set "cannot go stale" is false for the same reason. No code changed. The re-review of the seven had found J12's own fix put the writer set back into prose, false by execution (R13); the J12 test block itself is sound. Previously: `51a58c9`: the prose writer list removed from `docs/design/domain-model.md` rather than corrected a third time; which insert moves which column executed in the J12 block, over `20260925120000_documents_core`; `docs/PRD-REVIEW-3.md` H2 corrected. MISTAKES M23 |
| **J13** | major | **Closed.** Independently checked by the third re-review (2026-10-01): following `new-app/CLAUDE.md`'s rule, S9's deadlock shapes A and D ran 6 of 6 clean on PostgreSQL 16 against 4 of 4 deadlocks for the controls, and the function bodies admit no cycle through a response-alone transaction; the earlier rounds had verified the migration `20260927160000_acceptance_responses`, its tests in `new-app/db/test/documents-core.test.ts`, `new-app/db/test/concurrency.pg.test.ts` and `new-app/db/test/no-stuck-state.test.ts`, and `docs/design/domain-model.md` §6.2 and §8, by race and plant. Design `docs/design/acceptance-responses.md`; `docs/PRD.md` R1.20. The one-row-per-issue key it replaced was created in `20260925120000_documents_core`. Changed AFTER the review, and so not independently checked: `docs/design/acceptance-evidence.md` §4.2's "One `acceptance` per issue" now reads one ACCEPTED row per issue, declines kept — the ambiguity S8 found in the domain model, found again when this row was closed. Before that: T11 fixed 2026-10-01: `new-app/CLAUDE.md` now says a client response is alone in its transaction, with no other money write on the same quote beside it, and to retry on 40P01 otherwise. Owes a mechanical closing check only. The second batched re-review (2026-10-01) had confirmed §6.2 and §8 by execution, but found the rule "one client response per transaction" did not prevent S9's shape D, which deadlocked 2 of 2 (T11). The first batched re-review (2026-10-01) found the fix holds for every part claimed, by race and plant. Its two documentation findings were fixed the same day — S8 in `docs/design/domain-model.md` §6.2 and §8, S9 as a third deadlock shape in `new-app/CLAUDE.md` (the J13 migration's comment saying "the two lists" is committed and stays, by Rule 6) — and owe only a mechanical closing check. The findings were: S8 (`docs/design/domain-model.md` §8 says a second response is refused) and S9 (the deadlock list in `new-app/CLAUDE.md` misses two pre-existing response shapes). Built to `docs/design/acceptance-responses.md` (option C plus A, owner 2026-09-27; per-issue lock, owner 2026-10-01). Migration `20260927160000_acceptance_responses`: the one-row-per-issue key becomes a partial unique index on accepted rows (declines unlimited, one acceptance ever); a trigger refuses a decline after an acceptance under a per-issue lock taken after the quote lock; only an accepted row can be withdrawn; `quote_issue_state()` gains `withdrawn` and an acceptance outranks an earlier decline. `new-app/db/schema.prisma` models responses as a list and says why the partial key is migration-only. Tests: the J13 block of `new-app/db/test/documents-core.test.ts` (7), the reversed "issued again" test now expects `withdrawn`, two races in `new-app/db/test/concurrency.pg.test.ts`, and `new-app/db/test/no-stuck-state.test.ts` now numbers every issue, adds declines, and judges every response and every state with its own oracle. Seven plants, each restored with diff -q. `docs/PRD.md` R1.20 and `docs/design/domain-model.md` §6.3 updated. Found and NOT fixed: a response is taken on a superseded or unnumbered issue (true before J13; recorded in the design §3a for the owner). Previously: a withdrawn issue read "issued" and could never be re-accepted; since K4 and L1 made withdrawal the wrong-document remedy, this was the common path (N3) |
| **J14** | major | **Open — deferred by the owner (2026-10-01) to the privilege-model work scheduled for R5, and recorded as a launch blocker in `docs/THREAT-MODEL.md` §4f.** A session-flag policy was rejected because the application can set the flag itself (R5). Not started |
| **J15** | minor | **Closed.** Migration `20260926220000_withdrawal_after_full_credit` (`8e8236a`) replaced the guard in `20260926110000_withdrawal_preconditions`: a voided or fully credited invoice no longer blocks withdrawal; `20260927100000_withdrawal_with_variations` kept it. Tested in `new-app/db/test/documents-core.test.ts` ("J15 · allows withdrawal once the invoice is voided"), which goes red when the guard is reverted. Independently checked: the third re-review (N) and the fourth (P) both found nothing against it, the fourth re-running the revert |
| **J16** | minor | **Closed.** `9115d8f`, migration `20260926170000_rejected_seal_no_delete`: `rejected_seal` from `20260926120000_rejected_seals` loses its DELETE path and its facts are frozen; executed in `new-app/db/test/documents-core.test.ts`. **Independently checked:** the re-review of the seven turned the policy to FOR ALL (DELETE test and policy-parity red) and dropped the trigger (both rewrite tests red). Its migration's comment that a later column "fails closed" is false — it fails open (R8); the comment cannot be edited (Rule 6) and is corrected here |

---

## J1 · `check_citations.py` cannot see any citation written relative to `new-app/`, and a phantom test file is sitting in that blind spot right now — severity: blocker

**Where:** `tools/check_citations.py`, `new-app/db/migrations/20260925120000_documents_core/migration.sql`

**The claim under attack.** Two claims, in the same breath. The tool's own output:

```
$ python tools/check_citations.py
scanned 150 tracked files
Every cited path, filename and symbol resolves.
```

and Rule 21.8, which rests on it: "`tools/check_citations.py` checks every backticked path, filename
and \"`symbol` in file\" reference in tracked Markdown and source, and it gates in CI."

**Why it does not hold.** `migration.sql:36` says, in the present tense:

> No floating-point type appears in this file, and `db/test/money-convention.test.ts` asserts it.

There is no such file:

```
$ ls /c/dev/JamQuote/new-app/db/test/
documents-core.test.ts  harness.ts  policy-parity.test.ts
row-convention.test.ts  schema-migration-parity.test.ts  tenant-isolation.test.ts

$ grep -rn "money-convention" C:\dev\JamQuote
new-app/db/migrations/20260925120000_documents_core/migration.sql:36
```

One reference in the whole repository, and it is the sentence claiming the guard exists. **This is
the M14 class for the fourth time**, and by Rule 24.4 that means the mechanism written for it is
decorative, not that somebody was careless again.

The reason the checker missed it is mechanical and is the more serious half of this finding.
`check_citations.py:196`:

```python
if cited.split("/", 1)[0] not in top_level:
    continue  # relative to a different root; see `scannable`
```

`top_level` is the set of first path segments of tracked files. For this repository that is
`.claude .github docs new-app original-app tools` plus root files. The cited path is
`db/test/money-convention.test.ts`, whose first segment is `db` — **not a top-level segment**, so the
citation is skipped before the `(Path(path).parent / cited).exists()` fallback on the next line is
ever reached.

`db/…` is not an unusual form here; it is the *house style* for the entire database workspace. There
are 19 such citations and every one of them is unchecked:

```
$ grep -rno '`db/[a-z0-9/_.-]*`' new-app/db/ docs/
new-app/db/migrations/20260923150000_init_tenant_isolation/migration.sql:70,117
new-app/db/migrations/20260925120000_documents_core/migration.sql:25,36,630,631,644,800
new-app/db/migrations/20260926120000_rejected_seals/migration.sql:137
new-app/db/policies/001-tenant-isolation.sql:13,60
new-app/db/policies/002-documents-isolation.sql:8,164
new-app/db/schema.prisma:453
new-app/db/test/harness.ts:41 · row-convention.test.ts:41 · tenant-isolation.test.ts:220
new-app/db/test-support/index.ts:6,28 · docs/adr/0012-new-app-structure.md:95
```

So the guard's coverage claim is inverted where it matters most: the workspace that contains all the
money, all the RLS policy text and all the immutability guarantees is the one workspace whose
internal citations it does not read. Rule 21.1 says a control's stated scope is quoted from what the
tool reports; here what it reports — "Every cited path … resolves" — is wrong by 19 paths, one of
which is a live phantom.

**What it would cost if built as written.** Precisely what M14 cost, with interest. A reader — human
or Claude, at 2am, deciding whether a money change is safe — reads "`money-convention.test.ts`
asserts it", a file which does not exist, and stops looking. There is no assertion that every money column is `BIGINT`. The next
person to add a `NUMERIC` or `DOUBLE PRECISION` amount column will not be stopped by anything, and
the migration will still carry a sentence saying they were. Worse: the phantom is inside the one
guard the project built specifically so this could not happen again, and it passed CI green, which is
the exact "gap hidden behind a green tick" Rule 21 opens by forbidding.

**Suggested resolution.**
1. Fix the checker so a cited path is resolved against the **nearest enclosing workspace root**
   (`new-app/db/`, `new-app/api/`, …) as well as the repository root, before the `top_level` bail-out
   — i.e. move the `(Path(path).parent / cited).exists()` fallback and a walk-up-to-package.json
   attempt *above* the `top_level` skip, not below it.
2. Re-run it and expect it to fire on `money-convention.test.ts` (Rule 21.2 — the fix ships having
   fired once, on purpose, on this real positive rather than a planted one).
3. Either write `db/test/money-convention.test.ts` or delete the claim. Writing it is cheap and the
   claim is worth having: assert no `REAL|DOUBLE|NUMERIC|DECIMAL|FLOAT|MONEY` type appears in any
   migration, and that every `*_minor` and `*_thousandths` column is `BIGINT`.
4. Restate the tool's success line to name what it skipped, per Rule 21.1 — e.g. "N citations
   unresolvable against a known root, listed below" rather than silence.

---

## J2 · Nothing stops an invoice being inserted without `issue_balance_apply()`. The ceiling is not enforced by the database at all, and three places claim it is — severity: blocker

**Where:** `new-app/db/migrations/20260925120000_documents_core/migration.sql`, `new-app/db/policies/002-documents-isolation.sql`, `new-app/db/test/documents-core.test.ts`, `docs/adr/0025-five-invariants-move-from-prose-to-code.md`

**The claim under attack.** Stated three times, in three files, in three wordings.

`migration.sql:27`, in the "what this does not do" block, i.e. in the place reserved for honest limits:

> A repository that forgets to call `issue_balance_apply()` **cannot insert an invoice** — that is the
> point — but one that computes the wrong line total will still be wrong.

`migration.sql:578` (inside `issue_balance_apply`, beside the RAISE):

> Raising here rolls the whole transaction back, including the invoice that caused it. That is the
> refusal: **an invoice cannot exist without passing through this function.**

`documents-core.test.ts:22`:

> A repository that never calls `issue_balance_apply` cannot insert an invoice — **the policies see
> to that**.

**Why it does not hold.** The policies do not see to that. This is `invoice`'s entire policy set, quoted
from `002-documents-isolation.sql`:

```sql
ALTER TABLE "invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY invoice_read ON "invoice" FOR SELECT
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY invoice_append ON "invoice" FOR INSERT
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

The only precondition on inserting an invoice is that its `tenant_id` matches the session's tenant.
There is **no** trigger on `invoice`, no `CHECK` referencing the ceiling, and no requirement that
`pryvis.balance_write` or any other flag be set. Verified mechanically:

```
$ grep -n "TRIGGER" new-app/db/migrations/*/migration.sql
20260926110000_withdrawal_preconditions/migration.sql:83:  CREATE FUNCTION acceptance_withdrawal_guard() RETURNS TRIGGER
20260926110000_withdrawal_preconditions/migration.sql:114: CREATE TRIGGER acceptance_withdrawal_preconditions
```

One trigger in the whole Documents core, and it is on `acceptance_withdrawal`. `issue_balance_apply`
is called from nowhere inside the database:

```
$ grep -n "issue_balance_apply" new-app/db/migrations/*/migration.sql
...:27  (a comment)   ...:531 (a comment)   ...:541 (its own definition)
...:790 (a comment)   20260926110000_...:48 (a comment)
```

So the contrapositive the comments rely on is backwards. The truth is: **an invoice that *does* go
through `issue_balance_apply` cannot exceed the ceiling.** An invoice that does not go through it is
inserted, committed, and never measured against anything. The invariant's owner is the application's
invoice repository — which is precisely the "invariant stated in prose, enforced by nothing" that
Rule 1.10 lists as worth attacking, restated as a comment inside a migration so that it now reads as
enforced code.

**The test suite cannot catch this, and it is worth naming why.** `documents-core.test.ts:87` defines
the only path by which any test inserts an invoice:

```ts
/** Issues an invoice and applies the balance, as one transaction — the only safe order. */
async function invoice(issueId: string, amount: bigint): Promise<void> {
  await db.exec("BEGIN");
  try {
    await sql(`INSERT INTO invoice (...) VALUES (...)`, [...]);
    await sql(`SELECT issue_balance_apply($1)`, [issueId]);
    await db.exec("COMMIT");
  } catch (error) { await db.exec("ROLLBACK"); throw error; }
}
```

The helper *supplies the call the invariant depends on*. Every test in `describe("1 · the ceiling, in
one expression")` therefore proves that the function refuses — which it does — and proves nothing
about whether the refusal is reachable from outside the function. The missing test is one line:
insert an invoice for more than the accepted total, **do not** call `issue_balance_apply`, and assert
the insert is refused. It would fail today. This is the direct answer to "does any test assert
something that would pass even if the mechanism were removed": the ceiling block's four tests would
all pass with `invoice`'s protection removed entirely, because there is none to remove.

**What it would cost if built as written.** Over-billing, silently, with a migration comment saying it
cannot happen. Every route that creates an invoice must remember one function call, in the right
transaction, in the right order, forever — and the one document a future maintainer would check
(`WHAT THIS MIGRATION DOES NOT DO`, the Rule 21.4 section, the place specifically designated for the
truth about limits) tells them they need not. A single invoice-creation path added later without the
call — a bulk final-invoice job, a "resend as invoice" shortcut, a data fix — raises no error and no
alarm. This is the same *shape* as M18 (`client_reference`): a comment crediting a mechanism that is
not there, guarding money, self-ratifying. M18 was the third occurrence; this is the fourth in the
same schema, so Rule 24.4 applies to the mechanism, not to the author.

**Suggested resolution.** Make the claim true rather than softening it — the claim is the right
design.
1. Add `AFTER INSERT ON "invoice" FOR EACH ROW EXECUTE FUNCTION` a wrapper that calls
   `issue_balance_apply(NEW.issue_id)`. Same for `invoice_void` and `variation`, which have the same
   problem in the other direction (the balance goes stale unless the caller remembers). A
   `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` is the better shape: it fires once at
   commit, so a multi-invoice transaction is measured on its total rather than on insertion order.
2. Then `issue_balance_apply` becomes an internal detail rather than a protocol the application must
   observe, and decision 2's "exactly one writer" gains the property it is described as having.
3. Add the negative test described above, and confirm it goes red before the trigger exists
   (Rule 21.2 / Rule 1.5).
4. Until 1–3 land, **correct all three comments** to say what is actually true: "the ceiling is
   enforced inside `issue_balance_apply`, and every invoice-writing path in the application must call
   it in the inserting transaction; nothing in the database compels that yet."

---

## J3 · No child row is constrained to share its parent's tenant, and referential integrity deliberately bypasses RLS — so one tenant can plant rows into another's documents — severity: blocker

**Where:** `new-app/db/migrations/20260925120000_documents_core/migration.sql`, `new-app/db/policies/002-documents-isolation.sql`, `new-app/db/migrations/20260926120000_rejected_seals/migration.sql`, `new-app/db/test/documents-core.test.ts`, `docs/RULES.md`

**The claim under attack.** `documents-core.test.ts:642`:

> `describe("the tenant boundary still holds over all of it", …)`

and Rule 4: "`tenant_id` on every tenant-owned table, **row-level security** in the database, **and** tenant scoping in the application. Three layers, not one."

**Why it does not hold.** Every foreign key in these migrations is single-column. Quoting the shape, which is identical on all of them:

```sql
ALTER TABLE "acceptance" ADD CONSTRAINT "acceptance_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "quote_issue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

`acceptance.tenant_id` and `quote_issue.tenant_id` are never compared. The RLS policy compares the row's **own** `tenant_id` to the session's, and nothing compares it to its parent's. And the PostgreSQL manual is explicit about the consequence (ddl-rowsecurity): *"Referential integrity checks, such as unique or primary key constraints and foreign key references, always bypass row security."* So the FK resolves happily against a row the inserting session cannot see.

The concrete sequence, using only operations the policies permit:

1. Tenant A obtains the UUID of tenant B's `quote_issue`. Row ids here are **client-generated** (ADR 0019) and travel through sync payloads, PDFs, share links and exports, so this is a leaked identifier rather than a guessed one.
2. A inserts `acceptance (id, tenant_id = A, issue_id = <B's issue>, outcome = 'declined', …)`. The `acceptance_append` policy's `WITH CHECK` passes, because `tenant_id` is A's. The FK passes, bypassing RLS.
3. `CREATE UNIQUE INDEX "acceptance_issue_key" ON "acceptance" ("issue_id")` is now satisfied for that issue. Unique-index enforcement also bypasses row security.
4. **B's client can now never accept that quote.** B's insert fails with a unique violation. B cannot see the offending row (the SELECT policy filters it), cannot update it (no UPDATE policy), and cannot delete it (no DELETE policy — the immutability design working against its owner). Recovery requires a superuser.

The same move works on `quote_issue` itself: A seals `(tenant_id = A, quote_id = <B's quote>, revision = 1)` and permanently consumes a slot in `quote_issue_quote_revision_key`, which is also global. And on `issue_number` via `issue_number_series_number_key`, and on `invoice_void`, `acceptance_withdrawal` and `rejected_seal_line`, each of which has a global unique index or a global parent.

**The test suite tests only the safe direction.** `documents-core.test.ts:651` asserts that inserting a `quote_issue` with `tenant_id = OTHER_TENANT` is refused. It is — by `WITH CHECK`. The dangerous direction, `tenant_id = MY_TENANT` with a **parent belonging to another tenant**, is not tested anywhere in the file. That is the gap: the assertion that exists makes the block look covered.

**This is not only an attack.** The same missing constraint means an ordinary application bug — one repository method that stamps the session tenant onto a row whose parent came from a different query — produces a row that is visible to the wrong tenant, invisible to the right one, and unremovable. Rule 4's third layer (application scoping) is then the only thing holding, which is the single-layer situation Rule 4 was written to forbid.

**A second consequence, same root cause.** `issue_balance_apply` ends with:

```sql
  UPDATE "issue_balance"
     SET "variations_total_minor" = v_variations, …
   WHERE "issue_id" = p_issue_id;
```

`ROW_COUNT` is never checked. When the balance row belongs to another tenant, this UPDATE matches zero rows and the function continues to the ceiling check using values it did not write. The function goes to real trouble to make a missing row an exception rather than a no-op (finding G2) and then leaves the *write* as a silent no-op.

**What it would cost if built as written.** A tenant permanently denied the ability to accept their own quote, with no in-product explanation and no in-product remedy — on the most commercially important action in the product. Plus a class of cross-tenant contamination that Rule 4's CI leak tests will not catch, because they test reads of another tenant's data, not writes into another tenant's graph.

**Suggested resolution.**
1. Make every parent–child foreign key **composite**: add `UNIQUE (id, tenant_id)` to each parent (`quote`, `quote_issue`, `acceptance`, `invoice`, `rejected_seal`, `client`, `quote_section`) and change each child FK to `FOREIGN KEY (parent_id, tenant_id) REFERENCES parent (id, tenant_id)`. The database then makes a cross-tenant child row unrepresentable rather than merely invisible. A new migration, per Rule 6.
2. Scope the global unique indexes to the tenant where the identifier is tenant-owned: `(tenant_id, quote_id, revision)`, `(tenant_id, issue_id)`, and so on. With composite FKs in place this is belt-and-braces, but it is what turns the failure mode from "permanent" to "impossible".
3. Add the missing test, both directions, for each append-only child: same tenant plus another tenant's parent must be refused. Plant the composite FK's absence and watch it go red (Rule 1.5).
4. Have `issue_balance_apply` raise when its UPDATE affects zero rows.
5. Extend the Rule 4 CI leak tests from "A cannot read B's data" to "A cannot write a row into B's document graph", which is the half the current suite does not state.

---

## J4 · A negative variation that would put the ceiling below what is already invoiced is committed and then permanently uncounted — there is no path to reduce agreed scope — severity: blocker

**Where:** `new-app/db/migrations/20260925120000_documents_core/migration.sql`, `new-app/db/migrations/20260926110000_withdrawal_preconditions/migration.sql`, `new-app/db/test/documents-core.test.ts`, `docs/PRD.md`

**The claim under attack.** `documents_core/migration.sql:339`, on `variation.amount_minor`:

> `-- May be negative: a variation can remove scope as well as add it.`

**Why it does not hold.** Trace a negative variation on a job that has been invoiced — the ordinary case, since scope reductions are discovered during the work, after progress billing.

Accepted total 100,000. Progress invoices total 90,000. The client removes a bathroom worth 20,000, so a variation of `-20000` is recorded. Then:

- The variation row is inserted. **Nothing refuses it**: `variation` has only a tenant-scoped INSERT policy, no `CHECK` on the amount, and no trigger (see J2). It commits.
- `issue_balance_apply` is then called. It re-sums variations to `-20000`, sets `variations_total_minor = -20000`, sets `invoiced_total_minor = 90000`, computes `v_ceiling = 100000 + (-20000) = 80000`, finds `90000 > 80000`, and raises.
- The RAISE rolls back **its own UPDATE**, so `issue_balance` keeps `variations_total_minor = 0`.

The result is the worst of both outcomes. The variation row exists — append-only, unmovable, undeletable, a permanent record of an agreement — and the ceiling does not know about it. The balance row is not "stale pending a recompute"; it is structurally unable to ever incorporate that row, because every future `issue_balance_apply` call on that issue re-sums the same variations, reaches the same `90000 > 80000`, and raises again. **The function that exists to keep the cache honest can no longer run on this issue at all.** Every subsequent invoice, void or further variation on that job now fails with `exceeds the ceiling` and a number the user cannot act on.

And the documented remedy does not reach it. `withdrawal_preconditions/migration.sql` says the path once money has been demanded is "a credit note and a fresh quote". A credit note does not help:

```sql
  SELECT COALESCE(SUM(i."amount_minor"), 0) INTO v_invoiced
    FROM "invoice" i
   WHERE i."issue_id" = p_issue_id
     AND NOT EXISTS (SELECT 1 FROM "invoice_void" z WHERE z."invoice_id" = i."id");
```

`invoiced_total_minor` counts **whole unvoided invoices** and subtracts nothing for `credit_note`. And `documents_core/migration.sql:480` states that as a deliberate choice:

> Note what does NOT raise the ceiling: retention and credit notes.

Which is correct about the ceiling and silent about the *other* side of the comparison. A credit note cannot reduce `v_invoiced`, so it cannot unblock the issue. The only thing that reduces `v_invoiced` is `invoice_void`, which voids an invoice **whole** — so a partial correction is impossible. To clear the block the tenant must void a real, sent, possibly part-paid 90,000 invoice in its entirety and re-issue it, and `credit_note` — the table built for exactly this — has no effect on any figure the schema computes.

Withdrawal is also unavailable: `acceptance_withdrawal_guard` refuses once any invoice or any variation exists.

**No test covers this.** Every variation amount in the suite is positive (`40000`, `400000`). The one line of the migration that says amounts may be negative has no executed case behind it.

**What it would cost if built as written.** A job with reduced scope becomes permanently unbillable and permanently unreconcilable, in the ordinary course of a contractor's work, with no in-product route out. The contractor's recorded agreement with their client is on disk and excluded from the only figure that decides what may be billed — an append-only financial row the system has silently agreed to ignore. That is a worse shape than over-billing, because the ledger looks internally consistent: the reconciliation job re-derives the same numbers and reports the same refusal, so it certifies the stuck state rather than surfacing it.

**Suggested resolution.** Pick one and write it down; the schema currently implies all three and implements none.
1. **Make the refusal directional.** The invariant that matters is "an invoice may not be *issued* beyond the ceiling", not "the historical invoiced total may never exceed the ceiling". Restrict the RAISE in `issue_balance_apply` to the case where this transaction *increased* `invoiced_total_minor`, so a scope reduction that leaves the issue over-invoiced is recorded and flagged rather than refused into a dead end. Surfacing an over-invoiced issue is the reconciliation job's actual job.
2. **Net credit notes into `invoiced_total_minor`**, so the documented remedy works, and add a `CHECK` that a credit note cannot exceed its invoice's amount less other credit notes against it.
3. If negative variations are out of scope for release 1, add `CHECK ("amount_minor" > 0)` and delete the comment that says otherwise — an honest refusal at insert time is far better than a silent exclusion after commit.
4. Whichever is chosen, add a negative-variation test and a credit-note test. There are none of either.

---

## J5 · Grade 5 breaks the ladder's own ordering principle, and contradicts both PRD R1.20c and ADR 0024 on the same artefact — severity: blocker

**Where:** `docs/design/acceptance-evidence.md`, `docs/PRD.md`, `docs/adr/0024-acceptance-evidence.md`, `docs/design/domain-model.md`

**The claim under attack.** `acceptance-evidence.md` §4.2, the ladder:

| Grade | Evidence | Who witnesses it |
|---|---|---|
| 4 | The client's **own reply**, by email or WhatsApp | Google / Meta |
| 5 | A signed document returned and uploaded | **the client's hand** |
| 6 | Deposit paid | the bank or WiPay |

**Why it does not hold.** §2 of the same document states the test the whole design is built on:

> **No mechanism in which the tenant supplies the counterparty's address can prove anything against the
> tenant.** … Only two things help … **A third party the tenant does not control enters the chain.**

Apply that test to grade 5. A signed document *returned and uploaded* is a file the tenant selects from
their own device and uploads with their own credentials. No third party is in the chain at any point. The
witness column says "the client's hand" — but nobody in the system has seen the client's hand, compared it
to anything, or certified it. The design is asserting as a witness a fact it has no way to observe, which
is the exact error §2 was written to forbid.

§6 of the same document then convicts grade 5 without noticing:

> A screenshot of a WhatsApp reply, uploaded by the tenant, is **grade 1 dressed as grade 4**, and this
> design refuses to grade it higher. It is evidence the tenant holds and can fabricate.

A scanned signature uploaded by the tenant is evidence the tenant holds and can fabricate, by exactly the
same argument, with exactly the same upload path. The design applies the principle to the screenshot and
exempts the scan — and then ranks the scan **above** grade 4, the one grade in the ladder that actually
has an uncontrolled third party (Google/Meta) in the chain. The ordering is inverted at precisely the
point the design claims to have fixed.

**And two approved documents say the opposite.** `PRD.md` R1.20c, on this artefact:

> We record who uploaded it and when; **we do not certify it** — a tenant can forge one as easily as a
> client can, and saying so is the control.

`adr/0024-acceptance-evidence.md`, in its threat-model note:

> an uploaded "signed" copy is a document a tenant can forge as easily as a client can. We store what we
> are given and say who uploaded it and when; we do not certify it.

Both say the artefact is uncertified and forgeable by the tenant. The design gives it grade 5 of 6 and
names the client's hand as its witness. These cannot all be true, and the design is marked as
*superseding part of* ADR 0024 without saying that this is the part — so a reader of R1.20c and a reader
of §4.2 will reach opposite conclusions about the same upload, and both will believe they read the
approved position. That is the H6/M13 shape (one invariant, two documents, drift) reappearing in the
commit that closed H10.

**What it would cost if built as written.** The grade is the product's answer to "what is this acceptance
worth in a dispute" — §1 says so. Ranking a tenant-uploaded file above third-party-witnessed evidence
means the product will display, and a tenant will rely on, a strength claim that inverts the actual
evidential order. In a dispute the tenant discovers that the thing the product graded 5 is the thing the
PRD says we never certified. That is worse than grading it 1, because grading it 1 loses nothing and
claiming 5 loses the tenant's case. It is also the third iteration of ADR 0024's original mistake, which
§2 explicitly says a design must not produce.

**Suggested resolution.**
1. **Regrade the uploaded signed copy.** Either place it at grade 1 alongside the screenshot (consistent,
   and consistent with R1.20c and ADR 0024), or split it: grade 1 when the tenant uploads it, and a higher
   grade only when it arrives through a channel the tenant does not control — which in release 1 is
   nothing, so it is grade 1.
2. **State the ladder's ordering rule explicitly** as a one-line test any new grade must pass: *does an
   uncontrolled third party attest something the tenant could not have fabricated alone?* Then each row's
   grade is derivable from the rule rather than assigned by feel, and a future grade cannot be slotted in
   at the wrong height.
3. Amend R1.20c and ADR 0024 in the **same change** (Rule 23.5, Rule 24.6), and say in the design which
   part of ADR 0024 it supersedes and which part still stands.

---

## J6 · "The grade is derived from append-only evidence rows" — but the derivation is defined nowhere, and §7's proof of it contradicts §7's own immutability plant — severity: blocker

**Where:** `docs/design/acceptance-evidence.md`, `docs/PRD.md`, `docs/design/domain-model.md`

**The claim under attack.** Three documents state it as settled. `acceptance-evidence.md` §4.2: "the
**grade is derived** from the evidence rows, exactly as issue state and invoice status already are (ADR
0025 decision 3), so there is no stored grade to drift." `PRD.md` R1.20f: "**The grade is derived, never
stored**, so it rises when evidence arrives and cannot drift." `domain-model.md:235`: "**The grade is
derived from these rows, never stored** … so it rises when evidence arrives and cannot drift."

**Why it does not hold.** The comparison to ADR 0025 decision 3 is the problem. The things that decision
names — `quote_issue_state()` and invoice status — are derived *by a named SQL function whose precedence
is written out and executed by tests*. Nothing equivalent exists for the grade. All three documents state
the property ("derived") and none states the function. Specifically undefined:

- **The combining rule.** Six grades, many evidence rows. Is the grade the maximum, the most recent, or
  the set? "It rises when evidence arrives" implies maximum, but that is inferred from a clause about
  monotonicity, not stated.
- **Conflict between evidence and outcome.** `acceptance.outcome` is `'accepted' | 'declined'`, one row
  per issue, and evidence rows hang off the acceptance. So a **deposit paid against a declining
  acceptance** is representable today: grade-6 evidence on an outcome of `declined`. What is the grade?
  Under a maximum rule it is 6 — the product reports its strongest available evidence of acceptance for a
  quote the client declined. Neither the design nor the PRD says whether evidence is filtered by outcome,
  whether such a pair is refused, or which one the reconciliation job believes.
- **Interaction with withdrawal.** `issue_ceiling_minor` was made withdrawal-aware in
  `20260926110000_withdrawal_preconditions`. Nothing says whether the grade is. An acceptance that has
  been withdrawn still has all its evidence rows, so under a maximum rule its grade stays 6 forever.
- **Interaction with the bar.** §4.3 lets the tenant require grade 6. §4.4 says the ceiling unlocks at
  grade 2 regardless. So two different derived quantities are being compared to two different thresholds,
  and only one of them is defined anywhere (the ceiling, in SQL).

**§7's proof is self-contradicting.** Two of its six bullets are:

> - an `acceptance_evidence` row updated or deleted → refused by the absence of a policy;
> - the derived grade computed with an evidence row removed → the grade falls, proving it is derived
>   rather than stored;

The fourth bullet makes the fifth bullet's manoeuvre impossible through any ordinary path — an evidence
row cannot be removed, which is the point of the table. The fifth can only be executed as superuser, i.e.
by defeating the control the fourth asserts. And under a maximum rule it does not even prove what it
claims: removing a *non-maximal* row leaves the grade unchanged, so the test passes or fails depending on
which row the author happens to remove. A plant that can be satisfied by the wrong choice of input is the
"control that fires correctly on the wrong thing" Rule 21 closes by admitting it cannot catch.

**What it would cost if built as written.** This is the one part of the design a builder cannot build from,
which by Rule 16.5 means it is not finished ("If a design is not precise enough for Sonnet to build from,
the design is not finished — that is a finding about the design"). Worse, three documents already assert
the property in the present tense, so the first implementation to invent a combining rule will be treated
as having merely implemented the design, and the rule will never be reviewed as a decision. The
deposit-against-a-decline case decides what the product tells a contractor about a dispute, and it is
currently nobody's decision.

**Suggested resolution.**
1. Write `acceptance_grade(p_issue_id UUID) RETURNS INTEGER` as SQL in the migration that creates
   `acceptance_evidence`, in the same shape as `quote_issue_state()`: an explicit precedence, one
   definition, comments on why each branch is ordered where it is. The design should carry that function's
   body, not the word "derived".
2. Decide and state the four undefined cases above. At minimum: evidence is scoped to an `accepted`
   outcome; a withdrawn acceptance grades 0 or `NULL`, matching the ceiling's withdrawal-awareness; and
   grade-6 evidence against a `declined` outcome is **refused at insert** by a trigger rather than graded.
3. Replace §7's fifth bullet with a plant that works: compute the grade, then insert a *higher* evidence
   row and assert the grade rises, and separately assert that no `UPDATE`/`DELETE` can lower it. That
   proves derivation without needing to defeat immutability.

---

## J7 · §9 decision 2's four preparations for grade 4 are not sufficient: the fifth is the one that stops a replayed webhook duplicating append-only financial evidence — the M18 defect, pre-committed — severity: blocker

**Where:** `docs/design/acceptance-evidence.md`, `docs/PRD.md`, `new-app/db/migrations/20260926100000_variation_idempotency/migration.sql`, `docs/MISTAKES.md`

**The claim under attack.** `acceptance-evidence.md` §9 decision 2, which is explicit that the list is
closed:

> Deferred deliberately, so "prepare" has to mean something specific rather than a good intention. **It
> means exactly four things and no more** … **Nothing else is built.**

and R1.20h, which repeats the four and ends "**Nothing else** — no endpoint, no parsing, no provider."

**Why it does not hold.** The first preparation is:

> **`acceptance_evidence` carries what an inbound message needs from the start**: the channel, the
> external message id, the sender as the provider reported it, and the received-at timestamp. Nullable
> and unused in release 1. This is the one place a column is added ahead of need, and **the reason is that
> adding it later means migrating rows that are append-only financial evidence.**

The reasoning is right and it stops one column short of its own conclusion. **Four nullable columns
without a uniqueness constraint on the external message id is not a preparation — it is the shape of the
defect.** Inbound webhooks from Meta and Google are *at-least-once*: a delivery is retried when our
endpoint times out, 500s, or is slow. Without `UNIQUE (channel, external_message_id)`, a retried delivery
inserts a **second append-only `acceptance_evidence` row** for one client reply.

This is M18, verbatim, in the same schema, twelve days after it was written down. Compare
`20260926100000_variation_idempotency/migration.sql`, which exists because of exactly this:

> Without a key, a retried queue entry inserts a second row — and because `variation` is append-only and
> its amount feeds the invoiceable ceiling, the duplicate raises how much may be billed **permanently**,
> and the nightly reconciliation job then certifies the inflated figure as correct. That is the worst shape
> a defect can take here: self-ratifying.

Substitute "grade" for "ceiling" and every word applies. And the consequence is *harder* to fix here than
it was for `variation`, by the design's own argument: adding the unique index after rows exist means
**de-duplicating append-only rows**, and the whole premise of this table is that its rows cannot be deleted.
So the one thing the bullet says it is guarding against — "adding it later means migrating rows that are
append-only financial evidence" — is what the bullet's own omission guarantees. By Rule 24.4, M18's
mechanism is decorative if the lesson did not carry one table across.

**The third preparation has no artefact at all.** The bullet says:

> **The reply-to address convention is reserved now** — quotes are sent with a per-issue reply address so
> a future inbound handler can attribute a reply without guessing. **Reserving the shape costs a line**;
> retrofitting it means every quote already sent is unattributable.

No line is named. The design names no table, no column, and no format. `quote_issue` (already built, and
append-only, so it cannot gain a value for rows already inserted) has no reply-address column, and none of
the five migrations adds one. If the address is *derived* from the issue id, say so and the preparation is
free and genuine; if it is *stored*, it must be a column on `quote_issue` and it must be added **before**
the first issue is sealed in production, because that table has no UPDATE path by design (ADR 0025
decision 4). A preparation whose entire justification is "retrofitting is impossible" and which specifies
nothing is the weakest row in the decision.

**What it would cost if built as written.** One client reply graded as two pieces of evidence. On its own
that is cosmetic, but the grade is what the product tells a tenant their acceptance is worth in a dispute,
and the duplicate is undeletable, so the record permanently overstates itself and cannot be corrected —
the self-ratifying shape again. Plus, if the reply address turns out to need storing, every quote sealed
before that discovery is permanently unattributable on the exact axis the preparation existed to protect.

**Suggested resolution.**
1. Make it **five** preparations, and add the fifth to §9 decision 2 and to R1.20h in the same change
   (Rule 23.5): a **partial unique index** on `acceptance_evidence (channel, external_message_id) WHERE
   external_message_id IS NOT NULL` — the identical shape, and the identical reasoning, as
   `variation_issue_client_reference_key`. Cite that index as the precedent so the next reader sees it is
   the same lesson rather than a new opinion.
2. Resolve the reply address to a named artefact: either "derived as `<issue_id>@replies.<domain>`, no
   column" or "`quote_issue.reply_address TEXT NOT NULL`, added before the first production seal". Either
   is fine; "a line" is not.
3. Add to §7: a replayed inbound message with the same external id must be refused, proved by planting the
   index's absence.

---

## J8 · The acceptance bar is set per quote and never frozen into the issue, so a tenant can change what counts as acceptance for a quote already in a client's hands — severity: blocker

**Where:** `docs/design/acceptance-evidence.md`, `docs/PRD.md`, `docs/RULES.md`, `new-app/db/migrations/20260925120000_documents_core/migration.sql`, `docs/design/domain-model.md`

**The claim under attack.** `acceptance-evidence.md` §4.3, in full:

> **The tenant chooses the bar.** Per quote, with a tenant default: *this quote is accepted when …* grade
> 2, grade 3, or **grade 6 (a deposit)**.

and §9 decision 3: "`document_settings` gains a `deposit_suggested_above_minor` threshold, the tenant sets
it (unset means never)".

**Why it does not hold.** Two separate problems, both about *when* a value is read.

**1. "Per quote" is the wrong noun, and Rule 6 says so.** A `quote` is the mutable working document: it
carries a `version` column, a `deleted_at`, and a full read/write RLS policy. A `quote_issue` is the frozen
snapshot. Rule 6: "**Issued documents are immutable snapshots:** prices, tax rates, currency, wording and
the assigned number freeze at issue." The bar is a term of what the client is being asked to do — it is the
definition of the act the shared page will ask them to perform — and it is at least as much "wording" as
the terms text that *is* frozen (`quote_issue.terms_text`). The design puts it on the mutable side and
never says it is copied into the issue. `quote_issue` has no such column, and being append-only it cannot
acquire a value for rows already sealed.

So: Delroy sets the bar to grade 6, seals, sends. The client does not pay. Delroy edits the quote's bar
down to grade 2, taps accept on the client's behalf, and the issue is accepted — with no evidence anyone
outside the tenant ever did anything. The bar that was in force when the document was sent is not recorded
anywhere, so there is no way to detect this afterwards, and `acceptance`'s own immutability does not help
because the *threshold* the acceptance was measured against was never immutable.

**2. The same applies to the tenant default and the threshold.** `document_settings` does not exist in any
migration (`grep -rn "document_settings" new-app/` returns nothing), so how it is read is entirely
undecided. If the default is read at acceptance time rather than frozen at seal time, then changing one
setting silently redefines the acceptance condition for **every quote already outstanding** — which is the
answer to "what happens to quotes already sent when the threshold changes": today, nothing is specified,
and the natural implementation changes them all. For `deposit_suggested_above_minor` this is mild
(§9 decision 3 says the threshold only drives a *suggestion* at send time, so reading it late is merely
inconsistent). For the **bar** it is a money-affecting change to a document already in a client's hands.

**Note also which side of the design this contradicts.** §4.4 says "The invoicing ceiling unlocks on
operational acceptance (grade 2 or above). The evidence grade is a separate recorded fact." If that is
true, the bar does not gate invoicing and problem 1 is smaller than it looks. But §4.3 says the bar
defines when the quote "is accepted", and `issue_ceiling_minor()` keys off the existence of an
`acceptance` row with `outcome = 'accepted'` and no withdrawal — nothing about grade. So §4.3 and §4.4
disagree about whether the bar has any force at all, and the built SQL implements §4.4. The design needs
to say which is true, because the two readings differ by whether a tenant-configurable setting can unlock
invoicing.

**What it would cost if built as written.** A configurable, retroactively mutable definition of the single
event that unlocks billing — reachable by the tenant, invisible afterwards, on documents already sent. Every
other value on a sealed document is frozen precisely so this class of manoeuvre is impossible; this one
would be the exception, and it would be the one that decides when money may be demanded.

**Suggested resolution.**
1. **Freeze the bar into `quote_issue`** as `acceptance_bar_grade INTEGER NOT NULL` (or `TEXT` with a
   `CHECK`), resolved from the quote and the tenant default at seal time, in the same append-only snapshot
   as `terms_text` and `tax_rate_basis_points`. Then the question "what was required of this client?" has
   one immutable answer, and Rule 6 covers it like everything else on the document.
2. State in §4.3, in one sentence, that the bar is resolved at seal and that changing a default never
   affects an issue already sealed — and add the corresponding sentence to R1.20 and `domain-model.md`
   §6.1, in the same change (Rule 24.6: a fix must land in every document the finding names).
3. Resolve §4.3 against §4.4 explicitly: state whether the bar gates the invoicing ceiling or only the
   recorded grade. If it does not gate the ceiling, say so in §4.3 where a reader will be standing.
4. Add `document_settings` to the schema, or stop citing it in an approved design and an approved
   requirement as though it exists (R1.20g names `document_settings.deposit_suggested_above_minor` as a
   fact).

---

## J9 · `document_render` does not exist, and the column that was F17's whole fix is nullable with no foreign key — severity: blocker

**Where:** `new-app/db/migrations/20260925120000_documents_core/migration.sql`, `new-app/db/schema.prisma`, `docs/PRD.md`, `docs/design/acceptance-evidence.md`, `docs/adr/0024-acceptance-evidence.md`

**The claim under attack.** `PRD.md` R1.20, describing the default grade-3 acceptance record:

> plus a **reference to the `document_render` row whose hash is the document signed**, not a hash of its
> own (F17).

and `acceptance-evidence.md` §8: "Grade 6 proves money moved against a document; **what the parties
agreed still rests on the document's hash.**"

**Why it does not hold.** The table does not exist. Every occurrence in the repository:

```
$ grep -rn "document_render" new-app/db/
migrations/20260925120000_documents_core/migration.sql:289:    "document_render_id"    UUID,
schema.prisma:688:  documentRenderId String? @map("document_render_id") @db.Uuid
```

Two references, both to a column. No `CREATE TABLE "document_render"`, in this migration or any of the
other eleven. And the column itself:

- **nullable** — so an acceptance may be recorded with no reference to the bytes the client agreed to, and
  nothing refuses it;
- **no foreign key** — every other id column in this migration has one; this one has none, necessarily,
  because there is no table to point at. So it will accept any UUID at all, including one from another
  tenant, or a random value from a buggy client.

F17's finding was that an acceptance must reference *the render whose hash is the document signed* rather
than carry a hash of its own. What landed is a nullable, unconstrained UUID named after that idea. The
guard built for exactly this class (`check_citations.py`) does not catch it because `document_render` is
cited in `PRD.md` (Markdown prose, where identifier checking is deliberately not applied — see the
narrowing comment at `check_citations.py:216`) and the migration mentions only the *column*, which does
exist. So the phantom sits in the gap between the two halves of the checker.

**And it is the load-bearing fact of the acceptance design.** §8's "what the parties agreed still rests on
the document's hash" is the sentence that stops the entire ladder from being a record of a tap with no
document attached. §2 says the design's second defence is that "the evidence is labelled honestly". A grade
3 acceptance whose `document_render_id` is `NULL` is an acceptance of nothing identifiable, honestly
labelled as grade 3.

**What it would cost if built as written.** An acceptance record that cannot be tied to the document it
accepted — in a dispute, which is the only situation the record exists for. The PRD states the reference as
a delivered property of R1.20 and the design rests its strongest caveat on it, so nobody downstream will
check. And because `acceptance` is append-only with no UPDATE path, an acceptance written with a NULL
render id can never be corrected: the fix would be a new acceptance, which `acceptance_issue_key` forbids
(see J10).

**Suggested resolution.**
1. Create `document_render` — tenant-scoped, append-only, with the hash, the algorithm, the storage key
   and the issue it renders — in a new migration, before any acceptance path is built.
2. Make `acceptance.document_render_id` `NOT NULL` with a composite foreign key to it (per J3). If a
   grade-1 tenant-recorded acceptance genuinely has no render, that is an argument for making the column
   nullable *with a `CHECK` tying nullability to the grade* — stated, not implied.
3. Extend `check_citations.py` so a `snake_case` identifier cited in `docs/*.md` as a table or column name
   is resolved against the migrations, the way it already is for migration comments. This is the same
   blind-spot family as J1, and the same fix motive: the checker's two halves each assume the other
   covers Markdown identifiers, and neither does.

---

## J10 · `quote_issue_state()` says `superseded`, `issue_ceiling_minor()` says fully invoiceable — nothing enforces "withdraw first", and two revisions of one quote can each carry a live ceiling — severity: blocker

**Where:** `new-app/db/migrations/20260925120000_documents_core/migration.sql`, `new-app/db/migrations/20260926110000_withdrawal_preconditions/migration.sql`, `new-app/db/test/documents-core.test.ts`, `docs/design/domain-model.md`, `docs/PRD.md`, `docs/PRD-REVIEW-3.md`

**The claim under attack.** H5's disposition in `PRD-REVIEW-3.md`:

> **Closed.** `docs/design/domain-model.md` §6.3 reframes it: superseding an accepted issue is not a
> forbidden transition but an **ordering** — withdraw first, which H4's trigger permits only while no
> invoice or variation exists, and the issue is then not accepted so nothing is orphaned.

and `domain-model.md` §6.3, in the same words:

> So "superseding an accepted issue" is not a forbidden transition, it is an ordering: **withdraw first**
> — which is possible only while no money hangs off it — and the issue is no longer accepted, so
> superseding it orphans nothing.

**Why it does not hold.** The ordering has no owner. Nothing in the database requires a withdrawal before
a later revision is sealed. Sealing revision 2 is a plain `INSERT` into `quote_issue`, permitted by
`quote_issue_append` on nothing but `tenant_id`. There is no trigger on `quote_issue` (the only trigger in
the Documents core is on `acceptance_withdrawal`), and no `CHECK` can express it because it is a cross-row
condition. So this is precisely Rule 1.10's "an invariant with no owner — stated in prose, enforced by
nothing", asserted as closed on the strength of a paragraph.

And the two functions disagree about the resulting row. `quote_issue_state()`:

```sql
    -- Superseded first: a later revision exists, whatever else is true.
    WHEN EXISTS (… later."revision" > self."revision") THEN 'superseded'
```

`issue_ceiling_minor()`, as replaced by `20260926110000_withdrawal_preconditions`:

```sql
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM "acceptance" a
       WHERE a."issue_id" = p_issue_id AND a."outcome" = 'accepted'
         AND NOT EXISTS (SELECT 1 FROM "acceptance_withdrawal" w WHERE w."acceptance_id" = a."id")
    ) THEN COALESCE((SELECT b."accepted_total_minor" + b."variations_total_minor" …), 0)
    ELSE 0 END;
```

The ceiling tests for acceptance and withdrawal, and **says nothing about supersession**. So for an issue
that is accepted and then superseded, `quote_issue_state()` returns `'superseded'` while
`issue_ceiling_minor()` returns its full accepted total plus variations. The document the product calls
superseded is still fully invoiceable, and `issue_balance_apply` will happily admit invoices against it.

**And the case that matters is exactly the case where the prescribed ordering is unreachable.** H4's
trigger refuses a withdrawal once *any* invoice or *any* variation exists. So:

1. Revision 1 is sealed, accepted, and progress-invoiced for 60,000 of 100,000.
2. Something changes; the tenant seals revision 2 for 130,000. **Nothing refuses this** — withdrawal was
   the prescribed first step and H4's trigger makes it impossible, because an invoice exists.
3. Revision 1 is now `superseded` with a live ceiling of 100,000 and 40,000 of room left.
4. The client accepts revision 2. `acceptance_issue_key` is unique on `issue_id`, **not on the quote**, so
   nothing objects. `issue_balance_open` creates a second balance row with `accepted_total_minor = 130000`.
5. The quote now carries **two accepted revisions with two live ceilings totalling 230,000** for one
   100,000–130,000 job, and every invoice against either passes the ceiling check, because the check is
   per issue and the issues do not know about each other.

The escape hatch the documents offer — "the remedy is a credit note and a fresh quote" — does not close
this: a "fresh quote" is a new `quote` row, but a new *revision* is the normal, one-click path and is what
step 2 uses. ADR 0025 decision 1's whole claim is that the ceiling has exactly one definition; it does,
and that definition is scoped to the wrong entity. The invariant the product needs is *per quote*, not per
issue.

**No test covers it.** `describe("G4 · two devices cannot seal the same revision")` seals revision 1 then
revision 2 and asserts both exist — the setup for this defect, asserted as correct behaviour. The
supersession test (`"reads superseded when a later revision exists"`) checks the *state string* and never
the ceiling. No test in the file accepts two revisions of one quote.

**What it would cost if built as written.** Double-billing a client for one job, with every database
invariant satisfied and the reconciliation job certifying both balance rows as internally consistent —
because each one is. This is the same self-ratifying shape as M18, arrived at through a different door, and
it is the direct answer to "an issue that is both superseded and accepted: which wins, and is that the
right answer for the ceiling?" Today: the state says superseded, the ceiling says invoice away, and the
right answer is neither of them alone.

**Suggested resolution.**
1. **Make the ceiling supersession-aware**, in the one expression that owns it — add
   `AND NOT EXISTS (SELECT 1 FROM quote_issue later WHERE later.quote_id = self.quote_id AND
   later.revision > self.revision)` to `issue_ceiling_minor()`. One `CREATE OR REPLACE`, and every caller
   picks it up — the payoff the withdrawal migration already demonstrated. This is the smallest correct
   change and it makes the two functions agree.
2. **Then decide the invoiced-past-supersession case**, because (1) creates it: an issue superseded after
   being invoiced has `invoiced_total > ceiling = 0`, which J4 shows becomes a permanent dead end. This is
   the same root cause as J4 and wants the same fix — a directional refusal plus a reconciliation flag,
   not a hard block.
3. **Add a trigger on `quote_issue`** refusing a new revision while an earlier revision of the same quote
   is accepted and not withdrawn. That turns §6.3's "ordering" into a mechanism, and makes the H5
   disposition true rather than argued.
4. **Enforce one live acceptance per quote**, not per issue: a partial unique index or a trigger, so step 4
   above is refused at the database.
5. Add the missing test: accept revision 1, seal and accept revision 2, and assert the total invoiceable
   across the quote never exceeds one accepted total. It fails today.

---

## J11 · `quote_issue.subtotal_minor` is not tied to its own frozen lines, and the ceiling is derived from the header rather than from the lines the client saw — severity: major

**Where:** `new-app/db/migrations/20260925120000_documents_core/migration.sql`, `new-app/db/schema.prisma`, `docs/design/domain-model.md`

**The claim under attack.** `domain-model.md` §6.2a's column table:

| Column | Kind | Who writes it |
|---|---|---|
| `accepted_total` | **derived, written once** from the accepted issue's **own frozen lines** | the acceptance transaction, never again |

**Why it does not hold.** `issue_balance_open` does not read the lines:

```sql
  SELECT q."tenant_id", q."total_minor" INTO v_tenant, v_total
    FROM "quote_issue" q WHERE q."id" = p_issue_id;
  …
  VALUES (p_issue_id, v_tenant, v_total, 0, 0, now())
```

`accepted_total_minor` is `quote_issue.total_minor` — a header value the application supplies at seal
time. The only constraint on it is:

```sql
    CONSTRAINT "quote_issue_total_check"
        CHECK ("total_minor" = "subtotal_minor" + "tax_minor"),
```

which relates the three header columns to each other and **nothing to `quote_issue_line`**. There is no
constraint, trigger or test asserting `subtotal_minor = SUM(quote_issue_line.line_total_minor)`, nor that
`line_total_minor = quantity_thousandths * unit_price_minor / 1000`, nor that `tax_minor` is consistent
with `tax_rate_basis_points` and the per-line `tax_treatment`. Every one of those is an application
computation with no database witness, on the one document whose entire purpose is to be an immutable
record of a price — and `quote_issue` being append-only means a wrong header can never be corrected, only
superseded.

So the chain that decides how much may be billed is: the application computes a header total → the header
total becomes `accepted_total_minor` → `accepted_total_minor` is the ceiling. The frozen lines, which are
what the client actually saw and agreed to, are not in that chain anywhere. The migration's own limits
section is honest about the arithmetic ("Money arithmetic below the ceiling … is not here") — but
`domain-model.md` is not, and the sentence it gets wrong is the one naming where the ceiling's base number
comes from.

`schema.prisma` reproduces the same shape, so the type layer will not catch it either.

**What it would cost if built as written.** A single rounding or summation bug in the sealing path writes a
`total_minor` that disagrees with the lines on the PDF the client holds, and the disagreement is then
canonised as the invoicing ceiling and frozen forever. In a dispute, the product's own two records of the
same document differ, and the one that decides the money is the one the client never saw. It is also the
kind of defect that leaves the suite green, which is exactly why Rule 16.5 puts money arithmetic in the
judgement class.

**Suggested resolution.**
1. Add a deferred constraint trigger on `quote_issue` (`AFTER INSERT`, `DEFERRABLE INITIALLY DEFERRED`, so
   the header may be inserted before its lines) asserting
   `subtotal_minor = (SELECT COALESCE(SUM(line_total_minor), 0) FROM quote_issue_line WHERE issue_id = …)`.
   This is a cross-row aggregate, so a `CHECK` genuinely cannot carry it — which is the same argument
   §6.2a already makes for the ceiling, applied one level down.
2. Assert the per-line identity as a `CHECK` where it is expressible:
   `line_total_minor = quantity_thousandths * unit_price_minor / 1000` — and decide and state the rounding
   rule, since integer division truncates.
3. Correct `domain-model.md` §6.2a to say `accepted_total` is the issue's frozen **header total**, or make
   `issue_balance_open` sum the lines. Either is defensible; the current pair is a document describing a
   mechanism the code does not implement.
4. Write `db/test/money-convention.test.ts` (J1) and put these assertions in it.

---

## J12 · H2 deleted one prose writer list and left another two lines above it, which is wrong about credit notes and about variations — severity: major

**Where:** `docs/design/domain-model.md`, `docs/PRD-REVIEW-3.md`, `new-app/db/migrations/20260925120000_documents_core/migration.sql`

**The claim under attack.** H2's disposition: "`docs/design/domain-model.md` §6.2a **no longer carries a
prose writer list** — a list that can be wrong is not a control." And §6.2a's own text, immediately after
the table: "**Every writer takes the lock, and a prose list is no longer what says so.** … A list that can
be wrong is not a control."

**Why it does not hold.** §6.2a still carries a prose writer list. It is the table's third column, two
lines above the sentence retiring it:

| Column | Kind | Who writes it |
|---|---|---|
| `issue_id` | identity | the acceptance transaction |
| `accepted_total` | derived, written once | the acceptance transaction, never again |
| `variations_total` | derived cache | **every variation, inside the lock** |
| `invoiced_total` | derived cache | **every invoice and credit note, inside the lock** |

And it is wrong on both of the rows that matter:

- **"every invoice and credit note"** — a credit note writes nothing. `issue_balance_apply`'s
  `invoiced_total` computation selects from `invoice` and excludes voided invoices via `invoice_void`;
  `credit_note` appears nowhere in the function, and `documents_core/migration.sql:480` confirms that as
  deliberate. So the document credits a writer that does not write, which is the *same class* of defect
  H2 was raised about (a writer list that does not match the code), inverted.
- **"every variation, inside the lock"** — nothing makes a variation take the lock or call the function
  (see J2). This is aspirational.

This is the H1/G1 pattern for the third time in one section: a claim removed from the paragraph and left
standing in the table beside it, in the very amendment that logs the lesson. `check_dispositions.py`
passes it, correctly, because the row cites `domain-model.md` — and this is precisely the limit Rule 24.6
states about itself ("verifies that every named document was *cited*, not that the edit was *correct*").
The row is not false so much as incomplete, which is the shape reviews 2 and 3 both caught and neither
mechanised.

**What it would cost if built as written.** A reader implementing the credit-note path from
`domain-model.md` will call `issue_balance_apply` after issuing a credit note, expect
`invoiced_total_minor` to fall, and find it unchanged — and if they instead "fix" the discrepancy by
teaching the function to subtract credit notes, they will have made an undiscussed change to the money
invariant on the strength of a table. J4 argues that change is probably right; it should be a decision,
not a correction inferred from stale prose.

**Suggested resolution.**
1. Delete the "Who writes it" column outright, or reduce every cell in it to
   `issue_balance_apply()` / `issue_balance_open()` — which is what the paragraph below already says and
   is the only formulation that cannot go stale.
2. Decide the credit-note question (J4) and state it in the one place the arithmetic lives, the migration.
3. Re-open H2 as partially closed rather than leaving it Closed, per Rule 24.6's second half: this is what
   a re-review is for.

---

## J13 · One `acceptance` row per issue, ever — so an accidental decline is terminal and a withdrawn acceptance can never be re-accepted — severity: major

**Where:** `new-app/db/migrations/20260925120000_documents_core/migration.sql`, `new-app/db/test/documents-core.test.ts`, `docs/design/domain-model.md`, `docs/PRD.md`, `docs/design/acceptance-evidence.md`

**The claim under attack.** `migration.sql`: `CREATE UNIQUE INDEX "acceptance_issue_key" ON "acceptance"
("issue_id");` and `PRD.md` R1.20: "**One acceptance per issue, immutable**; many evidence rows." Plus the
withdrawal design's stated purpose: "The typo remedy, which is the point of the feature: discovered early,
it is cheap" (`documents-core.test.ts:419`).

**Why it does not hold as a product behaviour.** The unique index is on `issue_id` alone, with no
qualification on `outcome` and no interaction with `acceptance_withdrawal`. Two consequences the documents
do not address:

1. **A decline is irreversible.** A client taps Decline by mistake, or declines and then negotiates and
   agrees. No second `acceptance` row can be inserted; `acceptance` has no UPDATE policy; there is no
   `decline_withdrawal` table. `quote_issue_state()` returns `'declined'` permanently, and
   `issue_ceiling_minor()` returns 0 permanently. The only path is a new revision — which means the client
   must be sent a new document because they mis-tapped a button.
2. **Withdrawal is one-way.** `documents-core.test.ts:333` asserts "reads accepted, then **issued** again
   once the acceptance is withdrawn" — the state returns to `issued`, i.e. presented as re-acceptable. It
   is not: the `acceptance` row is still there, still occupying `acceptance_issue_key`. So the state
   function reports a state the schema cannot honour. Withdraw a typo-acceptance and the issue is
   permanently unacceptable, which inverts the feature's stated purpose ("discovered early, it is cheap").

The test suite records the first half of (2) as correct behaviour and never attempts the second
acceptance, so the contradiction is asserted rather than caught.

**What it would cost if built as written.** The two most common human errors on the product's most
important screen — a client mis-tapping Decline, and a contractor withdrawing a typo — each force a new
revision and a new send to the client. For the withdrawal case the schema has already spent a table and a
trigger to make the remedy cheap, and the unique index takes the saving back.

**Suggested resolution.** Decide which invariant is wanted and write it once:
- **If one acceptance per issue is genuinely the rule**, say so where a reader will be standing — in §6.3's
  state table and in the withdrawal design — and change `quote_issue_state()` to return something other
  than `'issued'` after a withdrawal (`'withdrawn'`), so the state does not promise a transition the schema
  refuses. Fix the test's name and expectation with it.
- **If re-acceptance is wanted**, replace the index with a partial unique index —
  `UNIQUE (issue_id) WHERE <not withdrawn>` is not expressible directly, so the shape is either a
  `superseded_by` chain or a trigger asserting "at most one acceptance without a withdrawal per issue".
  Then `'issued'` after withdrawal is honest.
- Either way, add a test for the second acceptance attempt. There is none.

---

## J14 · The RLS exemption list covers the four tables holding credential material, so "default-deny" is not what the schema achieves — and the exemption's own reason is unenforced — severity: major

**Where:** `new-app/db/test/policy-parity.test.ts`, `new-app/db/migrations/20260925120000_documents_core/migration.sql`, `docs/RULES.md`, `docs/design/domain-model.md`

**The claim under attack.** `policy-parity.test.ts:115`:

> `describe("every table is either tenant-protected or exempt with a reason", …)`

and Rule 5: "**Default-deny authorisation.** Every route declares how it is protected; a route with no
guard is a bug."

**Why it does not hold.** Comparing the tables created against the tables with RLS enabled:

```
$ grep -h "ENABLE ROW LEVEL SECURITY" migrations/*/migration.sql | …   (20 tables)
$ grep -h "^CREATE TABLE" migrations/*/migration.sql | …               (27 tables)
```

Seven tables have **no row-level security at all**: `registration_claim`, `app_session`,
`app_credential`, `rate_limit_bucket`, `mfa_totp`, `mfa_recovery_code`, `platform_capability`. Each is
listed in `EXEMPT` with a reason, so the guard's literal claim holds and Rule 21's form is satisfied. The
substance is what is wrong: **three of the seven hold authentication secrets** — `app_credential` (the
password hash), `mfa_totp` and `mfa_recovery_code` (second-factor material), plus `registration_claim`
(`token_hash`, a single-use registration credential) — and "no RLS" on them means any session holding the
application role can `SELECT *` across the whole platform's credential material, in any request context.
The test harness grants SELECT on every table, so this is the state the tests run in.

The exemptions' shared reason is sound as far as it goes: these rows are read *before a tenant is known*,
so a tenant predicate would make them unreadable exactly when needed. But that argues for **no tenant
predicate**, not for **no policy**. The distinction matters because this repository already built the
mechanism for exactly this case, in the migration under review:

```sql
CREATE POLICY issue_balance_amend ON "issue_balance" FOR UPDATE
  USING (… AND current_setting('pryvis.balance_write', true) = 'on')
```

A transaction-local flag that only a designated function raises. The same shape — say
`current_setting('pryvis.auth_bootstrap', true) = 'on'`, raised only inside the sign-in and registration
functions — would give the credential tables default-deny without a tenant predicate, and would make
`registration_claim`'s exemption reason enforceable rather than descriptive. As written, that reason says
the table "is read only by the unauthenticated registration path" — and nothing in the database requires
that. It is a sentence, in a list of reasons, asserting a scoping property that no mechanism holds; the
same shape as J2.

**Is the exemption "too broad" in Rule 21.1's sense?** Yes, and specifically: the guard's name promises a
dichotomy ("tenant-protected **or** exempt with a reason") that a reader will hear as "and the exempt ones
are safe for a stated reason". Four of the seven reasons establish only that a *tenant* predicate is
impossible, which is a different claim from "unprotected is safe". The guard's coverage statement should
say which, and the credential tables should not be in the same bucket as `rate_limit_bucket` (which
genuinely holds nothing).

Two things to its credit, and they are real: the guard has a **stale-exemption check** (`policy-parity.
test.ts:433`) that already caught a bogus `_prisma_migrations` entry, and an **"every table was exempt, so
this guard checked nothing"** assertion at line 424. Both are Rule 21 done properly, and they are why this
is a major rather than a blocker: the list cannot rot silently.

**What it would cost if built as written.** One SQL-injection or one confused-deputy query anywhere in the
application reads every password hash, every TOTP secret and every pending registration token on the
platform — and the second layer Rule 4 and Rule 5 exist to provide is not there for exactly the rows where
it matters most. The TOTP secrets are encrypted at rest (noted in the exemption, and it is a genuine
mitigation); the password hashes and the registration token hashes are not.

**Suggested resolution.**
1. Give the four secret-holding tables RLS with a **bootstrap-flag policy**, using the pattern
   `issue_balance` already establishes, so access requires a flag only the authentication and registration
   functions raise. Then the exemption list shrinks to the three tables that genuinely hold nothing.
2. Split `EXEMPT` into two named categories with different reasons — "holds no protectable data" and
   "read before identity is known" — and have the guard require the second category to be empty, or to
   name its compensating control. That makes the coverage statement match the reasoning (Rule 21.1).
3. Restate the `describe` name to say what it proves and what it does not, per Rule 21.4: it proves no
   table is unprotected *without a declared reason*; it does not prove the exempt tables are safe.

---

## J15 · `acceptance_withdrawal_guard()` counts voided invoices, so voiding an invoice does not restore the withdrawal remedy — severity: minor

**Where:** `new-app/db/migrations/20260926110000_withdrawal_preconditions/migration.sql`, `new-app/db/test/documents-core.test.ts`

**The claim under attack.** The migration's reasoning: withdrawal is refused because invoices are money
already demanded — "The remedy once money has been demanded is a credit note and a fresh quote, not a
withdrawal."

**Why it does not hold.** The guard counts every invoice row:

```sql
  SELECT count(*) INTO v_invoices FROM "invoice" i WHERE i."issue_id" = v_issue_id;
```

`issue_balance_apply` in the same schema is careful to exclude voided invoices from the invoiced total:

```sql
     AND NOT EXISTS (SELECT 1 FROM "invoice_void" z WHERE z."invoice_id" = i."id")
```

The guard is not. So an invoice raised in error and immediately voided — before it was ever sent, which is
the ordinary use of `invoice_void` — permanently removes the withdrawal remedy from that issue. The two
functions disagree about what "an invoice exists" means, which is the same one-definition problem ADR 0025
exists to prevent, at a smaller scale.

The test at `documents-core.test.ts:428` invoices and asserts the refusal; it never voids first, so the
distinction is untested.

**What it would cost if built as written.** The cheap typo remedy is lost to a mistake the product already
has a clean undo for. Low cost individually, but it is the kind of asymmetry that produces a support
ticket nobody can explain, because the blocking row is invisible on every screen (a voided invoice is
presented as cancelled).

**Suggested resolution.** Add the same `NOT EXISTS (… invoice_void …)` predicate to the guard, and a test
that voids an invoice and then withdraws successfully. Consider extracting the "live invoices for an
issue" predicate into one SQL function so the two cannot diverge again — Rule 7 applied inside the
database.

---

## J16 · `rejected_seal` can be deleted outright, so "append-only for its facts" is not what the policy set provides — severity: minor

**Where:** `new-app/db/migrations/20260926120000_rejected_seals/migration.sql`, `new-app/db/test/documents-core.test.ts`

**The claim under attack.** The migration's own policy comment, which is careful and explicitly honest
about one limit:

> `rejected_seal` is **append-only for its facts** and its `resolution` is the one thing a tenant later
> sets … A column-level restriction would be better and Postgres policies cannot express one: the honest
> statement is that a tenant who can resolve a rejected seal can also, at the database level, **rewrite
> the price it recorded.** What prevents that is the application.

**Why it does not hold.** The admission stops one verb short. The policy is:

```sql
CREATE POLICY rejected_seal_tenant_isolation ON "rejected_seal"
  USING (…) WITH CHECK (…);
```

An unqualified policy — no `FOR` clause — which is `FOR ALL`, covering `DELETE`. The migration's own
comment on the append-only tables, 400 lines earlier, names this exact hazard: "Note the shape: `FOR
SELECT` and `FOR INSERT` as separate policies rather than one permissive `FOR ALL`. **`FOR ALL` would
cover UPDATE and DELETE too.**" The lesson is written down in one file and not applied in the other. So a
tenant can not only rewrite the price it recorded, they can delete the whole record of what was quoted at
the gate — which is the single fact the table exists to preserve, and the thing that made H7's resolution
work at all. `rejected_seal_line` rows block the delete (`ON DELETE RESTRICT`), so in practice this
affects a rejected seal whose lines were never pushed — the offline failure case, i.e. the likely one.

The test at `documents-core.test.ts:584` asserts `rejected_seal_line` cannot be updated. No test attempts a
`DELETE` on `rejected_seal`, so the claim's real boundary is unmeasured. This is a Rule 21.1 miss: the
comment states its coverage from what it intended (append-only facts, one admitted gap) rather than from
what the policy grants.

**What it would cost if built as written.** The evidential value of the rejected-seal record is that the
tenant cannot tidy it away. A dispute about what price was given at the gate is answerable only if the row
survives the tenant's preference that it did not.

**Suggested resolution.**
1. Replace the single policy with `FOR SELECT`, `FOR INSERT` and a narrow `FOR UPDATE`, and **no DELETE
   policy** — the shape the append-only block in the other migration already establishes and explains.
2. Add the `DELETE`-is-refused test, and one that an `UPDATE` to `total_minor` is refused once the
   column-level problem is addressed (a `BEFORE UPDATE` trigger refusing any change outside
   `resolution`/`resolved_at`/`version` is expressible and would close the gap the comment concedes,
   rather than delegating it to the application).

---

# Executed evidence (Rule 21.7 — the state, not the exit code)

Four of the six blockers above are not arguments from reading; they were **executed against the
migrations as committed**. The probe replays all twelve migrations into an in-memory PGlite database,
creates the `pryvis_app` role with the same grants `db/test-support/index.ts` uses, and attacks from
that unprivileged role. It lives in the scratchpad and **wrote nothing to the repository** — no file
under `new-app/` or `docs/` was created or modified except `docs/PRD-REVIEW-4.md`.

```
$ cd C:\dev\JamQuote\new-app\db && node <scratchpad>/probe.mjs
migrations applied: 12

[setup] accepted total / ceiling = 100000

J2: invoice for 5,000,000 against a ceiling of 100,000 was INSERTED. rows = [{"amount_minor":5000000}]
J2: issue_balance.invoiced_total_minor = 0
J2: quote_issue_state = sealed_awaiting_number

J10: revision 2 sealed AND accepted while revision 1 is accepted+invoiced.
J10: state(rev1) = superseded | ceiling(rev1) = 100000
J10: state(rev2) = sealed_awaiting_number | ceiling(rev2) = 130000
J10: total live ceiling across the quote = 230000

J4: negative variation of -20,000 INSERTED (committed, append-only).
J4: apply() now raises -> invoiced total 90000 exceeds the ceiling 80000 for issue f0000000-…-020
J4: balance still says variations_total = 0 (the -20,000 row is uncounted), invoiced = 90000
J4: the issue is now stuck — any further invoice raises -> invoiced total 90001 exceeds the ceiling 80000

J3: as tenant A, can I see tenant B's issue? no (RLS holds for reads)
J3: tenant A INSERTED a 'declined' acceptance against tenant B's issue. FK and unique index both bypassed RLS.
J3: tenant B can no longer accept its own issue -> duplicate key value violates unique constraint "acceptance_issue_key"
J3: tenant B's view of acceptances on its issue = []
J3: tenant B's ceiling for its own accepted issue = 0

J16: DELETE on rejected_seal affected rows = 1 | rows remaining = 0
J14: SELECT on registration_claim with no tenant in context -> allowed, count=0
J14: SELECT on app_credential  with no tenant in context -> allowed, count=0
J14: SELECT on mfa_totp        with no tenant in context -> allowed, count=0
J14: SELECT on mfa_recovery_code with no tenant in context -> allowed, count=0
```

Reading each block against the claim it tests:

- **J2 confirmed.** An invoice fifty times the ceiling was inserted by the unprivileged application
  role with no call to `issue_balance_apply`, and `issue_balance.invoiced_total_minor` stayed at 0.
  The migration's sentence "an invoice cannot exist without passing through this function" is false as
  executed.
- **J10 confirmed, and worse than argued.** One quote now carries **230,000 of live ceiling** for a job
  quoted at 100,000 then 130,000. Revision 1 reports `superseded` and simultaneously reports a ceiling
  of 100,000 — the two functions returning contradictory answers about the same row, in the same
  transaction.
- **J4 confirmed.** The negative variation committed; `issue_balance_apply` then raised; the balance
  row still reports `variations_total = 0`, so the append-only agreement is permanently uncounted; and
  every subsequent invoice on that issue raises. The issue is a dead end with no in-product exit.
- **J3 confirmed exactly, including the victim's blindness.** Tenant A could not *read* tenant B's
  issue (RLS holds for reads — that half is sound), and could still *write* a declining acceptance
  against it. Tenant B's own acceptance then failed on `acceptance_issue_key`, and B's query for
  acceptances on its own issue returns `[]` — the blocking row is invisible to the only party who
  needs to know it exists. B's ceiling is 0 and B has no way to discover why.
- **J14 and J16 confirmed** as described.

---

# Verified sound — what was checked and found correct

A review that only reports problems gives no signal about what is safe, so these were attacked and held.

- **The write-flag ordering in `issue_balance_apply` is correct, and the comment explaining it is
  right.** `PERFORM set_config('pryvis.balance_write','on',true)` before the `SELECT … FOR UPDATE` is
  necessary, for exactly the reason stated: a locking read is checked against the UPDATE policy's
  `USING` clause, so with the flag down the row is filtered out of its own lock. This is the one thing
  in the batch that reading alone would not have found, and the migration says so.
- **The flag cannot leak past an exception.** I looked specifically for the "flag raised, never
  cleared" path the brief asked about. Both `RAISE` sites in `issue_balance_apply` and the one in
  `issue_balance_open` abort the (sub)transaction, and PostgreSQL rolls back `set_config(…, is_local
  := true)` on subtransaction abort — so a caller wrapping the call in a plpgsql `EXCEPTION` block, or
  a savepoint, gets the flag restored. Calling the function twice in one transaction is also safe: it
  raises, works, clears, each time. **The flag is scoped as tightly as the comment claims.** (What is
  *not* sound is the writer claim built on top of it — see J2 — but the flag mechanism itself is
  correct.)
- **`ON CONFLICT DO NOTHING` in `issue_balance_open` is the right choice**, and the stale-`accepted_
  total` worry the brief raised cannot arise: `acceptance_issue_key` makes a second acceptance per
  issue impossible, so `issue_balance_open` is reachable at most once per issue in practice. The
  `DO NOTHING` is defence against a double call in one transaction, and it does the right thing.
  (That the second acceptance is impossible is itself a product problem — J13 — but the conflict
  clause is not the defect.)
- **Immutability by the absence of a policy works, and is the strongest idea in the batch.** `FORCE
  ROW LEVEL SECURITY` plus `FOR SELECT`/`FOR INSERT`-only policies genuinely refuses UPDATE and DELETE
  for every role including the owner, and the suite proves it on `quote_issue`, `acceptance`,
  `issue_balance` and `rejected_seal_line`. My own probe confirmed the `issue_balance` DELETE and
  UPDATE refusals. The reasoning for choosing this over a grant — "the harness grants write on every
  table, so a control a harness can defeat is one that is never tested" — is correct and is the right
  instinct.
- **RLS holds for reads across the whole Documents core.** My probe could not read another tenant's
  `quote_issue` or `issue_balance` even with the id in hand. The tenancy predicate is canonical
  (`nullif(current_setting('app.tenant_id', true), '')::uuid`) and identical on all 26 policies,
  `policy-parity.test.ts` asserts migration/policy-file agreement, and the "no tenant set returns
  nothing" case is tested. J3 is a *write*-side gap, not a read-side one.
- **Money is `BIGINT` everywhere it should be.** I checked every amount column in all twelve
  migrations: no `NUMERIC`, `DECIMAL`, `REAL`, `DOUBLE PRECISION`, `MONEY` or `FLOAT` appears.
  `quantity_thousandths` is `BIGINT` too, so quantity×price is a 64-bit product. At the owner's stated
  ceiling (99,999,999,999 minor units) there is no overflow risk in any sum I can construct. **The
  arithmetic is sound; what is missing is the test that says so** (J1) and the header-to-lines tie
  (J11). `tax_rate_basis_points` as an `INTEGER` basis-point figure is the right shape (Rule 3).
- **No `CHECK` constraint contradicts another.** I read all of them: `quote_issue_total_check`,
  `rejected_seal_total_check`, `invoice_amount_positive_check`, `credit_note_amount_positive_check`,
  the three enum checks, and `rejected_seal_resolution_check`. They are mutually consistent and none
  is unsatisfiable.
- **The append-only tables have no cascade escape.** I traced every `ON DELETE` clause. Each FK on an
  append-only table is `RESTRICT`, and the only `CASCADE`s (`quote_section`, `quote_line` from `quote`)
  are on the mutable working quote, which is correct. No trigger deletes anything. So a row cannot
  disappear through a parent deletion — the exception is J16, which is a missing `FOR` clause rather
  than a cascade.
- **`20260926100000_variation_idempotency` is a good migration.** The partial unique index on
  `(issue_id, client_reference) WHERE client_reference IS NOT NULL` is the right shape, scoped to the
  narrowest thing that stops the duplicate that matters, and its "what this does not do" is honest
  about the application's half. J7 is that this lesson was not carried to `acceptance_evidence`, not
  that this migration is wrong.
- **H1, H5, H6, H8 and H12's dispositions are accurate on the defect each finding named.** Checked
  against the amended text, not the table. H1: §6.2a and the `invoice` row say "recorded" and
  deliberately do not restate the arithmetic — no remaining sentence says "accepted variations" as a
  statement of the rule. H5 and H6: §6.3 is a single table of state meanings naming
  `quote_issue_state()` as the definition, §8's rival diagram is gone, and I could find no second
  state machine in the file. H8: `registration_claim` sits beside the `user` row with the interlock
  explained, and the two halves are tested. H12: R1.32b-c genuinely remove the queue rather than
  specifying one, and the reasoning (automatic FIFO would spend a scarce allowance on a possibly
  abandoned job) is sound. **H2 is the exception — see J12.**
- **The test suite runs green and the count is real.** `npm test -w @pryvis/db` → `Test Files 5
  passed (5) · Tests 67 passed (67) · Duration 82.09s`. The three gate tools pass:
  `check_citations.py` → "scanned 150 tracked files"; `check_rules.py` → "64 rules defined · 657
  citations across 56 distinct rules"; `check_dispositions.py` → "40 dispositions claiming Closed,
  checked across 3 review files".
- **`policy-parity.test.ts` has two controls most guards here do not**, and they are worth keeping: a
  **stale-exemption check** (it already caught a bogus `_prisma_migrations` entry on its first run) and
  an assertion that fires if every table turns out to be exempt, i.e. if the guard checked nothing.
  That is Rule 21 done properly. J14 is about the breadth of one category, not about the guard's
  construction.
- **The `FUNCTION_GUARDED` category asserts the write-flag predicate's text** rather than describing
  it, so ADR 0025 decision 2 is checked. That is the right upgrade over the prose list it replaced.

---

# What this review did not examine (Rule 21.4)

- **The application layer, entirely.** There is no `new-app/api` or `new-app/web` code for Documents
  yet, so every finding about "the application must call this" is a finding about an obligation, not
  about code that gets it wrong. When that code exists it needs its own review.
- **Concurrency.** My probe is one PGlite connection, exactly as the suite's own limit states. I did
  **not** test two simultaneous invoices, two devices sealing at once, or lock contention on
  `issue_balance`. The two-connection test against real Postgres is still owed, and nothing here
  reduces that debt. In particular J10's double-ceiling was demonstrated **serially**; whether it also
  races is unexamined.
- **PGlite is not Postgres.** Everything I executed ran on PGlite. RLS, FORCE RLS, policies, triggers
  and `set_config` all behaved as the manual describes, and the J3 result matches the documented
  RI-bypass rule — but a difference between PGlite and a real server would not have shown up here.
  J3 in particular should be re-confirmed against Postgres 16 before the fix is designed.
- **The other eight migrations.** I read `20260925120000` onward closely and only skimmed the seven
  pre-Documents migrations (tenant isolation, sessions, credentials, rate limit, staff MFA, row
  identity, audit log, MFA corrections). J14 concerns tables those migrations created, and I did not
  review their contents — only that they have no RLS. **Staff MFA, credentials and sessions have had
  no code review in any of the four passes.**
- **`schema.prisma`.** I checked the columns J9 and J11 concern and relied on
  `schema-migration-parity.test.ts` (4 tests, passing) for the rest. I did not read all 909 lines, and
  I did not check relation directions, `@@index` choices or Prisma-side defaults.
- **`row-convention.test.ts`.** Read only its exemption list and the header comment. I did not audit
  what it asserts, so its coverage claim is unverified by me.
- **I did not plant a defect and watch a test fail.** Rule 1.5's plant discipline applies to the
  *fixes* for these findings, not to the findings themselves, and I was scoped to read-only on the
  project tree. Every "no test covers this" statement comes from reading the test file and grepping,
  not from removing a mechanism and observing green.
- **The other three tools' exemption lists.** I read `check_citations.py` in full (J1) and
  `check_rules.py`/`check_dispositions.py` only by their output and their exemption-related lines. I
  did **not** audit `check_dispositions.py`'s citation arithmetic — review 3 did not either, so that is
  now two passes owed on the tool that gates Rule 24.6.
- **Legal, tax and jurisdiction.** Nothing here judges whether the acceptance ladder clears any
  evidential bar in Jamaica. ADR 0024's attorney question stays open and J5 does not touch it.
- **Rounding, GCT, markup and discount.** Absent from the schema by design, so absent here. That is
  the largest unreviewed money surface in the product.

---

# Summary

| # | Sev | One line |
|---|---|---|
| **J1** | blocker | `check_citations.py` skips every `db/…`-relative citation (19 of them), and `db/test/money-convention.test.ts` — a guard the migration credits for all money typing — does not exist |
| **J2** | blocker | Nothing stops an invoice being inserted without `issue_balance_apply`; three files claim the opposite. **Executed: 5,000,000 invoiced against a 100,000 ceiling** |
| **J3** | blocker | No child row is tied to its parent's tenant, and FK/unique checks bypass RLS. **Executed: tenant A permanently blocked tenant B from accepting its own quote, invisibly** |
| **J4** | blocker | A negative variation commits and is then permanently uncounted; the issue becomes unbillable and unreconcilable. **Executed: stuck at invoiced 90,000 vs ceiling 80,000** |
| **J5** | blocker | Grade 5 (tenant-uploaded signature) breaks the ladder's own third-party principle and contradicts PRD R1.20c and ADR 0024, which both say it is uncertified and forgeable |
| **J6** | blocker | "The grade is derived" is asserted in three documents and defined in none; deposit-against-a-decline is undefined, and §7's derivation plant contradicts §7's immutability plant |
| **J7** | blocker | Grade 4's "exactly four preparations" miss the uniqueness key on the inbound message id — M18 pre-committed onto append-only evidence — and the reply-address preparation names no artefact |
| **J8** | blocker | The acceptance bar is set on the mutable `quote`, never frozen into the issue, so it can be changed after the client has the document; `document_settings` does not exist |
| **J9** | blocker | `document_render` does not exist, and `acceptance.document_render_id` — F17's whole fix — is nullable with no foreign key |
| **J10** | blocker | `quote_issue_state()` says superseded while `issue_ceiling_minor()` says fully invoiceable; "withdraw first" has no owner. **Executed: 230,000 of live ceiling on one quote** |
| **J11** | major | `quote_issue.subtotal_minor` is not tied to its own frozen lines, and the ceiling derives from the header, not from what the client saw |
| **J12** | major | H2 deleted one prose writer list and left another two lines above it, wrong about credit notes and about variations |
| **J13** | major | One acceptance per issue forever: an accidental decline is terminal, and a withdrawn acceptance can never be re-accepted although the state says `issued` |
| **J14** | major | The RLS exemption list covers the four tables holding credential material; "exempt with a reason" is not default-deny. **Executed: all four readable with no tenant in context** |
| **J15** | minor | `acceptance_withdrawal_guard()` counts voided invoices, so a voided mistake permanently removes the withdrawal remedy |
| **J16** | minor | `rejected_seal`'s policy has no `FOR` clause, so it is `FOR ALL`: the row can be deleted outright. **Executed: affectedRows = 1** |

**Ten blockers, four majors, two minors.** Eleven of the sixteen are in the code, which no previous
review had read. The prior held: **this round's work introduced new defects, and the densest cluster is
in the newly approved design and in the commit that closed review 3.**

Three patterns, and they are the same three every pass has found:

1. **A comment crediting a mechanism that is not there** — J1, J2, J9, J12. That is M14's class for the
   fourth, fifth, sixth and seventh time, now inside the migration built to end it and past the checker
   built to catch it. Rule 24.4 says the mechanism is decorative, and J1 says exactly which line of it.
2. **An invariant scoped to the wrong entity** — J10 (per issue, needed per quote), J3 (per row, needed
   per parent). Both survive every existing test because every existing test uses the right scope.
3. **A claim closed in the paragraph and left standing in the table beside it** — J12, and J5/J6 across
   documents. This is F1/M13/H1 for the fourth time, and `check_dispositions.py` cannot see it, which
   Rule 24.6 already says about itself.

---

# The two questions, answered plainly

**Is the Documents schema safe to build an application on? No — not yet, and the reason is specific
rather than general.**

The schema's *structure* is good. Immutability by the absence of a policy is the right mechanism and it
works; the write-flag trick on `issue_balance` is correct, including the ordering that only execution
revealed; the tenancy predicate is canonical and holds for reads; money is integer minor units
throughout. If the structure were the problem I would say rebuild it, and I do not.

What is not safe is that **the single most important invariant in the product — how much may be
invoiced — is not enforced by the database, is scoped to the wrong entity, and has no exit when it
refuses.** J2, J10 and J4 are one defect seen from three sides: the ceiling is a function the
application must remember to call (J2), it measures an issue when it should measure a quote (J10), and
when it does fire it can leave a job permanently unbillable (J4). Any application built on this today
can over-bill a client, double-bill a client, or strand a job, and in each case every database
invariant reports itself satisfied and the reconciliation job certifies the result. J3 adds a
cross-tenant write path that permanently disables another tenant's acceptance with no trace they can
see.

These are fixable without redesign. J2 is a deferred constraint trigger. J10 is one clause in one
`CREATE OR REPLACE`, plus a decision. J3 is composite foreign keys. J4 is a decision about direction.
None of them touches the parts that are sound. **Build the fixes first, in migrations, with the tests
that go red without them — then build on it.**

**Is the acceptance design safe to build? No, and it should not be built from as it stands.** Its §1 and
§2 are the best writing in the batch: the statement that no tenant-supplied address proves anything
against the tenant is correct, and naming it before anything else is the right instinct. But the design
then (a) inverts its own ordering principle at grade 5 and contradicts two approved documents about the
same artefact (J5), (b) asserts a derived grade without defining the derivation for any conflicting
case (J6), (c) closes a list of preparations at four when the fifth is the one that stops a replayed
webhook duplicating append-only financial evidence (J7), and (d) leaves the acceptance bar mutable on a
document already sent (J8) while depending on a `document_render` table that does not exist (J9).

By Rule 16.5's own test — "if a design is not precise enough for Sonnet to build from, the design is
not finished" — this design is not finished. It is close. J5, J6 and J7 are each a decision and a
paragraph; J8 and J9 are each a column. The owner's approval of 2026-09-26 stands on the shape, which is
right; **the independent-review gate should stay closed until these five are answered**, which is what
the design's own header says it is for.

One last note, offered as the most useful thing in this review. Four passes have now found the same
three patterns, and the mechanisms written after each pass were aimed at the *instance* rather than the
*class*: a checker for cited filenames, then for identifiers in migrations, then for disposition
citations. Each one worked and each one was routed around by the next occurrence. J1 shows the current
checker's blind spot is not subtle — it is one `continue` — and J12 shows `check_dispositions.py`
cannot see the defect it was built for when the stale claim sits in a table rather than a sentence.
By Rule 24.5, the test for the next mechanism is whether it would have caught **all four** of J1, J2,
J9 and J12. A checker that resolves every backticked identifier and path in every tracked file against
the actual schema and filesystem, with no root-relative bail-out and no Markdown exemption, would have
caught all four. That is one tool, not a fifth review.

---

## Housekeeping: this file needs the review-register exemption

`tools/check_citations.py` exempts `docs/PRD-REVIEW.md`, `-2` and `-3` with the reason "A review
register: naming a broken citation is its job." **`docs/PRD-REVIEW-4.md` must be added to
`EXEMPT_DOCS` with the same reason**, because J1 and J9 exist only by naming
`db/test/money-convention.test.ts` and `document_render`, which are precisely the phantoms being
reported (Rule 21.8's own exemption note: "an exemption belongs to why a document exists, not to how a
sentence happens to be worded").

Two things worth recording about running it against this file:

- Staged, it currently passes **without** the exemption — but only because of the blind spots J1 and J9
  describe: `db/test/money-convention.test.ts` is skipped for being root-relative, and
  `document_render`, `decline_withdrawal`, `acceptance_evidence` and `document_settings` are skipped
  because identifier checking runs only inside migrations. **So fixing J1 and J9 will make this file
  fail the gate**, and the exemption must land in the same change as either fix, not after it.
- Unstaged, the tool reports it honestly rather than silently, which is the M19 fix working:

```
$ python tools/check_citations.py
scanned 150 tracked files

NOTE: 1 untracked file(s) were NOT scanned, because this reads git ls-files. Stage them and run
again before trusting a green result:
  docs/PRD-REVIEW-4.md
Every cited path, filename and symbol resolves.
```

That note is a genuinely good control and it did its job here. Keep it.

**Disposition table.** Deliberately not started. Per Rule 24.6 a row may not claim `Closed` without
citing every document its finding's `Where:` line named, and per Rule 1.10 every finding must be closed
or accepted in writing with a reason. Sixteen rows are owed, and none of them is mine to write.

---

# Re-review of the J4 fix (commit 06e9b73), findings K1-K6

**Reviewer:** `commit-reviewer` agent (Opus class), 2026-09-26, commissioned under Rules 1.10 and 24.6. **Did not write** the commit under review. Appended here verbatim from the file it wrote as it worked; the probe scripts it names (`probe/…`, `plant.py`) lived in the session scratchpad and are **not** retained in the repository, so its CONFIRMED results are reproducible from the steps described, not from those files. The author independently re-ran K3, K4 and K6 and observed the same output.

## J4 re-review of 06e9b73 (Rule 1.10 / 24.6 independent re-review)

Rules applied: 0 (read RULES.md), 1.5 (a test counts once shown failing), 1.10 + 24.6 (re-review of a closed blocker),
4.1 (composite tenant keys), 6 (no edit of committed migration; plants only, restored), 16.1/16.3 (plant+restore via backup, quote commands),
16.5 (money arithmetic is judgement-class), 21.1-21.4, 21.7 (state what controls do not prove; quote state), 22.1-22.3.

### Findings

### K1 · A credit note inserted before this migration can leave an issue permanently unwritable; the migration neither validates nor recomputes existing rows — minor (major if any database already holds new-app documents data)
- Where: new-app/db/migrations/20260926200000_scope_reduction/migration.sql:85-96 (issue-wide over-credit scan, including VOIDED invoices) and :42-44 (claim "No stuck state can be entered"); same claim in docs/design/scope-reduction.md:34-35 and docs/design/README.md (scope-reduction row: "no stuck state can be entered").
- CONFIRMED. Probe `node probe/p2.mjs` (scratchpad): migrations applied up to 20260926190000, invoice 40,000 credited 50,000 (the pre-J4 function did not look at credit_note), then 20260926200000 applied as superuser.
  Output quoted:
  ```
  OK    pre-J4: credit 50000 on 40000 invoice
  J4 migration applied over existing data without error
  RAISE post-J4: invoice 1 -> credit notes on invoice ...0008 would total more than the invoice itself
  RAISE post-J4: variation +50000 -> (same)
  RAISE post-J4: variation -1 -> (same)
  RAISE post-J4: void the over-credited invoice -> (same)
  RAISE post-J4: void the other invoice -> (same)
  RAISE post-J4: credit the other invoice -> (same)
  OK    post-J4: bal (cache still pre-J4 figure) {"a":100000,"v":0,"i":50000,"c":100000}
  ```
- Failure scenario: any issue carrying an over-credited invoice at migration time (including a VOIDED one — the scan at :87-92 has no void filter) can never again take an invoice, a variation of either sign, a void, or a credit. No in-product remedy; void does not escape. The design's "no stuck state can be entered" is true only of an empty database. Secondary: the migration does not re-run issue_balance_apply() for existing issues, so every issue with pre-existing credit notes keeps a gross invoiced_total_minor cache (observed "i":50000 above) until its next write — a stale figure for any reader of the cache.
- Not established: whether any deployed database has the new-app documents migrations applied (pre-launch; not examined).

### K2 · The voided-invoice credit refusal gives a reason the arithmetic does not have: nothing would be subtracted twice — minor (overclaim in a user-facing message and two comments; no money defect)
- Where: new-app/db/migrations/20260926200000_scope_reduction/migration.sql:35-36 ("a credit there would subtract money twice") and :187-188 (RAISE text "a credit note against it would subtract money the void already removed"); docs/PRD.md R1.25 and domain-model.md credit_note row repeat the refusal without the reason.
- CONFIRMED. Probe `node probe/p3.mjs`: migrations applied, then issue_balance_enforce() replaced in-memory with the void check disabled (`IF false THEN`), invoice 50,000 kept, invoice 40,000 voided, credit 40,000 on the voided one. Output:
  ```
  before credit on voided (void check disabled): {"a":100000,"v":0,"i":50000,"c":100000}
  OK    credit 40000 on voided invoice
  after: {"a":100000,"v":0,"i":50000,"c":100000}
  RAISE invoice 50000 more ... exceeds the ceiling 100000 ... by 1
  ```
- The netting at :104-110 excludes voided invoices whole, so their credits never enter the sum. The refusal is document hygiene (design §3's "meaningless" branch), not a guard against double subtraction; the message tells the contractor something false about why. Also consequence for tests: plant P3 (check removed) is caught only by the message/row-count assertion, correctly — no money assertion could catch it because there is no money effect.

### K3 · No test pins that a credit note nets only against ITS OWN issue: a netting that lets a credit on job X make room on job Y passes all 113 db tests — major (test gap on money arithmetic; the shipped code is correct)
- Where: new-app/db/migrations/20260926200000_scope_reduction/migration.sql:104-110 (the netting); new-app/db/test/documents-core.test.ts J4 block (:416-583) and J12 credit test (:361-378) — every credit-note test uses one issue.
- CONFIRMED, plant executed on the real file via `python3 plant.py P6-cross-issue-netting-fulldb ...` (backup copy, anchor count asserted == 1, restored, `diff -q` empty). Planted netting: this issue's unvoided gross MINUS every unvoided credit note in the tenant (no invoice/issue correlation). Result: `Tests  113 passed (113)` for `npx -w @pryvis/db vitest run`; restored `diff -q output: [] rc= 0`. (Same plant against documents-core alone: `Tests  71 passed (71)`.)
- Effect of that plant, executed (`node probe/p6.mjs` vs `node probe/p6.mjs plant`): issues X and Y each accepted at 100,000; X invoiced 60,000 and fully credited; Y invoiced 100,000; then Y +60,000:
  ```
  RAISE [real] invoice Y +60000 over its 100000 ceiling -> ... exceeds the ceiling 100000 ... by 60000
  OK    [planted] invoice Y +60000 over its 100000 ceiling
  ```
  i.e. the product's "most important arithmetic invariant" (R1.24) broken by 60,000 on job Y with the suite green. The commit's "five plants" all perturb within one issue; the cross-issue shape (brief attack 1) has no test. Rule 1.5 / 16.5: this is exactly the green-suite money defect class.

### K4 · The "credit note and a fresh quote" remedy (R1.15b, amended by this commit) now RE-OPENS the full ceiling on the old issue, which can then never be withdrawn or superseded — two live ceilings on one job, the J10 shape — major (introduced for the credit path; the void path already had it)
- Where: docs/PRD.md:200-203 (R1.15b as amended: "That path is for a wrong document ... Until J4 the credit note half of both did nothing"); new-app/db/migrations/20260926200000_scope_reduction/migration.sql:104-110 (netting); interacting with 20260926110000_withdrawal_preconditions (withdrawal refused while ANY invoice exists, voided or credited) and 20260926140000_one_live_ceiling_per_quote (new revision refused while any invoice exists).
- CONFIRMED. `node probe/p7.mjs` runs the same sequence against migrations up to 20260926190000 and against all migrations: accept X 100,000, invoice 100,000, credit it whole (wrong document), try to withdraw, try to seal revision 2, then invoice X again 100,000.
  ```
  RAISE [pre-J4] withdraw acceptance of X -> cannot withdraw this acceptance: 1 invoice(s) exist ...
  RAISE [pre-J4] seal revision 2 of the same quote -> ... (finding J10)
  OK    [pre-J4] bal X {"a":100000,"v":0,"i":100000,"c":100000}
  RAISE [pre-J4] invoice X again 100000 after the credit -> invoiced total 200000 exceeds the ceiling 100000
  RAISE [post-J4] withdraw acceptance of X -> cannot withdraw this acceptance: 1 invoice(s) exist ...
  RAISE [post-J4] seal revision 2 of the same quote -> ... (finding J10)
  OK    [post-J4] bal X {"a":100000,"v":0,"i":0,"c":100000}
  OK    [post-J4] invoice X again 100000 after the credit
  ```
- Failure scenario: contractor issues a wrong invoice, follows the documented remedy (credit it, issue a fresh quote — which must be a NEW quote, because J10 refuses a revision). The fresh quote is accepted at 100,000 and billed. The old issue now also shows 100,000 of unbilled room, permanently: withdrawal is refused (invoice count 1) and it cannot be superseded (J10). The DB will accept a further 100,000 against the old issue; the job's combined billable ceiling is 200,000. Pre-J4 the credit left the old issue's room consumed (safe side). The void path already produced this shape before J4 (voided invoices are excluded and still counted by the withdrawal guard) — so this is the one-of-two-twins shape: J4 made the credit twin behave like the void twin without either one gaining a way to close the old ceiling. Neither the design (§3 "a credited amount can be invoiced again") nor R1.15b states that the remedy leaves the old issue live and unclosable.

### K5 · One-of-two-twins: sentences the same commit made false, left standing beside the lines it did amend — minor (documentation; the executed test is right)
All CONFIRMED by reading the file at HEAD (commands: `sed -n 306,315p docs/design/domain-model.md`, `grep -rn -i "credit note" ...` quoted in the report):
1. docs/design/domain-model.md:314 — "it credited a credit note as a writer of `invoiced_total_minor`, which it is not and was never meant to be". Since 20260926200000 a credit note IS a writer of that column (the J12 test at documents-core.test.ts:361 now asserts invoiced 40,000 -> 25,000). The commit edited the same section at :321 and :328 and left :314.
2. new-app/db/test/documents-core.test.ts:316-319 — the J12 describe-block header: "crediting a credit note as a writer of `invoiced_total_minor`, which it has never been". The test forty lines below in the same block was rewritten by this commit to assert the opposite.
3. docs/design/domain-model.md:308 — `invoiced_total_minor` "derived cache, re-summed from issued invoices": no longer the definition (net of credit notes). Same table the commit's §6.2a amendment sits under.
4. docs/design/domain-model.md:399 — "Once either exists the remedy is a credit note and a fresh quote." PRD R1.15b was amended in this commit to split wrong-document from less-work remedies; its twin in the domain model was not.
5. docs/MISTAKES.md:370-378 (M23) — "which it has never been ... now executed ... including a credit note moving nothing". Append-only ledger, so not editable, but M27 (added by this commit) does not record that M23's "Prevented by" line is now false.
6. Doctrine: ADR 0025 Decision 1 (docs/adr/0025-five-invariants-move-from-prose-to-code.md:41-43) says "Neither document restates the arithmetic; both link to it", and M23 records prose restatement as the failure "not taken" a third time. This commit restates the arithmetic ("net of credit notes and excluding voided invoices") in PRD R1.24, R1.25, domain-model §6.2a (twice) and the invoice and credit_note table rows — i.e. the same fact is now in prose in six places again, three of which item 1-3 show already drifted in the same commit.

### K6 · "No stuck state can be entered" is false: a quote_issue insert can drop an invoiced issue's ceiling to 0 (J10's guard checks only ONE accepted prior revision), after which the issue refuses every write except crediting or voiding ALL it has billed — major (pre-existing J10 defect; falsifies J4's central claim)
- Where: the claim — new-app/db/migrations/20260926200000_scope_reduction/migration.sql:42-44 ("Every row that can raise the invoiced figure (`invoice`) or lower the ceiling (a negative `variation`) is checked in its own transaction ... So the check never fires against history it cannot change"), docs/design/scope-reduction.md:34-35, docs/design/README.md scope-reduction row. The cause — new-app/db/migrations/20260926140000_one_live_ceiling_per_quote/migration.sql:108-120 (`SELECT prior."id" INTO v_blocking ... LIMIT 1`, then counts invoices on that one prior only). The hand-listed set at :42-44 omits two writes that lower the ceiling without passing through issue_balance_apply(): a later `quote_issue` (ceiling -> 0 via issue_ceiling_minor's supersession branch) and `acceptance_withdrawal` (ceiling -> 0). Taxonomy #6: correctness asserted over hand-listed cases; the defect is in an unlisted one.
- Found by a random-sequence fuzz (`node probe/fuzz.mjs`: `{ runs: 150, ops: 3750, okOps: 1006, stuck: 1 }`, `STUCK issue ... {"a":106,"v":0,"i":32,"c":0}`), then reproduced deterministically. CONFIRMED, `node probe/p9.mjs` (same sequence pre-J4 and post-J4):
  ```
  OK    [post-J4] accept r2 while r1's acceptance is still live
  OK    [post-J4] r2 after invoice {"a":100000,"v":0,"i":90000,"c":100000}
  OK    [post-J4] seal r3 (J10 should refuse: r2 is accepted with an invoice)
  OK    [post-J4] r2 now {"a":100000,"v":0,"i":90000,"c":0}
  RAISE [post-J4] r2: variation +50000 -> invoiced total 90000 exceeds the ceiling 0 ... by 90000
  RAISE [post-J4] r2: invoice 1 -> ... by 90001
  RAISE [post-J4] r2: credit 10000 -> invoiced total 80000 exceeds the ceiling 0 ... by 80000
  OK    [post-J4] r2: credit 90000 (whole)
  ```
  Pre-J4 the same sequence ends with every write refused including the whole credit (`RAISE [pre-J4] r2: credit 90000 (whole) -> invoiced total 90000 exceeds the ceiling 0`); only a void escapes. Control (`node probe/p9b.mjs`): with r1 NOT accepted, sealing r3 IS refused ("revision 2 is accepted and has 1 invoice(s)"), isolating the cause to LIMIT 1 picking the earlier, invoice-free accepted revision.
- Failure scenario: contractor seals r1, client accepts; contractor revises to r2 (allowed, nothing billed), client accepts r2; 90,000 billed on r2; contractor seals r3. The DB accepts r3, and job r2 now carries 90,000 invoiced against a ceiling of 0 — R1.24 violated at rest — and the issue refuses any further variation, invoice or partial credit. J4 changes the escape from "void only" to "void or credit the full 90,000": there is still no way to keep the legitimately billed money and continue. Not introduced by 06e9b73, but it is exactly the state the commit, design and README assert cannot be entered.

## Author's five plants, re-executed (plant.py: backup copy, anchor count == 1, restore, diff -q empty each time)
- P1 netting removed -> 5 failed | 66 passed (J12 credit test + 4 J4 tests)
- P2 over-credit check disabled -> 2 failed (larger-than-invoice; across several notes)
- P3 voided-credit check disabled -> 1 failed (REFUSES ... already voided)
- P4 voided credits subtracted twice -> 1 failed (drops a voided invoice's earlier credit notes)
- P5 shortfall dropped from message -> 2 failed (names the shortfall; rolls the credit back)
- My P6 cross-issue netting -> 0 failed, db 113/113 (K3)

## Gate (uncached: npx turbo run typecheck test --force --concurrency=1)
Tasks 10 successful, 10 total; Cached 0; api 183, db 113, contract 2, core 9, web 11 passed. Checkers: check_rules "66 rules defined · 763 citations"; check_dispositions "40 dispositions claiming Closed, checked across 3 review files"; check_citations "scanned 164 tracked files ... resolves"; check_schema_citations "scanned 163 files against 28 tables, 8 functions, 7 triggers, 38 policies; 0 citations skipped"; all exit 0.
Final git status --porcelain: empty.

---

# Second re-review of the J4 line (commits c35952d and 8e8236a), findings L1-L6

**Reviewer:** `commit-reviewer` agent (Opus class), 2026-09-27, commissioned under Rules 1.10 and 24.6; tier declared in `BRIEF-STATUS.md` before launch. **Did not write** either commit. Appended verbatim from the file it wrote as it worked; its probes (`probe/…`, `plant.py`) lived in the session scratchpad and are not retained. The author independently re-ran L1 (section B) and L3 (plant W2) and observed the same output. **Its verdict: none of J4, J10 or J15 should be marked Closed on this evidence.**

## Second independent re-review of c35952d (K6/J10) and 8e8236a (K4/J15/K1/K2/K3/K5)

Reviewer: commit-reviewer (Opus class), 2026-09-27. Did not write either commit. Rules applied: 0, 1.5, 1.10/24.6,
4.1, 6, 16.3, 16.4, 16.5, 21.1-21.4, 21.7, 22.1-22.3. Probes: scratchpad/review2/probe/*.mjs (PGlite, SET ROLE pryvis_app).

### L1 · K4's twin: with any variation on the issue, the wrong-document remedy still reopens the whole ceiling and nothing closes it except an undocumented zeroing variation; the fresh quote must be a SEPARATE quote — two live ceilings on one job — major
- Where: new-app/db/migrations/20260926220000_withdrawal_after_full_credit/migration.sql:221-263 (guard: any variation blocks);
  docs/PRD.md R1.15b ("Once either exists, the path is a credit note and a fresh quote. That path is for a wrong
  document: void or fully credit each invoice, then withdraw ... then issue the next revision"); docs/design/scope-reduction.md §3a;
  docs/design/domain-model.md withdrawal paragraph ("Once a variation exists, the acceptance stays.").
- CONFIRMED, `node probe/k4.mjs` section B: r1 accepted 100,000, variation +10,000, invoice 110,000, credited 110,000 (the
  documented wrong-document remedy):
  ```
  RAISE withdraw r1 -> cannot withdraw this acceptance: 1 recorded variation(s) exist ...
  RAISE seal r2 of same quote -> cannot seal revision 2 of this quote: revision 1 is accepted and has 1 invoice(s) and 1 variation(s) ...
  OK    bal r1 after full credit {"a":100000,"v":10000,"i":0,"c":110000}
  OK    fresh quote as separate quote: seal / accept fresh / invoice fresh 100000
  OK    invoice OLD r1 again 110000 (reopened ceiling)
  OK    bal r1 {"a":100000,"v":10000,"i":110000,"c":110000}
  ```
  Section B2: the only closure is a variation of -110,000 taking the ceiling to exactly 0 (`OK variation -110000`, bal c:0);
  withdrawal and a next revision stay refused for ever after (`RAISE withdraw r1 ... 2 recorded variation(s)`, `RAISE seal r2 ...`).
- Failure scenario: exactly K4's, for the case the owner's decision excluded. A wrong document is found after one variation
  was recorded. Following R1.15b the contractor credits the invoice in full; the old issue now has 110,000 of room again, can
  be neither withdrawn (variation) nor superseded (J10), so the "fresh quote" has to be a separate quote and the job carries
  two live ceilings (210,000 billable for one job). No document states this remains, and none names the zeroing-variation
  closure. R1.15b's "path ... then withdraw ... then issue the next revision" is unreachable once a variation exists, and the
  PRD sentence says "Once either exists" — i.e. it prescribes that path for the variation case too.

### L2 · A variation already recorded on a superseded revision (legal until c35952d) makes the quote permanently unrevisable after the migration; the migration neither detects it nor says so — minor (major if any database holds new-app documents data)
- Where: new-app/db/migrations/20260926210000_live_ceiling_every_revision/migration.sql:52-72 (guard now counts a variation on
  ANY accepted non-withdrawn earlier revision, superseded ones included) and :31-38 ("WHAT THIS DOES NOT DO" — silent on existing
  rows). The migration's own header (:19-22) predicts this exact consequence ("would then block every later revision of the
  quote, permanently") but only prevents NEW such rows.
- CONFIRMED, `node probe/k6pre.mjs`: migrations up to 20260926200000; r1 accepted, r2 sealed, `+30000` variation on superseded r1
  (`OK [pre-K6] variation +30000 on superseded r1`), r2 accepted and invoiced; then 210000 and 220000 applied as superuser:
  ```
  RAISE withdraw r1 (superseded, has variation) -> cannot withdraw this acceptance: 1 recorded variation(s) exist ...
  RAISE seal r3 -> cannot seal revision 3 of this quote: revision 1 is accepted and has 0 invoice(s) and 1 variation(s) against it. Money has moved ...
  OK    bal r1 {"a":100000,"v":30000,"i":0,"c":0}
  ```
- Failure scenario: the quote can never be revised again, the refusal blames a revision whose ceiling is 0 and on which "money
  has moved" is false, and r1 can never be withdrawn. Same class as K1 (a migration that changes what history means without
  validating history). Not reachable on a fresh database: the twin check refuses new such variations (confirmed, k4.mjs F).

### L3 · The random walk's oracle is the code under test: a netting defect that over-bills by 50% and the original J10 two-live-ceilings defect both leave it green; it reaches withdrawal-after-full-credit zero times — major as a guard weakness (not a user-visible defect)
- Where: new-app/db/test/no-stuck-state.test.ts:216-227 (both "stuck" and "overCeiling" are judged by `issue_balance_apply()`'s
  own sum and `issue_ceiling_minor()`'s own ceiling; the walk keeps no model of what was invoiced/credited/agreed), :1-42 header
  (the Rule 21.4 section does not state this limit), commit c35952d message ("asserting no issue is stuck or above its ceiling").
- CONFIRMED, plants on the real file new-app/db/migrations/20260926220000_withdrawal_after_full_credit/migration.sql via
  `python3 plant.py` (backup copy, anchor count asserted == 1, restore, `diff -q` empty), running
  `npx -w @pryvis/db vitest run test/no-stuck-state.test.ts`:
  - W2 netting subtracts each invoice's credits twice (`- 2 * (SELECT COALESCE(SUM(c."amount_minor"), 0) ...`):
    `✓ seed 1 ... ✓ seed 2 ... Tests 2 passed (2)`, `restored; diff -q output: '' rc=0`.
    Effect (`node probe/w2demo.mjs`): `[real] invoice 100000 more after a 50000 credit -> RAISE ... exceeds the ceiling 100000 by 50000`
    vs `[W2] ... OK`, `[W2] true net billed {"net":"150000"}` on a 100,000 ceiling, and the walk-style check `apply ok` with
    `{"a":100000,"v":0,"i":100000,"c":100000}` — 50,000 over-billed and the walk's own figures say "at ceiling".
  - W1 `issue_ceiling_minor()` without its supersession branch (review 4's original J10 blocker) appended as a CREATE OR REPLACE:
    `Tests 2 passed (2)`, restored, `diff -q` empty. Effect (`node probe/w1demo.mjs`): `[W1] billed on the quote {"s":"230000"}`
    for a 130,000 job, both balances "apply ok".
  - Control, W3 withdrawal guard ignoring billed invoices (`IF v_billed > 0 THEN` -> `IF false THEN`): walk RED, `rc=1`, a list of
    stuck issue ids at `expect(result.stuck).toEqual([])` — so the walk does catch permissive withdrawals.
- Reach, measured (`node probe/walkcount.mjs`, the walk's generator ported with counters, both seeds): withdrawals that succeeded
  on an issue with an unvoided, fully credited invoice: **0 and 0**; with a voided invoice: 2 and 2; withdrawals refused as billed
  26/28. The K4 decision's main path is never walked, and the asserted floors (succeeded/examined/invoicedIssues) cannot notice.
- Consequence: the walk proves "no sequence makes `issue_balance_apply()` raise at rest" and nothing about whether the figures it
  raises on are right. Any defect that errs on the permissive side — the class that over-bills a client — is invisible to it by
  construction. It must not be cited as covering J10, K3 or K4, and its header should say what it trusts.

### L4 · Three parts of the two fixes have no test that fails when they are reverted — minor (test gaps; the shipped code is right in each case)
- CONFIRMED, each via `python3 plant.py` on the real migration, `npx -w @pryvis/db vitest run` (all 124 db tests), restored, `diff -q` empty:
  1. **K6's twin, the "no longer accepted" half** (20260926220000.../migration.sql:184-191; claimed in c35952d's message: "refuses a
     variation on an issue that is superseded or no longer accepted"). Plant `OR NOT EXISTS (` -> `OR false AND NOT EXISTS (`:
     `Tests 124 passed (124)`. Effect (`node probe/c3demo.mjs`): `[real] +30000 variation on a WITHDRAWN (not superseded) issue -> RAISE ...`
     vs `[C3] ... OK`, `bal {"a":100000,"v":30000,"i":0,"c":0}` — agreed work recorded on a withdrawn document, the H4 shape.
     The twin test uses only a superseded revision.
  2. **K2's corrected reason** (migration.sql:198-201). Plant restoring the old "would subtract money the void already removed" text:
     `Tests 124 passed (124)`. The false user-facing message K2 was about can return silently; the voided-credit test matches only a
     substring common to both texts.
  3. **The balance lock in the withdrawal guard** (migration.sql:229-233). Plant deleting the `IF EXISTS ... PERFORM issue_balance_apply ... END IF;`
     block: `Tests 124 passed (124)`. The commit and BRIEF-STATUS say "NOT proved", which is honest; recorded so the gap is not read as covered.
- Author's claimed plants, re-executed (all RED as claimed): c35952d "first-match" -> 3 failed (the K6 J10 test + both walk seeds);
  "twin" -> 1 failed (K6's twin test), walk green as its header says. 8e8236a: every invoice counted -> 3 failed; credits ignored ->
  2 failed; variations ignored -> 2 failed; no zero floor -> 1 failed (K1 test); no over-credit check -> 3 failed; tenant-wide netting
  -> 7 failed (incl. K3 test); issue-wide scan restored -> 1 failed (K1 test). Plus voided-credit refusal disabled -> 1 failed.

### L5 · Stale and overclaimed sentences the two commits left or wrote — minor (documentation)
- CONFIRMED by reading at HEAD:
  1. docs/design/domain-model.md:406-408 and docs/PRD.md R1.15 ("This applies to an issue that has NOT been accepted ... once accepted,
     the path is a variation"): "withdraw first" as the ordering for superseding an accepted issue. c35952d's design depends on the
     opposite — an accepted revision with no money is superseded WITHOUT withdrawal and stays "live-but-inert"
     (20260926210000.../migration.sql:33-35; the J10 control test `K6 · still allows revision 3 when no live revision has money`
     executes it). Neither commit amended these; the one-of-two-twins shape again.
  2. docs/adr/0025-five-invariants-move-from-prose-to-code.md:131-134: "once extra work has been agreed on top of an acceptance ... the
     path is a credit note and a fresh quote" presented as the safe consequence — with a variation, that path is L1's reopened ceiling.
     Not amended by 8e8236a, which amended the same rule's other statements (PRD R1.15b, domain model).
  3. docs/MISTAKES.md M28: "after 1,900+ writes per seed". The walk ATTEMPTS fewer: ops 6, 7 and 9 are skipped when their list is
     empty. `node probe/walkattempts.mjs` (the walk's generator ported with a counter): `seed 1 attempted=1619`, `seed 2 attempted=1635`
     (the test's own comment gives 877-914 successful). Overclaim of the guard's size, the Rule 21.1 class. (Port, not the test file
     itself; the generator and selection logic are copied verbatim.)
  4. docs/design/scope-reduction.md:34-39: "No stuck state can be entered ... It is now executed by `no-stuck-state.test.ts` ... with the
     limits its header states" — the header does not state L3's limit (oracle = code under test), and L2 shows the unrevisable state is
     still enterable from existing data. The "withdrawn-issue variation" guard (L4.1) is unexecuted.
- Checked and found corrected/discoverable: "subtract money twice" survives only in the committed 20260926200000 (:36, :187) and
  20260926210000 (:140) migrations, both superseded by 20260926220000, whose header (:45-50) quotes and corrects it; scope-reduction.md:42
  and :70 use "twice" about a voided invoice's own credits, which is true. No live document still states "refused while any invoice exists";
  the remaining hits (20260926110000 message, 20260926140000 header, PRD-REVIEW-3 H5 row) are superseded migrations or history.

### L6 · A seal of revision N+1 racing a VARIATION on revision N lets the variation land on a superseded revision — minor, PLAUSIBLE (read, not raced)
- Where: 20260926220000.../migration.sql:180-192 (twin check reads `quote_issue_state()` with no lock shared with `quote_issue` inserts);
  20260926210000.../migration.sql:52-72 (the seal guard takes no lock on the prior revision's balance row).
- Reasoning: T1 inserts r3 and its guard sees r2 without money (T2's variation uncommitted); T2 inserts a variation on r2, takes r2's
  balance lock, and its twin check sees r2 not superseded (T1 uncommitted). Both commit. Result: the L2 state — r2 superseded, accepted,
  with a variation, never withdrawable, and every later revision refused. c35952d names only the seal/INVOICE race (whose damage is a
  stuck issue); the seal/variation race, whose damage is a permanently unrevisable quote, is not named. Not executable on one PGlite
  connection.

### Gate (uncached)
`cd new-app && npx turbo run typecheck test --force --concurrency=1`: `Tasks: 10 successful, 10 total`, `Cached: 0 cached, 10 total`;
api 183, core 9, contract 2, db 124 (7 files), web 11 passed. check_rules "66 rules defined · 779 citations across 57 distinct rules" rc=0;
check_dispositions "40 dispositions claiming Closed, checked across 3 review files" rc=0; check_citations "scanned 166 tracked files" rc=0;
check_schema_citations "scanned 166 files against 28 tables, 8 functions, 7 triggers, 38 policies; 0 citations skipped" rc=0.
Final `git status --porcelain`: empty. HEAD unchanged at 3672490 throughout.

---

# Third re-review of the J4 line (commit 23ca3a5), findings N1-N10

**Reviewer:** `commit-reviewer` agent (Opus class), 2026-09-27, commissioned under Rules 1.10 and 24.6; tier declared in `BRIEF-STATUS.md` before launch (`7649c0a`). **Did not write** the commit. Appended verbatim from the file it wrote as it worked; its probes and race scripts lived in the session scratchpad and are not retained. It raced real PostgreSQL 16 sessions for N4 and N5, the first executed concurrency evidence on this line. The author re-ran N2 and observed the same output, and confirmed N6 by reading. **Its verdict: J15 can be closed; J4 and J10 cannot on this evidence.**

### Third independent re-review of 23ca3a5 (J4, J10, J15; L1-L6)
Reviewer: commit-reviewer, Opus. Rules applied: 0, 1.5, 1.10, 4.1, 6, 16.1, 16.3, 16.4, 16.5, 21.1-21.4, 21.7, 22.1-22.3, 24.6.
Findings are appended as found.

### N1 — PRD R1.22c still says revising an accepted issue is refused (one of two twins, L5 again). Severity: medium (documents; R1.15 and R1.22c contradict each other)
Where: docs/PRD.md:344-345.
CONFIRMED by reading HEAD:
  $ sed -n 344,345p docs/PRD.md
  - **R1.22c** Revising an **accepted** issue is refused in R1. The path is a variation, not a new issue —
    which prevents the two-accepted-issues state the model tests as impossible.
The commit rewrote R1.15 (docs/PRD.md:187-192) to say "An accepted issue may be superseded only while nothing
financial hangs off it", and cites R1.22c from that very sentence ("the path is a variation (R1.22c)"), and
states that until 2026-09-27 R1.15 wrongly said a revision applied only to a non-accepted issue (L5). R1.22c,
four lines of the same PRD further down, still says the old rule, and additionally claims the
two-accepted-issues state is "impossible" — false: an accepted revision with nothing against it may be
superseded and the next revision accepted, leaving two rows with outcome 'accepted' and no withdrawal (the
repo's own J10/K6 tests build exactly this). The brief asked for this sentence shape by name.

### N2 — The seal guard now RAISES when the latest revision is accepted but has no balance row; before this commit that seal succeeded. Severity: minor (introduced; a legitimate seal is refused with a message about the wrong thing; escape exists via withdrawal)
Where: new-app/db/migrations/20260927100000_withdrawal_with_variations/migration.sql:120 (`PERFORM issue_balance_apply(v_latest);`
unguarded), contrast :59-61 in the SAME migration, where the withdrawal guard wraps the identical call in
`IF EXISTS (SELECT 1 FROM "issue_balance" ...)`. issue_balance_apply() raises no_data_found on a missing row (20260926220000:83-87).
Nothing in the schema forces issue_balance_open() with an acceptance (no trigger on "acceptance"; R1.24a states it as the caller's duty).
CONFIRMED, probe/p1.mjs section A1 (PGlite, SET ROLE pryvis_app), HEAD vs the same migrations minus 20260927100000:
  HEAD:  OK    accept r1 WITHOUT issue_balance_open []
         RAISE seal r2 -> issue_balance row missing for issue f0000000-...0001; it is created with the acceptance, and a FOR UPDATE on no row takes no lock at all
  old:   OK    seal r2 "f0000000-0000-4000-8000-000000000003"
Failure scenario: an acceptance written by any path that does not also call issue_balance_open() (a sync replay, an import, a
future caller that forgets — the walk itself never generates one, it always opens in the same attempt) now also blocks the next
revision of the quote, with SQLSTATE no_data_found and text that talks about locks rather than the seal. The walk cannot see it:
no-stuck-state.test.ts:329 skips every issue without a balance row. No test covers the seal-with-no-balance-row case.

### N3 — J13 is still open and the commit makes it the common path: a withdrawn issue reads "issued" although it can never be accepted, now including after invoices and variations. Severity: major as J13 (pre-existing, not introduced; not claimed fixed); the path onward is NOT dead
Where: quote_issue_state() (20260925120000_documents_core/migration.sql:502-526, ELSE 'issued'); acceptance_issue_key
(20260926180000_tenant_composite_keys/migration.sql:186).
CONFIRMED, probe/p1.mjs section B1 (issue numbered, accepted 100,000, +10,000 variation, invoice 60,000 fully credited, invoice
50,000 voided, withdrawn):
  OK    withdraw r1 (var+10000, i1 fully credited, i2 voided)
  OK    state r1 after withdrawal "issued"
  RAISE re-accept r1 (J13) -> duplicate key value violates unique constraint "acceptance_issue_key"
The onward path works: after withdrawal r2 sealed, accepted and invoiced 110,000; r1 then reads "superseded", ceilings [0,110000];
every financial write on r1 is refused except a void of the already fully credited invoice, which moves no figure
(`OK void credited i1 on withdrawn r1`; bal r1 {"a":100000,"v":10000,"i":0,"c":0}).
What the tenant sees between withdrawal and the next seal: a document with a variation and two invoices shown as "issued" —
i.e. awaiting the client — which the client cannot accept. Before L1 this state was reachable only without variations.

### N4 — The L6 lock is taken only if the revision's acceptance is already VISIBLE to the seal; a seal racing an acceptance still lands an invoice (or variation) on a superseded revision — K6's stuck state, entered by concurrency. Severity: major if reached (stuck issue with money on it), low likelihood; pre-existing, NOT introduced, but the L6 claim overstates what the fix covers
Where: new-app/db/migrations/20260927100000_withdrawal_with_variations/migration.sql:106-120 — the NOT EXISTS acceptance test
returns before `PERFORM issue_balance_apply(v_latest)`, with no lock; the migration's L6 text (:30-35) says "one waits for the other".
Nothing an acceptance or issue_balance_open() does takes a lock the seal also takes.
CONFIRMED on a real PostgreSQL 16.13 (scratch cluster, 127.0.0.1:55439, two/three psql sessions; probe/race.py, race2.py, output
probe/race2.out), database headdb = all migrations, olddb = all but 20260927100000:
  L6 as claimed, seal first then variation on accepted r1:
    headdb: ERROR: issue ... is superseded or no longer accepted ...   RESULT r1 state=superseded ceiling=0 vars=0
    olddb:  (variation commits)                                         RESULT r1 state=superseded ceiling=0 vars=1
  L6 reverse order, variation first:  headdb: seal ERROR "cannot seal revision 2 ... 0 invoice(s) and 1 variation(s)"; olddb: both commit, vars=1.
  seal first then invoice on r1:      headdb: ERROR exceeds the ceiling 0; olddb: RESULT invoiced=1 on superseded r1.
  => the L6 fix works, in both orders, when r1's acceptance is committed before the seal reads it. Credit where due.
  But, r1 sealed and NOT yet accepted; session A: BEGIN; seal r2 (open); session B: accept r1 + issue_balance_open (autocommit);
  session C: invoice 50,000 on r1 (autocommit); A: COMMIT:
    headdb: RESULT r2 exists=true r1 state=superseded r1 ceiling=0 r1 vars=0 r1 invoiced=1
  and with B = BEGIN; accept r1; variation +30,000; COMMIT inside A's open seal:
    headdb: RESULT r2 exists=true r1 state=superseded r1 ceiling=0 r1 vars=1
  The same probe run earlier (race1.py) then showed every later write on r1 refusing:
    apply r1: ERROR: invoiced total 50000 exceeds the ceiling 0 ... by 50000
    variation -1 on r1: ERROR: invoiced total 50000 exceeds the ceiling 0 ...
Failure scenario: the contractor seals revision 2 (a transaction that stays open while its lines are written) at the moment the
client accepts revision 1 from the link already sent, and a deposit invoice is raised on revision 1: revision 1 ends superseded
with 50,000 invoiced against a ceiling of 0 — K6's stuck state; only crediting or voiding all of it gets out. The second variant
is L2's state (a variation on a superseded revision), which since this commit no longer blocks the quote but is exactly what
"the variation that waits then sees the committed revision and is refused" says cannot happen.
Claims affected: migration :30-35 ("so one waits for the other"); design §3b ("The seal takes that revision's balance lock, so a
variation racing the seal waits and is then refused"); commit message ("L6: a seal could race a variation" listed as fixed). The
commit's "not proved" list says the lock is read, not raced — so this is recorded as a gap in a stated-as-unproved claim, now
executed. Note also that nothing refuses an acceptance of an already-superseded issue (accepting r1 after r2 committed succeeds
and opens a balance row), which is what makes the acceptance side lock-free.

### N5 — The seal now takes a balance-row lock, so a transaction mixing a variation/invoice on one quote with a seal on another can deadlock. Severity: informational (introduced; PostgreSQL detects it and aborts one transaction, no data wrong; the application, not built, will need to retry SQLSTATE 40P01)
Where: new-app/db/migrations/20260927100000_withdrawal_with_variations/migration.sql:120.
CONFIRMED, real PostgreSQL 16.13, probe/race3.py: quotes Q1 and Q2 each with r1 accepted. A: BEGIN; variation on Q1.r1; seal Q2.r2.
B: BEGIN; variation on Q2.r1; seal Q1.r2.
  headdb, A: ERROR: deadlock detected ... CONTEXT: while locking tuple (0,2) in relation "issue_balance" ... PL/pgSQL function
             quote_issue_one_live_ceiling() line 34 at PERFORM;  B then commits its seal (A's variation rolled back).
  olddb: no error at all — and both seals committed over variations on the revisions they superseded (the L6 defect).
So the new behaviour is the correct trade (a retryable abort instead of silent corruption). Recorded because the brief asked about
lock order, and because an offline-outbox replay that batches writes on several quotes in one transaction would meet it.
No inversion found between a seal and a withdrawal or variation on the SAME quote (each takes only r_latest's balance row, and
the seal takes nothing before it).

### N6 — A ceiling that silently drops the tax passes all 126 db tests; the walk cannot see it because every issue it seals has tax 0, and its header does not say so. Severity: major as a test gap on money arithmetic (the shipped code is correct); guard weakness, not a user-visible defect
Where: new-app/db/test/no-stuck-state.test.ts:231 (`'Terms', 0, $6, 0, $6` — tax_rate 0, subtotal = total, tax 0), header :57
("One tenant, small amounts, no declines and no issue numbering" — no mention of tax); oracle :178 takes the ceiling from
quote_issue.total_minor, the DB from issue_balance.accepted_total_minor written by issue_balance_open()
(20260925120000_documents_core/migration.sql:607).
CONFIRMED, plant P1 via scratchpad/review3/plant.py (backup, anchor count asserted 1, restore, diff -q):
  `SELECT q."tenant_id", q."total_minor" INTO v_tenant, v_total` -> `q."subtotal_minor"`; `npx -w @pryvis/db vitest run`:
    walk seed 1: {...,"stuck":0,"disagreements":0,"overCeiling":0,"twoLiveCeilings":0}
    walk seed 2: {...,"stuck":0,"disagreements":0,"overCeiling":0,"twoLiveCeilings":0}
    Test Files  7 passed (7)   Tests  126 passed (126)
    restored; diff -q output: '' rc=0
Failure scenario it would let through: a client accepts 100,000 + 15% GCT = 115,000; the balance row records 100,000; the final
invoice for 115,000 is refused ("exceeds the ceiling 100000 by 15000") — every GCT-registered tenant under-billed or blocked on
every job. The oracle, described as "independent", agrees with the database on this defect by construction of its inputs. Not
introduced by this commit; recorded because the commit's claim is that the oracle makes the walk a check on the figures.

### N7 — The walk does not guard the path this commit exists for; M31's "the walk now exercises withdrawal after full credit with variations present" rests on ONE occurrence across both seeds, and no floor asserts it. Severity: minor (overclaim of a guard's coverage, Rule 21.1; guard weakness, not a user-visible defect)
Where: docs/MISTAKES.md M31 "Prevented by" (added by 23ca3a5); new-app/db/test/no-stuck-state.test.ts:286 and :390
(`hadMoney` = any invoice exists, voided ones included; floor `withdrawalsAfterMoney > 2`); commit message "reach asserted
(full credits, withdrawals after money)".
CONFIRMED, (1) instrumenting the walk temporarily (scratchpad/review3/instr.py; backup, restore, diff -q '' 0; walk counts identical
to the untouched run) — per successful withdrawal, the state of its issue at that moment:
    withdrawals seed 1: {"ok":94,"superseded":30,"withVariation":20,"fullyCredited":1,"voided":11,"fullyCreditedAndVariation":1,"liveFullyCreditedAndVariation":1}
    withdrawals seed 2: {"ok":94,"superseded":41,"withVariation":10,"fullyCredited":1,"voided":6,"fullyCreditedAndVariation":0,"liveFullyCreditedAndVariation":0}
  so "withdrawalsAfterMoney" 12 and 7 are 11+1 and 6+1: voided-invoice withdrawals (J15) carry the floor; K4's full-credit
  withdrawal occurs once per seed, and L1's (full credit WITH a variation) once in seed 1 and never in seed 2.
(2) plant P2 — the withdrawal guard counting a fully credited invoice as still billed (`>` -> `>=`, i.e. K4 and L1 reverted for
  the credit path): the walk stays green, only unit tests catch it:
    walk seed 1: {...,"withdrawalsAfterMoney":11,"stuck":0,"disagreements":0,...}   walk seed 2: {...,"withdrawalsAfterMoney":6,...}
    × K4 ... allows withdrawal once the invoice is fully credited ...   × K4 ... L1 · withdraws a wrong document WITH a variation ...
    Tests  2 failed | 124 passed (126); restored; diff -q output: '' rc=0
  Likewise P3 (seal ignoring withdrawal — the "frees the next revision" half of L1): walk green, 2 unit tests red.
The unit tests hold K4 and L1; the walk must not be credited with them. M31's mechanism sentence is the part that is false.

### N8 — "The oracle is written from the PRD's words, not from the SQL" is false for its netting rule: the PRD delegates that rule to the function under test, so the oracle's per-invoice zero floor can only have been copied from the SQL. Severity: minor (overclaim about a guard's independence; guard weakness)
Where: new-app/db/test/no-stuck-state.test.ts:22-24 and :127-128 ("Net billed (R1.24, R1.25): ... never below zero");
docs/MISTAKES.md M30 ("from the PRD's wording and sharing no SQL"). Against docs/PRD.md R1.24 (:356-359): "What counts as
invoiced is defined once, in `issue_balance_apply()`, and not restated here".
CONFIRMED by reading: `grep -n -i "below zero\|never below\|floor" docs/PRD.md` returns nothing on the netting (output above in the
review log); the floor is K1's `GREATEST(0, ...)` in 20260926220000_withdrawal_after_full_credit/migration.sql:95-100. R1.24/R1.25 cited
by the oracle say that credits lower the invoiced figure and never raise the ceiling; neither says an invoice counts as zero
rather than negative. So on netting, the two "implementations" share a source; a defect in K1's floor is one both would agree on.
Executed consequence (not a user-visible defect): the walk cannot exercise the floor at all — the over-credit check refuses any
credit that would make it bite — so the oracle's floor is never compared against anything the database could get wrong on a
fresh database. The supersession/withdrawal rules (R1.15, R1.15c) are genuinely stated in the PRD and the oracle follows them.

### N9 — PRD R1.15b, amended by this commit, still says the variation case is "enforced by a database trigger" and that once a variation (or a balance row) exists "the path is a credit note and a fresh quote" — the sentence L1 quoted, left standing beside the amendment that reverses it. Severity: minor (documentation; one of two twins inside one paragraph)
Where: docs/PRD.md:198-208, specifically :201-204:
  "... the same release created two other things that hang off an acceptance — a balance row and immutable variations — so the
   typo remedy had become a way to detach agreed money from the issue it was agreed against. Enforced by a database trigger, not by
   the caller. Once either exists, the path is a **credit note and a fresh quote**."
CONFIRMED by reading HEAD (sed -n 198,208p docs/PRD.md). Two sentences earlier the same paragraph says "Variations no longer block
it". Read in order, R1.15b now says variations do not block withdrawal AND that a trigger enforces that they do; and "either"
includes the balance row, which every accepted issue has, so literally it says every accepted issue's path is a credit note and
a fresh quote. The second re-review's L1 quoted "Once either exists" as a sentence prescribing an unreachable path; it survives.
Related, milder: docs/adr/0025-five-invariants-move-from-prose-to-code.md:126 keeps the bullet lead "**Withdrawal is refused while
any variation exists** ... now enforced by a trigger" ABOVE the dated amendment, whose text says "The paragraph below is kept as
the reasoning of its day" — the bullet lead above it is not marked, and it is the sentence a reader skimming the decisions sees.

### N4, variant (b) — the seal picks "the latest revision" BEFORE it waits for the lock and never re-picks after it (added as found)
CONFIRMED, real PostgreSQL 16.13, probe/race4.py (headdb) and race4old.py (olddb): r1 accepted, nothing billed. A: BEGIN; seal r2
(judges r1, takes r1's balance lock, passes); B: BEGIN; seal r3 — its guard chooses r1 as "latest" (r2 uncommitted) and then
WAITS on r1's lock; A: accept r2, invoice 40,000 on r2, COMMIT; B resumes, re-counts money on r1 only (0), passes, COMMIT:
  headdb:  1|superseded|0|0   2|superseded|0|1   3|sealed_awaiting_number|0|0
           apply r2: ERROR: invoiced total 40000 exceeds the ceiling 0 ... by 40000
  olddb:   identical result.
Pre-existing (same outcome without this commit), but it contradicts the migration's own argument (:30-35, and :38-39 "each
statement inside the function takes a fresh snapshot after the lock"): the fresh snapshot is used to count money on a row
chosen from the stale one. "At most one live ceiling" still holds — only the maximum revision is ever unsuperseded, which the
unique (tenant, quote, revision) index makes structural — so J10's two-live-ceilings shape is NOT reachable this way; the
money-stranding half (K6's stuck state) is.

### N10 — The L6 lock has no failing test: deleting it leaves all 126 db tests and both walk seeds green. It DOES work on real PostgreSQL (N4's first two cases), so this is a test gap, which the commit acknowledges. Severity: minor (test gap; shipped code right within N4's limits)
Where: new-app/db/migrations/20260927100000_withdrawal_with_variations/migration.sql:120.
CONFIRMED, plant A8 (`  PERFORM issue_balance_apply(v_latest);` deleted), `npx -w @pryvis/db vitest run`:
    walk seed 1: {...,"stuck":0,"disagreements":0,"overCeiling":0,"twoLiveCeilings":0}  walk seed 2: {... same zeros}
    Test Files  7 passed (7)   Tests  126 passed (126)   restored; diff -q output: '' rc=0
Recorded because Rule 1.5 says a fix without a failing test is not proved; the commit's "Not proved" paragraph says so too. The
two-connection harness used for N4 (probe/race.py, a scratch PostgreSQL 16 cluster) is the shape that would hold it.

### Author's eight plants, re-executed — all reproduce as claimed (no finding)
plant.py, each backed up, anchor asserted unique, restored, `diff -q` '' rc=0; full `npx -w @pryvis/db vitest run` each:
- K6 back (latest -> earliest, `DESC`->`ASC`): walk stuck 15 / 9 (overCeiling 15 / 9); unit: K6 test and L2 test red. Tests 4 failed | 122 passed.
- W2 credits twice: walk disagreements 10 / 10; unit: 4 red (J12 credit, J4 x3). 6 failed | 120.
- W1 supersession removed: walk disagreements 88 / 89, twoLiveCeilings 43 / 43, overCeiling 5 / 6; 5 J10 unit tests red. 7 failed | 119.
- W3 withdrawal ignoring billed: walk stuck 20 / 15; 2 unit red. 4 failed | 122.
- variations block again: L1 test and rewritten H4 test red; WALK GREEN (withdrawalsAfterMoney 4 / 6, floor is >2) — see N7.
- withdrawn half of twin check removed: L4 test red (+ rewritten H4 test); walk green.
- old K2 message restored: "REFUSES a credit note against an invoice that is already voided" red.
- whole L1 guard change reverted (new withdrawal guard renamed away so 20260926220000's is live): 2 unit red; walk green.
My additional plants: P1 subtotal as accepted total — nothing red (N6); P2 full credit counted as billed — 2 unit red, walk green
(N7); P3 seal ignoring withdrawal — 2 unit red, walk green; P4 ceiling ignoring withdrawal — 5 unit + walk red (stuck 1/5,
disagreements 21/22, overCeiling 11/15); P5 ceiling RAISE removed — 15 unit + walk red via overCeiling ONLY (43/49; stuck 0,
disagreements 0), so overCeiling is not vacuous and is the walk's only catch for that plant; P6 twin's superseded half removed —
1 unit red, walk green, as its header states (:46-48); P7 seal ignoring variations — 1 unit red, walk green.

### Gate (uncached), after all plants restored
`cd new-app && npx turbo run typecheck test --force --concurrency=1` (scratchpad/review3/gate.out): Tasks: 10 successful, 10 total;
Cached: 0 cached, 10 total; rc=0. core 9, contract 2, api 183 (13 files), db 126 (7 files), web 11. Walk: seed 1 succeeded 1347,
examined 287, withdrawalsAfterMoney 12; seed 2 1357 / 279 / 7; all four defect counts 0.
check_citations "scanned 167 tracked files" rc=0; check_dispositions "40 dispositions claiming Closed, checked across 3 review
files" rc=0; check_rules "66 rules defined · 787 citations across 57 distinct rules" rc=0; check_schema_citations "scanned 167 files
against 28 tables, 8 functions, 7 triggers, 38 policies; 0 citations skipped" rc=0.
Final `git -C /home/user/Jam-Quote status --porcelain`: empty. HEAD 7649c0a throughout; no change to the tree observed from outside.

---

# Fourth re-review of the J4 line (commit cfeac92), findings P1-P7

**Reviewer:** `commit-reviewer` agent (Opus class), 2026-09-27, commissioned under Rules 1.10 and 24.6; tier declared in `BRIEF-STATUS.md` before launch (`e1180b8`). **Did not write** the commit. Appended verbatim from the file it wrote as it worked; its probes lived in the session scratchpad and are not retained. It raced real PostgreSQL 16.13, including 150 unscheduled seal/accept/invoice races with 0 violations under READ COMMITTED. The author re-ran P1 and observed the same output under all three isolation levels. **Its verdict: J15 closable on substance once a checkable disposition row exists; J4 and J10 not, on P1 (the fix holds only under READ COMMITTED, which nothing enforces).**

### Fourth re-review of cfeac92 (J4/J10/J15 line)

Rules applied: 0, 1.5, 1.10, 4, 4.1, 6, 16.3-16.5, 21.1-21.4, 21.7, 22.1-22.3, 24.6.

### P1 — HIGH (latent) — the quote lock is correct only under READ COMMITTED, and nothing enforces it
Where: new-app/db/migrations/20260927110000_one_lock_per_quote/migration.sql:27-29 (claim), :60-72 (lock), :97-107.
CONFIRMED on PostgreSQL 16.13 (probe `scratchpad/review4/probe/rr.mjs`, db r4probe, all migrations).
Scenario: rev1 accepted, balance open, nothing billed. Writer session: `BEGIN ISOLATION LEVEL <iso>`; reads
`quote_issue` (any first statement takes the snapshot). Another session seals rev2 (autocommit, allowed — nothing billed).
Writer invoices rev1 50,000 and commits. Output:
    repeatable read | seal: true | invoice: true  | commit: true  | rev1: {"inv":50000,"ceil":0,"st":"superseded"}
    serializable | seal: true | invoice: true  | commit: true  | rev1: {"inv":50000,"ceil":0,"st":"superseded"}
    read committed | seal: true | invoice: false 23514 | commit: true  | rev1: {"inv":0,"ceil":0,"st":"superseded"}
The shared lock is taken and granted, but the ceiling is judged on the transaction's old snapshot, in which rev2 does not
exist: N4's end state (50,000 billed against a ceiling of 0 on a superseded revision), reached without any race at all.
The migration's rationale "READ COMMITTED gives each statement a fresh snapshot" is stated as a fact, not as a
precondition; its "WHAT THIS DOES NOT DO" omits it; design §3c, PRD R1.15b and new-app/CLAUDE.md never mention isolation.
Only the test header (concurrency.pg.test.ts:29) says "the migrations assume it". Nothing checks
`current_setting('transaction_isolation')`; one `ALTER DATABASE ... SET default_transaction_isolation` or a Prisma
`isolationLevel` option (tenant-context.ts:102 uses interactive `$transaction`) silently disables the fix.
Not a regression versus the parent (the balance lock had the same snapshot dependence), but the claim is new.

### P2 — LOW (Rule 4 isolation; no money wrong) — the quote lock is not tenant-scoped: one tenant can hold another tenant's quote lock
Where: migration.sql:60-72 (`quote_money_lock(p_quote_id, …)`: no ownership check, EXECUTE is PUBLIC), :30-31 and :36-38 (claims).
CONFIRMED (probe `probe/xt.mjs`). Two UUIDs with equal hashtext, found by grouping 300,000 random UUIDs:
412245d4-1a26-480f-aa86-93e4f3680b53 and d4895c55-0c82-484f-90a0-b31df3f15341 (hashtext 485419273). X is tenant A's
quote, Y is tenant B's.
 (a) Ordinary app writes only: B seals its own quote Y in an open transaction; A's invoice on its own quote X blocks:
     `tenant A invoice on its own quote X waits on: advisory [{"locktype":"advisory","mode":"ShareLock","granted":false,"classid":725001,"objid":485419273,...}]`
     `A invoice after B commit: true waited ms: 1563`
 (b) Direct call with an id B cannot see: `tenant B sees X rows: 0 | quote_money_lock(X,true) as B: true`, then
     `A invoice waits on: advisory` until B rolls back. The helper `quote_money_lock_for_issue` resolves through RLS, but
     the lock function it wraps accepts any caller-supplied id (Rule 4: "A caller-supplied id is ownership-checked before use").
 (c) pg_locks is readable by the app role and shows the other tenant's lock key and mode:
     `pg_locks visible to tenant B: [{"locktype":"advisory","classid":725001,"objid":485419273,"mode":"ShareLock","granted":false},{..."mode":"ExclusiveLock","granted":true}]`
     — given a candidate quote id, B can observe when A's quote is being sealed or billed.
Claim vs observed: line 30-31 "writes on different quotes do not touch the same lock" is false under collision (line 37
concedes sharing but not that it crosses tenants). "Never correctness": with collisions, N5's deadlock (40P01) can be
delivered to a tenant whose own transaction touched only its own quote. Exploit needs SQL-level access for (b)/(c);
(a) needs a 1-in-2^32 collision per pair (birthday: ~1 colliding pair per ~93k quotes). Guard/isolation weakness, not a money defect.

### P3 — LOW (claim false; outcome is a detected deadlock, nothing left wrong) — "the order is always quote lock, then balance row lock, so no single-quote cycle exists"
Where: migration.sql:32 (claim), :48-51 (N5's stated scope). `issue_balance_apply()` (migration 20260926190000 / redefined
earlier) takes the balance row lock FOR UPDATE and is public; it does not take the quote lock. domain-model.md:338 calls it
one of the two "doors", notStuck() (concurrency.pg.test.ts:164) and the walk (no-stuck-state.test.ts:389) call it directly.
CONFIRMED (probe `probe/dl.mjs`, case D3), one quote, rev1 accepted with nothing billed:
  T1: BEGIN; SELECT issue_balance_apply(rev1)   -- balance row lock, no quote lock
  T2: BEGIN; seal rev2                           -- exclusive quote lock (allowed: nothing billed)
  T1: INSERT invoice on rev1                     -- waits on the quote lock ("D3 t1 waits: advisory")
  T2: SELECT issue_balance_apply(rev1)           -- waits on T1's balance row lock
Output: `D3 t1 invoice: 40P01 deadlock detected` / `D3 t2 recompute: ok`.
Neither transaction is in N5's stated scope ("mix writes on two quotes" / "write on a quote and then seal the same quote");
the cycle exists because one door to the balance lock skips the quote lock. For the record, the three-session variant
(T1 recompute-then-invoice, T2 single invoice, T3 single seal; case D2) did NOT deadlock — PostgreSQL rearranged the wait
queue: `D2 t1 invoice: ok / D2 t2 invoice: ok / D2 t3 seal: 23514 ... has 2`. A single-statement-only workload found no cycle.

### P4 — MINOR (guard weakness, not user-visible) — N4 (a)'s invoice refusal comes from a missing balance row, not from the seal; the race suite stays green with supersession no longer zeroing the ceiling
Where: new-app/db/test/concurrency.pg.test.ts:238-271 (esp. :254 `accept` outcome never asserted, :263 `expect(invoiced.ok).toBe(false)` with no reason checked).
CONFIRMED. Replica of N4 (a) (probe `probe/n4a.mjs`), 5 runs, printing the refusal:
    accept: true  | invoice: false P0002 issue_balance row missing for issue e5708100-...   (x5)
When the seal commits, the acceptance and the invoice are released at the same moment; the invoice's trigger runs before
`issue_balance_open` and is refused for the missing row. The seal's effect (ceiling 0 on a superseded revision) is never
what refuses it. The acceptance of the superseded revision SUCCEEDS and the test does not look.
Plant 1 (appended to the new migration: `issue_ceiling_minor` without its "superseded -> 0" branch — N4's end state
directly): race suite `Tests  6 passed (6)`; restored, `diff -q` clean. The PGlite suites do catch it
(`Tests  7 failed | 121 passed | 6 skipped (134)`: 5 J10 tests and both walk seeds), so no defect escapes the full gate;
but the one race titled "holds back ... an invoice on the revision it supersedes" does not test the invoice half of its
title. No race covers the direct N4 path: rev1 ALREADY accepted with a balance row, seal rev2 in flight, invoice rev1
(only the variation twin is raced, L6 test :330).

### P5 — MINOR (guard weakness) — two of the six races never touch the quote lock; the withdrawal's quote lock and the lock's "shared" mode have no failing test
Where: concurrency.pg.test.ts:355-380 (R1.24a) and :382-412 (K4); migration.sql:246 (withdrawal lock), :69 (shared).
CONFIRMED. In unplanted code the second session waits on the balance row, not the advisory lock (probe `probe/k4w.mjs`):
    K4 withdrawal waits on: transactionid [{"locktype":"transactionid","mode":"ShareLock","granted":false,...}]
    R1.24a second invoice waits on: transactionid [...]
Plants, each applied with an anchor-count==1 check and restored from backup (`diff -q` clean after each):
  J — delete `PERFORM quote_money_lock_for_issue(v_issue_id);` from acceptance_withdrawal_guard: `Tests  6 passed (6)`.
  K — `quote_money_lock_for_issue` takes the lock EXCLUSIVE (`false` -> `true`): `Tests  6 passed (6)`.
So "withdrawal ... take[s] it shared" (commit message) and "financial writes do not block each other" (design §3c,
migration :30) are claims with no test behind them (Rule 1.5). I could not construct a wrong money outcome from plant J
(without it, a racing seal is at worst spuriously refused and retried), and plant K costs only throughput, so these are
coverage gaps, not defects. `waitsOnLock()` (:68-80) accepts ANY `wait_event_type = 'Lock'`, which is why the K4 race
passes on the row lock; it does not check which lock (locktype 'advisory', classid 725001).
Author's claimed plant re-executed: shared branch -> `NULL;` fails N4 (a) and both L6 races with "never waited on a lock"
(3 failed) — reproduces as claimed.

### P6 — MINOR (documentation; one of two twins, M13/L5/N1/N9 pattern again) — three live sentences, two in files this commit edited, still describe the superseded mechanism or call the race "owed"
CONFIRMED by reading (grep and git blame quoted):
 (a) docs/design/scope-reduction.md:115-116 (§3b, blame 23ca3a57, left untouched while §3c was added below it):
     "The seal takes that revision's balance lock, so a variation racing the seal waits and is then refused."
     The same commit removed that call (migration :124 "no `issue_balance_apply()` here any more") and describes the
     replacement in §3c. §3b is not marked superseded (ADR 0025's twin bullet WAS marked).
 (b) docs/design/scope-reduction.md:181-182 (§7 "What this does not prove", blame 06e9b735):
     "Concurrency. The checks run under the balance row lock, and the suite is one PGlite connection, so that
     serialisation is read rather than raced. The two-connection Postgres test remains owed."
     The commit edited §2 of the same file to say the opposite ("§3c closes it and ... concurrency.pg.test.ts races it").
     The contradiction now sits inside one document.
 (c) new-app/db/test/documents-core.test.ts:18-20 (header, blame 21c1ce9e; this commit added the N2/N6 tests to the file):
     "Real concurrency needs a two-connection test against Postgres, and it is owed."
Not counted: committed migrations' historical comments (Rule 6 forbids editing them), and BRIEF-STATUS.md:160, a dated log entry.
Also imprecise (not counted as a finding): design §3c "financial writes do not block each other". Two writes on one issue
do block each other on the balance row (probe dl.mjs case D1: a variation behind an open invoice waited until the
15 s statement_timeout, 57014). The migration's own "WHAT THIS DOES NOT DO" states this correctly at :52-53.

### P2 addendum (d) — CONFIRMED: an ordinary seal INSERT naming another tenant's quote waits on that tenant's lock before it is refused
Where: migration.sql:99 — `quote_money_lock(NEW."quote_id", true)` runs in the BEFORE trigger, before the composite FK
(Rule 4.1) rejects the row. Probe `probe/foreign2.mjs`: A holds an open invoice on its quote; B inserts a quote_issue
naming A's quote id:
    B's seal attempt waits on: advisory
    B seal: 23503 after 1205 ms
A foreign id that is not in flight (or does not exist) is refused at once. So a foreign id is NOT "answered exactly as
one that does not exist" (Rule 4, last bullet): the latency reveals whether the other tenant's quote has a financial
write in flight, and B's request hangs for as long as A's transaction does. No persistent hold: when B's statement fails,
the aborted transaction releases the lock at once (`A's own invoice now waits on: null` after B's failed seal inside an
open BEGIN). Every other foreign write was refused by its composite FK, with A's figures unchanged (probe `foreign.mjs`):
invoice, acceptance, withdrawal, void and credit all 23503; B's `issue_balance_apply(A issue)` P0002 (row invisible).

### P7 — MINOR (claim not carried out; Rule 24.6 mechanism blind to it) — "J15 goes Closed in the disposition rows": no such row exists, and the disposition checker does not read review 4
Where: commit message's last paragraph; docs/BRIEF-STATUS.md:234 ("J15 goes Closed in the disposition rows");
tools/check_dispositions.py:50.
CONFIRMED:
    $ grep -rn "J15" docs/*.md | grep -i closed    -> only BRIEF-STATUS.md:189,196,210,234 and PRD-REVIEW-4.md:1503,1633 (narrative); no disposition row
    tools/check_dispositions.py:50: REVIEWS = ("docs/PRD-REVIEW.md", "docs/PRD-REVIEW-2.md", "docs/PRD-REVIEW-3.md")
    $ python3 tools/check_dispositions.py -> "40 dispositions claiming Closed, checked across 3 review files"
PRD-REVIEW-4.md's J-table (:1276-1287) carries severity and summary only. Neither cfeac92 nor e1180b8 changes a J15 row.
When J15 is closed, Rule 24.6's check ("every document the finding named") will not run on it, because review 4 is outside
the checker's list. J15's Where: names the withdrawal_preconditions migration and documents-core.test.ts.

### Evidence with no finding
- Author's plant "no shared lock": reproduces (3 races fail, "never waited on a lock"). N2 revert: 1 failed (N2 test). N6 plant (ceiling from subtotal): 1 failed (N6 test).
- My tax plant (balance recomputes tax half-up from the rate instead of using frozen tax_minor): walk disagreements 22 / 11, both seeds red. N6 unit test NOT red (100000 x 15% has no rounding). The walk sees tax.
- J15 revert (void exclusion dropped from the withdrawal guard): unit test red (1 failed). Walk green: wrong-document withdrawals 27->19 and 26->19, still above the floor of 12.
- Walk printed counts (seed 1 / 2): succeeded 1364/1326, examined 297/274, invoiced 28/23, fullCredits 18/13, withdrawalsAfterMoney 8/5, wrongDoc 27/26, wrongDocWithVar 13/10, taxed 145/135. These match the header ranges; each floor sits at about half the lower value.
- Stress: 150 unscheduled seal/accept/invoice races under READ COMMITTED gave 0 violations (seals ok 130, acceptances ok 75, invoices ok 20).
- N5 as stated: 40P01. D2 three-session case: no deadlock (queue rearranged).
- Foreign writes (invoice, acceptance, withdrawal, void, credit, seal): all refused 23503, A's figures unchanged.
- The app role cannot SET session_replication_role (permission denied).
- CI: the YAML parses; the service is on verify-new-app only; the Test step env is set. Through Turbo with no URL and PRYVIS_REQUIRE_PG=1: "1 failed | 128 passed | 6 skipped", which is the intended failure.
### Gate
turbo typecheck+test --force --concurrency=1 with PRYVIS_PG_URL + PRYVIS_REQUIRE_PG=1: "Tasks: 10 successful, 10 total / Cached: 0 cached";
api 183, db 134 (8 files; concurrency.pg.test.ts 6 tests ran), contract 2, core 9, web 11.
check_citations "scanned 169 tracked files ... resolves"; check_dispositions "40 ... across 3 review files"; check_rules "66 rules · 796 citations across 57"; check_schema_citations "28 tables, 11 functions, 8 triggers, 38 policies; 0 citations skipped". All exit 0.
git status --porcelain: empty.

---

# Fifth re-review of the J4 line (commits 2bf1816 and e0b80a3), findings Q1-Q7

**Reviewer:** `commit-reviewer` agent (Opus class), 2026-09-27, commissioned under Rules 1.10 and 24.6; tier declared in `BRIEF-STATUS.md` before launch (`3200f8f`). **Did not write** either commit. Appended verbatim from the file it wrote as it worked; its probes lived in the session scratchpad and are not retained. The author re-ran Q3 plant C (the quote lock taken after the balance row lock: all 12 races stayed green). **Its verdict: J10 can be Closed; J4 not yet, on Q3 plant C and the false sentences in Q2 and Q5.**

### Fifth re-review of J4/J10 line — commits 2bf1816, e0b80a3 (tier declared in 3200f8f)

Rule 0: read docs/RULES.md. Applying: 0, 1.5 (plant/restore), 1.10 (findings appended as found; state
what was not examined), 4 / 4.1 (tenant isolation), 6 (data integrity, numbering, migrations not
edited), 16.3/16.4 (quote command+output; report is evidence), 16.5 (tier declared in 3200f8f),
21.1-21.4, 21.7 (coverage in the tool's own words, controls fired on purpose, does-not-prove),
22.1-22.3 (scripted edits verified; prose via files), 24.6 (closing a blocker earns re-review).

Findings are appended below as found.

### Q1 — LOW (Rule 4; same SQL-level threat model as P2 (b)/(c); no money wrong) — P2 is closed only for the wrapper: another tenant takes, holds and observes a quote's lock by calling `pg_advisory_xact_lock` / `pg_advisory_lock` on the key the migration publishes
Where: new-app/db/migrations/20260927120000_lock_isolation_and_tenancy/migration.sql:29-34 (claims), :47-48 ("one tenant can
no longer take or wait on another's"), :70-77 (key recipe; pg_advisory_* EXECUTE is PUBLIC, nothing revokes it).
CONFIRMED (probe `scratchpad/review5/probe/xt.mjs`, db r5, all 25 migrations, app role `pryvis_app`, tenant B session):
    B sees A's quote rows: 0
    [B: BEGIN; SELECT pg_advisory_xact_lock(('x'||substr(md5(<A quote id>),1,16))::bit(64)::bigint)]
    A's invoice on its own quote waits on: advisory
    B reads pg_locks for A's key: [{"mode":"ShareLock","granted":false},{"mode":"ExclusiveLock","granted":true}]
    A invoice after B releases: ok (1565ms)
    [B: SELECT pg_advisory_lock(<same key>)   -- session level, survives B's transactions]
    A's seal waits on: advisory            ... released only by B's pg_advisory_unlock_all()/disconnect
Scenario: a tenant-B SQL session that knows (or is handed) one of A's quote UUIDs holds A's quote lock for as long as its
connection lives: every seal, acceptance, invoice, void, credit, variation, withdrawal and recompute on that quote hangs
until statement_timeout — and, via pg_locks, B can watch A's writes queue. The visibility check in quote_money_lock()
only stops B going THROUGH the wrapper; the md5 key is a deterministic public recipe, so it hides the id from someone
who does not know it and from nobody who does. Claim vs observed: ":47-48 one tenant can no longer take or wait on
another's" — false at the level of access P2 (b)/(c) itself assumed. Needs a known foreign quote UUID and raw SQL, hence LOW.

### Q2 — LOW (documentation; detected deadlock, nothing left wrong; one-of-two-twins) — "no single-quote cycle exists" is restated by this commit, and the developer-facing note names only the two-quote deadlock, while the documented wrong-document remedy run as one transaction deadlocks on ONE quote
Where: new-app/db/migrations/20260927120000_lock_isolation_and_tenancy/migration.sql:100 ("Quote lock before balance row
lock, on every path, so no single-quote cycle exists" — new text in this commit); new-app/CLAUDE.md:104-105 ("A
transaction that writes on two quotes can deadlock (SQLSTATE 40P01) and must be retried" — the only rule a builder of
the application will read); docs/design/scope-reduction.md:157-158 ("a direct recompute can no longer deadlock against a
seal"). The same migration's header (:46-48) and design :137 do state the upgrade case correctly — so the contradiction
is inside one file.
CONFIRMED (probes `scratchpad/review5/probe/dl.mjs`, `d6.mjs`, db r5, one quote each):
    D5  A: BEGIN; issue_balance_apply(rev1)  B: BEGIN; issue_balance_apply(rev1) -> waits on: transactionid
        A: seal rev2 -> waits on: advisory     => "D5 b recompute: 40P01 deadlock detected" / "D5 a seal: ok"
    D6  the remedy R1.15b documents, in one transaction: A: BEGIN; void the invoice; (B: invoice rev1 -> waits on:
        transactionid); A: withdraw ok; A: seal rev2 ok  => "B invoice: 40P01 deadlock detected"; rev1 superseded, 0/0.
    D1  (N5 as stated) "D1 b variation: 40P01 deadlock detected".  D3 (P3's case): no deadlock — the fix holds.
Scenario: an application written from CLAUDE.md treats single-quote transactions as never needing a 40P01 retry, runs
"void/credit, withdraw, issue next revision" as one unit of work (the natural shape of the remedy), and surfaces the
concurrent user's aborted invoice as an error rather than retrying it. The outcome after retry is correct (rev1 is
superseded and refuses), so no money is wrong: this is a false statement about the lock, not a money defect.

### Q3 — MINOR (guard weakness, not user-visible) — three of the P fixes' own properties survive a plant with all 12 races green: lock ORDER (P3), the key's per-quote spread (P2), and the visibility check on the shared path (P2)
Where: new-app/db/test/concurrency.pg.test.ts:590-626 (P3 race), :531-555 and :557-588 (P5 shared, P2 races);
migration 20260927120000 :74 (key), :69 (visibility), :100-101 (order in issue_balance_apply).
CONFIRMED. Each plant applied to the committed migration with an anchor-count==1 check (`scratchpad/review5/plant.py`),
race suite run, restored from `scratchpad/review5/migration.120000.backup.sql`, `diff -q` silent ("RESTORED") each time:
  Plant A — `v_key := 0;` (EVERY quote of every tenant shares one lock):         `Tests  12 passed (12)`
     Consequence, executed (probe k0.mjs on db r5k = r5 + this plant): "[r5k] tenant A invoice on its own quote, while
     tenant B seals ITS OWN quote, waits on: advisory"; on unplanted r5: "waits on: null". P2 (a)'s cross-tenant
     interference, maximised, and no race compares two quotes.
  Plant B — visibility check only when exclusive (`p_exclusive AND NOT EXISTS …`):  `Tests  12 passed (12)`
     The P2 race only ever calls the wrapper with `true` and seals; a foreign shared take is never attempted.
  Plant C — in issue_balance_apply, the quote lock moved AFTER the balance row FOR UPDATE (P3's exact defect: row then
     quote):                                                                      `Tests  12 passed (12)`
     Consequence, executed (probe d7.mjs, db r5c = r5 + plant C): T2 seals rev2; T1 `issue_balance_apply(rev1)` waits on
     advisory; T2 `issue_balance_apply(rev1)` => "[r5c] t1 recompute: 40P01 deadlock detected"; unplanted r5: "t1
     recompute: ok". The P3 race (T1 recompute, T2 seal, T1 invoice) never has the sealer ask for the balance row, so it
     detects only that the recompute takes the quote lock AT ALL, not that it takes it FIRST — its title
     ("takes the quote lock first, so it cannot deadlock against a seal") claims the order.
  Plant D (control, mine) — acceptance trigger takes no lock: caught, N4 (a) "never waited on the quote lock".
Scenario: a later edit that reorders issue_balance_apply, or "simplifies" the key, ships with the race suite green and
reintroduces a single-quote deadlock or cross-tenant blocking. Commit message's "five plants each failed their named
race" is true (three re-executed, below); the gap is in the properties no plant was aimed at.

### Q4 — MINOR, seen in passing (pre-existing since 20260925120000, NOT introduced by these commits; Rule 6) — a sealed issue's `quote_id` is rewritten by `UPDATE quote SET id = …` through ON UPDATE CASCADE, so "no UPDATE path … mean it literally" does not hold, and the lock key of every revision changes with it
Where: new-app/db/migrations/20260926180000_tenant_composite_keys/migration.sql:140-143 (quote_issue → quote, ON UPDATE
CASCADE; same on every issue child FK), policies/002-documents-isolation.sql `quote_tenant_isolation` (FOR ALL, so the
tenant may UPDATE quote.id), and the "no UPDATE path" comment in the same file.
CONFIRMED (`scratchpad/review5/cascade.sql`, db r5, as pryvis_app in the owning tenant): rev1 sealed, accepted, invoiced;
    before: 86bfe4cf-9dfe-42a6-a995-dc01a8238316
    UPDATE quote SET id = gen_random_uuid() WHERE id = <q>;   -- succeeds
    after:  005d2d19-5fa7-47ab-a209-bd20906e45fc | issue_rewritten: t
Referential actions bypass row security (Rule 4.1's own quotation), so the append-only policy set never sees it. I
tried to turn it into a lock bypass (id changed while a seal or invoice is in flight) and could not: the in-flight FK
KEY SHARE locks serialise the id change behind them. Reported because J3 is "Fixed, re-review owed" and its migration
recreated these keys with ON UPDATE CASCADE; not a blocker for J4/J10.

### Q5 — MINOR (documentation; one-of-two-twins, the P6/N9/L5 pattern again) — sentences the commit left false beside the ones it amended
CONFIRMED by reading (all in files 2bf1816 edited):
 (a) new-app/db/test/concurrency.pg.test.ts:29 — "The isolation level is the default, READ COMMITTED; the migrations
     assume it." This is the exact sentence P1 quoted as the only statement of the assumption; the same commit made the
     migrations ENFORCE it and added a race proving the refusal (:452), and left this line saying "assume".
 (b) new-app/db/test/concurrency.pg.test.ts:30-31 — "Deadlocks (N5) are not tested" — the same commit added the P3
     deadlock race (:594, asserting `not.toMatch(/deadlock/)`).
 (c) docs/design/scope-reduction.md:139 — "`concurrency.pg.test.ts` races six cases"; the commit amended §3c twelve
     lines below and took the suite to 12 races ("Tests  12 passed (12)").
 (d) migration 20260927120000:17 and docs/design/scope-reduction.md:149 — "quote_money_lock(), which every financial
     path reaches" / "Every financial write now refuses to run outside READ COMMITTED". `issue_balance_open()` writes
     issue_balance (accepted_total_minor) without reaching it: executed under REPEATABLE READ it succeeds, and does so
     for an issue with NO acceptance (`scratchpad/review5/rr.sql`: "open_no_accept … balance_rows 1"). I found no wrong
     figure from this (the total it copies is frozen), so it is an overclaim, not a money defect. Every other path
     listed in the brief was refused with the P1 message under REPEATABLE READ (see "nothing found").
 (e) Q2's CLAUDE.md sentence (two quotes only) belongs here too.

### Q6 — MINOR (guard weakness in the Rule 24.6 gate, not user-visible; categories 7 and 8) — `check_dispositions.py` still passes a Closed row that cites nothing, in five executed ways, and its new path keys match by substring
Where: tools/check_dispositions.py:81 (`path_key` → bare file name), :134 (`{key for key in scope if key in disposition}`
— substring), :61-62 (FINDING/WHERE regexes), :98-100 (no Where → empty scope, silently), :89 (CLAIMS_CLOSED).
CONFIRMED on the real docs/PRD-REVIEW-4.md (each edit via anchor-count==1 plant, tool run, restored from
`scratchpad/review5/PRD-REVIEW-4.backup.md`, `diff -q` silent "RESTORED"). Control first — J4 row replaced by
`| **J4** | blocker | **Closed.** Nothing cited. |`: "J4 claims Closed but does not cite: 20260925120000_documents_core,
20260926110000_withdrawal_preconditions, PRD.md, documents-core.test.ts … FAILED: 1", exit 1. Then, each exit 0:
  (a) substring key — J5 row set to **Closed.**, `docs/design/acceptance-evidence.md` removed, citing only
      `docs/adr/0024-acceptance-evidence.md`: "42 dispositions claiming Closed … Every Closed disposition cites every
      document in the scope enforced", exit=0. Key `acceptance-evidence.md` is a substring of `0024-acceptance-evidence.md`.
  (b) substring key — J3 row set to **Closed.** with `docs/RULES.md` replaced by `docs/BUILD-RULES.md`: 42 counted,
      exit=0 (`RULES.md` ⊂ `BUILD-RULES.md`; both files exist). Same shape for any two files sharing a name
      (`schema.prisma` in new-app/ and original-app/, any `index.ts`).
  (c) heading variant — J4 heading "— severity: **blocker**" + the nothing-cited Closed row: 42 counted, exit=0 (the
      finding no longer parses, so its scope is the empty set and the row trivially cites all of it).
  (d) Where variant — `**Where**:` instead of `**Where:**` + nothing-cited Closed row: 42 counted, exit=0.
  (e) wording/shape — `| J4 |` (id not bold), `Closed.` (not bold), `**Resolved.**`: 41 counted (row silently not a
      closure), exit=0. Only the printed count moves, by one.
No current row is affected: I re-ran every Closed row in the four reviews with a whole-name match and found no key that
is cited only through a longer name. The ten printed legacy gaps are real by the tool's own rule (each row checked: none
contains the key). Scenario: a J4 or J10 closure row citing the adr but not the design, or a finding whose Where line
is typed `**Where**:`, passes the gate that Rule 24.6 names as its mechanism, while the tool prints that every Closed
row cites every document in scope. The K/L/N/P re-review findings (`### K4 …`, plain `Where:`) cannot be dispositioned
under the checker at all — FINDING/ROW accept only F, G, H, J.

### Q7 — MINOR (disposition row overstates; Rule 24.6) — J2's "Fixed, re-review owed" row says ADR 0025 decision 2 was amended; no commit amended it, and it still describes the rejected mechanism
Where: docs/PRD-REVIEW-4.md:27 (J2 row: "`683a638` … ADR `0025-five-invariants-move-from-prose-to-code.md` decision 2
amended"); docs/adr/0025-five-invariants-move-from-prose-to-code.md:47-62 (Decision 2).
CONFIRMED:
    $ git show --name-only --format= 683a638   -> PRD-REVIEW-4.md, PRD.md, adr/0024-…, design/acceptance-evidence.md,
      design/domain-model.md, two migrations, documents-core.test.ts      (no adr/0025)
    $ git log --format='%h %s' -- docs/adr/0025-…md -> cfeac92, 23ca3a5, 51a58c9, 94d3516, f054aac; none of their
      diffs to the ADR touches Decision 2 except 51a58c9's one-word rename in Decision 4 (`accepted_total_minor`).
    ADR 0025:54-55 still reads "`issue_balance` has **no UPDATE or INSERT grant to the application role at all.** Every
    change goes through one `SECURITY DEFINER` function that takes the row lock itself" — the two mechanisms
    policies/002-documents-isolation.sql explicitly rejects ("*Grants* cannot carry this … *SECURITY DEFINER alone*
    cannot carry it either"), and it names no trigger.
Every other "Fixed, re-review owed" row matches its commit (J1 becd1dd, J3 065154e, J5 683a638, J9 becd1dd, J12 51a58c9,
J16 9115d8f checked by `git show --name-only`). Scenario: the J2 re-review owed is scoped from this row and takes the ADR
as done; the checker cannot see it because J2 is not Closed, and when it is closed the checker will only test that
the row CITES the ADR, which it already does.

### Evidence with no finding
- Isolation guard (P1), every path under `BEGIN ISOLATION LEVEL REPEATABLE READ` as pryvis_app (`rr.sql`): seal, accept,
  DECLINED accept, invoice, void, credit, variation, withdrawal, direct issue_balance_apply — all "ERROR: financial writes
  must run under READ COMMITTED, not repeatable read"; SQLSTATE printed as 25000 (`nonins.sql`, VERBOSITY verbose).
  `SET default_transaction_isolation='serializable'` + autocommit invoice: refused ("not serializable").
  SERIALIZABLE READ ONLY DEFERRABLE: "cannot execute INSERT in a read-only transaction". SET TRANSACTION after a query,
  inside a SAVEPOINT, or via set_config: "SET TRANSACTION ISOLATION LEVEL must be called before any query". SET
  TRANSACTION to READ COMMITTED before the first query genuinely yields read committed (allowed, correct).
  READ UNCOMMITTED is refused ("not read uncommitted") although PostgreSQL runs it as READ COMMITTED — harmless.
  RC controls: invoice ok; read-only queries under RR (ceiling/state) ok. No isolationLevel anywhere in new-app.
  UPDATE/DELETE of invoice, invoice_void, variation, withdrawal, quote_issue, acceptance: silently 0 rows (voids_left 1).
  issue_number / rejected_seal: not money writes; not exercised beyond reading.
- Tenant scoping: quote and quote_issue carry identical tenant predicates, so the rightful tenant always sees the quote
  it locks; superuser sees everything (locks more, not less); an unset tenant cannot write at all. I found no real path
  in the rightful tenant that skips the lock. Key: 200,000 random ids -> 200,000 distinct keys, full signed range
  (min -9223370102189589767, max 9223333677643881823); pg_locks shows objsubid 1 (single-key space, apart from the
  two-key 725001 space), classid<<32|objid recomposes to the key. Unique indexes on the document tables are all
  tenant-scoped, so no foreign insert waits on a unique conflict.
- Lock order: D3 (P3's case) no longer deadlocks ("D3 t1 invoice: ok"; seal then refused 23514). D4 (one shared holder
  upgrading while a seal waits) is granted by queue-jump, no deadlock. Deadlocks remaining are all the upgrade case (Q2).
- Race suite: baseline "Tests 12 passed (12)". Author's plants re-executed, each failing its named race: isolation
  check removed -> P1 race; supersession removed from the ceiling -> N4 (c); shared lock made exclusive -> R1.24a, K4
  ("waited on advisory") and P5 shared. My plant D (acceptance lock removed) -> N4 (a). withinMs: returns the settled
  outcome or "blocked" after ms without cancelling the query; each use holds the blocker open past the window, so a
  "not blocked" result does mean no wait on that lock. P2's foreign-seal assertion accepts ANY error (reason not pinned).
  N4 (a) still does not assert the acceptance outcome (the acceptance of the superseded revision succeeds).
- Unscheduled stress (`probe/stress.mjs`, 3 x 40 quotes x 8 sessions, RC): 0 issues billed over their ceiling, 0 quotes
  with more than one live ceiling. Weak: only 4-6 invoices succeeded per run (most were refused P0002 because the
  acceptance had not yet opened a balance row), so this adds little to the scheduled races.
- J15: revert of the void exclusion in the live guard (20260927110000) -> "J15 · allows withdrawal once the invoice is
  voided" red, 1 failed | 83 passed; restored.
- check_dispositions: the ten legacy gaps are real by the tool's rule; no existing Closed row relies on a substring match.

### Gate (uncached, after every plant restored)
`npx turbo run typecheck test --force --concurrency=1` with PRYVIS_PG_URL + PRYVIS_REQUIRE_PG=1: "Tasks: 10 successful,
10 total / Cached: 0 cached, 10 total"; api 183, db 140 (8 files; "test/concurrency.pg.test.ts (12 tests)"), contract
2, core 9, web 11. check_rules "66 rules defined · 818 citations across 58 distinct rules", exit 0; check_dispositions
"41 dispositions claiming Closed, checked across 4 review files (path-level scope enforced on 1 of them)", 10 legacy
gaps, exit 0; check_citations "scanned 170 tracked files … Every cited path, filename and symbol resolves.", exit 0;
check_schema_citations "28 tables, 11 functions, 8 triggers, 38 policies; 0 citations skipped", exit 0.

### Verdicts
- J10: closable on this evidence. What it defends (one live ceiling per quote, including under concurrency and
  isolation level) held in every execution: the N4 (a/b/c) races and their plants, P1 refused on every path, 0 quotes
  with two live ceilings under stress. Q1-Q3 affect the Rule 4 surface, deadlocks and test strength, not the
  two-ceilings invariant.
- J4: not yet. No money defect or stuck state was found. What blocks it is the commit's own P3 claim: it has no race
  that fails when the order is reversed (Q3 plant C, a real 40P01), and "no single-quote cycle" is restated in the
  migration, CLAUDE.md and design (Q2), beside stale lines in the race-suite header and design (Q5). Those are narrow
  fixes and need a narrow check, not a sixth full re-review.
- J15: the revert still goes red; the Closed row is supported (and the L review also covered 8e8236a).
- J2: not closable as its row stands (Q7).
- J3: not reviewed; Q4 (ON UPDATE CASCADE rewrites a sealed issue) belongs in its re-review.
- J1, J5, J9, J12, J16: not examined, so I cannot speak to them.

### Not examined (Rule 21.4)
The application layer (none exists for these writes); PGlite suites beyond the J15 revert and the gate; the walk
(no-stuck-state.test.ts); PostgreSQL versions other than 16.13; pg_stat_activity query-text exposure between
tenants sharing one role; issue_number and rejected_seal semantics; the CI workflow (not re-run); J1, J5, J6-J9,
J11-J14, J16 as findings; original-app/.

---

# J4 closing check (Sonnet, mechanical) on b544697

**Checker:** `commit-reviewer` agent run on Sonnet, 2026-09-27, against a fully specified brief (tier and reason in `BRIEF-STATUS.md`, declared before launch). **Did not write** the commit. Appended verbatim from its report file. Verdict: NOT PASSED on steps 5a, 5b, 5c. Steps 1-4 (the four plants) and 6 (the gate) passed exactly. 5a is a real finding, answered by `20260927140000_quote_lock_contract`; 5b and 5c are defects in the BRIEF — two single-line greps for sentences that wrap or were reworded — and the checker confirmed the content by reading it (MISTAKES M36).

## J4 closing check — commit b544697

Rule 0: rules applying — 0, 1.5, 16.3, 21.7, 22.1, 24.6 (see reasoning in main report).

## Table

| Step | Expected | Actual (quoted) | Result |
|---|---|---|---|
| 0 baseline | pg up; RACES "Tests 15 passed (15)" | "pg: already up"; "Tests  15 passed (15)" | PASS |
| 1 Q3 plant C (lock order) | 1 failed: "Q3 · lock ORDER..." | "Tests  1 failed \| 14 passed (15)"; failing test "Q3 · lock ORDER: a recompute waiting on a seal holds no balance row lock, so the seal's own recompute proceeds"; error "deadlock detected" | PASS |
| 2 Q3 plant A (one key) | 1 failed: "Q3 · each quote has its own lock..." | same counts; failing test "Q3 · each quote has its own lock: a seal on one quote does not delay a write on another"; got 'blocked' vs {ok:true} | PASS |
| 3 Q3 plant B (visibility) | 1 failed: "Q3 · another tenant's SHARED lock..." | same counts; failing test "Q3 · another tenant's SHARED lock request on a quote takes nothing, so it cannot delay that quote's seal"; got 'blocked' | PASS |
| 4 Q5 plant (issue_balance_open) | 1 failed: "P1 · refuses a financial write..." | same counts; failing test "P1 · refuses a financial write outside READ COMMITTED, so a stale snapshot cannot judge the ceiling"; expected '' matched empty string not the message | PASS |
| 5a grep "no single-quote cycle" | matches only 120000, 130000, PRD-REVIEW-4.md, MISTAKES.md | ALSO matched new-app/db/migrations/20260927110000_one_lock_per_quote/migration.sql:32 | FINDING |
| 5b grep "can no longer deadlock" | one match, in docs/design/scope-reduction.md | no output (empty) | FINDING |
| 5c grep "migrations assume" | one match, quoting "this line said \"assume\" until 2026-09-27" | no output (empty) | FINDING |
| 5d grep "races six" | no output | no output | PASS |
| 5e grep "writes on a quote and then seals the same quote" | one match | new-app/CLAUDE.md:106 matched | PASS |
| 5f grep "opening a balance row" | one match | new-app/CLAUDE.md:101 matched | PASS |
| 6 full gate | Tasks 10/10; Tests db 143, api 183, web 11, contract 2, core 9; concurrency.pg 15 tests | exact match, see output | PASS |
| 6 check_rules.py | exit 0 | exit 0, "66 rules defined · 836 citations..." | PASS |
| 6 check_dispositions.py | exit 0, "42 dispositions claiming Closed, checked across 4 review files" | exit 0, contains that exact line (in fuller output, not just last 2 lines) plus 10 legacy-gap lines below it | PASS |
| 6 check_citations.py | exit 0 | exit 0, "scanned 171 tracked files / Every cited path, filename and symbol resolves." | PASS |
| 6 check_schema_citations.py | exit 0 | exit 0, "Every cited path and every named database object resolves." plus one advisory note on quote_line.recipe_id | PASS |

## Findings with exact output

### FINDING 5a — a third migration still carries the false claim, uncorrected and unlisted
`grep -rn "no single-quote cycle" /home/user/Jam-Quote/docs /home/user/Jam-Quote/new-app --include=*.md --include=*.ts --include=*.sql` returned, in addition to the expected files:
```
/home/user/Jam-Quote/new-app/db/migrations/20260927110000_one_lock_per_quote/migration.sql:32:--   * the order is always quote lock, then balance row lock, so no single-quote cycle exists.
```
This is the migration `20260927110000_one_lock_per_quote` (committed before b544697, in cfeac92). Its header still states the now-known-false claim "no single-quote cycle exists" (P3/Q2) with no correcting annotation. The commit b544697's message says the correction lands in migration `130000`'s header "because Rule 6 forbids editing" the committed P migration (`120000`) — but migration `110000` is a separate, earlier, also-committed migration containing the identical false claim, and it is neither named in the brief's expected-matches list nor referenced by any corrective note. Whether or not Rule 6 also protects this file from editing, the closing check's expected scope (which files may say this) did not account for it, and it is left silently asserting something the same commit's own review found false. This is a documentation-accuracy gap, not a runtime defect — I did not find any code path that still relies on the false claim (the runtime fix in `120000`/`130000` reorders the lock correctly, confirmed by Steps 1-4 above).

### FINDING 5b — the grep for "can no longer deadlock" found nothing; the sentence exists but is split by a line wrap
`grep -rn "can no longer deadlock" /home/user/Jam-Quote/docs/design /home/user/Jam-Quote/new-app/CLAUDE.md` returned no output.
Manual inspection of `docs/design/scope-reduction.md` lines 165-166 shows:
```
165:  left wrong; run the steps as separate transactions or retry. This sentence said "can no longer
166:  deadlock" until the fifth re-review.
```
The words "can no longer" and "deadlock" are on different source lines (word-wrapped prose), so a single-line grep — exactly the command specified in the brief — cannot find it. The sentence itself is present and its content matches what was expected, but the literal mechanical check specified in the brief fails to confirm it. Reporting per Rule 21 (a guard/check that cannot see past formatting proves nothing) and per this task's own instruction to verify my pattern before reporting — here the pattern is the one the brief specified, and it does not fire on content I have visually confirmed is correct.

### FINDING 5c — the grep for "migrations assume" found nothing; content was reworded, not literally present
`grep -n "migrations assume" /home/user/Jam-Quote/new-app/db/test/concurrency.pg.test.ts` returned no output.
The actual text at lines 29-30 is:
```
29: * - PostgreSQL 16 only. The migrations REQUIRE READ COMMITTED and refuse financial writes outside it;
30: *   the P1 race proves the refusal (this line said "assume" until 2026-09-27; Q5).
```
The word "assume" appears only inside the parenthetical self-correction note, not adjacent to "migrations" — the two words specified in the grep pattern are not contiguous anywhere in the file. The comment does document the same history the brief expected ("this line said 'assume' until 2026-09-27") but the exact grep the brief specifies cannot find it, because the sentence was reworded around it (from "migrations assume X" to "migrations REQUIRE X ... (this line said 'assume' until ...)"). Content-wise this matches intent; mechanically the specified check does not confirm it.

## BRIEF INCOMPLETE
None. Every step above could be executed as written.

## Verdict

**J4 closing check: NOT PASSED — steps 5a, 5b, 5c**

All plant/restore mechanics (Steps 1-4) confirm the runtime claims of commit b544697 for Q3's three lock properties and Q5's issue_balance_open lock: each named defect, reintroduced by hand, was caught by exactly the one test named for it, and nothing else failed. The full gate (Step 6) is green exactly as specified, including the four check-tool exit codes and the disposition count. The three findings above are about documentation/grep-scope precision, not about the runtime fix: 5a is a real (if Rule-6-protected) surviving false statement in a third, unlisted migration; 5b and 5c are cases where the underlying sentence is present and correct in substance but the literal grep pattern specified in this brief does not find it (line-wrap in 5b, rewording in 5c) — worth flagging per this project's own Rule 21 theme (a check that can't see past formatting proves nothing), but they are not evidence the fix itself is wrong.

## What this check did NOT examine (Rule 21.4)

This check verified only:
- the four named plants (Q3 lock-order, Q3 one-key, Q3 visibility, Q5 issue_balance_open) against the RACES suite,
- the six named grep sentences,
- the full gate's summary line and the four check-tool exit codes.

It did NOT review: the design in `docs/design/scope-reduction.md` beyond the two sentences named; any other finding from PRD-REVIEW-4.md (Q1, Q4, Q6, Q7, P-series) or earlier reviews; whether `check_dispositions.py`'s 10 "legacy gaps" list is itself accurate or complete; the correctness of `check_schema_citations.py`'s advisory note on `quote_line.recipe_id`; ADR 0025's amendment (Q7) mentioned in the commit message; or any code path outside the four migrations and the CLAUDE.md/scope-reduction.md/concurrency.pg.test.ts locations named in Step 5. It did not attempt alternative bypasses beyond the exact plants specified.

## Final git status
`git -C /home/user/Jam-Quote status --porcelain` → (empty)

---

# J4 closing re-check (Sonnet, mechanical) on 422d9e8

**Checker:** `commit-reviewer` agent run on Sonnet, 2026-09-27, against a brief whose expectations were executed before handover. **Did not write** the commit. Appended verbatim. Verdict: NOT PASSED on one item — check A found the phrase in a seventh file, `docs/BRIEF-STATUS.md`, which the checker itself read and described as a register quoting the phrase to report it, like the two registers on the expected list. The expected list was stale because the author edited `BRIEF-STATUS.md` after testing it (MISTAKES M37). Every other check passed. **The owner accepted closing J4 on this evidence, 2026-09-27.**

## J4 closing re-check on 422d9e8

Rule 0: Rules applying to this task — 1.5, 16.3, 21.7, 24.6 (see task brief header for citation).

### 1. Step table

| Step | Expected | Actual (quoted) | Result |
|---|---|---|---|
| 0a `git log --oneline -1` | starts `422d9e8` | `422d9e8 db+docs: the last copy of "no single-quote cycle exists" is corrected, and the lock's contract lives on the function` | PASS |
| 0b `pg-up.sh` | ends "pg: up" or "pg: already up" | `pg: already up` | PASS |
| 1 Check A (`no single-quote cycle exists`) | exactly 6 named files | `['new-app/db/migrations/20260927110000_one_lock_per_quote/migration.sql', 'new-app/db/migrations/20260927120000_lock_isolation_and_tenancy/migration.sql', 'new-app/db/migrations/20260927130000_balance_open_takes_lock/migration.sql', 'new-app/db/migrations/20260927140000_quote_lock_contract/migration.sql', 'docs/BRIEF-STATUS.md', 'docs/MISTAKES.md', 'docs/PRD-REVIEW-4.md']` — 7 files | FINDING |
| 1 Check B | exactly `docs/design/scope-reduction.md` | `['docs/design/scope-reduction.md']` | PASS |
| 1 Check C | exactly `new-app/db/test/concurrency.pg.test.ts` | `['new-app/db/test/concurrency.pg.test.ts']` | PASS |
| 1 Check D | exactly `20260927120000_lock_isolation_and_tenancy/migration.sql` | `['new-app/db/migrations/20260927120000_lock_isolation_and_tenancy/migration.sql']` | PASS |
| 1 Check E | exactly `20260927140000_quote_lock_contract/migration.sql` | `['new-app/db/migrations/20260927140000_quote_lock_contract/migration.sql']` | PASS |
| 1a grep 140000 for 110000 name | at least one match | line 6: `` -- `20260927110000_one_lock_per_quote` says, in its FIX section: "the order is always quote lock, then `` (and line 25) | PASS |
| 1b grep 130000 for "no single-quote cycle" inside its corrections section | match under "CORRECTIONS TO `20260927120000_lock_isolation_and_tenancy`" | match at line 18, under heading at line 16: `## CORRECTIONS TO \`20260927120000_lock_isolation_and_tenancy\`, WHICH CANNOT BE EDITED` | PASS |
| 2 `comment-check.sh` | one line with the required substrings, no MIGRATION FAILED | `Per-quote advisory lock for financial writes (docs/design/scope-reduction.md section 3c). Exclusive for a seal, shared for acceptance, invoice, void, credit note, variation, withdrawal, opening a balance row and a balance recompute; always taken before the issue's balance row lock. Refuses to run outside READ COMMITTED (SQLSTATE 25000). Locks only a quote visible under row security; the key is 64 bits of md5(quote id). Deadlocks that remain, detected as SQLSTATE 40P01 and to be retried: a transaction writing on two quotes, and one that writes on a quote and then seals the same quote. Not closed at the SQL level: any session can call pg_advisory_* with the key (THREAT-MODEL 4d).` — contains READ COMMITTED, SQLSTATE 40P01, "writes on a quote and then seals the same quote", THREAT-MODEL 4d; no MIGRATION FAILED line | PASS |
| 3 gate: turbo typecheck+test | Tasks 10/10; api 183, db 143, contract 2, core 9, web 11; concurrency.pg.test.ts (15 tests) | `@pryvis/web:test: Tests 11 passed (11)`; `@pryvis/contract:test: Tests 2 passed (2)`; `@pryvis/db:test: ✓ test/concurrency.pg.test.ts (15 tests) 1560ms`; `@pryvis/db:test: Tests 143 passed (143)`; `@pryvis/core:test: Tests 9 passed (9)`; `@pryvis/api:test: Tests 183 passed (183)`; `Tasks: 10 successful, 10 total` | PASS |
| 3 `check_rules.py` | exit 0 | `66 rules defined · 846 citations across 58 distinct rules` / `All citations resolve, and no rule has changed unreviewed.` / EXIT:0 | PASS |
| 3 `check_dispositions.py` | exit 0; contains "42 dispositions claiming Closed, checked across 4 review files" | `42 dispositions claiming Closed, checked across 4 review files (path-level scope enforced on 1 of them)` plus a "LEGACY GAPS" list of 10 unrelated older-review items; EXIT:0 | PASS |
| 3 `check_citations.py` | exit 0; contains "scanned 172 tracked files" | `scanned 172 tracked files` / `Every cited path, filename and symbol resolves.` / EXIT:0 | PASS |
| 3 `check_schema_citations.py` | exit 0; contains "0 citations skipped" | `scanned 172 files against 28 tables, 11 functions, 8 triggers, 38 policies; 0 citations skipped` / 1 OWED reference (quote_line.recipe_id) / "Every cited path and every named database object resolves." / EXIT:0 | PASS |

### 2. Findings

**FINDING (Step 1, Check A).** The whole-file phrase "no single-quote cycle exists" was expected in exactly
six files. It appears in a **seventh**: `docs/BRIEF-STATUS.md:301`:

> a third committed copy of "no single-quote cycle exists", in `20260927110000_one_lock_per_quote` — and is
> answered by migration `20260927140000_quote_lock_contract`, which corrects it and puts the lock's contract
> on the function as `COMMENT ON FUNCTION`.

This is narrative prose in the status tracker quoting the phrase to describe the earlier closing check's
result (the same J4 closing-check entry that this re-check exists to verify) — it reads the same way the
expected `docs/MISTAKES.md` and `docs/PRD-REVIEW-4.md` hits do, i.e. as a report referencing the phrase
rather than a migration or design document asserting it as a true claim about locking order. It was not on
the brief's enumerated list of six, so per the brief's own rule ("A seventh file is a FINDING") it is
reported here rather than silently accepted. No corrective action was taken (Rule 0 of this brief: no edits
to the repository).

No other findings from Steps 0, 1 (checks B–E, 1a, 1b), 2 or 3: every other expected output matched the
actual output verbatim or by the substrings the brief specified.

### 3. BRIEF INCOMPLETE

None. Every step could be run exactly as written.

### 4. Overall

J4 closing re-check: NOT PASSED — Step 1 Check A (docs/BRIEF-STATUS.md is an extra file matching the phrase)

### 5. What this did NOT examine (Rule 21.4)

This re-check covers only the six listed steps: whole-file sentence checks A–E plus verifications 1a/1b, the
database-stored function comment (Step 2), and the single full-gate run plus the four `tools/check_*.py`
scripts (Step 3). It does not repeat:
- the four "plants" from the original J4 closing check (verified there, not here, per this brief's own scope
  statement);
- any review of the substance of the lock design itself, the correctness of the SQL in any migration, or
  whether the migrations' claimed corrections are semantically right beyond the two grep-level pointer
  checks in Step 1 (1a/1b only confirm the corrections *name* what they correct and *where* they sit, not
  that the correction is right);
- the 10 "LEGACY GAPS" that `check_dispositions.py` printed for PRD-REVIEW-2.md/PRD-REVIEW-3.md — those are
  pre-existing, unrelated to J4, and out of this brief's scope;
- the 1 OWED (not enforced) schema reference (`quote_line.recipe_id`) that `check_schema_citations.py`
  reported — pre-existing and unrelated to J4;
- anything outside the exact commands and files named in the brief.

### 6. Final git status

```
$ git -C /home/user/Jam-Quote status --porcelain
(no output — clean)
```
No `tools/__pycache__` directory was created or left behind.

---

# Re-review of the seven "Fixed, re-review owed" findings (J1, J2, J3 with Q4, J5, J9, J12, J16), findings R1-R18

**Reviewer:** `commit-reviewer` agent (Opus class), 2026-09-27; tier declared before launch (`0b49cf6`). **Did not write** any of the seven fixes. Appended verbatim; its probes lived in the scratchpad and are not retained. The author re-ran R9 on a fresh PostgreSQL 16.13 database: an acceptance bound to another issue's render, and one with no render, both inserted. **Verdict: J2 and J16 closable; J5 closable once R14 is corrected; J1, J3 (with Q4), J9 and J12 not closable.**

### Re-review of seven review-4 fixes (J1 J2 J3+Q4 J5 J9 J12 J16) at HEAD 0b49cf6

Findings appended as found (Rule 1.10). R-numbered.

### R1 · Q4 CONFIRMED: the owning tenant rewrites a sealed quote_issue.quote_id with one UPDATE on quote — severity: major (blocks J3)

Where: new-app/db/migrations/20260926180000_tenant_composite_keys/migration.sql:140-143 (quote_issue_quote_id_fkey ... ON UPDATE CASCADE).

CONFIRMED on real PostgreSQL 16.13, fresh db built from all 27 migrations (review6/mkdb.sh), app role pryvis_app, app.tenant_id = tenant A. Script review6/q4c.sql. Sealed issue 9999..0001, accepted (document_render attached), balance opened, 40,000 invoiced:

    state-before | sealed_awaiting_number | 100000
    UPDATE quote SET id = '77777777-...' WHERE id = 'dddddddd-...';   -> UPDATE 1
    after quote_issue | 99999999-0000-4000-8000-000000000001 | 77777777-7777-4777-8777-777777777777
    state-after | sealed_awaiting_number | 100000

The sealed row's stored quote_id changed; no trigger, policy or grant stopped it (quote_issue has no UPDATE policy, but RI actions bypass RLS). No test in new-app/db/test mentions ON UPDATE or an id update (grep -rni "on update|SET id|CASCADE" test/ -> only an unrelated fixture).
Failure scenario: any application path (sync upsert of a draft quote carrying a changed client-generated id; a "duplicate/re-key" bug) silently rewrites every sealed issue of that quote; exports, PDFs and offline devices that carry the old quote_id no longer match the database's sealed copy, and the document "with no UPDATE path" has one. Incidentally blocked only when the quote has a rejected_seal (R-note below).

Other ON UPDATE CASCADE edges in that migration, traced by execution (review6/q4b.sql, q4c.sql):
- quote -> quote_issue (sealed): REWRITTEN (above).
- quote -> rejected_seal: REFUSED, by rejected_seal_freeze (J16's trigger): "a rejected seal records what was quoted ... only resolution, resolved_at and version may change (finding J16)" — and the refusal rolls back the whole UPDATE, so the quote_issue rewrite is only possible for quotes with no rejected seal.
- number_series -> issue_number (sealed number): REWRITTEN. `UPDATE number_series SET id = '6666...'` -> UPDATE 1; issue_number.series_id = 66666666-..., formatted Q-1.
- app_user -> document_render.rendered_by_user_id (append-only render record): REWRITTEN (5555... after `UPDATE app_user SET id = ...`).
- app_user -> app_credential/app_session, client -> quote, quote -> quote_line/quote_section, quote_section -> quote_line: mutable children, no sealed data.
- quote_issue / acceptance / invoice / rejected_seal / document_render as parents: no UPDATE policy for pryvis_app on the parent, so their CASCADEs cannot be triggered by the app role (rejected_seal has an UPDATE policy but its freeze trigger refuses an id change — not executed separately; see "not examined").

### R2 · A tenant-A session rewrites an audit_entry row belonging to tenant B, through audit_entry_actor_user_id_fkey ON UPDATE CASCADE — severity: major (cross-tenant write; J3's "both directions" claim)

Where: new-app/db/migrations/20260926160000_unenforced_references/migration.sql:45-47 (FK added by the J9 follow-up, ON UPDATE CASCADE), kept single-column on purpose by 20260926180000_tenant_composite_keys:40-45 and tenant-isolation.test.ts SINGLE_COLUMN_ON_PURPOSE.

CONFIRMED (review6/q4b.sql): audit row seeded in tenant B with actor_user_id = tenant A's user aaaa... (the staff-actor case the exemption exists for). Then, as pryvis_app with app.tenant_id = A: `UPDATE app_user SET id = '5555...' WHERE id='aaaa...'` -> UPDATE 1. Read back as superuser:

    U-after audit_entry (tenant B row) | 22222222-2222-4222-8222-222222222222 | 55555555-5555-4555-8555-555555555555

A session scoped to A modified a row of B's append-only audit trail (audit_entry has only SELECT and INSERT policies). Rule 5.1: "staff cannot edit or delete the audit trail". The exemption's reason (staff actor in another tenant) is exactly the case in which the cascade crosses tenants.

### R3 · check_schema_citations.py silently skips every NOT NULL `*_id` column — the J9 check ("a `*_id` column either has a foreign key or names a table") never sees them; seven live unenforced references pass — severity: major (guard whose parse proves nothing; bears on J1 and J9)

Where: tools/check_schema_citations.py:207 (type captured as `[A-Z][A-Za-z ]*`, so a column reads "UUID NOT NULL") and :287 (`if cols[col].upper() != "UUID": continue` — the skip meant for TEXT ids).

CONFIRMED by plant (backup review6/documents_core.bak, anchor asserted unique, restored, diff -q clean):
- add `"banana_id" UUID NOT NULL,` to CREATE TABLE "variation" in 20260925120000_documents_core -> tool prints "Every cited path and every named database object resolves." (exit 0)
- same column as `"banana_id" UUID,` -> "1 unresolved citation(s): `variation.banana_id` has no foreign key and names no table that exists".
Live consequence, from the real schema (pg_constraint query on a fresh db; detector checked: it lists audit_entry.subject_id and quote_line.recipe_id, the two known unconstrained columns): UUID `*_id` columns with no foreign key and NOT NULL, none reported by the tool:
  acceptance_withdrawal.withdrawn_by_user_id, invoice_void.voided_by_user_id, quote_issue.client_id, quote_issue.sealed_by_user_id, rejected_seal.client_id, rejected_seal.sealed_by_user_id, variation.recorded_by_user_id.
These are the actor columns M21 said the guard now finds ("the two columns in the schema that answer who did this"): there are seven more, and a tenant can record another tenant's user as the actor of a variation or void, with neither the J3 structural test (it inspects only FKs that exist) nor this tool noticing. The tool's banner "0 citations skipped" is true of citations and silent about this skip.
Second parse gap (CONFIRMED by reading + tool behaviour): FOREIGN KEY regex `FOREIGN KEY \("([a-z_]+)"\)` matches single-column keys only and never forgets a key once seen, so a composite re-add is invisible and a DROP CONSTRAINT with no re-add still counts as enforced. (Not planted separately.)

### R4 · (in passing, outside the seven) A tenant deletes its own audit trail by deleting its tenant row: audit_entry_tenant_id_fkey ON DELETE CASCADE — severity: major, pre-existing, not introduced by any of the seven fixes

Where: audit_entry_tenant_id_fkey (FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON UPDATE CASCADE ON DELETE CASCADE), from an earlier migration; tenant has an ALL policy.
CONFIRMED: db r6del, tenant C with one audit_entry and no documents; as pryvis_app with app.tenant_id = C: `DELETE FROM tenant;` -> DELETE 1; superuser count(*) FROM audit_entry -> 0.

### R5 · J2's row says the ceiling "is enforced whatever the caller does"; a caller that sets the public flag raises accepted_total_minor and invoices 50x the accepted total — severity: minor as a defect (the limit is stated in the migration), major as a disposition overclaim

Where: docs/PRD-REVIEW-4.md J2 disposition row; the ceiling reads issue_balance.accepted_total_minor (issue_ceiling_minor), a cache whose UPDATE policy issue_balance_amend admits any column when current_setting('pryvis.balance_write') = 'on'; 20260925120000_documents_core/migration.sql:798-801 states "Anyone who writes set_config('pryvis.balance_write', 'on', true) by hand defeats it".
CONFIRMED (review6/j2flag.sql, db r6j2, pryvis_app, tenant A): issue sealed at 100,000 and accepted; then in one transaction `SELECT set_config('pryvis.balance_write','on',true); UPDATE issue_balance SET accepted_total_minor = 5000000; INSERT INTO invoice ... 5000000` -> UPDATE 1, INSERT 0 1, COMMIT. Read back: invoiced 5000000 | quote_issue.total_minor 100000 | accepted_total_minor 5000000.
The J2 trigger does what the finding asked (a forgetful caller is refused); the row's "whatever the caller does" is not what the schema provides, and "accepted_total_minor ... written once, never again" (documents_core:428, domain-model.md:307) is enforced by nothing but the flag.

### R6 · The "flag is set in exactly one place" guard reads one migration of the six that set it — severity: minor (guard weakness)

Where: new-app/db/test/documents-core.test.ts:844-865 reads only 20260925120000_documents_core/migration.sql; the flag is set in code in 20260926190000, 20260926200000, 20260926220000, 20260927120000, 20260927130000 as well (grep, comment lines excluded: 14 occurrences across 6 files).
CONFIRMED by plant: appended `CREATE FUNCTION rogue_balance_writer() RETURNS text LANGUAGE sql AS $$ SELECT set_config('pryvis.balance_write', 'on', true) $$;` to 20260927140000_quote_lock_contract/migration.sql (backup review6/m140.bak, restored, diff -q clean): "✓ 2 · issue_balance has exactly one writer > sets the write flag in exactly one place ..." — 1 passed.

### R7 · J2's claimed documents still misstate the mechanism — severity: minor (text; J2's own "Where" files)

(a) docs/adr/0025-five-invariants-move-from-prose-to-code.md:67-70, the 2026-09-27 amendment: "a transaction-local flag only `issue_balance_open()` and `issue_balance_apply()` set, and since J2 those two are reached through triggers on every table that moves a total." Two parts are false:
  - `issue_balance_open()` is reached by no trigger. CONFIRMED (review6/j2open.sql, db r6j2b): an accepted acceptance inserted with no explicit open -> `SELECT count(*) FROM issue_balance` = 0. The only acceptance trigger is acceptance_quote_lock (takes the lock only). The accept() helper in documents-core.test.ts:73-86 calls it explicitly.
  - "only [those two] set" the flag: any session sets it (R5, executed); the migration it cites says so itself (documents_core:798).
(b) new-app/db/test/documents-core.test.ts:22-24, one of the three sentences J2 quoted: "A repository that never calls `issue_balance_apply` cannot insert an invoice without it — the policies see to that". Unchanged since 21c1ce9e (git blame). The outcome is now true; the cause it names is still false — the triggers see to it, not the policies (plant: dropping invoice_enforces_ceiling alone turns 18 tests red with every policy intact).

### R8 · J16's freeze trigger comment says a later column "fails closed"; it fails open — severity: minor (comment asserting the opposite of the mechanism; latent defect for the next column)

Where: new-app/db/migrations/20260926170000_rejected_seal_no_delete/migration.sql:48-50: "Column by column rather than with a row comparison, so a column added later is frozen by default: a future column would have to be named here to become editable, and forgetting to name it fails closed. The alternative — comparing whole rows and excluding three columns — fails open." The trigger (lines 55-70) lists the FROZEN columns, so an unnamed column is never compared: the design described as "fails open" is the safe one and the one built is the unsafe one.
CONFIRMED (review6/j16.sql, db r6j16): superuser `ALTER TABLE rejected_seal ADD COLUMN gate_note TEXT` (what a future migration would do), row inserted with gate_note 'client agreed 1 at the gate'; as pryvis_app tenant A: `DELETE FROM rejected_seal` -> DELETE 0 (J16 fix holds); `UPDATE ... SET total_minor = 2` -> refused by rejected_seal_freeze (holds); `UPDATE ... SET gate_note = 'rewritten'` -> UPDATE 1, read back 'rewritten'.
Today all 16 non-resolution columns are listed, so no current column is exposed; the defect is the claim, and it will become live on the first ALTER TABLE ... ADD COLUMN that trusts it.
Plants on the fix itself (backup review6/j16mig.bak, restored, diff -q clean): rejected_seal_resolve FOR UPDATE -> FOR ALL turns "J16 · cannot be deleted" red (and policy-parity); dropping the trigger turns "J16 · refuses an UPDATE that rewrites the price" and "J16 · refuses a quieter rewrite" red.

### R9 · J9: an acceptance can be bound to the render of a DIFFERENT issue, permanently; and it can still bind to nothing — severity: blocker for J9 (the finding's subject is "what the client signed")

Where: new-app/db/migrations/20260926150000_document_render/migration.sql:84-86 and its replacement 20260926180000_tenant_composite_keys/migration.sql:84-87: `FOREIGN KEY ("document_render_id", "tenant_id") REFERENCES "document_render" ("id", "tenant_id")`. The key carries the tenant but not the issue, so any render of the same tenant satisfies it. new-app/db/schema.prisma:733-734 the same.
CONFIRMED (review6/j9.sql, db r6j9, pryvis_app, tenant A): issue ...0001 "Fence" 100,000 on one quote; issue ...0002 "Roof" 9,000,000 on another; render d2 = roof.pdf of issue 0002. `INSERT INTO acceptance (... issue_id = 0001 ..., document_render_id = d2)` -> INSERT 0 1. Read back:
    mismatch | accepted_issue 99999999-...-000000000001 | render_of_issue 99999999-...-000000000002 | roof.pdf
And `INSERT INTO acceptance (... document_render_id = NULL)` -> INSERT 0 1.
Failure scenario: an application bug (wrong render id from a list, a stale id after a re-render of the other job) records that the client accepted the fence by signing the roof PDF. acceptance has no UPDATE policy and acceptance_issue_key allows one per (tenant, issue), so the wrong binding is the issue's only acceptance, for ever (J13 is open: a withdrawn issue cannot be re-accepted). In a dispute the record's "hash of the document signed" (PRD R1.20, docs/PRD.md:276-277) is the hash of a different document.
J9's resolution 2 asked for NOT NULL, or nullability tied to the grade by a CHECK "stated, not implied". Neither exists; the only statement is J3's migration:60-62 ("a NULL leaves the constraint unenforced, which is what 'no parent' should mean"), which is the J3 author's, not a decision on J9's question. The J9 disposition row does not mention nullability.
No behavioural test touches document_render: `grep -rn document_render new-app/db/test/*.ts` -> only policy-parity.test.ts:180 and row-convention.test.ts:55 (structure lists). The J9 plant that goes red is the citation tool (removing the FK: "`acceptance.document_render_id` names `document_render`, which exists, and has NO foreign key"), which fires only because the column happens to be nullable (R3).

### R10 · J9's migration says the domain model "is amended to say so"; it was not — severity: minor (a comment the same commit made false; J9's disposition says the documents "agree")

Where: new-app/db/migrations/20260926150000_document_render/migration.sql:21-25 ("The domain model said the hash 'is what `acceptance` and `quote_issue` point at'. A `quote_issue` cannot point at it ... So the render points at its issue, not the reverse, and the document is amended to say so.")
CONFIRMED by reading at HEAD: docs/design/domain-model.md:422 still reads "| `document_render` | A produced PDF: storage key, hash, the settings used. | Immutable, and the hash is what `acceptance` and `quote_issue` point at. |". domain-model.md is not in J9's disposition row's list of agreeing documents, but the migration names it as amended.
Also docs/adr/0024-acceptance-evidence.md:123: "The `document_render` hash is bound into the `acceptance` row ... | Exists" — bound to a render, not to the accepted issue's render (R9).
Addendum to R10: becd1dd's commit message says "the render points at the issue and the domain model is corrected to say so"; `git show becd1dd --stat` lists 15 files and docs/design/domain-model.md is not among them.

### R11 · J1: check_schema_citations.py prints "0 citations skipped" while silently skipping every citation within one line of 30 common phrases ("rather than", "instead of", "would be", "deleted", "nobody", ...) — 35 of 222 path citations today — severity: major (the J1 defect class, relocated: a silent skip behind a green banner)

Where: tools/check_schema_citations.py:138-145 (DENIALS) and :325-327 (`if DENIALS.search(window): continue` before every check on the line); banner at :380-384 ("0 citations skipped"); docstring :22-24 ("no silent skip anywhere").
CONFIRMED by plant (backup review6/documents_core.bak, anchor asserted unique, restored, diff -q clean, git status empty), two lines inserted after documents_core/migration.sql:36:
- "-- Every quote total is checked by `db/test/total-guard.test.ts`." -> "1 unresolved citation(s): ...:39: `db/test/total-guard.test.ts` resolves to nothing" (the J1 fix works for the plain case).
- "-- Every quote total is checked by `db/test/total-guard.test.ts`, rather than by a comment." -> "Every cited path and every named database object resolves." with the banner "0 citations skipped".
Measured with the tool's own regexes and file set (tools imported with bytecode off): 222 backticked path citations in scanned files, 35 of them on a line whose ±1 window matches DENIALS and are never checked. "rather than" is house style in this repository (the phantom sentence J1 found would have been skipped had it ended "..., rather than by review").
The old tool is still in CI (verify.yml:220) with the J1 bail-out unchanged (check_citations.py:198-199) — on the plain plant above it printed "Every cited path, filename and symbol resolves." — and docs/RULES.md 21.8 still says it "checks every backticked path". That is tolerable only because the new tool runs beside it; the Rule text is an overclaim (Rule 21.1).

### R12 · J1: money-convention.test.ts misses a 32-bit `_cents` amount and array-typed amounts; its "owner's ceiling" test asserts nothing about the schema — severity: minor-to-major (guard weakness; no live offending column today)

Where: new-app/db/test/money-convention.test.ts:70 (AMOUNT_SUFFIXES = _minor, _thousandths), :101-107 (forbidden types compared to information_schema data_type, which is 'ARRAY' for any array), :135 (name regex anchored at amount|total|...$), :140-155 (creates its OWN temp BIGINT table, stores 99,999,999,999 in it and asserts it came back).
CONFIRMED by plant (appended to 20260927140000_quote_lock_contract/migration.sql, backup review6/m140.bak, restored, diff -q clean):
  ALTER TABLE "invoice" ADD COLUMN "retention_cents" INTEGER;
  ALTER TABLE "invoice" ADD COLUMN "line_amounts" NUMERIC[];
  ALTER TABLE "invoice" ADD COLUMN "fx_rate" DOUBLE PRECISION[];
-> "Tests 6 passed (6)", including "holds the owner's ceiling, which a 32-bit column could not".
Detector control (same file, same method): `"gross" DOUBLE PRECISION` and a DOMAIN over NUMERIC -> red, "invoice.fee is numeric", "invoice.gross is double precision". So scalars are caught; arrays and a `*_cents INTEGER` column — the exact spelling CLAUDE.md documents for this product's money ("unitPriceCents", "totalCents", Int cents) and the int32 cap ADR 0011 names — are not. The ceiling test would pass with every money column INTEGER, because it never reads one.
The migration sentence J1 was about ("No floating-point type appears in this file, and `db/test/money-convention.test.ts` asserts it", documents_core:35-36) is still wider than the test: the test reads columns of the final schema, not "this file" (function bodies and variables are not examined).

### R13 · J12's fix removed the writer column and wrote the writer set back into prose beside it — wrong on two counts, both executed — and J12's cited H2 row is stale since J4 — severity: major for J12 (the finding's own class, re-committed in its fix)

Where: docs/design/domain-model.md:336-340 (git blame: 51a58c9, J12's fix commit): "`issue_balance` has no INSERT or UPDATE policy the application can satisfy, so the only door is `issue_balance_apply()` and `issue_balance_open()`; and since J2 those are not reached by a caller remembering to call them but by triggers on every table that can move a total. The writer set is therefore a property of the schema". Repeated at :343-347 ("no INSERT or UPDATE policy the application can satisfy ... there is no other door") and :354-355 (accepted_total_minor: "nothing else ever writes it").
- "no ... policy the application can satisfy" / "no other door" / "nothing else ever writes it": false — R5, executed: pryvis_app sets pryvis.balance_write and `UPDATE issue_balance SET accepted_total_minor = 5000000` -> UPDATE 1. The migration the paragraph relies on says so itself (documents_core:798-801).
- "those are ... reached ... by triggers": false for issue_balance_open() — R7(a), executed: an accepted acceptance with no explicit call leaves 0 issue_balance rows.
The finding's lesson was "a prose list of who writes the row goes stale"; the fix states who writes the row in prose, and it is wrong.
docs/PRD-REVIEW-3.md:21 (H2 row, rewritten by J12's fix, a J12 "Where" document): "credited a credit note as a writer of `invoiced_total_minor` — which it has never been" and "asserts which insert moves which column, including that a credit note moves none". Since J4 (20260926200000_scope_reduction) a credit note lowers invoiced_total_minor, and the J12 block now asserts exactly that ("a CREDIT NOTE moves invoiced_total_minor DOWN" -> `{ accepted: 100_000, variations: 0, invoiced: 25_000 }`). domain-model.md was updated for J4; the H2 row was not. CONFIRMED by reading at HEAD.
The J12 block itself is sound: it pins all three values per insert, and dropping each trigger in turn turned the matching J12 test red (variation, invoice_void, credit_note plants; invoice plant red with 17 others).

### R14 · J5: the PRD still calls it "a ladder of six grades" after the same commit retired one — severity: minor (a statement the fix made false, in a J5 "Where" document)

Where: docs/PRD.md:272 (R1.20: "acceptance is a ladder of six grades"); also docs/design/README.md:38, docs/TIERS.md:144, docs/THREAT-MODEL.md:190 ("six-grade ladder"). After 683a638 the live grades are 1, 2, 3, 4, 6 (acceptance-evidence.md:79-86, :150). 683a638 edited PRD.md (R1.20c, R1.20i) and left R1.20's count. CONFIRMED by reading at HEAD (grep -rni "six grades|six-grade").
Everything else J5 named agrees at HEAD: acceptance-evidence.md §4.2 (grade 1 includes a tenant-uploaded signed document; 5 tombstoned), PRD R1.20c ("grade 1 — witnessed by nobody ... we do not certify it"), ADR 0024:68-69 and :107-108 (uncertified, forgeable), domain-model.md:251-253.

### R15 · PLAUSIBLE (design reasoning, not executable): J5's new doctrine, applied as written, does not order grade 2 above grade 1 — severity: minor/question for the owner

Where: docs/PRD.md:308 (R1.20i, added by 683a638) and acceptance-evidence.md:75-76: "The grade measures WHO WITNESSED the acceptance". Grade 2's witness is "possession of a link" (acceptance-evidence.md:82); the tenant mints and holds that link and can tap it, so by the doctrine and by §2's test grade 2 can be produced by the tenant alone, like grade 1. Grade 3's witness is "the channel holder — if the channel is genuine", which §2 says "can [not] prove anything against the tenant" when the tenant supplied the address. J5's resolution 2 asked for the ordering rule as an explicit one-line test "does an uncontrolled third party attest something the tenant could not have fabricated alone?"; the fix adopted "who witnessed" without that test, and under the finding's test grades 2 and 3 would sit with grade 1. Not executed — no grade function exists yet (R1.20f). I report it as a twin of J5's argument, not as a demonstrated defect.

Addendum to R1 (provenance): ON UPDATE CASCADE was not introduced by J3 — documents_core:206-207 (quote_issue_quote_id_fkey) and :263-264 (issue_number_series_id_fkey) already had it, and 20260926150000_document_render:79-81 added it for rendered_by_user_id. J3's migration dropped and re-created every one of these keys and chose ON UPDATE CASCADE again for all 22, so Q4 was re-committed inside J3's fix rather than created by it. Neither the migration's "WHAT THIS DOES NOT DO" nor Rule 4.1 mentions the UPDATE action.

### R16 · J3 boundary probe: every composite key refuses the cross-tenant child (executed); the references with NO key accept another tenant's ids and are outside both J3 guards — severity: minor (integrity; no read or write into B's graph)

CONFIRMED (review6/j3x.sql, db r6j3; B's graph seeded as superuser/B; attack as pryvis_app with tenant A), each refused with 23503 naming the composite key: variation_issue_id_fkey, invoice_void_invoice_id_fkey, credit_note_invoice_id_fkey, acceptance_withdrawal_acceptance_id_fkey, document_render_issue_id_fkey, issue_number_issue_id_fkey, rejected_seal_line_seal_fkey, rejected_seal_quote_id_fkey; and the UPDATE direction `UPDATE quote SET client_id = <B's client>` -> refused by quote_client_id_fkey. (quote_issue_line was not reached: my insert omitted NOT NULL columns; its key is covered only by the structural test.)
Not refused: A seals its own issue with client_id = B's client and sealed_by_user_id = B's user -> INSERT 0 1, read back `cccc...bbbb | bbbb...bbbb`. These are the seven NOT NULL references with no foreign key listed in R3 (quote_issue.client_id, quote_issue.sealed_by_user_id, rejected_seal.client_id, rejected_seal.sealed_by_user_id, variation.recorded_by_user_id, invoice_void.voided_by_user_id, acceptance_withdrawal.withdrawn_by_user_id). tenant-isolation.test.ts:315-356 enumerates pg_constraint rows only, so a reference with no constraint is invisible to it, and check_schema_citations.py skips NOT NULL columns (R3). Rule 4.1 ("Every parent-child foreign key is composite ... a single-column exception must be named") is satisfied literally — they are not foreign keys at all.

### R17 · J3 item 4 (ROW_COUNT check in issue_balance_apply) has no test that goes red when it is removed — severity: minor (stated honestly by the author; recorded because Rule 1.5 counts a test only once it has failed)

Where: live definition 20260927120000_lock_isolation_and_tenancy/migration.sql:134-140; test documents-core.test.ts:1505-1519 says outright it asserts the G2 guard fires instead.
CONFIRMED by plant (backup review6/j3rc.bak, restored, diff -q clean): the IF v_written <> 1 ... RAISE block replaced by `NULL;` -> documents-core.test.ts "Tests 84 passed (84)".

### R18 · J9's original mechanism — a table cited in PRD prose that no migration creates — is still invisible to both citation tools — severity: minor (the tool's docstring states this limit; the J9 row's "guarded by tools/check_schema_citations.py" does not)

CONFIRMED by plant (docs/PRD.md R1.20, backup review6/prd.bak, anchor unique, restored, diff -q clean): added "and to the `render_manifest` row that lists every page." -> check_schema_citations.py "Every cited path and every named database object resolves."; check_citations.py "Every cited path, filename and symbol resolves." This is how `document_render` sat in PRD.md for a day (J9). The guard J9's row credits covers the column half of J9 (and only for nullable columns, R3), not the prose half the finding described; the tool's own docstring (:49-52) says so.

### Verdicts
J1 NOT CLOSABLE (R11, R3; R12 minor). J2 CLOSABLE on the mechanism; row text owes correction (R5, R7). J3 NOT CLOSABLE (Q4 = R1 confirmed, R2 cross-tenant cascade; R16/R17 minor). J5 CLOSABLE once R14's count is corrected (R15 plausible, for the owner). J9 NOT CLOSABLE (R9; R10, R18 minor). J12 NOT CLOSABLE (R13). J16 CLOSABLE (R8 comment to correct).
Tree: an untracked docs/design/acceptance-responses.md (mtime 16:38 UTC, "APPROVED by the owner 2026-09-27") appeared during this review; not created by this reviewer, not touched.
Gate: typecheck+test 10/10 tasks, 0 cached, exit 0: db 143, api 183, web 11, core 9, contract 2 (concurrency.pg 15 of the db 143). Four checkers exit 0.


---

<!-- Copied verbatim from the reviewer's findings file on 2026-10-01, headings shifted one level; the reviewer's text is unchanged. -->

## Review 5 — independent re-review of J1, J3, J9, J12, J13 at HEAD 8257173

Reviewer: independent subagent (Opus). Written as found. Every probe ran against real PostgreSQL 16
(`r5probe` = all 29 migrations + `pryvis_app`; `r5pre` = migrations up to 20260927140000) or against the
real tools/tests, with each plant applied to a tracked file from a backup copy under this directory and
restored (`diff -q` printed nothing; "restored" echoed after each).

Baseline at HEAD: `PRYVIS_PG_URL=… npx vitest run` in new-app/db -> 8 files, 165 passed.
Count claim checked: `r5pre` has 49 FKs, all 49 `confupdtype='c'` -> "all 49" is true.

---

### S1 — schema.prisma still disagrees with the migrations on ON DELETE for five keys, on the very lines 0e257b5 edited; `prisma migrate diff` would regenerate ON DELETE CASCADE — minor (J3)

Where: new-app/db/schema.prisma:211 (AppSession.user), :267 (AppCredential.user), :582 (QuoteSection.quote),
:607 (QuoteLine.quote), :609 (QuoteLine.section). DB side: 20260926180000_tenant_composite_keys sets
ON DELETE RESTRICT on all five.

Claim under test (commit 0e257b5 message, J3 disposition): "every relation states onUpdate: Restrict, so
Prisma cannot regenerate the cascade". True for ON UPDATE. False for ON DELETE: the commit rewrote
these five lines to add `onUpdate: Restrict` and left `onDelete: Cascade`, which the database does not have.

Executed:
    npx prisma migrate diff --from-url postgres://…/r5probe --to-schema-datamodel schema.prisma --script
Output (excerpt):
    ALTER TABLE "app_session" ADD CONSTRAINT "app_session_user_id_tenant_id_fkey" FOREIGN KEY ("user_id", "tenant_id") REFERENCES "app_user"("id", "tenant_id") ON DELETE CASCADE ON UPDATE RESTRICT;
    ALTER TABLE "app_credential" ADD CONSTRAINT "app_credential_user_id_tenant_id_fkey" … ON DELETE CASCADE ON UPDATE RESTRICT;
    ALTER TABLE "quote_section" ADD CONSTRAINT "quote_section_quote_id_tenant_id_fkey" … ON DELETE CASCADE ON UPDATE RESTRICT;
    ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_quote_id_tenant_id_fkey" … ON DELETE CASCADE ON UPDATE RESTRICT;
    ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_section_id_tenant_id_fkey" … ON DELETE CASCADE ON UPDATE RESTRICT;
(preceded by DROP of the five live RESTRICT keys). No ON UPDATE CASCADE appears anywhere in the diff, so
the ON UPDATE half of the claim holds.

Failure scenario: anyone who generates a migration from schema.prisma (the drift R1 was about) gets
deleting an app_user silently deleting its credential and sessions, and deleting a quote silently deleting
its sections and lines, where today both are refused. Pre-existing since 20260926180000 (not introduced by
0e257b5), but the commit's claim covers it and it edited those lines. schema-migration-parity.test.ts
disclaims relations, so nothing in the suite sees this. Note also the diff renames ~50 constraints/indexes
and drops/recreates three unique indexes (naming drift, pre-existing). CONFIRMED.

---

### S2 — check_schema_citations.py passes a phantom path silently when the citation climbs out of the repository; its comment says "said so in the report" and it is not — minor (J1, guard weakness)

Where: tools/check_schema_citations.py:261-265 (`except ValueError: return True  # outside the repository;
unjudgeable from here, and said so in the report`).

Executed (plant in docs/design/acceptance-responses.md, appended line, restored from backup, diff -q clean):
    The guard lives in `../../../../phantom/never-written.test.ts`.
    -> "Every cited path and every named database object resolves." exit=0
Control, same file:
    The guard lives in `new-app/db/test/never-written.test.ts`.
    -> "1 unresolved citation(s) … resolves to nothing" exit=1
Nothing about the outside-repo pass is printed anywhere in the report. CONFIRMED.

### S3 — a DROPPED index still "resolves": the schema parser never forgets an index, so a migration comment citing `acceptance_issue_key` (dropped by J13's own migration) passes — minor (J1, guard weakness)

Where: tools/check_schema_citations.py:150 (`self.indexes.update(...)` — no DROP INDEX handling; same for
functions, triggers, policies). The R3 fix added drop tracking for foreign keys only.

Executed (appended to new-app/db/migrations/20260927160000_acceptance_responses/migration.sql, restored):
    -- `acceptance_issue_key` still enforces one response per issue.
    -> "Every cited path and every named database object resolves." exit=0
Control:  -- `acceptance_issue_keyz` … -> exit=1 "is named here and is not a … index … that any migration declares".
So "Text presence is not existence" (the tool's own docstring, J9) is violated for every dropped index,
and J13 just created one. CONFIRMED.

### S4 — the R3 fix ("foreign keys tracked by constraint name … a DROP with no re-add" stops counting) misses ordinary DROP forms, and the *_id check misses ordinary ADD COLUMN forms; each passes silently — major for J1's claim, guard weakness (J1, R3)

Where: tools/check_schema_citations.py:165-171 (DROP regex needs `ALTER TABLE "t" DROP CONSTRAINT` adjacent),
:197-201 (ADD COLUMN regex needs `ADD COLUMN "c" [A-Z]+`), :187 (CREATE TABLE column needs an
upper-case type and a quoted name).

Executed, each line appended to the J13 migration, checker run, restored; each line also run in
BEGIN…ROLLBACK on r5probe and accepted by PostgreSQL 16 (valid DDL):
  plant                                                                                         checker
  ALTER TABLE IF EXISTS "quote_issue" DROP CONSTRAINT "quote_issue_client_id_fkey";              exit=0 PASS (key gone)
  ALTER TABLE ONLY "quote_issue" DROP CONSTRAINT "quote_issue_client_id_fkey";                   exit=0 PASS (key gone)
  ALTER TABLE "quote_issue" ADD CONSTRAINT "quote_issue_note_chk" CHECK (true),
                            DROP CONSTRAINT "quote_issue_client_id_fkey";                        exit=0 PASS (key gone)
  ALTER TABLE "quote_issue" DROP CONSTRAINT "quote_issue_client_id_fkey";  (control)             exit=1 caught
  ALTER TABLE "variation" ADD COLUMN "approved_by_user_id" uuid;                                  exit=0 PASS (unkeyed)
  ALTER TABLE "variation" ADD COLUMN IF NOT EXISTS "approved_by_user_id" UUID;                    exit=0 PASS (unkeyed)
  ALTER TABLE "variation" ADD "approved_by_user_id" UUID;                                         exit=0 PASS (unkeyed)
  ALTER TABLE "variation" ADD COLUMN "approved_by_user_id" UUID;  (control)                       exit=1 caught

Consequence: R16's class (a NOT NULL/nullable actor reference with no tenant key) re-enters through any of
the five uncaught forms. The structural guard does not back it up: with the lower-case plant in place,
`npx vitest run test/tenant-isolation.test.ts test/policy-parity.test.ts test/row-convention.test.ts` ->
3 files, 32 passed (that guard only inspects keys that EXIST; an absent key is invisible to it). Contrast
the migration 20260927150000 comment: "Each gets a composite key, which Rule 4.1 and the structural guard
in `db/test/tenant-isolation.test.ts` require" — the structural guard does not require a key to exist.
(For quote_issue.client_id specifically, documents-core's R16 test would still go red; for a NEW column
nothing but this tool looks, and the schema-migration-parity test only fails if prisma is not updated too.)
CONFIRMED.

### S5 — the banner "none skipped" omits 8 whole files (388 backticked path citations) and a silent *_id exemption — minor (J1, R11's class: the banner does not count what the tool passes over)

Where: tools/check_schema_citations.py:304-305 (`if path in EVIDENCE_DOCS: continue`, never printed),
:280-281 (UNCONSTRAINED_IDS `continue`, never printed), banner :402-407.

Executed: `python3 tools/check_schema_citations.py` prints "scanned 176 files … 3 citation(s) exempted by
name, none skipped" and lists 3 exemptions, 1 out-of-scope, 1 owed. Counting with the tool's own regex
over `git ls-files`: 838 tracked files with scanned extensions; 654 under original-app/.claude (by stated
scope); 8 EVIDENCE_DOCS present, containing 388 backticked path citations, none mentioned in the output;
`audit_entry.subject_id` exempted and not printed. Among the 8 is docs/PRD-REVIEW-4.md — the register whose
disposition rows cite the very tests and migrations claimed as fixes — and docs/MISTAKES.md, which credits
guards by path. Rule 21.9 (as restated by a1b95ea): "the banner must count what the tool actually passes
over". Exemption by purpose is allowed by 21.8; not printing it is the R11 defect in a new place. CONFIRMED.

---

### S6 — money-convention.test.ts passes an INTEGER money column named the way new-app/CLAUDE.md tells people to name money columns (`…_minor_units`) — major (J1, R12)

Where: new-app/db/test/money-convention.test.ts:79 (`AMOUNT_SUFFIXES = ["_minor", "_thousandths", "_cents"]`)
and :151 (the unit-name regex only matches names ENDING in amount|total|price|…). new-app/CLAUDE.md:59:
"Money is integer minor units in 64-bit columns named `…_minor_units`".

Executed (each appended to the J13 migration, `npx vitest run test/money-convention.test.ts`, restored, diff -q clean):
    ALTER TABLE "invoice" ADD COLUMN "retention_minor_units" INTEGER;   -> Tests 6 passed (6)
    ALTER TABLE "invoice" ADD COLUMN "retention_amount_jmd" INTEGER;    -> Tests 6 passed (6)
    ALTER TABLE "invoice" ADD COLUMN "retention_minor" INTEGER;  (control) -> 2 failed (bigint, ceiling)

Failure scenario: a developer follows the orientation file, adds `retention_minor_units INTEGER`, and the
int32 cap ADR 0011 names (21,474,836.47) returns with the guard green. R12's own rationale for adding
`_cents` ("the spelling most likely to come back, as a 32-bit column") applies with more force to the
spelling the project's own CLAUDE.md prescribes. The R12 parts claimed (array element types, domain
bases, `_cents`, ceiling through declared types) do hold — the `_minor` control fails as it should.
CONFIRMED.

---

### S7 — false issue_balance writer/mechanism claims survive outside committed migrations, one of them in a sentence J13 rewrote — minor (J12, Rule 21.10)

Rule 21.10 (added by 0297e64): a writer-set sentence cites its executing test or does not exist; the
mechanism is stated once, in ADR 0025. Still present, none in a committed migration:

1. new-app/db/schema.prisma:923-925 — "The application cannot write this table at all: its write policies
   require a transaction-local flag that only `issue_balance_apply()` sets." False twice: `issue_balance_open()`
   also sets it (R7's fact), and the application can set it itself (R5).
2. docs/adr/README.md:40 — ADR 0025's index line: "`issue_balance` has no write grant and one locked
   function". The app role has INSERT/UPDATE grants and there are two functions; ADR 0025 itself was
   amended, its index was not.
3. docs/PRD.md:385-388 (R1.24b) — "`accepted_total_minor` is written once, by the acceptance transaction
   … and never again". A writer-set sentence with no test cited; "never again" is false by R5.
4. docs/design/domain-model.md:392-396 (§6.3) — "Transitions that must be impossible, and are therefore
   tested … writing `issue_balance` outside its function". 44dab87 (J13) rewrote this sentence and kept
   the clause; THREAT-MODEL §4e (added by 0297e64) says the opposite.

Executed (r5probe, as pryvis_app, tenant A, synthetic issue 100,000 accepted and opened):
    UPDATE issue_balance SET accepted_total_minor = 9000000 …;                 -> UPDATE 0
    BEGIN; SELECT set_config('pryvis.balance_write','on',true);
    UPDATE issue_balance SET accepted_total_minor = 9000000 …; COMMIT;         -> UPDATE 1
    SELECT accepted_total_minor, issue_ceiling_minor(issue_id) …               -> 9000000 | 9000000
This is R5 itself (recorded as owed; NOT reported as new). The finding is that four prose/comment
sentences still deny it after the J12 fix and the rule it added. CONFIRMED (the sentences exist; the
behaviour they deny was executed).

---

### S8 — domain-model.md still says a second client response is refused; J13 made it taken — minor (J13, docs)

Where: docs/design/domain-model.md:478 (§8 sync table, `acceptance` row): "First write wins; a second is
refused, not merged". (Also :250, §6.2: "One acceptance per issue." — still true of ACCEPTED rows, but the
same row calls the table "The client accepting or declining an issue", so a reader takes it as one
response.) The J13 disposition says "`docs/design/domain-model.md` §6.3 updated" — §6.3 was; §6.2 and §8
were not.

Executed (r5race, all migrations, two pryvis_app sessions, tenant A, synthetic issue):
  decline then decline on one issue                              -> "ok ok" (both committed)
  T1 decline (open) ; T2 accept waits (advisory) ; T3 decline waits (advisory) ; T1 COMMIT
                                                                 -> accept ok; second decline refused
                                                                    (23514 "a decline cannot follow an acceptance")
  rows: accepted 1, declined 1.
So a second (and third) write is taken, not refused. The behaviour is the approved design; the
sentence is stale. CONFIRMED.

### S9 — deadlock list in new-app/CLAUDE.md is incomplete for responses; J13's "adds no deadlock shape" is true only because the shape pre-existed — minor (J13, documentation; not introduced)

Where: new-app/CLAUDE.md ("Two shapes can deadlock … two quotes … write then seal"); J13 migration
header "so it adds no deadlock shape to the two `new-app/CLAUDE.md` lists".

Executed on real PostgreSQL 16, ONE quote, no seal, READ COMMITTED, two pryvis_app sessions:
  A: rev1 = X, rev2 = Y. T1 BEGIN, decline X; T2 BEGIN, decline Y; T1 decline Y (waits: advisory);
     T2 decline X  -> T1: ERR 40P01 deadlock detected; T2 ok.            (r5race, post-J13; 2 runs)
  D: Y accepted+opened. T1 BEGIN, decline X; T2 BEGIN, invoice 100 on Y; T2 decline X (waits: advisory);
     T1 invoice 100 on Y -> T2: ERR 40P01 deadlock detected; T1 ok.        (r5race, post-J13; 2 runs)
Same two scripts on r5race_prej13 (every migration except 20260927160000):
  A -> s0 waits on "transactionid" (the old unique index), 40P01.   D -> T2 waits "transactionid", 40P01.
So J13 did NOT add these shapes (the claim holds in substance: the issue lock replaces the unique-index
wait one-for-one). But both are single-quote, seal-free deadlocks outside the "two shapes" the project
tells the application to retry, and after J13 shape A aborts a transaction both of whose responses are
now legal (pre-J13 one of them would have failed anyway). CONFIRMED (execution); the impact on a
future application is PLAUSIBLE.

Also executed and HELD (no finding): three sessions, accept in flight + two declines waiting -> both
declines refused, rows {accepted: 1}; decline in flight + accept + decline waiting -> accept taken,
later decline refused; responses on two issues of one quote do not block each other (5-6 ms); the
per-issue lock removed (plant, restored) -> both J13 races in concurrency.pg.test.ts fail (2 failed).

---

### S2 addendum — three more phantom-path forms that pass both tools silently (J1; Rule 21.8 says "checks every backticked path")

Executed (one line appended to docs/design/acceptance-responses.md, both tools run, restored, diff -q clean):
    Run `tools/never-written.sh`, see `new-app/db/never-written-dir/`, and `new-app/db/test/never-written.test.ts:12`.
    check_schema_citations -> "Every cited path and every named database object resolves." (exit 0)
    check_citations        -> "Every cited filename and symbol resolves. …"               (exit 0)
Why: CITED_PATH needs a 2-6 letter extension at the very end, and PATH_EXTS has no `.sh`; a `:line` suffix
or a trailing `/` defeats the match entirely. Directory citations are common in scanned files and are never
checked; e.g. `apps/api/src/pricing/scrapers/` (docs/PRICING.md:35) and `infra/` (new-app/CLAUDE.md:155)
match no tracked directory (some are planned work, which the tool cannot distinguish). Guard weakness, not a
user-visible defect. CONFIRMED.

---

### Checked and found NOTHING (stated so "clean" is distinguishable from "not looked at")

J3/J9 (database, r5probe as pryvis_app unless stated):
- No ON UPDATE CASCADE key remains: catalogue lists 56 FKs, every `confupdtype='r'`; r5pre had 49/49 'c'.
- Every uuid `*_id` column has a key, except audit_entry.subject_id (polymorphic, named), quote_line.recipe_id
  (owed, printed) and the deliberate single-column person keys (audit_entry.actor_user_id, platform_capability,
  mfa_*); every tenant-owned child key carries tenant_id. The seven R16 keys exist and are composite.
- acceptance.document_render_id is NOT NULL and keyed (document_render_id, issue_id, tenant_id); plant
  removing NOT NULL -> "R9 · REFUSES an acceptance that records no render at all" fails (1 failed), restored.
- Tenant delete as pryvis_app: refused by the trigger; `SET LOCAL session_replication_role = replica` ->
  permission denied; `TRUNCATE tenant CASCADE` -> permission denied; no SECURITY DEFINER function exists
  in the schema (pg_proc prosecdef all f), so no definer path around the current_user check.
- Audit rows: no UPDATE/DELETE policy on audit_entry; actor and tenant keys are RESTRICT; I found no
  referential action that deletes or rewrites an audit row from the application.
- No cross-tenant write through a referential action found: every remaining CASCADE is ON DELETE from
  tenant (blocked for the app) or from app_user to that same user's mfa/capability rows.
J13:
- Correctness under three-session races (S9 list) held; the plant removing the lock is caught by both races.
- State precedence: plant moving "sealed_awaiting_number" below the response states -> 1 documents-core
  test red (H4 block), restored; so unnumbered precedence is guarded, though the walk never reaches it
  (every walk seal is numbered in the same transaction).
- Readers of acceptance (issue_ceiling_minor, issue_balance_enforce, quote_issue_one_live_ceiling,
  acceptance_withdrawal_guard, quote_issue_state) all use EXISTS or key on the acceptance id; none assumes
  one row per issue. No api code reads acceptance.
- Walk oracle: derives responses, withdrawals and states from raw rows with no call to the functions under
  test; its response prediction mirrors the known gap (responses on superseded issues taken) rather than
  hiding a different one.
- Two-key vs one-key advisory spaces: confirmed separate (objsubid 2 vs 1); nothing else uses the two-key form.
J12: the J12 test block does assert accepted_total_minor unchanged after variation, invoice, credit note
  and void, as §6.2a now says.

Not checked: apps/api/web/mobile (out of these commits' scope; J13 has no api reader); Prisma Client runtime
behaviour; check_dispositions/check_rules internals beyond their exit lines; THREAT-MODEL §4e wording beyond R5.

---

### Verdicts

- **J1 — not closed.** R11's phrase window is gone and the exemption list is printed, but the banner
  "none skipped" still omits 8 whole files / 388 path citations and an unprinted *_id exemption (S5);
  phantom paths pass silently when they climb out of the repo, end in `.sh`, carry `:line`, or name a
  directory (S2); a dropped index still resolves (S3). R3: the constraint/column tracker misses
  `ALTER TABLE IF EXISTS|ONLY`, multi-clause DROP, lower-case types, `ADD COLUMN IF NOT EXISTS` and
  `ADD` without COLUMN, each silently (S4). R12: arrays/domains/_cents/declared-type ceiling hold, but
  `…_minor_units` — the spelling new-app/CLAUDE.md prescribes — escapes (S6).
- **J3 — fix holds for the parts claimed in the database** (R1/Q4 all 49 converted, R2, R16, R4). Not
  closed on the schema.prisma claim: "so Prisma cannot regenerate the cascade" is true for ON UPDATE only;
  five relations still declare onDelete: Cascade against RESTRICT keys and prisma migrate diff regenerates
  them (S1). R17 not examined (stated open).
- **J9 — fix holds for the part claimed (R9).** R10/R18 not examined (stated open).
- **J12 — not closed.** The §6.2a deletion holds, but four writer/mechanism sentences of the kind Rule 21.10
  forbids remain outside committed migrations (schema.prisma:923-925, adr/README.md:40, PRD R1.24b,
  domain-model §6.3 — the last re-written by the J13 commit) (S7).
- **J13 — fix holds for the parts claimed** (partial index, decline-after-accept refusal under the issue
  lock, withdrawal of accepted only, state "withdrawn"), verified by race and plant. Two documentation
  findings: stale "a second is refused" in domain-model §8/§6.2 (S8), and the deadlock list it leans on
  is incomplete, pre-existing (S9).


---

<!-- Copied verbatim from the reviewer's findings file on 2026-10-01, headings shifted one level; the reviewer's text is unchanged. -->

## Review 6 — second re-review of J1 (adversarial), J12 and J13 (closing checks), HEAD df3bef4

Baseline at HEAD (clean tree): check_schema_citations exit 0 ("scanned 178 files ... 16 citation(s) exempted
by name; 8 evidence document(s) not scanned"); check_citations exit 0; in new-app/db
`npx vitest run test/schema-objects.test.ts test/reference-keys.test.ts test/money-convention.test.ts` -> 14 passed.
Plant files: J13 migration (new-app/db/migrations/20260927160000_acceptance_responses/migration.sql, backup mig.bak),
docs/design/acceptance-responses.md (doc.bak), new-app/db/test/reference-keys.test.ts (refkeys.bak),
new-app/db/schema-objects.json (objects.bak). Every plant restored from its backup; `diff -q` printed nothing
and "restored" was echoed after each.

---

#### T1 — Function citations written `name()` — the form every migration uses — are not checked at all; 7 of 8 phantom forms in a migration comment pass — major (J1, guard weakness)

Where: tools/check_schema_citations.py:112 (`CITED_IDENTIFIER = `([a-z][a-z0-9]*(?:_[a-z0-9]+)+)``: the closing
backtick must follow the name, so `fn()` never matches), the migration-comment check near the end of main();
:270 (qualified check: `or column in objects`); :172-173 (settings parsed but only ever compared against
undotted identifiers).

Executed (8 comment lines appended to the J13 migration, tool run, restored):
    -- PLANT1 `issue_balance_never()` locks the row.
    -- PLANT2 `nevertable` holds it.
    -- PLANT3 `pryvis.never_flag` must be on.
    -- PLANT4 `public.never_object` exists.
    -- PLANT5 `quote.accepted_total_minor` is on quote.
    -- PLANT6 `quote_issue.recomputed_at` is on quote_issue.
    -- PLANT7 `Never_Index` is unique.
    -- PLANT8 `never_widget` control.
  -> "1 unresolved citation(s): ...:167: `never_widget` is named here and is not a table ..." exit=1
Only the control was reported. PLANT1 matters most: 41 migration lines cite functions as
`issue_balance_apply()`, `quote_money_lock()`, `rejected_seal_freeze()` (grep `\`[a-z_]*()\`` in
new-app/db/migrations), i.e. the citation form J2's lesson is about is the one form the "function" check
cannot see. PLANT3: custom settings always contain a dot (`pryvis.balance_write`, `app.tenant_id`), and neither
CITED_IDENTIFIER (no dot) nor CITED_QUALIFIED (`pryvis` is not a table) can match one, so the `settings` set the
docstring credits is never consulted for a real setting. PLANT5/6: `quote` and `quote_issue` are real tables
without those columns; the check passes them because the column exists on ANOTHER table (`issue_balance`) —
`accepted_total_minor` on the wrong table is precisely J12's subject. Also executed in a scanned doc
(docs/design/acceptance-responses.md, P9 `quote.accepted_total_minor`): silent.
I swept the current tree for the two highest-value forms (wrong-table `table.column`, `fn()` naming a
non-existent public function): no real phantom today (the `fn()` hits are core/JS functions like `now()`,
`gen_random_uuid()`). Guard weakness, not a user-visible defect. CONFIRMED.

#### T2 — Phantom paths still pass silently in six ordinary citation forms — minor (J1, guard weakness; S2's class)

Where: tools/check_schema_citations.py:107-110 (CITED_PATH requires an extension immediately before the closing
backtick or `:N`/`:N-M`; CITED_DIR requires a trailing slash), :78-81 (PATH_EXTS; comparison is case-sensitive).

Executed (lines appended to docs/design/acceptance-responses.md; both tools run; restored, diff -q clean):
    P1 `new-app/db/migrations/20260999000000_never_written`      (a directory without trailing slash)  silent
    P2 `docs/never-written.md#the-section`                        (anchor)                             silent
    P3 `new-app/db/test/never-written.test.ts:12:5`               (line:column)                        silent
    P4 `docs/NEVER-WRITTEN.MD`                                    (upper-case extension)               silent
    P6 `new-app/db/test/never-written.test.ts:L12`                                                     silent
    P7 `tools/never_written`                                      (no extension)                       silent
    P8 `new-app/db/never.env`                                     (extension not in PATH_EXTS)         silent
    P5 `new-app/db/test/never-written.test.ts` (L12)  (control)                                        REPORTED
    P10 two phantoms on one line (control)                                                             both REPORTED
  check_schema_citations: "3 unresolved citation(s)" (P5 and P10's two) exit=1; check_citations: clean.
Real-tree sweep with a looser pattern (backticked token containing "/" that neither regex matches): 247 such
citations in scanned files; most are URL routes, globs or branch names, but real directory citations without a
trailing slash appear and are unchecked, e.g. new-app/db/test-support/index.ts:17 `./test-support`,
CLAUDE.md:163 `apps/mobile/node_modules`, docs/MILESTONES.md:20 `pricing/scraper`. None of those is a
phantom of consequence. The docstring's limits section names only "paths written without backticks" and
"a backticked path with no slash" — not these. CONFIRMED.

#### T3 — `.claude/` is skipped without a word in the banner or the docstring (S5's class) — minor (J1)

Where: tools/check_schema_citations.py:76 (`SKIP_SCAN_PREFIXES = ("original-app/", ".claude/")`), banner :315-326,
docstring "What it does NOT prove" (mentions original-app/ only).
Executed: counted with the tool's own regexes over `git ls-files`: `.claude/` = 11 tracked .md files, 25 path
citations, none scanned, nothing printed; original-app/ = 706 files / 57 path citations (stated in the
docstring, not in the banner). The banner's evidence-document counts are PATH citations only; the
identifier/near-miss/qualified checks those documents also escape are not counted. All 25 `.claude/` citations
happen to resolve today (checked with the tool's own `resolve`). The banner reads as the complete list of
what was passed over ("8 evidence document(s) not scanned, listed below") and it is not. CONFIRMED.

#### T4 — Two CITATION_EXEMPTIONS reasons are not true as stated — minor (J1)

Where: tools/check_schema_citations.py:130-132 and :133-135.
1. (`DEPLOYMENT.md`, `.vercel/project.json`): "Written by the Vercel CLI locally and **gitignored**".
   Executed: `git check-ignore -v .vercel/project.json` -> exit 1 (not ignored); no tracked .gitignore
   mentions vercel. (DEPLOYMENT.md:120 itself only says "no checked-in `.vercel/project.json`", which is true —
   the exemption is fine, its reason is false.)
2. (`docs/adr/0012-new-app-structure.md`, `infra/docker-compose.yml`): "Owed, **cited as owed**". The cited
   sentence (0012:166) reads "`infra/docker-compose.yml` exists so row-level security runs in development." —
   present tense, not cited as owed. The exemption silences a sentence that is false today.
The other 14 entries checked and true as stated (see "checked and found nothing"). CONFIRMED (by reading +
git check-ignore).

#### T5 — NOT_A_REFERENCE exemptions can go stale unseen: the staleness assertion is vacuous for a missing column — minor (J1, guard weakness; brief category 8)

Where: new-app/db/test/reference-keys.test.ts:105-107
    expect(ids.find((c) => c.name === name)?.data_type, name).not.toBe("uuid");
A name that matches no column gives `undefined`, and `undefined` is "not uuid".
Executed: planted `"never_table.never_written_id": "PLANT: no such column.",` into NOT_A_REFERENCE (anchor
`"mfa_totp.secret_key_id":` asserted unique, count 1), `npx vitest run test/reference-keys.test.ts`
-> "Tests 4 passed (4)". Restored, diff -q clean. The docstring's "Every exemption still matches a column, so
none goes stale" is false for this list (the UNKEYED half is checked properly with toMatchObject). CONFIRMED.

#### T6 — reference-keys.test.ts: a "key" that does not enforce counts as keyed; a table outside `public` is invisible — minor (J1, guard weakness, latent)

Where: new-app/db/test/reference-keys.test.ts:64-67 (keyed = column appears in ANY FK's conkey), :71 (`public` only).
Executed, each appended to the J13 migration, test run, restored:
  ALTER TABLE "variation" ADD COLUMN "approved_by_user_id" uuid;  (control)                  -> 1 failed (caught)
  ALTER TABLE "variation" ADD COLUMN "approved_by_user_id" uuid, ADD COLUMN "approver_tenant" uuid,
    ADD FOREIGN KEY ("approved_by_user_id","approver_tenant") REFERENCES app_user(id, tenant_id); -> 4 passed
  CREATE SCHEMA billing; CREATE TABLE billing.retention_hold (id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
    quote_id uuid NOT NULL);                                                                  -> 4 passed
And on real PostgreSQL 16 (r6probe, all migrations), the composite key's effect:
  BEGIN; CREATE TABLE plant_t(id uuid primary key, approved_by_user_id uuid, approver_tenant uuid,
    FOREIGN KEY (approved_by_user_id, approver_tenant) REFERENCES app_user(id, tenant_id));
  INSERT INTO plant_t VALUES (gen_random_uuid(), gen_random_uuid(), NULL);  -> INSERT 0 1
  ... dangling references: 1; ROLLBACK;
MATCH SIMPLE skips the whole key when any column is NULL, so a nullable companion column makes the "key" an
opt-out. Existing schema: the only multi-column FK with a nullable column is
document_render_rendered_by_user_id_fkey (tenant_id NOT NULL, rendered_by_user_id NULL) — harmless. No uuid
column outside `*_id` exists today (queried). A partitioned table with no partition escapes too (4 passed)
but holds no rows; once a partition exists it is caught (1 failed). The docstring states the `*_id` naming
limit; it does not state the schema limit or the nullable-companion limit. CONFIRMED.

#### T7 — money-convention S6 rule is a word list: the plural of a listed word, and the Jamaican tax's own name, escape — major (J1, guard weakness; S6's class reproduced)

Where: new-app/db/test/money-convention.test.ts:88-89 (AMOUNT_WORD: whole words amount|total|...|fee|...),
:180-188; :195 (`_pct` permanently excused from the staleness check).
Executed, each appended to the J13 migration, `npx vitest run test/money-convention.test.ts`, restored:
  ALTER TABLE "invoice" ADD COLUMN "fees_jmd" INTEGER;               -> Tests 8 passed (8)
  ALTER TABLE "invoice" ADD COLUMN "payment_jmd" INTEGER;            -> 8 passed
  ALTER TABLE "invoice" ADD COLUMN "gct_jmd" INTEGER;                -> 8 passed
  ALTER TABLE "invoice" ADD COLUMN "retainage_jmd" INTEGER;          -> 8 passed
  ALTER TABLE "invoice" ADD COLUMN "retention_amount_pct" INTEGER;   -> 8 passed
  CREATE SCHEMA billing; CREATE TABLE billing.charge (id uuid PRIMARY KEY, total_minor INTEGER); -> 8 passed
  controls: "fee_jmd" INTEGER -> 1 failed; "retention_amount_jmd" INTEGER -> 1 failed (S6);
            "retention_minor_units" INTEGER -> 2 failed (bigint, ceiling) — S6's two plants are caught.
Failure scenario: the int32 cap ADR 0011 names returns through `fees_jmd INTEGER` or `gct_jmd INTEGER` with
the guard green. The test title says "every NUMERIC column that names an amount"; it is every numeric column
whose name contains one of 16 exact words. Guard weakness. CONFIRMED.

#### T8 — schema-objects.json is not "every table ... the migrations build"; the freshness test passes with tables, views, types and sequences missing from it — minor (J1, overclaim; latent)

Where: new-app/db/test/schema-objects.test.ts:52-62 (`relkind = 'r'`, `public` only; no views, types/enums,
sequences, schemas, extensions, roles); new-app/CLAUDE.md:88-90 ("the list of every table, column, function,
trigger, policy, index and constraint the migrations build").
Executed: appended to the J13 migration WITHOUT regenerating the file
    CREATE SCHEMA billing; CREATE TABLE billing.charge ("id" uuid PRIMARY KEY);
    CREATE VIEW "open_issue_v" AS SELECT id FROM quote_issue;
    CREATE TYPE "retention_kind" AS ENUM ('a');
    CREATE SEQUENCE "never_seq";
    CREATE TABLE "part_t" ("id" uuid, "k" int) PARTITION BY RANGE ("k");
  -> `npx vitest run test/schema-objects.test.ts` "Tests 2 passed (2)". Restored, diff -q clean.
Controls: a phantom function added to the JSON -> 1 failed; `CREATE INDEX "never_written_idx"` added to the
migration -> 1 failed. So the comparison itself is sound for the classes it reads. No such object exists in the
migrations today, so the effect is latent: citing one in a migration comment is a loud false positive, and a
`view.column` / `part_t.column` citation is silently skipped. CONFIRMED.

#### T9 — the tool's docstring, the verify.yml comment and Rule 21.8 claim more than the code does — minor (J1, overclaim)

- tools/check_schema_citations.py docstring: "Every citation is resolved, exempted by name with a printed
  reason, or reported." — false by T1 (7 of 8 forms) and T2 (7 forms). "1. Paths, with no bail-out." — T2.
  "2. An identifier backticked in a migration comment is a real object — a table, column, function, ... or a
  setting" — functions as cited (`fn()`) and every real setting are never checked (T1). "the report says how
  many citations that leaves unchecked" — path citations only, and not for `.claude/` (T3).
- .github/workflows/verify.yml:223-229: "Every cited path and database object, resolved against the CATALOGUE
  ... with no silent skip" — T1, T2, T3.
- docs/RULES.md:722-723 (Rule 21.8, not edited by 24a8b56 but relied on): "checks every backticked path and
  every named database object" — T1, T2.
- Rule 21.9's new text (RULES.md:760-764) is accurate as far as it goes (a list from the catalogue, a test that
  fails when stale — confirmed by the two controls in T8).
- new-app/CLAUDE.md:88-92 regeneration instruction: the command is right (the env var makes beforeAll write the
  file; without it the test only compares — read and confirmed by the T8 controls); the "every table ..." scope
  is overclaimed (T8).
CONFIRMED (each claim compared with an executed plant above).

---

### Part B — J12 closing check

Executed first, so the sentences below are judged against observed behaviour (r6probe = throwaway PostgreSQL 16
database with all 29 migrations + `pryvis_app` role as the harness grants it; synthetic tenant/user/client/quote):
    SET ROLE pryvis_app; tenant set; seal issue 100000; BEGIN; accept; issue_balance_open(); COMMIT;
    UPDATE issue_balance SET accepted_total_minor = 9000000 ...;                         -> UPDATE 0
    BEGIN; SELECT set_config('pryvis.balance_write','on',true);
    UPDATE issue_balance SET accepted_total_minor = 9000000 ...; COMMIT;                 -> UPDATE 1
    -> accepted_total_minor 9000000 | issue_ceiling_minor 9000000
    BEGIN; set flag; UPDATE issue_balance SET variations_total_minor = 5000000, invoiced_total_minor = 0; COMMIT;
    -> UPDATE 1; accepted 9000000 | variations 5000000 | invoiced 0 | ceiling 14000000
(R5 itself, already owed; reproduced here only to test the sentences.)

The five places named in the brief:
1. new-app/db/schema.prisma:922-926 (IssueBalance) — points at ADR 0025 decision 2, names no writer; the one
   mechanism clause it keeps ("which the application can also set itself") is TRUE (executed above).
   :934-936 (acceptedTotalMinor) — "No variation, invoice, void or credit note moves it" cites the J12 block,
   which does assert it (S7's reviewer confirmed; I read the test at documents-core.test.ts:418+). Clean.
   BUT :939-940, two lines below and untouched, fails — see T10 item (c).
2. docs/adr/README.md:40 — no longer says "no write grant and one locked function"; it says the writers "are
   enforced by the schema ... with its limit R5". Names no writer; acceptable.
3. docs/PRD.md R1.22b (:345) — "the accepted total, which no variation moves (R1.24b)": points at R1.24b, which
   cites the J12 block. Clean. R1.24b (:385-390) — the rewritten accepted_total sentence is clean, BUT its
   unchanged first sentence fails — T10 item (a).
4. docs/design/domain-model.md §6.3 (:392-397) — the clause is removed, with its history and R5 pointer. Clean.
5. docs/adr/0025 decision 2 amendment (:64-78) — "only" removed; true as amended. BUT the original bullets it
   keeps fail — T10 item (d).

#### T10 — six writer/mechanism sentences of Rule 21.10's kind survive, four of them false by execution — minor (J12, Rule 21.10)

a. docs/PRD.md:385-386 (R1.24b, first sentence, not edited by 24a8b56): "`issue_balance` is a derived cache
   with a lock, and **every writer re-sums from the underlying rows inside the lock** rather than trusting the
   cached figure." No test cited. False by the execution above: a writer that sets the flag writes an
   arbitrary figure without re-summing. The commit rewrote the very next sentence of the same requirement.
b. new-app/db/test/row-convention.test.ts:80-81 (a reason string in an exemption table): "**The application
   cannot write it at all**, so a version column would be a concurrency control for writes that cannot
   happen". False by the execution above (UPDATE 1 as pryvis_app). This is S7 item 1's sentence, word for
   word ("The application cannot write this table at all"), in a second file the sweep missed.
c. new-app/db/schema.prisma:939-940 (variationsTotalMinor / invoicedTotalMinor): "Re-summed from the rows
   inside the lock on every change, so these are a cache and never a second source of truth." False by the
   second execution above (variations 5000000, invoiced 0 written directly). Two lines below the comment
   the commit fixed.
d. docs/adr/0025-five-invariants-move-from-prose-to-code.md:56-60 (Decision 2's original bullets): "the list
   cannot go stale because there is no other way in" and "A **parser-based guard** asserts no other module
   writes the table". The amendment (:76-77) keeps only "the bullet above naming a `SECURITY DEFINER`
   function ... as the decision of its day"; these two are not covered by it, are present tense, and the
   second credits a guard I could not find (`grep -rln issue_balance new-app/api` -> nothing; no test in
   new-app/db asserts "no other module writes"). "cannot go stale" is one of the four phrases Rule 21.10 quotes.
e. docs/adr/0025-five-invariants-move-from-prose-to-code.md:131: "Decision 2, which says
   `accepted_total_minor` is written once, \"never again\"". Decision 2 no longer says that (`grep -n "never
   again"` finds only this line), and "written once" is the phrase the commit removed from PRD R1.24b and the
   documents-core test title as a Rule 21.10 claim.
f. new-app/db/test/policy-parity.test.ts:204 and :211-212: "Tables the application may read but **may only
   WRITE through a function**" / "it turns \"only a function writes this\" ... into a property this guard
   checks." The guard checks that the flag predicate appears in each write policy; it does not, and cannot,
   check that only a function sets the flag. False by the execution above.
Also observed, not counted (Rule 6): new-app/db/policies/002-documents-isolation.sql:137-156 ("writes need a
flag only a function sets ... A direct UPDATE from anywhere else fails the policy however it is granted and
whoever runs it") is false by the same execution, but policy-parity.test.ts requires that file to equal the
block embedded verbatim in the committed migration 20260925120000_documents_core (:791), so it cannot be
reworded without editing a committed migration. Its readers should be pointed elsewhere; I report, not fix.
CONFIRMED (sentences read at the cited lines; a, b, c, f contradicted by execution; d, e by grep).

---

### Part C — J13 closing check

#### C1 — domain-model §6.2 acceptance row (docs/design/domain-model.md:250) and §8 sync row (:479): match behaviour. Nothing found.

Executed on r6probe as pryvis_app, one synthetic issue (revision 2, sealed, unnumbered):
    decline; COMMIT                 -> ok
    decline; COMMIT                 -> ok                          (decline then decline: both kept)
    accept; COMMIT                  -> ok                          (decline then accept: taken)
    accept; COMMIT                  -> ERROR duplicate key value violates unique constraint "acceptance_accepted_issue_key"
    decline; COMMIT                 -> ERROR ... has been accepted; a decline cannot follow an acceptance ...
    rows: accepted 1, declined 2.
§6.2: "Many responses per issue, at most one accepted — declines are unlimited and may be followed by an
acceptance; a decline cannot follow an acceptance (J13)." — matches. §8: "Never merged. Declines are all
kept; the first ACCEPTANCE wins and a second is refused; a decline after an acceptance is refused" — matches.

#### T11 — new-app/CLAUDE.md's prescription "one client response per transaction, always" does not avoid S9's shape D; executed, it deadlocks with exactly one response per transaction — minor (J13, documentation)

Where: new-app/CLAUDE.md:110-116. The paragraph now NAMES both shapes ("two client responses, or a response and
an invoice ... in the other order") — so S9's listing half is fixed — but its rule is "Run those steps as
separate transactions: one client response per transaction, always." That is sufficient for shape A (two
responses) and not for shape D, whose transactions each contain ONE response.
Executed on r6probe (fresh synthetic quote: revision 1 = X sealed; revision 2 = Y sealed, accepted, balance
opened, ceiling 100000), two pryvis_app psql sessions, READ COMMITTED, twice:
    T1: BEGIN; decline X;  (sleep 2)           INSERT invoice 100 on Y; COMMIT
    T2: (sleep 1) BEGIN; INSERT invoice 100 on Y;   decline X; COMMIT
  run 1: T2 -> ERROR: deadlock detected; "waits for ExclusiveLock on advisory lock [...,2] ... blocked by
         process 13031 / Process 13031 waits for ShareLock on transaction 17384"; T1 committed.
  run 2: identical (processes 13040/13039).
Each transaction holds one client response, so it obeys the stated rule and still deadlocks. What is missing:
the rule must also keep a client response out of any transaction that writes another money row (invoice,
void, credit note, variation) on the same quote — e.g. "a client response is alone in its transaction" — or
the retry instruction must cover response-plus-anything. (Shape A is avoided by the rule as written: with one
response per transaction there is no second issue lock to take in the other order.) A natural flow this
blocks: "accept and raise the deposit invoice" in one transaction is exactly a response plus an invoice;
on the same issue it takes the locks in one order, so it is only the cross-issue variant that deadlocks —
PLAUSIBLE that an application would write the cross-issue variant; the deadlock itself is CONFIRMED.

---

#### T12 — suffix resolution lets a new-app citation resolve to the frozen original-app file of the same tail — minor (J1, guard weakness)

Where: tools/check_schema_citations.py resolve()/main(): every proper suffix of every tracked path, original-app
included, is accepted.
Executed: appended to new-app/CLAUDE.md "The entitlement guard is `packages/core/src/billing/entitlements.ts`
and the money rules are `src/tax/money.ts`." (`ls new-app/packages/core/src/billing` -> No such file or
directory) -> "Every cited path and every named database object resolves." Restored, diff -q clean.
In new-app/CLAUDE.md `packages/core/...` means new-app/packages/core; the file exists only in original-app/,
which ADR 0012 says is frozen and will be deleted. The docstring says original-app is indexed "so citations
into it resolve" — it does not say a citation meant for new-app will resolve there. CONFIRMED.

---

### Checked and found nothing (so clean is distinguishable from not looked at)

J1:
- S2 fixed as claimed: `../../../../phantom/never-written.test.ts` -> reported "climbs out of the repository";
  `tools/never-written.sh`, `new-app/db/never-dir/`, `new-app/db/test/never.test.ts:12` -> each reported.
- S3 fixed as claimed: `acceptance_issue_key` cited in the J13 migration -> reported (it is exempted only in
  20260926180000, by (file, name)).
- An exemption that excuses nothing fails the run: planted ("docs/PRICING.md", "never/used.md") -> "no longer
  needs an exemption — remove the entry", exit 1.
- Exemptions are printed per occurrence (DEVELOPMENT-BRIEF `infra/` appears twice in the banner), so a second
  use of an exempted name in the same file is visible, not silent.
- schema-objects.test.ts comparison is sound for the classes it reads: a phantom function added to the JSON ->
  1 failed; `CREATE INDEX "never_written_idx"` added without regenerating -> 1 failed. CI runs it
  (verify.yml verify-new-app `npm test`); PRYVIS_WRITE_SCHEMA_OBJECTS is set nowhere but the instruction text.
  (With the variable set, the test writes and then compares the file to itself — by design, for regeneration.)
- The S4 DDL forms through reference-keys: ADD COLUMN `approved_by_user_id uuid` -> caught; `uuid[]` -> caught
  by the non-uuid rule; a partitioned table once it has a partition -> caught.
- S6's own plants: `retention_minor_units INTEGER` -> 2 failed; `retention_amount_jmd INTEGER` -> 1 failed;
  `fee_jmd INTEGER` -> 1 failed.
- No current phantom of the T1 forms in the tree: swept all scanned files for wrong-table `table.column` and
  for `name()` naming no public function: no wrong-table citation; the `name()` hits are JS/SQL built-ins.
- No uuid column outside `*_id` exists today without a key (queried on r6probe); the only multi-column FK with a
  nullable column is document_render_rendered_by_user_id_fkey, whose nullable column is the reference itself.
- 14 of 16 CITATION_EXEMPTIONS reasons true as stated (CLAUDE.md and ARCHITECTURE.md mockup history; `dist/`
  gitignored per .gitignore:7; DEVELOPMENT-BRIEF's four planned dirs; PRICING's planned scrapers dir (no
  pricing/scrapers tracked anywhere); SERVICE-REGISTER, new-app/CLAUDE.md:163, new-app/README.md `infra/`;
  `withdrawn_at` names the rejected design at documents_core:269; `acceptance_issue_key` in 20260926180000:15
  was true when committed and 20260927160000:42 drops it).
- The `.claude/` citations the tool skips all resolve today (25/25).
- Rule 21.9's new text is accurate.
J12: items 1-5 of the brief as itemised in Part B.
J13: C1 behaviour matches both rows (executed). Shape A is avoided by "one client response per transaction".
Not checked: apps outside new-app/db and tools; THREAT-MODEL beyond §4e; check_rules/check_dispositions
internals; the 24a8b56 J3 change (not in scope).

---

### Verdicts

- **J1 — not closable**, because the citation tool still passes, silently, the citation form every migration
  uses for functions (`fn()`), every real setting, a real table cited with another table's column (T1), and
  seven ordinary path forms (T2); the money rule is a 16-word list that `fees_jmd INTEGER` and
  `gct_jmd INTEGER` pass (T7); a NOT_A_REFERENCE exemption cannot go stale-red (T5); and the docstring,
  verify.yml and Rule 21.8 still say "every"/"no silent skip" (T9). The catalogue replacement itself holds for
  what it reads (T8 controls). T3, T4, T6, T8, T12 are minor.
- **J12 — not closable**, because six writer/mechanism sentences of Rule 21.10's kind remain outside the
  committed migrations, four contradicted by execution (T10: PRD R1.24b "every writer re-sums";
  row-convention.test.ts "The application cannot write it at all"; schema.prisma "Re-summed ... on every
  change"; policy-parity "may only WRITE through a function"), plus ADR 0025's un-retracted "cannot go stale /
  parser-based guard" bullets and its :131 misquote of Decision 2. The eight sentences the commit did change
  are clean.
- **J13 — not closable as written, narrowly**: the §6.2/§8 rows are now correct (C1, executed), and the
  deadlock paragraph names both S9 shapes; but its prescription "one client response per transaction" does not
  prevent shape D, which deadlocked 2/2 with one response per transaction (T11). A one-sentence fix to the
  rule closes it.


---

<!-- Copied verbatim from the reviewer's findings file on 2026-10-01, headings shifted one level; the reviewer's text is unchanged. -->

## Review 7 — third re-review of J1, J12, J13 (HEAD af956fe)

Findings are numbered U1, U2, ... and written as found.

### U1 — minor — J1: a block comment in a migration makes a phantom setting "real" (miss within stated scope, form 3)

Where: tools/check_schema_citations.py:201-205 (`Schema.__init__` strips only `--` comments before
reading `current_setting('...')` / `set_config('...')`).

Stated scope (docstring form 3): "a backticked setting-shaped name ... must be a setting a migration reads
or sets". The docstring's own section on settings: "a name in a `current_setting(...)` or `set_config(...)`
call". A `/* ... */` comment is neither a read nor a set, and is text presence — J9's class.

Executed: appended to new-app/db/migrations/20260927160000_acceptance_responses/migration.sql
    /* current_setting('pryvis.ghost_flag') */
and to new-app/README.md
    PLANT-I `pryvis.ghost_flag`
Control (README plant alone, migration untouched): reported —
    new-app/README.md:43: `pryvis.ghost_flag` is not a setting any migration reads or sets
With the block comment added: that line disappears from the output; the citation passes silently.
No migration today contains `/*` (grep -l '/\*' migrations/*/migration.sql: empty), so nothing currently
hides behind it. Both files restored from backup, diff -q clean. CONFIRMED.

### U2 — minor — J1: path citations whose characters fall outside the regex pass silently (miss within stated scope, form 1)

Where: tools/check_schema_citations.py:116-120 (CITED_PATH), :121 (CITED_DIR). The first character must
be `[A-Za-z0-9_@.]` and every later one `[A-Za-z0-9_@./-]`.

Stated scope (form 1): "A backticked token containing a slash and ending in a listed extension (any case)
... or a backticked token ending in `/`". None of the following is excluded by that wording, and every
one passed silently, with the control on the next line reported:
    PLANT-A `/new-app/never-written-a.ts`                  (leading slash)       -> silent
    PLANT-B `new-app/web/app/(site)/never-b.tsx`           (Next.js route group) -> silent
    PLANT-C `new-app/web/app/[id]/never-c.tsx`             (Next.js dynamic seg) -> silent
    PLANT-J `new-app/web/app/(site)/`                      (directory)           -> silent
    PLANT-K `new-app/web/app/~never/k.ts` `.../never+k.ts` `.../$never/k.ts`      -> silent
    PLANT-F control `new-app/never-written-f.ts`           -> "resolves to nothing" (reported)
(A space in a path, PLANT-D, also passed; I do not count it — "token" can fairly be read as excluding
whitespace.) The bracket and parenthesis shapes are the App Router's own directory syntax and
new-app/web is a Next.js app, so the first dynamic route makes this a live gap. No current citation in a
scanned file has any of these shapes (searched; empty), so nothing is hiding today. Plants in
new-app/README.md, restored from backup, diff -q clean. CONFIRMED.

### U3 — minor — J1: underscore identifiers of other shapes pass silently in a migration comment (miss within stated scope, form 2)

Where: tools/check_schema_citations.py:126 (CITED_IDENTIFIER_ANY_CASE requires every `_` to be followed
by at least one alphanumeric and the name to start with a letter).

Stated scope (form 2): "In a migration comment: a backticked identifier containing an underscore, in
any case, must be a table, column, ...".
Executed, appended to the 20260927160000 migration as `--` comments:
    `never__table_m1`   -> silent
    `_never_table_m2`   -> silent
    `never_table_m3_`   -> silent
    control `never_table_m6` -> "is named here and is not a table, column, ..." (reported)
All three are legal unquoted PostgreSQL identifiers containing an underscore. Restored, diff -q clean.
CONFIRMED.

### U4 — minor — J1: a schema-qualified call in a migration comment is not checked (miss within stated scope, form 2/3)

Where: tools/check_schema_citations.py:128 (CITED_CALL cannot start after a dot) and :130 (CITED_DOTTED
requires the closing backtick straight after the name, so `()` defeats it).
Stated: form 2 "a backticked call, `name()` or `name(args)`, must be a function the migrations create";
form 3 "a backticked `public.name` must name an object".
Executed: `public.never_fn_m4()` in a migration comment -> silent; control `never_fn_m6()` ->
"is cited as a function and no migration creates it". Restored, diff -q clean. CONFIRMED.
(Not counted as findings, recorded for the owner: `issue_balance_apply(never_fn_m5())` — the inner call
is unchecked; `never_table_m7.amount_minor` and `Quote.Never_Col_M8` pass, and form 3 restricts itself
to a table that exists and to lower case, so these are stated limits.)

### U5 — minor — J1: `public.<column>` passes as "an object"

Where: tools/check_schema_citations.py:345 (`tail not in objects`, and `objects` includes every column
of every table, :208-213).
Stated (form 3): "a backticked `public.name` must name an object". Executed in new-app/README.md:
`public.accepted_total_minor` -> silent. No relation, function or other schema-level object of that name
exists in public; `accepted_total_minor` is a column of `issue_balance`. The control
`public.never_object_h` is reported. Restored. CONFIRMED. (Severity minor: a column name is a real name,
just not one that `public.` can qualify.)

### U6 — minor — J1: overclaim — "What it does not scan is listed on every run" / "states everything it does not scan"

Where: tools/check_schema_citations.py docstring ("What it does not scan is listed on every run:
original-app/ and .claude/ ... and the eight evidence documents"), its failure banner (:411-413
"states everything it does not scan"), SCAN_EXTS at :86, and the silent `except (UnicodeDecodeError,
FileNotFoundError): continue` at :288. Rule 21.8 (docs/RULES.md:724-725): "Both scan tracked Markdown
and source, both state what they do not scan".
Observed: outside original-app/ and .claude/, tracked files with extensions not in SCAN_EXTS are skipped
and never counted or listed: 16 .json, 3 .svg, 1 .png, .gitignore, 1 .example, 1 .css
(new-app/web/app/globals.css, which carries backticks in a comment at line 116).
Executed: appended to the backticked span in new-app/web/app/globals.css:116
    see `new-app/never-written-css.ts` and `quote.never_col_css`
Tool output: still "4 unresolved" from the other plant then active, neither css plant reported, and
`grep -i css` over the full output prints nothing — the banner does not mention the skip. Restored,
diff -q clean. CONFIRMED. (Guard-description weakness; nothing is hiding in those files today.)

### U7 — major — J1 (T7): a numeric money column behind three domains escapes the "closed list" and every other money assertion

Where: new-app/db/test/money-convention.test.ts, the catalogue query (`JOIN pg_type t ON t.oid = CASE WHEN
d.typtype = 'd' THEN d.typbasetype ...`, `JOIN pg_type base ...`, `format_type(CASE WHEN base.typtype = 'd'
THEN base.typbasetype ...)`). It unwraps a domain at most twice. `pg_type.typbasetype` of a domain over a
domain is the inner DOMAIN, not the ultimate base type, so a third level reports the middle domain's
name as `data_type`, which is in no type set.
Claim (the T7 docstring above NUMERIC_NOT_MONEY): "every numeric column that is NOT bigint is named here
with why it is not money, and anything else fails, whatever it is called ... a list of the columns
themselves cannot [be named around]". Query comment: "A domain first resolves to its base type; an array
then to its element; and an element that is itself a domain to that domain's base."
Executed (throwaway migration new-app/db/migrations/29990101000000_review7_plant, deleted after):
    CREATE DOMAIN r7_amount1 AS numeric(12,2);
    CREATE DOMAIN r7_amount2 AS r7_amount1;
    CREATE DOMAIN r7_amount3 AS r7_amount2;
    CREATE TABLE r7_plant (id uuid PRIMARY KEY, fee_jmd r7_amount3, price_list r7_amount2[], client_id uuid REFERENCES client(id));
`npx vitest run test/money-convention.test.ts` -> "✓ test/money-convention.test.ts (10 tests)" — all ten
pass, including the closed list, the forbidden-types test and S6's amount-word test, with a NUMERIC(12,2)
column named `fee_jmd` and a NUMERIC array named `price_list`.
Control (detector fires on the shape it handles): the same plant with `fee_jmd r7_amount2` and
`price_list r7_amount1[]` -> 3 failed: "r7_plant.fee_jmd is r7_amount2: money must be bigint, or name it
as not money", "...price_list is r7_amount1[]...", plus the forbidden-type and S6 failures.
So two levels are caught, a third level (or an array of a two-level domain) is not. CONFIRMED.
Severity: major because the T7 docstring's whole claim is that this list "cannot be named around", and it
is named around by DDL PostgreSQL accepts. Not a live defect: the schema has 0 types (schema-objects.json).

### U8 — minor — J1 (T6): reference-keys counts a foreign key whose enforcement a migration has switched off

Where: new-app/db/test/reference-keys.test.ts, the `keyed` expression (comment: "Keyed only by a key that
ENFORCES").
Executed: the U7 plant migration with `ALTER TABLE r7_plant DISABLE TRIGGER ALL;` after creating
`client_id uuid REFERENCES client(id)` -> `✓ test/reference-keys.test.ts (4 tests)`.
That the key then does not enforce, on real PostgreSQL 16 (throwaway database r7_fk, dropped):
    CREATE TABLE client (id uuid PRIMARY KEY);
    CREATE TABLE r7_plant (id uuid PRIMARY KEY, client_id uuid REFERENCES client(id));
    ALTER TABLE r7_plant DISABLE TRIGGER ALL;
    INSERT INTO r7_plant VALUES (gen_random_uuid(), gen_random_uuid());   -> INSERT 0 1
    dangling = 1; pg_constraint shows r7_plant_client_id_fkey, convalidated = t
CONFIRMED. Guard weakness (no migration does this today); the docstring's "every `*_id` row reference in
the schema has a foreign key" stays literally true, the inline comment's "ENFORCES" does not.

### U9 — minor — J1: overclaim — form 2 says sequences, types and schemas resolve; the tool rejects them

Where: tools/check_schema_citations.py docstring form 2 ("must be a table, column, function, trigger,
policy, index, constraint, sequence, type, schema or setting in the catalogue the migrations build");
`Schema.__init__` (:184-205) never loads `sequences`, `types` or `schemas` from schema-objects.json, and
`objects` (:207-213) omits them.
Executed: with the U7 plant migration and schema-objects.json regenerated from it
(`PRYVIS_WRITE_SCHEMA_OBJECTS=1 npx vitest run test/schema-objects.test.ts` -> 2 passed), a comment in the
tracked migration 20260927160000 citing `r7_plant_seq`, `r7_plant_kind`, `r7_amount3` and table
`r7_plant`: the table resolved; the sequence, the enum and the domain were each reported "is named here
and is not a table, column, function, trigger, policy, index, constraint or setting" — the tool's own
message omits the three kinds its docstring claims. Wrong in the safe direction (false alarm, not silent
pass); the schema has 0 sequences and 0 types today. schema-objects.json and the migration restored from
backup, diff -q clean; plant directory deleted. CONFIRMED.

---------------------------------------------------------------------------------------------------
## Part B — J12

Setup for everything below: throwaway database r7_j12 on PostgreSQL 16 (127.0.0.1:55440), every migration
applied in order with psql, `pryvis_app` granted exactly what test-support grants; synthetic tenant
11111111-..., quote, issue f0000000-...-0001 (total_minor 100000) accepted through
`issue_balance_open()` as the documents-core `accept()` helper does. Dropped afterwards.

R5 re-executed (as pryvis_app, app.tenant_id set):
    UPDATE issue_balance SET invoiced_total_minor = 999;                    -> UPDATE 0   (no flag)
    BEGIN; SELECT set_config('pryvis.balance_write','on',true);
    UPDATE issue_balance SET accepted_total_minor = 99999999999 WHERE ...;  -> UPDATE 1
    COMMIT;
Control before it: INSERT INTO invoice ... amount_minor 150000 -> "ERROR: invoiced total 150000 exceeds
the ceiling 100000". After it, the same INSERT -> INSERT 0 1; issue_balance then reads
accepted_total_minor 99999999999, invoiced_total_minor 150000, against quote_issue.total_minor 100000.
No function is SECURITY DEFINER (pg_proc.prosecdef false for all 13). R5 holds as THREAT-MODEL §4e states.

The seven sentences 9e83436 changed: checked one by one, see "checked and found nothing". The sweep found
the following, none citing a test that executes it.

### U10 — major — J12: three writer-set sentences in the J12 test file itself, false by execution and never reported

Where: new-app/db/test/documents-core.test.ts
- :812 `describe("2 · issue_balance has exactly one writer", ...)` — two functions set the flag (and four
  later migrations redefine them, R6) and the application can set it (R5, executed above). The block
  executes only the no-flag case.
- :814-816 "The write policies require a transaction-local flag that only the function sets." — "only the
  function sets" is R5's false sentence verbatim. Executed above: pryvis_app set it and wrote the row.
- :860 `it("opens the balance row as part of accepting, not as a separate step somebody may forget")` —
  it IS a separate step: the test's own `accept()` helper (:76-83) calls `issue_balance_open()`
  explicitly, and the same file's N2 test (:1113-1116) says "Nothing makes `issue_balance_open()` run with
  every acceptance, so the state is reachable". Executed on r7_j12, as pryvis_app: an `accepted`
  acceptance inserted (render first, autocommit) for a second synthetic issue without calling the
  function -> committed; `SELECT count(*) FROM issue_balance WHERE issue_id = <it>` = 0.
Rule 21.10's case exactly: a sentence saying who writes `issue_balance`, in the one file a reader is told
to trust, false by execution. R6 (PRD-REVIEW-4.md:2440) reported only the :868 "exactly one place" guard;
grep of PRD-REVIEW-4, BRIEF-STATUS and MISTAKES finds none of these three. CONFIRMED.

### U11 — major — J12: PRD R1.24a and R1.15c still state the writer set, false by execution

Where:
- docs/PRD.md:377-378, R1.24a: "The `issue_balance` row is created **in the same transaction as the
  acceptance, unconditionally**". False — R7/R13: the same word was removed from domain-model §6.2a for
  being false ("This section said, until 2026-10-01, that the row was created 'unconditionally' and
  'cannot be forgotten'; neither was true (R13)", docs/design/domain-model.md:302-304), and the PRD copy
  survived. Executed: acceptance committed with 0 balance rows (U10).
- docs/PRD.md:211, R1.15c: "`accepted_total_minor` stays written-once". False by R5 — executed above:
  pryvis_app rewrote it to 99999999999 in a committed transaction. ADR 0025 itself now retracts "written
  once, never again" (decision 2's misquote note, corrected in 9e83436), so the PRD says what the ADR no
  longer does.
Neither cites a test; the J12 block executes only that the four money inserts leave it alone. CONFIRMED.

### U12 — minor — J12: ADR 0025 decision 2 says the writer set "is enforced by the schema" in the sentence before saying it is not closed

Where: docs/adr/0025-five-invariants-move-from-prose-to-code.md:77-80: "The decision stands — the writer
set is enforced by the schema, not a paragraph — but its mechanism is policies plus triggers, and all
three bullets above are kept as the decision of its day, none built as written: ... the writer list is not
closed (R5)". Mirrored in docs/adr/README.md:40: "`issue_balance`'s writers are enforced by the schema,
not a paragraph (... with its limit R5)".
The schema enforces that a write carries the flag; it does not enforce a set of writers, because any
session can raise the flag (R5, executed above). The README line is qualified ("with its limit R5"); the
ADR's "The decision stands" is not, and contradicts its own clause two lines later. Severity minor: the
limit is stated beside it. CONFIRMED (the false half executed above).

### U13 — minor — J12 (one of the 9e83436 sentences): R1.24b's "rather than trusting the cached figure" is false of the figure the ceiling uses

Where: docs/PRD.md:385-386, R1.24b as rewritten by 9e83436: "the balance functions re-sum from the
underlying rows **inside** the lock rather than trusting the cached figure."
`issue_balance_apply()` re-sums `variations_total_minor` and `invoiced_total_minor` only;
`issue_ceiling_minor()` reads `b."accepted_total_minor" + b."variations_total_minor"` FROM issue_balance —
the cached copy (pg_get_functiondef on r7_j12). `issue_balance_open()` re-sums nothing and inserts ON
CONFLICT DO NOTHING. Executed above: after the cached accepted_total_minor was raised, an invoice of
150000 against an issue whose total is 100000 was accepted — the functions trusted the cache. The next
sentence's R5 caveat says a caller can write the row; it does not say the ceiling then believes it.
THREAT-MODEL §4e:219-220 does say this, so the defect is recorded; the R1.24b sentence is not true as
written. CONFIRMED.

### U14 — minor — J1: overclaim in schema-objects.test.ts — "so a citation to it fails"

Where: new-app/db/test/schema-objects.test.ts:11-12: "A dropped object leaves the catalogue, so it leaves
the file, so a citation to it fails."
True only for the forms the tool checks (a migration comment; `table.column`; `public.name`). In a
prose document a bare identifier is not checked (the tool's docstring says so).
Executed: appended to new-app/README.md "The index `acceptance_issue_key` keeps one response per
issue." — the very index the docstring names as dropped (S3) -> "Every cited path and every named
database object resolves." Restored, diff -q clean. CONFIRMED. The tool's own docstring states the limit
correctly; this docstring does not.

(Also an overclaim, recorded under U7: money-convention.test.ts says it "asks `information_schema`"
— it queries pg_attribute/pg_type — and that text-search "would be ... defeated by a type introduced
through a domain", implying the catalogue query is not; U7 defeats it with a domain chain.)
(Also under U1: schema-objects.test.ts says settings come from "`current_setting(...)` and
`set_config(...)` calls"; a block comment counts.)

---------------------------------------------------------------------------------------------------
## Part C — J13

Scripts: scratchpad/review7/race/ (setup.sql, fn.sql, seedrun.sh, run.sh). Throwaway database r7_race on
PostgreSQL 16, every migration applied, pryvis_app with test-support's grants, a fresh synthetic quote per
run (X = revision 1, Y = revision 2; for D, Y accepted and its balance opened). Two pryvis_app psql
sessions, `SHOW transaction_isolation` = read committed in both. T2 starts 1 s after T1; T1 sleeps 2 s
holding its first write. Dropped afterwards.

Controls (the shapes as S9/T11 wrote them, breaking the rule):
    A_bad run 02: T1 ERROR: deadlock detected; committed: 2 declines
    A_bad run 03: T1 ERROR: deadlock detected; committed: 2 declines
    D_bad run 04: T2 ERROR: deadlock detected; committed: 1 decline, 1 invoice
    D_bad run 05: T2 ERROR: deadlock detected; committed: 1 decline, 1 invoice
Following new-app/CLAUDE.md:116-119 ("a client response is alone in its transaction"), same steps, same
timing, each response committed in its own transaction, the other write in a separate one:
    A_ok runs 06, 07, 08: no error in either session; 4 declines committed each run
    D_ok runs 09, 10, 11: no error in either session; 2 declines and 2 invoices committed each run
(In each ok run the second session's write to the issue the first still held did wait, then proceed.)
Extra, three sessions: T1 accepts Y, sleeps 2 s, then calls `issue_balance_open(Y)` in the same
transaction (the companion the acceptance path requires); T2 declines X alone; T3 seals revision 3 at
t=1 s (exclusive quote lock, queued). All three completed, no error; balance row opened; 3 issues.

Why it is sufficient, from the functions (pg_get_functiondef on r7_race): the per-issue advisory lock is
taken only by `acceptance_response_rules()`, after the quote lock (`acceptance_quote_lock` fires first);
withdrawal, invoice, void, credit note and variation take the quote lock and balance row locks, never a
per-issue lock. A transaction holding one response holds at most one per-issue lock and acquires nothing
after it except, for an acceptance, the same quote lock again and its own balance row. So no cycle can
include a response-alone transaction. Remaining shapes (two quotes; write then seal) are the ones the
paragraph already tells the application to retry. CONFIRMED (execution) for A and D; the general argument
is reasoning over the function bodies.

No finding for J13.

---------------------------------------------------------------------------------------------------
## Checked and found nothing

Part A (J1):
- Controls: every detector I relied on fired on a known-bad plant: a missing path (`new-app/never-written-f.ts`),
  `quote.never_col_minor`, `public.never_object_h`, `pryvis.ghost_flag` (without U1's comment),
  `never_table_m6` and `never_fn_m6()` in a migration comment, `../../outside/never.md` (reported as
  climbing out), `apps/mobile/` and `apps/api/src/main.ts` from a new-app file (T12 holds: reported),
  `accepted_total` (near miss reported), `NEW-APP/README.MD` (reported), `new-app/never.MD#x` (reported);
  `new-app/README.md:L12-L20` resolved correctly.
- schema-objects.json freshness: adding a migration without regenerating -> "1 failed" in
  schema-objects.test.ts listing every new name; `toEqual` over the whole object, so an extra key or a
  missing name in the committed file fails either way; the test is in `npm test` (vitest run, no excludes)
  and CI runs npm test. CLAUDE.md's regeneration command works as written (executed, 2 passed).
- reference-keys: beyond U8, the catalogue query covers every user schema, relkind r and p, MATCH FULL vs
  nullable companion as its comment says; a domain over uuid is not "uuid" and therefore falls into the
  "name every non-uuid *_id column" test, so it cannot escape silently. Inheritance children (not
  partitions) do not inherit FKs and would be reported.
- money-convention: beyond U7, arrays of numeric, one- and two-level domains, and arrays of a one-level
  domain are caught (control run, 3 failed); every user schema is read.
- CITATION_EXEMPTIONS, every reason checked against the text: `row_count` (GET DIAGNOSTICS ... = ROW_COUNT,
  migration line 86) true; `withdrawn_at` (documents_core:269, the rejected design) true;
  `acceptance_issue_key` (dropped by 20260927160000:42, never recreated) true; `.vercel/project.json`
  (`git check-ignore` exit 1: not ignored; DEPLOYMENT.md:120 says not checked in) true;
  `infra/docker-compose.yml` (ADR 0012:166 "planned ... not built yet") true; DEVELOPMENT-BRIEF
  `catalog/`, `messaging/`, `support/`, `infra/` (x2) planned and absent, true; PRICING
  `apps/api/src/pricing/scrapers/` (no pricing dir in original-app/apps/api/src) true; SERVICE-REGISTER,
  new-app/CLAUDE.md and README `infra/`, `mobile/` absent and listed as not built, true.
  Nit only: the ARCHITECTURE entry's reason "The same deleted mockup, the same history." has no antecedent
  in this dict (it reads as copied from a list where it followed another entry); the substance — a
  mockup that existed in history (7c8ef83) and is deleted — is true.
- SQL_CONSTRUCTS: greatest, least, nullif, coalesce — `pg_proc` on PostgreSQL 16 has none of the four, and
  none is in schema-objects.json's builtin_functions; each is a SQL conditional expression. True.
- Stated limits NOT reported, per the owner's decision: path with a space (PLANT-D); a call nested in an
  argument (`issue_balance_apply(never_fn())`); an unknown table's `table.column`; mixed-case
  `Quote.Never_Col`; `never$table`; paths inside multi-word backticked commands (e.g. `node
  apps/api/dist/main.js` — build outputs); docs/DEVELOPMENT-BRIEF.md:76 `mobile/` "inside new-app/"
  resolving through original-app/apps/mobile (a docs/ file; the docstring says citations elsewhere may
  mean the earlier application).
- Rule 21.9 and the verify.yml comment: true apart from "what it does not scan, it prints" (U6).
- Gates at the end, tree clean: the three db tests 16 passed; the four checkers' last lines exactly as in
  the setup facts.

Part B (J12), the seven sentences 9e83436 changed:
- PRD R1.24b: second sentence true (R5 executed); first sentence U13.
- row-convention.test.ts issue_balance reason: true ("meant to", R5 caveat; "Never deleted": no DELETE
  policy, forced RLS, documents-core "has no DELETE policy" executes it).
- schema.prisma totals comment: true (apply re-sums both; R5 executed).
- policy-parity.test.ts: true; no test checks who sets the flag (only the R6-narrow migration count),
  and the application can (executed).
- ADR 0025 decision 2 "none built as written": true — prosecdef false for all 13 functions; R5 executed;
  no file in new-app/api, packages, web mentions issue_balance, so no parser guard exists.
- ADR 0025 misquote tense: true.
- ADR 0025 decision 1 "one function, `issue_ceiling_minor()`, that every ceiling check reads": true —
  the only amount-ceiling comparison is in `issue_balance_apply()`, via it; quote_issue_one_live_ceiling
  counts rows and computes no ceiling.
Sweep, also clean: THREAT-MODEL §4e (true, and executed above); domain-model §6.2a lines 300-311 and
:396-397; PRD N3 (:505); scope-reduction.md lock-order lines; new-app/CLAUDE.md:107; RULES 21.10 text;
BRIEF-STATUS lines (history, and R5 recorded as owed). Already known and not re-reported: the :868
"exactly one place" guard (R6, owed in BRIEF-STATUS:321).

Part C (J13): no finding (above).

---------------------------------------------------------------------------------------------------
## Verdicts

- J1, against the owner's closing standard ("no overclaim and no miss within the scope the tool now
  states"): NOT CLOSABLE, because there are misses within the stated scope (U1 setting via block comment;
  U2 path characters — leading slash, App Router brackets/parentheses, ~ + $; U3 underscore shapes;
  U4 schema-qualified call; U5 `public.<column>`) and overclaims (U6 "states everything it does not
  scan", echoed by verify.yml and Rule 21.8; U9 sequences/types/schemas; U14 "a citation to it fails").
  The catalogue tests carry one major escape (U7: a three-level domain puts a NUMERIC money column past
  the "closed list" whose docstring says it cannot be named around) and one minor (U8). None hides a
  phantom or a wrong-typed column in the repository today — each was planted.
- J12: NOT CLOSABLE, because sentences of Rule 21.10's kind remain, false by execution and citing no
  test that executes them: documents-core.test.ts:812, :814-816, :860 (U10); PRD R1.24a and R1.15c (U11);
  ADR 0025 decision 2 "The decision stands — the writer set is enforced" (U12); and one sentence 9e83436
  itself wrote, R1.24b's "rather than trusting the cached figure" (U13).
- J13: CLOSABLE. Following the paragraph avoids shapes A and D on real PostgreSQL 16 (6 of 6 runs clean,
  controls 4 of 4 deadlocked), and the function bodies admit no cycle through a response-alone transaction.


---

<!-- Copied verbatim from the reviewer's findings file on 2026-10-01, headings shifted one level; the reviewer's text is unchanged. -->

## Fourth re-review of J1 and J12 (review 4) — HEAD 4a81a3d — findings V1, V2, ...

Written as found. All plants restored from backups in this directory (diff -q clean); plant migration
directory new-app/db/migrations/29990101000000_review8_plant deleted after each use. Throwaway database
r8_scratch on PostgreSQL 16 (127.0.0.1:55440), dropped at the end.

---------------------------------------------------------------------------------------------------
### Part A — J1

#### V1 — minor — J1 (U1 fix): a nested block comment, or a dollar-quoted string, still makes a phantom setting "real"
CLASS: REOPENS (b) — form 3 (setting), docstring: "a name in a `current_setting(...)` or `set_config(...)` call"; a migration (scanned) and new-app/README.md (scanned).
Where: tools/check_schema_citations.py:215-218 (`re.sub(r"/\*.*?\*/", ...)` then `--` strip, then a regex over the remaining TEXT).
- PostgreSQL nests block comments; the non-greedy regex ends the comment at the FIRST `*/`, so the rest of
  the comment is read as SQL. A dollar-quoted string is not stripped at all.
Executed:
  Control: README `pryvis.ghost_flag` / `pryvis.ghost_flagb` alone -> both reported "is not a setting any migration reads or sets".
  Appended to new-app/db/migrations/20260927160000_acceptance_responses/migration.sql:
      /* outer /* inner */ current_setting('pryvis.ghost_flag') */
  -> the `pryvis.ghost_flag` report disappears (silent pass).
  Separately, appended:   SELECT $t$current_setting('pryvis.ghost_flagb')$t$;
  -> "Every cited path and every named database object resolves." (silent pass).
  PostgreSQL 16 (r8_scratch): `/* outer /* inner */ SELECT current_setting('pryvis.ghost_flag') ...; */`
  followed by `SELECT 'after nested comment'` -> only the second statement runs: the whole thing is a
  comment. `SELECT $t$current_setting('pryvis.ghost_flagb')$t$` returns the string; nothing is read.
  (A realistic shape of the second: `COMMENT ON FUNCTION ... IS $$reads current_setting('...')$$`.)
Side observation, safe direction, not a finding: the capture class `[a-z_.]+` admits no digit, so a real
setting with a digit in its name is never loaded and would be falsely reported.
CONFIRMED. Restored, diff -q clean.

#### V2 — minor — J1 (U3 fix): underscore identifiers still pass silently in a migration comment
CLASS: REOPENS (b) — form 2: "a backticked identifier containing an underscore, in any case"; the U3 fix's own comment (:130) says "any token with an underscore — leading, trailing or doubled underscores included".
Where: tools/check_schema_citations.py:131 `CITED_IDENTIFIER_ANY_CASE = r"`([A-Za-z_][A-Za-z0-9_]*_[A-Za-z0-9_]*)`"` — needs TWO underscores when the first character is one; admits no `$` and no non-ASCII letter.
Executed, appended to the 20260927160000 migration as one `--` comment:
    `_nevertable`  `never_t$ble`  `nevér_table`  `"never_table_q"`   control `never_table_c`
Output: only the control reported (":160: `never_table_c` is named here and is not a table, ...").
PostgreSQL 16 accepts all three unquoted: CREATE TABLE _nevertable / never_t$ble / nevér_table each
"CREATE TABLE", relname listed. `_nevertable` (a single leading underscore) is exactly the shape the fix
comment claims to include. (The double-quoted `"never_table_q"` is a quoted identifier; I list it for
completeness — if the owner reads "identifier" as unquoted, treat that one as a candidate limit:
"a double-quoted identifier inside the backticks".)
CONFIRMED. Restored, diff -q clean.

#### V3 — minor — J1 (U4 fix): schema-qualified calls other than lower-case `public.` still pass silently
CLASS: REOPENS (b) for `PUBLIC.x()` and `pg_catalog.x()` — form 2: "a backticked call, `name()` or `name(args)`"; U4 established a schema-qualified call as in scope, and the fix accepts only the literal lower-case prefix `public.`.
CANDIDATE STATED LIMIT for the spaced form — proposed wording: "a call written with a space before its parenthesis (`name ()`)".
Where: tools/check_schema_citations.py:133 `CITED_CALL = r"`(?:public\.)?([A-Za-z_][A-Za-z0-9_]*)\([^`]*\)`"`.
Executed, appended to the 20260927160000 migration as one `--` comment:
    `PUBLIC.never_fn_v()`  `pg_catalog.never_fn_v2()`  `never_fn_v3 ()`   control `public.never_fn_c()`
Output: only the control reported (":161: `never_fn_c()` is cited as a function and no migration creates it").
CONFIRMED. Restored, diff -q clean.

#### V4 — minor — J1 (U5 fix): an upper- or mixed-case public-qualified name passes silently anywhere
CLASS: REOPENS (b) — form 3 as REWORDED by 7e48353: "a backticked public-qualified name must name a relation, function or type". The previous wording was the literal `` `public.name` ``, which the third review read as restricting case; the new wording does not restrict it, and PostgreSQL folds `PUBLIC.x` to public.x. If the owner prefers the narrow reading, the candidate wording is: "a public-qualified name not written in lower case".
Where: tools/check_schema_citations.py:135 `CITED_DOTTED = r"`([a-z][a-z0-9_]*)\.([a-z][a-z0-9_.]*)`"` (lower case only).
Executed, appended to new-app/README.md:
    `PUBLIC.never_object_v`  `Public.never_object_v2`   control `public.never_object_v3`
Output: only the control reported ("`public.never_object_v3` — no object `never_object_v3` ...").
CONFIRMED. Restored, diff -q clean.

#### V5 — minor — J1 (U2 fix): a path whose FILE name contains `@` passes silently (e.g. `logo@2x.png`)
CLASS: REOPENS (b) — form 1: "A backticked token containing a slash and ending in a listed extension"; `.png` is in PATH_EXTS; the U2 fix accepts `@` in every directory segment and not in the last one.
Where: tools/check_schema_citations.py:118-121 — last segment class `[A-Za-z0-9_.~$+()\[\]-]` lacks `@` while `_PATH_REST` has it.
Executed, appended to new-app/README.md: `new-app/never@2x.png`  control `new-app/never2x.png`
Output: only the control reported ("`new-app/never2x.png` resolves to nothing — ..."). `name@2x.png` is the
common retina-asset spelling and new-app/web is a Next.js app with a public/ folder.
CONFIRMED. Restored, diff -q clean.

#### V6 — minor — J1: tracked paths containing a space are split into fake "tracked files", and a phantom resolves to one
CLASS: REOPENS (b) — form 1: "Resolved as an exact tracked path, as a suffix of one, or relative to the citing file"; `Logo.png` is no tracked path.
Where: tools/check_schema_citations.py:229-231 `tracked()` returns `out.split()`, splitting on whitespace.
`git ls-files` has two such paths: `docs/Pryvis Logo Cropped.svg`, `docs/Pryvis Logo.png`. They become the
entries `docs/Pryvis`, `Logo`, `Cropped.svg`, `docs/Pryvis`, `Logo.png` in `known`.
Executed, appended to new-app/README.md: `../Logo.png`   control `../Logo2.png`
Output: only the control reported. `../Logo.png` from new-app/README.md normalises to `Logo.png` at the
repository root, which does not exist (`ls /home/user/Jam-Quote/Logo.png`: no such file), and
`rel in known` accepts it. The same split also corrupts the U6 banner: "by extension, outside those
trees: 4 (no extension) ..." — three of the four are the fragments `docs/Pryvis` x2 and `Logo` (the
fourth is .gitignore); the real files are counted once each under .svg/.png by their tail fragments.
CONFIRMED. Restored, diff -q clean.

#### V7 — minor — J1: overclaim in the tool's output — "original-app/: 643 files ... never scanned"; 712 are tracked and none is scanned
CLASS: REOPENS (c) — tool output and docstring ("What it does not scan is listed on every run: original-app/ and .claude/ with their file and path-citation counts"), and the failure banner "states everything it does not scan" (:440-442); Rule 21.9: "the banner must count what the tool actually passes over".
Where: tools/check_schema_citations.py:301-306 — a file not in SCAN_EXTS is counted in `by_extension` only
when OUTSIDE original-app/ and .claude/, and `prefix_skipped` counts only SCAN_EXTS files, so the 69
original-app/ files with other extensions (33 .css, 23 .json, 6 .png, 2 no-extension, 2 .gitignore, 1
.dockerignore, 1 .example, 1 .js) are in neither number.
Executed: baseline run prints "original-app/: 643 files, 62 path citations"; `git ls-files original-app | wc -l` = 712; of those 643 end in SCAN_EXTS.
Direction: the banner understates what it passes over — R11's direction. CONFIRMED (no plant needed; read from the real output).

#### V8 — minor — J1 (U7 fix): "resolving domains to any depth" — a 65-level domain chain removes the column from every money assertion
CLASS: REOPENS (c) — new-app/db/test/money-convention.test.ts:18-19 "resolving domains to any depth (finding U7)" and the query comment "resolved through ANY depth of domains"; the T7 docstring "anything else fails, whatever it is called".
Where: new-app/db/test/money-convention.test.ts, `unwrap` CTE `WHERE p.typtype = 'd' AND u.depth < 64`, then
`JOIN resolved col ON col.start = a.atttypid` — an INNER join: a type not resolved within 64 steps has no
`resolved` row, so the column vanishes from `columns` rather than failing.
Executed (throwaway migration 29990101000000_review8_plant, deleted after):
    CREATE DOMAIN r8_d1 AS numeric(12,2); CREATE DOMAIN r8_i1 AS integer;
    CREATE DOMAIN r8_dN AS r8_d(N-1); CREATE DOMAIN r8_iN AS r8_i(N-1);  for N = 2..K
    CREATE TABLE r8_plant (id uuid PRIMARY KEY, fee_jmd r8_dK, retention_minor r8_iK);
  K = 64 (control): "Tests 5 failed | 5 passed" — fee_jmd and retention_minor reported by four tests.
  K = 65: "Tests 10 passed (10)" — a NUMERIC money column and an INTEGER `_minor` column, both silent.
  (Also K = 70 with fee_jmd only: 10 passed.)
Severity minor: no one writes 65 domains; but the claim is "any depth", and the failure mode is a silent
drop, not an error. Not live: the schema has 0 types. CONFIRMED.

#### V9 — minor — J1 (U8 fix): a foreign key whose triggers are set ENABLE REPLICA still counts as a key, and does not enforce
CLASS: REOPENS (c) — new-app/db/test/reference-keys.test.ts:65 "Keyed only by a key that ENFORCES" and the U8 comment "a key whose enforcement triggers a migration switched off ... is no key". The fix tests only `tgenabled = 'D'`.
Where: new-app/db/test/reference-keys.test.ts:74-75.
Executed (plant migration):
    CREATE TABLE r8_plant (id uuid PRIMARY KEY, client_id uuid REFERENCES client(id));
    DO $$ ... EXECUTE format('ALTER TABLE r8_plant ENABLE REPLICA TRIGGER %I', tgname) for each internal trigger ... $$;
  -> "Tests 4 passed (4)". Control, `ALTER TABLE r8_plant DISABLE TRIGGER ALL` -> "1 failed": "r8_plant.client_id is a uuid reference with no foreign key".
  (ENABLE ALWAYS -> 4 passed, correctly: it enforces.)
On PostgreSQL 16 (r8_scratch): before, INSERT of a dangling client_id -> "ERROR: ... violates foreign key
constraint r8_plant_client_id_fkey"; after ENABLE REPLICA (tgenabled = 'R' on both RI triggers;
session_replication_role = origin, the default) the same INSERT -> "INSERT 0 1", dangling = 1,
convalidated = t. CONFIRMED. Guard weakness; no migration does this today.

#### V10 — CANDIDATE STATED LIMIT — J1 (T7): numeric money inside a composite type, a range type, or a materialised view passes every money assertion
CLASS: CANDIDATE STATED LIMIT. The T7 list is of "numeric" columns by a type set; a composite or range column is arguably not one, and the query's comment says "partitioned parents as well as plain tables". Proposed wording for WHAT IT DOES NOT PROVE: "Not amounts held inside a composite or range type (a numeric field of a composite, `numrange`), nor columns of a materialised view: only plain and partitioned tables' columns of scalar or array type are read."
(If the owner reads the file's first line, "every amount in this database is an integer of minor units", literally, the materialised view is an overclaim instead.)
Where: new-app/db/test/money-convention.test.ts, `c.relkind IN ('r', 'p')` and the type sets.
Executed (plant migration):
    CREATE TYPE r8_money AS (amount numeric(12,2));
    CREATE TABLE r8_plant (id uuid PRIMARY KEY, price_jmd r8_money, fee_range numrange, client_id uuid REFERENCES client(id));
    CREATE MATERIALIZED VIEW r8_mv AS SELECT 1.5::numeric(12,2) AS fee_jmd, 7::integer AS total_cents;
  -> "Tests 10 passed (10)". Control: + `ALTER TABLE r8_plant ADD COLUMN x_cents integer` -> "3 failed", x_cents reported.
CONFIRMED.

#### V11 — minor — J1: overclaim — the tool's headline and its success line say "Every cited path ... resolves"
CLASS: REOPENS (c) — tool docstring and output. Rule 21.8 (docs/RULES.md:726): "neither may be described as checking 'every' citation".
Where: tools/check_schema_citations.py:1 "Every cited path and every named database object is resolved against what actually exists." and :445 `print("\nEvery cited path and every named database object resolves.")`.
Executed: new-app/README.md with only `new-app/never@2x.png` and `../Logo.png` appended (V5, V6) ->
    Every cited path and every named database object resolves.
    exit=0
Two cited paths that resolve to nothing, and the tool's last line says every cited path resolves. The
same line prints over every form the docstring lists as NOT checked (a path with no slash, etc.), so it is
false whenever any such citation exists; T9 narrowed the docstring's form list and the verify.yml comment
but not these two sentences. The docstring itself, at :13, names the defect: "A guard that says 'Every cited path resolves' while skipping 71 paths is the green tick Rule 21 opens by forbidding." Restored, diff -q clean. CONFIRMED.

#### V12 — trivial — J1: a CITATION_EXEMPTIONS reason rewritten by 7e48353 is false
CLASS: REOPENS (c) on the T4 precedent (false exemption reasons were fixed under J1); it is a false statement in the tool's printed output, not an overstatement of what the code checks — the owner may judge it below the bar.
Where: tools/check_schema_citations.py:152-154, ("docs/ARCHITECTURE.md", "extracted/JamQuote.dc.html"): "A mockup deleted on 2026-09-26; cited as the history of the design tokens."
Executed: `git log --format='%h %ad %s' --date=iso -- extracted/JamQuote.dc.html` ->
    604e774 ad=2026-09-24 13:22:21 -0400  chore: remove a stray UI mockup from the repo root   (2 files, 3676 deletions under extracted/)
    c915f8a 2026-09-24 (re-added) ; 7c8ef83 2026-07-09 (first added)
Deleted 2026-09-24, not 2026-09-26. The date was copied from docs/ARCHITECTURE.md:95, which carries the same
wrong date (not a J1 statement; recorded for the owner). Every other exemption reason and all four
SQL_CONSTRUCTS reasons are true (see "checked"). CONFIRMED.

#### V13 — minor — J1: overclaim about the J1 tool in its sibling's docstring — "resolves every one with no skip"
CLASS: the statement is about the J1 tool but sits in tools/check_citations.py:19-21, which is not in the owner's enumerated list. By the letter of the list: reported for the owner, not counted toward the J1 verdict. By Rule 21.8 ("neither may be described as checking 'every' citation") it is exactly the forbidden sentence.
Text: "Paths are checked by `tools/check_schema_citations.py`, which resolves every one with no skip".
Observed: V5 and V6 (executed) are path citations it does not resolve; its own docstring lists path forms it does not check. CONFIRMED (by the V5/V6 executions).

#### V14 — CANDIDATE STATED LIMIT — J1 (U2 fix): a leading slash is dropped, not read as the repository root
Proposed wording for "What it does NOT check": "That a path written with a leading slash is at the repository root: the slash is dropped, so `/x/y.ts` resolves wherever `x/y.ts` would, as a suffix too."
Where: tools/check_schema_citations.py:238-239 (`cited = cited.lstrip("/") or cited`, under the comment "A leading slash means the repository root (U2)"); the commit message says "paths with a leading slash (repository-rooted)".
Executed, new-app/README.md: `/db/test/money-convention.test.ts` -> resolves (no /db at the root: `ls /home/user/Jam-Quote/db`: No such file or directory); control `/db/test/never-written.test.ts` -> reported. The cited file does exist (as new-app/db/test/...), so no phantom passes; the code comment and commit message claim more than the code does, the docstring is silent. Restored, diff -q clean. CONFIRMED.

---------------------------------------------------------------------------------------------------
### Part B — J12

Setup: throwaway database r8_j12 on PostgreSQL 16, every migration applied in order with psql, pryvis_app
granted exactly what test-support grants (SELECT, INSERT, UPDATE, DELETE on all tables; no TRUNCATE),
synthetic tenant/user/client and two quotes via scratchpad/review7/race/setup.sql and fn.sql. Dropped after.

Executed as pryvis_app, app.tenant_id set (autocommit, so each statement is its own transaction):
    issue A (total 100000): acceptance inserted, committed            -> balance rows for A: 0
    later transaction: SELECT issue_balance_open(A)                   -> balance rows for A: 1
    issue B (total 100000), NEVER accepted: SELECT issue_balance_open(B) -> row, accepted_total_minor 100000; acceptances for B: 0
    BEGIN; set_config('pryvis.balance_write','on',true);
      UPDATE issue_balance SET accepted_total_minor = 99999999999 WHERE issue_id = A;  -> UPDATE 1; COMMIT   (R5 holds)
    SELECT issue_balance_open(A)  -> accepted_total_minor still 99999999999 (ON CONFLICT DO NOTHING; open never rewrites)
    invoice of 100 on A -> accepted; accepted_total_minor 99999999999, invoiced 100 (apply never rewrites it; the ceiling reads the cache)
    invoice of 100 on B -> "ERROR: invoiced total 100 exceeds the ceiling 0" (refused by the ceiling, not by a missing row)
Only two functions write issue_balance (pg_proc prosrc matching INSERT INTO/UPDATE issue_balance: issue_balance_open, issue_balance_apply). No trigger on issue_balance. Policies: issue_balance_create (INSERT, WITH CHECK flag), issue_balance_amend (UPDATE, USING and WITH CHECK flag), issue_balance_read (SELECT); no DELETE policy.

#### V15 — minor — J12 (U12's twin): ADR 0025 decision 2 still says "What enforces the writer set is row security", nine lines above the sentence U12's fix added saying the writer set is not enforced
Where: docs/adr/0025-five-invariants-move-from-prose-to-code.md:69 "What enforces the writer set is **row security**:" — versus :78 "the writer set itself is not enforced (R5; *"the writer set is enforced" corrected 2026-10-01, finding U12*)".
False by execution: R5 above — pryvis_app set the flag and wrote the row, so row security does not enforce a writer set; it enforces that a write carries the flag. 7803990 corrected the second occurrence and left the first, in the same paragraph. No test cited. CONFIRMED.

#### V16 — major — J12 (U10/U11's twin): "an immutable copy" — accepted_total_minor is still called immutable, eleven lines below the U10 sweep fix of "stays written-once"
Where:
- new-app/db/test/documents-core.test.ts:1220 `it("leaves accepted_total untouched, because an immutable copy is what makes it safe", ...)` — 7803990 rewrote :1209's "stays written-once" to "no function rewrites ... (R5 aside)" and left this title.
- docs/adr/0025-five-invariants-move-from-prose-to-code.md:139-140 "Resolved in favour of Decision 2, because an immutable column is what makes the copy safe at all" (in the historical correction note; lower weight — it gives the reasoning of its day — but it is unqualified, unlike :136-137's tense note).
False by execution: R5 above — UPDATE 1 rewrote accepted_total_minor to 99999999999, committed, and the next
invoice was judged against it. The test executes only that WITHDRAWAL leaves it alone. Same claim as
"written-once", which U11 rated major in the PRD and 7803990 removed from the PRD and :1209. CONFIRMED.

#### V17 — minor — J12: PRD R1.24a still states, as fact, that the row "is created in the same transaction as the acceptance"
Where: docs/PRD.md:378-379 "The `issue_balance` row is created **in the same transaction as the acceptance**, by an explicit `issue_balance_open()` call the acceptance path must make — nothing creates it automatically (R7; ...)".
Executed above: issue A's acceptance committed with 0 balance rows, and a later, separate transaction
created the row. issue_balance_open() checks no acceptance and no transaction. The clause after the
comma states the requirement ("must make") and the R7 limit, so a reader can recover the truth; the
indicative first clause is Rule 21.10's kind (how and when the row is written) and cites no test — the
executing test is documents-core.test.ts's "opens the balance row when the acceptance transaction calls
issue_balance_open()", with N2 for the negative, and R1.24a names neither (domain-model §6.2a, :300-305, words the same fact as a requirement and cites N2). CONFIRMED.

#### V18 — minor — J12 (borderline scope: when the row exists): "No acceptance means no balance row" is false by execution
Where:
- new-app/db/test/documents-core.test.ts:305 "No acceptance means no balance row, and the function raises rather than treating a missing row as permission."
- docs/design/domain-model.md:292 "One row per accepted issue."
Executed above: issue B, with 0 acceptances, has a balance row (issue_balance_open(B) as pryvis_app;
accepted_total_minor 100000), and issue A, accepted, had none until a later call. An invoice on B is
refused by the ceiling (0), not by the missing-row raise the comment describes; no money moves, so the
test's title stays true and its comment does not. Not a writer-SET sentence; reported because it says when
the row is opened, which is the third category of the brief's sweep. CONFIRMED.

---------------------------------------------------------------------------------------------------
### Checked and found nothing

J1 — the third round's fixes, re-executed against the original plants (all now reported):
- U1 `/* current_setting('pryvis.ghost_flag') */` (single level) -> the README citation is reported.
- U2 `/new-app/never-written-a.ts`, `(site)/never-b.tsx`, `[id]/never-c.tsx`, `(site)/`, `~never/k.ts`, `never+k.ts`, `$never/k.ts` -> all 7 reported; real controls `/new-app/README.md`, `public.issue_balance`, `public.issue_ceiling_minor` resolve.
- U3 `never__table_m1`, `_never_table_m2`, `never_table_m3_` -> reported. U4 `public.never_fn_m4()` -> reported; `public.issue_ceiling_minor()` resolves. U5 `public.accepted_total_minor` -> reported.
- U6: the banner now lists by-extension skips (V6 and V7 are about its counts, not its presence).
- U7: three-level domain, array of a two-level domain, and (new) a domain over an array of a domain -> "3 failed", all reported. 64 levels caught; V8 is 65+.
- U8: DISABLE TRIGGER ALL on the referencing table -> reported; DISABLE TRIGGER ALL on the REFERENCED table (client) -> also reported (the tgconstraint join covers both sides). ENABLE ALWAYS correctly still counts (it enforces). V9 is ENABLE REPLICA.
- U9: with sequences/types/schemas added to schema-objects.json by hand, `r8_seq`, `r8_kind`, `r8_schema` in a migration comment resolve and `public.r8_seq`, `public.r8_kind` resolve; controls `r8_never`, `public.r8_never2` reported, and the message now names sequence, type and schema. File restored, diff -q clean.
- U14: schema-objects.test.ts:11-13 now says "in a form the tool checks"; true.
- CITATION_EXEMPTIONS: every reason other than V12 re-read and true (row_count, withdrawn_at, acceptance_issue_key, .vercel/project.json, infra/docker-compose.yml, DEVELOPMENT-BRIEF catalog/ messaging/ support/ infra/, PRICING scrapers/, SERVICE-REGISTER new-app/infra/, new-app CLAUDE.md and README infra/ and mobile/).
- SQL_CONSTRUCTS: greatest, least, nullif, coalesce — 0 rows in pg_proc on PostgreSQL 16 and none in schema-objects.json's builtin_functions; each reason true.
- Rule 21.8: the tool sentence is accurate; "both state what they do not scan" — the J1 tool prints its skips (V7 is about a count); check_citations.py states its skips in its docstrings rather than its output, which I read as satisfying "state". Rule 21.9: accurate (V7 is a counting defect, not a false sentence in the rule).
- verify.yml comment: "IN THE FORMS ITS DOCSTRING LISTS ... Forms outside that list pass silently" — true; "what it does not scan, it prints" — true in kind, the original-app/ count is low (V7).
- new-app/CLAUDE.md:88-92 regeneration instruction: command correct (used it implicitly through the U9 file plant and the previous round); its object list under-, not over-, states.
- reference-keys domain over uuid: falls into the "name every non-uuid *_id" test (not re-planted; reasoning as last round).
- Gates at the end, tree clean: `npx vitest run test/schema-objects.test.ts test/reference-keys.test.ts test/money-convention.test.ts test/documents-core.test.ts` -> 4 files, 120 passed. The four checkers' last lines exactly as in the setup facts.

J12 — the sentences 7803990 wrote, each checked against the execution in Part B:
- documents-core.test.ts:812 describe "issue_balance refuses a write that does not carry the flag" — true: its tests execute UPDATE (0 rows), INSERT (policy error) and DELETE (0 rows, no policy); the app role has no TRUNCATE grant in the harness.
- :814-818 comment — true (the functions set the flag; the application can too, R5 executed).
- :862-863 comment and :864 title — true (accept() calls issue_balance_open() inside BEGIN/COMMIT; N2 reaches an acceptance with no row).
- :1209 "no function rewrites `accepted_total_minor` (R5 aside)" — true: only issue_balance_open and issue_balance_apply write the table; open is ON CONFLICT DO NOTHING (executed: re-open left 99999999999) and apply sets only variations/invoiced/recomputed_at (executed: an invoice left it).
- PRD R1.15c — true, same evidence. Nit, not a finding: "the J12 block asserts it" — the J12 block executes apply's four trigger paths, not a second open() on an existing row; the claim holds by the execution above.
- PRD R1.24b — true: apply re-sums variations and invoiced inside the FOR UPDATE; the ceiling reads cached accepted_total_minor (executed: invoice judged against 99999999999).
- ADR 0025 decision 2 heading — qualified, true. :77-78 "a write without the flag is refused by the schema" — true for INSERT, UPDATE and DELETE as the harness grants. docs/adr/README.md:40 — true.
- Sweep with no hit: THREAT-MODEL §4e (:215-232); PRD N3 (:509); domain-model §6.2a :300-305 (states it as a requirement and cites N2), :311, :341-342, :396-397, :478; scope-reduction.md (:22, :96, :124-162, :211); new-app/CLAUDE.md:107; schema.prisma :923-942; policy-parity.test.ts:204-213; row-convention.test.ts:79-84; RULES 21.10; BRIEF-STATUS 2026-10-01 entries (history and the R5 decision); documents-core.test.ts:23-26, :75, :291, :1038-1045, :1225-1226.
- Already known, not re-reported: documents-core.test.ts:872-893, "sets the write flag in exactly one place" and its comment "it is set in one file" (R6, owed in BRIEF-STATUS:321).

---------------------------------------------------------------------------------------------------
### Verdicts

- J1: NOT CLOSABLE, because there are misses within the stated scope — V1 (a phantom setting behind a
  nested block comment or a dollar-quoted string), V2 (`_nevertable`, `$` and non-ASCII identifiers), V3
  (`PUBLIC.fn()`, `pg_catalog.fn()`), V4 (`PUBLIC.name`, under the reworded form 3), V5 (`@` in a file name),
  V6 (a phantom resolving to a fragment of a space-containing path) — and overclaims: V7 (the original-app/
  count), V8 ("any depth" of domains), V9 ("ENFORCES", with ENABLE REPLICA), V11 (the headline and success
  line "Every cited path ... resolves"), V12 (a false exemption date, on the T4 precedent). All minor; no
  major. Candidate stated limits for the owner: V3's spaced call, V10, V14 (and V2's quoted identifier, V4,
  if the owner takes the narrow reading). V13 is reported outside the enumerated statements. None hides a
  phantom or a wrong-typed column in the repository today — each was planted.
- J12: NOT CLOSABLE, because sentences of Rule 21.10's kind remain, false by execution and citing no test
  that executes them: ADR 0025:69 "What enforces the writer set is row security" (V15, the twin U12's fix
  left); documents-core.test.ts:1220 "an immutable copy" and ADR 0025:139 "an immutable column" (V16, the
  twin of the :1209 fix); PRD R1.24a "is created in the same transaction as the acceptance" (V17); and, at
  the edge of the sweep's scope, documents-core.test.ts:305 and domain-model.md:292 (V18).


---

<!-- The mechanical closing check's results, copied verbatim on 2026-10-01, headings shifted one level. -->

## Closing check, J1 and J12 (HEAD 62e41cc)

1. PASS. HEAD 62e41cc; git status empty.
2. PASS. Last lines of all four checkers match exactly; `  original-app/: 712 files, 62 path citations ...` present.
3. PASS. Plants match findings V3 (PUBLIC./pg_catalog. calls), V4 (PUBLIC.x, Public.x), V5 (never@2x.png), V6 (../Logo.png), V8 (65-level numeric, 70-level integer chains), V9 (ENABLE REPLICA). Notes only: the V9 plant uses a composite FK (client_id, tenant_id) rather than the finding's single-column REFERENCES client(id); the V8 70-level plant uses an integer `_minor` column (finding's 70 used fee_jmd). Both exercise the same defect. plant_v.py: 14 CAUGHT, 0 MISSED, "restored, diff -q on 2 files: identical".
4. PASS. plant_t: 13 CAUGHT, 0 MISSED, 3 files identical. plant_s: 10 CAUGHT, 0 MISSED, 4 files identical. plant_u: 13 CAUGHT, 0 MISSED, 2 files identical.
5. PASS. check_schema_citations.py "What it does NOT check": settings in quoted text (V1), space before parenthesis, `$`/non-ASCII/double-quoted identifiers, leading slash dropped (V14). money-convention.test.ts "WHAT IT DOES NOT PROVE": composite/range types and materialised views (V10).
6. PASS. Line 1 of check_schema_citations.py begins "Cited paths and named database objects" (not "Every cited path"). check_citations.py quotes "every one with no skip" only as corrected history marked V13. Exemption reason says 2026-09-24 (604e774); ARCHITECTURE.md says deleted 2026-09-24 (604e774); `git log` shows 604e774 2026-09-24. money-convention `unwrap` has no depth limit (comment "No depth cap"). reference-keys.test.ts excludes keys with any trigger whose tgenabled NOT IN ('O','A') (equivalent to requiring 'O'/'A').
7. PASS. Exactly the 15 expected file:line results in order. Classification: PRD.md:382 history note; RULES.md:780-781 Rule 21.10 quoting; ADR 0025 :49 (heading, "as decided; not built so"), :58 (original decision text, amendment says decision of its day), :70 and :81 and :138 (correction notes); domain-model.md:189 immutable issue snapshot; :305 and :342 history notes; schema.prisma:18 policy file written once; documents-core.test.ts:634 credit-note test, :819 comment recording correction U10; tenant-isolation.test.ts:376 exemption test. None outside these.
8. PASS. V15: ADR 0025 line 69-70 "What enforces that a write carries the flag is row security (not a writer set ...)". V16: ADR line 142-144 "it is the ISSUE that cannot change"; test title now "leaves accepted_total untouched on withdrawal; the issue it copies is immutable". V17: PRD R1.24a "must create the issue_balance row ... explicit issue_balance_open() call", cites N2 test. V18: domain-model.md:292 "At most one row per issue"; documents-core comment at :305-307 no longer claims it (quotes it as "Not ...").
9. PASS. git status --short empty; no __pycache__ left.

J1: closing check PASSED
J12: closing check PASSED


---

<!-- The J3/J9 mechanical closing check's results, copied verbatim on 2026-10-01, headings shifted one level. -->

## Closing check 2 (J3, J9)
1. PASS. HEAD 3ceef3f; git status --short empty.
2. PASS. All four checker last lines match exactly.
3. PASS (J3/R17). Plant script replaces the IF v_written <> 1 ... RAISE block with `NULL;` as R17 describes. Test "R17 · refuses a balance write that stored nothing..." expects /affected 0 row\(s\), not 1/. Plant output:
   with the check removed: Tests  1 failed | 104 skipped (105)
   restored, diff -q: identical
   restored: Tests  1 passed | 104 skipped (105)
   (pg_isready reported no response beforehand, yet tests ran as stated.)
4. PASS (J9/R10). domain-model.md:425 says render points at its issue and an acceptance at the render of its OWN issue; old "is what acceptance and quote_issue point at" phrase gone. ADR 0024:123 Integrity row says acceptance references the document_render of its own issue. Migration lines 21-25 say "is amended to say so", now true.
5. PASS (J9/R18). J9 row says the "guarded by" covers the COLUMN half and NOT the prose half (a table named in a document that no migration creates). Docstring line 77: "Nothing about identifiers in prose documents beyond near misses, table.column, a public-qualified name and settings".
6. PASS. git status --short empty; no __pycache__ under tools/.

J3: closing check PASSED
J9: closing check PASSED


---

<!-- The J11 mechanical closing check's results, copied verbatim on 2026-10-01, heading shifted one level. -->

## Closing check 3 (J11, HEAD eb36261)
1 PASS: HEAD `eb36261 docs: declare the mechanical closing check for J11 (Sonnet) before launch`; status empty.
2 PASS: four checker last lines match expected exactly.
3 PASS: eight plants read and match their names (CHECK (true); no +500; floor(/); IF false; line trigger removed; AFTER INSERT ON only; NOT DEFERRABLE; header trigger removed). Backup copy before edit, restore from backup in finally, diff -q. Output matched all 10 expected lines exactly; git status empty after.
4 PASS: rounded() negates rounded magnitude; CASES has [1500n,-333n], [1n,-500n], [2500n,1n], [999_999_999n,99_999_999_999n]; refusal tests match /quote_issue_line_total_check/ or "but its lines sum to"; migration CHECK uses div(.
5 PASS: grep gave exactly the 10 expected lines; 1519, 1591, 1727, 1741 all use rejects.toThrow; HEADER used only at line 1926 inside sealWith (BEGIN..COMMIT with lines).
6 PASS: J11 row status exactly `**Fixed, re-review owed.**`; row says lines -> subtotal -> total -> accepted_total_minor held by database, tax owed with GCT rules. Domain-model paragraph: balance copies HEADER total_minor, "Tax is the step not held", owed with GCT rules. Line 310: "header `total_minor`".
   Note: the J11 row itself does not state (a) in its own words; it defers to domain-model 6.2a ("says the copied total is the header's"). Domain-model paragraph does.
7 PASS: git status empty; no __pycache__ under tools.


---

<!-- The adversarial re-review of J6, J7, J8 (Opus, at ad4e7d4), copied verbatim on 2026-10-01, headings shifted one level; W13 appended by the builder. -->

## Adversarial re-review of J6, J7, J8 (fix 009a1c6, HEAD ad4e7d4)

Everything below marked CONFIRMED was executed on PostgreSQL 16.13 (throwaway databases `rr678`, with all
migrations, and `rr678_pre`, with every migration except `20260927180000`), as `SET ROLE pryvis_app` with
`app.tenant_id` set, unless stated. The probe scripts are in this directory (`p1.sql` to `p8.sql`,
`deadlock.mjs`, `seed.sql`). Both databases were dropped afterwards. Repository files were changed only to plant
defects, each time from a backup copy in this directory, restored, and proved identical with `diff -q`. Final
`git status --short`: empty. The tree did not change under me (HEAD stayed `ad4e7d4`). The cluster-wide
role `pryvis_app` is left in place on 55440, which the race suite also uses.

Gates re-run: db suite with PG16 gives **198 passed** (as claimed). `turbo typecheck --force`: 5/5. The four
checkers are clean, with 10 legacy disposition gaps. `npm run lint` runs 0 tasks; that predates this commit.

### Findings

#### W1 · major (guard weakness, no wrong grade): the evidence trigger can be skipped by the application role, so evidence on a DECLINE or a WITHDRAWN acceptance commits
`new-app/db/migrations/20260927180000_acceptance_grade/migration.sql:194-198`. If the acceptance is not visible,
the trigger does `IF NOT FOUND THEN RETURN NULL`. It is an AFTER ROW trigger, so it runs at end of statement.
`RETURNING` runs per row before that, and it can clear `app.tenant_id`. The foreign key still passes because
referential checks bypass row security. So no outcome check, no withdrawal check and no lock is taken.

Broken claims: migration line 10-11, "A decline carries none, so 'a deposit against a decline' (J6) cannot be
represented at all". Also PRD-REVIEW-4 J6 row, "a trigger refuses evidence on a decline or a withdrawn
acceptance".

Executed (p1.sql):
```
INSERT INTO acceptance_evidence (...) VALUES (..., <declined acceptance>, 'deposit_paid', 'wipay', 'BYP-0', now());
 -> ERROR: evidence attaches only to an acceptance; response ... is a decline ... (finding J6)
INSERT INTO acceptance_evidence (...) VALUES (..., <declined acceptance>, 'deposit_paid', 'wipay', 'BYP-1', now())
  RETURNING set_config('app.tenant_id', '', false);
 -> INSERT 0 1
SELECT e.kind, e.external_id, a.outcome ... -> deposit_paid | BYP-1 | declined
```
The same on a withdrawn acceptance (p6.sql): `deposit_paid FLIP-W` committed, with `withdrawn = 1`.

This also answers question 2: the deferred evidence-required check *can* be satisfied by a row the rules
trigger would have refused. Insert the acceptance, withdraw it, then insert the evidence through the flip.

The grade is not affected: `acceptance_grade()` filters `outcome = 'accepted'` and checks withdrawal first. In
p1, the grade read NULL. So this is an invariant (and the J6 case itself) made representable, not a wrong
figure. It needs no privilege beyond what the app role already has. The withdrawal guard does not have this
weakness: it raises on an invisible acceptance instead of returning.

#### W2 · minor (claim false; new 40P01 shape): the per-issue lock in the withdrawal guard creates a deadlock on ONE issue, and the wrong-document remedy is the victim
`migration.sql:263-270` takes the issue lock, then `issue_balance_apply()`, which takes the balance row
`FOR UPDATE`. Any transaction that already holds the balance row (invoice, void, credit note, variation) and then
takes the issue lock (withdrawal, evidence, or a response) forms a cycle with a lone withdrawal.

Broken claims: migration line 36-37, "nothing takes them the other way round, so no new deadlock shape". Also
`new-app/CLAUDE.md:110`, "Three shapes can deadlock": none of the three is a single issue, and credit-then-withdraw
without a seal is not listed.

Executed (deadlock.mjs). T1 = credit note in full, then `issue_balance_apply`, then withdraw, as ONE transaction.
T2 = a lone withdrawal of the same acceptance, started while T1 holds the balance row. Each run 3 of 3 times:
```
before the fix (rr678_pre): T1 ok, commit ok; T2 23505 duplicate key acceptance_withdrawal_acceptance_key
after  the fix (rr678):     T1 40P01 deadlock detected, rolled back;
                            T2 23514 "cannot withdraw this acceptance: 1 invoice(s) ... still have money billed"
```
So the remedy that used to succeed is rolled back, and the competing withdrawal is refused too. Nothing is done.

Scenario B (T1 = variation, then deposit evidence in one transaction; T2 = lone withdrawal) gives
`T1 40P01; T2 ok`. CLAUDE.md does tell the reader to record evidence alone, so B is covered by advice. A is not.
Detected by PostgreSQL and nothing is left wrong, hence minor.

#### W3 · major (documents; J8 asked for exactly this): §4.4 still says invoicing unlocks at "grade 2 or above", and §7 still says a bar-6 acceptance with no payment is "refused". The build does neither.
- `docs/design/acceptance-evidence.md:129`: "The invoicing ceiling unlocks on operational acceptance (grade 2 or
  above)."
- `docs/design/acceptance-grade.md:98` (D6 option A): "Matches §4.4 and the built SQL".
- `docs/design/acceptance-evidence.md:176` (§7, in the list this commit edited): "a quote requiring grade 6
  marked accepted with no payment → refused".

The J8 finding's resolution item 3 was to resolve §4.3 against §4.4. The design header says it amends §4.4, and
§4.4 was not touched. Executed (p7.sql): an acceptance whose only evidence is `tenant_recorded` (grade 1) on a
quote with bar 6, then invoice 90,000:
```
 grade | bar | meets | invoiced
     1 |   6 | f     |    90000
```
So a grade-1 acceptance (witnessed by nobody) unlocks billing, contrary to §4.4. A bar-6 acceptance with no
payment is accepted, contrary to §7, which is consistent with D6. The build follows D6 as the owner approved
it. The text that describes it is wrong in two places, and D6's stated reason ("Matches §4.4") is false.

#### W4 · minor (an undecided state the build silently decided): a SUPERSEDED issue keeps its grade, meets its bar, and still takes new evidence, including `deposit_paid`, while its ceiling is 0
`migration.sql:295-327`. `acceptance_grade()` handles "withdrawn" and nothing else in `quote_issue_state()`. A new
revision can be sealed over an accepted revision with no money moved (`quote_issue_one_live_ceiling`).

Executed (p4.sql): bar 2. Seal rev 1, accept, seal rev 2. Then insert `deposit_paid` on rev 1's acceptance:
**accepted**.
```
  r   |         state          | ceiling | grade | meets
 rev1 | superseded             |       0 |     6 | t
```
The design (D2, D3) is silent on superseded, so this is not a breach of a decision. But the product would say
"accepted to your standard, deposit paid" about a dead revision, and record a deposit against an acceptance
whose ceiling is 0. D2's argument that "a deposit cannot be invoiced before an acceptance exists" does not hold
for this row. The same applies to `sealed_awaiting_number`: graded, while the state says unnumbered.

#### W5 · minor (permanent stuck grade): any kind may carry `(source, external_id)`, so a grade-1 row can consume a provider event's only slot, and the real webhook is refused for ever
`migration.sql:145-151, 157-158`. Only `inbound_reply` and `deposit_paid` must have an id. Nothing stops
`tenant_recorded` or `link_tap` from carrying one.

Executed (p8.sql):
```
INSERT ... kind 'tenant_recorded', source 'wipay', external_id 'TX-9'  -> INSERT 0 1
INSERT ... kind 'deposit_paid',    source 'wipay', external_id 'TX-9'  -> ERROR duplicate key acceptance_evidence_source_external_id_key
acceptance_grade(...) -> 1          (bar 6: never met; the blocking row is append-only)
INSERT ... kind 'link_tap', source 'wipay', external_id 'TX-10' -> INSERT 0 1
```
The same works across tenants. D4 admits that part, but only for ids learned before delivery. Inside one
tenant, the contractor learning the transaction id from the client and noting it is ordinary behaviour.

#### W6 · minor: the J7 key depends on the writer's spelling; `source` is free text, and an empty external id passes the "witnessed" check
`migration.sql:139-151`. There is no CHECK on `source`, though the comment lists 'email', 'whatsapp', 'wipay' and
'bank'. Executed (p2.sql), on one acceptance, all **accepted** after `('wipay','TX-5')`:
`('WiPay','TX-5')`, `('wipay ','TX-5')`, `('wipay','tx-5')`, `('wipay',' TX-5')`, `('','TX-5')`. A first
`('wipay','')` was also accepted as `deposit_paid`: the witnessed check is satisfied by an empty id, so the
grade is 6. Refused: exact replay; `(NULL,'TX-5')` (pair check); a second `('wipay','')`.

A provider retry through one handler re-sends the same bytes, so the J7 retry case itself is refused. The
variants need two writers, or a normaliser, that disagree. Hence minor.

#### W7 · minor (overclaim in a guard reason and the migration): provider ids are not all "unguessable", and the global key is an existence oracle across tenants
`migration.sql:54-55` says "Provider ids are unguessable, so it reveals nothing practical".
`new-app/db/test/tenant-isolation.test.ts:401-406` says a tenant "needs the id before it is delivered —
unguessable".

Executed (p3.sql), as tenant 2, which sees 0 evidence rows of tenant 1, in a savepoint so nothing is left:
inserting `('bank','REF-100')` gives `duplicate key`, and `('bank','REF-101')` gives `INSERT 0 1`. Tenant 2
learns that some other tenant holds bank reference REF-100. The migration itself lists 'bank', whose references
are often short or sequential. An email Message-ID is chosen by the sender, not the provider. Executed (p2.sql):
one email (`<one@client.example>`) recorded as the reply on issue A is refused on issue B of the same tenant.
So "one id names one event in the world, so one row, ever" is false for a single email that accepts two
quotes. This is not a challenge to D4. It is a report that the reason given for it does not hold for two of
the four sources the migration names.

#### W8 · minor (conditional): the migration cannot be applied to any database that already holds a sealed issue, and would leave existing acceptances ungraded
`migration.sql:87`: `ALTER TABLE "quote_issue" ADD COLUMN "acceptance_bar_grade" INTEGER NOT NULL`, with no
default and no backfill. Executed: `rr678_pre`, which holds 9 sealed issues and 9 accepted acceptances, applied
with `--single-transaction`:
`ERROR: column "acceptance_bar_grade" of relation "quote_issue" contains null values`.

Nor is there an evidence backfill. An acceptance accepted before the migration would read state "accepted" but
grade NULL ("not accepted"). This only matters if a non-empty database exists. I found no statement either way.

#### W9 · minor (Rule 21.10): "release-1 quotes never earn grade 4" is enforced by nothing
Stated at `migration.sql:50-51`, PRD R1.20h, and `acceptance-evidence.md` §9. Executed (p7.sql): an issue sealed
today, accepted with an `inbound_reply ('email','<r1@x.example>')` row: `acceptance_grade = 4`. The sentence
describes a future writer's behaviour as a property, with no test behind it.

#### W10 · nit (guard gap): the lock order the migration calls "everywhere" is unguarded
Planted: issue lock BEFORE quote lock, in both `acceptance_evidence_rules()` and
`acceptance_withdrawal_guard()`. `concurrency.pg.test.ts` + `documents-core.test.ts` + `no-stuck-state.test.ts`:
**145 passed, 0 failed**. Restored, and `diff -q` identical. I did not find a cycle that the reversed order
creates with today's locks, so this is a nit.

#### W11 · nit: the row-convention reason claims a narrower exemption than the guard grants
`new-app/db/test/row-convention.test.ts:80`: "this exemption covers only the missing `deleted_at`". The
exemption is per table (`.filter(([name]) => !(name in EXEMPT))`). Planted `ALTER TABLE document_settings DROP
COLUMN version`: row-convention 8/8 green. Only money-convention's stale-entry test went red, by accident.
Restored and identical.

#### W12 · nit: documents
- PRD-REVIEW-4 rows **J7** and **J8** each say "Tested in … two races in `concurrency.pg.test.ts`". Both
  races test J6 (evidence against withdrawal) only.
- J8's resolution item 2 names `domain-model.md` §6.1. §6.1 (lines 184-192) still lists the snapshot without
  the bar. Only the `document_settings` and `acceptance_evidence` rows changed.
- `policies/005-acceptance-grade.sql:14`: "the defaults it held are what an absent row means". This is false
  when the row held 6 or 2. An absent row means 3.

### Suspicions (reasoned, NOT executed)
- S1. `schema.prisma` declares `QuoteIssue.acceptanceBarGrade Int` with no `@default`. A Prisma `create` would
  therefore require it, so "A seal may omit it" (migration:25) would not hold for the ORM the application uses.
  If so, the effect is benign: the app must state the bar, and a mismatch is refused. Not compiled.
- S2. When a seal omits the bar, the database resolves it from the quote as committed at seal time. The app
  renders the other snapshot fields (terms, lines) from its own earlier read. A quote edit that commits in
  between gives a sealed issue whose bar and terms come from different quote versions. Only stating the bar
  closes this, and that is optional in SQL. Not raced.

### Attacked and found sound (with evidence)
- **Grade combining (D1):** max over kinds. Planting "latest row" turned D1 red. A weaker later row did not
  lower the grade.
- **Withdrawn (D3):** grade NULL and `meets_bar` NULL. Evidence plus withdrawal in ONE statement (CTE): refused,
  "has been withdrawn" (p6). Withdrawal and evidence racing on PG16: both races green in the full run.
  Reversing either lock makes `waitsOnIssueLock` time out, by reading.
- **Other issue's or tenant's acceptance:** tenant 2 with its own tenant id gives FK
  `acceptance_evidence_acceptance_id_fkey`. With tenant 1's id: refused by row security (p6). Evidence has no
  issue column, so it cannot be cross-issue.
- **Deferred evidence-required check:** an autocommit acceptance with no evidence is refused at commit. The
  RETURNING-flip on the acceptance insert only made it stricter: still "has no evidence" (p6). A savepointed
  evidence row rolled back cannot satisfy it. There is no UPDATE path on `acceptance.outcome`. Planting the
  trigger onto another table turned the two relevant tests red.
- **Update or delete of evidence:** 0 rows. No policy.
- **J7 exact replay, and NULL source:** refused (p2). Planting a per-tenant key turned the catalogue test red.
- **Bar (J8):** the trigger order on `quote_issue` is `…one_live_ceiling_per_quote`, then `…resolve_bar`, then
  `…subtotal_matches_lines`. So the bar is read after the exclusive quote lock. `UPDATE quote_issue SET
  acceptance_bar_grade` gives `UPDATE 0`. Writing tenant 2's `document_settings` from tenant 1 is refused by
  row security. Tenant 1's default of 6 does not leak: tenant 2's seal resolved 3. Sealing on another tenant's
  quote is refused by `quote_issue_quote_id_fkey` (p5). The bar is not changeable after seal by any path I found.
- **Fixtures (question 6):** I checked every `rejects`/`toMatch` in `documents-core`, `tenant-isolation` and
  `concurrency.pg` near an acceptance insert. Each names a constraint or message that the evidence CTE cannot
  produce. R9's evidence-less acceptance at line 1645 still fails on the named render FK, which fires before
  the deferred check. I found no test that now passes for a different reason.
- **Guard reasons:** policy-parity (`acceptance_evidence`), reference-keys (`external_id`) and money-convention
  (BAR, VERSION) are accurate. For tenant-isolation see W7, and for row-convention see W11.
- **Blast radius:** no consumer of these tables outside `new-app/db` (grep of api, web and packages).

### Verdicts
- J6: not closable — W1 (the J6 case itself is still representable by the app role), W2 (the claim of no new
  deadlock is false, and CLAUDE.md lists three shapes where there are now four), W4 (superseded: owner decision
  needed or state it).
- J7: not closable — W5 (a grade-1 row can permanently block the provider event the key exists for), W6, W7
  (the reason the global key is safe is false for 'bank' and 'email').
- J8: not closable — W3 (§4.4 against the build and §7 against D6: the contradiction J8 asked to resolve is
  still in the design), W8 (the migration fails on any non-empty database), W12 (domain-model §6.1 not
  amended; races cited for J8 do not test it).

### W13 · major — found by the builder while reading W1, executed 2026-10-01: J11's subtotal check is skipped the same way

`quote_issue_subtotal_matches_lines()` in `new-app/db/migrations/20260927170000_issue_lines_add_up/migration.sql`
skips an issue it cannot see (`CONTINUE WHEN NOT FOUND`). It runs at COMMIT, so a transaction that clears
`app.tenant_id` (`set_config(..., false)`) after inserting a header hides the header from its own check.
Executed on PostgreSQL 16 as `pryvis_app`: a header with `subtotal_minor` 999999 and no lines, inserted,
then `SELECT set_config('app.tenant_id','',false)`, then `COMMIT` — committed; the same insert without the
`set_config` was refused at COMMIT. Result: one sealed issue, subtotal 999999, zero lines. J11 reopened.


---

<!-- The second adversarial re-review of J6, J7, J8, J11 (Opus, at 5193785), copied verbatim on 2026-10-01, headings shifted one level. -->

## Second adversarial re-review of J6, J7, J8 and J11: fix e22b010, HEAD 5193785

Everything marked CONFIRMED was run on PostgreSQL 16.13 at 127.0.0.1:55440, unless it says otherwise. I used a throwaway database `rr2` built from all 32 migrations by `rereview2/mkdb.sh`, and dropped it afterwards. Writes ran as `SET ROLE pryvis_app` with `app.tenant_id` set, unless the step says superuser. The seed (`rereview2/seed.sql`) is the first round's seed with three changes: a number series per tenant, `t_seal` now numbers each issue, and `t_seal_nonum` and `t_number` helpers are added. The probes are in `rereview2/`.

Repository files were changed only to plant defects, and only in `new-app/db/migrations/20260927190000_rereview_fixes/migration.sql`. Each plant was written from the backup `rereview2/m190.backup` and restored from it, and every restore printed `diff -q` "restored identical". Final `git status --short` is empty. HEAD stayed at 5193785 for the whole run, and I saw no change to the tree from any other session.

**Gates I ran:**
- db suite (PGlite): 189 passed, 20 skipped.
- `concurrency.pg.test.ts` with `PRYVIS_PG_URL`: 20/20 passed. Together with the db suite that is the 209 the commit claims.
- `npx turbo typecheck --force`: 5/5.
- The four checkers are clean, with the same 10 legacy disposition gaps.
- The no-stuck walk, re-measured:
  - seed 1: 1,365 writes, 6 withdrawals after money, 19 wrong-document remedies (5 with a variation), 348 refusals as predicted;
  - seed 2: 1,361 writes, 4, 24 (8 with a variation), 344.

  Both match the commit's figures.

### The first round's findings, re-executed

- **W1: CLOSED.**
  - `p1.sql`: the plain insert is refused with "decline … (finding J6)". The `RETURNING set_config('app.tenant_id','',false)` variant is now `ERROR: acceptance … cannot be seen by this statement … refused (finding W1)`, and evidence on the decline reads 0 rows.
  - `p6.sql`: the RETURNING flip onto a withdrawn acceptance is refused the same way.
  - `w1b.sql`: RETURNING that switches to ANOTHER tenant is refused. So is `SET CONSTRAINTS ALL IMMEDIATE` followed by the flip.
  - Reverting the fix (`IF NOT FOUND THEN RETURN NULL`) turns the W1 test and the trigger-rules guard red.
- **W13: CLOSED for the application role.**
  - `w13.sql`, a header with subtotal 999,999 and no lines. Each of these is refused at COMMIT with "cannot be seen by this transaction at COMMIT": clear before COMMIT; set to another tenant before COMMIT; `SET CONSTRAINTS ALL IMMEDIATE` while cleared; a RETURNING flip in autocommit.
  - `SET session_replication_role = replica` as the application role gives `permission denied`.
  - `SET LOCAL row_security = off` gives `query would be affected by row-level security policy`.
  - In every case 0 issues were sealed.
  - Reverting the fix turns the W13 test and the guard red. But see X1: the fix also refuses something legitimate.
- **W2: still occurs, as documented** (owner's decision). `deadlock.mjs` against rr2, 3 of 3 runs each:
  - Scenario A (credit note, then withdraw, in one transaction, against a lone withdrawal): `T1 40P01; T2 23514 "still have money billed"`. Both sides end with nothing done.
  - Scenario B (variation, then evidence, against a lone withdrawal): `T1 40P01; T2 ok`.

  The new race in the suite executes B only. CLAUDE.md names both. See X7 for the stale count.
- **W4: CLOSED.**
  - `p4.sql`: rev1 is accepted and then superseded. `deposit_paid` on it now gives `is superseded; it takes no evidence (finding W4)`, and rev1 reads `superseded | ceiling 0 | grade NULL | meets NULL`.
  - Race tests on PG16 (`race4.mjs`, `r1b.mjs`):
    - R1: rev2's seal holds the quote lock and a response on rev1 waits. The response finished after the COMMIT (547 ms against a commit at 542 ms) and was refused as superseded.
    - R2: the response commits first, then the seal goes ahead. rev1 ends superseded with grade NULL.
    - R3: a response while the number is still uncommitted is refused as `sealed_awaiting_number`. It does not block, and it is taken after the number commits. This is benign; numbers cannot be removed.
    - R4: evidence waiting on a seal is refused as superseded.
    - R5: evidence first, then the seal, both succeed.

    None of these produced a wrong state.
  - Plants each turned the W4 test red:
    - the superseded state removed from the response rule (the no-stuck walk also went red, with 3 and 2 wrong responses);
    - the unnumbered state removed from the response rule;
    - the evidence state check removed;
    - the superseded case removed from the grade.

    The one plant that did not is X8.
- **W5: CLOSED.** `p8.sql`: a `tenant_recorded` or `link_tap` row carrying `TX-9` or `TX-10` is refused by `acceptance_evidence_only_witnessed_carry_id_check`. The real `deposit_paid TX-9` is then taken, and the grade is 6. Dropping the constraint turns W5 red.
- **W6: PARTLY CLOSED.**
  - `p2.sql`: `WiPay`, `wipay `, `''` sources and `' TX-5'`, `''` ids are refused.
  - `tx-5` is still taken. That is deliberate (case is kept).
  - Other whitespace is still accepted (X6).
  - Each constraint, dropped, turns W6 red.
- **W7: CLOSED.** `w7.sql`: tenant 1 holds `('bank','REF-100')`. As tenant 2, in a savepoint, both `REF-100` and `REF-101` give `INSERT 0 1`, so there is no oracle. One email Message-ID on two issues of one tenant is still refused (`p2.sql`), which the migration states. Putting back a global index turns J7's catalogue test red.
- **W8:** owner's decision; not re-tested.
- **W3, W12:** §4.4 and §7 of `acceptance-evidence.md` now match D6. `domain-model.md` §6.1 names the bar. The policy comment is corrected. The J7 and J8 rows no longer cite the J6 races. The design document has two other false sentences (X2, X3).
- **W9:** PRD R1.20h is now correct. `acceptance-evidence.md` §9 still asserts the false absolute (X3).
- **W10:** a guard now exists, and a plain swap of the two locks turns it red. A comment defeats it (X5).
- **W11: CLOSED.** Planting `ALTER TABLE document_settings DROP COLUMN version` turns the new row-convention test red.

### New findings

#### X1 · minor (a legitimate path is now refused; the claim "Nothing legitimate is refused" is false) — J11
`new-app/db/migrations/20260927190000_rereview_fixes/migration.sql:89-95`; the claim is at line 15.

The check now treats "this issue no longer exists" exactly like "this issue is hidden by the writer". A superuser or BYPASSRLS staff session sees every row, yet it can no longer delete a sealed issue that has lines, in any order:
- issue first: `ON DELETE RESTRICT` from the lines;
- lines first: the subtotal no longer matches;
- both in one transaction: the new "cannot be seen" refusal.

`docs/BRIEF-STATUS.md:377-378` says "an erasure request is a manual staff process", and `tenant_delete_guard()` is written to let the platform delete tenants. Both now stop at the first tenant that ever sealed a quote with a line. The only way through is to switch triggers off. The error message also tells a superuser to "Keep app.tenant_id set", which has nothing to do with the cause.

Executed as superuser (`postgres`, rolsuper `t`) by `erase.sql`, on issue `e…50` (1 line):
```
BEGIN; DELETE FROM issue_number …; DELETE FROM quote_issue_line …; DELETE FROM quote_issue …; COMMIT;
ERROR:  quote_issue e0000000-…-000000000050 cannot be seen by this transaction at COMMIT … refused (finding W13). Keep app.tenant_id set until the transaction ends
-- the same deletes with the pre-fix 20260927170000 function body, then SET CONSTRAINTS ALL IMMEDIATE:
 deferred checks passed            (then ROLLBACK)
-- lines only:
ERROR:  quote_issue … has subtotal_minor 1000, but its lines sum to 0
```

#### X2 · minor (a document the commit edited is still false, two lines below its edit) — J7
`docs/design/acceptance-evidence.md:231-234` still says: "**A provider's event is recorded once, ever:** a unique key on the evidence's source and external id, across all tenants". W7 made the key per tenant. The same commit edited lines 228-230, directly above. Executed (`w7.sql`): tenant 2 inserts `('bank','REF-100')` while tenant 1 holds it, and gets `INSERT 0 1`.

#### X3 · minor (the W9 fix restates the false absolute in bold) — J7
`docs/design/acceptance-evidence.md:228-229`: "so **no client reply to a release-1 quote reaches us, and none can be recorded as grade 4.**" The very next sentence concedes that the database does not enforce it.

Executed (`p7.sql`, re-run on rr2): an issue sealed today, accepted, with `inbound_reply ('email','<r1@x.example>')`, gives `acceptance_grade = 4`. So one can be recorded. The J7 row says W9 was restated "as a consequence, not a rule" in §9. That is true of the PRD only.

#### X4 · minor (guard weakness; no defect today) — J11, J6
`new-app/db/test/trigger-rules.test.ts:58`. The pattern is `CONTINUE\s+WHEN\s+NOT\s+FOUND|IF\s+NOT\s+FOUND\s+THEN\s+RETURN`. The test title says "finds no AFTER trigger function that skips on NOT FOUND", and M40 (`docs/MISTAKES.md:779`) says the guard fails on "either spelling that occurred".

Executed. Each plant was added just before the existing raise:

| Plant | trigger-rules | Executed test |
|---|---|---|
| `IF NOT FOUND THEN CONTINUE; END IF;` in the subtotal function | 4/4 green | W13 red |
| `IF (NOT FOUND) THEN RETURN NULL; END IF;` in the evidence rules | 4/4 green | W1 red |

The second plant is the very spelling the guard names, with parentheses added. The executed tests still protect these two triggers. The guard's stated purpose is the next trigger, and these two forms pass it. Its "does not prove" note names only `IF v_x IS NULL …`. The J11 row says the fix is "guarded by `trigger-rules.test.ts`".

#### X5 · minor (guard weakness; W10 was a nit) — J6
`new-app/db/test/trigger-rules.test.ts:89` compares `indexOf` over the function's whole source, comments included.

Plant: in `acceptance_evidence_rules()`, swap the two locks so the issue lock comes first, and add the comment `-- quote_money_lock_for_issue is the outer lock.` above them. Executed results:
- trigger-rules: 4/4 green;
- `concurrency.pg.test.ts`: 20/20 green;
- documents-core W tests: green.

The same swap without the comment is caught. The J6 row says "W10: lock order held by `new-app/db/test/trigger-rules.test.ts`".

#### X6 · minor (W6 only half closed; the claim "ids non-empty, unpadded" overreaches) — J7
`migration.sql:230`: `btrim()` strips only spaces. Executed (`w7.sql`), all taken as `deposit_paid`/`wipay` on an acceptance that already holds `TX-5`:
- `E'TX-5\t'`: `INSERT 0 1`
- `E'TX-5\n'`: `INSERT 0 1`
- `E' TX-5'`: `INSERT 0 1`
- `E'\t'`: `INSERT 0 1`. A tab-only id is "witnessed" and grades 6.

The J7 row and the commit message say "the id non-empty and unpadded".

#### X7 · nit — J6
`new-app/CLAUDE.md:110` still says "Three shapes can deadlock". The fourth shape was appended at line 121. W2 cited this exact line.

#### X8 · nit (dead branch, untested) — J6
`migration.sql:143`: the evidence rules refuse `sealed_awaiting_number`.
- CONFIRMED: removing that case (plant `w4_evidence_unnumbered`) leaves every W test green (5/5).
- PLAUSIBLE, by reasoning: the branch cannot be reached. A response, and so an acceptance, is refused on an unnumbered issue, and `issue_number` has no UPDATE or DELETE policy.

The J6 row says "each fix planted and caught".

#### X9 · nit (Rule 21.10) — J8
These sentences say who writes `acceptance_bar_grade`:
- `docs/design/acceptance-evidence.md:122`: "**The application states the bar it showed** when it seals";
- `new-app/db/schema.prisma:658`;
- the J8 row: "S1, S2: the application states the bar it showed and a stale one is refused".

No application seal exists: grep of `api/src` and `packages` finds no `quote_issue` writer. No test executes any such writer. SQL still takes a seal that omits the bar: every seal by `t_seal` in this review passed NULL and was resolved, not refused. So S2 is closed only for a writer that does not exist yet.

#### X10 · nit
`new-app/db/test/no-stuck-state.test.ts:570` says "Floors sit at about half the lower value". After the W4 re-aiming, `wrongDocumentWithVariation` measures 5 (seed 1) against a floor of `> 4` (line 580). "None lowered" is true, but the floor is no longer about half.

### Suspicions (NOT executed)
- None of substance. Two observations follow.
- Executed, but no claim is broken: `deposit_paid` with source `'email'` and `inbound_reply` with source `'wipay'` are both taken (`w7.sql`). Nothing ties a kind to its sources, so an email id can grade 6. No document claims otherwise.
- N4 (a) in `concurrency.pg.test.ts:353` now has its acceptance leg refused by W4. Executed with `n4a.mjs`: "is superseded; a client can respond only…", and the invoice gets "issue_balance row missing". The test asserts nothing about that leg, and N4 (c) already holds the ceiling-0 path. So nothing is lost; the test simply proves a little less than its comment says.

### Attacked and found sound
- **BEFORE triggers ("a tenant cleared earlier fails its own policy check"):** CONFIRMED by `before2.sql`. A response on superseded rev1 is refused by the row-security policy in each of these cases:
  - tenant cleared inside VALUES;
  - tenant switched to T2 inside VALUES;
  - a two-row insert whose first row clears the tenant in RETURNING.

  Every SELECT policy on these tables is tenant-only (`pg_policies`), so nothing but the tenant can hide a row.
- **Ceiling path ("already raises when it cannot see"):** a RETURNING flip on `invoice` and `variation` gives `issue_balance row missing`.
- **Legitimate tenant paths:** `withTenant` sets the tenant with `set_config(…, true)` for the whole transaction (`api/src/core/tenancy/tenant-context.ts:105`), and there is no nested tenant switch. `withoutTenant()` writes nothing to these tables, because their policy checks would refuse it anyway. Every foreign key is ON DELETE RESTRICT, so no cascade reaches the new refusal. The only legitimate path refused is X1.
- **New CHECKs and the per-tenant index:** each was dropped or altered in turn, and the W5, W6 or J7 test went red each time. The J7 test pins the exact index definition and that it is the only unique index.
- **Response rule under concurrency:** R1-R5 above, on PG16.
- **Fixtures:** `numberIfNeeded` and the concurrency `seal()` numbering are needed by the rule. The H4 assertion changed from `sealed_awaiting_number` to `withdrawn`, which is the stronger reading. I grepped every `ok).toBe(false)` in the race suite: each pins a message, except N4 (a) (noted above).
- **The walk's oracle:** replaced, numbered and prior acceptance, read from raw rows. It matches `quote_issue_state()`'s order, and a plant (superseded removed) turns both seeds red. It never sees an unnumbered issue, because the walk numbers with each seal. That case is covered by the documents-core W4 test only.
- **trigger-rules is not vacuous:** it asserts that both functions are present in its read, and the plain plants are caught (W13 revert, W1 revert, lock swap).
- **Blast radius:** no consumer of `acceptance_grade`, `acceptance_evidence` or `quote_issue_state` outside `new-app/db`.
- **Privilege bypasses:** `session_replication_role` is refused for the application role. `row_security = off` raises instead of exposing rows.

### Verdicts
- J6: not closable — X5 (the disposition's "lock order held by trigger-rules" is defeated by a comment); X7 and X8 are nits.
- J7: not closable — X2, X3 (its own design document states the reversed key and the false absolute), X6 (the id is not "unpadded").
- J8: not closable — X9 (Rule 21.10: "the application states the bar" has no writer and no test). Wording only; the mechanism itself is sound.
- J11: not closable — X1 (the fix refuses a legitimate staff deletion, and "Nothing legitimate is refused" is false), X4 (the guard the row cites is defeated by two spellings of the same skip).
