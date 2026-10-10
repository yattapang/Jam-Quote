# Brief: closing check of the tax and documents design after its read (TD1-TD15)

**Agent:** general-purpose, **Sonnet** (Rule 16.9: mechanical — every item names the text to read and the
expectations below are executed; the adversarial work was the Opus read, whose findings are reproduced at the end
of this brief). **Under check:** `docs/design/tax-and-documents.md` as amended, with the pointers in
`docs/PRD.md`, `docs/design/domain-model.md` and `docs/adr/0030-planning-directions.md`, at the commit that adds
this brief.

## What to do

1. From the repository root, run `python3 tools/run_brief.py docs/briefs/2026-10-02-tax-design-closing-check.md`
   and report its full output. Every check must PASS, and the tree must be clean afterwards.
2. For each of TD1-TD15 (reproduced under "The findings, as reported" below): read the finding's
   recommendation, then the design's §8 row for it and the section that row names. Report **answered** or
   **not answered**, quoting the sentence that answers it. A finding is answered when the design states a rule
   a builder can follow for every part of the recommendation, or states plainly why a part is not taken. Check
   in particular:
   - TD1: the design's two worked tests (§5, "The per-code ceiling") give the figures the read computed: a
     45,000.00 standard credit in Example A, and 200,000.00 of standard credit in Example B;
   - TD2: the split of 10,000.00 over three equal codes in §5 sums to 10,000.00 exactly, by the method T5 step 2
     states;
   - TD12: work both of §5's credit examples by T6's cumulative rule, by hand, and confirm they reverse exactly
     45.05 and 150.05;
   - TD14: each pointer the §8 row lists exists, in the document and the section it names.
3. Do not edit, commit, stash, `git checkout --` or `git restore` anything. This is a reading check: there is no
   code, so there are no plants.

## Report

The runner's output; TD1-TD15, each answered / not answered, with its quoted sentence; and a last line,
**closable** or **not closable**, for TD1-TD15 as a set. Nothing else.

## Expectations

Fifteen findings in the design's answer table:

```check
$ grep -c "^| TD[0-9]* ·" docs/design/tax-and-documents.md
15
```

Every finding is cited in the body as well as the table (more than one occurrence each):

```check
$ for n in $(seq 1 15); do c=$(grep -oE "\bTD$n\b" docs/design/tax-and-documents.md | wc -l); [ "$c" -ge 2 ] || echo "TD$n only $c"; done; echo checked
checked
```

The amendment is declared at the top, and the old restatement of "invoiced" is gone from T4:

```check
$ grep -c "Amended the same day" docs/design/tax-and-documents.md; grep -c "less its credit notes' net" docs/design/tax-and-documents.md
1
0
```

The pointers TD14 asked for:

```check
$ grep -c "finding TD14" docs/PRD.md docs/design/domain-model.md; grep -c "finding TD2" docs/adr/0030-planning-directions.md
docs/PRD.md:4
docs/design/domain-model.md:3
1
```

The repository's checkers are clean:

```check
$ for t in check_rules check_dispositions check_citations check_schema_citations check_build_plan; do python3 tools/$t.py 2>&1 | tail -1; done
All citations resolve, and no rule has changed unreviewed.
Every Closed disposition cites every document its finding named.
Every cited filename and symbol resolves. (Paths are checked by tools/check_schema_citations.py, not here.)
Every citation in the forms this tool checks resolves (its docstring lists them, and what it does not check).
Every ticked step carries its evidence.
```

```check
$ git status --short
```

## The findings, as reported

Reproduced from the read's reply (brief `docs/briefs/2026-10-02-tax-design-read.md`), unedited except that its
headings are one level lower. Every figure is synthetic.

**Independent read of `docs/design/tax-and-documents.md` at HEAD 8448b17** (brief `docs/briefs/2026-10-02-tax-design-read.md`)

`run_brief.py` last line: `Brief docs/briefs/2026-10-02-tax-design-read.md at HEAD 8448b17: 3 of 3 expectations hold.`

**Method.** This was a read only. Nothing was edited, committed or stashed. Every worked figure is synthetic and was computed with exact fractions and half-away-from-zero rounding by a script in the scratchpad (not the repo). The script's outputs are quoted below. Findings marked *reasoned* concern code that does not exist yet, so nothing could be run against them. HEAD did not move while I worked, and I saw no changes to the tree.

---

##### TD1 · blocker · T5 + T6, the per-code bases against a mix that moves
Each invoice is apportioned by the mix "as at the invoice", and the final invoice "bills the remainder of each code's base". When a variation changes the mix after earlier invoices, one code's remainder goes negative.

- **Example A (computed).** Accepted work is exempt 100,000.00 plus standard 100,000.00. A 50% deposit splits 50,000 / 50,000 and carries 7,500 tax. Then a −95,000.00 standard variation:
  - The ceiling becomes 105,000, which is at least the 100,000 invoiced, so the variation passes the ceiling.
  - The final invoice's remainders are exempt 50,000 and standard −45,000. Net 5,000.00, tax −6,750.00, **total −1,750.00**.
  - `invoice_amount_positive_check` (amount > 0) passes if the column holds net. The result is a "Tax Invoice" for a negative sum.
  - If the rate changed in between, that negative standard line is reversed at the new rate. T6's own reasoning says a reversal must use the original invoice's rate.
- **Example B (computed; brief §1, second bullet).** Accepted work is exempt 500,000 plus standard 500,000. A deposit of 400,000 and a progress claim of 400,000 bring the invoiced figure to 800,000 (400k exempt / 400k standard). Then a −300,000 standard variation:
  - The ceiling is 700,000, so the J4 remedy applies: credit 100,000 in the same transaction.
  - T6 reverses the credit "in the same proportions as that invoice's tax lines": 50k exempt / 50k standard.
  - Afterwards the standard work invoiced is 350,000 against 200,000 of standard scope. **Tax charged is 52,500 against 30,000 due on the scope: 22,500 over-charged.**
  - The ceiling is now reached, so no final invoice exists to correct it, and T6 forbids a credit aimed at one code.
- **What still holds:** the net ceiling (T4).
- **Recommendation:** decide the rule for per-code bases.
  - Option (a): a credit note may target codes when it accompanies a scope change.
  - Option (b): each invoice's per-code share is bounded by that code's remaining base, never below zero.
  - Either way, state that no invoice carries a negative code base or a total ≤ 0.

##### TD2 · major · T5, rounding the net split itself is unspecified
§T5's rounding rule covers tax only. Splitting an invoice's net across codes also rounds.

- **Computed:** a deposit of 10,000.00 on three equal codes gives 3,333.33 × 3 = **9,999.99**, one cent short of the invoice's net.
- "The final invoice bills the remainder, so the bases add up exactly" only rescues this when a `final` is issued and equals the whole remaining ceiling. The design does not say:
  - what happens to a job billed to the ceiling entirely with `progress` invoices;
  - whether a final for less than the remaining ceiling is allowed;
  - what happens to a positive variation recorded after the final;
  - what a percentage is a percentage of (accepted net, ceiling, or remaining).
- ADR 0030 decision 1 says "the final invoice absorbs rounding". The design absorbs base rounding only; per-invoice tax rounding (at most 0.5 minor units per code per invoice) is never absorbed. That difference is bounded but is not what the ADR says.
- **Recommendation:** name the allocation method (for example, largest remainder, with the residue going to a stated code), define "final", and correct either the ADR or the design.

##### TD3 · major (reasoned) · The tax is computed outside the lock
§4.3 puts the apportionment in `packages/core` (TypeScript). The lock is taken by the AFTER-INSERT trigger `issue_balance_enforce()`, after the invoice row with its tax lines has already been written.

- So the final invoice's per-code remainders, and a deposit's mix, are computed from rows read before the lock.
- A variation committed between that read and the insert (R1.24c's named scenario: "a variation landing between the read and the write") leaves the bases wrong. The net ceiling still passes.
- Nothing in the database ties an invoice's tax lines to its header, the way J11 (`20260927170000_issue_lines_add_up`) does for issues.
- **Recommendation:** require the API to take `quote_money_lock_for_issue()` before reading the mix. Add a COMMIT-time check that each invoice's and credit note's per-code lines sum to its net and tax.

##### TD4 · major · The ceiling change names one function; the gross figure is read in more places, and two tests assert the opposite
§4 says only that `issue_balance_apply()` re-sums net. Also affected:

- **`issue_balance_open()`** (`20260927220000_privilege_model/migration.sql:95-121`) writes the accepted figure from `q."total_minor"`, the gross. It is not named in the design. Fixing only `apply` leaves the ceiling 15% too high.
- **The over-credit check** in `issue_balance_enforce()` (`20260927110000_one_lock_per_quote/migration.sql:220-226`) compares credit `amount_minor` with invoice `amount_minor`.
- **The "still billed" test** in `acceptance_withdrawal_guard()` (`20260927180000_acceptance_grade/migration.sql:277-278`) makes the same comparison.
- **The nightly reconciliation** (A12, R1.24e) rebuilds `accepted_total_minor`.
- "Invoice and credit_note gain net, tax and total" does not say whether `amount_minor` becomes net or stays as total beside a new column. That choice decides all of the above.
- **Tests:**
  - `db/test/documents-core.test.ts:647` ("N6 · the ceiling is the total … INCLUDING tax") asserts the inverse of T4.
  - The no-stuck-state oracle computes `ceiling = Number(issue!.total_minor) + variations` (`db/test/no-stuck-state.test.ts:209`).
  - So §4's "the R1.24 tests and the race suite re-run unchanged in intent" overclaims: one test's intent flips and the oracle must change.
- **§5's planted defect** is "the old tax-inclusive ceiling". Planting it only at `issue_balance_open` (gross accepted figure, net invoiced) gives more room, so the "net fits but total wouldn't" test stays green. Only a boundary test at net ceiling + 1 catches it, and the design doesn't specify one.
- **Existing balance rows:** a migration cannot recompute them. FORCE'd row-level security hides them from it, as `20260926220000_withdrawal_after_full_credit`'s own header admits, and `accepted_total_minor` is written once. Any existing rows keep the gross figure. The design does not say whether such rows exist.
- **Grants:** `pryvis_balance` got `GRANT SELECT ON ALL TABLES` once (`privilege_model:82`) and has no default privileges. If `issue_balance_apply()` (SECURITY DEFINER) is made to read a new table such as `variation_line`, it needs an explicit grant.
- **Recommendation:** list every reader and writer of the gross figure, the meaning of `amount_minor`, the N6 and oracle changes, the boundary plant, and the treatment of existing rows.

##### TD5 · major · T4, `variation_line` has no stated relationship to the ceiling
"Its total is the sum of its lines' nets" leaves two things open:

1. **Where the total lives.** It could stay in `variation.amount_minor`, checked against the lines at COMMIT as J11 does, or be derived from the lines.
2. **How a line can be added.** If the total is derived and `variation_line` is append-only with no ceiling trigger, a line inserted in a later transaction raises the ceiling without the lock. `issue_balance_enforce()` refuses unknown tables, but only if the trigger is attached to them.

**Recommendation:** keep the stored header figure, check the lines against it at COMMIT, and allow lines only in the header's transaction.

##### TD6 · major · T7 can make an invoice read "paid" with money missing
- **Withholding is unbounded.** "Its kind from the rule pack, its amount" sets no limit. Example: invoice net 100,000.00, tax 15,000.00, total 115,000.00. The tenant records a payment of 100,000.00 and a "2% contractors levy" of 15,000.00 (2% of the gross would be 2,300.00). The invoice reads paid with 12,700.00 missing. §2's own reading gives a rate, a base (gross for 2%, before GCT for 3%) and a J$50,000 threshold, and T7 uses none of them.
- **A client credit has no lock.** It spans quotes, and the money lock is per quote. Two allocations of the same 5,000 credit to invoices on two different quotes, committed concurrently, both succeed (*reasoned*). Both invoices read paid.
- **Over-allocation after a credit note or void is undefined.** A credit note on a fully paid invoice (net 10,000 plus 1,500 tax) leaves 11,500 allocated beyond what is now due. Voiding a paid invoice leaves its allocations hanging. Neither case says whether the excess becomes a client credit.
- **"Overdue" when it isn't.** A recorded but unallocated payment, or a withholding certificate recorded after the payment, leaves the invoice overdue and reminders chasing money already received. The design doesn't say whether allocation is automatic.
- **Recommendation:** state the conservation invariants:
  - allocations ≤ payment;
  - the client credit balance stays ≥ 0, under a named lock;
  - a refund ≤ the credit;
  - a withholding is bounded by its kind's rate × base, with the threshold applied;
  - an over-allocation after a credit or void becomes a client credit.

##### TD7 · major · T9's schema sentence conflicts with the append-only, offline-sealed issue
"The issue refers to its quote's number and its revision" cannot work for a revision sealed offline before any number exists. `quote_issue` has no UPDATE path (domain model §6.1a), so the reference must be its own insert-only row per issue.

- `quote_issue_state()` (`20260927160000_acceptance_responses/migration.sql:143`) derives `sealed_awaiting_number` from an `issue_number` row. Every trigger that reads that state depends on it.
- The design says `issue_number` "stops being allocated per issue" and never says what replaces it.
- **Unstated cases:**
  - Rev 1 is blocked by the Free limit and never numbered, then rev 2 is sealed and released. Is the quote number allocated by rev 2? Does it read "Q-0042 rev 2" as the first document the client sees? Is the allocation the metered event (ADR 0031 says the meter is unchanged)?
  - Two revisions released concurrently: the quote-number lookup must happen under a lock before the series is incremented.
- The withdrawn-acceptance and rejected-seal cases are fine, as ADR 0031 says.
- **Recommendation:** specify the per-issue numbering row, the redefined state function, and that the quote number is allocated and metered at the first numbering of any revision.

##### TD8 · major (reasoned) · The series lock is a new lock with no stated order against the quote lock
An invoice or credit-note number is a column set at insert, so it is allocated, taking the tenant-wide series row lock, *before* the insert's trigger takes the quote lock. A transaction that already holds the quote lock and then issues an invoice or credit note takes them in the other order. For example, the J4 remedy run as one transaction, or a variation then an invoice.

- That is a deadlock shape absent from `new-app/CLAUDE.md`'s "Financial writes" list.
- Because the series lock is tenant-wide, one invoice waiting on a quote lock also stalls invoicing on every other quote of that tenant.
- **Recommendation:** fix the lock order (quote lock, then series), say how to obtain it, and add the shape to the race suite.

##### TD9 · major · T8 needs fields that are absent from the schema or contradict T5
- **Addresses:** T8 refuses a tax invoice for "a client with no address". `client` has no address column and neither does `tenant` (`schema-objects.json`: client = id, name, email, phone, …; tenant = name, country_code, currency, …). The §4 migration list adds neither.
- **Frozen details:** nothing says the invoice freezes the tenant's and client's names, addresses and registration number. Without that, editing a client later rewrites an issued tax invoice.
- **Lines:** T8 requires "each line's quantity and description", but under T5 a deposit or progress invoice is only an amount.
- **Supply date:** undefined (question 3 of §6 asks it, but the builder needs an interim rule).
- **Recommendation:** add the address columns, freeze the details on the invoice, and say what a deposit or progress invoice shows for its lines and its supply date.

##### TD10 · major · The sealed line keeps no code identity
§4 says `quote_issue_line` "keeps its treatment and gains the code's label and rate as sealed". T5 needs "that code's rate in force on the invoice date", which requires the code's identity. Two of the tenant's codes can share a treatment.

`quote_issue.tax_rate_basis_points` (NOT NULL, single value) has no stated fate once an issue holds several codes. J11's owed item ("`tax_minor` against the rate and each line's treatment", domain model §6.2) is neither taken up nor released now that the quote's tax is "an estimate".

**Recommendation:** add a code reference to the issue line, variation line and invoice tax line, and decide what happens to `tax_rate_basis_points` and J11's owed check.

##### TD11 · major · Undecided for C3 and D2: registration and rate precedence over time
- **Registration mid-job.** A quote sealed while the tenant was unregistered has no codes ("No tax code can be chosen"). If the tenant registers before invoicing, T5 has nothing to apportion. In the reverse case, it is unstated which date governs: seal, invoice, or the registration's effective date.
- **"Out of scope" has no value.** The treatment CHECK allows only `standard`, `zero` and `exempt`.
- **Precedence.** T1 says a statutory change comes by "release or staff override". T2 says tenants "start with the rule pack's codes" and may version them. It is unstated whether a new rule-pack version reaches a tenant whose codes were copied, or whether a tenant's own version wins.
- **Recommendation:** decide all three.

##### TD12 · minor · T6 credit-note tax drifts by rounding
Computed at 15%:
- **Over-reversal:** an invoice for 300.30 carries 45.05 tax. Three credits of 100.10 reverse 15.02 each, **45.06 in total**.
- **Under-reversal:** an invoice for 1,000.30 carries 150.05 tax. Credits of 333.43, 333.43 and 333.44 reverse **150.04**, so a fully credited invoice still shows 0.01 of tax.

**Recommendation:** compute each credit's tax cumulatively (the credited-to-date tax minus tax already reversed), and have the credit that completes the invoice's net reverse the remainder.

##### TD13 · minor · T1's tax-name guard is not scoped precisely enough to build
- **Marketing copy.** `web/content/site.ts:117, 133, 134, 248` carries "GCT" in public-site copy. ADR 0030 says "product code or copy", and it is unstated whether that includes the site.
- **Migrations.** Two committed migrations contain "GCT" in comments (`20260925120000_documents_core:29`, `20260927170000_issue_lines_add_up:28`). Rule 6 forbids editing them, so they need an explicit exemption.
- **Case.**
  - A case-sensitive guard misses lowercase identifiers. `gct_jmd` already exists in `db/test/money-convention.test.ts:81`.
  - A case-insensitive one hits base64 in `package-lock.json:4107` (`…jspbgbnIBNqlI23tRnTWT0snUIw=`).
- **Coverage.** The guard does not cover the full name ("General Consumption Tax"), nor other packs' labels (VAT, "BIR number") — the same rule for the next country.
- **Citation.** The brief cites Rule 15, but the rule carrying this requirement is Rule 3 ("tax rules … legal document wording are data per jurisdiction"). The design cites neither.
- **Recommendation:** state the roots, file types, case handling, exemptions and label list. Plant a defect for each evasion.

##### TD14 · minor · Other documents still describe the old model with no pointer to this design
- **PRD R1.14** still names "an insert-only `issue_number` row — once per quote".
- **PRD R1.9 and §12** still say the GCT design is "owed".
- **Domain model** §6.1a (line 211, "one row per issue"), §7 table (line 497), §6.3 state table (lines 396-397), §6.2 (line 314, "copy of the accepted issue's header `total_minor`") and J11's paragraph (lines 357-363) carry no pointer. Only the general "Tax basis" note at line 274 exists.
- **ADR 0030's** "final invoice absorbs rounding" (see TD2).
- **T4 restates the definition of "invoiced"** in prose, despite R1.24 ("defined once … not restated here"), and the restatement drops K1's `GREATEST(0, …)` per-invoice floor. A builder following T4 literally would bring K1 back.
- **Recommendation:** add the pointers, and replace T4's sentence with a reference to `issue_balance_apply()`.

##### TD15 · minor · Smaller gaps
- **Day boundary.** "Rate in force on the invoice date" doesn't say which calendar day `issued_at` (a timestamptz) falls on. Rule 3 wants the country's day boundary (America/Jamaica).
- **Backdated rates.** Nothing stops a new rate version from taking effect before invoices already issued. That makes "history cannot be rewritten" false for any later recomputation.
- **The T2 warning** says only how a *changed* rate is shown. A tenant-*added* code has no country default to compare against (one of two twins).
- **Staff overrides.** The surface for the "staff override" path (D7, the staff console) is built after D2.

---

**Verdict: not yet.** TD1 is a blocker in the core tax arithmetic, and TD2-TD11 are things a builder of C3, C4, D1 or D2 would otherwise have to make up. The design is sound after the named changes.

**Categories with no defect found:** the net ceiling as a concept holds under a rate change; T9's gaplessness holds if allocation happens in the same transaction as the insert; withdrawal-then-revision and rejected seals are unaffected by number-per-quote.

`git status --short`: (empty)
