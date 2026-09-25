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
- **R1.7** Free tier: view and use recipes. Pro: create and edit them (`TIERS.md`).

### W3 · Price a job — the moment that matters
- **R1.8** From a client and a recipe, produce a priced draft in **under 60 seconds of interaction**,
  with no signal, on a mid-range Android phone. **Measured, or it is not a requirement (F2):** the
  instrument is a scripted walkthrough of the fence-at-the-gate task, timed from first tap to the total
  appearing, run on a named device in aeroplane mode, recorded per release. "Interaction" excludes time
  the user spends thinking and includes every wait the app imposes. Without that definition the number
  was a hope in the grammar of a requirement.
- **R1.9** Per-line GCT treatment, markup and discount, with the tenant's GCT registration respected.
- **R1.10** Sections, so a quote reads the way a contractor talks about the job.
- **R1.11** Two detail levels for the client: a summary, or fully itemised.
- **R1.12** A draft is editable, versioned, and survives the app being closed with no signal.

### W4 · Issue — the commitment
- **R1.13** Sealing writes an **immutable snapshot**: every line as-priced, the tax rates used, the
  currency, the terms wording, the document settings, `sealed_at`, and `catalog_synced_at` — the last
  time those prices were refreshed, so a stale price is visible rather than deniable. No column on it is
  ever updated. The number and the PDF hash live in their own rows (R1.14, R1.16a).
- **R1.14** Numbers come from a per-tenant, per-document-kind series with a prefix, start and reset
  rule, allocated atomically into an insert-only `issue_number` row. **Gapless per series in R1** —
  server allocation makes that free — and a number is never reused.
- **R1.15** A revision is a **new issue** at the next revision number; the previous one is marked
  superseded and remains readable exactly as sent.
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
- **R1.18b** A device holding unsynced seals for more than a stated number of days warns the user. An
  outbox is not a backup, and the app must not imply it is.

### W5 · Share and accept — no login for the client
- **R1.19** A share link is a **credential**: high-entropy token, hashed at rest, scoped to one issue,
  expiring, revocable (ADR 0022).
- **R1.20** The client can accept or decline. Acceptance records a typed name, timestamp, IP and user
  agent, and its own PDF hash. One acceptance per issue, immutable.
- **R1.21** Share by WhatsApp click-to-chat and by email, on every tier. Server-side WhatsApp Business
  sending is R3.
- **R1.22** The shared page works on a cheap phone on mobile data and needs no account.
- **R1.22e** **The share page must survive the API being asleep (F16).** It is the one client-facing
  surface, and the free instance spins down after ~15 minutes with a ~50-second first response
  (`SERVICE-REGISTER.md` §4a). A client who taps a quote link and waits a minute on a blank screen is
  the worst impression the product can make, and it lands on the tenant, not on us. So the page is served
  statically or from cache with the document rendered ahead of time, and only *accepting* touches the
  API — with the wait shown honestly when it happens. This is the strongest argument in the PRD for
  Rule 10's paid-infrastructure trigger firing before launch, not after.

### W6a · Variations, minimal — added by review (F3)
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
- **R1.24a** It is **enforced by a lock, not by prose** (domain model §6.2a): issuing an invoice takes
  `SELECT … FOR UPDATE` on that issue's `issue_balance` row, computes the new total, refuses if it would
  exceed the ceiling, and inserts the invoice in the same transaction. Per-row version checks do nothing
  here — two invoices each individually under the total are together over it. Review found this
  invariant stated twice in prose with nowhere to live (F4), which is Rule 1.10's "invariant with no
  owner".
- **R1.24b** `issue_balance` is a **derived cache with a lock**, rebuildable from the invoices, and a
  reconciliation job that rebuilds and compares it is part of R1. A maintained total nobody re-derives
  is how the old application's stored status drifted.
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
- **R1.30c** Rule 14's *bound on tenants per address* and ADR 0022's *one person, several businesses,
  one address each* are reconciled as: **one tenant per verified address, with a bound on how many
  addresses may be created from one IP or one device in a period.** The bound belongs on the creator,
  not on the person.
- **R1.31** Plans and entitlements are **data**, resolved by one resolver, enforced on the server. The
  client may ask; it may never decide.
- **R1.32** Free tier limit: 3 new jobs quoted per calendar month, enforced server-side with a clear,
  non-punitive message.
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

These are requirements with tests, not aspirations.

| # | Requirement | Why it is here |
|---|---|---|
| **N1** | Strict tenant isolation: `tenant_id` + row-level security + application scoping, with automated cross-tenant leak tests in CI | Owner requirement 1; already built and proved by planting |
| **N2** | Money: integer minor units, 64-bit, ceiling ~999,999,999.99 JMD, no float anywhere | ADR 0011. The old app capped at $21,474,836.47 |
| **N3** | Quote and invoice documents are immutable once issued | Brief §10. Enforced by a table with no UPDATE path, not by careful queries |
| **N4** | Works on a mid-range Android phone, on mobile data, legible in sunlight, one-handed | The primary user is standing up outdoors |
| **N5** | Priced draft producible with **no network**; the app states its sync status plainly | §4's resolution of the "on the spot" promise |
| **N6** | Staff MFA mandatory; tenant MFA available | Rule 5.1, ADR 0021 |
| **N7** | No personal data or secrets in logs; uploads private and scanned | Rule 5 |
| **N8** | No tenant or client personal data, and no secrets, ever sent to the Claude API — redacted or synthetic only | Rule 15 |
| **N9** | The public site keeps working when the API is asleep | Rule 20; the free tier spins down and the front door must not look broken |
| **N10** | Free-tier infrastructure now, with a written trigger for moving to paid | Rule 10. **The API currently sleeps after ~15 min and the first visit waits ~50s** — acceptable for a prototype, not at launch |

## 7. Tiers in release 1

R1 ships **Free and Pro only**. Business is R3, and until then the site must not sell it as available.

| | Free | Pro |
|---|---|---|
| Jobs quoted | 3 per month | Unlimited |
| Branded PDF, share, client accept | ✓ | ✓ |
| Clients, catalog, labour, equipment | ✓ | ✓ |
| Recipes | use only | create and edit |
| Invoices, payments, reminders, WiPay | — | ✓ |
| Offline pricing and drafting | ✓ | ✓ |
| Offline **issuing** | — (R2) | — (R2) |
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

Review raised these as questions rather than defects (F7, F8, F10, F15). Each is a fact about the world
or a commercial choice, so guessing would repeat the mistake ADR 0022 corrected.

1. **What does "a job quoted" count?** (F10) R1.32 says three a month. Does the counter increment on
   sealing, on numbering, or on a client being sent the document? Does a revision count again? Does a
   declined quote? Each reading gives a different product: counting revisions punishes care, and counting
   only sends lets a tenant seal unlimited work and deliver it by WhatsApp screenshot. **Recommendation:**
   count **distinct jobs numbered** in the month, so revisions and declines are free and the meter tracks
   real work.
2. **Is offline use a Free feature or a Pro one?** (F8) `TIERS.md` puts "Offline mobile use" on Pro; §7 of
   this document gives offline pricing to Free; the site lists offline under Pro. Three documents, three
   answers. **Recommendation:** offline **sealing** on every tier, because it is the core promise and
   gating it makes the free tier fail at the gate; offline *issuing* (R2) can be a Pro line.
3. **Can a Free tenant do anything useful with recipes?** (F7) Free gets "view only", but in R1 a new Free
   tenant has no recipes to view — the wedge cannot demonstrate the differentiator. **Recommendation:**
   Free may create **one** recipe. It is the feature the product is chosen for and a demonstration with
   nothing in it demonstrates nothing.
4. **Is a typed name on a phone enough?** (F15) R1.20 records typed name, timestamp, IP and user agent.
   Whether that is worth anything in a Jamaican dispute is a legal question, not an engineering one, and
   the PRD should not imply it is settled. **Recommendation:** ask the owner's attorney while the terms
   are being approved anyway, and record the answer in the ADR rather than in the UI's fine print.

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
