# ADR 0030 — The direction of the six outstanding planning designs

- **Status:** Accepted
- **Date:** 2026-10-02
- **Decided by:** the owner, accepting the recommendations given on 2026-10-02 for the six planning items left
  before building, with one note on tax (decision 1).
- **Nature:** a direction, not a design. Each item below becomes a design in `docs/design/`, approved by the
  owner before anything is built (brief §3, Rule 1.1). Figures marked *verify* are checked at build time.
- **Delegation (Rule 16.5):** Opus — product, money and security direction.

## Decisions

1. **GCT and tax.** GCT is computed **per invoice** — deposit, progress and final — on the net amount at the
   rate in force, apportioned across standard, zero-rated and exempt lines; the final invoice absorbs
   rounding; the ceiling is net (ADR 0027 D7). The tenant records its GCT registration and TRN; an
   unregistered tenant charges none and its documents say so; a tax invoice shows the TRN and the GCT
   separately; a credit note reverses tax proportionally; refund and client-credit records resolve an
   over-payment. Rates are **data with effective dates**, per country (the rule pack, ADR 0005).
   **Owner's note: tenants may enter their own GCT or tax rates for their country.** The platform provides
   each country's default rates; a tenant may set or add rates for their own documents; every issued document
   freezes the rate it used. The design states how a rate that differs from the country's default is shown
   to the tenant, so a typing mistake cannot silently mis-tax a client. Checked against Tax Administration
   Jamaica's public guidance now; an accountant before launch.
   **Owner's requirement, 2026-10-02: the tax's name is per country, too.** Jamaica's is "GCT"; other
   jurisdictions call theirs something else (Trinidad and Tobago's is VAT). The tax's name — and its short
   label, the registration number's name (TRN in Jamaica) and the wording a tax invoice must carry — is
   **data in each country's rule pack**, never a word in code, screens or document templates. The design adds
   a guard that fails if "GCT" appears in product code or copy outside Jamaica's rule-pack data.
2. **API layer.** REST with an OpenAPI contract generated from the code and a contract test in CI; web
   sessions in a secure, HttpOnly cookie with a CSRF token (the mobile app later sends the same session
   secret in a header); one error format (RFC 9457 problem details) that leaks nothing internal; an
   idempotency key on every request that creates money or a document; validation at one boundary that
   rejects unknown fields; and the start-up wiring — the global default-deny guard, the least-privilege check,
   health endpoints.
3. **Support model.** At launch: a shared support inbox and an in-app "contact support" form that creates a
   tenant-scoped, audited ticket, plus a searchable help centre. **The chatbot, phase 2, under Rule 15:**
   help articles written at development time from synthetic or redacted questions, answered at runtime by
   search — no model sees what a person types. A live model chatbot only later, as a deliberate Rule 15
   amendment signed by the owner, reviewed by the attorney and recorded as a processor. Any bot always offers
   a human, never approves payments or changes accounts, and keeps no unredacted logs (brief §15).
4. **Feedback loop.** An in-app "report a problem" form that attaches, with consent, the app version, tier and
   page — never personal data — tagged bug, feature, question or billing; error tracking linked to each report;
   a weekly triage that turns reports into **redacted** issues, so Claude-assisted maintenance stays within
   Rule 15; response time, resolution time and the commonest issues measured.
5. **Environments and operations.** Keep the current providers and make them proper: the web app and site on
   Vercel, the rebuilt API on Render (paid and always on at launch, ADR 0026) defined in a versioned blueprint,
   Neon Postgres with branches for development and staging — three environments. Hosting region US-East,
   nearest Jamaica (data residency to the attorney). Nightly backups to object storage with a monthly restore
   drill; error tracking; an uptime check; **Claude-assisted maintenance gated at start, merge and deploy by an
   administrator's recorded approval, through an interface built for it (owner, 2026-10-02; Rule 15)**;
   runbooks for deploy, rollback, restore, key rotation and staff
   offboarding; the existing dependency and secret scanning; a Claude spend cap with alerts; Claude's changes
   only as pull requests a human approves (brief §16).
6. **The register, completed.** Private file storage: Cloudflare R2. Malware scanning: ClamAV in our own
   container (files never leave us; no new processor), with Cloudmersive as the fallback if its memory cost is
   too high; never VirusTotal. Error tracking: Sentry, with personal-data scrubbing on. Uptime: a free-tier
   monitor (Better Stack or UptimeRobot). Support inbox: Google Workspace or Zoho Mail. The rebuilt API's host:
   Render, paid. App stores for the mobile launch. Each recorded with "why this one" (Rule 18), and a
   privacy-notice line wherever it holds personal data. WiPay is asked whether it offers a server-to-server
   transaction check (ADR 0029 E2), and whether it offers a partner sign-up a tenant can start from their
   Pryvis profile.
7. **WiPay, as the owner restated it (2026-10-02).** Each tenant connects **their own** WiPay merchant account in
   the Payments section of their Pryvis account profile, and their clients pay them directly. The WiPay account
   itself is opened with WiPay (its identity checks); if WiPay offers a partner sign-up, the profile starts it.
   **Pryvis's own WiPay account takes only tenants' payments to Pryvis.**

## Consequences

- Six designs are owed, in the order: GCT; API layer; support and feedback (one design); environments and
  operations; then the register's choices recorded as rows.
- The PRD's R1.9 carries the owner's note on tenant-entered rates.
