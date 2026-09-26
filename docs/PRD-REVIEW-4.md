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
