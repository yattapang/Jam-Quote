# Third review of the release-1 plan — the pass that attacks the amendments of `24efe32`

**Reviewer:** an agent that did not write the amendments (Rule 9, Rule 24.6 second half).
**Under review:** commit `24efe32` "docs: close all 17 second-review findings, and the owner's four
decisions", which claims all 17 G-findings Closed.
**Numbering:** H1, H2, … so nothing collides with F (review 1) or G (review 2).

## Disposition — updated as findings close

Rule 24.6: a row may not claim **Closed** without citing, by file, every document the finding's own
`Where:` line named, and `tools/check_dispositions.py` gates it. Closing a blocker earns a **fourth
review**, not a tick.

| # | Sev | Disposition |
|---|---|---|
| **H4** | blocker | **Closed.** `new-app/db/migrations/20260926110000_withdrawal_preconditions/migration.sql` refuses a withdrawal while an invoice **or a recorded variation** exists, by trigger rather than by caller, and makes `issue_ceiling_minor()` state-aware so a withdrawal drops the ceiling to zero while mutating nothing. `docs/PRD.md` R1.15a-c and `docs/design/domain-model.md` §6.2a/§6.3 amended; **ADR 0025's own contradiction corrected** — its decision 4 said `accepted_total` "returns to zero" while decision 2 said "written once, never again". Six tests, three plants, control green |
| **H11** | blocker | **Closed.** `20260926100000_variation_idempotency` adds the `client_reference` key the earlier migration's comment already claimed, with a partial unique index per issue; `docs/PRD.md` R1.22g and `docs/design/domain-model.md` (the `variation` row and its §8 sync row) now state it, including what the database does NOT guarantee — that the application resends the same key. `docs/RULES.md` Rule 6 is why it is a new migration rather than an edit. Logged as M18: a comment crediting an absent column is the M14 class for the third time |
| **H16** | major | **Closed.** Six broken citations fixed across `new-app/web/content/site.ts`, `docs/PRD.md`'s guard reference and `docs/RULES.md`; `new-app/web/test/site-guards.test.ts` now names itself rather than the phantom. Rule 21.8 plus `tools/check_citations.py` gate the class in CI, and it found four phantom citations in the site's own source that three reviews had missed |

**Still open: 17 of 20.** H1, H2, H3, H5, H6, H7, H8, H9, H10, H12, H13, H14, H15, H17, H18, H19, H20.
Most are documents still asserting what the migration has now settled, which is the prose pass; H7 and
H12 need a decision; H9 and H10 are the owner's.


**Why this pass exists and what it expected to find.** Review 2 found that *four of its five blockers
had been created by the amendments that closed review 1*. The commit message under review says so
itself and declines to claim otherwise. The prior was therefore that this pass introduced new
blockers, and that is where the hunting was concentrated. It was correct: most of the blockers below
are defects in text written by `24efe32`, and two are a G-finding still standing in the document the
finding named, under a row claiming it Closed.

Commands run are quoted in "What this review did and did not read", at the end.

---

## H1 · §6.2a's own opening sentence still states the ceiling as "**accepted** variations" — G1's exact defect survives inside the document G1 named, in the commit that claims to have closed it — severity: blocker

**Where:** `docs/design/domain-model.md` §6.2a (opening invariant, and the ceiling formula twelve lines
below it); `docs/PRD.md` R1.24, R1.24d; `docs/PRD-REVIEW-2.md` G1 and its disposition row.

**The claim under attack.** The commit message: *"G1 — the ceiling read '+ recorded variations' in one
document and '+ accepted variations' in the other … Stated plainly instead."* But §6.2a's first line,
untouched by the diff, still reads:

> **The invariant:** the sum of issued invoices against an accepted issue may never exceed the accepted
> total, plus **accepted variations**, where those exist.

while the mechanism in the same section says the ceiling is `accepted_total + variations_total`, whose
source is *every* `variation` row, and `PRD.md` R1.24d now says at length that "recorded", not
"accepted", is the truth and that saying otherwise "would have been an invariant that reads stronger
than it is."

**Why it does not hold.** G1's `Where:` named both documents, and the amendment edited the PRD half and
the §6.2 `variation` table row while leaving the *headline statement of the invariant itself* saying the
thing G1 was raised about. The disposition passes `check_dispositions.py` because the row cites
`domain-model.md` — the checker verifies citation, not correctness, which is exactly what Rule 24.6
says it cannot do. This is structurally identical to M13/G3: the contradiction did not move between
documents, it stayed inside one, one screen apart, in the commit that logged that failure pattern.
"Where those exist" makes it worse than a stale word: it reads as a deliberate qualifier, so a builder
implementing §6.2a top-down will look for a variation-acceptance flag that release 1 does not build.

**What it would cost if built as written.** The most important arithmetic invariant in the product has
two different definitions in its own design section. A builder reading the bold **The invariant:** line
— the line a reader treats as normative — will either invent an acceptance flag on `variation` or
filter `variations_total` by a column that is always null, producing a ceiling of `accepted_total`
alone. Every legitimate variation then makes correct invoicing impossible, the failure appears as a
refusal, and it will be "fixed" under pressure by deleting the filter, with nobody able to say which
semantics shipped.

**Suggested resolution.** Rewrite §6.2a's opening line to "accepted total plus **recorded** variations
(release 1 — see R1.24d)", delete "where those exist", and add one sentence saying the word becomes
"accepted" when release 2 builds variation signing. Then re-open G1 rather than leaving a Closed row
over it.

---

## H2 · §6.2a declares the `issue_balance` writer set "closed and named" and omits the two writers the same amendment invented — severity: blocker

**Where:** `docs/design/domain-model.md` §6.2a (the writer table and the "Every writer takes the lock"
paragraph), §6.3 (withdrawal); `docs/PRD.md` R1.24a, R1.24b, R1.15a.

**The claim under attack.**

> **Every writer takes the lock.** The set is closed and named, because an unenumerated writer set is
> how a locked row stops being locked: issuing an invoice · voiding an invoice · a credit note ·
> recording a variation · the reconciliation job. **Any future writer joins this list or it does not
> ship.**

**Why it does not hold.** Two writers exist already and are not on the list, and both were created by
this same commit:

1. **The acceptance transaction.** The table three lines above says `issue_id` and `accepted_total` are
   written by "the acceptance transaction", and G2's whole fix is that this transaction *creates the
   row*. It is the first writer in the row's life and it is absent from the closed set. A reader
   applying the rule literally ("any future writer joins this list or it does not ship") concludes the
   acceptance transaction must not write, which is the opposite of G2's fix.
2. **Withdrawing an acceptance** (R1.15a and §6.3, both new in this commit). Withdrawal un-accepts the
   issue. Whatever it does to `issue_balance` — delete it, void it, leave it — is a write, or a
   deliberate non-write that needs stating. It appears nowhere in §6.2a. See H4.

A "closed set" that is wrong on the day it is written is worse than an open one, because it converts
"check whether your path takes the lock" into "your path is not on the list, so it must not need it" —
the reversal Rule 21 describes as a control that stops anybody asking the question.

**What it would cost if built as written.** The acceptance transaction is the one writer that runs
*before* the row exists, so it cannot take `SELECT … FOR UPDATE` on it; it needs an insert whose unique
constraint does the serialising. Because it is not enumerated, nothing says that — and §6.2a says "one
row per accepted issue" in prose and never says **unique index**. So two concurrent acceptances (a
double-submitted accept POST, or an accept retried after the ~50-second cold start R1.21a exists
because of) insert two balance rows for one issue, and the ceiling is thereafter enforced against
whichever duplicate the query happens to lock. That is G2's failure — a lock that does not serialise
the first pair of concurrent attempts — moved from the invoice path to the acceptance path *by the fix
for G2*.

**Suggested resolution.** Add both writers to the enumerated set. State the creator's concurrency
control explicitly: `issue_balance.issue_id` is the primary key or carries a unique index, the
acceptance transaction inserts it, and a second concurrent acceptance fails on that constraint rather
than on application logic — which also gives §6.3's "accepting twice must be impossible" the
mechanical owner it currently lacks.

---

## H3 · R1.22b says recording a variation "re-derives the accepted total"; R1.24b says `accepted_total` is written once and never again — severity: blocker

**Where:** `docs/PRD.md` R1.22b, R1.24, R1.24b, R1.24d, R1.24e; `docs/design/domain-model.md` §6.2a
(writer table).

**The claim under attack.** R1.22b, unchanged by this commit: *"Recording one **re-derives the accepted
total** for that issue, which is what R1.24 measures against."* R1.24b, new in this commit:
*"`accepted_total` is written once, by the acceptance transaction, from the issue's own frozen lines and
never again."* §6.2a's table: `accepted_total` — *"the acceptance transaction, **never again**"*.

**Why it does not hold.** These are not two phrasings of one idea. The amendment introduced a named
column called `accepted_total` with a written-once-never-again rule into a document where an existing
requirement already instructs the builder that recording a variation rewrites "the accepted total".
R1.24 cites R1.22b as the definition of what the ceiling measures against, so R1.22b is normative, not
incidental. G12's disposition does not mention R1.22b, and the naming collision is new: before this
commit there was no column by that name to collide with.

**What it would cost if built as written.** The plausible build is R1.22b's, because that is the
requirement whoever implements W6a reads: the variation handler updates `accepted_total`. The column
then becomes a mutable copy whose only stated justification for being safe is *the issue is immutable,
so the value it derives from cannot change*. The nightly reconciliation (R1.24e) rebuilds
`accepted_total` from the frozen lines, finds a mismatch on every issue that has a variation, **refuses
further invoicing against that issue** and alerts. The first tenant who records a variation has their
invoicing frozen by the control written to protect it, with an audit entry asserting the money
arithmetic has drifted.

**Suggested resolution.** Amend R1.22b to: *"Recording one re-sums `variations_total` inside the lock,
which is what moves the ceiling R1.24 measures against; `accepted_total` is never rewritten (R1.24b)."*

---

## H4 · Withdrawing an acceptance has no defined effect on `issue_balance` or on variations already recorded — the new remedy silently detaches money from the issue it was agreed against — severity: blocker

**Where:** `docs/PRD.md` R1.15a, R1.15, R1.22a, R1.22b, R1.22c, R1.22d, R1.24, R1.24b;
`docs/design/domain-model.md` §6.2a, §6.3, §6.2 (`variation` and `acceptance` rows), §8 (`variation`
and `issue_balance` sync rows).

**The claim under attack.** R1.15a, new in this commit: *"release 1 allows the acceptance to be
**withdrawn** — recorded, audited, with a reason, and only before any invoice exists against it — which
returns the issue to superseded-able."* §6.3, new in this commit, says the same and adds *"Once an
invoice exists the remedy is a credit note and a fresh quote."*

**Why it does not hold.** The precondition is stated over exactly one entity — `invoice` — and this
commit created two others that hang off an acceptance:

1. **`issue_balance`.** §6.2a says the row is created *"in the same transaction as the acceptance,
   unconditionally"*, with `accepted_total` written *"never again"*. Withdrawal is not mentioned, so
   after a withdrawal the issue is not accepted and a balance row for it still exists, asserting an
   accepted total for an acceptance that no longer exists. The re-accepted work lives on a *different*
   issue (R1.15a returns the old one to superseded-able, and R1.15 makes a revision a new issue), so
   the schema now carries a balance row that can never legitimately be invoiced and that the nightly
   reconciliation will happily rebuild and report as consistent. Whether withdrawal deletes it, voids
   it, or leaves it is precisely the kind of question that gets decided by whoever writes the migration.
2. **`variation`.** R1.22a lets a priced variation be recorded against an accepted issue; §6.2 makes it
   **immutable** — *"a mistake is corrected by another variation"* — and §8, new in this commit, lets it
   be **created offline**. R1.15a says nothing about variations at all. So: Delroy's client accepts, two
   variations worth $400,000 are recorded, the wrong client name is discovered, the acceptance is
   withdrawn, the issue is superseded, a corrected issue is issued and accepted. The variations are
   immutable rows pointing at a superseded issue whose acceptance was withdrawn. They cannot be moved
   (immutable), cannot be deleted, and the new issue's `variations_total` is zero — so the agreed extra
   $400,000 is either unbillable, or it is billed by re-recording the variations, which leaves two
   immutable copies of the same agreed work in the tenant's own audit trail with nothing distinguishing
   the live pair from the dead pair.

R1.15a's justification — *"a variation answers 'the scope changed' and nothing else"* — is the argument
for the feature and is sound. The defect is that the feature was specified against one guard condition
when this commit gave the accepted issue three dependants.

**What it would cost if built as written.** The remedy for a typo becomes a way to detach recorded money
from the job it belongs to, and it is reachable by a contractor doing exactly what the UI invites. The
failure is silent — no ceiling is breached, no test fails, `check_dispositions.py` is satisfied — and
surfaces as an argument with a client about $400,000 of extras that the system can show were agreed
against a document marked superseded.

**Suggested resolution.** Make the precondition the full set: withdrawal is permitted only while **no
invoice and no variation** exists against the acceptance, and only while the `issue_balance` row shows
`invoiced_total = 0` and `variations_total = 0` — checked **inside the balance-row lock**, which also
puts withdrawal on H2's writer list. Where variations do exist, name the actual remedy (a negative
variation to zero out the scope, or a credit note and a fresh quote, as R1.15a already says for
invoices). State explicitly what happens to the `issue_balance` row: recommended is that it is kept,
marked withdrawn, and permanently barred from invoicing, since deleting it destroys the audit trail the
withdrawal is supposed to create.

---

## H5 · §6.3 lists "superseding an issue that has been accepted" as a transition that **must be impossible and is therefore tested**, eleven lines above the transition that requires it — severity: blocker

**Where:** `docs/design/domain-model.md` §6.3 (impossible-transitions list and the withdrawal
paragraph); `docs/PRD.md` R1.15, R1.15a, R1.22c.

**The claim under attack.** §6.3, both sentences added by this commit:

> Transitions that must be impossible, and are therefore tested: … **superseding an issue that has been
> accepted** (G8 — the acceptance hangs off it, so a revision would orphan it, and the path is a
> variation) …

> **One transition that must be possible, and was missing (G8):** an acceptance may be **withdrawn** …
> which **returns the issue to superseded-able**.

**Why it does not hold.** An issue that has been accepted and then had its acceptance withdrawn *has
been accepted*. The impossible-transition predicate is written over history ("has been accepted"), the
permitted transition is written over current state ("no live acceptance"), and the document does not
distinguish them. Both sentences were written in the same edit, for the same finding, in the same
section. The parenthetical reasoning is also now false as a general statement: after a withdrawal the
acceptance does *not* hang off the issue in a way a revision would orphan, which is the entire premise
of allowing the withdrawal.

**What it would cost if built as written.** §6.3's list is not commentary — it is a test manifest, and
these are the tests that guard the document layer. The test written from this line is "assert that
superseding an issue with an acceptance row is refused", and the acceptance row is immutable and
therefore still present after a withdrawal (R1.20: *"One acceptance per issue, immutable"*). So the test
passes and R1.15a's remedy cannot be built; or the builder notices, weakens the test to "no *live*
acceptance", and the weakening happens in a test file rather than in the design — which is how the
strongest guard in the document layer quietly stops covering the case it was written for. W4 cannot be
built from §6.3 as it stands, because two of its stated behaviours are mutually exclusive.

**Suggested resolution.** Rewrite the impossible-transition entry as *"superseding an issue whose
acceptance has not been withdrawn"*, and state in the withdrawal paragraph what marks the acceptance
withdrawn given that the row is immutable — a separate `acceptance_withdrawal` row is the only shape
consistent with §3's no-UPDATE convention, and naming it is what lets both tests be written.

---

## H6 · The commit puts the "sealed, awaiting number" node in §8 while §6.3 keeps the old quote state machine — `domain-model.md` now contains two disagreeing state machines for the same entity, which is the G3 failure repeated by the fix for G5 — severity: blocker

**Where:** `docs/design/domain-model.md` §6.3 (the quote state machine), §8 (the new diagram and its
introduction), §6.1, §6.1a; `docs/PRD.md` R1.18, R1.18c, R1.32a.

**The claim under attack.** §8, new in this commit:

> **"Sealed, awaiting number" is a state, so it belongs in the state machine (G5).** §6.3 had no node
> for it, which left ADR 0023's cross-month metering case nowhere to attach a test:
> ```
> quote:  draft ──seal──▶ sealed (awaiting number) ──sync──▶ issued ──▶ ...
> ```

**Why it does not hold.** The sentence diagnoses the defect correctly and then does not fix it. §6.3
still reads, unchanged:

```
quote:        draft ──issue──▶ issued ──▶ superseded (by a later revision)
```

So the document now holds two `quote:` state machines in two sections, with different transition names
(`issue` versus `seal`/`sync`), different node sets (§6.3 has `abandoned`, `expired`, `superseded`; §8
has `sealed`, `blocked`), and no cross-reference in either direction. G3 was raised because a
contradiction had moved from between two documents to inside one; M13 logged that; Rule 24.4 says a
repeat means the first mechanism was decorative. This is the third occurrence of the same pattern, in
the commit whose message quotes that lesson.

There is a second defect inside the new diagram. It is labelled `quote:` and the states it lists are
states of a **`quote_issue`** — sealing produces the immutable snapshot, and §6.1 opens with *"A quote
is two things, and conflating them is the defect"*. A diagram that puts `sealed` and `issued` on the
*quote* is that exact conflation, in the section that added it.

**What it would cost if built as written.** The two machines produce two different implementations. From
§6.3 a builder models `quote.status` with no `sealed` value, so the offline seal has nowhere to live and
"awaiting number" becomes a derived UI condition (`issue exists && no issue_number`) — which cannot
represent `blocked`, so R1.32a's refused fourth job and R1.18c's refused second device have no
persistent state and reappear on every sync as a fresh failure. From §8 a builder adds `sealed` and
`blocked` to the quote and loses `abandoned`/`expired`/`superseded`. Either way, G5's stated purpose —
giving ADR 0023's cross-month test somewhere to attach — is not achieved, because the test asserts
against a state machine that the normative section does not contain.

**Suggested resolution.** One machine, in §6.3, covering both diagrams' nodes, and split correctly
across the two entities §6.1 insists on: `quote` carries draft / abandoned; `quote_issue` carries sealed
(awaiting number) / blocked / issued / superseded / expired / accepted / declined / invoiced / settled.
§8 then references §6.3 instead of drawing a second one.

---

## H7 · The G4 resolution — the refused seal is "offered as a revision" — requires either an UPDATE on an immutable sealed snapshot or the offline revision R1.18c forbids in the same breath — severity: blocker

**Where:** `docs/PRD.md` R1.18c, R1.15, R1.13, R1.16a; `docs/design/domain-model.md` §8 (the
two-devices-sealing paragraph and the `quote_issue` sync row), §6.1a, §3 (conventions), §6.3.

**The claim under attack.** R1.18c and §8, both new in this commit:

> the server enforces **one sealed issue per (quote, revision)**; the second device is **refused, told a
> colleague sealed this job, and its snapshot is kept and offered as a revision** rather than discarded.
> **A revision cannot be created offline.**

**Why it does not hold.** Trace the loser's snapshot. It was sealed offline as revision *N* — the seal
"records the quote id and the revision it sealed", and §8's sync row concedes it is an append that
cannot conflict at row level. At sync it is refused because revision *N* is taken. To be "offered as a
revision" it must become revision *N+1*. Three routes, and the document forbids all three:

1. **Change its revision number at sync.** `quote_issue` is written once and *"no column on it is ever
   updated"* (R1.13, §6.1a, and §6.1a's own argument that a separate row exists precisely so that
   `quote_issue` has "no UPDATE path at all"). Renumbering is an UPDATE on a sealed financial document.
2. **Insert a new `quote_issue` at revision *N+1* from the same snapshot.** Then the row that is
   delivered to the client was not the row the device sealed: `sealed_at` either lies about when the
   seal happened or is reset to sync time, which destroys the one fact the snapshot exists to record —
   and R1.16a's render hash is over a document whose revision number differs from the one sealed.
3. **Let the device create revision *N+1* itself.** Explicitly forbidden by the last sentence of the
   same requirement.

The "second device is offline when refused" objection resolves in the design's favour — the refusal
happens at sync, when the device is connected — but that only makes the sealing/renumbering
contradiction the live one. There is a further ordering problem: R1.15 says a revision is the next
revision number and *"the previous one is marked superseded"*. Here the loser may have sealed **earlier
in wall-clock time** than the winner, so promoting it to revision *N+1* marks the winner superseded by
a document sealed before it. The audit trail then states the opposite of what happened, and nothing
says whether the tenant is shown the price the client was actually quoted at the gate.

**What it would cost if built as written.** The two-issued-identities failure G4 exists to prevent is
converted into a mutable sealed document, which is the invariant N3 says is enforced *"by a table with
no UPDATE path, not by careful queries"*. Whoever builds this will add an UPDATE path to `quote_issue`
to make the refusal recoverable, and N3's guarantee will have been given up for a conflict-resolution
convenience, in a table the whole design rests on. The alternative build — refuse and discard — is
forbidden by R1.18d.

**Suggested resolution.** Keep the loser's snapshot in the **outbox**, not in `quote_issue`: the refused
push is retained as a queued, unpushed artefact with its original `sealed_at`, and the "offer" is a
prompt to **re-seal it as revision *N+1*** — an explicit, online act by a person, which satisfies "a
revision cannot be created offline", produces an honest `sealed_at`, and keeps `quote_issue`
insert-only. Say plainly that the client at the gate saw a price from a document that was never issued,
and that the tenant is shown both totals before choosing.

---

## H8 · Pending claims cannot coexist with the model's "Email unique globally", no entity holds them, and R1.30c asserts the existing unique index enforces the thing that index prevents — severity: blocker

**Where:** `docs/PRD.md` R1.30a, R1.30b, R1.30c, R1.30d, R1.30e; `docs/design/domain-model.md` §4
(`tenant` and `user` rows, §11a); `docs/RULES.md` Rule 14 (as amended by this commit); `docs/TIERS.md`
§2a; `docs/PRD-REVIEW-2.md` G9 and its disposition row.

**The claim under attack.** R1.30e, new in this commit: *"an unverified registration holds a **pending**
claim on the address, not the address itself; pending claims expire in **72 hours**; if two people
register the same address, the first to verify takes it."* R1.30c, new in this commit: *"reconciled as
**one tenant per verified address**. That part is exact and **is enforced by the unique index that
already exists**."* Unamended, `domain-model.md` §4: *"`user` … **Email unique globally**, which is what
enforces the owner's rule that a second business needs a second address (11a)."*

**Why it does not hold.** G9 asked for three things by name: the *shape* (a partial unique index over
verified rows, or a separate pending-registration table), an amendment to the model's `user` row, and a
resolution of Rule 14's single-transaction sentence. This commit delivered the *policy* (72 hours, the
race) and none of the three.

1. **Two pending claims for one address cannot both exist under the index R1.30c cites.** A plain unique
   index on `user.email` refuses the second row at insert time. So R1.30e's central scenario — two
   people registered on the same address, both holding pending claims, first-to-verify wins — is
   unimplementable against the enforcement mechanism the adjacent requirement names. R1.30c is not
   merely silent about the shape; it asserts a shape that makes R1.30e impossible.
2. **Nothing anywhere is the pending claim.** There is no `pending_registration` entity in §4, §5 or any
   other section of the model, and no column named on `user`. The 72-hour expiry therefore has no row to
   expire and no owner to expire it — the same defect class G9's point 4 raised, now with a number
   attached but still no table.
3. **G9's point 3 is untouched.** Rule 14 still says *"Registration creates the tenant, its first owner,
   and a Free subscription in the same transaction: a tenant never exists without a plan"*, and Rule 14
   **was amended in this commit** — so the sentence was read past. If the tenant is created at
   registration, R1.30b's "reserves nothing" is false (a tenant and a subscription are reserved). If it
   is created at verification, Rule 14's sentence is false for this product and needed the Rule 23
   treatment the rest of the rule got.

**What it would cost if built as written.** The builder implements what the model says, because the
model is the schema's source: one global unique index on `user.email`, tenant created at registration
per Rule 14. R1.30e's protection then does not exist — the first person to **type** an address owns it,
which is the lockout R1.30b was written to prevent — and because R1.30a's response deliberately does not
enumerate, the real holder of the address cannot discover why registration fails, and support cannot
tell them without building the enumeration oracle Rule 14 forbids. Every test written from the model
passes. This is G9's predicted cost, unchanged, under a row claiming G9 is closed.

**Suggested resolution.** Add the entity to `domain-model.md` §4: `pending_registration` (address, token
hash, expiry, created_at), no `user` and no `tenant` row until verification; amend the `user` row to say
uniqueness is enforced over **verified** users and that pending claims live in that table; move tenant +
owner + Free subscription creation to **verification** and amend Rule 14's sentence under Rule 23 to
say so; name the job that expires pending claims; and delete the clause in R1.30c claiming an existing
index enforces it.

---

## H9 · Acceptance now requires an email channel and nothing requires a client to have one — W5's core flow is unbuildable for the WhatsApp-only client the product is designed around — severity: blocker

**Where:** `docs/PRD.md` R1.20, R1.20b, R1.20c, R1.21, R1.22, R1.3, R1.4; `docs/design/domain-model.md`
§5 (`client` row); `docs/adr/0024-acceptance-evidence.md`; `new-app/web/content/site.ts` (Free tier
line "Share by WhatsApp or email, client accepts online"); `new-app/web/test/site-guards.test.ts`
(`delivered` set); `docs/TIERS.md` (the "Share by WhatsApp or email link" row).

**The claim under attack.** R1.20, new in this commit: *"**Acceptance is a verified electronic
signature** (ADR 0024): a one-time code sent to **the channel the tenant holds for that client**."*
R1.20b: *"Release 1 verifies by **email**, because it needs no new service … SMS is a new paid
sub-processor and absent from the register; WhatsApp Business sending is release 3."*

**Why it does not hold.** Nothing in either document requires a client to have an email address. R1.3 is
*"A client book, soft-deleted only"*; the model's `client` row is *"The tenant's customer. Soft-deleted
only."* — no fields named at all, let alone a mandatory one. Meanwhile R1.21 makes **WhatsApp
click-to-chat** a first-class sharing channel on every tier, and it is the channel this market actually
uses; the product's own marketing leads with it. So the normal path is: tenant holds a phone number,
shares by WhatsApp, client opens the link — and there is no channel to send a code to. The code cannot
go by WhatsApp (release 3) or SMS (no sub-processor). Before this commit acceptance was a typed name and
worked for that client; this commit made acceptance conditional on a channel the client may not have,
and left W5 with no stated behaviour for the case.

R1.20c is offered as the answer — *"the fallback where a client has no email"* — but it is an **upload of
signed paper by the tenant**, which is not an online acceptance at all: it requires printing, physical
signature, and the tenant's own upload, and R1.20c itself says *"we do not certify it"*. It cannot
substitute for the accept button, and no requirement says what the share page shows a client whose
record has no email. The remaining possibility — the share page asks the client to type their own email
and then verifies it — is not stated anywhere, and would be worthless as attribution, since a party who
supplies the address whose control is then verified has verified nothing about their identity.

**What it would cost if built as written.** Either acceptance becomes impossible for a large share of
real clients (the builder makes `client.email` mandatory, which breaks R1.4's offline client creation and
the client book's purpose), or the accept page silently falls back to the unverified typed name that
ADR 0024 just ruled out — reintroducing the claim the owner overturned, in code, under a requirement
saying it was removed. And the public site today sells *"Share by WhatsApp or email, client accepts
online"* as a **delivered** release-1 Free feature, asserted as such by `site-guards.test.ts`'s
`delivered` set: the two halves of that sentence are true separately and false together, which is a
Rule 20 over-claim now protected by a passing guard.

**Suggested resolution.** Decide it in the PRD: either (a) an email address becomes required on a client
**before that client can be sent a quote for acceptance** — stated on R1.3 and on the model's `client`
row, with the field named — with WhatsApp sharing still delivering the *link*; or (b) release 1 keeps an
explicit second acceptance mode for clients with no email, named and with its weaker evidentiary
standing stated in the UI per R1.20a. Either way, amend the site line and the `delivered` set to say
what actually works.

---

## H10 · The verified channel is supplied by the tenant, so a code-verified signature proves nothing against the party most likely to forge it — and that is the basis on which work moved into release 1 — severity: major

**Where:** `docs/PRD.md` R1.20, R1.20a, R1.20b, R1.20c, R1.20d, R1.19; `docs/THREAT-MODEL.md` §4a (the
"verification code channel" row and the "uploaded signed copy" row); `docs/adr/0024-acceptance-evidence.md`;
`docs/design/domain-model.md` §6.2 (`acceptance` row).

**The claim under attack.** R1.20: the code goes *"to the channel the tenant holds for that client"*, and
the record carries *"the channel verified"*. `THREAT-MODEL.md` §4a: *"A code is single-use, short-lived,
rate-limited per issue and per recipient, and the channel it went to is recorded on the acceptance.
**Guessing a six-digit code with no rate limit is the whole attack**."*

**Why it does not hold.** "The whole attack" names the outsider's attack and omits the insider's. The
channel is a field the **tenant** owns, creates and edits (R1.3, the client book). A contractor who
wants an acceptance can set the client's email to an address they control, send the quote to themselves,
receive the code, tick the consent box and type the client's name — producing a record that carries a
verified channel, a timestamp, an IP, a user agent and a document hash, and that is materially
indistinguishable from a genuine one. Every strengthening this commit added (consent to sign, the
labelled signing act, the `document_render` hash reference) strengthens the record's *integrity* and
none of it addresses *attribution to the client*, which is the only thing a dispute turns on.

The document layer already knows this argument: R1.20c says of uploaded paper *"a tenant can forge one as
easily as a client can, and saying so is the control"*, and R1.20d reaches for a paid deposit as
**corroboration** precisely because a typed name is weak. The same disclosure is absent from R1.20, the
mechanism presented as the strong one, and §4a's threat row for it does not mention the tenant at all —
in a threat model whose new section is otherwise specifically about hazards the tenant creates.

The consequence for the plan is that ADR 0024's reasoning — a typed name is not evidence, a properly
constructed e-signature can be, therefore this moves *into* release 1 — rests on a construction whose
weakest link is not stated. Whether it clears Jamaica's bar is correctly left to the attorney (R1.20a),
but the attorney will be asked about a mechanism whose channel provenance nobody has written down, and
that is an expensive way to find this out.

**What it would cost if built as written.** The product ships an evidence artefact that reads as
stronger than it is — the failure mode R1.24d is praised for avoiding on the ceiling and that ADR 0024
was written to end on acceptance. In the one dispute that matters (a contractor claiming the client
accepted), the artefact is worth roughly what the typed name was worth, and the record's own fields
invite a reader to think otherwise. R1.20a forbids the *UI* from claiming it is binding, which does not
help, because the claim is implied by the mechanism rather than made in copy.

**Suggested resolution.** State the limit in R1.20, beside the mechanism: the code verifies control of a
channel **the tenant supplied**, so it proves the client's involvement only to the extent the address is
genuinely the client's. Then name the cheap hardening: record and show on the acceptance whether the
client's channel was **changed within N days of the quote being sent** (an audit fact, not a new
technology), treat R1.20d's paid deposit as the corroboration that actually comes from the client, and
add a tenant row to `THREAT-MODEL.md` §4a for the code channel so §4a is not silent on the one actor it
was added to cover.

---

## H11 · A variation may now be created offline with no idempotency key, and it is immutable — a replayed outbox entry raises the invoiceable ceiling permanently and by design cannot be removed — severity: blocker

**Where:** `docs/PRD.md` R1.22f (new), R1.22a, R1.22b, R1.24, R1.24a, R1.24c;
`docs/design/domain-model.md` §8 (`variation` sync row, new), §6.2 (`variation` row), §6.2a (the
planted-defect list), §3 (conventions); `docs/RULES.md` Rule 12; `docs/PRD-REVIEW-2.md` G13 and its
disposition row.

**The claim under attack.** §8's new row: *"`variation` | create | Append-only; the ceiling is re-summed
under the lock at sync (§6.2a), never computed on the device."* R1.22f: *"A variation may be **recorded
offline** but its effect on the ceiling is computed **server-side, inside the lock** (G13)."*

**Why it does not hold.** G13's resolution asked for two things together: the sync row, **and**
idempotency by client-generated UUID for the replay that row makes possible, because Rule 12 requires it
and neither document named it. The sync row landed; the idempotency requirement did not appear anywhere.
"Append-only" is the property that makes the gap dangerous rather than safe: an outbox entry that is
retried after a timeout — the ordinary case on a Jamaican mobile connection, and the reason the outbox
exists — appends a *second* variation row. `variations_total` is re-summed from the rows inside the lock
exactly as specified, so the duplicate is counted, and the ceiling rises by the variation's value twice.
Nothing detects it: the nightly reconciliation (R1.24e) rebuilds from the same rows and finds perfect
agreement, because the rows are what it trusts.

And the remedy is closed off by design. §6.2 and R1.22b: *"Variations are immutable once recorded; a
mistake is corrected by another variation."* So the only correction is a compensating negative variation,
which requires someone to notice — and the symptom is a ceiling that is too *high*, i.e. nothing is ever
refused and nothing complains.

G13's other half is also untouched: R1.24c and §6.2a still name *"a replayed offline seal"* / *"a queued
offline replay"* among the planted defects. G13's point was that this test exercises nothing the lock does
(a replayed quote seal cannot breach an invoice ceiling) while the test that would — a replayed entity
that moves the ceiling — is the one now newly reachable and still unnamed. The commit created the hazard
and left the test list pointing away from it.

**What it would cost if built as written.** The most important arithmetic invariant in the product can be
breached by a flaky connection, silently, permanently, with the invariant's own reconciliation job
certifying the result as correct. It over-bills a real client, it is found by their accountant rather
than by us — the exact words §6.2a uses about the failure it exists to prevent — and R1.24c's planted
defects would not have caught it because one of the three tests is aimed at a path that cannot breach
anything.

**Suggested resolution.** Add to R1.22f and to §8's row: every offline-created variation carries a
**client-generated UUID**, the server's insert is idempotent on it (unique index, per Rule 12), and a
replay is a no-op rather than an append. Replace "a replayed offline seal" in R1.24c and §6.2a with the
two tests that exercise the mechanism: **the same variation replayed twice from the outbox**, and **an
invoice request retried after a timeout**, each asserting idempotency by that UUID. Re-open G13.

---

## H12 · A blocked seal waits indefinitely, and nothing says what numbers it, in what order, against which month's quota, or who decides which of four jobs is the one refused — severity: major

**Where:** `docs/PRD.md` R1.32, R1.32a, R1.14, R1.18b, R1.18c, R1.18d, R1.18e;
`docs/design/domain-model.md` §8 (the blocked-state diagram and the re-check list), §6.3;
`docs/adr/0023-release-1-metering-and-tier-boundaries.md`.

**The claim under attack.** R1.32a, new in this commit: *"A contractor who seals four jobs offline on a
Sunday gets three numbered and one refused when they sync, in the month of *syncing*. The refused
snapshot is **kept, never destroyed** … and **upgrading releases it**."* ADR 0023 says the same in one
sentence and adds nothing about mechanism. §8's new diagram gives `blocked` a node.

**Why it does not hold.** The queue has no specified behaviour on any of the four questions it raises.

1. **Order.** Four seals arrive in one sync. Which three are numbered? Sealing order (`sealed_at`, which
   the device controls and which R1.18e does not list among the things re-checked), arrival order, or
   whatever order the batch happens to iterate in? R1.14 requires numbers **gapless per series**, so
   numbering is inherently sequential, and the first three arbitrarily chosen become the three real
   quotes. A contractor who priced the big job first has no guarantee it is the one that gets numbered.
2. **Whose choice.** Nothing lets the contractor pick. The one thing the user unambiguously wants at that
   moment — "number *that* one, hold the small one" — is not a stated capability, and the refusal message
   R1.32a requires can only explain a decision the system already made.
3. **Which month's quota.** ADR 0023 meters at numbering, and R1.18e confirms *"the month is the month it
   syncs"*. So a seal blocked on 31 March and released on 1 April consumes one of April's three — unless
   it does not, and nothing says. A contractor who hits the limit in March therefore starts April with
   either two slots or three, and the difference is the difference between the meter being comprehensible
   and the meter being arbitrary.
4. **How long, and released by what other than upgrading.** R1.18d forbids any timer from deleting it, and
   the only stated release is *upgrading*. So a Free tenant who does not upgrade accumulates blocked
   snapshots permanently, in an encrypted local store with "a retention limit" that may not touch them —
   an unbounded store on a cheap Android phone, which is the device N4 names. R1.18b's warning covers
   *unsynced* seals; these have synced and been refused, so no warning covers them.

**What it would cost if built as written.** The free tier's most visible moment — the fourth job — is
decided by iteration order, the meter's month boundary is undefined, and the product accumulates
undeletable data on the user's phone with no stated ceiling. Each of these will be settled by whoever
writes the sync handler, and none of them will be visible in review as a decision.

**Suggested resolution.** State the queue: blocked seals are ordered by `sealed_at` and the **contractor
chooses** which to number when the limit bites (default: earliest first); a blocked seal that is later
numbered consumes the quota of the month **in which it is numbered**, stated in the refusal message so
the arithmetic is never a surprise; blocked snapshots are listed in the app with a count, and they are
released by upgrading **or** by the next month's quota, whichever comes first — which also bounds the
store R1.18d protects.

---

## H13 · R1.30a and R1.30c quote Rule 14 wording that this same commit deleted — the manifest hash was cleared without reading the citation list Rule 23.3 prints — severity: major

**Where:** `docs/PRD.md` R1.30a, R1.30c; `docs/RULES.md` Rule 14 (amended in this commit);
`docs/rules-manifest.json` (Rule 14 hash changed `6ef3c1b0…` → `d1100ac7…`); `docs/TIERS.md` §2a;
`tools/check_rules.py`.

**The claim under attack.** R1.30a: *"so **Rule 14's defences** ship with it … rate limiting per address
and per IP · email verification … · **a bound on tenants per address** · and a duplicate registration
that does not reveal the address is taken."* R1.30c: *"**Rule 14's *bound on tenants per address*** and
ADR 0022's *one person, several businesses, one address each* are reconciled as…"*

**Why it does not hold.** Rule 14 no longer says that. This commit replaced the phrase with *"one tenant
per verified address"* and added an amendment note explaining why the old wording was wrong — *"This rule
said 'a bound on tenants per address', which the PRD then had to interpret."* Two PRD requirements still
quote the deleted phrase in italics as Rule 14's text, one of them to reconcile it with something. Rule
23.4 is explicit that rewording carries the same obligation as renumbering, and 23.3 says
`check_rules.py` *"prints every file and line that cites the affected rule — the review list is handed
over, not left to be found"*. The manifest hash was updated in this diff, which means `--update` was run;
the citation list it printed necessarily included these two lines, and they were not changed. This is
Rule 23's own named residual risk — "it cannot tell whether a citation is apt" — landing on the first
rule amended after the rule was written.

**What it would cost if built as written.** A reader reconciling the two documents finds the PRD arguing
against wording that no longer exists, which makes R1.30c read as a live reconciliation of a live
tension rather than as a settled statement — and R1.30c is the requirement that carries the uniqueness
rule H8 shows is already unimplementable as cited. It also makes the amendment look less thorough than it
was, which costs the next reviewer time.

**Suggested resolution.** Replace both quotations with Rule 14's current wording, and in R1.30c drop the
"reconciled as" framing since the rule now states the conclusion directly.

---

## H14 · R1.30d enumerates the registration bound exhaustively and drops the per-address rate limit Rule 14 still requires — leaving the endpoint an email bomb aimed at a tenant whose address an attacker already knows — severity: major

**Where:** `docs/PRD.md` R1.30a, R1.30d, R1.30e; `docs/RULES.md` Rule 14 (as amended); `docs/TIERS.md`
§2a; `docs/THREAT-MODEL.md` (no section covers the registration endpoint).

**The claim under attack.** R1.30d, new in this commit: *"**The bound is therefore:** (a) a rate limit per
IP on *attempts* …; (b) the **email verification requirement** doing the real work: an unverified
registration reserves nothing and **costs us nothing** …; (c) a **cost ceiling rather than an identity
ceiling**."* Rule 14, as amended, still lists *"rate limiting per address **and** per IP"* among the
defences the endpoint ships with.

**Why it does not hold.** "The bound is therefore" reads as the complete replacement set, and per-address
rate limiting is absent from it — while Rule 14 and `TIERS.md` §2a both still require it, and R1.30a
still lists it. The PRD's exhaustive list is missing the one control that answers a specific,
already-documented attack: R1.30a mandates that a duplicate registration **emails the existing owner**.
That makes the unauthenticated endpoint a mailer that will send to any address an attacker names, and the
per-IP limit is described in the same requirement as *"deliberately loose enough not to lock out a whole
carrier"* — i.e. deliberately too loose to stop it, and trivially evaded on CGNAT, which is the premise
of the whole paragraph.

The supporting claim is also false as written: an unverified registration does **not** cost nothing. It
costs an outbound email against a sending domain that does not exist yet (§9 item 1a), and sender
reputation is exactly what is spent. Argument (c) is a cost ceiling on what a *verified account*
consumes, which is a different resource from what an *unverified attempt* consumes, so (b) and (c) do not
in fact provide the defence the paragraph says they provide. The amendment removed device fingerprinting
for good and well-argued reasons; the per-address limit was collateral.

**What it would cost if built as written.** A contractor whose email address is on their own quotes can be
mailed "someone tried to register your address" on demand, at whatever rate the loose per-IP limit
allows — a harassment vector against our own customer, delivered by us, from the one endpoint that has no
authentication. It also burns the sending domain's reputation, which is the asset every other outbound
message in the product depends on.

**Suggested resolution.** Add to R1.30d's list: **(d) a rate limit per target address on notification
sends** — at most one "someone tried to register this address" mail per address per period, with further
attempts answered identically but silently, which preserves the non-enumerating response. Say in the same
breath that the sending domain's reputation is the resource being protected, and add the registration
endpoint to `THREAT-MODEL.md`, which currently has no section for it.

---

## H15 · ADR 0024's and ADR 0023's owed edits reached `site.ts` and TIERS' table but not TIERS §3, which still prescribes the typed-name acceptance design ADR 0024 overturned and the per-acceptance PDF hash F17 removed — severity: major

**Where:** `docs/TIERS.md` §3 item 3 (and item 5); `docs/PRD.md` R1.20, R1.20a, R1.16a, §8a item 4;
`docs/adr/0024-acceptance-evidence.md`; `docs/design/domain-model.md` §6.2 (`acceptance` row).

**The claim under attack.** `TIERS.md` §3, untouched by this commit: *"**3. Client approval on the quote
page.** The public page can already accept or decline; add **a typed name, a timestamp and a PDF record
of the acceptance**. Contractors need proof the client agreed to a price before work starts."*

**Why it does not hold.** Every clause of that sentence was overturned in this commit or the one before
it. The typed name is what ADR 0024 ruled is not evidence and what R1.20 replaced with a code-verified
signature. "A PDF record of the acceptance" is the per-acceptance hash that F17 removed — the model's
`acceptance` row now explicitly *"does not carry a hash of its own"* and references `document_render`
instead. And *"contractors need proof the client agreed"* is the framing R1.20a forbids the product from
adopting. `TIERS.md` is the document that defines the tier ladder and the ship order, and it is one of the
two documents the commit message says was amended for ADR 0023 — so it was open in the editor.

Separately, and in the same document: the tier table's Pro column still shows **Retention tracking ✓,
Project costing and job profit ✓, Accountant exports (CSV) ✓** with no release marker, while `site.ts`
now marks all three *"(coming in release 2)"* and PRD §8 excludes them from release 1. That is three
documents disagreeing about what Pro includes — the same failure mode as F8's three answers on offline,
recreated by fixing F8 and F5 in two documents out of three.

**What it would cost if built as written.** `TIERS.md` §3 is the ship-order document, so feature 3 gets
built as a typed name with its own PDF hash — undoing ADR 0024, F17 and the model's `acceptance` row at
the moment of implementation, by a builder who read the document that tells them what to build next. And
the Pro column is the sheet a price conversation is held from, so the three release-2 features get sold
verbally while the website marks them as future work.

**Suggested resolution.** Rewrite `TIERS.md` §3 item 3 to ADR 0024's mechanism (a code-verified
signature over the hashed render, with R1.20a's limit on what is claimed), mark the three release-2 rows
in the Pro column the way `site.ts` marks them, and add a line to `check_dispositions.py`'s scope or a
new guard covering TIERS/site/PRD agreement — because this is the third time these three documents have
diverged and prose has not stopped it (Rule 24.4).

---

## H16 · `PRD.md` still cites `honest-claims.test.ts` — and `site.ts` now cites a `honestClaims` symbol that does not exist either, so M14's defect was re-committed in the fix for M14 — severity: major

**Where:** `docs/PRD.md` line 426 (§7, the F5/M14 paragraph) and line 422; `new-app/web/content/site.ts`
(the Pro tier comment); `new-app/web/test/site-guards.test.ts`; `docs/MISTAKES.md` M14.

**The claim under attack.** `site.ts`, added by this commit: *"`honestClaims` in `site-guards.test.ts`
asserts every unmarked line is delivered."*

**Why it does not hold.** There is no `honestClaims` identifier anywhere in `site-guards.test.ts`. The
test that does this work is an unnamed `it("sells nothing the current release does not deliver")` inside
`describe("nothing untrue")`. So the source file now points a reader at a symbol that does not exist —
which is a smaller version of M14 itself: *"the PRD pointed at a non-existent guard as the reason it was
safe"*, logged as a mistake, and the fix for it introduced a fresh dangling citation in the file the
guard protects. Rule 24.4's test applies: the mechanism written for M14 (`check_rules.py`,
`check_dispositions.py`) verifies **rule** citations and **disposition** citations, and nothing verifies
that a code comment's or a document's reference to a test name resolves. That is why it recurred.

`PRD.md`'s occurrence is defensible in isolation — line 426 is the *narrative of the defect* (*"I had
cited a guard called `honest-claims.test.ts`; no such file exists"*), so the string must stay. But the
task's check stands: grepping the PRD for file references returns `honest-claims.test.ts`, and any tool
or reader that resolves references mechanically will flag it. It needs to be unmistakably marked as a
historical quotation, not a citation.

**What it would cost if built as written.** Low direct cost, high signal cost: the project's defence
against false controls is that a claim and its evidence sit in the same place (Rule 21.1). A comment that
names the wrong test teaches the next reader that these names are approximate, which is how the first
`honest-claims.test.ts` citation survived long enough to protect a live over-claim.

**Suggested resolution.** Name the test — either export/rename the `it` block to something a comment can
cite exactly, or change the comment to quote the test's actual title in quotes. In `PRD.md`, wrap the
historical string so it reads unambiguously as a quotation of a past error (it already nearly does), and
add to the guard's own "what this does not prove" note that nothing checks the resolvability of file and
test names cited in prose.

---

## H17 · R1.21a promises the share page survives a sleeping API; the acceptance flow this commit put on that page needs three round trips to it — severity: major

**Where:** `docs/PRD.md` R1.21a, R1.20, R1.20b, R1.22, N9, N10; `docs/THREAT-MODEL.md` §4a (the
pre-rendered share page row); `docs/SERVICE-REGISTER.md` §4a; `docs/design/domain-model.md` §8
(`acceptance` sync row).

**The claim under attack.** R1.21a: *"**The share page must survive the API being asleep (F16).** … the
free instance spins down after ~15 minutes with a ~50-second first response … So the page is served
[pre-rendered]."* R1.20, new in this commit: acceptance is now *request a code → receive an email → submit
the code → sign*.

**Why it does not hold.** F16's fix protects the **read**. This commit replaced a one-POST acceptance with
a flow of at least two server calls separated by the client's trip to their inbox — and the code is
*short-lived* (`THREAT-MODEL.md` §4a) — on an instance whose first response is ~50 seconds. The worst case
is now the *normal* case: a client taps accept (waits ~50s for the cold start), gets the mail, comes back
several minutes later by which time the instance may have spun down again, submits the code, waits again,
and may find the code expired by the timeout it just sat through. Nothing in R1.20, R1.20b or R1.21a
states the code's lifetime relative to the cold start, and R1.21a's own argument — *"A client who taps a
quote link and waits a minute on a blank screen is the worst impression the product can make"* — now
applies to the accept button, which the pre-rendering does not cover.

**What it would cost if built as written.** The one client-facing conversion step in the product acquires
two cold starts and a race against a short-lived code, on the free infrastructure N10 says is acceptable
"for a prototype, not at launch". The likely field outcome is abandoned acceptances that look to the
contractor like the client ignoring the quote, which lands on the tenant, not on us — R1.21a's own
statement of why this matters.

**Suggested resolution.** State the code's lifetime as a number and make it comfortably longer than two
cold starts (e.g. 30 minutes, single-use); state that the accept flow's first call is the one that must be
warm and either keep-warm it or serve it from the same surface that serves the pre-rendered page; and add
the accept path explicitly to R1.21a's scope, since it is the reason the page exists. This is also further
evidence for Rule 10's paid-infrastructure trigger, which N10 still records as an owed ADR.

---

## H18 · PRD §7's tier table still meters "Jobs quoted", and the site's Free tier sells offline capture without the one caveat that makes it true for Free — severity: minor

**Where:** `docs/PRD.md` §7 (tier table, row 1), R1.32, R1.32a; `docs/TIERS.md` (tier table, Quotes row);
`new-app/web/content/site.ts` (Free tier `includes`); `new-app/web/test/site-guards.test.ts`
(`delivered`).

**The claim under attack.** PRD §7: *"| Jobs quoted | 3 per month | Unlimited |"*. Site Free:
*"Works with no signal — price and capture a job offline"*.

**Why it does not hold.** ADR 0023's decision is that the meter counts jobs **numbered**, and it was
carried into R1.32, TIERS' table (*"3 jobs **numbered** a month; revisions and declines free"*) and the
site (*"3 jobs numbered a month — revisions and declines are free"*). PRD §7's table — the table that
defines the release-1 ladder, and the third of the three documents F8 was about — still says "Jobs
quoted", the wording §8a item 1 was raised to remove because *"each reading gives a different product"*.
Three documents, two answers, on the requirement whose whole point was ending that.

Separately, the site's Free line is true of the *capture* and silent about what Free specifically does
with it: a Free tenant's fourth offline seal of the month is **refused a number at sync** (R1.32a). The
line as written invites the reading that offline work always becomes a quote. TIERS' table makes the same
claim with the same silence.

**What it would cost if built as written.** Small but real: an entitlement implemented from §7 counts the
wrong event, and the free tier's most sensitive moment is undersold on the page a prospect reads.

**Suggested resolution.** Change §7's row to *"Jobs **numbered** (ADR 0023) | 3 per month | Unlimited"*.
Add six words to the site and TIERS lines: *"— the number is issued when you get signal"*, and update the
`delivered` set to the new string in the same edit.

---

## H19 · The new guard's coverage statement omits its two real gaps: eleven Business lines are permanently unchecked, and the `delivered` set is an author's assertion nothing validates — severity: minor

**Where:** `new-app/web/test/site-guards.test.ts` (the `it("sells nothing the current release does not
deliver")` block, its `delivered` set, `markedTier`/`markedLine` and the "WHAT THIS DOES NOT PROVE"
comment); `new-app/web/content/site.ts`; `docs/PRD.md` R1.40a/R1.40b and §7; `docs/TIERS.md`;
`docs/RULES.md` Rule 21.1, 21.4.

**The claim under attack.** *"WHAT THIS DOES NOT PROVE: that a line marked 'coming in release 2' will in
fact arrive in release 2, and not that a delivered line is delivered WELL. It proves the page does not
claim something the plan says is absent — no more."*

**Why it does not hold.** The last sentence overstates, on two axes Rule 21.4 requires to be stated:

1. **The wholesale exemption is unbounded and permanent.** `if (whole) { …; continue; }` skips the entire
   `includes` array of any tier whose `theLine` matches `/coming in release (\d)/i`. Business has eleven
   lines and none of them will ever be checked again — including any line added later, and including a
   line that is *false in its own terms* rather than merely future. The exemption is the right call for
   readability (marking eleven lines is unreadable), but the guard's stated coverage should say that the
   tier is checked **once, at the tier level**, and that its line contents are outside the control.
2. **`delivered` is asserted, not derived.** The set is fourteen hand-copied strings. Nothing compares it
   to `TIERS.md`, to PRD §7, or to R1.x — so a line can sit in `delivered` and be undeliverable, which is
   not hypothetical: *"Share by WhatsApp or email, client accepts online"* is in the set and H9 shows the
   two halves are not simultaneously true for a client with no email. The guard proves the page agrees
   with **this file**, which is one author's reading of the plan, not the plan.

The exact-string coupling is worth defending, though, and the task asks: a reworded line falls out of the
set and the test fails **loudly**, which is a useful tripwire rather than drift — the failure is
noisy, local, and fixed by a deliberate one-line edit, which is exactly what the comment says it wants
("scope changes must pass through a deliberate edit"). Keep it. The drift risk runs the other way, in (2).

**What it would cost if built as written.** A green guard covering a page whose most-claimed tier is
unchecked, under a comment asserting it proves the page claims nothing absent. That is the shape Rule 21
opens with: a control that overstates coverage stops anybody asking the question.

**Suggested resolution.** Two sentences in the comment — the wholesale exemption checks a tier, not its
lines; and `delivered` is a hand-maintained restatement of the plan, so it bounds the page against this
file rather than against the PRD. Then close the second gap properly: keep a machine-readable delivered
set in **one** place both the site guard and a TIERS/PRD check read, which is the same remedy H15 needs.

---

## H20 · Smaller things, recorded without separate findings

- **`domain-model.md` §8, `acceptance` row.** Now reads *"**no** — the client signs online (ADR 0024) |
  First write wins; a second is refused, not merged"*. An entity that never syncs has no conflict rule; the
  right-hand column is vestigial from the previous version and will read to a builder as a sync-merge
  policy for a path that does not exist. Either delete it or relabel it as the server-side
  one-acceptance-per-issue rule it actually states.
- **`domain-model.md` §8 re-check list (R1.18e).** It checks tenant, user, client, entitlement and
  colleague-seal. It does not check that the **catalog prices the snapshot froze still exist** or that the
  sealing user's **role still permits** sealing, and it does not say what happens when the *client was
  soft-deleted* while the device was offline — R1.3 guarantees a client on an issued quote never vanishes,
  but this seal is not yet issued, so the two rules meet in an undefined place.
- **`PRD.md` R1.32** says *"3 distinct jobs numbered"* without naming the entity the meter keys on. A
  revision is a new `quote_issue` taking a new number from the same series, so the meter must key on
  **quote**, not on numbers allocated. Worth one clause, since "revisions are free" depends entirely on it.
- **`PRD.md` §8a** now records all four questions as answered, which is right — but item 2 still ends
  *"`TIERS.md` and the site copy are **owed**"* although both were amended in this same commit. A stale
  "owed" in a closed answer is how the next reader loses confidence in the section.

---

## Summary table

| id | severity | one line |
|---|---|---|
| H1 | blocker | §6.2a's headline invariant still says "accepted variations"; G1's defect survives in the document G1 named |
| H2 | blocker | The "closed and named" `issue_balance` writer set omits the acceptance transaction and withdrawal; G2's hole moves to the acceptance path |
| H3 | blocker | R1.22b rewrites `accepted_total`; R1.24b says it is written once and never again |
| H4 | blocker | Withdrawing an acceptance has no defined effect on `issue_balance` or on variations already recorded |
| H5 | blocker | §6.3 tests "superseding an accepted issue" as impossible eleven lines above the remedy that requires it |
| H6 | blocker | Two disagreeing quote state machines now live in `domain-model.md` (§6.3 and §8) — the G3 pattern, third occurrence |
| H7 | blocker | "Offered as a revision" needs an UPDATE on an immutable sealed snapshot, or the offline revision the same requirement forbids |
| H8 | blocker | Pending claims cannot coexist with "Email unique globally"; no entity holds them; R1.30c cites the index that prevents them |
| H9 | blocker | Acceptance now requires an email channel; nothing requires a client to have one; the site sells it as delivered |
| H10 | major | The verified channel is supplied by the tenant, so the e-signature proves nothing against the likeliest forger |
| H11 | blocker | Offline variations have no idempotency key and are immutable — a retried outbox entry raises the ceiling permanently |
| H12 | major | Blocked seals: no order, no user choice, no month-quota rule, no release other than upgrading, no bound |
| H13 | major | R1.30a/R1.30c quote Rule 14 wording this commit deleted; the Rule 23.3 citation list was cleared unread |
| H14 | major | R1.30d's exhaustive bound drops the per-address limit, leaving the endpoint an email bomb at a known tenant |
| H15 | major | `TIERS.md` §3 still prescribes the typed name and a per-acceptance PDF hash; its Pro column still sells three release-2 features |
| H16 | major | `site.ts` cites a `honestClaims` symbol that does not exist — M14's own defect, re-committed in M14's fix |
| H17 | major | The new multi-round-trip acceptance flow runs on the surface R1.21a protected for reads only, against a short-lived code |
| H18 | minor | PRD §7 still meters "jobs quoted"; the site's Free offline line omits the refusal that makes it conditional |
| H19 | minor | The new guard's coverage note omits the wholesale exemption and the unvalidated `delivered` set (Rule 21.4) |
| H20 | minor | Four smaller items: a vestigial sync conflict rule, three gaps in the re-check list, the meter's key, a stale "owed" |

---

## Verified closed — checked by reading the amended text, not the table

These were attacked and held. Where a G-finding is listed here, its *named* defect is genuinely gone.

- **G3 (blocker) — closed, and well.** `domain-model.md` §4's numbering section now names allocate-at-sync
  as the release-1 choice, agrees with §6.1a, and keeps the rejected reasoning visible with the conflation
  named. §6.1a and §8 both say "the server allocates at sync (release 2: from a device lease)". I could
  find no remaining sentence in either document choosing device blocks for release 1.
- **G2's stated hole — closed.** "What creates the row" is now answered ("in the same transaction as the
  acceptance, unconditionally"), and the empty-`FOR UPDATE` trap is explained in both `domain-model.md`
  §6.2a and `PRD.md` R1.24a. The fix is correct as far as it goes; H2 is about what the fix left out, not
  about this.
- **G12 — closed on both halves it named.** `accepted_total` has one named producer and the reconciliation
  job has a cadence (nightly, per tenant), an action (audit, alert, refuse further invoicing) and an
  explicit refusal to self-heal, in `domain-model.md` §6.2a and `PRD.md` R1.24b/R1.24e. H3 is a collision
  with an older requirement, not a defect in this text.
- **G6 — closed.** `catalog_synced_at` now has a reader in both documents (`PRD.md` R1.13a,
  `domain-model.md` §6.1a): shown on the sealing screen, a 7-day configurable warning, printed on the
  internal copy, never blocking. The "visible rather than deniable" over-claim was removed from both
  places rather than one, which is what the earlier passes kept getting wrong.
- **G7 — closed.** One hash, on `document_render`; `domain-model.md`'s `acceptance` row now explicitly
  carries no hash of its own and references the render row, matching `PRD.md` R1.16a and R1.20.
- **G14 — closed, and it is the strongest edit in the commit.** `THREAT-MODEL.md` §4a exists, covers the
  phone as a data location, and the false control was *removed rather than softened*: both §4a and
  `domain-model.md` §8 now say sign-out revokes the session and the wipe happens on next connect. Finding a
  false control on the last pass and correcting it downward is the behaviour Rule 21 is asking for.
- **G5's retention half — closed.** `PRD.md` R1.18d and `domain-model.md` §8 both forbid any timer from
  deleting a sealed document that has not reached the server. (G5's *state* half is H6; its *queue* half
  is H12.)
- **G10 — closed.** R1.8 now names all four parameters (Galaxy A15-class device, cold-start state with the
  recipe unopened, aeroplane mode, waits-not-thinking), and R1.42 makes §10's six measures a requirement
  with the "no personal data" constraint stated.
- **G15 — closed, including the part that required admitting something.** N3 now says `issue_balance` **is**
  updated and is deliberately not a document; N4 says sunlight legibility has no automated test and is a
  person's job. N5, N9 and N10 name real instruments.
- **G16 — closed.** R1.22e was renumbered to R1.21a and sits in W5; W6a's a-f sequence is intact. One
  ordering oddity remains (R1.22f is listed before R1.22a, and R1.24d before R1.24a) but the addressing is
  sound and Rule 23.1's append-never-insert discipline is respected.
- **G17 — closed.** ADR 0024 is now carried by R1.20-R1.20d, R1.20a states the "never assert what it
  proves" position, §8a item 4 records the owner's answer, and the site copy dropped "you have their answer
  in writing".
- **G11's device-fingerprinting half — closed, and correctly.** It is removed from `PRD.md` R1.30d and from
  Rule 14, with the privacy cost named. The CGNAT reasoning is right. (What replaced it is H14.)
- **G4's diagnosis — closed; its remedy is H7.** The unique index on (quote, revision) is the right
  mechanism and the hazard is now stated in both documents.
- **F5/M14's site over-claim — genuinely fixed on the page itself.** Every previously-unmarked Pro line is
  now either in the `delivered` set or carries "(coming in release N)", Business is marked wholesale, and a
  real test enforces it with a recorded plant (Rule 21.2). The guard is a net improvement over the prose
  citation it replaced; H19 is about its coverage statement, H16 about its name.

## What this review did not examine (Rule 21.4)

- **I did not run anything.** No test suite, no build, no `npm install`, no `check_rules.py`, no
  `check_dispositions.py` — the task forbade it. So every claim here about the guard's behaviour is read
  from its source, not observed. In particular I did **not** verify that `site-guards.test.ts` currently
  passes, that the `delivered` strings match `site.ts` byte-for-byte (I compared them by eye), or that the
  two plants described in the commit message actually fired.
- **I did not verify the disposition table mechanically.** I spot-checked the six rows the task named (G1,
  G2, G5, G9, G12, G13) against the amended text, plus G3, G4, G6, G7, G10, G11, G14, G15, G16, G17 as they
  came up. I did **not** check G8's row, and I did not re-derive `check_dispositions.py`'s citation
  arithmetic.
- **Documents I did not read for this pass:** `DEVELOPMENT-BRIEF.md`, `BRIEF-STATUS.md`, `PHASE-0-AUDIT.md`,
  `ARCHITECTURE.md`, `MODULE-SEAMS.md`, `SYNC.md`, `COMPLIANCE-REVIEW.md`, `MISTAKES.md` (beyond the M13/M14
  references), ADRs 0001-0022, and `PRD-REVIEW.md` (review 1) except where review 2 quoted it. A
  contradiction between `24efe32` and any of those is outside what I checked — and `SYNC.md` in particular
  is a live risk given how much of §8 changed.
- **Code I did not read:** everything except `new-app/web/content/site.ts` and
  `new-app/web/test/site-guards.test.ts`. I did not look at `packages/core`, the API, any migration, or the
  existing entitlement resolver — so I cannot say whether the documents contradict what is already built
  (Rule 1.2's question). The physical schema does not exist yet, so "does the model match the database" was
  not answerable and was not attempted.
- **Not assessed:** whether the 72-hour expiry, the 7-day catalog threshold, the default lease of 50, or
  "nightly" are the right *values*. Whether Jamaica's Electronic Transactions Act is satisfied by R1.20 —
  correctly the attorney's question (R1.20a), and I did not research it. Whether ADR 0023's commercial
  judgement (offline sealing free, one recipe free) is right; it is the owner's call and I only checked that
  the documents now agree with it.
- **One sample only (Rule 21.6):** several findings above rest on a single read of a single file version at
  commit `24efe32`. Where I assert something is absent — no `pending_registration` entity, no
  `honestClaims` symbol, no idempotency key for variations, no per-address send limit — that is from
  targeted greps quoted below, not from an exhaustive read of every document in `docs/`.

## The direct answers

**Are W4, W5, W7 and W9 buildable now?**

- **W4 (Issue) — no.** Three blockers sit on it, all created by this commit: the document holds two
  different quote state machines (H6), the impossible-transition list contradicts the new withdrawal
  remedy (H5), and the refused-second-device remedy requires mutating an immutable sealed snapshot (H7).
  A builder cannot write `quote_issue`'s state column or its guard tests from §6.3 and §8 as they stand.
- **W5 (Share and accept) — no.** Acceptance now requires a verified email channel that nothing guarantees
  a client has, and the fallback offered is an offline paper upload (H9). The evidentiary premise of the
  whole redesign is also unstated (H10), and the flow's runtime behaviour on the sleeping free instance is
  undefined (H17). The *share* half is buildable; the *accept* half is not.
- **W7 (Invoice and get paid) — no.** The ceiling has two definitions in its own design section (H1), the
  producer of `accepted_total` is specified twice with opposite rules (H3), the writer set that makes the
  lock trustworthy is wrong on the day it was written (H2), and the newly-permitted offline variation can
  raise the ceiling twice with no key and no remedy (H11). This is the most important arithmetic in the
  product and it is the least buildable of the four.
- **W9 (Subscribe) — no.** The uniqueness rule the whole sign-up rests on cannot be implemented as cited
  (H8): the entity that holds a pending claim does not exist in the model, the index the PRD names would
  forbid the race the PRD then describes resolving, and Rule 14 still creates the tenant at a moment the
  PRD has moved. H14 adds a missing control on the one unauthenticated endpoint.

**Is the physical schema safe to write from the domain model as it stands? No.** Five specific things
would be wrong on the first migration: `user.email`'s unique index would be built globally, silently
disabling R1.30e's protection and with no table for pending claims (H8); `issue_balance` has no stated
key or unique constraint and one of its columns has two contradictory write rules (H2, H3);
`quote_issue`'s state values differ between §6.3 and §8, and one of the two remedies the design now
requires needs an UPDATE path on that table, which N3 forbids (H6, H7); `variation` has no idempotency
key despite being createable offline (H11); and `acceptance` has no stated shape for the withdrawal the
design now permits against an immutable row (H4, H5). Four of those five are consequences of edits made
in `24efe32`. The model is close — §6.2a, §6.1a and the sync table are in much better shape than they
were two passes ago — but it is one more amendment-and-review cycle away from being a schema.

**And the pattern held.** Eleven of the twenty findings above are defects in text written by this commit;
two are G-findings still standing under rows claiming them closed. The commit's own refusal to claim that
this pass introduced nothing was the correct call, and Rule 24.6's second half is what caught it again.
The same prior should be applied to whatever closes these.

## Commands run

```
git log --oneline -5
git show --stat 24efe32
git show 24efe32 -- docs/RULES.md docs/TIERS.md docs/rules-manifest.json new-app/web/content/site.ts
git show 24efe32 -- docs/design/domain-model.md
git show 24efe32 --format="" -- docs/PRD.md
ls -la docs/ new-app/web/test/
ls docs/adr/
grep -n "unique globally\|Email unique\|^| \`user\`\|^| \`client\`\|^| \`tenant\`" docs/design/domain-model.md
grep -n "^#\{1,4\} " docs/design/domain-model.md
grep -n "R1\.[1-5]\b\|R1\.22[c-e]\|R1\.23\b" docs/PRD.md
grep -noE "[A-Za-z0-9_./-]+\.(ts|tsx|py|test\.ts|md|json|sql|yml)" docs/PRD.md | sort -u -t: -k2
grep -n "honestClaims\|delivered\|describe(\|it(" new-app/web/test/site-guards.test.ts
grep -n "order\|queue\|blocked\|cross-month\|upgrad\|refus" docs/adr/0023-release-1-metering-and-tier-boundaries.md
grep -n "^## G\|^| G[0-9]" docs/PRD-REVIEW-2.md
sed -n '309,340p' docs/design/domain-model.md      # §6.3 state machines
sed -n '250,308p' docs/design/domain-model.md      # §6.2a in full
sed -n '137,162p' docs/design/domain-model.md      # §5 Directory, client row
sed -n '140,150p;262,300p;300,318p;318,335p;405,435p' docs/PRD.md
sed -n '1,33p;75,140p' docs/TIERS.md
sed -n '330,360p' docs/RULES.md                    # Rule 14 as amended
awk '/^## 21\./,/^## 22\./' docs/RULES.md          # Rule 21
awk '/^## 23\./,/^## 24\./' docs/RULES.md          # Rule 23
awk '/^## 24\./,0' docs/RULES.md                   # Rule 24
awk '/## 4a/,/## 5/' docs/THREAT-MODEL.md
sed -n '490,545p;678,716p' docs/PRD-REVIEW-2.md    # G9, G13 in full
sed -n '232,310p' new-app/web/test/site-guards.test.ts

# the absence claims, verified rather than assumed (Rule 21.6)
grep -rn "pending_registration\|pending claim" docs/design/domain-model.md docs/PRD.md
  -> two hits, both in PRD.md R1.30e; no entity, no column, nothing in the model
grep -rni "idempot" docs/PRD.md docs/design/domain-model.md
  -> one hit: `outbound_message`, "Idempotent per (document, template, recipient)".
     Nothing for `variation` or `invoice` (H11)
grep -rn "honestClaims" new-app/web/
  -> site.ts:192 (the comment) and a .next build-cache copy of it. No such symbol in any test
git status --porcelain
  -> "?? docs/PRD-REVIEW-3.md" only
```

Nothing was modified except this file. No git state was changed: no checkout, no restore, no commit, no
branch. `original-app/` was not read or touched.
