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

**The resolution, and it comes from reading the promise precisely.** The client at the gate does not
need a PDF in that moment — they need **a number, now**. Emailing the document an hour later is
normal and expected. So:

- **R1 works offline for pricing and drafting.** The catalog, labour rates, equipment, recipes,
  clients and tax settings are cached on the device. Delroy can open a job with no signal, expand a
  recipe, change the length, see the total, and save the draft. That is the promise kept.
- **R1 requires connectivity to *issue*.** Issuing allocates a real number, freezes prices and renders
  a PDF. Attempting it offline queues it and issues on reconnect, with the state visible rather than
  silent.
- **R2 adds offline issuing** via the device number leases the domain model specifies, plus the full
  sync engine with per-entity conflict rules.

This is the difference between a two-week component and a two-month one, and it changes nothing about
what Delroy experiences at the gate.

### What each release contains

| | R1 — "Price it and get paid" | R2 — "Change orders and offline" | R3 — "A firm, not a person" |
|---|---|---|---|
| **Goal** | A solo contractor can run a whole job through the product and we can charge for it | The workflows that break when the job changes or the signal drops | The Business tier earns its price |
| **In** | W1, W2, W3, W4, W5, W7, W9 · Free and Pro tiers · Jamaica · web + mobile web, offline pricing and drafting | W6 variations · W8 job result and costing · offline issuing with number leases · full sync · retention tracking | Roles and approvals · crews and crew cost rates · consolidated reporting · WhatsApp Business sending · API access |
| **Out** | Anything in R2/R3; the Business tier; WhatsApp Business sending (click-to-chat only); the price index | Business-tier features | — |

**Why invoicing (W7) is in R1 and not R2:** invoicing *is* the Pro line (`TIERS.md`). A release with no
invoicing has nothing anybody pays for, so it would earn no revenue and teach us nothing about
willingness to pay.

**Why variations (W6) are R2 despite mattering:** they only bite after a job is won and changed, so the
first tenants will not hit them in week one — and doing them properly means client-signable change
orders, which is W5 again with a different subject. Doing W5 once, well, then reusing it, is cheaper
than doing both at once.

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
  with no signal, on a mid-range Android phone.
- **R1.9** Per-line GCT treatment, markup and discount, with the tenant's GCT registration respected.
- **R1.10** Sections, so a quote reads the way a contractor talks about the job.
- **R1.11** Two detail levels for the client: a summary, or fully itemised.
- **R1.12** A draft is editable, versioned, and survives the app being closed with no signal.

### W4 · Issue — the commitment
- **R1.13** Issuing writes an **immutable snapshot**: number, every line as-priced, the tax rates used,
  the currency, the terms wording, the document settings, and a hash of the rendered PDF. No column on
  it is ever updated.
- **R1.14** Numbers come from a per-tenant, per-document-kind series with a prefix, start and reset
  rule, allocated atomically. **Gapless per series; a burned number is never reused.**
- **R1.15** A revision is a **new issue** at the next revision number; the previous one is marked
  superseded and remains readable exactly as sent.
- **R1.16** The PDF carries the tenant's logo, header details and two brand colours from
  `document_settings` — a shared layout reading tenant data, never an uploaded template.
- **R1.17** Quote expiry, evaluated on the **jurisdiction's** day boundary, not the server's.
- **R1.18** Issuing requires connectivity in R1. Attempted offline, it queues visibly and completes on
  reconnect. It never silently appears to have succeeded.

### W5 · Share and accept — no login for the client
- **R1.19** A share link is a **credential**: high-entropy token, hashed at rest, scoped to one issue,
  expiring, revocable (ADR 0022).
- **R1.20** The client can accept or decline. Acceptance records a typed name, timestamp, IP and user
  agent, and its own PDF hash. One acceptance per issue, immutable.
- **R1.21** Share by WhatsApp click-to-chat and by email, on every tier. Server-side WhatsApp Business
  sending is R3.
- **R1.22** The shared page works on a cheap phone on mobile data and needs no account.

### W7 · Invoice and get paid — the Pro line
- **R1.23** **Deposit, progress and final invoices against one accepted issue** — the top-ranked
  missing feature for this trade.
- **R1.24** The sum of issued invoices may never exceed the accepted total plus accepted variations.
  **This is the most important arithmetic invariant in the product** and it gets its own tests.
- **R1.25** Invoice status is **derived** from payments, credits and retention — never stored. A stored
  status is the second source of truth that produced the old application's negative amount due.
- **R1.26** Recording a client payment: amount, date, method, reference, optional receipt file. Never
  more than the balance.
- **R1.27** An issued invoice is reduced only by a **credit note**, never by editing.
- **R1.28** Overdue reminders and a digest, through the single outbound-message path.
- **R1.29** WiPay card payment links (Pro).

### W9 · Subscribe — how we get paid
- **R1.30** Self-service sign-up on the website, free tier, no card (ADR 0015).
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

**Open, and blocking the paid tier:** the **prices** are not set. The site shows no number by
deliberate choice and a guard enforces that (`honest-claims.test.ts`), so nothing is over-claimed —
but Pro cannot be sold until the owner sets them.

## 8. What release 1 deliberately excludes

Named so nothing is "coming soon" by accident: variations and change orders · project costing and job
result · retention tracking · offline issuing and full sync · the Business tier (roles, approvals,
crews, consolidated reporting) · server-side WhatsApp Business sending · the material price index ·
accountant CSV export · the admin-curated regulatory feed (**dropped**, brief §5a) · multi-country
beyond Jamaica · a client portal (ADR 0022) · any second product.

## 9. Dependencies on the owner

R1 cannot launch without these, and none of them are engineering:

1. **`info@pryvis.com` receiving mail.** The site's only call to action is broken without it.
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
| Quotes issued per active tenant per month | ≥ 4 by month two | Below the free limit means they are trying it, not using it |
| Accepted quotes that become an invoice | ≥ 70% | Tests whether W7 is where they actually work |
| Free → Pro conversion | ≥ 10% of tenants issuing ≥ 4 quotes/month | The only honest test of the Pro line |
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
