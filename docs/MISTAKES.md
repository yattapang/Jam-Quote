# The mistake ledger

**Append-only.** Every defect found in our own work gets an entry, and every entry names either the
rule that now prevents it mechanically or states plainly that no mechanical prevention exists and
why. Required by **Rule 24**.

## Why this file exists

Three reasons, and the third is the real one.

1. **A mistake nobody wrote down is a mistake waiting to be repeated.** Each session starts cold.
2. **It makes the rulebook answerable.** Every rule here points back at the specific failure that
   caused it, so nobody later deletes a rule for looking fussy without seeing what it cost.
3. **It makes repetition visible.** A mistake appearing twice is not bad luck — it is evidence that
   the rule written the first time is **decorative**. The `Repeat of` column is the most valuable
   thing here, because it is the only way to tell a working control from a comforting one.

**This is not a punishment log and it is not for near-misses avoided by working correctly.** It is
for defects that reached a commit, a document, a claim made to the owner, or a control that shipped
believing something untrue.

## How to add an entry

At the bottom, newest last, never edited once written (correct by appending, like the audit log —
Rule 6). An entry needs: the date · what actually happened · what it cost or would have cost · the
rule that prevents it, **or** an honest "none, because…". If a rule had to be written, it lands in
`docs/RULES.md` in the same change.

---

## 2026-09-24 — the session that produced Rules 21 and 22

Eleven entries in one day. The count is not a sign of an unusually bad day; it is a sign of the
first day anybody was **looking**, which is the point.

### M1 · Opus built staff MFA against an approved design
Rule 16.2 places "building to a precise spec" with Sonnet. The design listed the very defects to
plant. No agent was used and no decision was declared.
**Cost:** premium budget on work a cheaper model does; a session limit hit mid-run.
**Prevented by:** Rule 16.5 — the delegation decision is declared in writing, in `BRIEF-STATUS.md`
and the ADR, before the batch starts. No declaration, no build.

### M2 · A subagent reported intent as completion — three times
Each run narrated launching a subagent instead of doing the work. Two tool calls, no research. The
third changed a dependency **before** capturing the baseline, so twelve minutes of test runs measured
a state that was neither the before nor the after.
**Cost:** three wasted runs; a half-applied dependency change to clean up.
**Prevented by:** Rule 16.3's final bullet — a report without the command and its output is FAILED
work, mechanically, with no judgement about tone. And Rule 16.6 — a multi-step protocol whose order
carries the meaning is not delegated on the strength of a brief.

### M3 · A secret scanner claimed the full history and scanned one commit
`gitleaks/gitleaks-action@v2` runs `--log-opts=-1`. It reported "No leaks detected"; the workflow
comment and the pull request both said full history; `fetch-depth: 0` fetched a history nothing read.
**Cost:** nearly shipped a green "history is clean" badge over 429 unscanned commits.
**Prevented by:** Rule 21.1 — a control's scope is quoted from what the tool reports. Rule 21.2 — a
control ships having fired on purpose; a planted credential in an old commit would have caught this
on day one.

### M4 · The scanner's allowlist was silently ignored
A top-level `[[allowlists]]` block produced no warning and no effect: same three findings, no notice
that the config had been read and discarded.
**Cost:** two extra rounds chasing a config that was never loaded.
**Prevented by:** Rule 21.2. A control whose *configuration* has never been seen to take effect is in
the same position as one that has never fired.

### M5 · Advised a patch upgrade that would have fixed nothing
"A patch within `next@14.2.x` clears the criticals" — from the general expectation that advisories
are patched in the current minor. The advisory's own range was `0.9.9 - 16.3.0-preview.10`, fix
`next@16.3.6`, a major.
**Cost:** would have produced a change that looked like security work, passed the gate, left every
critical in place, and been recorded as done. **Worse than doing nothing.**
**Prevented by:** Rule 21.5 — a remediation claim quotes the authority that decides it.

### M6 · "The last run was 11 September"
One stale row from a list query, reasoned from as a pattern. The workflow had in fact run that
morning; the real defect was different and worse.
**Cost:** a wrong diagnosis reported to the owner.
**Prevented by:** Rule 21.6 — one sample is not a pattern.

### M7 · "No such agent exists"
Asserted about an agent that did exist. One `ListAgents` call would have shown it.
**Cost:** a false statement to the owner, corrected a few minutes later.
**Prevented by:** Rule 21.6, which covers asserting absence.

### M8 · A scripted edit spliced a block into the wrong job
A text anchor in `verify.yml` was not unique, so the new steps landed inside the `verify` job instead
of `scan`. Caught only because the YAML was parsed afterwards and the step names printed.
**Cost:** would have been a plausible-looking diff with a control in the wrong place.
**Prevented by:** Rule 22.1 — assert the anchor is unique. Rule 22.2 — parse the result and print the
structure.

### M9 · Backticks in a commit message were executed by the shell
A heredoc commit message containing backticks lost the clause describing a bug to command
substitution.
**Cost:** one sentence of history, unrecoverable without a force-push over `main`.
**Prevented by:** Rule 22.3 — prose goes to a tool through a file.

### M10 · Reported "pushed" when nothing was pushed
`git push -q origin main && echo pushed` from a feature branch pushed the *unchanged local `main`* —
a successful no-op — while the work sat on `chore/next-16`. Exit 0, nothing pushed.
**Cost:** the rules commit would have arrived inside an unrelated pull request.
**Prevented by:** Rule 21.7 — an exit code is not evidence of an effect; quote the state afterwards.

### M11 · Inserting a sub-rule renumbered the rulebook underneath four documents
Rule 1's sub-rules were an auto-numbered markdown list. Inserting the new 1.2 shifted everything
after it, leaving three ADRs and the Phase 0 audit citing rules that had moved.
**Cost:** four documents silently wrong, each still reading as authority.
**Prevented by:** Rule 23 and `tools/check_rules.py` — explicit numbers, append-never-insert,
tombstones for retirements, and a manifest that turns any change to a rule into a red build that
prints every citation of it.

### M12 · A workflow reported success for work it was not doing (pre-existing)
`Keep API warm` pinged on a `*/10` schedule GitHub actually fired every 3-5 hours, against a
15-minute spin-down, and every run paid a full cold start — proof it never worked. `|| true` kept it
green, including a 90-second timeout.
**Cost:** months of false assurance, and a cold start on every real visit.
**Prevented by:** Rule 21.1, 21.2 and 21.4 together. **Not fully:** nothing would have caught a
schedule GitHub silently throttles except measuring the runs, which is what finally did.

---

## Earlier, recorded here retrospectively

These predate the ledger and are summarised from the review register, because the pattern matters
more than the chronology.

### E1 · An authentication bypass in our own password verification
A stored hash of `scrypt$65536$8$1$$` — empty salt and empty hash — derived a zero-length key, and
`timingSafeEqual(empty, empty)` returned true, so **any password verified**.
**Prevented by:** Rule 1.5's plant doctrine, and a named regression test kept forever. Found by
reasoning about what the code permitted, not by a failing test — which is the reason Rule 16.5 keeps
the credential path with the strongest model.

### E2 · A guard satisfied by an import line
A site guard matched `/DraftBanner/` against the file's *import* statement rather than a rendered
element — the exact failure the Phase 0 audit had named in the old application.
**Prevented by:** Rule 1.5 (plant the defect the guard exists to catch) and the parser-based guard
doctrine: structure is read with a parser, never a regex.

### E3 · A comment that a test disproved
A comment claimed that checking the IP limit first prevents a flood draining a target's email
bucket. It does not.
**Prevented by:** Rule 21.1 in spirit — a claim beside the code is checked against what the code
does. Recorded in ADR 0016 as accepted rather than quietly fixed.

### E4 · `git add -A` swept a live agent's probe file into `main`
**Prevented by:** Rule 16 — no shared-resource operations while an agent is live, and stage specific
paths.

### E5 · A grep hid a file-level failure
A gate summary read "10 passed" while a whole test file failed to transform.
**Prevented by:** the gate command now including the `Test Files` line — and generalised in Rule 21.1.

---

## 2026-09-25 — found by the first review under Rule 1.10

The gate the owner asked for paid for itself on its first use: 19 findings, 6 of them blockers,
against two documents I had written and one of which had already been approved. These are the
entries that are mine rather than the plan's.

### M13 · The PRD and the approved domain model gave opposite answers about offline issuing
`Repeat of:` nothing, but it is the same *shape* as M11 — a document left behind when another moved.

The domain model §8 says *"Issuing offline is **allowed** — refusing it would break step 3 of the only
story that matters"*, with `quote_issue` offline listed as *"create (with a leased number)"*, and it
specifies device number leases to make that safe. The PRD then scoped R1.18 as *"Issuing requires
connectivity in R1"* and deferred leases to R2 — **without amending the model.**

**Cost if it had not been caught:** the physical schema comes from the model, so whoever wrote it
would have shipped either lease columns the PRD says are unnecessary, or a `number_series` that R2
must migrate **with issued financial documents already in it** — the most dangerous column in the
product to change late.
**Prevented by:** Rule 1.10, which is what found it. Reinforced by Rule 23.5's principle applied
beyond the rulebook: **a document that scopes another amends it in the same change.** Rule 1.2 already
says design from the product and correct what disagrees; what was missing was doing it in the same
breath rather than leaving two live documents disagreeing.

### M14 · Cited a guard by a filename that does not exist, and credited it with protection it does not give
PRD §7 says the absence of prices on the site is safe because *"a guard enforces that
(`honest-claims.test.ts`)"*. There is no such file — the guards live in
`new-app/web/test/site-guards.test.ts`. And the guard that does exist checks only that no tier shows a
digit in its price label; **nothing asserts the tier feature lists are deliverable.** Meanwhile the
site's Pro tier sells retention tracking, project costing, accountant exports and offline use, three
of which the PRD's own §8 excludes from release 1.

**Cost if it had not been caught:** a Rule 20 over-claim shipped on the public site, with the PRD
pointing at a non-existent guard as the reason it was safe.
**Prevented by:** Rule 21.1 — a control's coverage is quoted from what it reports, not from what it
was believed to do. This is 21.1 broken by the person who wrote it, one day later, which is the
strongest argument available that the rule is not fussiness. **A mechanism is still owed:** nothing
checks that a cited file exists or that a cited guard asserts what it is credited with. The nearest
thing is `tools/check_rules.py`, and extending it to verify cited paths is cheap — recorded here as
owed rather than promised.

### M15 · A disposition table claimed five blockers closed; three of the rows overstated what changed
`Repeat of:` **M13** — and it recurred *in the commit that logged M13*, which is the strongest possible
evidence that M13's lesson had no mechanism behind it (Rule 24.4).

F1's own `Where:` line named `domain-model.md` §4 and §6.1. The amendment added §6.1a and never touched
§4, which still reads *"Allocate at sync … **Rejected**"* and *"**Chosen:** device number blocks"* — so the
contradiction the amendment existed to remove **moved from between two documents to inside one**. F17 and
F3 failed the same way: amended in one of the two places each named.

**Cost if it had not been caught:** the physical schema would have been written from a document that
contradicts itself about the one thing that decides its columns, and the disposition table said it was
safe. A second review caught it; a reader trusting the table would not have.
**Prevented by:** Rule 24.6 and `tools/check_dispositions.py` — a row may not say `Closed` without citing
every document the finding named, gated in CI. Against the uncorrected table it flagged all twelve rows.

### M16 · The amendments introduced four of the five blockers in the next review
Not a slip but a **class**: an amendment that closes a finding writes new text, and new text carries new
invariants that nobody has attacked. `issue_balance` was created to give the money invariant an owner and
arrived with no row creator — and `SELECT … FOR UPDATE` on zero rows takes no lock, so the first pair of
concurrent invoices, the very case it was built for, still slips (G2). The minimal variation closed F3 and
created a unilateral way for one party to raise the invoiceable ceiling (G1).

**Cost if it had not been caught:** each fix would have shipped believing itself complete, and the second
one is a money defect that surfaces as over-billing a real client.
**Prevented by:** Rule 24.6's second half — closing a blocker earns a **re-review**, not a tick. There is
no cheaper mechanism: a fix cannot be attacked by whoever wrote it, which is Rule 9's whole premise
applied to amendments rather than to modules.

### M17 · Three amendment passes, each introducing blockers — the medium is the defect
`Repeat of:` **M13 and M15**, third occurrence. That is the finding.

| Pass | Findings | Blockers **created by the previous pass's amendments** |
|---|---|---|
| Review 1 | 19 | — |
| Review 2 | 17 | 4 of 5 |
| Review 3 | 20 | **11 of 20 findings are defects in text written by the commit that closed review 2** |

Two findings marked **Closed** were not closed at all, in the document the finding named:

- **G1** — `PRD.md` R1.24d carefully explains why the ceiling says "*recorded* variations"; the model
  still says "plus **accepted** variations, where those exist" in **two** places (`domain-model.md:234`
  and `:253`). I wrote the explanation and never changed the thing it explained.
- **G2** — §6.2a declares the `issue_balance` writer set "**closed and named**" and the list omits the
  **acceptance transaction that creates the row**, which is the fix G2 asked for. A writer set that
  omits the creator is exactly the empty-lock hole, relocated.

And the sharpest one: `site.ts:192` cites **`honestClaims` in site-guards.test.ts** — a symbol that does
not exist. That is **M14's own defect (citing a guard by a name that is not real) re-committed inside
M14's fix.**

**Cost if it had not been caught:** the physical schema would encode a `user.email` unique index with no
pending-claim table, an `issue_balance` column carrying two contradictory write rules, and a
`quote_issue` state set that differs between two sections of one document.

**Prevented by:** nothing yet, and a fourth prose pass is not it. The mechanism has to be structural, and
the diagnosis is the medium: **an invariant written in prose in two places will drift every time**, and
each amendment grows the surface of possible disagreement faster than any reader can check it. Rule 7
already says one rule lives in one place; what it does not say is that a *document* is a poor place for
a rule that code can hold instead. The five things that keep drifting — the state machine, the ceiling,
the writer set, the uniqueness rule, the immutability boundary — stop drifting the moment they are a
migration, an enum and a test, because code cannot hold two definitions of the same thing. **Recorded
here as owed, pending the owner's decision**, because it changes the order of work rather than a rule.

---

## 2026-09-26

### M18 · A migration comment credited a column that did not exist
`Repeat of:` **M14 and H16**, third occurrence of the class — and this one landed *in the same batch
that built the checker for it*.

`20260925120000_documents_core/migration.sql:326` said, present tense: *"`client_reference` is the
idempotency key, and it exists because a variation can be recorded OFFLINE and replayed from an
outbox."* **The column was not in the table.**

**Cost if it had not been caught:** the offline variation path with no idempotency key is the worst
shape a defect takes here — a replayed outbox entry inserts a second append-only row, the invoiceable
ceiling rises **permanently**, and the nightly reconciliation job then certifies the inflated figure
as correct. Self-ratifying over-billing, with a comment in the migration saying it was handled.

**Prevented by:** Rule 21.8, extended to migrations in the same commit. `check_citations.py` now
checks that a backticked snake_case identifier in a migration comment appears as real SQL in some
migration. Fixed for real by `20260926100000_variation_idempotency`, a new migration rather than an
edit (Rule 6) — the old comment stays wrong and the new migration explains why it was.

**Two things the guard got wrong first, both found by planting:**
- It matched **substrings**, so `client_reference` was satisfied by the index name
  `variation_issue_client_reference_key` and a planted defect passed. Word boundaries now.
- It read `git ls-files`, so the new migration was invisible until staged — which is worth knowing
  about every one of these tools: **an untracked fix does not exist to them.**

The honest summary: the same class of defect has now happened three times, each time inside the fix
for the last. What finally stopped it was not care but a thirty-line script — and the script was wrong
twice before it was right, which is why Rule 21.2 exists.

### M19 · Trusted a green local checker run that had not seen the file under test
`Repeat of:` **M18's second lesson**, written the same hour and walked into anyway. Also the same
family as **M10** (an exit code is not evidence of an effect).

`check_citations.py` reads `git ls-files`, so an unstaged file does not exist to it. I ran it, got
"every cited path resolves", committed, and CI failed on four citations inside the new migration —
which the local run had never opened. The findings were real: comments said `accepted_total` and
`variations_total` where the columns are `accepted_total_minor` and `variations_total_minor`. Close
enough to mislead, which is worse than obviously wrong.

**Cost:** one red build and one corrective commit. Cheap this time, and it was cheap only because CI
looks at the staged tree rather than my working directory.

**Prevented by:** the tool now **says when it cannot see new work** — it lists untracked files it did
not scan and tells you to stage them before trusting a green result. Proved by planting an untracked
file and watching the notice appear. The deeper rule is Rule 21.1: a result computed over the wrong set
of inputs is not a result, and a tool that cannot say which inputs it used invites exactly this.


### M20 · Four rounds of patching one guard, when the guard's *shape* was the defect
`Repeat of:` **M14 and M18's class**, and the reason review 4 could still find three instances of it.

`check_citations.py` was patched after M14, after H16, after M18 and after M19. Each patch fixed the
instance in front of me. Review 4 then found three defects the tool could not see **by construction**:
it skipped, in silence, any cited path whose first segment was not a real top-level directory — 71
distinct paths, hiding five phantoms including `db/test/money-convention.test.ts`, which was credited
at eight sites as the guard keeping money columns `BIGINT` and **had never been written**; and it
checked identifiers by text presence, which another comment can satisfy, so `document_render` looked
resolved while no migration created the table.

**Cost:** a guard that reported "Every cited path resolves" while checking 71 fewer paths than it
claimed, for several days, in the one job built to stop exactly that.

**Prevented by:** a new tool rather than a fifth patch — `tools/check_schema_citations.py` resolves
paths against a full index with **no silent skip** and identifiers against **parsed DDL**, and prints
the count of what it skipped (zero) alongside its result. The lesson is not "write better patches": it
is that a guard which cannot state the set it examined will eventually examine a smaller one. Rule 21.1
already said so about claims; this applies it to the tool itself.

### M21 · My own new guard's first version failed its own plant
`Repeat of:` **nothing — this is what a plant is for, and it is recorded because the near-miss is the
evidence.**

`check_schema_citations.py` was written to catch J9: a UUID `*_id` column with no foreign key naming a
table no migration creates. Its rule was "has a foreign key **OR** names a table that exists". The
plant — delete the foreign key J9's migration adds — **passed green**, because by then the table
existed and the OR was satisfied. Had I reported the tool on the strength of reading it, I would have
shipped a guard that could not see the defect it was named after.

Tightened to require the key outright, it immediately reported two more real ones:
`audit_entry.actor_user_id` and `platform_capability.granted_by_user_id` — the two columns in the
schema that answer "who did this?", both accepting any UUID as the actor. Both now have foreign keys
(`new-app/db/migrations/20260926160000_unenforced_references/migration.sql`).

**Cost:** none, because the plant ran before the claim. That is the entire value of Rule 21.2 and this
entry exists so the next agent sees a plant catching a real defect rather than ceremony.

### M22 · Pushed with a typecheck error in the file I had just written to prove a claim
`Repeat of:` **M10's family** — an exit code from part of the gate treated as a result from the gate.

I ran the database suite (87 green) and four checkers before committing `money-convention.test.ts`,
and **not** `npm run typecheck`. CI failed on one line of the new file: `rows[0]` is possibly
undefined under `strict`. The test was correct and the types were not, which makes it the cheap kind
of failure and it still cost a red build on the commit whose whole subject was a guard being proved
properly.

**Cost:** one red build, one corrective commit, and the irony of it landing on M20's commit.

**Prevented by:** the full local gate before a push is typecheck **and** lint **and** tests **and**
the checkers — not the subset that relates to what I changed. A new test file is TypeScript being
added to a strict project, so the compiler is part of its proof, not a formality afterwards.

### M23 · The same fact written in prose three times, wrong all three times
`Repeat of:` **H1/G1's pattern**, and this is its third appearance in one section of one document.

`domain-model.md` §6.2a carried a "who writes it" column for `issue_balance`. H2 found it wrong and
omitting two writers. H2's fix deleted the *paragraph* that named the writers and left the *table
column* standing two lines above it — in the very amendment that recorded the lesson. Review 4 (J12)
then found that column crediting a **credit note** as a writer of `invoiced_total_minor`, which it has
never been: the ceiling expression excludes credit notes deliberately, and the function never reads
that table.

**Cost:** a blocker closed on the strength of a disposition that was false when written, and a
document that told a reader the opposite of what the code does about money.

**Prevented by:** the column is gone rather than corrected. Which insert moves which balance column is
now executed in `new-app/db/test/documents-core.test.ts` — including a credit note moving nothing —
and what makes the call happen lives in the trigger migration, whose identifiers are checked against
the real schema. **Correcting prose a third time was the option not taken**, because prose cannot hold
an invariant (ADR 0025), and three attempts is enough evidence.

Also fixed in passing, and it is the more insidious half: the near-miss column names. The table said
`accepted_total`, `variations_total` and `invoiced_total` where every column carries a `_minor` suffix
— M19's defect, corrected in the migrations months earlier and still alive in the documents, at eight
sites. `tools/check_schema_citations.py` now reports an identifier that is *almost* a real column,
which is a narrow enough rule to have produced exactly three findings and no noise.

### M24 · A disposition row stopped being checked because I reworded it
`Repeat of:` **M20's shape** — a guard quietly examining a smaller set than it claims.

Correcting H2's disposition, I wrote "**Reopened by J12, then closed 2026-09-26.**"
`check_dispositions.py` keys on `**Closed`, so the row silently left the set that carries the burden:
it still claimed closure and nothing checked its citations any more. The only signal was the printed
count dropping from 40 to 39.

**Cost:** none, caught in the same minute — and only because the tool prints how many rows it checked.

**Prevented by:** the pattern now accepts the ways a row says the same thing, and the count is the
reason this was visible at all. The general lesson: **a guard keyed on a turn of phrase loses rows to
rewording**, so it must state the size of the set it examined every time (Rule 21.1). A tool that
printed only "OK" would have hidden this, and I would have trusted it.

### M25 · The isolation tests asserted the safe direction and made the dangerous one look covered
`Repeat of:` **the H2/J12 family** — a control whose stated scope is wider than what it checks.

`documents-core.test.ts` had a block titled "the tenant boundary still holds over all of it" whose
write test inserted a `quote_issue` stamped with **another tenant's** id and asserted a refusal. That
is refused, by `WITH CHECK`, and it is the easy direction. The dangerous direction — a row stamped with
**one's own** tenant id, hung off another tenant's parent — was not tested anywhere, and it worked:
every foreign key was single-column, and PostgreSQL states that referential integrity checks "always
bypass row security". With a global unique index above it, one tenant could permanently deny another
the ability to accept their own quote, with no in-product remedy (finding J3).

**Cost:** the only cross-tenant defect found so far, in a product whose first security constraint is
tenant isolation, and it lived behind a passing test whose title claimed the whole boundary.

**Prevented by:** composite foreign keys on all 22 parent-child relations, tenant-scoped unique
indexes, four behavioural tests executing the attack, and a **structural** guard in
`db/test/tenant-isolation.test.ts` that fails on any tenant-owned child keyed on an id alone — so a
table added next month is caught without anybody remembering J3. Proved by planting: reverting one
foreign key to a single column turns both the guard and the behaviour test red, and reverting the
unique index too makes the foreign acceptance insert **succeed**, which is the leak itself.

The lesson about test titles: "the tenant boundary still holds over all of it" was a claim about a
boundary, evidenced by two tests about one half of it. A block's title is a claim (Rule 21.1), and if
it says "all" it has to mean it.

### M26 · Ran one workspace's tests and called it the gate, twice in one session
`Repeat of:` **M22**, four commits later, with the subset chosen differently.

M22 was "ran the tests, not typecheck". This is "ran typecheck and `npm test -w @pryvis/db`, not
`npm test`". J3's composite keys changed the schema every package sits on, and an existing API test —
`db-caller-resolver.test.ts`, "refuses a session whose tenant does not own its user" — deliberately
creates a cross-tenant session row to prove the resolver refuses it. That row is now unrepresentable,
so the FIXTURE failed. CI found it; I had not run that package.

**Cost:** one red build. The finding was benign and in a sense welcome — it is the new constraint
working — but I did not know that until CI told me, and the next one may not be benign.

**Prevented by:** the gate is `npm test` at the workspace root, not a `-w` subset, whatever the change
appeared to touch. A schema change touches every package that reads the schema, which here is all of
them. The test itself is now better for it: the database's refusal is asserted where it belongs, and
the resolver's own check — now the second layer — is exercised by dropping the constraint inside that
one test, because a second layer that cannot be reached is a second layer nobody has tested.

### M27 · Two migrations described an open finding's behaviour after their own fix had changed it
`Repeat of:` **M14's class** — a comment crediting a state of the system that is not there — and the
first time it has been about a *defect* rather than a mechanism.

J2's trigger migration and J3's balance-write migration both say, in their "what this does not do"
sections, that J4 is "a negative variation strands the issue". Review 4 executed that before J2 and it
was true then. **J2 changed it**: the variation's own insert now fires `issue_balance_apply()`, which
raises and rolls the row back, so nothing is stranded. Nobody re-ran J4 after J2 landed, so two committed
migrations and the header of `money-convention.test.ts` described a defect that no longer existed in that
form — while the real remaining blocker, *no way to reduce agreed scope at all*, went unstated. Found on
2026-09-26 by re-executing the review's scenario before designing J4's fix rather than designing from the
finding's text.

**Cost if it had not been caught:** J4 would have been designed against the wrong defect — a fix for a
stranded row that cannot occur — and the product question it actually raises would not have been put to
the owner.

**Prevented by:** partly, and the gap is stated. J4's scenario is now a test
(`new-app/db/test/documents-core.test.ts`, the J4 block), so this particular claim cannot go stale again
unnoticed. **No mechanism yet covers the class**: a review's executed probe lives in a scratchpad, so an
open finding's behaviour is re-checked only when someone thinks to. The mechanism owed is to commit each
executed finding's probe as a test that is *expected to fail* (`it.fails`) until its fix lands — a fix
that changes the behaviour then flips the test and forces the description to be revisited. Recorded as
owed rather than promised. The migrations themselves stay as written (Rule 6); the correcting migration
`20260926200000_scope_reduction` says why they are wrong.

### M28 · A guard trusted a comment's invariant, and a design claimed a property nobody executed
`Repeat of:` **M14's class** (a comment crediting a state that is not there), and **J10's own fix**.

`20260926140000_one_live_ceiling_per_quote` found the blocking earlier revision with `LIMIT 1`, justified
by its comment: *"At most one can match, because this trigger is what keeps it so."* It does not keep it
so. A revision accepted with nothing billed may be superseded, and the next one accepted, so two earlier
revisions are accepted-and-not-withdrawn at once. The guard took the first, found no money on it, and let
a third revision seal — taking an invoiced revision's ceiling to 0, after which every write on it raised
(K6 of the J4 re-review). Every J10 test used two revisions; the defect needs three.

Then my J4 design said "**no stuck state can be entered**" — a claim about every sequence of writes,
supported by reasoning about each write alone. The independent re-review disproved it with a seeded random
walk, which found K6 in a few thousand writes where no scenario test had. Preparing the fix turned up its
twin by the same shape: a variation accepted against a superseded revision, blocking every later revision
of the quote.

**Cost if it had not been caught:** a contractor whose client re-accepted a revised quote could be left
with a job they cannot bill, variation or credit, with 90,000 already invoiced — in the ordinary course
of revising a quote twice.

**Prevented by:** `new-app/db/test/no-stuck-state.test.ts` — the walk, committed and seeded, asserting
that no issue is stuck and none sits above its ceiling after 1,900+ writes per seed, and asserting the
size of what it examined so a generator that stops reaching the interesting states fails. Proved by
planting: with K6's guard reverted it reports 7 and 8 stuck issues. **Its limit, stated:** it did not
catch the twin, whose damage is a quote that can never be revised again rather than a stuck issue, and a
random walk is not exhaustive. The general lesson: a claim of the form "no sequence can…" is executed by a
sequence test or it is not a claim.

### M29 · J4's fix amended a sentence and left its twin standing beside it — and restated the arithmetic six times
`Repeat of:` **M13, M15 and M23** — a claim corrected in one place and left standing in the next.
Fourth occurrence of the class in this document set.

`06e9b73` changed what a credit note does to the invoiced total, and amended the sentences that said
otherwise — some of them. The re-review (K5) found six it made false and left: `domain-model.md` §6.2a's
table and the paragraph under it, **two lines above text the same commit edited**; the J12 test block's
header, above a test the commit rewrote to assert the opposite; the withdrawal paragraph; and R1.15b's
own headline, found while fixing the others. It also wrote "net of credit notes and excluding voided
invoices" into six places, when ADR 0025's point was that no document restates the arithmetic — and
two of those restatements were already drifting from each other.

**Correction to M23**, which cannot be edited: its "including a credit note moving nothing" was true when
written and has been false since `06e9b73`. A credit note now lowers `invoiced_total_minor`, deliberately.

**Cost if it had not been caught:** a reader of the domain model would have been told, beside the
corrected sentence, that a credit note never touches the invoiced total — the opposite of the code about
money, which is the M23 cost again.

**Prevented by:** partly. The restatements are replaced by pointers to `issue_balance_apply()`, so the
next change to the arithmetic has nothing in prose to leave behind — ADR 0025's mechanism, applied rather
than cited. **Nothing mechanical finds a stale twin**: `check_dispositions.py` checks that a closure cites
each named document, not that every sentence in it is still true, and a tool that detects one fact stated
in two places is still owed (review 4 named it). Recorded as owed, not promised.

### M30 · The guard written for M28 judged its results with the code it was guarding
`Repeat of:` **M21 and M20** — a guard that examines less than it claims — inside **M28's own fix**.

`no-stuck-state.test.ts` was committed in `c35952d` as the mechanism answering M28. It decided "stuck" by
calling `issue_balance_apply()` and "over the ceiling" by calling `issue_ceiling_minor()` — the functions
under test. The second re-review (L3) planted credits subtracted twice, and the original J10 defect: 150,000
billed against a 100,000 ceiling, and 230,000 of live ceiling on one quote, and **the walk stayed green on
both**. It also reached withdrawal after money had moved zero times, so K4's own path was never walked, and
its asserted counts could not notice.

And the fix nearly repeated it. The rewritten walk's J10 check first counted live ceilings from the
**oracle's** figures, which cannot show two by construction — so under the J10 plant it read 0 while
every other check fired. Caught before commit, by reading the plant's printed counts rather than the
pass/fail line; recorded here because it is the same defect one hour later.

**Correction to M28**, which cannot be edited: "1,900+ writes per seed" counted writes *attempted*. The
committed test's own comment said 877-914 *succeeded*. Now 200 runs per seed, measured at 1,347-1,357
successful writes.

**Cost if it had not been caught:** the one test standing behind "no stuck state can be entered" would
have passed over the exact defects that claim excludes, and M28 would have named it as the mechanism.

**Prevented by:** the walk now re-derives every figure from raw rows in TypeScript, from the PRD's
wording and sharing no SQL with the functions under test, and fails on any disagreement. It asserts the
reach it needs (full credits, withdrawals after money). It is planted against K6, W1, W2 and W3, and
every check was seen to fire on its own plant. **The general rule this is evidence for:** a guard's
oracle must not be the thing guarded, and a check is proved by watching *its own count* move under a
plant, not by the test going red for some other reason.

### M31 · The K4 decision was designed for the case in front of it, and its twin had a variation
`Repeat of:` **M29, M23, M15** — one of two twins, now in a *design decision* rather than a sentence.

K4's remedy (withdraw once every invoice is credited or voided) was designed, approved, built and planted
against an issue with invoices only. H4's refusal of withdrawal over variations was left standing beside
it without being re-examined — although K6's twin check, in the commit before, had removed H4's reason.
The second re-review (L1) executed the variation case: the remedy failed, and the old issue took another
110,000 invoice. L5 found five more sentences still stating superseded rules, including R1.15, which had
contradicted the J10 guard since J10 was built.

**Cost if it had not been caught:** the wrong-document remedy would have shipped working only when no
variation had been recorded — the job that has changed most, which is the one most likely to need it.

**Prevented by:** the walk now exercises withdrawal after full credit with variations present, and the
L1 test executes the exact case. **Nothing mechanical checks that a decision was tested against the
states its neighbours create**; that is what independent re-review found, twice, and stays its job.

### M32 · A lock was described as serialising a race nobody had raced
`Repeat of:` **M28's second half** ("a claim of the form 'no sequence can…' is executed or it is not a
claim"), applied to concurrency one commit later.

`20260927100000_withdrawal_with_variations` said of its new lock: "one waits for the other; the variation
that waits then sees the committed revision and is refused", and the design repeated it. That was an
argument about READ COMMITTED, written in the indicative, and the commit's own "not proved" line admitted
nobody had raced it. The third re-review raced it on real PostgreSQL 16 and found the case it did not
cover: a row lock protects only a row that exists and is visible, so an acceptance and an invoice made
while a seal was open slipped past, leaving money on a superseded revision (N4). PostgreSQL 16 had been
installed on this machine the whole time; the "PGlite is one connection" limit had been repeated for
four reviews as a property of the project when it was a property of the test setup.

**Two more in the same batch, caught before commit, recorded because they are the same defect:**
- **Turbo dropped the environment variables** that tell the new concurrency suite a database is present
  and required. Run through `npm test`, as CI does, `PRYVIS_REQUIRE_PG=1` produced "6 skipped" and a
  green run — the silent skip the variable exists to prevent. Found only by running the guard the way CI
  would; `turbo.json` now declares both.
- **A pre-existing guard is narrower than its title.** "sets the write flag in exactly one place" in
  `documents-core.test.ts` reads only the first Documents migration, while four later migrations
  redefine `issue_balance_apply()` and each sets the flag. True of one file, false of the schema, since
  J2. Not fixed in this batch; recorded as owed.

**Cost if it had not been caught:** a job that can never be billed, reached by two people using the
product at the same moment — and a CI job that would have reported the proof as passing while running
none of it.

**Prevented by:** `new-app/db/test/concurrency.pg.test.ts` against a PostgreSQL 16 service in CI, which
proves each race by observing the second session **waiting on a lock** rather than by timing, and fails
rather than skips when CI's database is missing. Four plants on real PostgreSQL each failed their own
race. **The rule this is evidence for:** a sentence saying a lock serialises something is a claim about
two sessions, and is written as owed until two sessions have been run against it.

### M33 · The lock fix rested on an isolation level it never named, and claimed a lock order it did not have
`Repeat of:` **M32** — a concurrency claim written in the indicative — one commit later, and **M20/M30**
(a guard examining less than it claims) in the races that were meant to answer M32.

`20260927110000_one_lock_per_quote` explained its correctness by "READ COMMITTED gives each statement a
fresh snapshot" and never said the fix *depends* on that. Under REPEATABLE READ the writer waits for the
seal and then judges on its old snapshot; the fourth re-review billed 50,000 onto a superseded revision
with no race at all (P1). The same migration said "the order is always quote lock, then balance row lock,
so no single-quote cycle exists", while the public `issue_balance_apply()` took the row lock without the
quote lock — executed to SQLSTATE 40P01 (P3). And its lock was cluster-wide under a comment saying writes
on different quotes "do not touch the same lock": one tenant could hold, or time, another's (P2).

The races added to prove the fix were weaker than their titles (P4, P5): two waited on the balance row,
not the quote lock, because the wait check accepted any lock; and N4 (a)'s invoice was refused for a
missing balance row, so breaking supersession left the whole race suite green.

**Cost if it had not been caught:** a single `isolationLevel` option in the future application would have
silently restored N4's stuck state, with a CI job reporting the races green.

**Prevented by:** the isolation level is now **enforced** where it is relied on — `quote_money_lock()`
refuses a financial write outside READ COMMITTED — so the assumption cannot be broken silently; the lock is
taken only on a quote visible under row security; `issue_balance_apply()` takes the quote lock first; and
every race names the KIND of lock it must observe, with a failure message saying which lock it saw
instead. Five plants on real PostgreSQL each failed their own race, including the two the old suite missed.
**The rule this is evidence for:** a mechanism that is correct only under a condition enforces the
condition, or it is not a mechanism — writing the condition down is the M32 defect again.

### M34 · The disposition checker reported "every document" while reading a fixed list of names
`Repeat of:` **M20 and M24** — a guard examining a smaller set than its closing line claims — in the
tool that guards Rule 24.6 itself, which review 4 had already said "two passes owed".

`tools/check_dispositions.py` built each finding's scope from `KNOWN`, a regex of nine document names.
Anything else a `Where:` line named — an ADR, a tool, a migration, a test, another review — was not
scope, so a Closed row that never cited it passed, and the tool printed "Every Closed disposition cites
every document its finding named." Review 4's `Where:` lines are almost entirely such paths, so adding it
to `REVIEWS` as it stood would have checked each J finding against `PRD.md` and little else (P7).

Widening the scope to every backticked path found **ten existing Closed rows** in reviews 2 and 3 that do
not cite a path their own `Where:` line names — ADRs 0023 and 0024, `PRD-REVIEW-2.md`, `check_rules.py`,
`rules-manifest.json`, `MISTAKES.md`. Whether each closure is actually incomplete, or merely uncited, is
not known: that needs each one re-audited, not a filename pasted into it.

**Cost if it had not been caught:** a review-4 closure could have passed the Rule 24.6 gate while leaving
the migration or test the finding named untouched — the F1/M13 failure the tool was built to stop.

**Prevented by:** path-level scope, enforced on review 4 and printed as a named, counted legacy list for
reviews 1-3 on every run; the closing line now says which scope it covers. Planted: removing the
migration from J15's Closed row fails the check, naming the path. **Owed:** the audit of the ten legacy
rows, after which their reviews join `WIDE_SCOPE`.

### M35 · Each fix was proved against its finding, not against each property it claimed
`Repeat of:` **M33, M30, M21** — a guard shown to fire, but not for every claim credited to it — and
**M14** in a disposition row.

The P fixes claimed three properties: the quote lock is taken FIRST (P3), each quote has its OWN lock
(P2), and another tenant's request takes NOTHING on either path (P2). The races added were planted
against the defects the fourth re-review had reported, and passed. The fifth re-review planted each
property on its own — the lock taken second, one key for every quote, the visibility check on the
exclusive path only — and all twelve races stayed green through every one (Q3). A test that goes red
for the reported defect had been read as proof of the property the fix claimed.

Alongside it: J2's disposition row credited an amendment to ADR 0025 that no commit had made (Q7) — the
M14 class, a citation to a change that is not there, written by the author into the table built to
stop overclaiming.

**Cost if it had not been caught:** a later change reordering the locks, or collapsing the key, would
have deadlocked or serialised every tenant's quotes behind each other with CI green.

**Prevented by:** partly. Each of the three properties now has its own race, and each was seen to fail
under exactly the plant the reviewer used; `issue_balance_open()` joined the lock and has its own. The
J2 row now points at the amendment that exists. **No mechanism yet makes "one plant per claimed
property" a checked obligation** — a migration header's list of claims is prose, and nothing pairs each
claim with a plant. That is Rule 1.5 applied per property rather than per fix, and it is recorded as
owed, not promised. Independent re-review is what found it, twice in a row.

### M36 · The closing-check brief specified two greps that could not see what they checked
`Repeat of:` **nothing yet, and recorded because it is the first data point for a rule proposed today**
— the owner's point that apparent under-performance by a cheaper model is usually under-specification.

The J4 closing check was delegated to Sonnet with a brief naming every step and its expected output. Two
of the expected outputs were wrong: a single-line `grep` for a sentence that wraps across two lines in
`docs/design/scope-reduction.md`, and a grep for the words "migrations assume", which the corrected
sentence no longer contains. The checker followed the brief exactly, reported both as findings, and then
read the files and confirmed the content was right — it did not improvise, which is what the brief asked.
The brief also listed the files where a false sentence was allowed to remain and missed a third copy, in
`20260927110000_one_lock_per_quote` — which was a real finding (5a), found because the check was literal.

**Cost:** one re-run of the check. Cheap, and the escalation cause is recorded as **brief incomplete**,
not "model too weak": the tier was right and the specification was not.

**Prevented by:** nothing mechanical yet. The owed control is the one proposed on 2026-09-27: a brief is a
file, checked before delegation — and a grep-shaped expectation is itself tested against the current tree
before it is handed over, so an expected output that is already wrong never reaches the agent.

### M37 · M36's prevention was applied, then undone by the next edit
`Repeat of:` **M36**, within the hour — which by Rule 24.4 says M36's stated prevention was decorative as
practised.

M36 said: test every expected output against the tree before handing a brief over. For the re-check I did
— and then wrote a `BRIEF-STATUS.md` entry that quotes the very phrase check A counts, committed it, and
launched without re-running the expectations. The checker found the seventh file, read it, identified it as
a register, and reported it as a finding because the brief said to. It was right to.

**Cost:** one "NOT PASSED" line on a check whose substance passed, and a closure decision the owner had to
make instead of a clean result.

**Prevented by:** the order, stated as the rule it is: **the brief's expectations are executed as the last
step before launch, after the final commit, on the exact HEAD the brief names** — not while the tree is
still being edited. A brief that names a HEAD and was not checked at that HEAD is not a checked brief.
Still not mechanical: it belongs to the brief-as-a-file control proposed on 2026-09-27, which would run
the expectations itself at launch.

### M38 · The replacement guard kept the old guard's silent skip, and its banner said "0 skipped"
`Repeat of:` **M20** (a guard's shape is the defect) and **J1** itself — inside the tool written to fix J1.

`tools/check_schema_citations.py` was built under Rule 21.9 because `check_citations.py` skipped paths in
silence. It carried over the old tool's phrase window: any line within one line of ~30 "denial" phrases
was not checked at all, while the banner printed "0 citations skipped". "Rather than" is house style
here, so 35 of 222 path citations were excused — and one of them was a real defect: `docs/PRD.md` named a
column without its unit suffix, the M19 class, hidden by the sentence it sat in (R11). The same tool read
a column's type as "UUID NOT NULL", which is not "UUID", so every required reference was skipped as a
TEXT label, and it read only single-column keys and never forgot a dropped one (R3). Seven unkeyed
references passed. The money test of the same commit stored its ceiling in a table it created itself,
so it never read a money column (R12).

**Cost:** two blockers' worth of guard that proved less than its banner, found only by an independent
re-review that planted against it. The seven references became R16, a cross-tenant write path.

**Prevented by:** the phrase window is gone from both tools; an absent thing cited on purpose is exempted
by file and name with a reason, printed on every run, and an exemption that excuses nothing fails the run.
Non-UUID `*_id` columns are printed by name. Each claim was planted on its own (M35): 7 plants on the
schema tool, including removing each half of the R3 fix, 4 on the old tool, 6 on the money test. Rule
21.8 and 21.9 restated. The lesson that is not mechanical: **a banner is a claim, and it must count what
the code passes over, not what its author meant it to** — the next guard's banner is checked by a plant
that exercises the skip, not by reading the print statement.

### M39 · The writer list was removed, and restated two paragraphs later, a third time
`Repeat of:` **H2** and **M23** (J12) — the same section, the same fact, the third failure.

J12's fix deleted the writer column from the `issue_balance` table in `docs/design/domain-model.md` and
wrote a paragraph explaining that the list was gone because prose lists go stale. Two paragraphs below,
the same commit stated the writer set again, in prose, twice: "no INSERT or UPDATE policy the application
can satisfy", "the only door", "it cannot go stale", "nothing else ever writes it". Both absolute claims
were false by execution: the balance-write flag is not a secret (R5), and `issue_balance_open()` is not
reached by a trigger (R7). Section 6.2a's opening line ("created unconditionally… cannot be forgotten")
was false the same way. The review-3 H2 row, rewritten by the same fix, went stale when J4 landed.

**Cost:** a major finding re-opened for the third time, and an ADR already amended for R5 and R7 the day
before while the design document beside it still said the opposite.

**Prevented by:** the sentences are gone; `domain-model.md` §6.2a points at ADR 0025 decision 2 for the
mechanism and its limits, and at the J12 block for what each insert moves. **Rule 21.10**: a sentence
saying who may write a table cites the test that executes it, or does not exist. Not mechanical, by the
owner's decision — a phrase guard was rejected as one more deny-list of wordings (R11). The defect itself
(R5) is now owed as `docs/THREAT-MODEL.md` §4e. The lesson: **"we removed the list" is itself a claim, and
the reviewer of a fix that removes prose re-reads the whole section, not only the deleted lines.**

### M40 · A check that could not see its row skipped it, and row security lets the writer choose what is seen
`Repeat of:` none by name; the same family as **M38** (a guard's silent skip).

J11's subtotal check and J6's evidence rules both ran AFTER their row was written, and both skipped a row
they could not see ("the composite key refuses an orphan anyway"). That reasoning holds for another
tenant's row and fails for the writer's own: `RETURNING set_config('app.tenant_id', '', false)`, or a
`set_config` before COMMIT, clears the tenant after the row has passed its policy and before the check
runs. Executed on PostgreSQL 16: evidence on a decline committed (W1, found by the J6-J8 re-review), and
an issue with a 9,999.99 subtotal and no lines was sealed (W13, found by the builder reading W1 — in
J11, which a closing check had already Closed the same day).

**Cost:** two blockers' guards bypassable by the application role, one of them on a finding already
Closed; J11 reopened.

**Prevented by:** both now refuse what they cannot see
(`new-app/db/migrations/20260927190000_rereview_fixes/migration.sql`), each with an executed test of the
bypass; `new-app/db/test/trigger-rules.test.ts` fails if any AFTER trigger function skips UNCONDITIONALLY
on NOT FOUND, in any of the spellings the second re-review used to get past its first version (X4), with
comments stripped (X5), and says what it would miss. The first fix over-reached the other way (X1): it
refused a staff erasure, because for a role that bypasses row security "not found" means "deleted". The lesson: **under row security,
"not visible" is an input the caller controls — a check never treats it as "nothing to check".**

### M41 · No function pinned its search path, so a temporary table could stand in for any real one
`Repeat of:` none by name. Found on the third adversarial pass over J6-J8/J11 (Y2), and widened by the
builder to the ceiling (Y7).

Every trigger and helper function read its tables by unqualified name with the caller's search path, and
PostgreSQL searches the session's temporary schema first for tables. A role with the default TEMPORARY
privilege could shadow `invoice`, `quote_issue`, `acceptance` or the catalogue's `pg_roles`. Executed on
PostgreSQL 16 as the application role: a 9,000,000 invoice past a ceiling of 1,000 (J2, Closed), an issue
with no lines and a subtotal of 555,555 (J11), a deposit on a decline (J6), and the X1 staff skip taken by
a role that is not staff (Y1). Two adversarial rounds and every earlier review read these functions and
did not ask what name resolution they ran under.

**Cost:** the product's central money invariant was bypassable from its own role since the first ceiling
migration; a Closed blocker reopened.

**Prevented by:** every function pinned to `pg_catalog, public, pg_temp`, and TEMPORARY revoked from
PUBLIC (`new-app/db/migrations/20260927210000_pin_search_path/migration.sql`); `new-app/db/test/function-search-path.test.ts`
fails on an unpinned function; the attacks are executed tests, each layer proved without the other; the
production role's provisioning rule is `docs/THREAT-MODEL.md` §4g. The lesson: **a check in the database is
only as good as the names it resolves — review what a function reads, and also how it finds it.**

### M42 · A review was added to the disposition checker's list, and the checker could not read a single row of it
`Repeat of:` M20, M24, M38 — a guard reporting more coverage than it has.

When PRD review 5 was recorded (2026-10-02), the builder added `docs/PRD-REVIEW-5.md` to
`tools/check_dispositions.py`'s list of reviews, and the tool began printing "checked across 5 review files".
But its finding and row patterns were hard-coded to the letters F, G, H and J, and review 5's findings are B
and C: not one heading or row of the new review was parsed. Found by the builder before the first B or C
closure, while computing each finding's scope. Executed: a planted "**Closed.** Fixed." row on B3, citing
nothing, passed the old checker (59 closed, "every Closed disposition cites every document") and fails the
new one.

**Cost:** none realised — no review-5 finding had been marked Closed. Had one been, it would have passed
unchecked, which is exactly the overclaim the tool exists to stop.

**Prevented by:** each review now names its finding letters (`REVIEW_LETTERS`), and a review whose headings do
not parse with them fails the run instead of being counted; review 5 is under the heading and status-wording
checks too. The lesson, again: **adding a file to a guard's list is not the same as the guard reading it —
plant a defect in the new file before trusting the count.**

### M43 · The brief runner ran WSL's launcher instead of bash on Windows, and two setup steps assumed a Linux container
`Repeat of:` none — a portability assumption, not a coverage claim.

The first session on the owner's Windows machine (2026-10-09) found three things that worked only in the Linux
containers earlier sessions had used. `tools/run_brief.py` called a bare `bash`; Windows looks a bare name up in
System32 before `PATH`, and System32's `bash.exe` is WSL's launcher, which with no distribution installed printed
its install notice for every check: "0 of 4 expectations hold" for a brief whose checks were correct. The handoff's
`sh tools/pg-local.sh` needs PostgreSQL 16's Linux binaries and a `postgres` user, which this machine does not have.
And the local `node_modules` lacked `pg`, though the lockfile declares it, so typecheck failed before any change.

**Cost:** about an hour, and no false result: each failed loudly. The race suite did not run in this session; the
session's changes are documents and one tool line, which it does not exercise.

**Prevented by:** the runner now resolves `bash` through `PATH` (`shutil.which`), proved on this machine — the brief
that gave 0 of 4 gives 4 of 4, and a planted wrong expectation fails. `npm ci` restored the install. **Not
prevented at first:** `tools/pg-local.sh` was Linux-only. **Closed the same day at the owner's instruction:** PostgreSQL
16.15's official Windows binaries are unpacked under the user's profile, and the script now handles Git Bash on
Windows (no service, no administrator, trust on 127.0.0.1 only); its first-use, restart and already-up paths were each
run, and the race suite passed 22 of 22 on this machine. The lesson: **a tool that shells out names the shell it means, and a setup step
says which machine it is for.**

### M44 · CI's docs job failed on every run for a week, and every session reported the gate green from local runs
`Repeat of:` M12, M19 — a control reported on from somewhere other than where it ran.

`tools/check_build_plan.py` proves a ticked step's evidence by finding its cited commit. CI's `docs` job checks out
one commit (actions/checkout's default depth), so no cited commit exists there: from A1's tick on 2026-10-02 the job
failed on **every** completed run of this branch — A1 to A5, about a dozen runs — with "cites commit …, which is not
in this repository". Each session ran the five checkers locally, saw them clean, and reported the gate green. Nobody
read CI until the pull request for A1-A5 opened on 2026-10-09 and showed `docs` failing. Reproduced: a one-commit
clone of the branch gives "FAILED: 5 ticked steps without their evidence"; a full clone gives "Every ticked step
carries its evidence".

**Cost:** no wrong result reached a document — the evidence lines were true, and only CI could not see them. But a red
CI that nobody reads is no control: had a real failure joined it in that job, it would have been hidden behind the
known one for a week.

**Prevented by:** the `docs` job now checks out the full history (`fetch-depth: 0`), proved by the shallow and full
clones above and by this pull request's own CI. **Partly prevented:** "read CI after pushing" is vigilance, which Rule
24.5 does not count. The mechanism arrives with OA25: a ruleset that requires CI to pass before anything merges, so a
red job blocks rather than waits to be noticed. Until then, the app's pull-request monitor shows the checks to this
session. The lesson: **the gate is where it runs — a local pass is evidence about the local machine, not about CI.**

### M45 · A6's "mistakes this design is checked against" table repeated the mistakes it listed
`Repeat of:` M13, M15, M29 (a twin left contradicting its sibling), and A5's RR4, RR6 and RR8 — on the day the owner
asked, on starting A6, that "the rule about preventing repetition of mistakes" be kept in view.

A6's draft carried a §13 mapping each recorded mistake to "the line that answers it". The independent read
(`docs/briefs/2026-10-09-messaging-design-read.md`, MR1-MR24) found that most rows promised rather than prevented:
- **RR4's class again**: the design's management keys were missing from the key table, and OP4 kept an old row
  contradicting the new ones (MR11);
- **RR6's**: "SES does not keep the body" was a deciding reason with no AWS page behind it, and the approval commit then
  dropped its "to confirm" in SF7 (MR14);
- **M13's**: the approval commit rewrote OA11 with SES's records only, which made A5's RG6 untrue and left the mailbox
  with no MX record in any owner action (MR16), and left OP2, the data-protection reading and the threat model stale
  (MR24).

**Cost:** none reached a build — A6 is a design, and the read caught each before C1. But an owner who reads a table
headed "the mistakes this design is checked against" is entitled to believe the checks exist.

**What the table was:** a claim about the design, written by its author, in prose — the same shape as the writer-set
prose of M23 and M39. A row that names no command that runs is vigilance (Rule 24.5), however it is laid out.

**Prevented by, for A6:** the closing check's brief greps for each stale phrase the read named, by `tools/run_brief.py`,
on the commit the check reads; and §13 now says, row by row, which answers are mechanical and which are not.
**Not prevented in general.** Two parts of the class remain:
1. **A deferral left standing after its step is decided** ("chosen in A6", "priced in A5") is mechanically findable. A
   checker that fails when a ticked build step is still named in such a phrase is **proposed to the owner** — a small
   tool, planted against before use (Rule 21.2) — and not built without that approval.
2. **A rewrite that deletes something another document relies on** (MR16) has no mechanical guard here. Only the
   independent read (Rule 1.10) and the closing check (Rule 24.6) catch it, and this entry says so rather than
   pretending otherwise. The lesson: **a table of mistakes and answers is a claim, not a control — each row counts only
   when it names a check that runs.**

**And once more, inside the amendments (2026-10-09).** The amended §13 still called two C1 tests — the breaker's and the
cap's race — "executed", and said production's cost "stays within" a total the sum exceeds. The closing check
(`docs/briefs/2026-10-09-messaging-design-closing-check.md`) found both, with four smaller defects (D1-D6). §13 now gives
every row one of three fixed verdicts — **mechanical now** (naming the check), **C1 test** (not yet running), or **not
mechanical** (naming who catches it) — so a row cannot claim mechanism in free words. That is a format, not a guard: a
reader still has to check that a "mechanical now" row names a check that exists.

**Built, 2026-10-10, at the owner's word ("build the checker").** `tools/check_deferrals.py`
(`docs/design/deferral-checker.md`) now fails the gate and CI's `docs` job when a deferral phrase — "chosen in A5",
"priced in A5", "A5 confirms" and the other forms its docstring lists — names a ticked step and its line carries no
quotation, dated pointer or citation of the deciding design. **Its first real run found 13 stale deferrals** — twelve
to A5, in `docs/design/api-layer.md`, `docs/design/environments-and-operations.md`, `docs/design/support-and-feedback.md`
and ADR 0032, and one to A6 in A5's register — each a sentence still calling a decided thing open, after two
independent reads and two closing checks had passed over them. The twelve now carry dated pointers, and the one cites the design that decided it. **And its own first
version was wrong (M21's pattern):** it read the build plan's fenced example line ("- [x] B1 · …") as a tick and reported
B1 done; the banner, which prints the ticked steps, showed it, and the tool now skips fences as `check_build_plan.py`
does. Proved by seven plants, each restored from a backup and compared with `diff -q`. **Still not prevented:** other
wordings, and a deletion another document relied on (MR16) — as the tool's docstring says.


### M46 · Two guards skipped a malformed build-plan line silently, so one wrong character could hide a step from both
`Repeat of:` M20, M34, M38, M42 — a guard checking a smaller set than it reports.

`tools/check_build_plan.py` (built 2026-10-02) matched step lines by one exact pattern and **skipped any other line
without a word**. A tick written `* [x] A5 · …`, `- [x]  A5 · …` (two spaces) or `- [x] A5 - …` was neither counted
nor checked: its missing evidence went unreported, and "Every ticked step carries its evidence" still printed. An
unclosed code fence hid every step after it. `tools/check_deferrals.py`, built 2026-10-10 on the same parsing, inherited
both, and so did its trust in the ticked set: a step that vanished from the plan's parse had its stale deferrals
unchecked too. Found by the deferral checker's independent check (`docs/briefs/2026-10-10-deferral-checker-check.md`),
which tried to break the tool in ways its design did not list; its lower-case backward form ("a6 will confirm") passed
unseen as well.

**Cost:** none realised — every tick in the plan was well formed. But two guards were each one keystroke from silence.

**Prevented by:** both tools now treat a line that looks like a step but is not in the exact form, and a fence never
closed, as a failure — `check_build_plan.py` reports it, and `check_deferrals.py` refuses to run rather than check a
smaller set. The backward form is case-insensitive. Proved by six plants on backed-up copies, each restored and
compared. **The lesson, again: a guard must fail on input it cannot read, never skip it** — "no steps parsed" was
already a failure here; "some steps not parsed" was not.

**Then replaced, not patched a third time (Rule 21.9), 2026-10-10.** The re-check of that fix
(`docs/briefs/2026-10-10-build-plan-tools-recheck.md`) found it **reduced the class, not closed it**: seven more tick
shapes — a lower-case, bold or backticked id, a numbered list, a blockquote, an id outside A-K, no id at all — still
vanished silently from both tools, and the deferral checker's docstring claimed "any other form" stops the run, which
was untrue. The patch had been a second list of shapes. **Replaced by a positive rule and one parser**: any line
outside a fence that carries a checkbox must be a well-formed step or the run fails, and `check_deferrals.py` imports
`check_build_plan.py`'s parser rather than keeping its own copy (Rule 7). The first version of the replacement still let
`[X]` and `[✓]` silence the deferral checker — the box rule lived in the other tool's main loop, not in the shared parser
— and 18 plants found it before commit. Now 18 of 18 behave: every shape fails both tools; a closed tilde-fenced example
and an untouched plan pass. **What remains, stated in the docstring:** a step written with no checkbox at all is not a
step to either tool; the printed count of steps is where it would show.
