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

