# Owner actions — what only the owner can do, and when each batch is sent

**Set up 2026-10-02 at the owner's request:** "keep a log of all the actions required on my part and when we are at
the stage when they are needed, send me the complete requests and I will do them then. I want to do those things
methodically and not ad hoc one at a time."

This is the **one place** that schedules the owner's actions (Rule 21.10). Two other documents point here:

- `docs/PRD.md` §9 says **what** release 1 depends on, and why;
- `docs/BUILD-PLAN.md` says which build step each batch comes before.

## How it works

1. **Every action that falls to the owner is listed below**, numbered OA1 onward. Each has the build step that
   needs it and the batch it belongs to. A new one found during the work is added here first, to the next batch
   that is not yet sent — **never sent on its own**.
2. **A batch is sent once, complete, when its stage is reached** — at the point named in its heading, which is
   before the steps that need it. The batch is a committed file in a `docs/owner-batches/` folder, one per batch, and its contents
   are the full request for every action in it:
   - what to do, step by step;
   - any exact values to enter (DNS records, wording, settings);
   - what to send back, if anything;
   - why it is needed, and by which step.
3. **Long-lead items travel early.** An action with a lead time we do not control — an account that needs identity
   checks, a professional who needs time to answer — goes in the earliest batch whose answers it could change. Its
   heading says so, so it is never a surprise later.
4. **Ad hoc only if blocked.** If work would stop because an action cannot wait for its batch, the request says so
   plainly, with the reason it could not wait. That should be rare, and each one is recorded in the log at the
   foot of this file.
5. **When the owner reports an action done**, its status here changes, with the date, in the same change that
   records it in `docs/BRIEF-STATUS.md`.

Decisions are not actions. A design's approval, or a choice between options, continues in the conversation as it
always has. This file covers what the owner does **outside** the conversation: accounts, records at GoDaddy, calls
and emails to WiPay, the accountant and the attorney, and money spent.

---

## Batch 1 — before building starts (sent when phase A's planning designs, A3-A12, are signed off)

Everything phase B needs, plus the long-lead items. Their answers can change designs and builds well before launch,
so they start now.

| # | Action | Why, and the step that needs it | Status |
|---|---|---|---|
| OA1 | **Confirm the paid host for the rebuilt API** — the plan and its monthly cost for staging and production (a recommendation with prices comes with design A4) | Three environments (B1); always-on at launch (ADR 0026, PRD §9 item 7) | Open |
| OA2 | **Two DNS records at GoDaddy:** `api.pryvis.com` and `share.pryvis.com` (exact values in the batch) | The session cookie must be first-party (`docs/design/api-layer.md` AP1); the share page has its own host (AL10). Needed by B1-B2 | Open |
| OA3 | **Set a monthly spend limit** in the Claude developer console | Maintenance under Rule 15's approval gates (B4); the support chatbot later (PRD §9 item 10) | Open |
| OA4 | **Name the second staff member**, or confirm the single-operator fallback for now | Staff MFA and separated approvals (B7, a launch blocker; PRD §9 item 5, R1.34-R1.35) | Open |
| OA5 | **Confirm how you want to review code** — recommended: a pull request per build step, which you approve or ask about | The first code since planning (B1). The planning audit records that you do not yet review diffs (`docs/PLANNING-AUDIT.md` §3) | Open |
| OA6 | **Create the accounts for the services chosen in A5** — storage, malware scanning, error tracking, uptime — in the business's name, with payment details | Files and scanning (B5), monitoring (B3). Each service is recommended, with its cost, in design A5 | Open |
| OA7 | **Ask WiPay four questions** (exact wording in the batch): can small Jamaican businesses each open their own merchant account, and what does onboarding ask of them; is there a partner or referral sign-up; is there a server-to-server transaction query; are recurring payments offered | Design A10 is written to work either way; the answers choose the branch before D3 and D6 are built (PRD §9 item 1b; ADR 0029 E2) | Open — **long lead** |
| OA8 | **Apply for Pryvis's own WiPay merchant account** (identity checks) | Tenants paying Pryvis by card (D6; ADR 0030 decision 7) | Open — **long lead** |
| OA9 | **Engage an accountant** and send them the questions in `docs/design/tax-and-documents.md` §6 (seven, with the design) | Their answers can change invoicing (D2), so they are wanted before it is built; the review is a launch gate (F2; PRD §9 item 8) | Open — **long lead** |
| OA10 | **Engage an attorney** and send them the questions: the Data Protection Act 2020 (roles, registration, breach notice, transfers, retention); whether our e-signature clears Jamaica's bar; the terms and privacy notice, including the aggregate-data consent clause; whether anything in the payments flow is regulated | The e-signature answer can change the accept flow (C5); sign-off is a launch gate (F2; PRD §9 item 6, ADR 0027 D14) | Open — **long lead** |

## Batch 2 — before the first end-to-end slice (sent when phase B is signed off)

| # | Action | Why, and the step that needs it | Status |
|---|---|---|---|
| OA11 | **The sending domain at GoDaddy:** SPF, DKIM and DMARC records for the email provider (exact values in the batch) | Quotes and codes are sent by email (C1); unauthenticated mail lands in spam silently (PRD §9 item 1a) | Open |
| OA12 | **Make `info@pryvis.com` receive mail**, with `support@pryvis.com` as an alias of the same mailbox (`docs/design/support-and-feedback.md` SF2) | The site's contact point, and the support inbox (C1, E1; PRD §9 item 1) | Open |
| OA13 | **Prices and the billing term** for each tier | Sign-up shows the plans (C2); tiers and subscriptions (D5, D6; PRD §9 item 2) | Open |
| OA14 | **Approve the wording of the aggregate-data consent clause** (drafted by us, sent to the attorney under OA10) | It must exist before the first tenant signs up (brief §5a; C2; PRD §9 item 4) | Open |

## Batch 3 — before getting paid is built (sent when phase C is signed off)

| # | Action | Why, and the step that needs it | Status |
|---|---|---|---|
| OA15 | **WiPay test credentials** for staging — a test tenant merchant account and Pryvis's own (steps in the batch) | Payment links and our server's confirmation (D3); card upgrades (D6) | Open |

## Batch 4 — before the web launch (sent when phases D and E are signed off)

| # | Action | Why, and the step that needs it | Status |
|---|---|---|---|
| OA16 | **Receive the attorney's sign-off**, and the accountant's review, and pass both on | Launch gates (F2) | Open |
| OA17 | **Switch production on** — the paid plan from OA1, and billing for every service in production | Production (F3) | Open |
| OA18 | **Your own test accounts for the soft launch** | Soft launch, then the public launch (F4) | Open |
| OA19 | **App-store developer accounts** for Android and iOS, in the business's name | The mobile app (G4). Sent here, before the web launch, because the identity checks take weeks (PRD §9 item 9) | Open — **long lead** |

## Later batches

Written when their phases come near:

- **WhatsApp Business** (I3);
- **Trinidad and Tobago's** payment provider and data-protection advice (J2, J3);
- **your confirmation to retire `original-app/`** (K1).

---

## Log

| Date | Batch or action | What happened |
|---|---|---|
| 2026-10-02 | — | File created from `docs/PRD.md` §9, `docs/BUILD-PLAN.md`, `docs/PLANNING-AUDIT.md` and the A1 and A2 designs. No batch sent yet |
