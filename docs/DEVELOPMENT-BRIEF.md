# Quotation Application: Development Brief for Claude

> **Revised 2026-09-24.** Eight owner-approved edits from `docs/BRIEF-EDITS-PROPOSED.md` are applied below, each marked where it lands. Where we actually are against this brief is tracked, section by section, in `docs/BRIEF-STATUS.md` (Rule 19).

## 1. Purpose of this document

This brief captures the goals, methodology, owner requirements, and architectural recommendations agreed so far for rebuilding our quotation application. Treat it as the standing context for all work on this project. Follow it in order, and do not skip ahead to code.

This is a **living document**. Once Phase 0's audit, feature inventory, and product-scope recommendation are complete, this brief is to be revised in light of what was actually found in the existing application and website — not treated as fixed from before that review happened. The same applies after Phase 1 and at any other point where new knowledge changes an assumption made here. Claude should propose specific edits to this document rather than letting it go stale, and the owner reviews and approves changes to it the same way as any other design decision.

Throughout, **Owner requirement** marks something the owner has asked for. **Recommendation** marks professional guidance that the owner may accept, change, or reject through an ADR.

## 2. Project summary

- **Product:** A web and mobile application that lets client businesses (tenants) produce quotations for their own customers. **This description is provisional** — see the note below.
- **Current state:** A first version exists. There are suspected **architecture and database storage issues**.
- **Goal:** Build a new version to proper professional development standards, deliberately **not vibe coding**.
- **Business model:** Tiered service plans, shaped by the product-scope decision below.
- **Geography:** Launch in one country, then expand to multiple countries.
- **Domain:** pryvis.com, registered on GoDaddy, intended for this product.

**Product scope is open.** The description above reflects what the owner has said so far, but the original application likely does more than that description captures. The full product definition depends on what the Phase 0 feature review (section 5) finds in the existing application and the live website. Once that is known, the owner is open to any of these directions, and expects a recommendation:
- Keep it as one product, with the scope this brief describes.
- Split it into a separate product with different features to serve a distinct part of the market.
- Integrate all of the original application's services into this one product.

This decision also determines the **tier structure** (section 9): tiers may need to reflect not just usage limits but which bundle of services a tenant gets. Claude should not finalise the PRD, domain model, or tier design until this is resolved with the owner.
- **Owner requirements at a glance:**
  1. Strict data isolation between tenants and their clients.
  2. Send quotations, invoices, and similar documents from inside the app by email and WhatsApp, where possible.
  3. Mobile app works offline.
  4. Security protects both the tenants' data and their clients' data.
  5. Manual payments are approved by a different person from whoever activates the tenant account, where staffing allows, with a receipt-upload form rather than email.
  6. The application is maintainable using Claude API on a pay-as-you-go basis to reduce human cost of code and application management.
  7. Customer service is built into the model (email, messages, or bots), and customer feedback also feeds maintenance.
  8. The original application and the new application live in two separate folders under the base project folder, and the folder/repository structure is designed upfront rather than left to grow ad hoc.
  9. Development starts on free-tier database and server infrastructure, designed so migrating to paid, production-grade infrastructure is straightforward once commercial operations and growth begin.
  10. Tenants can customize the documents they send to their clients: their own logo, header data, a proper numbering scheme, and ideally a basic colour scheme.

## 3. Working agreement (how Claude should work on this project)

1. **Design before code — a gate, not a preference.** Nothing is implemented until a design for it exists and the owner has approved it. The design says what problem is being solved, for whom, what it must achieve, the shape, the trade-offs, what is deliberately excluded, and how it will be proved. It is proportionate: a page or two for a feature, a paragraph for a small change. Designs live in `docs/design/`.

   **An ADR is not a design.** An ADR justifies one decision; a design says what is being built. A threat model and a domain model are what show the decisions add up.

   The failure mode has a name — **vibe coding**: building because the next step looks obvious, and finding out afterwards what got decided by accident. This project exists not to be that. It has already happened twice (Foundations built ahead of Phase 1's artefacts; the marketing site started with no design, and parked because of it), and both are recorded in `docs/BRIEF-STATUS.md` rather than smoothed over.

   **Enforcement:** every task names the step of this brief it belongs to and the approved design it implements, *before* it starts. If there is no design, the task is to write one. Where building ahead of the design is genuinely right, it is said to the owner at the time and recorded — never discovered later.
2. **Audit before rebuild.** The existing codebase and live website are analysed before any new code is written.
3. **Small, reviewable changes.** Work in small increments, each with a clear scope, suitable for a single pull request.
4. **Tests first (or alongside).** Propose tests before or with each change. No feature is done without tests.
5. **Explain decisions.** When choosing between options, state the options, the trade-offs, and the recommendation. Record significant decisions as ADRs.
6. **Flag, don't assume.** If a requirement is ambiguous or an assumption is needed, list it explicitly rather than guessing silently.
7. **The owner reviews every diff.** Nothing is merged on the strength of "it seems to work".

## 4. Repository and folder structure

**Owner requirement:** The original application and the new application are to live in two separate folders under the base project folder. Since this project is not vibe coding, the folder structure should be designed upfront, not left to emerge.

**Context:** the base project folder is the existing folder that already holds the original application's code and is synced with GitHub. Claude in Cowork is already connected to this same folder. So the two new subfolders are created **inside this existing repository**, not in some new location — this is a reorganisation of the current repo, not a move to a different one.

**Recommendation**

- **Reorganising the existing repo:**
  - Move the current application's files into `original-app/` using tracked moves (e.g. `git mv`), in a single dedicated commit, so GitHub retains file history rather than showing the code as deleted and re-added.
  - Create empty `new-app/` and `docs/` folders alongside it.
  - Push this reorganisation as its own commit/PR before any other work starts, so it's a clean checkpoint the owner can review and roll back to if needed.
  - Confirm with the owner whether this happens on a new branch first or directly, and whether any existing deploy pipeline, GitHub Action, or hosting configuration references the old file paths and needs updating to match.
- **Base layout**, at the top level of the (same) repository:
  - `original-app/` — the existing application, exactly as it is today, read-only once the audit in section 5 starts. It stays in place until the new version fully replaces it in production, so it remains available for reference, comparison, and data migration. **Once the new application is complete and has fully replaced it, `original-app/` is deleted** — see the retirement step below.
  - `new-app/` — the rebuild described in this brief. Nothing from `original-app/` is copied into it directly; anything reused is deliberately ported over, reviewed, and adapted to the new schema and conventions.
  - `docs/` — the PRD, ADRs, the domain model, the audit and feature inventory from Phase 0, and this brief itself, kept as living documents (not buried inside either app folder).
- **Inside `new-app/`**, structured around the modular monolith in section 7, for example:
  - `api/` — the backend, itself organised by module (`tenants/`, `quotes/`, `catalog/`, `billing/`, `messaging/`, `payments/`, `support/`), each with its own routes, business logic, and tests, plus a shared `core/` for cross-cutting concerns (auth, tenancy context, audit logging).
  - `web/` — the web client.
  - `mobile/` — the mobile client, including its local database and sync logic (section 13).
  - `db/` — versioned migrations and the schema definition, as the single source of truth for the database structure.
  - `infra/` — infrastructure as code, CI/CD configuration, and environment definitions (dev, staging, production).
  - A project context file at the root of `new-app/` (module map, conventions, common commands) for Claude to read before making changes, as described in section 16.
- This exact layout is a starting point. Claude should propose the final structure as part of Phase 1 (section 6), matching it to the chosen mobile framework and hosting setup, and record it as an ADR.
- `original-app/` is excluded from the Claude API automation in section 16: automated changes only ever target `new-app/`.
- **Retiring `original-app/`:** once `new-app/` is live in production, fully covers what's being kept from the feature inventory (section 5), and has run for an owner-agreed confidence period with data migration verified, `original-app/` is deleted from the repository as its own commit — not folded into an unrelated change, so it stays a clean, reversible-in-history checkpoint. Delete only after the owner explicitly confirms readiness; Claude does not delete it unprompted.

**As built (2026-09-23, ADR 0010).** `original-app/` and `new-app/` are each their own npm-workspace root, with their own `package.json`, lockfile and `turbo.json`, so a dependency upgrade in one cannot destabilise the other. `render.yaml` carries `rootDir: original-app` and CI runs each workspace as its own job. **Vercel's Root Directory is a dashboard setting and cannot be versioned**; it must be changed by hand in the same window as any move, and the web deploy fails until it is. Any future folder move inherits that constraint.

## 5. Phase 0: Audit the existing version (no code changes)

Read the existing files in `original-app/` and produce a **written audit only**. Do not modify anything in `original-app/`.

**Schema review**
- Current tables, relationships, and constraints.
- Whether tenant isolation exists (a `tenant_id` or equivalent on every table).
- How money, tax, and currency are stored (floats vs integer minor units; currency codes).
- Whether quotes are **frozen snapshots** or live references to products and prices.
- Indexing, normalisation problems, and storage inefficiencies.

**Architecture review**
- How web and mobile clients communicate with the backend.
- Where business logic lives (client, server, database).
- What is tightly coupled and what would block change.
- Authentication, authorisation, and role handling.

**Requirement-gap review**
- Whether any tenant data or tenant-client data could currently be visible across tenants.
- What, if anything, exists today for email or WhatsApp sending, offline mobile use, manual payment handling, and customer support.

**Risk list**
- Performance bottlenecks.
- Security gaps.
- Anything that would block multi-country support or tiered plans.

**Migration notes**
- What data and logic are worth keeping.
- What should be rebuilt.
- A proposed approach for migrating existing data rather than discarding it.

**Product and feature review**

> **Revised 2026-09-24: there is no marketing website.** `/` redirects to `/dashboard`, so the deployment is the application behind a login and there is no owner-written public copy to extract. Derive the product's purpose, features and workflows from the code and from the only public surfaces that exist (the login page and the public quote/invoice pages), and mark positioning and pricing as **unverified** until the owner confirms them. Producing that public copy — what the product is, who it is for, what it promises — is itself a deliverable, owed before launch, and §17a now covers it. A product with no public description cannot be signed up for: this is a launch dependency, not a documentation gap.
- Use the **current live website** as the source of truth for what the product does today. Extract from it:
  - The **purpose** and positioning of the product and who it is for.
  - The **current features**, described as the user experiences them.
  - The **benefits** the site promises to clients and their customers.
  - Any **pricing, plan, or tier** information shown publicly.
  - The user-facing **workflows** visible on the site (sign-up, creating a quote, sending it, and so on).
- Cross-check this against what the code actually implements, and flag any gaps: features advertised but not built, or built but not described.
- Produce a **feature inventory**, with each item marked as *keep*, *change*, or *drop* for the new version, for the owner to confirm.
- Using the feature inventory, produce a **product-scope recommendation**: whether the findings support one product as currently scoped, a second product with a different feature set, or integrating everything into this one product — with reasoning, and how each option would affect the tier structure (section 9). This is a recommendation for the owner to decide on, not a decision Claude makes unilaterally.

**Deliverable:** one audit document, including the feature inventory and the product-scope recommendation. The owner reviews and decides on product scope before Phase 1 begins.

> **Product scope — decided 2026-09-24.** One product: quoting, invoicing, payment and job profit for contractors, with the **trade-specific parts built as data from the first commit** so a second trade is configuration rather than a new product (ADR 0017). The tier structure in §9 is unchanged. Product code must never branch on a trade, exactly as it must never branch on a country; construction is the first trade, not the only one, and no entity, table or type is named for it.

### 5a. What to add, and what to take out

The feature inventory is also read for **portfolio** questions, separately from the scope question above: which adjacent features or related businesses the existing data makes possible, and which bundled features would be worth more as a separate solution. Answers are recorded in `docs/PRODUCT-OPPORTUNITIES.md` and reviewed again at the end of each delivery step in §18, because the answers change as the data grows. Recommendations are the owner's to decide.

**The finding that carries a deadline.** Every tenant enters supplier prices, so the product accumulates a live price index for Jamaican construction materials — the most defensible asset in the business, and one no competitor can copy without the same history. Using it, even in aggregate, requires the tenant's consent **in the terms they accept at sign-up**, plus a statistical guarantee that no tenant can infer a named competitor's buying price. That consent cannot be retro-fitted, so **the terms of service must settle it before the first tenant signs up** — a dependency of registration, not of the website.

**Confirmed for removal:** the admin-curated regulatory feed, which shares no data and no workflow with quoting and carries a content cost with no revenue. If it lives, it lives as a media product with an editor, not inside a quoting tool.

**Kept deliberately, with a line drawn:** project costing and job profit stay, because they close the loop that makes quoting trustworthy — but **shallow**. When they grow a chart of accounts they have become a different product and the decision is revisited.

**Brief revision:** *(done — the edits were proposed on 2026-09-24 in `docs/BRIEF-EDITS-PROPOSED.md` and approved by the owner; this document is the revised version. The step was late, which is why Rule 19 and `BRIEF-STATUS.md` now exist.)* Once the audit is complete and the owner has decided on product scope, Claude proposes specific edits to this brief (section 1) reflecting what was actually found — updated assumptions, corrected scope, anything this document got wrong or left out. The owner reviews these edits before Phase 1 design work starts.

## 6. Phase 1: Requirements and design

- Write a short **PRD** covering users, core workflows, and scope for the first country and first release. Base it on the purpose, features, and benefits extracted from the live website in Phase 0, the owner's keep/change/drop decisions, and the **owner's decision on product scope** (single product, second product, or full integration).
- Map the **domain model**. Core entities at minimum: tenant (client business), user and role, customer (the tenant's client), product/catalog item, quote, quote line item, invoice, tax, currency, quote status/approval workflow, tenant document settings (branding, numbering), outbound message, payment record (including manual payments), plan and entitlement, and support ticket/feedback.
- Draft a **threat model** covering cross-tenant data exposure, exposure of tenants' client data, manual payment fraud, and abuse of file uploads and outbound messaging.
- Draft **ADRs** (Architecture Decision Records), one per major decision, each short and dated.
- Produce the **target database schema** from the audit findings and the domain model, for owner approval.

## 7. Target architecture (Recommendation)

**Overall shape**
- **Modular monolith**, not microservices. Keep clear internal modules (for example quotes, catalog, billing, tenants, messaging, payments, support) so any can be extracted later if needed.
- **API-first backend** defined in **OpenAPI**, serving both web and mobile clients.

**Data**
- **PostgreSQL** with a shared schema.
- A `tenant_id` on every tenant-owned table, with **row-level security** enforcing isolation (see section 11).
- Versioned database migrations only. No manual schema changes.
- **Client-generated UUIDs** as primary keys, plus `updated_at` and version fields, so offline sync (section 13) works from the start. This affects the schema, so it must be decided in Phase 1, not retrofitted.

**Mobile**
- Decide between a PWA, React Native, or Flutter, and record it as an ADR. Because offline operation is an owner requirement, the choice must be evaluated on its offline and local-storage capabilities.

**Hosting and infrastructure staging (Owner requirement)**

The owner wants to start on free-tier database and server infrastructure during early development, with a clear path to migrate to paid, more suitable infrastructure once commercial operations and growth begin. This is a cost decision, not an architecture one — the application must be built so the free tier is a starting point, not a constraint baked into the design.

- **Stay on standard, portable technology.** PostgreSQL, standard containers, and standard language runtimes are offered by nearly every provider at both free and paid tiers, so choosing them keeps the migration path open. Avoid a provider's proprietary database extensions or non-portable managed services unless there is no portable alternative.
- **Configuration, not code, controls where things run.** Connection strings, storage buckets, provider credentials, and resource limits live in environment configuration (per section 4's `infra/` folder), never hard-coded, so moving to a new provider or a paid tier is a configuration change, not a rewrite.
- **Design within free-tier limits from the start**, so nothing has to be re-architected later: expect low connection limits (use connection pooling), storage and bandwidth caps (keep files out of the database, use external object storage from day one even on a free tier), and the likelihood of cold starts or sleeping instances on some free hosts (design the app to tolerate this rather than assume always-on).
- **Migrations stay provider-agnostic.** The versioned database migrations from this section are the only way schema changes happen, so the same migration history applies whether the database is a free-tier instance or a paid production one.
- **Back up from day one**, even on the free tier, so early data survives the eventual migration; export/import scripts written early do double duty as the actual migration path later.
- **Record the free-tier setup and the intended upgrade path as an ADR**, including what specifically would trigger the move (a concrete threshold such as users, quote volume, storage, or uptime needs) and what the paid equivalent is expected to be, so the migration is planned rather than reactive.
- This applies to every infrastructure piece with a free tier: the database, application hosting, file/object storage, the transactional email provider (section 12), and CI/CD. Claude should confirm current free-tier limits and pricing for whichever providers are chosen at build time, since these change.

## 8. Designing for multi-country from day one (Recommendation)

Build only the first country, but make sure nothing prevents adding the next.

- **Money:** integer minor units plus a currency code. Never floating point.
- **Tax rules, number and date formats, and legal quote wording:** stored as **data/configuration per jurisdiction**, not hard-coded.
- **Time:** UTC timestamps everywhere; convert for display only.
- **Localisation:** i18n from the first screen (language, locale, formatting).
- **Payments:** abstract payment providers behind an interface, including manual payment methods (section 14).
- **Messaging:** channel availability and rules can differ by country (section 12).
- **Data protection:** review applicable regimes early (for example PIPEDA, Jamaica's Data Protection Act, GDPR), because they can affect where data is hosted and how it is handled. Confirm with a qualified legal adviser.

## 9. Tiers of service (Recommendation)

Tier design depends on the **product scope decision** (section 2): a single product's tiers are mostly usage limits, while a multi-product or fully-integrated scope means tiers also bundle which services a tenant has access to. Finalise tier definitions only after that decision is made.

- Model **plans and entitlements/limits in the database**.
- Check every gated feature through **one entitlement service**.
- Keep entitlements **separate from the billing provider** (for example Stripe), so pricing and plan changes do not require code changes.
- Entitlements should be able to cover usage-driven costs, such as WhatsApp or email message quotas and storage.
- Tier activation from a manual payment goes through the approval controls in section 14.

## 10. Quote data integrity and tenant document branding

**Data integrity (Recommendation)**
- Quotes are **immutable snapshots**: freeze prices, tax rates, currency, and wording at the moment of issue.
- Support **versioned revisions** rather than editing issued quotes.
- Keep an **audit log** of significant actions.
- Use **soft deletes** where history matters.

**Tenant document branding (Owner requirement):** tenants must be able to customize the quotes, invoices, and other documents they send to their own clients — their logo, header data (business name, address, contact details), a proper numbering scheme, and ideally a basic colour scheme.

**Recommendation**
- Store this as a **per-tenant document settings record**: logo (uploaded, stored per tenant, section 11), header/company details, colour scheme (a small fixed set of fields, e.g. primary and accent colour, not free-form CSS), and numbering configuration.
- **Numbering scheme:** let each tenant define a prefix, a starting number, and a reset rule (never, yearly, monthly), and generate the next number **atomically per tenant** so two quotes issued at the same moment never collide or skip. The assigned number is fixed as part of the immutable snapshot above and never changes on revision.
- The document template is a **shared layout** that reads these settings; tenants configure data and pick from a small set of presets, not arbitrary custom layouts — this keeps PDFs consistent, testable, and fast to generate, while still feeling tenant-branded. A bigger step (uploading a fully custom template) can be a later, higher-tier feature, and is not required for launch.
- These settings belong in the domain model and target schema from Phase 1, and the offline sync design (section 13) needs to account for the logo and settings being available for offline PDF generation.
- Since this affects what the document actually looks like, cross-check it against the feature inventory and live website in Phase 0: if the original application already supports branding, numbering, or colour customization, that behaviour is part of what gets audited and carried forward or improved, not just newly invented.

## 11. Data isolation and security
> **Revised 2026-09-24**, per the owner-approved edits in `docs/BRIEF-EDITS-PROPOSED.md`.

**Added 2026-09-24, from what the audit and the threat model found rather than from theory:**

- **Row-level security is not optional, and `FORCE` is part of it.** Postgres exempts a table's owner from its own policies, and the application's migration role owns the tables — so `ENABLE` alone leaves isolation switched on and doing nothing for exactly the connection that matters.
- **Every table is tenant-protected or exempt with a written reason.** There are exactly two exemptions, both authentication bootstrap (a session and a credential must be readable before a tenant is known), plus non-tenant infrastructure. A guard refuses a third that arrives quietly.
- **Staff and administrators meet a higher bar than tenants** (Rule 5.1): MFA mandatory, a longer password minimum, named individual accounts, re-authentication before impersonation or a price change, least privilege by named capability, and same-day offboarding. **Staff MFA is a launch blocker.**
- **Rate limiting is part of authentication, not an operational afterthought.** A deliberately expensive password hash on an unauthenticated endpoint is a denial-of-service lever; the hash and its limiter ship together.
- **Self-service registration is a security surface.** It is unauthenticated and creates rows, so it ships with rate limits, email verification before anything costs us money, and a duplicate registration that does not confirm the address is taken.
- **A threat model is maintained** (`docs/THREAT-MODEL.md`), with every control marked built, partial or owed, and the evidence that proves it.


**Owner requirement:** Tenant profiles and data must be independent of each other. No information from one tenant's account, or from their clients, may be visible in another tenant's account. Security must protect the tenants' clients' data, and it must protect our tenants' data.

**Isolation**
- Enforce isolation at more than one layer: `tenant_id` on every tenant-owned table, row-level security in the database, and tenant scoping in the application layer.
- Set the tenant context per request and per transaction. Background jobs must carry tenant context explicitly.
- Scope everything else by tenant too: file storage paths and signed URLs (short expiry), cache keys, search indexes, exports, generated PDFs, outbound messages, analytics, and logs.
- Write **automated cross-tenant leak tests** that run in CI: tenant A must not be able to read or write tenant B's data through the API, search, exports, files, or jobs.
- Access by our own staff to tenant data is role-restricted, time-limited where practical, and logged.

**Protecting tenants' clients' data**
- Collect only what is needed (data minimisation).
- Encrypt in transit and at rest, and consider field-level encryption for especially sensitive fields.
- Define retention, deletion, and export rules, so a tenant can export or remove their data.
- Tenants will normally decide why client data is collected and we process it on their behalf. Have terms, a privacy policy, and a data processing agreement reviewed by a qualified legal adviser.

**Application security**
- Follow OWASP guidance. Least-privilege access. Rate limiting and input validation.
- Multi-factor authentication available to tenants and mandatory for our staff.
- Secrets management, dependency scanning, encrypted backups with tested restores.
- No personal data or secrets in logs.
- A documented incident and breach response plan.
- Mobile: encrypted local storage, session revocation, and remote sign-out (see section 13).

## 12. Communications: email and WhatsApp

**Owner requirement:** Where possible, tenants can send clients quotations, invoices, and similar documents from inside the app by email and WhatsApp.

**Recommendation**
- Build one **outbound messaging service** with pluggable channels (email and WhatsApp first, others later). The rest of the app never calls a channel directly.
- **Email:** use a transactional email provider. Support per-tenant sender name and reply-to, domain authentication (SPF, DKIM, DMARC), and bounce and complaint handling.
- **WhatsApp:** use the official WhatsApp Business Platform, directly or through an approved provider. Business-initiated messages generally require pre-approved templates and recipient consent. Claude must check current rules, pricing, and availability by country at build time, not assume them. A simpler fallback is a share link that opens the user's own WhatsApp with the message and document link prefilled, which may suit lower tiers.
- The document sent is always the **issued snapshot** (section 10), delivered as a PDF or a secure, expiring, tenant-scoped link.
- Record delivery status (queued, sent, delivered, failed, viewed where available) against the quote or invoice. Include retries and idempotency, so nothing is sent twice.
- Respect consent and opt-out, and per-country messaging rules.
- Model message costs in the tier entitlements (section 9).
- Messages requested while offline are queued and sent when connectivity returns (section 13).

## 13. Mobile offline operation

**Owner requirement:** The mobile app must allow offline operations.

**Recommendation**
- A local database on the device and a **sync engine** with an outbox queue of pending changes.
- Idempotent operations using client-generated UUIDs, so retries never create duplicates.
- Explicit **conflict-resolution rules per entity**, for example issued quotes are immutable, drafts merge by last change with a review step, and catalog data is server-wins.
- Decide and record as ADRs:
  - Which data is cached for offline use (catalog, customers, tax configuration, drafts) and for how long.
  - Which actions work offline (creating and editing drafts at minimum), and whether issuing a quote offline is allowed.
  - How official quote numbers are assigned without duplicates (for example number blocks per device, or numbering assigned at sync).
  - How prices are frozen when issuing offline, based on the last-synced catalog with its timestamp.
  - How tier entitlements are checked offline (for example a grace period).
- Encrypt local data, support remote sign-out, and limit how long offline data is retained.
- Show sync status clearly in the UI. Handle clock differences between device and server.
- Test under poor and interrupted network conditions.
- Web is online-only unless the owner decides otherwise.

## 14. Payments and account activation controls

**Owner requirement:** Where possible, and where we have staff, manual payments must be approved by a different person from the one who activates the tenant's account. In Jamaica, customers sometimes pay by depositing money into our bank account and sending a copy of the deposit receipt by email. Unless we can build in a form where the receipt is uploaded, that email process remains.

**Recommendation**
- Separate the roles: **payment submitter/recorder**, **payment approver**, and **account activator**. The system enforces that the approver is not the activator (and, where staff allow, not the submitter).
- Account activation or tier upgrades from a manual payment can only proceed from an **approved payment record**. No override without a second person.
- Manual payment workflow:
  1. The customer uploads the deposit receipt through an in-app form, with amount, date, bank, and reference.
  2. Status is *submitted*.
  3. Staff verifies against the **actual bank statement or deposit**, not the receipt alone, since receipts can be forged.
  4. Payment is *approved* or *rejected* with a reason.
  5. Only then is the tenant's plan activated.
  Every step is written to the audit log.
- Upload security: restrict file types and sizes, scan for malware, store privately and scoped to the tenant, detect duplicate receipts (file hash and reference), and apply a retention policy.
- Email fallback: where customers still email receipts, staff attach them to a payment record. Automated inbound-email handling can come later.
- **Small-team reality:** if only one person is available, the system records a *single-operator exception* with compensating controls: an alert to the owner, a required later second review, and regular reconciliation of approved manual payments against bank statements. The strictness should be configurable so it can tighten as staff are added.
- Automated payments through a card or payment provider can be added later behind the payment abstraction (section 8).

## 15. Customer service and feedback loop

**Owner requirement:** Customer service is built into the model, through emails, messages, or bots. If the best option is unclear, we discuss it. Customer feedback should also help with maintenance.

**Recommendation**
- Before building anything, Claude presents the options with pros, cons, cost, and a recommendation, and records the decision as an ADR. Options to evaluate:
  - A shared support email inbox.
  - In-app help and messaging.
  - A WhatsApp support line.
  - An AI support assistant that answers from the help documentation and escalates to a human.
  - Buying an off-the-shelf helpdesk versus a lightweight in-app build.
- Rules for any bot:
  - It is tenant-scoped and never exposes another tenant's data.
  - It always offers a way to reach a human.
  - It does not approve payments or change account status on its own.
  - Its logs are redacted.
- **Feedback-to-maintenance loop:**
  - Tag every ticket or piece of feedback (bug, feature request, question, billing) and link it to app version and plan tier.
  - Provide an in-app "report a problem" option that attaches non-sensitive diagnostic context, with the user's consent.
  - Triage feedback into the backlog on a regular cadence.
  - Recurring questions drive documentation and UX fixes.
  - Link error tracking to tickets.
- Track response time, resolution time, and the most common issues.

## 16. Maintainability with Claude API (pay-as-you-go)

**Owner requirement:** The application should be maintainable using Claude API on a pay-as-you-go basis, to reduce human cost of code and application management.

**Recommendation**
- **Design for AI-assisted maintenance:**
  - A modular monolith with small, focused modules and consistent conventions.
  - Strong automated tests, which are the main safety net.
  - Up-to-date ADRs and architecture notes.
  - A project context file in the repository (module map, conventions, commands) for Claude to read.
  - Runbooks for common operations.
  - Structured logs and error tracking that are readable by both people and Claude.
- **Automation pattern:** Claude proposes changes as **pull requests**. CI and a human approve. Nothing goes straight to production.
  - Least-privilege tokens.
  - No write access to production data.
  - Feature flags, staged rollouts, and rollback.
  - Dependency and security updates arrive as automated pull requests.
- **Data protection:** never send tenant or client personal data, or secrets, to the API. Use redacted or synthetic data.
- **Cost control:** set API budgets, usage alerts, and caps. Use a lighter model for routine triage and a more capable one for design and refactoring. Check current models, pricing, and cost-saving features in Anthropic's documentation at build time.
- A named human stays accountable for reviewing and approving changes. AI does the work under this process, which is what separates it from vibe coding.

## 17. Engineering practices

- Version control with small pull requests and code review.
- **CI/CD**, with separate dev, staging, and production environments.
- **Infrastructure as code.**
- **Testing:** unit, integration, and end-to-end tests, plus **contract tests** on the API and the cross-tenant leak tests from section 11.
- **Observability:** structured logging and error tracking.
- **Backups** with **tested restores**.
- **Security baseline:** as in section 11.

## 17a. The public website

*Added 2026-09-24. The brief did not contemplate building one; there is none, the owner owns pryvis.com, and a self-service product with no public description cannot be signed up for.*

pryvis.com is the product's front door and a **launch dependency**, not marketing polish. It is built as pages in our own application, content in data files, on free hosting we can leave — never a site builder that holds our words in its own format (ADR 0018, Rule 20).

**Deliverables:**

- a written **design** of what each page must achieve and for whom, approved before any page is built;
- the pages themselves, mobile-first and readable outdoors, with no third-party scripts;
- **Terms of Service and a Privacy Policy approved by the owner** — registration legally depends on them, and the terms must settle the aggregate-data question in §5a;
- guards proving no third-party tracker, no unevidenced social-proof claim, and no price displayed before a price is decided.

**Nothing is claimed that is not true:** no testimonials we did not receive, no customer counts we cannot evidence, no logos we have no right to, and no placeholder price.

## 18. Delivery order

Each step is approved before the next begins.

1. **Foundations:** authentication, tenancy with cross-tenant leak tests, schema (including client-generated IDs and versioning for future sync), audit log, CI.

   > **Status at 2026-09-24.** Built: tenancy (`tenant_id` + forced row-level security + request-scoped context, with leak tests against a real Postgres), authentication (default-deny routes, identity re-resolved per request, revocable sessions, sign-in, rate limiting), and CI gating both workspaces. **Still owed within step 1:** the audit log, staff MFA, and client-generated ids with row versioning. Step 1 is not complete until those land, and **no `new-app` module is complete until it has had the independent review Rule 9 requires** — commissioned once and failed, still owed.
2. **First end-to-end vertical slice:** land on the website, sign up, create a quote, send it by email, customer accepts.

   > **The website (§17a) sits inside this step**, not before it. The journey is what matters: a front door to nothing is not a milestone. Building the site earlier is allowed; shipping it in isolation, asking people to sign up for something that cannot accept them, is not.
3. **Then:** catalog, tax, PDF output, tiers and entitlements, and billing with the manual payment approval workflow.
4. **Then:** offline sync on mobile, WhatsApp sending, and the customer service channel chosen in section 15.
5. **Then:** the second country. This is the real test of whether the seams are in the right places.
6. **Finally:** once the owner confirms `new-app/` is stable and fully replaces it, retire `original-app/` as described in section 4.

## 19. Open questions for the owner

Claude should surface these early and record the answers as ADRs or PRD entries.

**Answered as at 2026-09-24:** product scope (one product, built to verticalise later — ADR 0017); the current stack and its storage problems (audit §1–2); first and second country (Jamaica, then Trinidad & Tobago); tier definitions (`docs/TIERS.md` — numeric limits and prices still open); WhatsApp approach (click-to-chat now, Business API on the Business tier); payment provider (WiPay); data to migrate (none — there are no live tenants).

**Answered 2026-09-25 by `docs/PRD.md` (Proposed) and ADR 0022:** offline scope — the catalog, rates, recipes, clients and tax settings are cached and a job can be **priced and drafted with no signal**, while **issuing requires connectivity in release 1** and offline issuing with device number leases moves to release 2. Read precisely, the promise on the site is a *number* now, not a PDF now, so this keeps the claim honest while taking the old application's highest-risk component out of the critical path to revenue. Also answered: one person may hold several businesses with a different email each, and a tenant's clients get no login for now.

**Still open, each now blocking something specific:** the mobile framework (Expo is assumed because it exists, never decided — the PRD's release 1 is deliberately achievable as either a PWA or React Native so this is not blocked on it); the support model, buy or build; payment-approval staffing at launch, which sets how strict Rule 13 can be on day one; hosting region and data residency, which matters because tenant and customer data currently leaves Jamaica; the free-tier-to-paid trigger, which Rule 10 requires as an ADR; and the Claude API budget cap.


- **Product scope:** after Phase 0's feature review, is this one product, a second product with different features, or full integration into one product? (This gates the PRD and tier design.)
- What is the current stack, and what specific storage problems are observed? (The audit should answer this from the code.)
- Which country launches first, and which is likely second?
- What are the tier definitions and limits (users, quotes per month, messages, features)?
- Which mobile approach: PWA, React Native, or Flutter?
- Offline scope: which actions must work offline, and may quotes be issued offline?
- WhatsApp approach: official API integration, share link, or both?
- Support model: which channels, and buy or build?
- Payment approval staffing: how many staff can fill the submitter, approver, and activator roles at launch?
- Which payment and billing provider(s) are planned?
- What hosting region and data-residency constraints apply?
- Which free-tier providers for database, hosting, and storage are preferred or already in mind, and what threshold should trigger the move to paid infrastructure?
- How much existing data must be migrated?
- What monthly budget cap should apply to Claude API usage for maintenance?

## 20. Immediate next step

1. Reorganise the existing GitHub-synced repository into the structure from section 4: move the current code into `original-app/` with tracked moves, create empty `new-app/` and `docs/` folders, and push this as its own reviewable commit or PR.
2. Complete **Phase 0**: read the files in `original-app/`, review the current live website (pryvis.com) for its purpose, features, and benefits, and produce the written audit, feature inventory, and product-scope recommendation described in section 5, saved into `docs/`.

3. Propose revisions to this brief based on what Phase 0 found, and get the owner's sign-off on both the audit and the revised brief before Phase 1 begins.

Make no code changes in this step. Stop and wait for the owner to review the audit, the brief revisions, and decide on product scope before Phase 1 begins.
