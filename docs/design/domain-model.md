# Design: the domain model

**Status: APPROVED by the owner 2026-09-25 · independent review OUTSTANDING (Rule 1.10).** Approval
answers "is this what I want"; it does not answer "will this do what it says". Both are required
before code is built from a plan, and the second gate was added to the rules the same day this was
approved — so schema work waits on the review, which runs alongside the PRD's
([`../PRD-REVIEW.md`](../PRD-REVIEW.md)). Each piece still needs its own design for what this document
leaves open (§10), and the physical schema is its own step.

Date: 2026-09-24, approved 2026-09-25 · Brief §6, §10, §13, §14 · Rule 1.2
Answers to §11's two blocking questions: [ADR 0022](../adr/0022-one-tenant-per-user-and-no-client-logins.md)

---

## 0. How this was designed, and why that matters

The owner's instruction, verbatim: *"DO not build the architecture just based on what exists,
build it based on what is needed for the product delivery and if we need to go back and correct
then we will."* That is now Rule 1.2, and it changes the method.

So this document starts from **what has to happen in the world** — Delroy standing at a fence line
with a client waiting, then getting paid for it — and names the entities that story requires. The
existing application's 34 inventoried features and the nine infrastructure tables already built are
used afterwards, as a **check for things forgotten**, never as the starting shape. Where the new
model disagrees with what exists, the model wins and the existing work is corrected. §9 lists
exactly where that happens, so nothing is quietly abandoned.

Two other things shaped it. Nothing here carries a name from one trade or one country, because the
product is one product built to verticalise later (ADR 0017). And every entity is written to be
**reachable offline and reconcilable on sync** (brief §13), because a sync model bolted on
afterwards is how the existing application's highest-risk component came to be unreviewed.

---

## 1. The story the model has to support

1. **Delroy meets a client at a fence line.** No signal. He needs prices he can stand behind: his
   material costs, his labour rates, and a fence he has priced before.
2. **He prices the job on the spot**, mostly by picking a recipe and changing the length.
3. **He issues it** — a number, a branded PDF, a total he has committed to.
4. **The client accepts** it, possibly days later, possibly by tapping a link.
5. **The client wants a change.** The accepted price cannot be quietly edited.
6. **He asks for a deposit**, then progress payments, then the balance.
7. **He records what the job actually cost**, and sees whether it made money.
8. **He pays us**, sometimes by depositing cash at a bank and uploading a receipt.

Every entity below exists because one of those eight steps cannot happen without it. An entity that
cannot be traced to a step is not in this document — the test I applied while writing it.

---

## 2. The shape: six contexts

Grouped by **what breaks together**, not by table similarity. A change to tax treatment touches
Documents and nothing else; a change to the tier ladder touches Commerce and nothing else.

| Context | Holds | Changes when |
|---|---|---|
| **Tenancy** | tenant, user, role, capability, document settings, numbering | Rarely. It is the spine. |
| **Directory** | client, supplier, material, labour rate, equipment, trade, recipe | Constantly, by the tenant. |
| **Documents** | quote, issue, variation, acceptance, invoice, payment, retention | Per job. The heart of the product. |
| **Delivery** | outbound message, share link, document render | Per send. Isolated because it talks to the outside. |
| **Work** | project, purchase, labour entry, crew, job result | After the job is won. |
| **Commerce** | plan, entitlement, subscription, platform payment, receipt, support thread | Our relationship with the tenant, not theirs with their client. |

**Documents and Commerce must never share a table.** They are both "payments" in English and
nothing else: one is the tenant's client paying the tenant, the other is the tenant paying us, with
different currencies, different approval rules and different people allowed to see them. The
existing application's `payment` table mixing the two is how a tenant's own invoice history ended up
one join away from platform billing.

---

## 3. Conventions that apply to every entity

These are settled by work already landed, and are stated here so no entity re-litigates them.

1. **Identity: client-generated UUIDv7** (ADR 0019). Delroy's phone mints the id, so a retry over a
   bad connection can never create two fences. Time-ordered, so it indexes like a sequence.
2. **Versioning: `version` integer, compare-and-set on every write.** Two devices editing one draft
   is the normal case, not the exception.
3. **Deletion: `deleted_at` tombstones.** A hard delete would leave an issued quote pointing at a
   material that no longer exists, and the issued quote is a commitment.
4. **Tenant scope: `tenant_id` on every business row, with row-level security** (ADR 0012). The
   exceptions are named in the policy-parity exemption list with reasons, and there are no others.
5. **Money: integer minor units in a 64-bit column, with an explicit currency.** The owner's ceiling
   is ~999,999,999.99 JMD, which is 99,999,999,999 minor units — **47× past the 32-bit limit** that
   capped the existing application at $21,474,836.47 (ADR 0011). No float touches money anywhere.
6. **Two currencies, never conflated:** the tenant's trading currency (what they quote in) and the
   platform's billing currency (what they pay us in). A Trinidadian tenant quotes TTD and may be
   billed in USD.
7. **Rates are recorded, not referenced.** Any document that computed a tax stores the rate it used,
   because a rate change must not silently restate last year's invoice.
8. **Time: `timestamptz` always, with the jurisdiction's timezone for day boundaries.** "Expires on
   the 14th" is a local-day question, and the existing application answered it Jamaica-wide.

---

## 4. Tenancy

| Entity | Purpose | Key invariants |
|---|---|---|
| `tenant` | The contracting business. | Country and trading currency set at creation and not casually changed. Suspension is a field, not a deletion. |
| `user` | A person who signs in. | Belongs to exactly one tenant. **Email unique globally**, which is what enforces the owner's rule that a second business needs a second address (11a). |
| `membership_role` | What a user may do inside the tenant. | At least one active owner at all times; the last owner cannot be demoted or deactivated. |
| `platform_capability` | What one of **our** staff may do. | Every grant has a granter (least privilege is only real with an author). Holding one requires a confirmed second factor (ADR 0021). |
| `document_settings` | Logo, header details, two colours, default terms. | One per tenant. A small fixed set of fields, never free-form CSS or an uploaded template. |
| `number_series` | Prefix, next number, reset rule (never / yearly / monthly). | One per tenant **per document kind**. Allocation is atomic and gapless per series. |

**Numbering, rewritten 2026-09-25 (review finding G3).** This section previously rejected "allocate at
sync" and chose device number blocks — and then §6.1a split sealing from numbering and made the opposite
choice for release 1. **The contradiction sat inside this one document**, in the commit that logged the
same failure as M13. That is what is being corrected here, and the old reasoning is shown rather than
deleted because the reason it was wrong is the useful part.

A number must be unique and answerable to an accountant. Three options:

- **Chosen for release 1: allocate at sync, server-side.** The old objection was that *"the client sees
  'Quote #pending' on the PDF"* — and that was **false reasoning from a conflation.** The client at the
  gate is not shown a PDF; they are shown a **price** (§6.1a). The numbered document reaches them when the
  device syncs, minutes or hours later, which is how quoting already works. Server allocation is also
  **strictly gapless**, which is the property an accountant actually asks about.
- *Allocate from the series on the device, directly.* Two devices produce the same number. Rejected, and
  this rejection stands.
- *Device number blocks — release 2, if it is earned.* A device leases a contiguous block while online
  (default 50) and consumes from it offline, so a number exists at the moment of sealing. Unconsumed
  numbers in an expired lease are **burned, not reused**: a gap is a question an accountant can get an
  answer to, whereas a reused number is two documents with one identity, which is unanswerable.

**So release 2 buys "the number exists at the gate" and pays for it in gaps.** That is a real trade and
release 1 will say whether anybody wants it — which is the honest reason to defer it, rather than the
imaginary "#pending" PDF. If it is built, it gets its own ADR, because burning numbers is the one place
this design would accept a visibly imperfect outcome on purpose.

---

## 5. Directory

| Entity | Purpose | Key invariants |
|---|---|---|
| `client` | The tenant's customer. | Soft-deleted only. A client named on an issued quote can never vanish from it. |
| `supplier` | Where materials come from. | |
| `material` | A priced item: unit, category, supplier, cost, optional sell price. | Cost is a **current** price and is expected to change. Nothing issued reads it live. |
| `labour_rate` | A trade's rate, per hour or per day. | |
| `equipment` | Owned or hired plant, with a rate. | |
| `trade` | The shared trade list (masonry, plumbing…). | Platform-owned reference data, readable by all tenants, writable by none. |
| `recipe` | A job priced once and reused: a named set of material, labour and equipment lines with quantities, usually per unit of measure. | **The product's differentiator.** Quantities may be expressed per driving dimension (per metre of fence) so changing one number reprices the job. |
| `price_observation` | What a tenant actually paid, captured when a material cost changes. | Append-only. Feeds the price index, and **only with the tenant's consent recorded at sign-up.** |

`price_observation` is the entity with a deadline attached. The aggregate price index is the most
defensible asset in the business and it cannot be consented to retro-actively, so **the consent
clause must be settled in the terms before the first tenant registers** (brief §5a). The entity is
designed now, and writing to it stays switched off until the clause exists — the switch is the
tenant's recorded consent, not a configuration flag.

**Recipes are why the offline cache is not optional.** A recipe expands into lines that reference
materials and rates; expanding it requires all of them present on the device. So the offline cache
is: clients, materials, labour rates, equipment, recipes, tax configuration, document settings and
the logo. That is the whole answer to brief §13's "which data is cached".

---

## 6. Documents — the part that must be right

This is where the existing application's real defect lives, and where the model differs most.

### 6.1 A quote is two things, and conflating them is the defect

`quote` is the **working document**: editable, versioned, mergeable between devices, worth nothing
to anybody outside the tenant.

`quote_issue` is an **immutable snapshot**, written once when Delroy taps *Issue*. It carries every
line with its frozen description, quantity, unit price, tax treatment, markup and discount, the tax
rates it used, the currency, the terms wording, the document settings as they were, `sealed_at`, and
`catalog_synced_at` — when the prices it froze were last refreshed from the server. **No column on it is ever updated.**

### 6.1a Sealing, numbering and delivering are three acts, not one (amended 2026-09-25)

The first version of this section had the number *on* `quote_issue`, and §8 said issuing offline was
allowed with a leased number. The PRD then scoped release 1 as "issuing requires connectivity" and
deferred leases. Two live documents disagreeing about the same thing, in the document the physical
schema is built from — recorded as M13, and the owner's requirement is what resolved it: **the data
must be captured offline and held until the device can sync.** That is not the same as allocating an
official number offline, and separating them dissolves the contradiction.

| Act | What it does | Needs a server? |
|---|---|---|
| **Seal** | Freeze the lines, prices, tax rates, currency, terms, settings, totals and `catalog_synced_at` | **No** — happens on the device, offline |
| **Number** | Allocate from the tenant's series: unique, gapless, answerable to an accountant | **Yes**, or a device lease (deferred) |
| **Deliver** | Render the PDF, mint the share link, send it | Yes |

**`issue_number` is its own insert-only table** — one row per issue, carrying the series, the number
and `allocated_at`. This is the load-bearing choice. A nullable `number` column on `quote_issue`,
filled in later, would mean an UPDATE on a sealed financial document, and this section's whole argument
is that immutability must not depend on every future query being careful. A separate row keeps
`quote_issue` with **no UPDATE path at all**.

**`catalog_synced_at` has a reader, or it is decoration (G6).** Storing it and calling a stale price
"visible rather than deniable" was an invariant with no owner — the exact thing §6.2a was being corrected
for. So: the sealing screen shows how old the cached prices are; beyond a tenant-configurable staleness
threshold (default 7 days) sealing **warns before it proceeds**; and the value is printed on the internal
copy of the document so a later argument about a price has a date attached. It never blocks sealing —
refusing to price a job because the catalog is old is the one failure the product cannot afford.

**A sealed issue is not deliverable until it has an `issue_number` row.** "Sealed, awaiting number" is
a real state the app shows plainly. What the client sees at the gate is the sealed total on screen —
the promise is *price* the job while standing there, not *send* it from there.

**Why this makes release 2 cheap instead of dangerous.** Adding device leases later changes only *who
inserts the `issue_number` row and on whose authority* — the device from a lease, rather than the
server at sync. No schema change to issued financial rows, which was the migration hazard. And note
the trade-off honestly: **server allocation is strictly gapless; leases burn numbers and create gaps.**
Release 2's offline issuing is therefore a trade-down on the property an accountant cares about, worth
buying only if contractors actually hit the wall.

Why a separate entity rather than a frozen flag: a flag is one forgotten `WHERE` clause away from an
edited commitment, and "issued documents are immutable" then depends on every future query being
careful. A table with no UPDATE path does not depend on anybody being careful — the same reasoning
that made the audit log append-only by the **absence** of a policy (ADR 0020), and it is enforced the
same way.

A revision is a **new issue** of the same quote, at the next revision number, with the previous one
marked superseded. The client can therefore be shown exactly what they were sent, months later,
including which of three versions they accepted.

### 6.2 The rest

| Entity | Purpose | Key invariants |
|---|---|---|
| `quote_section` | A named, ordered group of lines, so a quote reads the way a contractor talks about the job. | Belongs to one quote. Named by review (F14): the requirement existed with no entity to live in. |
| `quote_line` | A line on the working quote, in a section, ordered. | Belongs to one quote and one section. Recipe-expanded lines remember the recipe, so a recipe change can offer to refresh a draft — never an issue. |
| `variation` | A change to accepted work: added, removed or altered scope, with its own price. Immutable once recorded; a mistake is corrected by another variation. Carries `client_reference`, a device-supplied idempotency key unique per issue, because it may be recorded offline and replayed — and a duplicate of an append-only row that feeds the ceiling raises it permanently (H11). | First-class, not a new quote — the client has already accepted the original. **Release 1 records it; release 2 makes it signable** (PRD W6a). Until then it carries `recorded_by_user_id` and is what the ceiling in §6.2a measures against, so "who agreed to the extra $40,000" has an answer of *known strength* rather than a signature it does not have. |
| `acceptance` | The client accepting or declining an issue. | Records the signer's name, timestamp, IP, user agent, the verified channel and the consent-to-sign (ADR 0024), and **references the `document_render` row whose hash is the document signed** — it does not carry a hash of its own (F17). Immutable. One acceptance per issue. |
| `invoice` | A demand for payment against an accepted issue. | **Deposit, progress and final invoices against one issue** — the top-ranked missing feature. The sum of issued invoices may never exceed the accepted total plus accepted variations, which is the single most important arithmetic invariant in the product. |
| `invoice_line` | Either a share of the issue (percentage or amount) or a named extra. | Frozen at issue, like the quote. |
| `client_payment` | Money the tenant's client paid them: amount, date, method, reference, optional receipt file. | Never exceeds the invoice balance. Recording one is derived, not stored: invoice status is **computed** from its payments, retention and credits. |
| `retention` | A percentage held back and released later. | Releasing it **re-derives** the invoice's status. (The existing application does not, which is a recorded open defect.) |
| `credit_note` | A reduction after issue. | The only way to reduce an issued invoice, because the invoice itself cannot be edited. |

**Two more fields the requirements need, named by review (F14).** `quote.client_detail_level`
(summary or itemised) decides what the client is shown and is **frozen into the issue**, because
changing it later would alter a document already sent. And a tenant reading their own audit trail is a
**capability on the existing `audit_entry`**, not a new entity — it needs a redacting read path, which
is owed work already recorded against ADR 0020, not a table.

**Invoice status is derived, never stored.** A stored status is a second source of truth that drifts
from the payments, which is precisely how the existing application's CSV export came to report a
negative amount due. The trade-off is a slightly more expensive read, paid for with an index.

### 6.2a The money invariant has an owner (amended 2026-09-25)

**The invariant:** the sum of issued invoices against an accepted issue may never exceed the accepted
total, plus accepted variations, where those exist.

The first version of this document stated that twice in prose and never said where it is enforced —
found by review as the exact thing Rule 1.10 names, *"an invariant with no owner"*. Prose is not an
owner. It cannot be a column `CHECK`, because it is a **cross-row aggregate**; it is not a unique
index; and §3's `version` compare-and-set protects one row and does nothing about two invoices that
are each individually under the total and together over it. That failure is silent, arrives as real
over-billing of a real client, and is found by their accountant rather than by us.

**The mechanism: an `issue_balance` row, locked for the duration of the transaction that issues an
invoice.** One row per accepted issue.

**Amended 2026-09-25 (G2, G12), and the correction matters more than the original.** The first version
said "take `SELECT … FOR UPDATE` on the issue's `issue_balance` row" and never said what creates that row.
**A `SELECT … FOR UPDATE` that matches zero rows takes no lock at all** — so the very first pair of
concurrent invoices, which is the case this exists to stop, would have sailed through. A mechanism with a
missing precondition is not a mechanism.

**When the row is created: in the same transaction as the acceptance, unconditionally.** An issue becomes
accepted and acquires its balance row together, or neither happens. That removes the empty case rather
than defending against it, and it is the only ordering that cannot be forgotten later.

| Column | Kind | Who writes it |
|---|---|---|
| `issue_id` | identity | the acceptance transaction |
| `accepted_total` | **derived, written once** from the accepted issue's own frozen lines | the acceptance transaction, never again |
| `variations_total` | **derived cache**, re-summed from `variation` rows | every variation, inside the lock |
| `invoiced_total` | **derived cache**, re-summed from issued invoices | every invoice and credit note, inside the lock |

**Every writer takes the lock.** The set is closed and named, because an unenumerated writer set is how a
locked row stops being locked: issuing an invoice · voiding an invoice · a credit note · recording a
variation · the reconciliation job. Any future writer joins this list or it does not ship.

Issuing an invoice is one transaction: lock the row · re-sum from the rows rather than trusting the
cached figure · **refuse** if the new total would exceed `accepted_total + variations_total` · insert the
invoice and update the balance. Re-summing inside the lock is what makes the cached columns a genuine
cache rather than a second source of truth — the decision is never taken on the cached number alone.

`accepted_total` is a **copy**, and Rule 7 says one rule lives in one place, so its producer is named:
the acceptance transaction computes it from the issue's frozen lines, and nothing else ever writes it.
The issue is immutable, so the value it derives from cannot change — which is what makes the copy safe
here and would not make it safe anywhere else.

**The reconciliation job has a cadence and an action**, because a job with neither is a comment: nightly,
per tenant, it rebuilds all three derived columns from the underlying rows and compares. On a mismatch it
**writes an audit entry, alerts us, and refuses further invoicing against that issue** until a human has
looked. It does not silently self-heal — self-healing would erase the evidence of the defect that caused
the drift.

Retention and credit notes feed the invoice *status* derivation, never this ceiling: money held back or
credited does not raise how much may be billed.

**This is money arithmetic, so it is judgement-class work under Rule 16.5** and its tests are planted
defects: two concurrent invoices, a queued offline replay, and a variation arriving between the read
and the write.

### 6.3 The two state machines

```
quote:        draft ──issue──▶ issued ──▶ superseded (by a later revision)
                │                │
                └──abandon──▶ abandoned
                                 └──expire──▶ expired  (per the jurisdiction's day boundary)

issue:        issued ──accept──▶ accepted ──▶ invoiced (partly) ──▶ settled
                │                    │
                └──decline──▶ declined
```

Transitions that must be impossible, and are therefore tested: editing an issue; accepting a
superseded issue; accepting twice; **superseding an issue that has been accepted** (G8 — the
acceptance hangs off it, so a revision would orphan it, and the path is a variation); invoicing a
declined issue; invoicing past the accepted total; recording a payment against a draft invoice;
releasing retention twice; **sealing a second issue for the same (quote, revision)** (G4).

**One transition that must be possible, and was missing (G8):** an acceptance may be **withdrawn** —
recorded, audited, with a reason, and **only while no invoice exists against it** — which returns the
issue to superseded-able. Without it a non-price error on an accepted issue (the wrong client, the
wrong terms, the wrong tax treatment) had no remedy at all, because a variation answers "the scope
changed" and nothing else. Once an invoice exists the remedy is a credit note and a fresh quote,
since money has moved.

---

## 7. Delivery, Work and Commerce

### Delivery

| Entity | Purpose | Key invariants |
|---|---|---|
| `outbound_message` | One queued send: channel (email / WhatsApp / link), recipient, template, status, attempts, provider id. | **Every send goes through this table.** A reminder, a digest and a quote email are one entity with three templates, so "was it sent" has one answer and retries have one place to live. Idempotent per (document, template, recipient). |
| `share_link` | A capability URL for a client with no account. | High-entropy token, hashed at rest, scoped to one issue, expiring, revocable. It is a credential and is treated as one. |
| `document_render` | A produced PDF: storage key, hash, the settings used. | Immutable, and the hash is what `acceptance` and `quote_issue` point at. |

### Work — deliberately shallow

| Entity | Purpose |
|---|---|
| `project` | The job, linking an accepted issue to what actually happened. |
| `purchase` | Money spent on materials for it. |
| `labour_entry` | Hours worked, by whom, at what rate. |
| `crew` / `crew_member` | Who does the work, with cost rates (Business tier). |
| `job_result` | The computed comparison: quoted, invoiced, spent, margin. Derived, never stored. |

The line is drawn here on purpose (brief §5a): costing stays **shallow**. The moment it grows a
chart of accounts, journals or a trial balance, it has become an accounting product and the decision
is revisited rather than drifted past.

### Commerce

| Entity | Purpose | Key invariants |
|---|---|---|
| `plan` | A tier, as **data**: name, prices per country, and its entitlements. | Never a boolean on the tenant. The existing `plan: free \| pro` is the shape that made every limit a code change. |
| `entitlement` | One named capability or limit (`invoices.enabled`, `users.max`, `quotes.per_month`). | One resolver answers "may this tenant do this", enforced on the server. The client may ask; it may never decide. |
| `subscription` | A tenant on a plan, with a period and a state. | State derives from approved payments and the period, not from a staff member's toggle. |
| `platform_payment` | The tenant paying **us**: amount, method, state, and the separation-of-duties record. | See below. |
| `deposit_receipt` | An uploaded proof: file, amount, date, bank, reference, file hash. | Type- and size-restricted, malware-scanned, private, tenant-scoped. Duplicate detection on file hash **and** reference. |
| `support_thread` / `support_message` | The customer-service loop (brief §15). | A tenant sees only their own. Staff access is capability-gated and audited. |
| `feedback` | What tenants tell us, feeding maintenance. | |

**Separation of duties is modelled, not documented.** `platform_payment` names the submitter, the
approver and the activator as three distinct fields, and the invariant is structural: the approver
may not be the activator, and approval requires verification against the **bank statement** rather
than the uploaded receipt, recorded as a field rather than assumed. Activation may proceed only from
an approved payment.

And the honest case: with one person available, that invariant cannot hold. So a
`single_operator_exception` is a **recorded entity** — who, when, why, an alert to the owner, and a
required later second review — rather than a rule quietly relaxed. Configurable strictness, so it
tightens as staff are added. A control that cannot be satisfied gets bypassed; a control that
records its own bypass gets reconciled.

---

## 8. Sync, per entity

Brief §13 asks for conflict rules per entity. One table, because a general rule would be wrong
somewhere expensive.

| Entity | Offline | On conflict |
|---|---|---|
| Directory (materials, rates, clients, recipes) | read, and create new | **Server wins** on fields; local creations always push. |
| `quote` draft + lines | full edit | **Merge by line**, with a review step when both sides changed one line. Never silently discard a line. |
| `quote_issue` | **seal** (no number yet) | Append-only, so the ROW never conflicts — but two devices can seal the same quote, which is not a row conflict and is handled below (G4) |
| `issue_number` | **no** — the server allocates at sync (release 2: from a device lease) | Cannot conflict: one row per issue, unique per series |
| `variation` | create | Append-only; the ceiling is re-summed under the lock at sync (§6.2a), never computed on the device. A replay is refused by `client_reference`, not merged |
| `issue_balance` | **no** — server-side only, and never synced | It is a derived cache behind a lock. A device that could write it could defeat the lock |
| `acceptance` | **no** — the client signs online (ADR 0024) | First write wins; a second is refused, not merged |
| `invoice`, `client_payment` | read only in v1 | — |
| `project`, `purchase`, `labour_entry` | create and edit | Last-write-wins per row, with the audit trail carrying the loser. |
| Entitlements | cached with a **grace period** | Server wins on sync; the grace period is what stops a signal outage from stopping work. |

**Sealing offline is allowed and required; numbering offline is not** (§6.1a). Refusing to capture the
job offline would break step 3 of the only story that matters, so the snapshot is written on the device
and held in a durable outbox until it syncs. The number is allocated server-side at sync in release 1,
and from a device lease in release 2 — the same `issue_number` row either way.

**The outbox is generic, not issue-specific.** Every offline create queues in it, survives the app
closing, and shows what is pending. It is encrypted at rest against the device's own keystore and has a
retention limit that **may never delete a sealed document which has not reached the server**.

**Remote sign-out cannot reach an offline device, and this document will not pretend otherwise (G14).**
Brief §13 lists it as a control; it is a *server* control, and the offline device is precisely the case it
cannot touch. What it does: revokes the session, so the device can no longer sync or fetch, and the local
store is wiped **when it next connects**. Until then the tenant's catalog, client book and sealed documents
are on that phone. The mitigation that actually works is expiry, and the honest statement is in
`THREAT-MODEL.md` §4a rather than a claim here that we can wipe a phone we cannot reach.

**Two devices sealing one quote is the hazard the row-level answer hides (G4).** Delroy's phone and his
foreman's tablet both hold the draft; both go offline; both seal. Neither push conflicts — each is an
append — so both would be numbered, and the job would have **two issued identities**, which §11 calls
unanswerable to an accountant. Append-only protects the row and says nothing about the job.

**The defence: sealing claims the quote, and the claim is what conflicts.** A seal records the quote id and
the revision it sealed, and the server enforces **one sealed issue per (quote, revision)** with a unique
index. The second device's push is **refused, not merged** — it is told its colleague sealed this job, and
its sealed snapshot is kept and offered as a revision rather than discarded. The rule is: *one sealed
snapshot per revision of a quote, and a revision cannot be created offline.*

**"Sealed, awaiting number" is a state, so it belongs in the state machine (G5).** §6.3 had no node for it,
which left ADR 0023's cross-month metering case nowhere to attach a test:

```
quote:  draft ──seal──▶ sealed (awaiting number) ──sync──▶ issued ──▶ ...
                            │
                            └──refused at sync──▶ blocked (a colleague sealed it, or the
                                                  free-tier limit was reached) — the snapshot
                                                  is kept, never destroyed
```

A refused seal is **blocked, not lost**, and nothing in the outbox's retention limit may delete a sealed
snapshot that has never reached the server — a retention limit that can destroy the only copy of a
financial document is not a retention limit, it is data loss on a timer.

**What a seal must be re-checked against at sync**, because sealing offline means none of it was checkable
at the time: the tenant is not suspended · the user is still active and still a member · the client has not
been deleted · the entitlement still permits it (ADR 0023 meters at *numbering*, so the month is the month
it syncs) · and no colleague has already sealed that revision. Each refusal is explained to the user in
terms of what happened, not as a sync error.

**The residual risk, named rather than dressed up:** a device that seals and never syncs holds the only
copy. Mitigations are a visible pending count, a warning after a few days, and the fact that the draft
survives so the job can be re-priced. An outbox is not a backup and this document does not pretend it
is one.

---

## 9. Where this corrects work already built (Rule 1.2)

Named rather than left to be discovered:

1. ~~**`app_user.email` is globally unique; it must be unique per tenant.**~~ **WITHDRAWN
   2026-09-25 — the owner answered the question and the built schema is right.** I had written that
   two contracting businesses may legitimately share an owner's email address, and called it "the
   most consequential correction in this document". The owner's answer: one person **may** hold more
   than one business, **but with a different email account for each.**

   That makes global uniqueness not merely acceptable but the **enforcement mechanism** for the
   owner's rule — one address, one user, one tenant, and a second business requires a second
   address. The migration is cancelled, the sign-in lookup stands unchanged, and the "own design
   step" it was said to need does not exist.

   Worth keeping visible rather than deleting: the claim rested on an assumption about how
   contractors actually operate, which is not a question the code could answer. It was flagged as a
   question at the same time it was written (Rule 1.7), which is the only reason it cost nothing —
   had it been quietly acted on, it would have been a migration, a sign-in change and a weakened
   uniqueness guarantee, all to support a case that does not arise.
2. **`role` is a text field on the user; it must become `membership_role`** with the last-owner
   invariant enforced in the database.
3. **The audit log's `subject.type` union covers three infrastructure types.** It must grow with the
   model, and the `AuditAction` union with it.
4. **`platform_audit_entry` is still owed** for staff actions with no tenant (already recorded).
5. **Nothing in the nine existing tables is wasted.** Tenancy, sessions, credentials, MFA, rate
   limiting, audit and row identity all stand. The corrections above are two columns and a table
   rename, which is the cost of having built the spine before the body.

---

## 10. What this design deliberately does not settle

- **The PRD's scope for release one.** Which of these entities ships first is the next document, and
  it is a product decision, not a modelling one.
- **The physical schema.** Column types, indexes and partitioning come from the target-schema step,
  after this is approved.
- **Reporting and the dashboard.** Derived everywhere, and the existing dashboard was never
  independently reviewed — it gets its own design with its own tests rather than a line here.
- **WhatsApp Business templates.** Meta verification and per-message cost make it a Business-tier
  item with its own design (brief §12).
- **Data migration from the existing application.** Recorded in the audit's §5; it depends on the
  physical schema.
- **Any trade-specific or country-specific entity.** One product, verticalised later (ADR 0017).

## 11. What would make this design wrong

Stated so the review has something to aim at:

- ~~If tenants turn out to need **more than one business per account**~~ — **resolved 2026-09-25:**
  they may hold several, one email each, so the shape stands. See 11a.
- ~~If clients need **logins of their own**~~ — **resolved 2026-09-25, for now:** they do not. The
  owner expects this may change, so 11a records what a portal would cost rather than treating it as
  settled forever.
- If costing has to reconcile to real books, **Work is the wrong shape** and the shallow line breaks.
- If issuing offline proves rare in practice, the **number-lease complexity** is unearned and
  allocate-at-sync was the right answer after all.

Each is a question about the world, not about the code, and the first two were worth asking the owner
before the schema was built.

### 11a. The first two, answered 2026-09-25

**One person may hold more than one business — with a different email account for each.** So
`tenant` and `user` keep their shape: a user belongs to exactly one tenant, and a person operating
two businesses is two users with two addresses. No account switcher, no membership join table, no
policy rewrite. The email's **global** uniqueness is what enforces it, so §9 item 1 is withdrawn.

*What this costs, stated rather than discovered:* the same human signing in to their second business
must use its own address, and there is no "switch business" affordance. If that becomes a complaint
in practice, the change is a real one — a person entity above the user — and it is a change to
Tenancy, the spine. Recorded now so that conversation starts from a known cost.

**A tenant's clients do not get a login. That may change later.** So Documents has no outside
reader: a client meets us through a `share_link` — a hashed, expiring, revocable capability URL
scoped to one issue — and an `acceptance` that records a typed name, a timestamp and the IP. Nothing
in the model assumes a client identity.

*What keeps the door open:* `acceptance` already records who acted and how, and `share_link` is
already scoped per issue rather than per client, so a future portal adds a client identity and reuses
both. What a portal would **not** be is a small change: it makes tenant data readable from outside
the tenant's own users, which is a new row-level-security surface and a new threat-model section.
That is why it is a later decision and not a deferred detail.
