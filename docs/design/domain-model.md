# Design: the domain model

**Status: APPROVED by the owner 2026-09-25.** Schema work may proceed from it; each piece still needs
its own design for the parts this document leaves open (§10), and the physical schema is its own step.

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

**Numbering is the hard part, and it is an offline problem.** A number must be unique, gapless and
issued the moment Delroy taps *Issue*, standing in a field with no signal. Three options were
considered:

- *Allocate at sync.* Simple and safe, but the client sees "Quote #pending" on the PDF, which
  undermines the one document the product exists to produce. Rejected.
- *Allocate from the series on the device.* Two devices produce the same number. Rejected.
- **Chosen: device number blocks.** A device leases a contiguous block from the series while online
  (default 50). Issuing offline consumes from the lease. A lease is returned or expires, and
  unconsumed numbers in an expired lease are **burned, not reused** — a gap in the sequence is a
  question an accountant can ask and get an answer to, whereas a reused number is two different
  documents with one identity, which is unanswerable.

That last sentence is the decision, and it deserves its own ADR because it is the one place this
design accepts a visibly imperfect outcome on purpose.

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

`quote_issue` is an **immutable snapshot**, written once when Delroy taps *Issue*. It carries its own
number, every line with its frozen description, quantity, unit price, tax treatment, markup and
discount, the tax rates it used, the currency, the terms wording, the document settings as they were,
and a hash of the rendered PDF. **No column on it is ever updated.**

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
| `quote_line` | A line on the working quote, in a section, ordered. | Belongs to one quote. Recipe-expanded lines remember the recipe, so a recipe change can offer to refresh a draft — never an issue. |
| `variation` | A change to accepted work: added, removed or altered scope, with its own price and its own acceptance. | First-class, not a new quote. The client has already accepted the original, and a variation must be signable on its own so "who agreed to the extra $40,000" has an answer. |
| `acceptance` | The client accepting or declining an issue or a variation. | Records typed name, timestamp, IP and user agent, and its own PDF hash. Immutable. One acceptance per issue. |
| `invoice` | A demand for payment against an accepted issue. | **Deposit, progress and final invoices against one issue** — the top-ranked missing feature. The sum of issued invoices may never exceed the accepted total plus accepted variations, which is the single most important arithmetic invariant in the product. |
| `invoice_line` | Either a share of the issue (percentage or amount) or a named extra. | Frozen at issue, like the quote. |
| `client_payment` | Money the tenant's client paid them: amount, date, method, reference, optional receipt file. | Never exceeds the invoice balance. Recording one is derived, not stored: invoice status is **computed** from its payments, retention and credits. |
| `retention` | A percentage held back and released later. | Releasing it **re-derives** the invoice's status. (The existing application does not, which is a recorded open defect.) |
| `credit_note` | A reduction after issue. | The only way to reduce an issued invoice, because the invoice itself cannot be edited. |

**Invoice status is derived, never stored.** A stored status is a second source of truth that drifts
from the payments, which is precisely how the existing application's CSV export came to report a
negative amount due. The trade-off is a slightly more expensive read, paid for with an index.

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
superseded issue; accepting twice; invoicing a declined issue; invoicing past the accepted total;
recording a payment against a draft invoice; releasing retention twice.

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
| `quote_issue` | **create** (with a leased number) | **Never conflicts** — it is append-only by construction. Pushes as-is, or fails loudly. |
| `acceptance` | create | First write wins; a second is refused, not merged. |
| `invoice`, `client_payment` | read only in v1 | — |
| `project`, `purchase`, `labour_entry` | create and edit | Last-write-wins per row, with the audit trail carrying the loser. |
| Entitlements | cached with a **grace period** | Server wins on sync; the grace period is what stops a signal outage from stopping work. |

Issuing offline is **allowed** — refusing it would break step 3 of the only story that matters, and
the number lease plus the immutable issue is what makes it safe. Prices are frozen from the
last-synced catalog, and the issue records **when that sync happened**, so a stale price is visible
rather than deniable.

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
