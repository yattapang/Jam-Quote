# Second-pass review: the amended PRD and domain model (Rule 1.10, Rule 24.6)

## Disposition, 2026-09-25

Rule 24.6: a row may not claim **Closed** without citing, by file, every document the finding's own
`Where:` line named. `tools/check_dispositions.py` enforces it in CI. Nothing here is closed by
assertion — and closing a blocker earns a **third review**, not a tick.

| # | Sev | Disposition |
|---|---|---|
| **G1** | blocker | **Closed.** `domain-model.md` `variation` row no longer demands its own acceptance and states "release 1 records it; release 2 makes it signable"; `PRD.md` R1.24d states plainly that "recorded" lets a contractor raise their own ceiling, so the invariant protects against mistake and drift, not against intent — rather than reading stronger than it is |
| **G2** | blocker | **Closed.** `domain-model.md` §6.2a and `PRD.md` R1.24a: the `issue_balance` row is created **in the acceptance transaction, unconditionally**, because a `FOR UPDATE` on zero rows takes no lock; the writer set is closed and named; every writer re-sums from the rows inside the lock rather than trusting the cache |
| **G3** | blocker | **Closed.** `domain-model.md` §4 rewritten — "allocate at sync" is the release-1 choice and the old "Quote #pending" objection is named as false reasoning from a conflation; `PRD.md` §4 and R1.14 already carried the split |
| **G4** | blocker | **Closed.** `domain-model.md` §8 and §6.3, plus `PRD.md` R1.18c: sealing **claims the quote**, one sealed issue per (quote, revision) by unique index, the second device refused rather than merged and its snapshot kept |
| **G5** | major | **Closed.** `domain-model.md` §8 adds the "sealed, awaiting number" state machine node, the blocked-not-lost rule, the prohibition on retention deleting an unsynced seal, and the full re-check list at sync; `PRD.md` R1.32a covers the cross-month case |
| **G6** | major | **Closed.** `domain-model.md` §6.1a and `PRD.md` R1.13a give `catalog_synced_at` a reader: staleness shown, a default 7-day warn-before-proceed, printed on the internal copy, never blocking a seal |
| **G7** | major | **Closed.** `domain-model.md` `acceptance` row and `PRD.md` R1.20 both now reference the `document_render` hash instead of carrying their own |
| **G8** | major | **Closed.** `PRD.md` R1.15 is bounded to un-accepted issues and R1.15a adds withdrawal before any invoice exists; `domain-model.md` §6.3 adds both the newly impossible transition and the newly possible one |
| **G9** | major | **Closed.** `PRD.md` R1.30e defines the pending claim, the 72-hour expiry and the both-verify race; **`RULES.md` Rule 14 is amended** to say "one tenant per verified address" instead of leaving the PRD to interpret it, which is what Rule 23 requires; `domain-model.md` already stated global uniqueness |
| **G10** | major | **Closed.** `PRD.md` R1.8 names all four parameters (device, cold state, network, what counts) and R1.42 makes §10's instrumentation a requirement |
| **G11** | major | **Closed.** `PRD.md` R1.30d replaces the bound with a loose attempt limit, verification doing the real work and a cost ceiling; **`RULES.md` Rule 14 amended** to remove the bound it had asked for, with CGNAT as the stated reason. **Device fingerprinting removed** |
| **G12** | major | **Closed.** `domain-model.md` §6.2a with `PRD.md` R1.24b and R1.24e: `accepted_total` has one named producer and is safe only because the issue is immutable; the reconciliation job is nightly, audits, alerts, refuses further invoicing, and does not self-heal |
| **G13** | major | **Closed.** `domain-model.md` §8 adds sync rows for `variation` and `issue_balance` (server-only), and `PRD.md` R1.22f states that a device never decides how much may be billed |
| **G14** | major | **Closed.** `THREAT-MODEL.md` §4a covers the phone as a trust boundary, the share page's revocation problem, the forgeable signed copy and the code channel; **`domain-model.md` §8 no longer claims a remote sign-out wipes the outbox** — it cannot reach an offline device, which the checker caught as a false control still standing; `PRD.md` R1.18f carries it into the requirements |
| **G15** | minor | **Closed.** `PRD.md` §6: N3 is precise about `issue_balance` being updated and deliberately not a document; N1/N4/N5/N9/N10 each name an instrument, and where none exists (sunlight legibility) the row says a person does it |
| **G16** | minor | **Closed.** `PRD.md` R1.22e renumbered to R1.21a, in the workflow it belongs to |
| **G17** | major | **Closed.** `PRD.md` R1.20-R1.20d carry ADR 0024, including the e-signature correction; `TIERS.md` and `site.ts` amended for ADR 0023 and F5/F6 |

**Also closed from the first review, by this pass:** F1 (G3), F2 (G10), F3 (G1, G7), F4 (G2, G12, G13),
F12 (G9, G11), F17 (G7) — the six that had been reopened. **F5 and F6 are now closed too**, by the owner's
decision to mark undelivered features with the release they land in, and `site-guards.test.ts` asserts it
with two planted failures proving it fires.

**What is NOT claimed:** that these amendments introduced nothing. Four of five blockers in the last pass
were created by the previous amendments, and there is no reason to assume this pass is different. That is
what the third review is for.

**What this is.** The first review (`PRD-REVIEW.md`) produced 19 findings. The author amended both
documents in commit `8c2faae` and the disposition table claims five of six blockers closed. This pass
does two things: it **checks that claim** rather than trusting it (Rule 21.1 — a disposition that
overstates what changed is the same failure class as a control that overstates its coverage, and M3 and
M14 are both that shape), and it attacks **what the amendments introduced**. I did not write the
amendments and I did not write the first review.

Findings are numbered **G1…** so they never collide with the F-numbers, and are appended as they are
found (Rule 1.10). Severity as in the first review: **blocker** = building this part as written
produces something wrong or unsafe · **major** = real rework later · **minor** = cheap to fix ·
**question** = only the owner can answer.

**Commands run** (evidence, Rule 21.7 — a conclusion without what I read is failed work):

```
git log --oneline -3
git show --stat HEAD
git show HEAD -- docs/design/domain-model.md
git show HEAD -- docs/SERVICE-REGISTER.md docs/BRIEF-STATUS.md
cat docs/RULES.md                                    # in full (Rule 0); 0, 1.1-1.10, 6-14, 21 read closely
sed -n '1,240p;240,447p' docs/PRD.md                 # in full
sed -n '100,160p;265,300p;340,370p;395,454p' docs/design/domain-model.md
grep -n "lease\|number_series\|offline\|Offline" docs/design/domain-model.md
sed -n '1,120p;735,796p' docs/PRD-REVIEW.md          # disposition table, verdict, scope limits
sed -n '/^## F4 /,/^## F5 /p' docs/PRD-REVIEW.md
grep -n -i "offline\|outbox\|device\|seal" docs/THREAT-MODEL.md
```

No tests were run, nothing was installed, and nothing outside this file was modified.

---

## G1 · In release 1 no variation can ever raise the ceiling, because R1 has no variation acceptance — so either F3 is not closed or R1.24 has been gutted — severity: blocker

**Where:** `PRD.md` R1.22a-d, R1.24; `design/domain-model.md` §6.2a opening line, §6.2 `variation` row

**The claim under attack:**
R1.24: *"The sum of issued invoices against an accepted issue may never exceed its **accepted total
plus recorded variations** (R1.22b)."*
R1.22b: *"Recording one **re-derives the accepted total** for that issue, which is what R1.24 measures
against."*
Domain model §6.2a: *"the sum of issued invoices against an accepted issue may never exceed the accepted
total, plus **accepted** variations, where those exist"* — and its mechanism step 3 refuses if the new
total would exceed *"`accepted_total + variations_total`"*.
R1.22d: *"R1 has **no client signature on a variation**; that is R2."*

**Why it does not hold.** The two amended documents use two different words for the same term of the
same formula, and the difference is the whole invariant:

- The PRD's ceiling is *accepted total plus **recorded** variations*. A variation is recorded by the
  contractor alone (R1.22d). So in R1 **one party can raise the invoiceable ceiling unilaterally, with
  no counterparty act of any kind.** R1.24 then protects nothing it did not already protect: the
  constraint "you may not bill more than was agreed" becomes "you may not bill more than you have
  typed", which any over-biller satisfies by typing. R1.24's own claim to be *"the most important
  arithmetic invariant in the product"* does not survive that.
- The domain model's ceiling is *accepted total plus **accepted** variations*. R1 builds no variation
  acceptance. So under the approved model's wording, `variations_total` is **always zero in R1**, the
  ceiling never moves, and the client-adds-a-gate case that F3 declared unrepresentable is **still
  unrepresentable** — the variation can be recorded and can never be invoiced.

Both readings cannot be built. One of them makes F3's closure void; the other makes F4's closure
cosmetic. The disposition table claims both closed, in the same change, and the contradiction is
between the two documents it amended — which is precisely the failure that produced F1 and is logged as
M13.

There is a third problem inside R1.22b independent of that. **Re-derives from what?** The "accepted
total" is not a stored quantity with an owner in either document. It is a property of `acceptance`,
which R1.20 declares *"immutable"*, against `quote_issue`, which R1.13 declares has *"no column ever
updated"*. A variation cannot re-derive a value that lives on two immutable rows. The only place it can
land is `issue_balance.variations_total` (§6.2a), which is a **cache** — so the sentence "re-derives the
accepted total" names a mutation of the one number the design says is frozen, and the actual write goes
to the row that §6.2a insists is not a source of truth.

**What it would cost if built as written:** a builder implements R1.22b as `UPDATE issue_balance SET
variations_total = …`, ships R1.24 green, and the product's headline money protection is a check against
a number the biller controls. The failure is not a crash; it is a contractor billing $1.4M against a
$900k accepted quote with an audit trail that says the system allowed it. That is worse than having no
invariant, because R1.24a's lock and R1.24c's planted-defect tests will all pass and be quoted as proof.

**Suggested resolution:** decide, in one change, in both documents, what an R1 variation *is* in the
ceiling:
1. **Recommended:** in R1 a recorded variation does **not** move the ceiling; it is captured, priced and
   shown, and invoicing above the accepted total requires a **counterparty act** — the cheapest one being
   a second acceptance on the variation reusing W5's share link (R1.19/R1.20 already build it; this is
   the "expensive half" F3 deferred, and F3 may have deferred the wrong half). State plainly that until
   then the client-adds-a-gate case ends in a **new quote for the extra work**, which is what
   contractors do today and which R1 can already represent.
2. Or accept the unilateral raise explicitly, delete the words *"most important arithmetic invariant"*
   from R1.24, and say in the PRD that R1's ceiling is a **typo guard, not a protection of the client** —
   and record that as a decision with the owner's name on it, because it is a decision about someone
   else's money.
Either way, replace R1.22b's "re-derives the accepted total" with the name of the row that actually
changes, and amend the model's `variation` row and §6.2a's "accepted variations" in the same commit.

## G2 · `issue_balance` has no creator, and `SELECT … FOR UPDATE` on a row that does not exist locks nothing — F4's mechanism has a hole exactly where F4 was — severity: blocker

**Where:** `design/domain-model.md` §6.2a steps 1-4; `PRD.md` R1.24a, R1.24b

**The claim under attack:** §6.2a: *"Issuing an invoice is one transaction that: 1. takes `SELECT …
FOR UPDATE` on the issue's `issue_balance` row — which **serialises every concurrent attempt against
that issue**"* … *"a lock on one named row is cheap, obvious in review, and **cannot be forgotten by a
query written later**, because the invoice cannot be inserted without passing through it."*

**Why it does not hold.** Neither document says **who creates the `issue_balance` row, or when.** That
is not a detail; it is the mechanism's only load-bearing assumption. In PostgreSQL, `SELECT … FOR UPDATE`
that matches **zero rows takes no lock at all** — it is not an error and it is not a gate. So:

- If the row is created lazily by the invoice path, the first two concurrent invoices against a
  newly accepted issue both find no row, both lock nothing, both compute a total from an empty base, and
  both insert. **The one scenario R1.24c names as its test — "two concurrent invoices" — is the one the
  mechanism fails**, and it fails on the *first* pair, which is also the most likely pair (a deposit
  invoice double-submitted on a flaky mobile connection).
- If the row is created at acceptance, then acceptance owns a money row, nothing in the model's
  `acceptance` invariants says so, and an issue accepted **before** this feature ships — or accepted by
  an offline-replayed path, or backfilled from the old application (§5 of the audit) — has no row and is
  permanently un-invoiceable, or falls into the lazy case above.
- If the row is created by the reconciliation job (R1.24b), the window between acceptance and the next
  job run is a hole with no lock in it.

The sentence *"cannot be forgotten by a query written later"* is therefore true only of a row that
exists, and nothing guarantees that. §6.2a claims the same shape as `number_series` allocation, but
`number_series` has a row per tenant per kind created at tenant setup with a stated invariant ("one per
tenant per document kind"); `issue_balance` has no equivalent sentence anywhere.

Secondly, the claim that the lock *"serialises every concurrent attempt against that issue"* is only
true of attempts that **go through this code path**. A credit note, a manual correction, the
reconciliation job's own write, and the R1.22b variation write all touch the same numbers and none of
them is named as taking the lock. R1.24c even names *"a variation landing between the read and the
write"* as a test — a test that can only pass if the variation path takes the same lock, which no
requirement says it does.

**What it would cost if built as written:** the invariant the PRD calls most important is enforced by a
lock that is absent in exactly the state where it is first needed, and the planted-defect tests
(R1.24c) will be written against a *seeded* balance row, so they will pass and certify the hole. This is
M3's shape at the schema level: a control that fires correctly on the wrong precondition (Rule 21's own
"What Rule 21 does not fix").

**Suggested resolution:** three sentences in §6.2a and one requirement:
- **`issue_balance` is created in the same transaction as the `acceptance` that creates the ceiling**,
  with a unique index on `quote_issue_id` — so it exists before any invoice can reference it, and its
  creation is as serialised as the acceptance (which is already "first write wins, a second is refused").
- The invoice path uses **`INSERT … ON CONFLICT DO NOTHING` then `SELECT … FOR UPDATE`**, or an upsert
  that returns the locked row, so a missing row is a lock rather than a no-op. State the SQL shape;
  "takes a row lock" is not specific enough to review.
- **Name every writer.** One sentence listing which paths must hold the lock: invoice issue, credit
  note, variation record, reconciliation rebuild. A lock with an unenumerated set of writers is not a
  lock.
- Add to R1.24c a planted defect for **the missing row**: delete the balance row, fire two concurrent
  invoices, watch them both succeed. Under Rule 21.2 that is the test that proves the mechanism, and it
  is the one the current text would not have written.

## G3 · The domain model still says allocate-at-sync was **Rejected** and device leases are **Chosen** — §4 was not amended, so F1's contradiction now lives inside one document instead of between two — severity: blocker

**Where:** `design/domain-model.md` §4, `number_series` paragraph (lines ~110-123) vs the new §6.1a
(lines ~166-199); `PRD.md` §4

**The claim under attack:** §6.1a: *"the owner's requirement is what resolved it … separating them
dissolves the contradiction"*, with the Number act *"**Yes** in R1"* (PRD) / *"**Yes**, or a device lease
(deferred)"* (model). Disposition: *"**F1** … **Closed.**"*

**Why it does not hold.** §4 of the same document, untouched by the commit, still reads:

> *"- Allocate at sync. Simple and safe, but the client sees "Quote #pending" on the PDF, which
> undermines the one document the product exists to produce. **Rejected.** … - **Chosen: device number
> blocks.** A device leases a contiguous block from the series while online (default 50). Issuing offline
> consumes from the lease. … That last sentence is the decision, and it deserves its own ADR."*

So the approved model, read front to back, **rejects in §4 the exact mechanism it adopts in §6.1a**, and
names device leases as "Chosen" where §6.1a and the PRD both defer them. The schema step is built from
this document (§10: *"The physical schema … comes from the target-schema step, after this is approved"*),
and §4 is where a builder goes for numbering, because that is where the options are weighed — §4 is
titled for it and §6.1a is four sections later.

This is not a stylistic omission. The first review's own suggested resolution named this text
specifically: *"§4's 'Chosen: device number blocks' annotated that R1 allocates online only while the
column shape is designed now so R2 is additive."* That instruction was not carried out, and the
disposition table records the finding as closed without mentioning it. Three further consequences:

1. **§4's rejection reason is never answered.** It rejected allocate-at-sync because *"the client sees
   'Quote #pending' on the PDF"*. §6.1a's answer is implicitly that no PDF exists before numbering ("not
   deliverable until it has an `issue_number` row"). That is a good answer — but it is nowhere written as
   the reversal of §4's reasoning, so a reader who trusts §4 will build a pending-numbered PDF, which is
   the outcome §4 correctly calls unacceptable.
2. **§11 is stale in the same way:** *"If issuing offline proves rare in practice, the number-lease
   complexity is unearned and allocate-at-sync was the right answer after all."* R1 has no lease
   complexity to be unearned and allocate-at-sync is now the R1 answer, so the document's own "what would
   make this design wrong" section tests a decision the document no longer makes — and that section
   exists precisely to give a reviewer something to aim at.
3. The ADR §4 says the decision *"deserves"* does not exist (Rule 1.6: significant choices recorded as
   dated ADRs). The seal/number/deliver split is a larger decision than the one §4 wanted an ADR for, and
   it is currently recorded only in a commit message, a PRD section and M13.

**What it would cost if built as written:** the schema step reads §4, designs `number_series` with lease
columns and lease expiry, and R1 ships the two-month component PRD §4 says it is deliberately not
building — or the builder notices the disagreement and picks whichever is nearer the code they are
writing, which is vibe coding with a paper trail. Either way the review gate is discredited, because the
document that says "closed" is the document that still disagrees with itself.

**Suggested resolution:** amend §4 in the same change, not a later one: mark the three-option comparison
as **superseded by §6.1a**, keep the options as the record of reasoning, say in one line that R1 chooses
allocate-at-sync *because nothing is rendered before numbering, which is what answers the "#pending"
objection*, and move "Chosen: device number blocks" to "**R2** candidate, with the gapless trade-down
stated in §6.1a". Rewrite §11's lease bullet. Raise the ADR §4 asks for, covering the split rather than
the leases. Until §4 is amended, F1 is **open**, not closed.

## G4 · Two devices can seal the same quote, and §8 says that "cannot conflict" — the two-documents-one-identity failure F1 existed to prevent is now reachable in R1 with no lease at all — severity: blocker

**Where:** `design/domain-model.md` §8 rows for `quote` and `quote_issue`, §6.1a; `PRD.md` R1.18, R1.18a,
R1.14, §11 risk 5

**The claim under attack:** §8: `quote_issue` · Offline: *"**seal** (no number yet)"* · On conflict:
*"**Never conflicts** — append-only by construction. Pushes as-is, or fails loudly."* And the row above
it: `quote` draft + lines · Offline: *"full edit"* · *"**Merge by line**, with a review step when both
sides changed one line."*

**Why it does not hold.** "Append-only by construction" means *a row is never modified*. It does **not**
mean *only one row can be created per quote*. The model explicitly supports one draft being edited on
more than one device — that is what "merge by line" is for — and R1.18 makes sealing available on any
device with no signal. So:

- Delroy seals the fence quote on his phone at the gate. His foreman, holding the same synced draft,
  seals it on the tablet an hour later. Neither device can see the other.
- Both push. Both are valid, immutable, append-only `quote_issue` rows for one `quote`.
- The server allocates an `issue_number` row for each, because §8 says `issue_number` is *"one row per
  issue, unique per series"* — unique **per issue**, which is exactly what both of these are.
- The tenant now holds **two numbered, immutable quotes for one job with different totals**, and R1.15's
  revision chain does not describe them: neither supersedes the other and both claim to be v1. If the
  client is sent one and accepts, and the other is later invoiced against, G1's ceiling is computed from
  whichever `issue_balance` row exists.

Weigh this against the amendment's own argument. PRD §4 says R2's leases are *"a trade-down on the
property an accountant cares about"* because they create gaps, and PRD §11 risk 5 defers offline issuing
*"precisely because getting it wrong means two documents with one identity, which is unanswerable to an
accountant."* **The split reintroduces two-documents-one-identity in R1**, without leases, by a much more
ordinary route than a lease collision: two devices and one draft. A gap is a question with an answer;
this is the one the PRD itself calls unanswerable.

Numbering at the server does not catch it, because numbering is per *issue*. Neither document states the
invariant "at most one live issue per quote per revision", and nothing gives the server a rule for the
second arrival.

**What it would cost if built as written:** rare but unbounded, and unfixable after the fact because both
rows are immutable by design — the only remedy is a superseding record that R1 has for invoices
(`credit_note`) and not for quotes. It surfaces as two numbers against one job in the accountant's
export, or a client holding a quote the contractor cannot find.

**Suggested resolution:** make the seal a claim on the draft, not only an insert.
- State the invariant in §6.1a and §6.3: **one live issue per (quote, revision)**, enforced by a unique
  index on `(quote_id, revision)` on `quote_issue`.
- Say what the server does with the loser at sync. It cannot be "fails loudly" and nothing else: the
  device holds an immutable document the user believes is real. Recommended: the second seal is stored
  with a rejected-at-sync status, never numbered, and the user is shown which one won and both totals.
  Losing a seal silently is the same class of harm as discarding a line, which §8 already forbids for
  drafts.
- Add the seam test: seal one draft on two simulated devices, sync both, assert exactly one
  `issue_number` row and a readable loser. Plant the defect by dropping the unique index (Rule 8, 21.2).
- Or, if one device per tenant is the R1 assumption, **write that sentence in §8** and the finding reduces
  to a documented limit. It does not currently exist; §7's "Users: 1" is a seat count, not a device count,
  and the same user with a phone and a tablet is the ordinary case.

## G5 · A sealed issue that is refused a number has no defined outcome — and R1.32's server-side monthly limit guarantees it will happen — severity: blocker

**Where:** `PRD.md` R1.18, R1.18b, R1.32, §8a.1; `design/domain-model.md` §6.1a, §6.3, §8 (entitlements
row)

**The claim under attack:** R1.18: *"**Sealing works with no network** … **Numbering and delivery happen
at sync.** A sealed, unnumbered issue is shown as 'awaiting number' and is never presented as sent."*
§6.1a: *"'Sealed, awaiting number' is a real state the app shows plainly."* R1.32: *"Free tier limit: 3
new jobs quoted per calendar month, **enforced server-side**."* §8a.1 recommendation: *"count distinct
jobs **numbered** in the month."* §8: Entitlements · *"cached with a **grace period** … Server wins on
sync."*

**Why it does not hold.** Both documents describe sync succeeding. Neither describes a **refusal**. All
of these are reachable in R1 and none has an answer:

1. **The free-tier limit, and the calendar month is the trap.** A Free tenant offline seals four jobs —
   the cached entitlement allows it, because the server only wins *later*. At sync the server refuses the
   fourth. The device now holds an immutable financial snapshot that can never be numbered, never
   delivered, and never edited (R1.13: no column is ever updated). What does the app do with it? Worse:
   with §8a.1's recommendation the meter runs on **numbering**, so three jobs sealed in January and
   synced in February count against **February**, and a contractor who works a week offline can have a
   month's sealed work land in one month and be refused. R1.18b's own warning ("unsynced for more than a
   stated number of days") shows the design *expects* multi-day offline periods, while the limit is
   calendar-month — the two requirements are on collision course by construction.
2. **Subscription lapsed or tenant suspended** between seal and sync. Suspension is *"a field, not a
   deletion"*; nothing says whether queued seals are numbered on reinstatement, refused, or held.
3. **The draft was edited elsewhere.** Harmless for the snapshot, but R1.12's draft is versioned and
   merged, so after sync the draft and the sealed issue disagree and no requirement says which one the
   contractor is looking at, or whether a sealed issue freezes further editing of its draft.
4. **The client was soft-deleted** on another device before numbering. R1.3 protects clients named on an
   *issued* quote; this one was not issued when the deletion happened.
5. **The catalog price changed** — see G6.

Underneath these is a question neither document asks: **what is a sealed, unnumbered issue *for*?** It is
not a draft (immutable), not an issued document (no number, not deliverable), and `quote_issue` carries no
status column by construction. §6.3's state machines do not contain the state at all — the quote machine
still reads `draft ──issue──▶ issued`, with no "sealed, awaiting number" node and no transition out of
it. So the state R1's whole offline story rests on is **absent from the section that enumerates and tests
impossible transitions.** Legally it is the weakest artefact in the product: a frozen price the
contractor may have committed to verbally at the gate, that the system will not stand behind, and no
requirement says what Delroy may tell the client about it or what the UI calls it beyond "awaiting
number".

**What it would cost if built as written:** the first Free tenant who works a day offline gets an
unresolvable row, and the support answer is "we cannot fix it and we cannot delete it either". More
likely, the builder resolves it the obvious way — delete the sealed row, or make the number nullable
after all — and the immutability argument §6.1a is built on is discarded in a bug fix.

**Suggested resolution:** three additions, all cheap now.
- **Name the state in §6.3** with transitions in and out: `sealed ──number──▶ issued` and
  `sealed ──refuse──▶ void_unnumbered`, the void recorded with a reason code rather than deleted (the row
  is immutable). The impossible-transition list then gains "delivering an unnumbered seal" and "numbering
  a voided seal", which are testable.
- **Decide the entitlement question with the owner and write it down.** Either the limit is **checked at
  seal time against the cached entitlement** — refusal happens at the gate, where the contractor can act
  on it, and the server honours a seal it authorised — or sealing is unlimited and only numbering is
  metered, in which case R1.32's *"clear, non-punitive message"* must be deliverable hours later about
  work already promised to a client, and §8a.1 needs a rule for seals from a previous month.
  **Recommended:** meter at seal, against the cached entitlement, and attribute the count to the **seal
  month**. Say out loud that this weakens R1.31's "enforced on the server" for this one limit — a cached
  entitlement decision is a client decision with a server audit, which R1.31 as written forbids
  (*"The client may ask; it may never decide"*). That conflict is currently invisible and is the sharpest
  edge the seal/number split introduced.
- **State the sync refusal matrix** as a small table in §8 beside the `issue_number` row: suspension,
  lapsed entitlement, deleted client, limit, each with its outcome. Four rows of prose; without them the
  builder invents them.

## G6 · `catalog_synced_at` is recorded and nothing anywhere acts on it — "visible rather than deniable" is an invariant with no owner, introduced by an amendment closing one — severity: major

**Where:** `PRD.md` R1.13; `design/domain-model.md` §6.1, §6.1a Seal row

**The claim under attack:** R1.13: *"and `catalog_synced_at` — the last time those prices were refreshed,
**so a stale price is visible rather than deniable**."* §6.1 repeats it almost word for word.

**Why it does not hold.** Storing a timestamp makes staleness **recorded**, not **visible**, and nothing
in R1 *acts* on it. Search both documents: no requirement shows it to anyone, compares it to anything,
warns on it, refuses on it, or puts it on the PDF.

- **Visible to whom?** Not the client: R1.16 fixes what the PDF carries (logo, header details, two brand
  colours from `document_settings`) and this is not among them. Not the accountant: R1 has no export.
  Not Delroy at the gate: no requirement surfaces it in the pricing screen, and R1.8's 60-second budget
  argues against a banner nobody specified.
- **Nothing thresholds it.** A seal carrying prices refreshed six weeks ago is indistinguishable, to
  every R1 code path, from one refreshed six minutes ago. R1.18b warns about **unsynced seals** by age;
  nothing warns about a **stale catalog** by age, and they are different clocks — a device can push its
  outbox daily and still hold a month-old catalog, since §8's directory row says *"Server wins on fields"*
  without saying how often a pull happens or whether the app can tell you it has not pulled.
- **The commercial risk it is sold as mitigating is untouched:** a contractor quoting at last month's
  cement price. The snapshot correctly freezes the old price — that is a statement about the snapshot, not
  about anybody finding out. A field no code reads mitigates nothing. It is exactly the shape Rule 1.10
  calls an invariant with no owner, added by an amendment whose purpose was to close one.

**What it would cost if built as written:** a column in the most important table in the product that
nothing reads, carried through the migration and every later review of that table, plus a sentence a
future dispute will be answered with ("the system records staleness") when nobody was ever shown it —
a Rule 21.1 over-claim living inside a requirement.

**Suggested resolution:** give it a reader or change the justification. Cheapest version that earns the
column: one requirement — *the pricing screen and the seal confirmation show the catalog's age when it
exceeds a configured threshold (default 7 days), and the sealed issue's detail view shows
`catalog_synced_at` beside the totals* — with the threshold as data, not a constant (Rule 14's shape). If
the owner will not spend pixels in the 60-second path, keep the column and reword R1.13 to what is true:
*"so staleness is answerable after the fact"*, naming the reader (the tenant's own issue detail and audit
view) and saying explicitly that it is **not** shown to the client.

## G7 · The model's `variation` and `acceptance` rows were not amended, so the model still requires exactly what the PRD now forbids — the amendment repeated the mistake it was fixing — severity: major

**Where:** `design/domain-model.md` §6.2 `variation` row and `acceptance` row; `PRD.md` R1.22a-d, R1.20,
R1.16a

**The claim under attack:** the commit message: *"fixing F1 alone would have repeated the mistake that
caused it — amending one document and leaving the other to disagree."* The unamended `variation` row: *"A
change to accepted work … with its own price and **its own acceptance**. First-class, not a new quote. …
a variation **must be signable on its own** so 'who agreed to the extra $40,000' has an answer."* The
unamended `acceptance` row: *"Records typed name, timestamp, IP and user agent, **and its own PDF
hash**."*

**Why it does not hold, twice.**

1. **Variations.** PRD W6a adds a variation with no signature, no acceptance and no PDF in R1 (R1.22d:
   the UI *"must not present a recorded variation as client-accepted"*). The model says a variation *must*
   be signable on its own and gives that as the reason it is first-class. Nothing in the model was touched
   for F3: the §6.2 diff adds `quote_section`, rewrites `quote_line`, and leaves `variation` exactly as it
   was. So the scope change the commit message asks the owner to notice exists in one document only, and
   the schema step will either build variation acceptance in R1 (the expensive half F3 deferred, so the
   release slips on work declared out of scope) or build the PRD's version against a model whose key
   invariant says it is incomplete. This is the M13 shape, in the commit that logs M13.
2. **The PDF hash, which the table claims closed as F17.** R1.16a: *"The rendered PDF's hash is recorded
   **once**, on `document_render`, and the issue and any acceptance **reference that row** rather than
   each storing their own copy (F17 — it had been specified twice, differently)."* But **R1.20 still
   says** acceptance records *"a typed name, timestamp, IP and user agent, **and its own PDF hash**"*, and
   the model's `acceptance` row says the same. Only §6.1's `quote_issue` paragraph was corrected. The
   duplication F17 reported therefore survives in **two of the three places it was reported in**, one of
   them the requirement a builder implements — and the disposition says closed. F17 is a minor finding; a
   disposition that says "closed" about text that still reads the old way is not minor, because it is the
   third such overstatement in one table (G3, G10).

**What it would cost if built as written:** either variation acceptance in R1, or an `acceptance.pdf_hash`
column R1.16a says must not exist — two hashes to keep equal, and R1.16a's *verification on re-serve*
with two candidate sources and no rule for which wins when they differ.

**Suggested resolution:** in the model, in one change: mark the `variation` row *"R2 for its acceptance;
R1 records a priced variation with no client act (PRD R1.22a-d)"* and move "signable on its own" into that
R2 clause. Delete *"and its own PDF hash"* from the `acceptance` row **and from R1.20**, replacing both
with *"a reference to the `document_render` it accepted"*. Then correct the disposition: F17 is
half-closed until R1.20 changes.

## G8 · R1.22c refuses what R1.15 and §6.3 still promise, and it removes the only way to correct a mistake on an accepted issue — severity: major

**Where:** `PRD.md` R1.22c, R1.15, N3; `design/domain-model.md` §6.3 state machines, §6.1 closing
paragraph

**The claim under attack:** R1.22c: *"Revising an **accepted** issue is refused in R1. The path is a
variation, not a new issue — which prevents the two-accepted-issues state the model tests as
impossible."* R1.15, unamended: *"A revision is a **new issue** at the next revision number; the previous
one is marked superseded and remains readable exactly as sent."* §6.3, unamended: *"quote: draft ──issue──▶
issued ──▶ superseded (by a later revision)"*, and the impossible-transition list is *"editing an issue;
accepting a superseded issue; accepting twice; invoicing a declined issue; invoicing past the accepted
total; recording a payment against a draft invoice; releasing retention twice."*

**Why it does not hold.**

1. **R1.15 is stated without qualification** and R1.22c contradicts it for the accepted case. Neither
   requirement references the other; a builder implementing W4 reads R1.15, builds revision-of-anything,
   and only a reader who reaches W6a learns of the restriction. One of the two must carry the exception in
   its own text. (Rule 7's spirit: one rule, one place.)
2. **The new impossible transition is not in the list that enumerates impossible transitions.** §6.3 is
   where the model says which transitions *"must be impossible, and are therefore tested"*. "Revising an
   accepted issue" is not there, and `issued ──▶ superseded` is still drawn unconditionally. So R1.22c's
   claim to *"prevent the two-accepted-issues state **the model tests as impossible**"* cites a test the
   model does not describe. That is a coverage claim about a control that does not exist yet (Rule 21.1),
   in the requirement whose job is to close a blocker.
3. **It leaves no path for a genuine error that is not a price change.** A variation fixes *scope and
   money*. It does not fix: the wrong client on the document, a misspelled address, the wrong terms
   wording, a wrong tax treatment on a line, or a wrong expiry — all of which are frozen at seal (R1.13)
   and all of which happen. Before R1.22c the answer was "issue a revision"; now the answer for an
   accepted issue is nothing at all, and the document is immutable. The realistic outcome is that the
   contractor **re-quotes the whole job as a new quote**, and the acceptance, the invoices and the
   `issue_balance` on the old issue are orphaned with no link to the replacement.
4. **It interacts with G4.** If two seals can exist for one quote (G4), "the two-accepted-issues state" is
   reachable without any revision at all, so R1.22c does not close the hole it claims to close.

**What it would cost if built as written:** either the restriction is not built (R1.15 wins, and F3's
closure is void because two accepted issues become reachable again), or it is built and support inherits
every typo on an accepted quote with no remedy but a parallel quote and a manual note.

**Suggested resolution:** put the exception in R1.15's own text (*"…except an issue that has been accepted;
see R1.22c"*), add the transition to §6.3's impossible list and draw the accepted branch as terminal, and
add one requirement for the case a variation cannot serve: **a correction that supersedes an accepted issue
carries the prior acceptance forward by reference, or is refused outright and the reason stated in the
UI.** Pick one and write it; silence here is where a builder guesses.

## G9 · R1.30b quietly weakens the global email uniqueness the model and ADR 0022 rest on, and collides with Rule 14's single-transaction registration — severity: major

**Where:** `PRD.md` R1.30a-c; `design/domain-model.md` §4 `user` row, §11a; `RULES.md` Rule 14

**The claim under attack:** R1.30b: *"So an unverified registration **reserves nothing**: the address is
claimed only when verified, and unverified attempts expire."* Model `user` row, unamended: *"**Email
unique globally**, which is what enforces the owner's rule that a second business needs a second
address."* Rule 14: *"Registration creates the tenant, its first owner, and a **Free subscription in the
same transaction**: a tenant never exists without a plan."*

**Why it does not hold.** R1.30b is the right instinct — an unverified claim must not lock out the real
holder — but as written it changes an invariant in another document without amending it, and leaves the
resulting mechanics undefined.

1. **"Unique globally" and "reserves nothing" are not compatible as stated.** A plain unique index on
   `user.email` reserves the address the moment the row exists. To make an unverified attempt reserve
   nothing you need either a **partial unique index over verified rows only** (so several unverified rows
   share one address) or a **separate pending-registration table** with no `user` row at all. These have
   different consequences and neither is named. The model's one-line invariant is what §11a says enforces
   the owner's ADR 0022 answer, so weakening it is a change to the spine, and §11a's cost paragraph
   (*"Recorded now so that conversation starts from a known cost"*) was not revisited.
2. **The race is unspecified.** Two people register the same address; both receive a verification mail;
   both click. Under a partial unique index the second insert-or-promote fails — with what message? The
   non-enumerating rule (R1.30a) says a duplicate must answer *"exactly as a new one"*, but this refusal
   happens at **verification**, where the user has already proved control of the mailbox and is entitled to
   a real answer. Nothing says which. Worse, if both are the same person's two attempts, the honest answer
   and the safe answer are different.
3. **Rule 14's transaction cannot hold if the tenant waits for verification.** If a pending registration
   creates no tenant, then "registration creates the tenant, its first owner and a Free subscription in
   the same transaction" describes **verification**, not registration, and Rule 14's sentence is now false
   for this product. If instead the tenant *is* created at registration, then an unverified registration
   reserves a tenant row (and a subscription) even if not the address, and R1.30b's "reserves nothing" is
   an over-claim. Either way, one of the two documents needs amending, and Rule 14 is a rule — changing it
   goes through Rule 23, not through a PRD requirement.
4. **Expiry has no stated period and no cleanup owner.** *"unverified attempts expire"* with no number is
   the same class of unmeasurable requirement F2 was raised about, and R1 has no scheduled-job
   infrastructure named anywhere except R1.24b's reconciliation and R1.28's reminders.

**What it would cost if built as written:** the builder picks a plain unique index because that is what the
model says, and R1.30b's protection silently does not exist — the lockout ADR 0022 is vulnerable to ships,
with a non-enumerating response ensuring the victim cannot find out why, which is the exact harm R1.30b
was written to prevent. It would pass every test written from the model.

**Suggested resolution:** name the shape. Recommended: a **`pending_registration`** row (address, token,
expiry, creator IP/device fingerprint for R1.30c's bound) with **no** `user` or `tenant` row until
verification; tenant + owner + Free subscription created in one transaction **at verification**, which
keeps Rule 14's invariant intact and moves only the trigger. Amend the model's `user` row to say uniqueness
is enforced on verified users and that pending claims live elsewhere; state the expiry period as a number;
state the verification-time collision response in words. Propose the Rule 14 wording change under Rule 23
rather than leaving the rule and the PRD to disagree.

## G10 · F2 is recorded as closed, but three of its four sub-findings are untouched: no named device, no cache precondition, and the instrumentation §10 says is "part of R1" still has no requirement — severity: major

**Where:** `PRD.md` R1.8, §10, N4, N5; disposition table row F2

**The claim under attack:** Disposition: *"**F2** | major | **Closed.** R1.8 now names its instrument: a
scripted fence-at-the-gate walkthrough, timed first tap to total, named device, aeroplane mode, recorded
per release."* R1.8: *"the instrument is a scripted walkthrough of the fence-at-the-gate task, timed from
first tap to the total appearing, run on **a named device** in aeroplane mode, recorded per release."*

**Why it does not hold.** Compare against the four things F2 actually said:

1. *Start and stop events* — **fixed.** "First tap to the total appearing" is decidable, and "interaction
   excludes thinking time and includes every wait the app imposes" is a usable definition.
2. *"mid-range Android phone" names no device* — **not fixed.** The amendment says *"run on **a named
   device**"* — which names no device. A requirement that says a device will be named is not a named
   device; it is the same deferral one level down, and it is the sentence a reader skims as closure. Under
   Rule 21.1 the claim and its evidence must live in the same place: write the handset, the Android
   version and the browser, or write the CPU-throttling profile and the harness.
3. *The cache must be warm* — **not fixed.** Nothing in R1.8, R1.4, N5 or §10 states the precondition. On
   a cold cache the task is not merely slower, it is impossible with no signal (a recipe cannot expand
   without its materials, per §5 of the model), so the test either primes the cache — and must say so, or
   it is measuring a scripted best case and quoting it as a field claim — or it fails for the wrong
   reason. No requirement tells a *tenant* the cache is primed either, which is the user-facing half.
4. *§10 says the instrumentation is "itself part of R1" and no requirement creates it* — **not fixed.**
   R1.1-R1.41 still contain no timing, telemetry or analytics requirement. R1.41 was added, but it is
   `price_observation`, not instrumentation. §10 has six signals ("A new tenant reaches their first issued
   quote within 30 minutes", "Accepted quotes that become an invoice ≥ 70%", "Free → Pro conversion ≥ 10%")
   and **not one of them has a requirement that produces the number.** N7 and N8 constrain what may be
   collected, so this is not a detail that can be added late without a privacy decision.

So one of four is closed, and the disposition claims all of it. This is the same over-statement class as
M3 and M14, which is why it is filed as major rather than minor: the table is the artefact the owner will
read instead of the diff.

**What it would cost if built as written:** the release ships with a flagship performance requirement
whose device is chosen by whoever writes the test, on a primed cache nobody declared, and §10's targets get
reported from numbers that were never instrumented — i.e. estimated, or quoted from the one scripted run.

**Suggested resolution:** name the device (or the throttling profile) in R1.8's text, add the cache
precondition as a clause, and add **one requirement** creating the measurement path for §10 with its
"what this does not prove" line and an explicit N7/N8 reconciliation (recommended: tenant-level counters
and timings, no personal data, aggregated per tenant per month). Then correct the disposition to
half-closed.

## G11 · R1.30c's "bound on addresses per IP or device" is not implementable as written in Jamaica, has no stated value, and introduces device identification with no privacy or threat-model coverage — severity: major

**Where:** `PRD.md` R1.30a, R1.30c, N7, N8; `adr/0022`; `RULES.md` Rule 14

**The claim under attack:** R1.30c: *"**one tenant per verified address, with a bound on how many
addresses may be created from one IP or one device in a period.** The bound belongs on the creator, not on
the person."*

**Why it does not hold.**

1. **"One IP" is close to meaningless on the target network.** The primary user is on mobile data (§1,
   N4). Jamaican mobile operators put large numbers of subscribers behind carrier-grade NAT, so one public
   IP is shared by many unrelated contractors; and the same contractor's IP changes between cell
   handovers and wifi. A bound tight enough to stop a script blocks a share of legitimate sign-ups from
   the exact population the product is for, and a bound loose enough not to is not a defence. Rate limiting
   *attempts* per IP (R1.30a) is defensible; bounding *created accounts* per IP is a different control
   with a different false-positive cost, and the amendment does not distinguish them.
2. **"One device" is device fingerprinting, and it is new.** Nothing in the product currently identifies a
   device at registration. A fingerprint is personal data about a person who is not yet a customer; N7
   forbids personal data in logs, N8 forbids sending it to the Claude API, the privacy policy would need to
   disclose it, and `THREAT-MODEL.md` has no section on it (see G14). Introducing it in a single
   sub-clause of a requirement is how a privacy commitment gets broken by accident.
3. **No value, no period, no refusal wording.** *"how many … in a period"* is unmeasurable as written
   (F2's own standard, applied to a security control). R1.31's style — entitlements as data — is the right
   answer, and R1.32 shows the PRD can state a number when it means one.
4. **The stated case it must not break is not covered.** ADR 0022's answer is *one person, several
   businesses, one address each*. Two brothers sharing one phone and one mobile IP, each running a small
   crew, is an ordinary Jamaican case and it is indistinguishable from the abuse this bound targets. The
   requirement says the bound *"belongs on the creator"* — which is precisely the thing shared here. There
   is **no override path**: no "contact us", no manual grant, and staff capability grants (`platform_
   capability`) are not named as being able to release the bound.
5. **Interaction with R1.30a's non-enumeration.** A duplicate must answer *"exactly as a new one"*; a
   bound refusal must presumably answer differently, or the abuse continues silently. Two refusals with
   different wording on the same endpoint is an oracle by shape, and no requirement reconciles them.

**What it would cost if built as written:** either the bound is set so loose it is decoration (and the
Rule 14 defence is reported as delivered — a control overstating coverage), or a real contractor is
refused at sign-up with a message that cannot tell them why and no route to a human. The second is the
product's first impression for the affected user.

**Suggested resolution:** split the control and state the numbers. Recommended: **rate-limit registration
attempts** per IP and per address (R1.30a, already correct), and bound **verified tenant creations per IP
per 24 hours** at a stated, data-driven value (start generous, e.g. 5) with a **stated override**: the
refusal names a support route and staff can grant an exception, audited (R1.39). Drop "or one device" from
R1 unless the owner wants a fingerprinting decision, in which case it needs its own ADR, a privacy-policy
line and a threat-model section — not a clause. Say in R1.30c which refusal wording each case gets.

## G12 · `issue_balance.accepted_total` is a copy of data that lives elsewhere, and the reconciliation job that is supposed to prove it has no trigger, no schedule and no defined action on mismatch — severity: major

**Where:** `design/domain-model.md` §6.2a; `PRD.md` R1.24b

**The claim under attack:** §6.2a: *"One row per accepted issue, holding `accepted_total`,
`variations_total` and `invoiced_total`."* … *"Note what is **not** claimed: `issue_balance` is a
**derived cache with a lock**, not a second source of truth. It is rebuildable from the invoices at any
time, and a reconciliation job that rebuilds and compares it **is owed** — because a maintained total that
nobody re-derives is how the old application's stored status drifted."* R1.24b: *"a reconciliation job that
rebuilds and compares it **is part of R1**."*

**Why it does not hold.**

1. **`accepted_total` is a copy, and the document argues against copies.** It is derivable from the
   accepted `quote_issue`'s frozen lines; storing it beside them is the second source of truth §6.2 spends
   a paragraph forbidding for invoice status. The defence — "it is only a cache" — holds only if something
   re-derives it, and see point 3. Both source rows are immutable, so in the ordinary case they cannot
   drift; the drift arrives from the **write path**, i.e. a rounding difference between the seal-time total
   calculation and the balance-row population, or a backfill. Rule 7 is the relevant rule: the total must be
   computed by one function in the shared core, and neither document says the balance row is populated by
   that function.
2. **`variations_total` is not a cache at all.** Nothing else stores it: under G1 the variation rows are
   the source, and if the ceiling is `accepted_total + variations_total`, the balance row's copy is the
   only number the lock checks. So the row is a cache for two of its three columns and a **source of
   truth for the third** — exactly the hybrid the section claims it is not, and the thing a reader is
   invited to stop worrying about by the phrase "derived cache with a lock".
3. **The reconciliation job is described two ways and specified neither.** The model says *"is owed"* (i.e.
   not built); the PRD says *"is part of R1"*. Neither says **what it does when it finds a mismatch**. A
   job that rebuilds and compares has three possible behaviours — correct silently, alert, or freeze
   invoicing on that issue — and they have wildly different consequences for a tenant mid-invoice. Nor does
   anything state its cadence, who is alerted, or whether a detected mismatch blocks further invoices on
   that issue (it should). "Rebuild and compare" without those is the reassurance without the control, and
   the old application's drift is the cited reason the control exists.

**What it would cost if built as written:** the discrepancy the job was added to catch is found, logged
somewhere nobody watches, and invoicing continues against the wrong ceiling — a control that fires
correctly and changes nothing, which Rule 21's closing paragraph names as the thing Rule 21 cannot fix and
Rule 9's review must.

**Suggested resolution:** in §6.2a: state that `accepted_total` is populated **by the same shared-core
total function that sealed the issue** (Rule 7) and is asserted equal to a re-derivation in the
reconciliation job; state that `variations_total` is a **cache of the variation rows**, which are the
source; and specify the job in one sentence — cadence, that a mismatch **alerts and blocks further invoices
on that issue until resolved**, and its planted defect (write a wrong `invoiced_total`, watch the job fire
and the block engage). Make the PRD and the model agree on whether it ships in R1.

## G13 · The lock cannot serialise the offline replay path, and the sync table has no row for `variation` or `issue_balance` — R1.24c names a test for a path R1 says cannot exist — severity: major

**Where:** `PRD.md` R1.24a, R1.24c; `design/domain-model.md` §6.2a, §8 table

**The claim under attack:** R1.24c: *"Its tests are **planted defects** … two concurrent invoices, **a
replayed offline seal**, and a variation landing between the read and the write."* §6.2a: *"its tests are
planted defects: two concurrent invoices, **a queued offline replay**, and a variation arriving between
the read and the write."* R1.24a: the lock is taken *"issuing an invoice"*.

**Why it does not hold.** The three named tests do not all describe R1.

- **"A replayed offline seal"** is a *quote* seal, not an invoice. Replaying it cannot breach the invoice
  ceiling; at most it creates a second issue (G4). So the test as named exercises nothing the lock does,
  and the test that *would* — **an invoice arriving twice from an outbox** — is impossible in R1 because §8
  says `invoice`, `client_payment` are *"read only in v1"*. Either the sync table is wrong (invoices can be
  created offline, in which case the lock must serialise a replay path and idempotency by client-generated
  UUID must be named — Rule 12 requires it and neither document names it for invoices), or the test is
  wrong. One of the two must change, and as written a builder will write a test that passes without
  testing anything.
- **"A variation landing between the read and the write"** can only be a real test if the variation path
  takes the same lock. Nothing says it does (G2). And **`variation` has no row in §8's per-entity sync
  table at all** — so whether a variation can be recorded offline is undefined, which matters more than
  usual: if it can, an offline-recorded variation replayed at sync raises the ceiling **outside the
  transaction that R1.24a says is the only way the ceiling moves**. Brief §13 and Rule 12 require a
  conflict rule *per entity*; W6a added an entity and §8 was not extended. `issue_balance` is likewise
  absent from the table, which at minimum should say **server-only, never synced**.

**What it would cost if built as written:** the invariant's test suite is three tests, one of which cannot
fail and one of which cannot pass, and the genuine replay risk — an entity created offline that moves the
ceiling — is not covered by either the lock or the table. R1.24c is cited as the reason F4 is closed.

**Suggested resolution:** add rows to §8 for `variation` (recommended: **create offline**, since the whole
point is recording what was agreed on site — which then *requires* the replay to take the balance lock and
to be idempotent per client UUID) and for `issue_balance` (**never synced, server-only, rebuilt**). Replace
"a replayed offline seal" in R1.24c and §6.2a with the test that exercises the mechanism: **the same
variation replayed twice from an outbox**, and **an invoice request retried after a timeout**, asserting
idempotency by client-generated UUID (Rule 12).

## G14 · The threat model has no coverage of the offline path at all — the amendment moved sealed financial documents onto the device and no security document was touched — severity: major

**Where:** `THREAT-MODEL.md` (whole); `PRD.md` R1.18, R1.18a, R1.18b, N7; `design/domain-model.md` §8

**The claim under attack:** R1.18: the outbox *"survives the app closing, shows what is pending, **is
encrypted at rest on the device**, and **is wiped by a remote sign-out**."* §8: *"It is encrypted at rest on
the device, has a retention limit, and is wiped by a remote sign-out (brief §13, Rule 5)."*

**Why it does not hold.** `grep -n -i "offline|outbox|device|seal" docs/THREAT-MODEL.md` returns **one
line**, and it is about staff laptops (*"devices under management; a compromised laptop is a real vector
with no technical answer here"*). So the threat model contains nothing about:

- A **contractor's personal Android phone holding the tenant's entire priced catalog, client book and
  sealed financial documents** — the single richest data set in the product, on the least controlled
  device, belonging to the least security-aware user in the model. It is lost, sold, repaired and shared
  more often than any other asset in this system.
- **What "encrypted at rest" means** where the key lives on the same device. In a browser-based PWA (which
  §12 of the PRD leaves open) there is no OS keystore available to IndexedDB by default, so "encrypted at
  rest" is either a platform capability that constrains the R1.12/§12 mobile-shape decision or it is
  ornamental. This is the claim most likely to be repeated to a customer and least likely to be true as
  written.
- **Remote sign-out against a device that is offline** — which is the only device that holds anything
  worth wiping. A wipe that requires connectivity cannot wipe the device that is refusing to connect, and
  R1.18's sentence reads as though it can. The honest control is a **local expiry** (§8's "retention
  limit"), and no requirement states its period.
- The **share-link surface** (R1.19) against the threat model's public-surface section, and the new
  **static/pre-rendered share page** (R1.22e), which moves a rendered client document onto a
  cache/CDN path with its own exposure — a pre-rendered document served statically is a document whose
  access control is now the URL alone.

The first review recorded "the security content was not independently threat-modelled" as out of scope
(its limit 3). The amendment then **enlarged the attack surface** — offline sealing on every tier is a new
data-at-rest story — and left the security document untouched. That combination is how a gap survives two
reviews.

**What it would cost if built as written:** a lost phone is a tenant's whole business, and the answer to
"was it encrypted" is a sentence in a PRD rather than a design. It is also the most likely first
regulatory question the privacy policy will be measured against.

**Suggested resolution:** a threat-model section for the offline device before W3/W4 code, covering: lost
or stolen device; shared device; a second user on the same handset; local storage encryption and where the
key lives (with the R1.12/§12 mobile-shape consequence stated); local retention expiry with a number;
remote sign-out's honest scope (*"takes effect on next connection; local expiry is what covers a device
that never returns"*); and the pre-rendered share page's access-control story. Amend R1.18's wording so
remote sign-out does not read as an immediate remote wipe.

## G15 · The amendments make N3 imprecise and leave §6's non-functional requirements largely undemonstrable — the "requirements with tests, not aspirations" heading is not yet earned — severity: minor

**Where:** `PRD.md` §6 N1-N10, particularly N3, N4, N5, N9, N10

**The claim under attack:** §6 preamble: *"These are requirements with tests, not aspirations."* N3:
*"Quote and invoice documents are immutable once issued. **Enforced by a table with no UPDATE path**, not
by careful queries."*

**Why it does not hold.**

- **N3 is now only half true, and the amendments are why.** `quote_issue` has no UPDATE path (§6.1a, and
  that is the amendment's strongest move). But an invoice's *status* is derived (R1.25), its ceiling lives
  on `issue_balance`, and **`issue_balance` is updated on every invoice** (§6.2a step 4). So the immutable
  set is "the issue and the invoice rows", while the number that governs them is mutable — which is fine,
  but N3 as worded would be quoted as covering more than it does, and it is the requirement a reviewer
  would cite when asked whether the money is safe. Name the tables N3 covers.
- **N4** (*"legible in sunlight, one-handed"*) has no instrument, no criterion and no possible pass/fail —
  it is the same defect F2 found in R1.8, in a section that claims tests. At minimum: a contrast ratio, a
  minimum touch-target size, and a stated thumb-reach zone, all of which are machine-checkable.
- **N5** (*"Priced draft producible with no network; the app states its sync status plainly"*) — "plainly"
  is not testable, and the demonstrable half duplicates R1.8/R1.4 rather than adding a check.
- **N9/N10** are the only two with numbers (*~15 min, ~50 s*), and both are quoted from
  `SERVICE-REGISTER.md` rather than from an ongoing measurement — one sample, which Rule 21.6 requires to
  be said in the same sentence or backed by a second observation. Neither has a monitor named, and N10 is a
  *trigger* with no owner: nothing in R1 watches for it firing.
- **N1** says *"already built and proved by planting"* — a coverage claim about existing code. The first
  review's limit 1 says the tree was not examined; this review did not examine it either. Under Rule 21.1
  that sentence should quote what the test run reported, not assert the property.

**What it would cost if built as written:** the NFR table becomes the thing that gets ticked at release
without anything having been measured, which is the shape of M3.

**Suggested resolution:** one line per NFR stating its instrument, or move it to a stated "not measured in
R1" list. Add the tables N3 covers. Attach N1's claim to the test file and its last reported output.

## G16 · Requirement numbering: R1.22e sits inside W5 while R1.22a-d are the next workflow, so the sequence reads a, b, c, d after e — severity: minor

**Where:** `PRD.md` W5 (R1.22, R1.22e) and W6a (R1.22a-d)

**Why it matters, briefly.** The PRD has adopted RULES.md's append-don't-insert convention (R1.16a,
R1.18a-b, R1.24a-c, R1.30a-c, R1.40a-b), which is right. But R1.22e was appended to **W5** while
R1.22a-d were appended to **W6a**, so a reader scanning in order meets `e` before `a`, and two
requirements sharing the `R1.22` stem belong to different workflows with unrelated subject matter. Rule 23's
reasoning — *"a citation that quietly points at the wrong rule is worse than a missing one"* — applies to
requirement numbers the moment tests start citing them, which §5's preamble says is the point of numbering
them.

**Suggested resolution:** renumber the share-page requirement to the next free number at the end of W5's
block (e.g. **R1.22f → R1.22z is worse; use R1.42**) and leave a one-line tombstone where it was, or move
it into W5 as `R1.22a` and renumber W6a's four. Either is a minute's work now and a broken citation later.

---

## Summary

| # | Severity | One line | Blocks |
|---|---|---|---|
| **G1** | **blocker** | The PRD's ceiling is "accepted total + **recorded** variations", the model's is "+ **accepted** variations", and R1 has no variation acceptance — so either one party raises the ceiling unilaterally or no variation ever counts | W6a, W7 |
| **G2** | **blocker** | Nothing creates the `issue_balance` row, and `SELECT … FOR UPDATE` on a missing row takes no lock — the first pair of concurrent invoices, which is R1.24c's own test, is exactly the case that slips | W7 |
| **G3** | **blocker** | Domain model §4 still reads "Allocate at sync … **Rejected**" and "**Chosen:** device number blocks" — F1's contradiction now sits inside one document; §11 and the missing ADR are stale with it | the physical schema, W4 |
| **G4** | **blocker** | Two devices can seal one draft; §8 calls `quote_issue` "never conflicts"; both get numbered → two identities for one job, the failure PRD §11 calls unanswerable, now reachable without leases | W4, sync |
| **G5** | **blocker** | A sealed issue refused a number (free limit, suspension, lapsed entitlement, deleted client) has no defined outcome, no state in §6.3, and R1.32's calendar-month server-side limit guarantees it happens | W4, W9 |
| **G6** | major | `catalog_synced_at` is stored and no requirement reads, shows, thresholds or refuses on it — "visible rather than deniable" has no owner | W3, W4 |
| **G7** | major | The model's `variation` row still requires its own acceptance ("must be signable on its own") and `acceptance` still carries "its own PDF hash" — F3 and F17 were amended in one document only | W6a, W5 |
| **G8** | major | R1.22c refuses what R1.15 and §6.3 still promise unconditionally, is absent from the impossible-transition list it cites, and leaves no remedy for a non-price error on an accepted issue | W4, W6a |
| **G9** | major | R1.30b's "unverified reserves nothing" weakens the model's global email uniqueness without amending it, leaves the both-verify race undefined, and moves Rule 14's single-transaction registration without going through Rule 23 | W9 |
| **G10** | major | F2 is claimed closed; only one of its four sub-findings is fixed — no device is actually named, no cache precondition, and §10's "instrumentation is part of R1" still has no requirement anywhere | W3, §10 |
| **G11** | major | "A bound per IP or device" is not implementable on Jamaican mobile CGNAT, states no value or period, adds device fingerprinting with no privacy or threat-model coverage, and refuses two brothers sharing a phone with no override | W9 |
| **G12** | major | `issue_balance.accepted_total` is a copy with no stated producer, `variations_total` is a source of truth inside a row called a cache, and the reconciliation job has no cadence and no defined action on mismatch | W7 |
| **G13** | major | §8 has no sync row for `variation` or `issue_balance`, so an offline variation could raise the ceiling outside the lock; R1.24c's "replayed offline seal" test exercises nothing, and the replay that matters is declared impossible | W6a, W7, sync |
| **G14** | major | The threat model has one device-related line in the whole file (about staff laptops) while the amendment put the tenant's catalog, client book and sealed documents on a contractor's phone; "wiped by remote sign-out" cannot reach an offline device | W3, W4, W5 |
| **G15** | minor | N3's "no UPDATE path" is now imprecise (`issue_balance` is updated); N4, N5, N9, N10 and N1 have no instruments, so §6's "requirements with tests" is not yet earned | §6 |
| **G16** | minor | R1.22e sits in W5 while R1.22a-d are in W6a, so the numbering reads e before a and one stem spans two workflows | citations |

**Counts: 5 blockers, 9 major, 2 minor.** Four of the five blockers (G1, G2, G4, G5) are **introduced by
the amendments**; G3 is an amendment left half-applied.

**The pattern worth naming.** Three findings (G3, G7, G10) are the same failure as M13 itself: a change
written into one document, or one clause, and reported as complete. The disposition table is the artefact
the owner reads instead of the diff, and it currently overstates F1, F2 and F17. Rule 24 asks for a
mechanism rather than a resolution: **a disposition row may not say "Closed" unless it cites the amended
text by section in both documents that the finding named** — F1's own suggested resolution named
`domain-model.md` §4 and F17's named R1.20, and both were missed by a reader who trusted the word.

## Verified closed

Checked against the amended text, not against the disposition:

- **F9** — closed. §10's two rows now read *"Tenants who **hit the free limit** (a fourth job refused) ≥ 30%"*
  and *"Free → Pro ≥ 10% of tenants **who hit the free limit**"*. The impossible denominator is gone and
  the arithmetic against R1.32's limit of 3 now holds. (The instrument to measure either is still missing —
  G10 item 4 — but that is F2's defect, not F9's.)
- **F11** — closed. PRD §9 items 1a-1d exist (sending domain, WiPay merchant, malware scanning, private
  object storage) and `SERVICE-REGISTER.md` §3a names both undecided services with what choosing them
  costs, plus *"Until both are chosen, R1.36 cannot be met"*. Naming the gap is what Rule 18 asks for and
  it is done.
- **F13** — closed. R1.41 exists, scoped to **capture only**, gated on recorded consent, with the
  pre-registration deadline stated in both the requirement and §9 item 4.
- **F14** — closed. `quote_section` is in the model with its invariants, `quote.client_detail_level` is
  named and stated as **frozen into the issue**, and the tenant-readable audit trail is correctly recorded
  as a redacting read path on `audit_entry` rather than a new entity. (R1.17's per-country day boundary,
  which F14 also raised, is still carried only by R1.17's own wording — worth a glance, not a finding.)
- **F16** — closed. R1.22e exists, states the ~50 s cold-start problem, requires the page served
  statically or pre-rendered with only acceptance touching the API, and draws the right conclusion about
  Rule 10's paid-infrastructure trigger. (Its new access-control surface is in G14; its number is in G16.)
- **F18** — closed. R1.23 states in its own text that it deliberately supersedes the audit's inventory
  item #15 and why, so the two documents no longer disagree silently.

Also genuinely good, and worth saying because a review that only reports problems gives no signal:
**the separate insert-only `issue_number` table is the right call** and the reasoning for it (a nullable
column would mean an UPDATE on a sealed financial document) is correct and well argued. The gapless /
burned-numbers trade-down being stated in both documents is the honesty Rule 21 is trying to produce.
`issue_balance` with a row lock is also the right *shape* for F4 — G2, G12 and G13 are about its
preconditions and its writers, not about the choice.

**Not closed, contrary to the table:** F1 (G3), F2 (G10, three of four sub-findings), F3 (G1, G7 —
the model side untouched and the ceiling term undecided), F4 (G2, G12, G13), F12 (G9, G11), F17 (G7 item 2).

## What this review did not examine (Rule 21.4)

1. **No code was read at all.** Not `site.ts`, not the guards, not the API, core, schema or migrations,
   and not `original-app/`. Every claim here about what exists comes from the documents. So F5's and
   F6's open public-copy items were **not re-checked** — I did not confirm that the site still over-claims
   or that `honest-claims.test.ts` is still absent.
2. **Nothing was executed.** No tests, no `check_rules.py`, no `npm`. The commit message's coverage line
   (*"62 rules defined, 439 citations … all citations resolve"*) was **taken on trust**, not reproduced,
   which under Rule 21.7 means this review has no evidence for it either way.
3. **ADRs were not read.** Not 0022, not 0008/0011/0015/0017/0020/0021. Claims about ADR 0022's content
   come from how the PRD and the model quote it, so if an ADR already answers G9 or G11 I would not have
   seen it. This is a real gap in G9 and G11 specifically.
4. **`DEVELOPMENT-BRIEF.md`, `TIERS.md`, `PRICING.md`, `MILESTONES.md` and `MISTAKES.md` were not read.**
   M13 and M14 are cited here from the commit message and the disposition table, not from `MISTAKES.md`, so
   I have not verified that either entry says what the amendment claims. The brief's §5a, §6, §10, §13 and
   §15 citations were again taken at face value, so a brief requirement the amended PRD drops would not
   have been found — this is the same hole as the first review's limit 8 and it is now two reviews old.
5. **`THREAT-MODEL.md` was examined by one grep and its result** (`offline|outbox|device|seal` → one hit).
   G14 rests on that plus the absence of any offline section in the greps; I did not read the file in full,
   so a section titled differently could exist. Under Rule 21.6 that is one observation and G14's coverage
   claim should be treated accordingly.
6. **The money arithmetic below the ceiling was not reviewed** — per-line GCT, markup/discount
   interaction, rounding order, the N2 ceiling, and how the seal-time total is computed. The first review
   flagged this (limit 4) and it is still owed a pass. G12's point 1 touches its edge and no more.
7. **The first review's 19 findings were not re-derived.** I checked the **dispositions**; I did not
   re-attack the original documents for anything F1-F19 missed, except where the brief pointed me (the
   threat model, G14, and the NFRs, G15). A defect present before the amendments and missed by both reviews
   is still possible.
8. **No owner questions are answered here.** F5, F6, F7, F8, F10 and F15 remain the owner's, and G1's
   resolution, G5's entitlement choice and G11's bound value are three more decisions for them, not
   conclusions.
9. **No effort or schedule estimate.** Whether the R1 scope including W6a is achievable was not assessed.

## Are W4, W5, W7 and W9 buildable now?

The first review said they were not. Checked against the amended text:

- **W4 — Issue. No, and the reason changed.** F1's contradiction between the documents is gone and the
  seal/number/deliver split is the right design. But the model's own §4 still rejects what R1 now does
  (G3), the two-device double seal is reachable and explicitly blessed as "cannot conflict" (G4), and the
  sealed-but-refused state has no outcome and no node in the state machines (G5). Those three are schema
  and state-machine questions, which means they must close **before** the physical-schema step, not during
  W4's code. G6 and G8 are cheap and can follow.
- **W5 — Share and accept. Yes, with two conditions.** F16 closed properly, and R1.19/R1.22 were already
  sound. Fix R1.20's "its own PDF hash" first (G7 item 2 — a one-line edit that decides a column), and
  treat the pre-rendered share page's access control in the threat model before it ships (G14). F15 stays
  an owner question but does not block building; it changes the wording on the page, not the design.
- **W7 — Invoice and get paid. No.** This is the weakest area and it is where the amendment tried hardest.
  The ceiling's *definition* is undecided between the two documents (G1), its *mechanism* has no row
  creator and an unenumerated writer set (G2), its *cache* mixes a copy with a source of truth and its
  reconciliation job has no behaviour (G12), and its *test list* includes one test that cannot fail and one
  that R1 says cannot happen (G13). All four are paper fixes today and none is a code fix later. W7 is
  closer than it was, and further from buildable than the disposition reads.
- **W9 — Subscribe. No.** F11 and F12's four defences are genuine progress, but R1.30b changes an invariant
  in another document without amending it and leaves the verification collision undefined (G9), R1.30c's
  bound is not implementable as written on the target network and adds a fingerprinting decision nobody
  took (G11), and R1.32's interaction with offline sealing is unresolved (G5) — which is a W9 requirement
  breaking a W4 workflow. Plus the two owner questions F10 and F5/F6 that W9 and the pricing page still
  wait on.

**In one sentence:** the amendments fixed the contradiction they set out to fix and did it well, but four
of the five blockers in this pass were **created by them**, and the disposition table's three
overstatements (F1, F2, F17) are the same failure class as the mistakes it logs — so the plan is better
than it was and W4, W7 and W9 are still not buildable.

---

*Second-pass review, 2026-09-25. Reviewer did not write the plans or the first review (Rule 1.10,
Rule 9). Findings appended as found. Nothing in this pass was executed or proved by planting, which is
stated above rather than implied.*

---

## Addendum, found after the summary was written (so the table above does not include it)

`git status --porcelain` shows one file in the tree besides this review:

```
?? docs/adr/0024-acceptance-evidence.md
```

It is **uncommitted and marked Accepted**, dated today, and it changes release 1's scope. It is not mine —
I wrote only `docs/PRD-REVIEW-2.md`.

## G17 · ADR 0024 is Accepted, uncommitted, and neither the PRD nor the disposition table knows it exists — a scope change to W5 with no requirement, and F15 is still recorded as open — severity: major

**Where:** `docs/adr/0024-acceptance-evidence.md` (untracked) vs `PRD.md` R1.20, §5 W5, §8, §8a.4, §9;
`PRD-REVIEW.md` disposition row F15

**The claim under attack:** the disposition table: *"**F15** | question | **Open — legal, not engineering.**
PRD §8a.4 recommends asking the attorney while the terms are being approved."* PRD §8a.4 likewise presents
it as undecided. ADR 0024's own header: *"**Status: Accepted** … **Decided by:** the owner … **'The typed
name on a phone acceptance record on the phone is not legal in a dispute.'**"*

**Why it does not hold.** The owner has answered F15, and the ADR states five decisions with consequences
that touch numbered requirements — while the PRD, the disposition table and `BRIEF-STATUS.md` all still
present the question as open. Under Rule 1.9 and Rule 19 the plan of record is now stale in the direction
that matters most: it understates what has been decided. Specifically:

1. **R1.20 is not rewritten.** The ADR's consequences say *"R1.20 **is rewritten**: the record is an
   operational acceptance, not a signature, and the requirement says so in its own text so nobody
   re-derives the old assumption from the field list."* R1.20 in `PRD.md` is unchanged and still reads as
   a bare field list — which is exactly the re-derivation the ADR is trying to prevent. Combine with G7
   item 2: **R1.20 now needs two edits, and only one of them is in any document.**
2. **W5 gains a requirement that does not exist.** *"R1: the quote PDF carries a signature block, and a
   signed copy can be uploaded against the issue."* There is no R1.4x for it, it is not in §5 W5, and it is
   **not in §8's exclusions either** — the same "in neither the scope nor the exclusions" position that
   made F13 a finding, for a feature with an upload path, a hash, and storage implications.
3. **A dependency hardened and §9 does not say so.** The ADR: *"ADR 0023's owed decisions on malware
   scanning and object storage are now load-bearing for **W5 as well as W9**. Two workflows now wait on
   those two choices."* PRD §9 items 1c/1d and `SERVICE-REGISTER.md` §3a both still attribute those to
   R1.36/W9 only. F11 was closed on the strength of those rows; their scope is now wider than the rows say
   — a Rule 21.1 mismatch created by a document the register has not seen.
4. **A public-copy edit is now decided and is bundled with the still-open F5/F6.** *"`site.ts` says … 'you
   have their answer in writing.' … It goes."* That is no longer an owner question; it is a decided edit
   sitting behind two findings the table records as waiting on the owner.
5. **It touches G1 without closing it.** ADR 0024 §2: *"R1.24's ceiling is an **internal control**, not a
   legal instrument."* That is a real contribution to G1 — it supports G1's option 2, that the R1 ceiling
   is a bookkeeping guard rather than a protection the client can rely on. It does **not** resolve G1,
   because it says nothing about the *recorded* vs *accepted* variation term, and the invariant is still
   described in the PRD as *"the most important arithmetic invariant in the product"*, which reads as
   stronger than "internal control". Both sentences cannot be the headline.
6. **Its own new risk is named and then left unowned:** *"The threat model needs a line: an uploaded
   'signed' copy is a document a tenant can forge as easily as a client can."* Correct, and the threat
   model has not been touched (G14). Two documents now owe it the same section.

Also worth flagging on process rather than content: an **Accepted** ADR that exists only as an untracked
working-tree file is invisible to every check in the repository (`check_rules.py`, the reference checker,
CI) and to anybody who clones. It cites `ADR 0023 §4`, which this review did not read, so the chain it sits
in was not verified.

**What it would cost if built as written:** the builder works from the PRD, implements R1.20's field list,
ships the UI saying "signed", and the copy the owner has already decided to remove goes out — with the
signed-copy upload path, which is the artefact the ADR says an attorney would actually ask for, missing
from R1 because no requirement carries it.

**Suggested resolution:** commit the ADR, then flow it through in one change: rewrite R1.20 (both for
ADR 0024 and for G7's hash reference), add the signed-copy requirement to W5 with its storage and scanning
dependency, extend §9 1c/1d and `SERVICE-REGISTER.md` §3a to name W5, move F15's disposition row from
*open* to *answered, with ADR 0024*, and add the ADR's forgery line to the threat model alongside G14's
offline section. And under Rule 24, the mechanism worth having: **an ADR marked Accepted is committed in
the same change that amends the documents it names in its Consequences** — this one lists four and none of
them moved.

**Revised counts for this review: 5 blockers, 10 major, 2 minor (17 findings).** The buildability verdict
above is unchanged by G17 except for W5, which now carries one more required edit before it is built —
R1.20 must be rewritten for ADR 0024 and for F17 together, in one edit, not two.

---

## Addendum 2 — two ADRs landed while this review was being written, and they change two findings

`git log --oneline -2` mid-review, after my first pass over the documents:

```
72cb9ea docs: ADR 0024 — a typed name is not evidence, so the product stops implying it is
22bc036 docs: ADR 0023 — what the free tier meters, where the offline line falls, one recipe
```

Neither existed when G1-G16 were written (G17 covers 0024, which was untracked at that point and is now
committed). ADR 0023 answers three of the four owner questions — F10 (meter on **numbering**), F8 (offline
**sealing** on every tier, offline issuing Pro) and F7 (one free recipe) — and it is a good document. Two
of my findings must be corrected against it, in its favour, and one gets sharper. Neither document the
review was given (`PRD.md`, `domain-model.md`) reflects any of it: ADR 0023's own consequences say the
`TIERS.md`, site and R1.32 edits are **"owed"**.

**G5 is downgraded to major, and narrowed.** ADR 0023 §1 answers the case I said had no answer, and
answers it explicitly: *"a job sealed offline in one month and synced in the next counts in the month it
was **numbered**. A contractor who seals four jobs on a Sunday with no signal has three numbered and one
refused when they sync. … **The sealed snapshot is not destroyed; it waits, and upgrading releases it.**"*
It also rejects my recommendation (meter at seal) with a reason that answers my R1.31 objection —
*"metering on seal would mean either trusting a client-side count or refusing work already done"*. That is
a better argument than the one I made and G5's recommendation should be read as answered. What survives:

1. **"It waits" needs a home, and R1's own retention rules can destroy it.** A refused seal waits in the
   outbox, but R1.18b warns after *"a stated number of days"* and §8 gives the outbox *"a retention
   limit"* and a remote-sign-out wipe. A seal waiting for an upgrade that comes in six weeks is a seal
   sitting in a store designed to expire — and §8's own residual-risk paragraph says that device holds
   **the only copy**. Either the waiting seal moves server-side at sync (recommended: the server accepts
   and stores it as *sealed, unnumbered, over limit*, so the only copy is no longer on the phone), or the
   retention limit must be stated as not applying to it. Nothing says which, and the two requirements
   currently contradict.
2. **Items 2-5 of G5 remain unanswered:** suspension, lapsed paid entitlement, a client soft-deleted before
   numbering, and the stale-catalog case (G6). ADR 0023 covers the free-limit refusal only.
3. **The state is still absent from §6.3's state machines**, so the transitions "number a waiting seal",
   "refuse", "release on upgrade" are not in the list the model says is *"therefore tested"*. ADR 0023 asks
   for *"a test for the cross-month case"*, which is exactly the right test and has nowhere to attach until
   §6.3 names the state.
4. **R1.32 is now known-stale** in a document the review gate is assessing; the ADR says so itself.

**G11 gets sharper, not softer.** ADR 0023's closing consequence: *"one free account per verified address
with a bound on addresses **per device** (R1.30c) is what stops three-jobs-a-month from becoming unlimited
via new accounts. These two decisions lean on each other."* So the free tier's entire abuse defence now
rests on the one control G11 argues is not implementable as written — device identification that no
document has designed, that the threat model does not cover, and that has no stated value, period or
override. A generous free tier leaning on an unbuilt control is the shape Rule 21 exists to make visible:
if the bound ends up loose enough not to refuse two brothers sharing a phone, then unlimited free quoting
via new addresses is the actual behaviour, and it was decided by omission. **G11 should be read as blocking
ADR 0023's §1 as much as W9.**

**Process note, offered rather than filed as a finding.** Three ADRs (0022 was earlier; 0023 and 0024
today) now decide things the two documents under review still state as open, and both new ADRs list
document edits as *"owed"* and *"held because a review was reading the documents"*. That is a defensible
choice under Rule 16, but it means **the plan of record and the decision record disagree for as long as
the hold lasts**, and a builder reads the plan. The mechanism worth having under Rule 24 is the one G17
proposes, applied to both: an Accepted ADR either amends the documents it names or carries a dated line in
`BRIEF-STATUS.md` listing the owed edits, so the gap is visible to the next reader rather than only to
whoever wrote it. `BRIEF-STATUS.md` was not re-read after these commits (Rule 21.6 — one observation), so
that line may already exist.

**Final counts: 4 blockers (G1, G2, G3, G4), 11 major (G5-G14 as amended, G17), 2 minor (G15, G16) — 17
findings.** The buildability verdict stands, with W4's blocking set reduced to G3 and G4 plus the narrowed
G5.
