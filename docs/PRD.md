# Product Requirements: Pryvis, release 1

**Status: Proposed — NOT a basis for building yet.** Two gates stand between this document and code,
and they ask different questions (Rule 1.10):

| Gate | Question | State |
|---|---|---|
| **Owner approval** | Is this what you want built? | **Outstanding** |
| **Independent review** | Will this do what it says? | **Outstanding** — findings go to [`PRD-REVIEW.md`](PRD-REVIEW.md) |

An open finding blocks building the part it concerns, not the whole plan. Brief §6 · Rule 1.2 ·
Rule 1.10 · Rule 19 (this is part of the plan of record and is kept true, not left stale).

Date: 2026-09-25 · Country: **Jamaica first** (ADR 0008) · Domain model:
[`design/domain-model.md`](design/domain-model.md) (Approved) · Tiers: [`TIERS.md`](TIERS.md) ·
Scope decision: one product, verticalise later (ADR 0017)

---

## 1. What the product is, in one paragraph

Pryvis lets a small construction contractor **price a job while standing in front of the client**,
send a branded quote the client can accept on their phone, invoice against it in stages, and see
afterwards whether the job made money. It runs on the phone they already own, on mobile data, in
sunlight. Everything else in this document exists to serve that sentence.

**What it is not:** an accounting package, a project-management tool, or a marketplace. Costing stays
deliberately shallow (brief §5a); when it grows a chart of accounts it has become a different product
and that decision gets made openly.

## 2. Who it is for

| User | Who they are | What they need that nothing else gives them |
|---|---|---|
| **Delroy** — the wedge | Works alone or with one crew. Meets a client at a fence line, no office, phone in hand, patchy signal. Loses work by promising "I'll send you a price tonight" and sending it Thursday. | A number he can stand behind, produced **in front of the client**, from his own material and labour prices. |
| **A one-crew outfit** (Pro) | Delroy plus two or three people, getting paid late, chasing deposits. | Invoices against accepted quotes, deposits and progress claims, and a straight answer to "who owes me what". |
| **A firm with an office** (Business) | Several crews, someone in the office, a director who signs off discounts. | Roles and approvals, crew cost rates, reporting across projects. |
| **The client** — not a user | The homeowner or main contractor receiving the quote. Has no account and will not create one (ADR 0022). | To open a link, understand the price, and accept it with one tap. |
| **Pryvis staff** — us | Support, manual payment approval, activation. | Least privilege, MFA, and an audit trail that answers "who did that to my account" (ADR 0021, 0020). |

The primary user is **Delroy**, and where a trade-off exists it is resolved in his favour. A firm with
an office can wait; a contractor at a gate cannot.

## 3. The job, end to end

The eight steps the domain model is built from. Each becomes a workflow with acceptance criteria in
§5, and each names the release it lands in.

| # | Step | Workflow | Release |
|---|---|---|---|
| 1 | Set up his own prices: materials, labour rates, equipment, and a job priced once for reuse | W1 Directory · W2 Recipes | R1 |
| 2 | Price a job on the spot, mostly by choosing a recipe and changing one dimension | W3 Price a job | R1 |
| 3 | Issue it: a number, a branded PDF, a total committed to | W4 Issue | R1 |
| 4 | The client accepts, possibly days later, on their phone | W5 Share and accept | R1 |
| 5 | The client wants a change, and the accepted price cannot be quietly edited | W6 Variations | R2 |
| 6 | Ask for a deposit, then progress payments, then the balance | W7 Invoice and get paid | R1 |
| 7 | Record what the job actually cost and see the margin | W8 Job result | R2 |
| 8 | Pay us, sometimes by bank deposit and an uploaded receipt | W9 Subscribe | R1 |

## 4. The release plan, and the one hard call in it

### The call: what "on the spot" has to mean in release 1

The marketing site's own title is *"price the job while you are standing there"*, and its Pro tier
lists **"Offline use on your phone"**. So release 1 cannot quietly be online-only — that would make
the site an over-claim, which Rule 20 forbids and a guard already enforces on the copy.

But a full offline sync engine is the single highest-risk component in the old application: unreviewed,
untested at its seam, and the audit's top quiet-corruption risk. Building it first would put the
riskiest thing in front of the thing that earns money.

**The resolution: "issue" is three acts, and only the middle one needs a server.** The first version of
this section said R1 "requires connectivity to issue", which contradicted the approved domain model
(then saying offline issuing was allowed with a leased number) and, worse, would have failed the owner's
actual requirement — *the data must be captured offline and kept until the device can sync.* Recorded as
M13. Separating the acts dissolves it:

| Act | What it does | Needs a server? |
|---|---|---|
| **Seal** | Freeze lines, prices, tax rates, currency, terms, settings, totals, and when the catalog last synced | **No** — on the device, offline |
| **Number** | Allocate from the tenant's series: unique, gapless, answerable to an accountant | **Yes** in R1; from a device lease in R2 |
| **Deliver** | Render the PDF, mint the share link, send it | Yes |

- **R1 seals offline.** The catalog, labour rates, equipment, recipes, clients and tax settings are
  cached. With no signal Delroy opens a job, expands a recipe, changes the length, sees the total, and
  **seals** it — an immutable snapshot written on the device and held in a durable outbox until it syncs.
  No data is lost and nothing is re-entered.
- **The number is allocated at sync**, into its own insert-only `issue_number` row, so `quote_issue`
  keeps **no UPDATE path at all** (domain model §6.1a). A sealed issue is "awaiting number" until then,
  shown plainly, and is not deliverable to a client before it has one.
- **R2 adds device number leases**, so the number is allocated at seal time. That changes only *who
  inserts the `issue_number` row*, not the schema — which is what stops R2 from being a migration of
  issued financial rows.

What Delroy experiences at the gate is unchanged: the total is on screen in front of the client. The
site promises *price* the job while standing there, not *send* it from there.

**Stated plainly:** server allocation is strictly gapless; leases burn numbers and create gaps. R2's
offline issuing is a trade-down on the property an accountant cares about, worth buying only if
contractors actually hit the wall — which R1 will tell us.

### What each release contains

| | R1 — "Price it and get paid" | R2 — "Change orders and offline" | R3 — "A firm, not a person" |
|---|---|---|---|
| **Goal** | A solo contractor can run a whole job through the product and we can charge for it | The workflows that break when the job changes or the signal drops | The Business tier earns its price |
| **In** | W1, W2, W3, W4, W5, W7, W9 · Free and Pro tiers · Jamaica · web + mobile web, offline pricing and drafting | W6 variations · W8 job result and costing · offline issuing with number leases · full sync · retention tracking | Roles and approvals · crews and crew cost rates · consolidated reporting · WhatsApp Business sending · API access |
| **Out** | Anything in R2/R3; the Business tier; WhatsApp Business sending (click-to-chat only); the price index | Business-tier features | — |

**Why invoicing (W7) is in R1 and not R2:** invoicing *is* the Pro line (`TIERS.md`). A release with no
invoicing has nothing anybody pays for, so it would earn no revenue and teach us nothing about
willingness to pay.

**Variations: a minimal form moves INTO R1 (amended 2026-09-25, F3).** The original argument — "they
only bite after a job is won and changed, so not in week one" — was about *timing*, and never said what
the product does in week three. Traced through the approved model there was no answer: the accepted
total sits on issue v1, a change means issuing v2 which supersedes v1, the acceptance is immutable and
attached to v1, and accepting v2 leaves **two accepted issues for one job** with no rule for choosing
between them. The alternative was invoicing above the accepted total, which R1.24 forbids. So the
commonest event in construction — the client adds a gate — was unrepresentable, and the boundary was
**hiding** work rather than removing it (Rule 1.10).

Split by cost, which is where the original reasoning was right:

- **In R1: a priced variation against an accepted issue**, which re-derives the accepted total. Cheap,
  and it is what R1.24 needs in order to mean anything.
- **In R2: the client-signable change-order flow** — variation acceptance with its own record and PDF.
  That is the expensive half, and it is W5 reused.

Until R2, a variation is agreed the way contractors already agree them and **recorded** by the
contractor, with the audit trail carrying who recorded it and when. That is weaker evidence than a
signature and the PRD says so rather than implying otherwise.

## 5. Release 1 requirements

Numbered so tests and reviews can cite them. Each is written to be **verifiable**: if it cannot be
demonstrated, it is not a requirement, it is a hope.

### W1 · Directory — his own numbers
- **R1.1** A tenant can create, edit and soft-delete materials (with unit, category, supplier,
  current cost), labour rates (per hour or per day, by trade) and equipment (with a rate).
- **R1.2** A material's cost is a *current* price and is expected to change. **Nothing issued ever
  reads it live** (§7 of the domain model).
- **R1.3** A client book, soft-deleted only: a client named on an issued quote can never vanish from it.
- **R1.4** Everything in W1 is available offline, read and create.

### W2 · Recipes — the differentiator
- **R1.5** A recipe is a named set of material, labour and equipment lines with quantities, priced
  once and reused.
- **R1.6** Quantities may be expressed **per driving dimension** (per metre of fence, per m² of slab),
  so changing one number reprices the whole job. This is the feature the product is chosen for.
- **R1.7** Free tier: **create one recipe** and use it; Pro: unlimited (ADR 0023). "View only" gave a new
  free tenant nothing to view, so the wedge could not demonstrate the one feature the product is chosen
  for. One is enough to price the same job twice and feel the value, not enough to run a business on.

### W3 · Price a job — the moment that matters
- **R1.8** From a client and a recipe, produce a priced draft in **under 60 seconds of interaction**,
  with no signal, on a mid-range Android phone. **Measured, or it is not a requirement (F2, tightened for G10):** the
  instrument is a scripted walkthrough of the fence-at-the-gate task, timed from first tap to the total
  appearing, with **all four parameters named rather than gestured at**:
  **the device** — a Samsung Galaxy A15 or equivalent (8-core, 4 GB), the phone this market actually
  carries, not the fastest one to hand;
  **the state** — signed in, catalog synced, app cold-started and the recipe never opened this session, so
  no warm cache flatters the number;
  **the network** — aeroplane mode;
  **what counts** — every wait the app imposes; not time the user spends thinking or typing.
  Run per release and recorded. Naming three of four and calling it measured is how "a hope in the grammar
  of a requirement" survives its own fix.
- **R1.9** Per-line GCT treatment, markup and discount, with the tenant's GCT registration respected.
- **R1.10** Sections, so a quote reads the way a contractor talks about the job.
- **R1.11** Two detail levels for the client: a summary, or fully itemised.
- **R1.12** A draft is editable, versioned, and survives the app being closed with no signal.

### W4 · Issue — the commitment
- **R1.13** Sealing writes an **immutable snapshot**: every line as-priced, the tax rates used, the
  currency, the terms wording, the document settings, `sealed_at`, and `catalog_synced_at` — the last
  time those prices were refreshed. No column on it is ever updated; the number and the PDF hash live in
  their own rows (R1.14, R1.16a).
- **R1.13a** **`catalog_synced_at` is shown, not merely stored (G6).** The sealing screen shows how old the
  cached prices are; past a tenant-configurable threshold (default 7 days) sealing **warns before it
  proceeds**; and the date is printed on the internal copy so a later argument about a price has a date
  attached. It never blocks sealing — refusing to price a job because the catalog is old is the one
  failure this product cannot afford.
- **R1.14** Numbers come from a per-tenant, per-document-kind series with a prefix, start and reset
  rule, allocated atomically into an insert-only `issue_number` row. **Gapless per series in R1** —
  server allocation makes that free — and a number is never reused.
- **R1.15** A revision is a **new issue** at the next revision number; the previous one is marked
  superseded and remains readable exactly as sent. **This applies to an issue that has NOT been accepted**
  (see R1.22c): once accepted, the path is a variation, because superseding an accepted issue would orphan
  the acceptance attached to it.
- **R1.15a** **A non-price error on an accepted issue has a remedy (G8).** A variation answers "the scope
  changed"; it does not answer "the wrong client", "the wrong terms" or "the wrong tax treatment". For
  those, release 1 allows the acceptance to be **withdrawn** — recorded, audited, with a reason — which
  returns the issue to superseded-able. Without this, a typo in a client name on an accepted quote had
  no path at all.
- **R1.15b** **Withdrawal is refused while ANY financial dependant exists (H4):** an invoice *or* a
  recorded variation. The first version named only invoices, and the same release created two other
  things that hang off an acceptance — a balance row and immutable variations — so the typo remedy had
  become a way to detach agreed money from the issue it was agreed against. Enforced by a database
  trigger, not by the caller. Once either exists, the path is a **credit note and a fresh quote**.
- **R1.15c** A withdrawal **drops the invoiceable ceiling to zero immediately**, and mutates nothing:
  `accepted_total` stays written-once and the ceiling is state-aware instead (ADR 0025, corrected). The
  balance row survives — deleting it would reintroduce the empty-lock hole R1.24a exists for — and is
  simply inert.
- **R1.16** The PDF carries the tenant's logo, header details and two brand colours from
  `document_settings` — a shared layout reading tenant data, never an uploaded template.
- **R1.16a** The rendered PDF's hash is recorded once, on `document_render`, and the issue and any
  acceptance **reference that row** rather than each storing their own copy (F17 — it had been specified
  twice, differently). **The hash is verified whenever a stored PDF is re-served**, or it is evidence
  nobody ever checks.
- **R1.17** Quote expiry, evaluated on the **jurisdiction's** day boundary, not the server's.
- **R1.18** **Sealing works with no network** and the snapshot is held in a durable outbox that survives
  the app closing, shows what is pending, is encrypted at rest on the device, and is wiped by a remote
  sign-out. **Numbering and delivery happen at sync.** A sealed, unnumbered issue is shown as "awaiting
  number" and is never presented as sent.
- **R1.18a** The outbox is **generic**: every offline create queues in it, not only issues.
- **R1.18c** **Sealing claims the quote (G4).** Two devices holding the same draft can both seal it —
  neither push conflicts, because each is an append — which would give one job two issued identities.
  So the server enforces **one sealed issue per (quote, revision)**; the second device is **refused, told
  a colleague sealed this job, and its snapshot is kept and offered as a revision** rather than discarded.
  A revision cannot be created offline.
- **R1.18d** **A sealed snapshot is never destroyed by a timer.** The outbox's retention limit may expire
  cached reads; it may not delete a sealed document that has not reached the server. A retention limit that
  can destroy the only copy of a financial document is data loss on a schedule (G5).
- **R1.18e** **At sync, a seal is re-checked** against what could not be checked offline: the tenant is not
  suspended, the user is still an active member, the client still exists, the entitlement still permits it
  (metered at numbering — ADR 0023), and no colleague sealed that revision. Each refusal is explained in
  terms of what happened, never as a sync error.
- **R1.18b** A device holding unsynced seals for more than a stated number of days warns the user. An
  outbox is not a backup, and the app must not imply it is.
- **R1.18f** **The phone is now a place tenant data lives, and the threat model says so** (`THREAT-MODEL.md`
  §4a, G14): the local store is encrypted against the device keystore, the app locks behind the device's own
  authentication, and **remote sign-out cannot reach an offline device** — it revokes the session, so the
  device can no longer sync, and the store is wiped when it next connects. Stating that honestly is the
  control; claiming a remote wipe we cannot perform would not be.

### W5 · Share and accept — no login for the client
- **R1.19** A share link is a **credential**: high-entropy token, hashed at rest, scoped to one issue,
  expiring, revocable (ADR 0022).
- **R1.20** The client can accept or decline. **Acceptance is a verified electronic signature**
  (ADR 0024): a one-time code sent to the channel the tenant holds for that client, an explicit signing
  act labelled as one, consent to sign electronically, and a record carrying the signer's name, the
  timestamp, the IP, the user agent, the channel verified — and a **reference to the `document_render`
  row whose hash is the document signed**, not a hash of its own (F17). One acceptance per issue,
  immutable.
- **R1.20a** **The product never states what the record proves.** The owner's position is that a typed
  name alone is not legal in a dispute; a properly constructed e-signature can be. So the UI says what was
  recorded and never that it is binding, and the terms do not call the tap a signature. Whether our
  implementation clears Jamaica's bar is the owner's attorney's answer, not ours.
- **R1.20b** Release 1 verifies by **email**, because it needs no new service — only the verified sending
  domain already owed (§9 item 1a). SMS is a new paid sub-processor and absent from the register;
  WhatsApp Business sending is release 3.
- **R1.20c** **A signed copy may be uploaded against an issue** — the PDF carries a signature block, and
  the returned paper or file is attached to the immutable issue with its own render and hash. It is the
  fallback where a client has no email, and the artefact for a job where real money is at stake. We record
  who uploaded it and when; **we do not certify it** — a tenant can forge one as easily as a client can,
  and saying so is the control.
- **R1.20d** A **paid deposit is recorded as corroboration** of acceptance, linked to the issue. A client
  who pays 40% has behaved in a way no typed name matches, and R1.23 already builds the deposit.
- **R1.21** Share by WhatsApp click-to-chat and by email, on every tier. Server-side WhatsApp Business
  sending is R3.
- **R1.22** The shared page works on a cheap phone on mobile data and needs no account.
- **R1.21a** **The share page must survive the API being asleep (F16).** It is the one client-facing
  surface, and the free instance spins down after ~15 minutes with a ~50-second first response
  (`SERVICE-REGISTER.md` §4a). A client who taps a quote link and waits a minute on a blank screen is
  the worst impression the product can make, and it lands on the tenant, not on us. So the page is served
  statically or from cache with the document rendered ahead of time, and only *accepting* touches the
  API — with the wait shown honestly when it happens. This is the strongest argument in the PRD for
  Rule 10's paid-infrastructure trigger firing before launch, not after.

### W6a · Variations, minimal — added by review (F3)
- **R1.22f** A variation may be **recorded offline** but its effect on the ceiling is computed
  **server-side, inside the lock** (G13). A device never decides how much may be billed.
- **R1.22g** **An offline variation carries a client-supplied idempotency key** (`client_reference`,
  migration `20260926100000_variation_idempotency`), unique per issue. Without one a replayed outbox
  entry inserts a second append-only row, the ceiling rises **permanently**, and the nightly
  reconciliation certifies the inflated figure as correct — self-ratifying over-billing (H11). The key
  comes from the device because only the client can tell a retry from a genuine second variation of
  the same amount on the same day. **What the database guarantees is that one key cannot produce two
  rows; that the application sends the same key on every retry is the application's job and nothing in
  the schema can check it.**
- **R1.22a** A **priced variation** may be recorded against an accepted issue: a description, lines
  priced the same way a quote is, and a total that may be positive or negative.
- **R1.22b** Recording one **re-derives the accepted total** for that issue, which is what R1.24
  measures against. Variations are immutable once recorded; a mistake is corrected by another variation.
- **R1.22c** Revising an **accepted** issue is refused in R1. The path is a variation, not a new issue —
  which prevents the two-accepted-issues state the model tests as impossible.
- **R1.22d** The audit trail records who recorded a variation and when. R1 has **no client signature on
  a variation**; that is R2, and the UI must not present a recorded variation as client-accepted.

### W7 · Invoice and get paid — the Pro line
- **R1.23** **Deposit, progress and final invoices against one accepted issue** — the top-ranked
  missing feature for this trade. Note this **deliberately supersedes** the Phase 0 audit's inventory
  item #15, which recorded the old application's "one invoice per quote" as *keep* (F18). It was kept as
  an accurate description of what exists, not as a decision to preserve it; staged invoicing is #34, the
  audit's top-ranked absent feature, and the two cannot both hold. Recorded here rather than left as two
  documents disagreeing.
- **R1.24** The sum of issued invoices against an accepted issue may never exceed its **accepted total
  plus recorded variations** (R1.22b). **This is the most important arithmetic invariant in the
  product.**
- **R1.24d** **"Recorded", not "accepted", and the weakness is stated rather than hidden (G1).** In
  release 1 a variation has no client signature, so recording one **does** let the contractor raise their
  own invoiceable ceiling. R1.24 therefore protects against *mistake and drift*, not against a contractor
  who intends to over-bill — and it is the client's own acceptance, plus the audit trail naming who
  recorded the variation and when, that answers the second. Calling it "accepted variations" while
  building no acceptance would have been the worse outcome: an invariant that reads stronger than it is.
  When release 2 makes variations signable, this requirement tightens to "accepted" and the ceiling
  becomes what it claims to be.
- **R1.24a** It is **enforced by a lock, not by prose** (domain model §6.2a). The `issue_balance` row is
  created **in the same transaction as the acceptance, unconditionally** — because a `SELECT … FOR UPDATE`
  that matches no row takes **no lock at all**, so a missing row would have let the very first pair of
  concurrent invoices through (G2). Issuing an invoice then takes `SELECT … FOR UPDATE` on that row, computes the new total, refuses if it would
  exceed the ceiling, and inserts the invoice in the same transaction. Per-row version checks do nothing
  here — two invoices each individually under the total are together over it. Review found this
  invariant stated twice in prose with nowhere to live (F4), which is Rule 1.10's "invariant with no
  owner".
- **R1.24b** `issue_balance` is a **derived cache with a lock**, and every writer re-sums from the
  underlying rows **inside** the lock rather than trusting the cached figure. `accepted_total` is written
  once, by the acceptance transaction, from the issue's own frozen lines and never again — safe only
  because the issue is immutable (G12).
- **R1.24e** The **reconciliation job runs nightly per tenant**, rebuilds all three derived columns,
  and on a mismatch writes an audit entry, alerts us and **refuses further invoicing against that issue**
  until a person has looked. It does not self-heal: self-healing erases the evidence of the defect that
  caused the drift (G12).
- **R1.24c** Its tests are **planted defects**, because this is money arithmetic and judgement-class
  under Rule 16.5: two concurrent invoices, a replayed offline seal, and a variation landing between the
  read and the write.
- **R1.25** Invoice status is **derived** from payments and credit notes — never stored. **Retention is
  not an input in R1** because retention tracking is R2 (§8); the earlier wording made an excluded
  entity a term in an R1 formula (F4). Retention and credits affect *status*, never the R1.24 ceiling:
  money held back or credited does not raise how much may be billed. A stored
  status is the second source of truth that produced the old application's negative amount due.
- **R1.26** Recording a client payment: amount, date, method, reference, optional receipt file. Never
  more than the balance.
- **R1.27** An issued invoice is reduced only by a **credit note**, never by editing.
- **R1.28** Overdue reminders and a digest, through the single outbound-message path.
- **R1.29** WiPay card payment links (Pro).

### W9 · Subscribe — how we get paid
- **R1.30** Self-service sign-up on the website, free tier, no card (ADR 0015).
- **R1.30a** **Registration is the one unauthenticated endpoint that creates rows**, so Rule 14's
  defences ship *with* it, not after: rate limiting per address and per IP · **email verification before
  the account can cost us money** · a bound on tenants per address · and a duplicate registration that
  **does not reveal the address is taken**. Review found none of the four in the PRD (F12) even though
  Rule 14 and `TIERS.md` §2a both name them.
- **R1.30b** Email verification is **load-bearing for ADR 0022**, not a nicety. Global email uniqueness
  is what enforces "one business per address"; without verification the first person to type an address
  owns it and can lock out its real holder — and because R1.30a's duplicate response deliberately does
  not enumerate, the victim cannot even discover why. So an unverified registration reserves nothing:
  the address is claimed only when verified, and unverified attempts expire.
- **R1.30c** Rule 14's *bound on tenants per address* and ADR 0022's *one person, several businesses, one
  address each* are reconciled as **one tenant per verified address**. That part is exact and is enforced
  by the unique index that already exists.
- **R1.30d** **The rate bound is not an IP bound, because IP does not work here (G11).** Jamaican mobile
  networks put tens of thousands of subscribers behind carrier-grade NAT, so an address bound either
  blocks a whole network or permits everything. The bound is therefore:
  **(a)** a rate limit per IP on *attempts* — cheap, effective against a crude script, and deliberately
  loose enough not to lock out a whole carrier;
  **(b)** the **email verification requirement** (R1.30a) doing the real work: an unverified registration
  reserves nothing and costs us nothing, so volume without deliverable addresses buys an attacker nothing;
  **(c)** a **cost ceiling rather than an identity ceiling** — the free tier's three numbered jobs a month
  (ADR 0023) already bounds what an account can consume, so abuse means creating many verified mailboxes,
  which is work.
  **No device fingerprinting.** It was in the previous wording; it is a tracking technology with a privacy
  and threat-model cost nobody had weighed, for a defence (b) and (c) already provide.
- **R1.30e** **Verification races and expiry are defined, because uniqueness depends on them (G9):** an
  unverified registration holds a *pending* claim on the address, not the address itself; pending claims
  expire in **72 hours**; if two people register the same address, the first to verify takes it and the
  other's pending claim is dropped with the same non-enumerating message; and the address becomes the
  tenant's only on verification. This is the detail ADR 0022's global uniqueness rests on — without it the
  first person to *type* an address owns it.
- **R1.31** Plans and entitlements are **data**, resolved by one resolver, enforced on the server. The
  client may ask; it may never decide.
- **R1.32** Free tier limit: **3 distinct jobs *numbered* per calendar month** (ADR 0023), enforced
  server-side. Not counted on sealing — sealing happens offline and metering it would mean trusting a
  client-side count or refusing work already done at a client's gate. Not counted on sending. **Revisions
  and declines are free**: charging for a revision meters care, and billing for a declined quote teaches
  contractors to quote less.
- **R1.32a** **The cross-month case has a test and a message.** A contractor who seals four jobs offline on
  a Sunday gets three numbered and one refused when they sync, in the month of *syncing*. The refused
  snapshot is **kept, never destroyed**, the message explains what happened rather than reporting a sync
  error, and upgrading releases it.
- **R1.33** Manual payment: the tenant uploads a deposit receipt with amount, date, bank and reference.
  Status *submitted*.
- **R1.34** **Separation of duties is structural** (Rule 13): submitter, approver and activator are
  three distinct recorded people; the approver may not be the activator; approval requires verification
  against the **bank statement**, recorded as a field, not the receipt alone.
- **R1.35** Where only one person is available, a **`single_operator_exception` row** is written — who,
  when, why — with an alert to the owner and a required later second review. A control that cannot be
  satisfied gets bypassed; a control that records its own bypass gets reconciled.
- **R1.36** Uploads: restricted type and size, malware-scanned, stored privately and tenant-scoped,
  duplicate-detected on file hash **and** reference.
- **R1.37** Activation proceeds only from an **approved** payment. No override without a second person.

### Cross-cutting
- **R1.38** Support: a tenant can raise a thread and see only their own. Staff access is
  capability-gated and audited (brief §15).
- **R1.39** Every significant action is audited, atomically with the change it describes (ADR 0020).
- **R1.40** A tenant can read their own audit trail — what we did to their account, not only what they
  did.

## 6. Non-functional requirements

These are requirements with tests, not aspirations — **and review found that claim unearned for five of
them (G15)**, because a requirement whose test nobody can name is an aspiration with a table row. The
instrument is now named beside each, and where there is none the row says so. That is the honest version:
a stated gap can be closed, an implied test cannot.

| # | Requirement | Why it is here |
|---|---|---|
| **N1** | Strict tenant isolation: `tenant_id` + row-level security + application scoping, with automated cross-tenant leak tests in CI | Owner requirement 1; already built and **proved by planting** — the policy-parity guard reads `pg_get_expr` rather than counting policies, and a behavioural test executes a leak attempt. The strongest instrument in the project, and the model for the rest of this table |
| **N2** | Money: integer minor units, 64-bit, ceiling ~999,999,999.99 JMD, no float anywhere | ADR 0011. The old app capped at $21,474,836.47 |
| **N3** | Quote and invoice documents are immutable once issued | Brief §10. `quote_issue`, `issue_number`, `acceptance`, `variation` and `document_render` have **no UPDATE path**. `issue_balance` **is** updated and is deliberately not a document — it is a derived cache behind a lock (domain model §6.2a), and saying "no table is ever updated" would have been false (G15) |
| **N4** | Works on a mid-range Android phone, on mobile data, legible in sunlight, one-handed | The primary user is standing up outdoors. **Instrument:** the R1.8 walkthrough on the named device covers speed and one-handedness; contrast ratios are asserted by an automated check on the design tokens. **Sunlight legibility has no automated test** — it is judged by taking the phone outside, and that is a person's job, recorded per release |
| **N5** | Priced draft producible with **no network**; the app states its sync status plainly | §4's resolution of the "on the spot" promise. **Instrument:** the R1.8 walkthrough runs in aeroplane mode, so N5 fails if R1.8 fails; the outbox's pending count is asserted by a test that seals offline and inspects it before any sync |
| **N6** | Staff MFA mandatory; tenant MFA available | Rule 5.1, ADR 0021 |
| **N7** | No personal data or secrets in logs; uploads private and scanned | Rule 5 |
| **N8** | No tenant or client personal data, and no secrets, ever sent to the Claude API — redacted or synthetic only | Rule 15 |
| **N9** | The public site keeps working when the API is asleep | Rule 20; the free tier spins down and the front door must not look broken. **Instrument:** the existing site guards prove no external host is loaded and the site builds standalone; R1.21a extends this to the share page, which is the surface that actually matters to a client |
| **N10** | Free-tier infrastructure now, with a written trigger for moving to paid | Rule 10. **The API sleeps after ~15 min and the first visit waits ~50s** — acceptable for a prototype, not at launch. **Instrument:** the `API liveness` workflow records the cold-start figure on every run, so the number in this row is measured rather than remembered. **The trigger itself is still an owed ADR**, and R1.21a is the strongest argument for it firing before launch |

## 7. Tiers in release 1

R1 ships **Free and Pro only**. Business is R3, and until then the site must not sell it as available.

| | Free | Pro |
|---|---|---|
| Jobs quoted | 3 per month | Unlimited |
| Branded PDF, share, client accept | ✓ | ✓ |
| Clients, catalog, labour, equipment | ✓ | ✓ |
| Recipes | **create one**, then use it (ADR 0023) | unlimited |
| Invoices, payments, reminders, WiPay | — | ✓ |
| Offline **sealing** (the core promise — every tier, ADR 0023) | ✓ | ✓ |
| Offline **issuing** (numbered at the gate) | — (R2) | — (R2, the Pro line when it lands) |
| Users | 1 | 1 |

**Open, and blocking the paid tier:** the **prices** are not set. The site shows no number by deliberate
choice, and `new-app/web/test/site-guards.test.ts` enforces that much — it asserts no tier displays a
digit in its price label.

**But the site over-claims today, and the guard does not cover it (F5, Rule 20).** I had cited a guard
called `honest-claims.test.ts`; **no such file exists**, and the guards that do exist check nothing about
tier *feature lists*. The built site's Pro tier sells **retention tracking, project costing and job
profit, accountant exports, and offline use** — and §8 excludes the first three from R1 while offline
*issuing* is R2. The Business tier is listed with nothing marking it unavailable. That is a Rule 20
over-claim shipped on a public page, and the PRD pointed at a non-existent guard as the reason it was
safe. Logged as M14.

Two things follow, and the first needs the owner:

- **R1.40a — the site's tier lists must match what the release delivers.** Either each undelivered
  feature is marked as coming, or it is removed until it ships. **This is public copy, so the owner
  chooses which**; the choice is not whether to fix it.
- **R1.40b — a guard asserts it**, comparing every tier's feature list against a machine-readable set of
  what the current release delivers, so the next scope change cannot silently make the site untrue. It
  ships with a planted defect proving it fires (Rule 21.2).

### The entity with a deadline — named because leaving it out was the finding (F13)
- **R1.42** **§10's measures are instrumented in release 1, or they are not measures.** Six signals need
  data that does not collect itself: time-to-first-issued-quote, the offline pricing walkthrough (R1.8),
  jobs numbered per tenant per month, tenants who hit the free limit, accepted issues that become an
  invoice, and manual payments approved by a second person. §10 asserted "instrumentation that is itself
  part of R1" and no requirement existed (G10). Each is a query over rows release 1 already writes, except
  the walkthrough, which is a scripted test — so this is a reporting surface, not new tracking, and it
  carries **no personal data** into any dashboard we build.

- **R1.41** `price_observation` — what a tenant actually paid, captured when a material cost changes — is
  **built in R1 and written to only with the tenant's recorded consent.** The aggregate price index is the
  most defensible asset in the business and **consent cannot be retro-fitted**, so the capture path and the
  consent flag must exist before the first tenant registers (brief §5a). R1 builds **capture only**; there
  is no index, no comparison and no alerts — those are later tiers. The earlier draft had this entity in
  neither the scope nor the exclusions, which for a deadline-bearing decision is the worst of the three
  places to be.

## 8. What release 1 deliberately excludes

Named so nothing is "coming soon" by accident: variations and change orders · project costing and job
result · retention tracking · offline issuing and full sync · the Business tier (roles, approvals,
crews, consolidated reporting) · server-side WhatsApp Business sending · the material price index ·
accountant CSV export · the admin-curated regulatory feed (**dropped**, brief §5a) · multi-country
beyond Jamaica · a client portal (ADR 0022) · any second product.

## 8a. Open questions the owner must answer — not decided here

**All four were answered by the owner on 2026-09-25 and are recorded in ADR 0023 and ADR 0024.** They are
kept here with their answers rather than deleted, because the reasoning is what a later reader needs — and
because two of them overturned something this document had asserted, which is the pattern Rule 1.10 exists
to catch.

1. **What does "a job quoted" count?** (F10) R1.32 said three a month without saying what it counts.
   Counting revisions punishes care; counting only sends lets a tenant seal unlimited work and deliver it
   by screenshot. **ANSWERED (ADR 0023):** count **distinct jobs numbered** in the month; revisions and
   declines are free. R1.32 and R1.32a carry it, including the cross-month case a Sunday of offline seals
   produces.
2. **Is offline use a Free feature or a Pro one?** (F8) `TIERS.md` said Pro, §7 gave it to Free, the site
   said Pro — three documents, three answers. **ANSWERED (ADR 0023):** offline **sealing** on every tier,
   because it is the core promise and a free tier that fails at the gate does not spread by word of mouth,
   which is the only distribution this product has. Offline *issuing* (R2) carries the Pro line. §7 is
   amended; `TIERS.md` and the site copy are owed.
3. **Can a Free tenant do anything useful with recipes?** (F7) "View only" gave a new free tenant nothing
   to view, so the wedge could not demonstrate the one feature the product is chosen for.
   **ANSWERED (ADR 0023):** Free may create **one** recipe — enough to price the same job twice and feel
   the value, not enough to run a business on. R1.7 and §7 amended.
4. **Is a typed name on a phone enough?** (F15) **ANSWERED, and it changed the design (ADR 0024).** The
   owner ruled that a typed name is **not** legal in a dispute, then corrected that **a properly
   constructed e-signature can be**. Those are different claims, and the second moves work *into* release 1
   rather than parking it: a one-time-code-verified signature over a hashed document (R1.20-R1.20d), with
   signed paper as the fallback and a paid deposit as corroboration. Whether our implementation clears
   Jamaica's bar remains the attorney's answer, and nothing in the product asserts that it does.

## 9. Dependencies on the owner

R1 cannot launch without these, and none of them are engineering:

1. **`info@pryvis.com` receiving mail.** The site's only call to action is broken without it.
1a. **A verified *sending* domain** — DKIM, SPF and DMARC on `pryvis.com`, which only the owner can add
   at GoDaddy. R1.21 and R1.28 send a client's quote and a payment reminder; unauthenticated mail lands
   in spam and fails **silently**, which is worse than failing loudly. Item 1 covers receiving and said
   nothing about sending (F11).
1b. **An approved WiPay merchant account.** R1.29 depends on it, the register flags WiPay as a genuine
   single point of dependence with no like-for-like local substitute, and onboarding is KYC on the owner's
   business with a lead time we do not control.
1c. **A malware-scanning service, chosen.** R1.36 requires uploads to be scanned and Rule 5 demands it.
   **It is in no register row** — so either a service is chosen, with its cost and its status as a
   sub-processor holding tenant receipts, or R1.36 cannot be met (Rule 18).
1d. **Private object storage, chosen.** Receipts, logos and rendered PDFs need it; `document_render`
   carries a storage key and Rule 10 requires files out of the database. **Also absent from the register.**
2. **Tier prices**, and the guard updated to permit them.
3. **Legal wording approved** — terms and privacy currently ship marked as drafts, which is correct
   until they are approved and wrong afterwards.
4. **The aggregate-data consent clause** in the terms. This **blocks registration, not the website**:
   the price index is the most defensible asset in the business and consent cannot be retro-fitted, so
   the clause must exist before the first tenant signs up (brief §5a).
5. **A second staff account before the first is relied on** — there is deliberately no self-service way
   to remove a second factor (ADR 0021), and separation of duties needs two people (R1.34).

## 10. How we will know it worked

Measured, not felt. Each needs instrumentation that is itself part of R1.

| Signal | Target for R1 | Why this one |
|---|---|---|
| A new tenant reaches their **first issued quote** | within 30 minutes of sign-up, without support | If set-up defeats them, nothing else matters |
| Priced draft from recipe, offline | **under 60 seconds** of interaction | This is the product's whole claim |
| Tenants who **hit the free limit** (a fourth job refused) | ≥ 30% of active tenants by month two | This is the demand signal. The earlier version of this row asked for "≥ 4 quotes/month", which the free limit of 3 makes impossible — the server refuses the fourth (F9) |
| Accepted quotes that become an invoice | ≥ 70% | Tests whether W7 is where they actually work |
| Free → Pro conversion | ≥ 10% of tenants **who hit the free limit** | The denominator must be tenants showing demand. "Tenants issuing ≥ 4/month" was the already-converted population, so the rate was uncomputable (F9) |
| Manual payments approved by a second person | **100%**, or a recorded single-operator exception | A control is either enforced or it is decoration |

## 11. Risks, ranked

1. **The offline story is under-delivered or over-promised.** §4 splits pricing from issuing to manage
   it; the risk is that Delroy expects to hand over a PDF at the gate. Mitigation: the site's copy says
   *price*, not *send*, and the app states its sync status plainly (R1.18, N5).
2. **The free tier is too generous or too mean.** Three jobs a month is a guess. It is an entitlement
   value, not a code path, precisely so it can change without a release.
3. **Nobody pays.** Invoicing is in R1 specifically so this is testable in month one rather than
   month six.
4. **The cold start looks like a broken product.** ~50 seconds on the first visit after idle. The
   public site is static and unaffected; the app is not. Rule 10's trigger for paid infrastructure
   should fire before the first paying tenant, not after.
5. **Number allocation under offline issuing.** Deferred to R2 precisely because getting it wrong means
   two documents with one identity, which is unanswerable to an accountant.

## 12. What this PRD does not settle

- **The physical schema.** Its own step, from the approved domain model.
- **Screen-by-screen UI.** Each workflow needs a design before code (Rule 1.1); this says what must be
  possible, not what it looks like.
- **Migrating data from the old application.** Recorded in the audit's §5; depends on the schema.
- **The native mobile app's shape** (React Native vs web-first PWA). An ADR of its own, and R1's
  "mobile web + offline caching" scope is deliberately achievable either way.
- **Trinidad and Tobago**, or any second country. The rule-pack foundation exists (ADR 0008); switching
  it on is a later decision with its own tax and timezone work.
- **Pricing.** §7 and §9 say why.
