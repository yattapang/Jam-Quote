# Product Requirements: Pryvis, release 1

**Status: APPROVED by the owner, 2026-10-02.** Two gates stood between this document and code,
and they ask different questions (Rule 1.10):

| Gate | Question | State |
|---|---|---|
| **Owner approval** | Is this what you want built? | **Given 2026-10-02.** Review 5 recommended not approving yet; the owner's decisions are ADRs 0027-0030; the amended document was re-read independently (approve after named changes), the changes were made, a closing check confirmed them, and the owner approved |
| **Independent review** | Will this do what it says? | **Five rounds run:** [`PRD-REVIEW.md`](PRD-REVIEW.md), [`PRD-REVIEW-2.md`](PRD-REVIEW-2.md), [`PRD-REVIEW-3.md`](PRD-REVIEW-3.md), [`PRD-REVIEW-4.md`](PRD-REVIEW-4.md) (the code; all closed), [`PRD-REVIEW-5.md`](PRD-REVIEW-5.md) (B1-B28 and the re-read's C1-C10: **all Closed after independent
checks on 2026-10-02, except B10, open on purpose until the GCT design**). Each file's disposition table says which findings remain open |

**Approval is not permission to build everything at once.** Each workflow still needs its own approved
design before code (brief §3, Rule 1.1), and six planning designs are owed first (ADR 0030). An open finding
— today only B10, the GCT design — blocks building the part it concerns, not the whole plan. **The documents layer is already
built** — the owner moved five invariants into code under ADR 0025 (2026-09-25), and the migrations from
`20260925120000_documents_core` on implement W4, W5 and W7's data layer — so approving this document also
ratifies that schema, including the parts it amends (B10: no tax on invoices yet; B20: number resets).
Brief §6 · Rule 1.2 · Rule 1.10 · Rule 19 (this is part of the plan of record and is kept true, not left
stale). **It supersedes, for the rebuild, `ROADMAP.md`, `MILESTONES.md`, `PRICING.md` and `ARCHITECTURE.md`**,
which describe the earlier application (finding B12).

Date: 2026-09-25, amended through 2026-10-02 · Country: **Jamaica first** (ADR 0006) · Domain model:
[`design/domain-model.md`](design/domain-model.md) (Approved) · Tiers: [`TIERS.md`](TIERS.md) ·
Scope decision: one product, verticalise later (ADR 0017)

---

## 1. What the product is, in one paragraph

Pryvis lets a small construction contractor **price a job while standing in front of the client**,
send a branded quote the client can accept on their phone, and invoice against it in stages; seeing
afterwards whether the job made money follows in release 2. It runs on the phone they already own, on
mobile data, in sunlight. Everything else in this document exists to serve that sentence.

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
| 5 | The client wants a change, and the accepted price cannot be quietly edited | W6a recorded variations · W6 client-signed change orders | R1 · R2 |
| 6 | Ask for a deposit, then progress payments, then the balance | W7 Invoice and get paid | R1 |
| 7 | Record what the job actually cost and see the margin | W8 Job result | R2 |
| 8 | Pay us, by card or by bank deposit and an uploaded receipt | W9 Subscribe | R1 |

## 4. The release plan, and the one hard call in it

### The call: what "on the spot" has to mean in release 1

The marketing site's own title is *"price the job while you are standing there"*, and offline capture is
the owner's own requirement (M13). **The owner has decided that release 1's first launch is an online web
app, with offline sealing arriving in the mobile app that follows it** (ADR 0028), so until then the site
marks its offline line "coming with the mobile app" — a site that sold offline use on day one would be the
over-claim Rule 20 forbids. (Until 2026-10-02 this paragraph argued release 1 could not be online-only, citing
a site line, "Offline use on your phone", that F5 had already removed — finding C5.)

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

**Release 1 ships in two steps (ADR 0028, 2026-10-02):** first the **web app, used online**, then the
**mobile app**, which brings offline sealing. At web launch all three acts happen online; what follows
describes the mobile app, and every requirement marked **[mobile]** below applies from its launch.

- **The mobile app seals offline, and that is all it does offline (ADR 0027 D1, finding B5).** The catalog, labour
  rates, equipment, recipes, clients and tax settings are cached for reading. With no signal Delroy opens
  a job, expands a recipe, changes the length, sees the total, and **seals** it — an immutable snapshot
  written on the device and held in a durable outbox until it syncs. No data is lost and nothing is
  re-entered. A draft is edited on one device at a time. **Creating records offline, offline variations
  and merging a draft edited on two devices are release 2** — they are the rest of the sync engine this
  section keeps out of the money release, and the requirements had quietly put most of them back
  (finding B5).
- **The number is allocated at sync**, into its own insert-only `issue_number` row, so `quote_issue`
  keeps **no UPDATE path at all** (domain model §6.1a). A sealed issue is "awaiting number" until then,
  shown plainly, and is not deliverable to a client before it has one.
- **R2 adds device number leases**, so the number is allocated at seal time. That changes only *who
  inserts the `issue_number` row*, not the schema — which is what stops R2 from being a migration of
  issued financial rows.

What Delroy experiences at the gate is unchanged: the total is on screen in front of the client. The
site promises *price* the job while standing there, not *send* it from there — and until the mobile app
ships, it says that pricing needs a connection (ADR 0028).

**Stated plainly:** server allocation is strictly gapless; leases burn numbers and create gaps. R2's
offline issuing is a trade-down on the property an accountant cares about, worth buying only if
contractors actually hit the wall — which the mobile app will tell us.

### What each release contains

| | R1 — "Price it and get paid" | R2 — "Change orders and offline" | R3 — "A firm, not a person" |
|---|---|---|---|
| **Goal** | A solo contractor can run a whole job through the product and we can charge for it | The workflows that break when the job changes or the signal drops | The Business tier earns its price |
| **In** | W1, W2, W3, W4, W5, W6a, W7, W9, W10 · Free and Pro tiers · Jamaica · the website for sign-up and the client's share page · **first, the web app, online** (ADR 0028) · **then the React Native (Expo) app** on Android and iOS (ADR 0027 D2), launched when the web app is ready, bringing offline: cached reads, one-device drafts, sealing | W6 client-signed change orders · W8 job result and costing · offline creates, offline variations and multi-device draft merge · offline issuing with number leases · retention tracking · signed-copy upload (R1.20c) · in-app support threads | Roles and approvals · crews and crew cost rates · consolidated reporting · WhatsApp Business sending · API access |
| **Out** | Anything in R2/R3; the Business tier; WhatsApp Business sending (click-to-chat only); the price index; staff impersonation | Business-tier features | — |

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

- **In R1: a priced variation against an accepted issue**, which re-derives the ceiling (not the accepted
  total, which no variation moves — R1.22b; corrected 2026-10-02, finding C2). Cheap,
  and it is what R1.24 needs in order to mean anything.
- **In R2: the client-signable change-order flow** — variation acceptance with its own record and PDF.
  That is the expensive half, and it is W5 reused.

Until R2, a variation is agreed the way contractors already agree them and **recorded** by the
contractor, with the audit trail carrying who recorded it and when. That is weaker evidence than a
signature and the PRD says so rather than implying otherwise.

## 5. Release 1 requirements

Numbered so tests and reviews can cite them. Each is written to be **verifiable**: if it cannot be
demonstrated, it is not a requirement, it is a hope.

**Where each requirement is (finding B14).** Numbers were assigned as requirements were added, so some
sit out of order; renumbering would break every citation. W1 R1.1-R1.4 · W2 R1.5-R1.7 · W3 R1.8-R1.12 ·
W4 R1.13-R1.18j (R1.18 runs a, c, g, h, i, j, d, e, b, f) · W5 R1.19-R1.22 (R1.21a-c after R1.22) · W6a
R1.22a-g · W7 R1.23-R1.29 · W9 R1.30-R1.37f · Cross-cutting R1.38-R1.40, R1.43-R1.45 · W10 R1.46-R1.49 · §7 R1.40a-b,
R1.41, R1.42.

### W1 · Directory — his own numbers
- **R1.1** A tenant can create, edit and soft-delete materials (with unit, category, supplier,
  current cost), labour rates (per hour or per day, by trade) and equipment (with a rate).
- **R1.2** A material's cost is a *current* price and is expected to change. **Nothing issued ever
  reads it live** (§7 of the domain model).
- **R1.3** A client book, soft-deleted only: a client named on an issued quote can never vanish from it.
- **R1.4** **[mobile]** Everything in W1 is **readable** offline in the mobile app; the web app reads it
  online (ADR 0028, finding C5). Creating and editing it needs a connection in R1;
  offline creates are R2 (ADR 0027 D1).

### W2 · Recipes — the differentiator
- **R1.5** A recipe is a named set of material, labour and equipment lines with quantities, priced
  once and reused.
- **R1.6** Quantities may be expressed **per driving dimension** (per metre of fence, per m² of slab),
  so changing one number reprices the whole job. This is the feature the product is chosen for.
- **R1.7** Free tier: **create one recipe** and use it; Pro: unlimited (ADR 0023). "View only" gave a new
  free tenant nothing to view, so the wedge could not demonstrate the one feature the product is chosen
  for. One is enough to price the same job twice and feel the value, not enough to run a business on.

### W3 · Price a job — the moment that matters
- **R1.8** From a client and a recipe, produce a priced draft in **under 60 seconds of interaction** on a
  mid-range Android phone — **online in the web app at web launch, and with no signal in the mobile app
  [mobile]** (ADR 0028). **Measured, or it is not a requirement (F2, tightened for G10):** the
  instrument is a scripted walkthrough of the fence-at-the-gate task, timed from first tap to the total
  appearing, with **all four parameters named rather than gestured at**:
  **the device** — a Samsung Galaxy A15 or equivalent (8-core, 4 GB), the phone this market actually
  carries, not the fastest one to hand;
  **the state** — signed in, catalog synced, app cold-started and the recipe never opened this session, so
  no warm cache flatters the number;
  **the network** — aeroplane mode for the mobile app; **for the web app at web launch, Chrome's built-in "Fast 3G"
  throttling preset**, with its exact values written into each run record, in the phone's own browser,
  signed in, the page loaded fresh with no cache (finding C5);
  **what counts** — every wait the app imposes; not time the user spends thinking or typing.
  Run per release and recorded. Naming three of four and calling it measured is how "a hope in the grammar
  of a requirement" survives its own fix.
- **R1.9** Per-line GCT treatment, markup and discount, with the tenant's GCT registration respected.
  *(Pointer 2026-10-02, finding TD14: the design is `docs/design/tax-and-documents.md`, approved by the owner and amended after its
  independent read; it answers the list below.)*
  **Decided (ADR 0027 D7, finding B10):** the invoicing ceiling is **tax-exclusive** — accepted subtotal plus
  recorded variations — and GCT is computed **per invoice** at the rate in force when it is issued, so a
  rate change after acceptance cannot push a final invoice over the ceiling. **Owed before W3 or W7 is
  built:** a GCT design, approved by the owner, answering **whether a variation's total is net or gross**,
  **whether the invoiced figure compared with the ceiling is net or gross** (it must be net, or a registered
  tenant's final invoice is refused for its own tax — finding C2), what tax a deposit or progress invoice carries,
  what "registration respected" does to a non-registered tenant's lines, what a tax invoice must show (the
  supplier's TRN and the GCT amount separately, on our current reading), what a credit note does to tax, and **the refund and client-credit records** an
  over-payment resolves into (R1.26), including whether a kept credit can settle another invoice (finding
  C2) — with a migration giving `invoice` and `credit_note` tax fields and `tenant` its GCT registration and
  TRN. **The tax's name is per country** (owner, ADR 0030): "GCT" in Jamaica, another name elsewhere (VAT in
  Trinidad and Tobago) — held, with the registration number's name and the invoice wording, in each country's
  rule pack, never written into code or screens. **Tenants may enter their own GCT or tax rates for their country** (owner, ADR 0030): the platform
  supplies each country's defaults, a tenant may set or add rates for their own documents, and every issued
  document freezes the rate it used. It is checked against Tax Administration Jamaica's published guidance now and **reviewed by an
  accountant before launch** (§9). The ceiling as built is tax-inclusive (`total_minor`), so the design
  changes the most important invariant; it is a migration, not a sentence.
- **R1.10** Sections, so a quote reads the way a contractor talks about the job.
- **R1.11** Two detail levels for the client: a summary, or fully itemised.
- **R1.12** A draft is editable, versioned, and survives the app being closed — with no signal **[mobile]**. **One
  device edits a draft at a time in R1:** a draft pushed from a device holding a stale version is refused,
  never merged — a three-way merge is R2's (ADR 0027 D1, finding B5).

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
- **R1.14** Numbers come from a per-tenant, per-document-kind series with a prefix and a start,
  allocated atomically into an insert-only `issue_number` row — **once per quote**; its revisions carry it
  (ADR 0031). *(Pointer 2026-10-02, finding TD14: `docs/design/tax-and-documents.md` T9 replaces this with a per-quote number row and a
  per-issue numbering row, and gives invoices and credit notes their own series.)* **A series never resets in R1** (ADR 0027
  D11, finding B20): a tenant who wants the year in the number puts it in the prefix ("INV-2027-") —
  **the count continues** (INV-2027-0143, not -0001), and **the start can never be moved below the last
  number allocated** (owed with the allocation code, finding C8) — and
  the schema accepts only `never` (migration `20260928010000_number_series_never_resets`) — it used to store
  `yearly` and then refuse the first reset. **Gapless per series in R1**, and a number is never reused.
  Gaplessness is a claim about allocation code not yet written; it is proved the way R1.24c proves the
  ceiling, by a planted concurrent-allocation defect.
- **R1.15** A revision is a **new issue** at the next revision number, **carrying its quote's number with a
  revision suffix** — Q-0042, then "Q-0042 rev 2" (ADR 0031: the number never changes on revision, as the
  original brief requires; the numbering design changes how `issue_number` is allocated); the previous one is marked
  superseded and remains readable exactly as sent. **An accepted issue may be superseded only while
  nothing financial hangs off it** — no invoice and no variation — and its ceiling then falls to 0
  (J10, K6; `quote_issue_one_live_ceiling()`). Once money has moved, the path is a variation (R1.22c),
  or for a wrong document, withdrawal first (R1.15b). Until 2026-09-27 this said a revision applied only
  to an issue NOT accepted, which the J10 guard and its tests had already stopped being true of (L5).
- **R1.15a** **A non-price error on an accepted issue has a remedy (G8).** A variation answers "the scope
  changed"; it does not answer "the wrong client", "the wrong terms" or "the wrong tax treatment". For
  those, release 1 allows the acceptance to be **withdrawn** — recorded, audited, with a reason — which
  returns the issue to superseded-able. Without this, a typo in a client name on an accepted quote had
  no path at all.
- **R1.15b** **Withdrawal is refused while any invoice still has money billed on it** — enforced by a
  database trigger, `acceptance_withdrawal_guard()`, not by the caller. So for a *wrong document* once
  money has been demanded, the path is: void or fully credit each invoice, withdraw, then issue the next
  revision of the same quote. For *less work*, the path is a credit note and a negative variation on the
  same issue (R1.22a). Recorded variations do not block withdrawal: a withdrawn or superseded issue takes
  no new variation, so its recorded ones are history, and the agreed work is re-priced into the next
  revision by the tenant.
  *History, rewritten whole on 2026-09-27 after three amendments had left it contradicting itself
  (N9):* H4 first refused withdrawal while any invoice or variation existed, because variations could
  otherwise be detached from their issue as a live second copy. K4 let a voided or fully credited invoice
  stop blocking (J15 with it); L1 let variations stop blocking once K6's twin check made them inert —
  both owner's decisions, 2026-09-27. Until J4 a credit note moved no figure at all.
- **R1.15c** A withdrawal **drops the invoiceable ceiling to zero immediately**, and mutates nothing:
  no function rewrites `accepted_total_minor` (the J12 block asserts it; until 2026-10-01 a caller that set
  the write flag could, R5 — finding U11) and the ceiling is state-aware instead (ADR 0025, corrected). The
  balance row survives — deleting it would reintroduce the empty-lock hole R1.24a exists for — and is
  simply inert.
- **R1.16** The PDF carries the tenant's logo, header details and two brand colours from
  `document_settings` — a shared layout reading tenant data, never an uploaded template.
- **R1.16a** The rendered PDF's hash is recorded once, on `document_render`, and the issue and any
  acceptance **reference that row** rather than each storing their own copy (F17 — it had been specified
  twice, differently). **The hash is verified whenever a stored PDF is re-served**, or it is evidence
  nobody ever checks.
- **R1.17** Quote expiry, evaluated on the **jurisdiction's** day boundary (`America/Jamaica`), not the
  server's. Default validity **30 days** (approved by the owner, 2026-10-02), set per tenant and per
  quote. **An expired issue cannot be
  accepted**; the tenant extends it by issuing the next revision (finding B25).
- **R1.18** **[mobile — R1.18, R1.18a, R1.18b, R1.18d's offline outbox, R1.18e and R1.18f apply from the
  mobile app's launch. On the web app a seal is made online and numbered at once unless the free limit
  blocks it; R1.18c, R1.18g-j and R1.32a-c apply on the web too — a second member's seal of a revision
  already sealed is kept as a rejected seal, and a blocked seal is kept, exactly as on the phone (ADR 0029
  E4, finding C5)]** **Sealing works with no network** and the snapshot is held in a durable outbox that survives
  the app closing, shows what is pending, and is encrypted at rest on the device (R1.18f). **Numbering
  happens at sync; delivery never happens on its own** (ADR 0027 D10, finding B16): at sync the issue is
  numbered and becomes **ready to send**, and the contractor taps send — by email, or by sharing to
  WhatsApp from his own phone, which the server cannot do for him. A quote sealed on Sunday therefore never
  lands in a client's inbox whenever the phone next finds signal, after he may have changed his mind. A
  sealed, unnumbered issue is shown as "awaiting number", and a numbered one not yet sent as "ready to
  send"; neither is ever presented as sent.
- **R1.18a** The outbox carries **seals** in R1. It is built generic — one queue, keyed and replay-safe —
  so that R2's offline creates and variations use it rather than a second path.
- **R1.18c** **Sealing claims the quote (G4).** Two devices holding the same draft can both seal it —
  neither push conflicts, because each is an append — which would give one job two issued identities.
  So the server enforces **one sealed issue per (quote, revision)**, and the second device is refused
  and told who sealed this job — another member of the tenant (Pro has exactly three, ADR 0029 E3) or
  another of the same person's devices. A revision cannot be created offline.
- **R1.18g** **A refused seal is kept as a `rejected_seal`, not as an issue awaiting renumbering (H7).**
  "Offered as a revision" was impossible three ways: renumbering is an UPDATE on a sealed document;
  inserting a fresh issue from the same snapshot makes `sealed_at` either lie or be reset to sync time,
  destroying the one fact the snapshot exists to record; and letting the device renumber is the offline
  revision this very requirement forbids. It was never an issue.

  The row keeps **what the device actually priced, with its own true `sealed_at`** — which is all the
  promise was reaching for: the contractor stood in front of a client and said a number, and that number
  must survive a colleague syncing first. Several devices may lose the same race and every attempt is
  kept.
- **R1.18h** **First to sync wins, and both timestamps are kept.** Earliest-sealed looks fairer and is
  worse: it would let a device syncing on Friday retroactively take the identity of a job a colleague has
  already numbered and sent. "Your colleague's version got there first" is explainable in one sentence,
  and because `sealed_at` and `pushed_at` are both recorded, *who priced it first* stays answerable even
  though it is not what decides.
- **R1.18i** The tenant **resolves** a rejected seal — discarded, or reissued by opening a new draft from
  it and sealing that **online** as the next revision, whose `sealed_at` is honestly the moment of that
  new seal. The rejected row remains as the record of the gate price. Nothing is renumbered and the
  winner is never marked superseded by a document sealed before it.
- **R1.18j** **The resolution is the only thing about a rejected seal that can change, and it cannot be
  deleted at all (J16).** The price, the `sealed_at`, the client and the lines are frozen by a database
  trigger rather than by the application remembering, and the absence of a DELETE policy is what makes
  the row permanent. A tenant is the party a client would be in dispute with, so "the tenant can edit
  the evidence" is not a limitation to note — it is the defect.
- **R1.18d** **A sealed snapshot is never destroyed by any automatic process while it is unsynced** —
  not a timer, not an expired session, not a password change (finding B23, widening G5's "never by a
  timer"). Cached reads may expire; **an unsynced seal has no retention limit at all**. The only path that
  destroys one is a person marking the device lost (R1.18f). A limit that can destroy the only copy of a
  financial document is data loss on a schedule (G5).
- **R1.18e** **At sync, a seal is re-checked** against what could not be checked offline: the tenant is not
  suspended, the user is still an active member (R1 has no roles — every member may seal; a role check
  joins this list when roles arrive in R3, finding B6), the client still exists,
  the entitlement still permits it (metered at numbering — ADR 0023), and no colleague sealed that revision.
  Each refusal is explained in terms of what happened, never as a sync error. **A seal whose client was
  deleted while the device was offline is refused into a refused seal** (R1.18c), with that reason; the
  tenant can restore the client and then resolve it — the seal does not silently undo a colleague's
  deletion (finding H20, owner 2026-10-01). **The catalogue prices it froze are NOT re-checked:** the seal is
  a self-contained snapshot, and a later catalogue change must not void work priced at the gate.
- **R1.18b** A device holding unsynced seals for more than **3 days** warns the user (finding B25). An
  outbox is not a backup, and the app must not imply it is.
- **R1.18f** **The phone is now a place tenant data lives, and the threat model says so** (`THREAT-MODEL.md`
  §4a, G14): the local store is encrypted against the device keystore, the app locks behind the device's own
  authentication (the React Native app, ADR 0027 D2), and **remote sign-out cannot reach an offline
  device**. Two kinds of revocation are told apart (ADR 0027 D12, finding B23):
  **(a) an ordinary one** — an expired session, a password change, sign-out-everywhere — revokes the
  session; when the device next connects it asks its user to sign in again and **pushes the outbox before
  anything is cleared**. A password reset is an everyday act and must not destroy a seal made at a gate.
  **(b) "This device is lost"** — an explicit choice by a member, which tells them, before they confirm,
  that the device may hold seals that never reached us (we cannot know how many if it has never synced
  them) — and only then is the store wiped when the device next connects, without pushing.
  The trade-off is stated: a thief who also knows the password can push the outbox. That is small next to
  silent loss of priced work. Stating that a remote wipe cannot reach an offline phone is the control;
  claiming one would not be.

### W5 · Share and accept — no login for the client
- **R1.19** A share link is a **credential**: high-entropy token, hashed at rest, scoped to one issue,
  expiring, revocable (ADR 0022). It expires **30 days after the quote does** (R1.17), so a client can
  still read what they accepted; expiry and revocation are checked **by the API on every view** (R1.21a,
  finding B13).
- **R1.20** The client can accept or decline, and **acceptance is a ladder of graded evidence — grades 1, 2, 3, 4 and 6 (grade 5 retired by J5, its number tombstoned) — with the grade
  derived from append-only evidence** (`design/acceptance-evidence.md`, approved 2026-09-26). **The
  default bar is channel-aware** (ADR 0027 D6, finding B18): **grade 3 where the client has an email
  address at seal, grade 2 where they have only WhatsApp** — release 1 can send a code only by email, so a
  grade-3 default would mark the commonest client's every acceptance "below your standard". The tenant may
  set a fixed bar instead. Grade 3 is a one-time code to a stored or typed channel, an explicit signing act
  labelled as one, consent to sign electronically, and a record carrying the signer's name, the
  timestamp, the IP, the user agent and the destination actually used — plus a **reference to the
  `document_render` row whose hash is the document signed**, not a hash of its own (F17). **One
  acceptance per issue, ever, immutable; many evidence rows.** A client may **decline and later accept**
  the same issue, as often as it takes — a mis-tap or a negotiation costs no new revision — but a decline
  cannot follow an acceptance, and once an acceptance is withdrawn the issue reads `withdrawn` and takes no
  further response: the remedy is the next revision (J13, option C plus A, owner 2026-09-27;
  `design/acceptance-responses.md`).
- **R1.20e** **A channel is required at the point of use, not on the client (H9).** A client may exist
  with neither address — a walk-up at a gate is a real client — but a share link may only be minted for a
  client with at least one channel, and it may be typed at send time.
- **R1.20f** **The grade is derived, never stored**, so it rises when evidence arrives and cannot drift:
  the highest grade among the evidence on the issue's accepted acceptance, none once it is withdrawn or
  its issue superseded, and evidence attaches to nothing else; a client responds only to a numbered,
  current issue (W4) — one SQL function, `acceptance_grade()` (J6, owner 2026-10-01,
  `design/acceptance-grade.md`). **The bar is frozen at seal** and records whether the acceptance meets
  the tenant's standard; it does not gate invoicing (J8).
  A tenant-uploaded screenshot of a reply is **grade 1**, not grade 4: it is evidence the tenant holds
  and can fabricate, and grading it higher would be the comfortable lie (H10).
- **R1.20g** **A deposit is suggested above a threshold the tenant sets** —
  `document_settings.deposit_suggested_above_minor` (built with J8), unset meaning never. Suggested, not enforced: the
  contractor knows which clients are good for it and we do not, and a product that refuses to send a
  quote until they demand money gets worked around.
- **R1.20h** **Grade 4 — the client's own reply — is deferred and prepared for, precisely.** Release 1
  cannot witness one: WhatsApp click-to-chat sends the reply to the contractor's own phone, and we have
  no inbound mail handling. So release 1 adds the four nullable columns an inbound message needs, teaches
  the grade function grade 4, keys every provider event so a retried webhook is recorded once (J7), and
  records the two costs in the register. The reply address is derived from the issue id once inbound mail
  exists and nothing is stored; release-1 quotes keep the tenant's own reply address, so no client reply
  to one reaches us to be recorded as grade 4 — a consequence of where the reply goes, not a database rule
  (W9) (J7, owner 2026-10-01). **Nothing else** — no endpoint, no parsing, no provider.
- **R1.20a** **The product never states what the record proves.** The owner's position is that a typed
  name alone is not legal in a dispute; a properly constructed e-signature can be. So the UI says what was
  recorded and never that it is binding, and the terms do not call the tap a signature. Whether our
  implementation clears Jamaica's bar is the owner's attorney's answer, not ours.
- **R1.20b** Release 1 verifies by **email**, because it needs no new service — only the verified sending
  domain already owed (§9 item 1a). SMS is a new paid sub-processor and absent from the register;
  WhatsApp Business sending is release 3. **A code lasts 30 minutes, is single-use, and allows five wrong
  attempts** — longer than two cold starts and a slow inbox together (finding H17, ADR 0026).
- **R1.20c** **Moved to release 2 (ADR 0027 D13, finding B26): uploading a signed copy.** Since J5 it is
  graded 1, the same as a tenant's own record, which needs no file — and it was R1's second hostile-upload
  path, making the unchosen malware scanner and object storage load-bearing for W5. In R1 a client who
  signs paper is recorded as `tenant_recorded` (grade 1) with "the client signed paper" as its reason, and
  the contractor keeps the paper. When it returns, the rule stands: a tenant-uploaded scan is grade 1 —
  witnessed by nobody — and **we do not certify it**.
- **R1.20i** **The grade measures who witnessed the acceptance, never how convincing the artefact looks.**
  A signed page looks like strong evidence, which is precisely why the first version of the ladder ranked
  it above the one grade with an uncontrolled third party in the chain.
- **R1.20d** A **paid deposit is recorded as corroboration** of acceptance, linked to the issue. A client
  who pays 40% has behaved in a way no typed name matches, and R1.23 already builds the deposit. **Only a
  payment a provider confirms is `deposit_paid`, grade 6 — in R1, a WiPay payment that **our server has
  confirmed with WiPay directly**, by a server-to-server query whose answer is recorded as the evidence,
  never the callback body alone (ADR 0029 E2, finding C1). The callback is signed with the tenant's own WiPay
  key, which the tenant holds, so on its own it proves nothing the tenant could not forge. If WiPay offers
  no such query, a payment through a tenant's own account is `tenant_recorded`, grade 1. A
  deposit the tenant records by hand (R1.26) is `tenant_recorded`, grade 1, and the UI says "recorded by
  you"** (finding B21; R1.20i's test applied one rung up). The schema accepts any non-null external id, so
  the writing code is what holds this, and its test is a planted hand-recorded deposit that must not grade
  6. Grade 6 needs Pro, because a deposit is an invoice (§7).
- **R1.21** Share by WhatsApp click-to-chat and by email, on every tier. The contractor sends (R1.18):
  email goes through our single outbound path; WhatsApp is a link opened on his own phone. Server-side
  WhatsApp Business sending is R3.
- **R1.22** The shared page works on a cheap phone on mobile data, needs no account, and meets N11.
- **R1.21a** **The share page must survive the API being asleep (F16).** It is the one client-facing
  surface, and the free instance spins down after ~15 minutes with a ~50-second first response
  (`SERVICE-REGISTER.md` §4a). A client who taps a quote link and waits a minute on a blank screen is
  the worst impression the product can make, and it lands on the tenant, not on us. **At launch the page
  is served by the API** — a paid instance that does not sleep (ADR 0026) — which checks the link's expiry
  and revocation on every view. **Before launch**, the page shell is static and **wakes the API in the
  background when it opens**, showing a plain "connecting" state rather than a blank screen; accepting
  takes several calls separated by the client's trip to their inbox (finding H17). **No rendered document
  is pre-built or stored at the edge** (finding B13): a pre-rendered quote is retrievable by its raw URL,
  outlives revocation until something purges it, and would make the website host a holder of client
  documents the register says it never stores.
- **R1.21b** **The contractor sees what happened to every message** (finding B16, Rule 11). The issue and
  the invoice show the last delivery outcome — sent, delivered, bounced — and a bounced verification code
  says so on the client's page, with the contractor told. Without it, a mistyped address fails silently,
  which §9 calls worse than failing loudly.
- **R1.21c** **Messages to a tenant's clients carry an opt-out** (reminders, R1.28; Rule 11), and **each
  tier has a daily message cap** held as entitlement data (Rule 14), so a Free tenant cannot send without
  limit through a per-message provider.

### W6a · Variations, minimal — added by review (F3)
- **R1.22f** **A variation is recorded online in R1; recording one offline is R2** (ADR 0027 D1, finding
  B5). Either way its effect on the ceiling is computed **server-side, inside the lock** (G13). A device
  never decides how much may be billed.
- **R1.22g** **A variation carries a client-supplied idempotency key** — built for offline replay and kept
  in R1 because an online retry needs it too (`client_reference`,
  migration `20260926100000_variation_idempotency`), unique per issue. Without one a replayed outbox
  entry inserts a second append-only row, the ceiling rises **permanently**, and the nightly
  reconciliation certifies the inflated figure as correct — self-ratifying over-billing (H11). The key
  comes from the device because only the client can tell a retry from a genuine second variation of
  the same amount on the same day. **What the database guarantees is that one key cannot produce two
  rows; that the application sends the same key on every retry is the application's job and nothing in
  the schema can check it.**
- **R1.22a** A **priced variation** may be recorded against an accepted issue: a description, lines
  priced the same way a quote is, and a total that may be positive or negative.
  **A negative variation may not take the ceiling below what is already invoiced (J4).** The remedy is
  one transaction: credit the excess against an invoice, then record the variation. The refusal names
  the amount to credit. Until 2026-09-26 this sentence promised a negative total that the ordinary
  case — scope removed after progress billing — could not record (`docs/design/scope-reduction.md`).
- **R1.22b** Recording one **re-derives the ceiling** for that issue — not the accepted total, which no
  variation moves (R1.24b). The distinction matters and getting it wrong was finding H3: the
  ceiling is `accepted_total + variations_total`, and a variation moves the second term. Variations are
  immutable once recorded; a mistake is corrected by another variation. **Tax basis (ADR 0027 D7, finding
  C2):** once the GCT design lands, the ceiling and every term in it — the accepted figure, variations and the
  invoiced total — are **net of tax**; until that migration, the built ceiling is tax-inclusive.
- **R1.22c** Revising an accepted issue **once money has moved on it** — any invoice or variation — is
  refused; the path is a variation, or for a wrong document, withdrawal first (R1.15b). An accepted issue
  with nothing against it may be revised, and its ceiling falls to 0 (R1.15). What is impossible is
  **two live ceilings on one quote**, not two acceptances: only the latest revision can hold a ceiling.
  *Corrected 2026-09-27 (N1): this said revising any accepted issue was refused, which the J10 guard and
  its tests had contradicted since J10.*
- **R1.22d** The audit trail records who recorded a variation and when. R1 has **no client signature on
  a variation**; that is R2, and the UI must not present a recorded variation as client-accepted.

### W7 · Invoice and get paid — the Pro line
- **R1.23** **Deposit, progress and final invoices against one accepted issue** — the top-ranked
  missing feature for this trade. Note this **deliberately supersedes** the Phase 0 audit's inventory
  item #15, which recorded the old application's "one invoice per quote" as *keep* (F18). It was kept as
  an accurate description of what exists, not as a decision to preserve it; staged invoicing is #34, the
  audit's top-ranked absent feature, and the two cannot both hold. Recorded here rather than left as two
  documents disagreeing.
- **R1.24** The invoiced figure against an accepted issue may never exceed its **accepted total plus
  recorded variations** (R1.22b). **This is the most important arithmetic invariant in the product.**
  What counts as invoiced is defined once, in `issue_balance_apply()`, and not restated here (ADR 0025):
  since J4 a credit note lowers it (`docs/design/scope-reduction.md`). **Tax-exclusive once the GCT design
  lands** (R1.9, ADR 0027 D7); until that migration the built ceiling is tax-inclusive (finding C2). *(Pointer
  2026-10-02, finding TD14: `docs/design/tax-and-documents.md` T4 says what changes, including the ceiling per tax code.)*
- **R1.24d** **"Recorded", not "accepted", and the weakness is stated rather than hidden (G1).** In
  release 1 a variation has no client signature, so recording one **does** let the contractor raise their
  own invoiceable ceiling. R1.24 therefore protects against *mistake and drift*, not against a contractor
  who intends to over-bill — and it is the client's own acceptance, plus the audit trail naming who
  recorded the variation and when, that answers the second. Calling it "accepted variations" while
  building no acceptance would have been the worse outcome: an invariant that reads stronger than it is.
  When release 2 makes variations signable, this requirement tightens to "accepted" and the ceiling
  becomes what it claims to be.
- **R1.24a** It is **enforced by a lock, not by prose** (domain model §6.2a). The acceptance path
  **must** create the `issue_balance` row **in the same transaction as the acceptance**, by an explicit
  `issue_balance_open()` call — nothing creates it automatically, and an acceptance committed without the
  call has no row until one is made (the N2 test in `db/test/documents-core.test.ts` reaches that state;
  finding V17) (R7; "unconditionally" removed 2026-10-01,
  finding U11) — because a `SELECT … FOR UPDATE`
  that matches no row takes **no lock at all**, so a missing row would have let the very first pair of
  concurrent invoices through (G2). Issuing an invoice then takes `SELECT … FOR UPDATE` on that row, computes the new total, refuses if it would
  exceed the ceiling, and inserts the invoice in the same transaction. Per-row version checks do nothing
  here — two invoices each individually under the total are together over it. Review found this
  invariant stated twice in prose with nowhere to live (F4), which is Rule 1.10's "invariant with no
  owner".
- **R1.24b** `issue_balance` is a **derived cache with a lock**: the balance functions re-sum the
  variations and invoiced totals from the underlying rows **inside** the lock; the ceiling still reads the
  cached `accepted_total_minor` (finding U13), so the ceiling is only as safe as the row's writers. Only
  the two balance functions can write it — the application role holds SELECT alone (R5, built 2026-10-01,
  `docs/THREAT-MODEL.md` §4e; Rule 21.10, finding T10). `accepted_total_minor` is a
  copy of the accepted issue's frozen total — safe only because the issue is immutable (G12). That no
  variation, invoice, void or credit note moves it is asserted by the J12 block of
  `db/test/documents-core.test.ts`; who can write the row at all is stated
  once, in ADR 0025 decision 2 (Rule 21.10).
- **R1.24e** The **reconciliation job runs nightly per tenant**, rebuilds all three derived columns,
  and on a mismatch writes an audit entry, alerts us and **refuses further invoicing against that issue**
  until a person has looked. It does not self-heal: self-healing erases the evidence of the defect that
  caused the drift (G12). **How (finding B25), owed with the job's design:** the hold is a row the invoicing
  path reads inside the lock; a staff member clears it with a recorded reason in the platform audit trail
  (R1.48); the alert is an email to the support address.
- **R1.24c** Its tests are **planted defects**, because this is money arithmetic and judgement-class
  under Rule 16.5: two concurrent invoices, a replayed offline seal, and a variation landing between the
  read and the write.
- **R1.25** Invoice status is **derived** from payments and credit notes — never stored. **Retention is
  not an input in R1** because retention tracking is R2 (§8); the earlier wording made an excluded
  entity a term in an R1 formula (F4). Retention and credits never *raise* the R1.24 ceiling: money
  held back or credited does not increase how much may be billed. **A credit note does reduce the
  invoiced figure the ceiling is compared with** (J4, amended 2026-09-26) — it frees room within the
  same ceiling, the same effect as voiding and re-issuing but for an amount rather than a whole
  invoice. Its bounds are enforced in `issue_balance_enforce()`. A stored
  status is the second source of truth that produced the old application's negative amount due.
- **R1.25a** **A retention job is billed net in R1** (ADR 0027 D13, finding B26): each progress invoice
  is for what the client will actually pay now, and the retention is invoiced when it falls due — so a
  withheld 10% never shows as an overdue part-payment. **Any invoice can be marked "do not remind"**.
- **R1.26** Recording a client payment: amount, date, method, reference, optional receipt file. **A
  payment is recorded as it actually happened** (finding B9): an amount above the balance is recorded and
  shown as an **over-payment** the tenant resolves — a refund recorded, or a credit kept on the client —
  never refused. (It said "never more than the balance", which left a card payment that arrived after a
  credit note with nowhere to go.)
- **R1.27** An issued invoice is reduced only by a **credit note**, never by editing.
- **R1.28** Overdue reminders and a digest, through the single outbound-message path. Each reminder to a
  client carries an opt-out (R1.21c); an invoice marked "do not remind" (R1.25a) is skipped; reminders
  stop when the tenant's subscription lapses (R1.37c).
- **R1.29** WiPay card payment links (Pro), **paid into the tenant's own WiPay merchant account** (ADR
  0027 D3, finding B9). The client pays the contractor directly; **Pryvis never holds client money** — we
  create the link with the tenant's credentials, and **an invoice is marked paid through WiPay only after
  our server confirms the transaction with WiPay** (R1.20d, ADR 0029 E2): the callback is signed with the
  tenant's own key, so it alone could be forged by the tenant (finding C1). The feature is available once the tenant connects their account, **in their Pryvis
  account settings**; **Pryvis's own WiPay account takes only subscription payments to us** (ADR 0028); each tenant's
  credentials are a secret, **encrypted at rest with a key that is never in the database** (as TOTP secrets
  are, ADR 0021) — a register row and a threat-model row are owed (Rule 18; `docs/THREAT-MODEL.md`). Owed
  before W7 is built: confirm WiPay offers merchant accounts to small Jamaican businesses, what its
  onboarding asks of them, and **whether it offers a transaction-status query** (§9).

### W9 · Subscribe — how we get paid
- **R1.30** Self-service sign-up on the website, free tier, no card (ADR 0015).
- **R1.30a** **Registration is the one unauthenticated endpoint that creates rows**, so Rule 14's
  defences ship *with* it, not after. Quoting Rule 14 **as it now reads**, because the previous version of
  this requirement quoted wording the same commit had deleted (finding H13): rate limiting per address and
  per IP · **email verification before the account can cost us money** · **one tenant per verified
  address** · and a duplicate registration that **does not reveal the address is taken**.
- **R1.30b** Email verification is **load-bearing for ADR 0022**, not a nicety. Global email uniqueness
  (on `app_credential.email`, R1.30c) is what enforces "one business per address"; without verification the first person to type an address
  owns it and can lock out its real holder — and because R1.30a's duplicate response deliberately does
  not enumerate, the victim cannot even discover why. So an unverified registration reserves nothing:
  the address is claimed only when verified, and unverified attempts expire.
- **R1.30c** Rule 14's *bound on tenants per address* and ADR 0022's *one person, several businesses, one
  address each* are reconciled as **one tenant per verified address**. It is enforced by the **global**
  unique index on `app_credential.email` — **provided registration inserts the user and its credential in
  one transaction with the same address**. The index on `app_user.email` is per tenant (finding B28; this
  said "the unique index that already exists", and four documents called that one global). **A
  precondition of building sign-up:** the owed guard that `app_user.email` and `app_credential.email` stay
  equal, or a composite foreign key that makes them.
- **R1.30d** **The rate bound is not an IP bound alone, because IP does not work here (G11).** Jamaican
  mobile networks put tens of thousands of subscribers behind carrier-grade NAT, so an IP bound either
  blocks a whole network or permits everything. The bounds are therefore:
  **(a0)** a rate limit **per email address**, which Rule 14 requires and the previous version of this
  list silently dropped while presenting itself as exhaustive (finding H14). Without it, registration is
  an **email bomb aimed at a known address**: R1.30a mails the existing owner on every duplicate attempt,
  so an attacker who knows a tenant's address can have us send them a hundred messages;
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
- **R1.32** Free tier limit: **3 distinct jobs *numbered* per calendar month** (ADR 0023) — Jamaica's
  month, `America/Jamaica` (ADR 0007 decision 4, finding B25) — enforced
  server-side. **The meter counts distinct QUOTES, not numbers allocated** (finding H20): a revision is a new
  issue, and counting issues would charge for revisions (since ADR 0031 a revision also keeps its quote's
  number, so the meter and the number now agree). Not counted on sealing — on the phone sealing happens offline, and metering it would mean trusting a
  client-side count or refusing work already done at a client's gate. **On the web app the same rule
  holds** (ADR 0029 E4): a fourth job in the month is sealed and **held blocked**, kept and listed exactly as
  R1.32a-c describe, never refused before sealing and never lost — so §10's "a fourth job refused" is the
  same event on both. Not counted on sending. **Revisions
  and declines are free**: charging for a revision meters care, and billing for a declined quote teaches
  contractors to quote less.
- **R1.32a** **The cross-month case has a test and a message.** A contractor who seals four jobs offline on
  a Sunday gets three numbered and one refused when they sync, in the month of *syncing* (on the web app, the
  fourth is blocked at the moment it is sealed). The refused
  snapshot is **kept, never destroyed**, and the message explains what happened rather than reporting a
  sync error. Upgrading lifts the limit; the tenant then numbers each blocked seal (R1.32b). (This said
  "upgrading releases it", the opposite of R1.32c eleven lines on — finding B2; H12's closure had left it.)
- **R1.32b** **Nothing numbers a blocked seal automatically, and that is the answer to "what is the
  queue?" (H12).** There is no queue, because there is no automatic process. A seal blocked by the free
  limit sits in a list the tenant can see — its price, its client, the date it was sealed — and the tenant
  **releases one explicitly** when quota allows.

  Automatic FIFO was the obvious design and it is wrong here: numbering is what turns a snapshot into a
  document with a number the client will see, and spending a scarce monthly allowance on whichever job
  happened to be sealed first — possibly one the contractor has since decided not to pursue — is a
  commitment the product should not make on their behalf. So the three questions the finding asked
  dissolve: **the tenant numbers it, in whatever order they choose, against the month they do it in
  (ADR 0023), and the tenant decides.**
- **R1.32c** A blocked seal **does not expire** (R1.18d already forbids deleting an unsynced or unnumbered
  seal; on the web a blocked seal is held on the server under the same rule), and upgrading lifts the limit rather than releasing the seals — because releasing them would be
  numbering on the tenant's behalf, which R1.32b just refused to do.
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
- **R1.37a** **Upgrading by card** (ADR 0027 D4, finding B7; Rule 14): self-service through WiPay, and
  entitlements change when a verified callback confirms the payment — never on the client's word. **Only if
  WiPay supports it for our own account**; if it does not, R1 is manual-only, that is stated on the
  pricing page, and §10's conversion target is read with it. The bank-deposit path (R1.33-R1.37) remains for
  tenants without a card.
- **R1.37b** **The billing term and renewal.** The term or terms are set with the prices (§9 item 2). A
  card subscription renews at the end of the term if WiPay supports recurring payments; otherwise, and for
  a bank deposit, the tenant is reminded 7 days before the term ends and pays for the next one the same way.
- **R1.37c** **What a tenant keeps when their subscription lapses** (ADR 0027 D4): **everything already
  created stays readable**; **money already invoiced can still be collected** — payments recorded and open
  links paid; **reminders stop**; nothing new that is Pro can be created; and **export always works**
  (R1.43). Withholding a client's money owed to the contractor would be the "locked out of their own
  history" outcome `TIERS.md` §2a warns of. **Every member keeps access** (ADR 0029 E3, finding C6): all
  three can still sign in, read everything and record payments on money already invoiced; only creating
  new work follows Free's limits; and **no seal is refused because of the lapse itself**. Whether a lapsed tenant may still price with recipes beyond
  Free's one is owed with the prices.
- **R1.37d** A tenant who lapses mid-month is on Free's limit for the rest of that month, counting the jobs
  already numbered in it.
- **R1.37e** **[mobile]** **The phone caches entitlements with a 7-day grace period** (domain model §8; finding B25), so
  a seal made offline is not refused for a lapse the device has not heard about; the numbering at sync
  (R1.32) is what is metered, on the server.
- **R1.37f** WiPay for our own subscriptions is a different account from any tenant's (R1.29): ours,
  KYC'd to the owner's business (§9 item 1b).

### Cross-cutting
- **R1.38** **Support in R1 is email** (ADR 0029 E1; in-app threads move to R2, finding B26). **No chatbot
  at the web launch:** a chatbot's input is whatever a person types, which may name a client or an address,
  and Rule 15 forbids sending tenant or client personal data to a model (finding C4). The chatbot remains the
  owner's goal and is designed in the support-model options paper the original brief requires (§15), which
  settles Rule 15 before anything is built. Staff access to a tenant's data is capability-gated and audited
  (W10).
- **R1.39** Every significant action is audited, atomically with the change it describes (ADR 0020).
- **R1.40** A tenant can read their own audit trail — what we did to their account, not only what they
  did.
- **R1.43** **Data export, on every tier and after a lapse** (ADR 0027 D8, finding B4): the tenant
  downloads their quotes and issues, invoices, credit notes, payments, clients and catalogue as CSV, and
  each issued document's PDF. The terms and the pricing page already promise it; a lapse (R1.37c) and a
  person's request for their data (R1.44) both rest on it.
- **R1.44** **A person's request about their data can be carried out** (finding B8). Staff can export what
  we hold about one of a tenant's clients, and **redact a client's personal fields while leaving the
  financial record intact**. Whether the records the product keeps permanently — the client book (R1.3), a
  rejected seal (R1.18j), the audit trail (ADR 0020), an acceptance's IP address and user agent (R1.20) —
  may be kept against an erasure request is read now from the public text of the **Data Protection Act,
  2020**, labelled **unverified**, and **settled by the attorney before launch** (§9, ADR 0027 D14). As
  processor of the tenants' client data, our terms carry a processing clause.
- **R1.45** **A written breach response**, including notifying the Information Commissioner within the
  period the Act sets (on our current, unverified reading of it) and telling the people affected, as the
  draft privacy notice promises. Rule 5 already requires the plan; this makes it a release-1 deliverable.

### W10 · Staff operations — added by review (B15)

Release 1 cannot run without staff acting through some interface: approving payments, activating
subscriptions, answering support, suspending a tenant. Every design that touches it had deferred the
console; this is its minimum.
- **R1.46** **The release-1 staff capabilities:** `approve_payment`, `activate_subscription`,
  `answer_support`, `suspend_tenant`, `grant_entitlement` and `grant_capability`. Each is granted to a named
  person by another named person, through an audited function — the application can only read
  `platform_capability` (`docs/design/privilege-model.md` D5).
- **R1.47** **No impersonation in R1** (ADR 0027 D9). A staff member who must read a tenant's data does
  so through a **time-limited, tenant-visible, audited access grant** (Rule 5.1). Impersonation waits for
  hardware-key MFA (`docs/design/staff-mfa.md`).
- **R1.48** **A platform audit trail** records every staff action, including those with no tenant —
  owed since ADR 0020.
- **R1.49** The staff console provides the screens for R1.33-R1.37, R1.44, R1.46-R1.48 and suspension, and
  every staff account has MFA (Rule 5.1; **staff MFA is a launch blocker**). Two staff accounts exist
  before either is relied on (§9 item 5).

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
| **N4** | Works on a mid-range Android phone, on mobile data, legible in sunlight, one-handed | The primary user is standing up outdoors. **Instrument:** the R1.8 walkthrough on the named device covers speed; one-handedness is N11's touch-target and reach values. **A contrast check on the design tokens is owed** (finding B1: this row said one existed; none does) — built with the app's first screen, since the only tokens today are the website's. **Sunlight legibility has no automated test** — it is judged by taking the phone outside, and that is a person's job, recorded per release |
| **N5** | **[mobile]** Priced draft producible with **no network**; the app states its sync status plainly | §4's resolution of the "on the spot" promise. **Instrument:** the R1.8 walkthrough runs in aeroplane mode, so N5 fails if R1.8 fails; the outbox's pending count is asserted by a test that seals offline and inspects it before any sync |
| **N6** | Staff MFA mandatory; tenant MFA available | Rule 5.1, ADR 0021 |
| **N7** | No personal data or secrets in logs; uploads private and scanned | Rule 5 |
| **N8** | No tenant or client personal data, and no secrets, ever sent to the Claude API — redacted or synthetic only | Rule 15 |
| **N9** | The public site keeps working when the API is asleep | Rule 20; the free tier spins down and the front door must not look broken. **Instrument:** the existing site guards prove no external host is loaded and the site builds standalone; R1.21a extends this to the share page, which is the surface that actually matters to a client |
| **N10** | Free-tier infrastructure now, with a written trigger for moving to paid | Rule 10. **The API sleeps after ~15 min and the first visit waits ~50s** — acceptable for a prototype, not at launch. **The ~50 s is a hand measurement of the old application, 2026-09-24** (finding B1: this row said the `API liveness` workflow records it on every run; that workflow records only a status code, and probes the old application). **An instrument that times the release-1 API is owed** with its deployment. **The trigger is ADR 0026:** a paid, always-on API is a launch requirement, and until then the share page wakes the API when it opens (R1.21a, finding H17) |
| **N11** | **Accessibility (finding B17):** the client's share page and accept flow meet **WCAG 2.2 AA**; the app's sealing path supports the phone's text-size setting and has touch targets of at least 44×44 points | The share page is the one surface a member of the public must complete. **Instrument:** an automated accessibility scan in CI on the share page, plus a manual pass per release; the app's values are asserted by component tests |

## 7. Tiers in release 1

R1 ships **Free and Pro only**. Business is R3, and until then the site must not sell it as available.

| | Free | Pro |
|---|---|---|
| Jobs **numbered** per month (ADR 0023: not sealed, not sent; revisions and declines free) | 3 | Unlimited |
| Branded PDF, share, client accept | ✓ | ✓ |
| Clients, catalog, labour, equipment | ✓ | ✓ |
| Recipes | **create one**, then use it (ADR 0023) | unlimited |
| Invoices, payments, reminders, WiPay | — | ✓ |
| Acceptance evidence up to grade 6 (a provider-confirmed deposit needs an invoice, R1.20d) | up to 3 | up to 6 |
| Data export (R1.43) — also after a lapse | ✓ | ✓ |
| Offline **sealing** (the core promise — every tier, ADR 0023; **with the mobile app**, ADR 0028) | ✓, and a seal past the monthly limit waits to be numbered rather than being lost (R1.32b) | ✓ |
| Offline **issuing** (numbered at the gate) | — (R2) | — (R2, the Pro line when it lands) |
| Users | 1 | **exactly 3**, no roles (ADR 0029 E3) |

**Open, and blocking the paid tier:** the **prices** are not set. The site shows no number by deliberate
choice, and `new-app/web/test/site-guards.test.ts` enforces that much — it asserts no tier displays a
digit in its price label.

**What the site says, and what holds it (F5, F6, B4; Rule 20).** The pricing page's tier lists mark every
undelivered feature "(coming in release 2)" and Business as not yet available — **the owner chose marking
over removal** — and a guard holds them to a machine-readable list of what release 1 delivers. Review 5
found the rest of the site still over-claimed: the features and home pages sold retention, job profit and
job costing in the present tense, the "coming next" list named release-1 features, and the terms promised
an export release 1 did not build. Corrected 2026-10-02 (ADR 0027): the copy now says what release 1 does,
and R1.43 builds the export.

- **R1.40a — the site says only what the current release delivers.** An undelivered feature is marked as
  coming, or absent. (The owner chose marking, for the tier lists.)
- **R1.40b — a guard asserts it across the whole site**, not only the tier lists: every tier line must be
  delivered, marked for a later release, or one of the named mobile-app lines; and every other string in the
  site's copy and legal text — tier headings included — is read sentence by sentence for the phrases naming
  undelivered features (offline capture among them), each passing only if **its own sentence** marks it
  as coming later. **What it does not catch:** a claim worded in a way the phrase list does not name. It
  ships with planted defects proving it fires (Rule 21.2). (It read only the tier lists until finding B4,
  and four gaps were closed after finding C7.)

### The entity with a deadline — named because leaving it out was the finding (F13)
- **R1.42** **§10's measures are instrumented in release 1, or they are not measures.** The signals need
  data that does not collect itself: time from sign-up to the first quote **sent**, the offline pricing
  walkthrough (R1.8), jobs numbered per tenant per month, tenants who hit the free limit, **Pro tenants'**
  accepted issues that become an invoice, conversions within 30 days of first hitting the limit,
  single-operator exceptions, and three added by finding B11: **seals made offline and their seal-to-number
  delay**, **share links opened against acceptances**, and **verification codes sent against codes
  entered**. §10 asserted "instrumentation that is itself
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

Named so nothing is "coming soon" by accident: client-**signed** variations and change orders (recorded
variations are in R1, W6a) · project costing and job result · retention tracking (a retention job is billed
net, R1.25a) · offline issuing · offline creates, offline variations and multi-device draft merge (ADR 0027
D1) · signed-copy upload (R1.20c) · in-app support threads (R1.38) · staff impersonation (R1.47) · number
series that reset (R1.14) · the Business tier (roles, approvals, crews, consolidated reporting) ·
server-side WhatsApp Business sending · the material price index · an accountant-formatted export (R1.43's
CSV export is in) · the admin-curated regulatory feed (**dropped**, brief §5a) · multi-country beyond
Jamaica · a client portal (ADR 0022) · any second product.

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
   which is the only distribution this product has. Offline *issuing* (R2) carries the Pro line. §7,
   `TIERS.md` and the site copy are all amended (the stale "owed" here was finding H20).
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

*(Pointer 2026-10-02: when each of these is asked for, and in which batch, is scheduled in `docs/OWNER-ACTIONS.md`,
at the owner's request — complete batches at each stage, never one at a time.)*

R1 cannot launch without these, and none of them are engineering:

1. **`info@pryvis.com` receiving mail.** The site's only call to action is broken without it.
1a. **A verified *sending* domain** — DKIM, SPF and DMARC on `pryvis.com`, which only the owner can add
   at GoDaddy. R1.21 and R1.28 send a client's quote and a payment reminder; unauthenticated mail lands
   in spam and fails **silently**, which is worse than failing loudly. Item 1 covers receiving and said
   nothing about sending (F11).
1b. **WiPay, two ways (ADR 0027 D3, D4).** Our own merchant account, KYC'd to the owner's business, for
   tenants upgrading by card (R1.37a) — a lead time we do not control. And **each Pro tenant's own** account
   for their clients' card payments (R1.29): the owner confirms WiPay offers it to small Jamaican businesses
   and what onboarding asks of them, and whether recurring payments exist (R1.37b). The register flags WiPay
   as a single point of dependence with no like-for-like local substitute.
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
   to remove a second factor (ADR 0021), and separation of duties needs two people (R1.34). **The person
   is not yet named (ADR 0028)**; until then the single-operator exception (R1.35) is the recorded
   fallback.

Added by review 5 (B8, B22) and the owner's decisions (ADR 0027):

6. **An attorney, before full launch — a launch gate (ADR 0027 D14).** Until then every legal reading the
   product relies on cites its public source and is labelled unverified: the **Data Protection Act, 2020**
   (controller and processor roles, registration, breach notification, transfers outside Jamaica, how long
   the permanent records may be kept — R1.44, R1.45), whether our **e-signature** clears Jamaica's bar
   (R1.20a; ADR 0023 decision 4 says a "no" is a design change), the **terms and privacy notice** (item 3),
   and whether anything in the **payments** flow is regulated.
7. **A paid, always-on host for the rebuilt API** (ADR 0026). Today the only deployment is the old
   application on a free plan; the rebuilt API has none. A recurring cost the owner approves.
8. **An accountant's review of the GCT design before launch** (R1.9, ADR 0027 D7).
9. **App-store developer accounts** for Android and iOS in the business's name, with their own
   verification lead times (ADR 0027 D2) — needed for the mobile app's launch, not the web launch (ADR
   0028).
10. **A monthly spend limit for Claude** — for maintenance now, and for the support chatbot once it is
   designed (R1.38, ADR 0029 E1). The owner holds a Claude developer account (ADR 0028); the limit is still
   to be set.

## 10. How we will know it worked

Measured, not felt. Each needs instrumentation that is itself part of R1.

| Signal | Target for R1 | Why this one |
|---|---|---|
| A new tenant **sends their first quote** (the clock stops at send, R1.18) | within 30 minutes of sign-up | If set-up defeats them, nothing else matters. ("Without support" was dropped: no row can know about an email to support, finding B11) |
| Priced draft from recipe — online on the web app; offline from the mobile app's launch (ADR 0028) | **under 60 seconds** of interaction | This is the product's whole claim |
| Free tenants who **hit the free limit** (a fourth job refused) | ≥ 30% of active Free tenants by month two — **active** means at least one job numbered in the month | This is the demand signal. The earlier version of this row asked for "≥ 4 quotes/month", which the free limit of 3 makes impossible — the server refuses the fourth (F9) |
| **Pro tenants'** accepted quotes that become an invoice | ≥ 70% | Tests whether W7 is where they actually work. Free cannot invoice, so counting Free measured the tier mix (B11) |
| Free → Pro conversion | ≥ 10% of tenants **who hit the free limit**, within 30 days of first hitting it | The denominator must be tenants showing demand. "Tenants issuing ≥ 4/month" was the already-converted population, so the rate was uncomputable (F9) |
| Single-operator exceptions on manual payments | counted, each reviewed | 100% approval by a second person is guaranteed by construction (R1.34), so it could only ever read 100%; the exceptions are what can move (B11) |
| Seals made offline, and their seal-to-number delay — from the mobile app's launch | observed, no target | §4 defers offline issuing until contractors hit the wall; this is how R1 tells us (B11) |
| Share links opened against acceptances; codes sent against codes entered | observed, no target | The failure H17 predicted — an abandoned acceptance that looks like a client ignoring the quote — is otherwise invisible (B11) |

**Below about 30 active tenants, these figures are read as qualitative** — one tenant moves a percentage
by a whole target (finding B11).

## 11. Risks, ranked

Each with who watches it and what makes it act (finding B19, 2026-10-02). "The builder" is whoever leads
the build. The numeric triggers in items 6 and 7 were approved by the owner on 2026-10-02.

1. **The attorney's answer changes the design.** Legal readings are public information until the attorney
   reviews them before launch (ADR 0027 D14), and ADR 0023 decision 4 says a "no" on the e-signature is a
   design change. *Watch:* owner. *Trigger:* the attorney engaged before W5 ships to a real client, so a
   change lands before launch, not after.
2. **WiPay: the account model or onboarding does not fit.** Per-tenant accounts (R1.29) and card upgrades
   (R1.37a) both depend on what WiPay offers. *Watch:* owner. *Trigger:* WiPay's answer before W7 is built;
   if per-tenant accounts are not available, R1.29 returns to the owner as a decision.
3. **The offline scope grows back, or the promise waits too long.** §4 keeps the sync engine out of the
   money release and the requirements had drifted it back once (B5); and with the web app first (ADR 0028),
   a contractor with no signal cannot seal until the mobile app ships. *Watch:* the builder, and the owner
   for timing. *Trigger:* any requirement that writes offline other than a seal goes back to the owner; and
   the mobile app is scheduled once the web app is ready.
4. **Data protection.** No legal analysis yet exists for the first country (B8). *Watch:* owner.
   *Trigger:* the attorney's review (risk 1); R1.44 and R1.45 built before launch.
5. **Staffing.** R1.34 needs two staff for every manual activation. *Watch:* owner. *Trigger:* the second
   person named before the first paying tenant (§9 item 5).
6. **The free tier is too generous or too mean.** Three jobs a month is a guess, held as an entitlement
   value so it changes without a release. *Watch:* owner. *Trigger:* §10's limit-hit rate below 15% or
   above 60% of active Free tenants after two months.
7. **Nobody pays.** Invoicing is in R1 so this is testable in month one. *Watch:* owner. *Trigger:*
   conversion below 5% of limit-hitters after three months, with at least 30 active tenants.
8. **The plan keeps changing.** Five review rounds found 19, 17, 20, 16 and 28 findings, most created by
   the amendments that closed the round before. *Watch:* owner. *Trigger:* the next review of this document
   finds a blocker an amendment created — then amendments stop and the build proceeds on what is approved.

Moved out (B19): the cold start is no longer a risk but a cost — ADR 0026 makes the API paid and always on
at launch (§9 item 7); number allocation under offline issuing cannot occur in R1 and belongs to R2.

## 12. What this PRD does not settle

- **The physical schema.** Its own step, from the approved domain model.
- **Screen-by-screen UI.** Each workflow needs a design before code (Rule 1.1); this says what must be
  possible, not what it looks like.
- **Migrating data from the old application.** Recorded in the audit's §5; depends on the schema.
- **The native mobile app's shape** — **decided 2026-10-02: React Native with Expo** (ADR 0027 D2),
  **launched after the web app** (ADR 0028). This
  said R1's scope was "achievable either way"; it was not, because R1.18f needs the device's keystore and
  lock (finding B5).
- **The GCT design** (R1.9) — owed before W3 and W7 are built. *(Pointer 2026-10-02, finding TD14: written —
  `docs/design/tax-and-documents.md`, approved by the owner; its closing check and the accountant's review (§9 item 8) remain.)*
- **Trinidad and Tobago**, or any second country. Country selection is ADR 0006 and rules as data ADR 0005;
  the rule-pack foundation exists in the old application and is **owed in the rebuild** (finding B3).
  Switching a second country on is a later decision with its own tax and timezone work.
- **Pricing.** §7 and §9 say why.
