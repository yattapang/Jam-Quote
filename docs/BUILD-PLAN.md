# Build plan — from here to the end of the project

**Approved by the owner, 2026-10-02.** This is the **one place the build order lives** (Rule 21.10): the
brief's delivery order (§18) made concrete for the approved PRD. `docs/BRIEF-STATUS.md` says where the work
stands and points here; `docs/PLANNING-AUDIT.md` §7 holds each design's contents. A change to this order is the
owner's decision, recorded here with its date.

## The cycle every step follows

> **Design approved by the owner → built in small steps with tests, each control proved by a planted defect →
> the gate green → an independent review (Opus where money or security is involved) → a closing check
> (Sonnet) → the owner's sign-off.**

## The checklist — what "done" means for a step

A step is ticked only when **every** item below is true, and the tick carries its evidence on the line after
it, in this exact form:

```
- [x] B1 · …
  Done: 2026-11-03 · commit `abc1234` · review `docs/briefs/…` · closing `docs/briefs/…` · owner: approved 2026-11-04
```

1. **Design** — the design it implements is approved by the owner (or, for a planning step, the design itself is
   approved).
2. **Built and tested** — every requirement it covers has a test; every control is proved by a planted defect,
   restored from a backup copy and shown identical with `diff -q`.
3. **Gate green** — typecheck, the full test suite with real PostgreSQL required, the site build, and the
   checkers in `tools/`.
4. **Reviewed** — an independent review from a committed brief (Rule 16.7), its findings fixed.
5. **Closed** — a closing check from a committed brief confirms the fixes (Rule 24.6).
6. **Recorded** — `docs/BRIEF-STATUS.md`, the delegation log, and any document the step changed are updated in
   the same change (Rule 23.5); the threat model and the register where the step touches them.
7. **Signed off** — the owner approves the step as done.

A planning step (phase A) needs items 1, 4, 5, 6 and 7; "review" for a design is an independent read of it.
`tools/check_build_plan.py` refuses a ticked step whose evidence line is missing, whose commit does not exist,
or whose briefs are not files in the repository.

---

## Phase A — Finish planning (no code)

The designs of `docs/PLANNING-AUDIT.md` §7, each approved by the owner.

- [x] A1 · Tax (GCT in Jamaica) and documents, `docs/design/tax-and-documents.md` — per-country tax names, labels and rates; tax per invoice; TRN; credit notes, refunds and client credits; revision numbering ("Q-0042 rev 2", ADR 0031); the rule pack
  Done: 2026-10-02 · commit `136ee7c` · review `docs/briefs/2026-10-02-tax-design-read.md` · closing `docs/briefs/2026-10-02-tax-design-closing-check.md` · owner: approved 2026-10-02
- [x] A2 · API layer, `docs/design/api-layer.md` — OpenAPI and its contract test, cookie sessions and CSRF, errors, idempotency, validation, start-up wiring, tenant context in jobs and storage
  Done: 2026-10-02 · commit `97f0263` · review `docs/briefs/2026-10-02-api-layer-read.md` · closing `docs/briefs/2026-10-02-api-layer-closing-check.md` · owner: approved 2026-10-02
- [x] A3 · Support and feedback, `docs/design/support-and-feedback.md` and ADR 0032 — the options paper with costs (brief §15), the chatbot under Rule 15, the feedback loop (Rule 25)
  Done: 2026-10-02 · commit `fa933ff` · review `docs/briefs/2026-10-02-support-design-read.md` · closing `docs/briefs/2026-10-02-support-design-recheck.md` · owner: approved 2026-10-02
- [ ] A4 · Environments and operations — three environments, backups and restore drills, monitoring,
  runbooks, Rule 10's full trigger, **the three approval gates for Claude maintenance and their interface**
  (Rule 15)
- [ ] A5 · The third-party register completed — storage, malware scanning, error tracking, uptime, inbox
- [ ] A6 · Outbound messaging
- [ ] A7 · Document settings and the PDF — logo, header, colours, the shared layout
- [ ] A8 · Sign-up and verification
- [ ] A9 · The share page and the accept flow
- [ ] A10 · Payments, the payments abstraction, the tenant's WiPay connection in their profile, and the staff
  console — provider-neutral, with **Stripe as the candidate for subscriptions and WiPay the fallback** (ADR 0033), and the test-mode experiment
- [ ] A11 · Data rights (export, requests, the breach response) and the tenant's audit trail
- [ ] A12 · The nightly reconciliation job
- [ ] A13 · Each workflow's screens — written just before that workflow is built, so this item is ticked per
  workflow in phases C and D

**Owner actions** are scheduled in `docs/OWNER-ACTIONS.md` (owner's request, 2026-10-02): each is sent once, as part
of a complete batch, when its stage is reached — never ad hoc. **Batch 1** (the paid host, the two DNS records, the
Claude spend limit, the second staff member, how code is reviewed, the A5 service accounts, and the long-lead items:
WiPay's answers and merchant account, the accountant, the attorney) is sent when A3-A12 are signed off.

## Phase B — Platform foundation (after A2, A4, A5)

- [ ] B1 · Environments and infrastructure — development, staging and production; the rebuilt API's
  blueprint; region; secrets
- [ ] B2 · API start-up — the global default-deny guard, the least-privilege check, health, the OpenAPI
  contract test, cookie sessions, validation, idempotency
- [ ] B3 · Monitoring and resilience — error tracking without personal data, uptime, backups and **the first
  restore drill**, runbooks
- [ ] B4 · The maintenance approval interface — start, merge and deploy gates for Claude-assisted work,
  each approval recorded (Rule 15)
- [ ] B5 · File storage and malware scanning
- [ ] B6 · The shared core — money, entitlements, the rule pack (tax rates, names and wording as data per
  country)
- [ ] B7 · Staff MFA completed — **a launch blocker**

## Phase C — The first end-to-end slice (brief §18 step 2)

*Owner batch 2 (`docs/OWNER-ACTIONS.md`) is sent when phase B is signed off.*

*Website → sign up → verify email → price a quote → send it → the client accepts.*

- [ ] C1 · Email messaging, with delivery status and bounces
- [ ] C2 · Sign-up and verification — the email-equality guard; the consent clause in the terms
- [ ] C3 · Directory, recipes and pricing with tax (W1-W3), on the web
- [ ] C4 · Issuing (W4) — sealing online, numbering with revisions, the branded PDF, storage
- [ ] C5 · Share and accept (W5) — the page served by the API, codes, the channel-aware bar
- [ ] C6 · The slice reviewed end to end, and demonstrated to the owner

## Phase D — Getting paid: the Pro line (brief §18 step 3)

*Owner batch 3 is sent when phase C is signed off.*

- [ ] D1 · Recorded variations (W6a)
- [ ] D2 · Invoicing (W7) — deposit, progress and final; tax per invoice; credit notes; payments and
  over-payments; reminders and "do not remind"
- [ ] D3 · Bank-transfer details on invoices and the share page, with the protected change (R1.29a, ADR 0034); the WiPay connection moved to H7
- [ ] D4 · The reconciliation job
- [ ] D5 · Tiers and entitlements — the free meter, blocked seals, three Pro users
- [ ] D6 · Subscriptions (W9) — card upgrade through Pryvis's WiPay account, manual payments, lapse
- [ ] D7 · The staff console (W10) — capabilities, separated approvals, suspension, grants, the platform
  audit trail

## Phase E — Trust, support and compliance

- [ ] E1 · Support — inbox, in-app contact form, help centre
- [ ] E2 · The feedback loop — tags, error links, the weekly redacted triage
- [ ] E3 · Data export, data requests, the breach response, the tenant's audit-trail view
- [ ] E4 · Accessibility checks in CI, the timed walkthrough (R1.8), the measures (R1.42)
- [ ] E5 · Price-observation capture, with consent (R1.41)
- [ ] E6 · The site's final copy; terms and privacy approved after the attorney

## Phase F — The web launch

*Owner batch 4 is sent when phases D and E are signed off.*

- [ ] F1 · A full adversarial security pass; the threat model brought up to date
- [ ] F2 · The attorney's sign-off and the accountant's tax review
- [ ] F3 · Production on the paid host — a restore drill, staff accounts with MFA, runbooks rehearsed
- [ ] F4 · A soft launch on the owner's test accounts, then the **public web launch**; the measures start

## Phase G — The mobile app (after the web launch, ADR 0028)

- [ ] G1 · The mobile and sync design
- [ ] G2 · The React Native (Expo) app
- [ ] G3 · Offline sealing — the outbox, the device keystore, revocation, blocked seals
- [ ] G4 · App-store accounts, beta, release; the site's "coming with the mobile app" marker removed

## Phase H — Release 2

- [ ] H1 · Client-signed change orders
- [ ] H2 · Job result and costing
- [ ] H3 · Offline issuing with device number leases; offline creates and draft merge
- [ ] H4 · Retention tracking
- [ ] H5 · Signed-copy upload
- [ ] H6 · In-app support threads; the chatbot, phase 2 (search over help articles — no model sees what is typed)
- [ ] H7 · The tenant's WiPay connection in their profile, card payment links, our server's confirmation, and grade 6 evidence (R1.29, ADR 0034)

## Phase I — Release 3: the Business tier

- [ ] I1 · Roles and approvals
- [ ] I2 · Crews and crew cost rates; consolidated reporting
- [ ] I3 · WhatsApp Business sending
- [ ] I4 · API access
- [ ] I5 · Supplier price comparison and the price index

## Phase J — The second country, Trinidad and Tobago (brief §18 step 5)

- [ ] J1 · Its rule pack — VAT and its name, TTD, legal wording
- [ ] J2 · Its data-protection review
- [ ] J3 · Its payment provider checked

## Phase K — Retire `original-app/` (brief §18 step 6)

- [ ] K1 · Retired as its own commit — **only after the owner confirms** the new application fully replaces it
