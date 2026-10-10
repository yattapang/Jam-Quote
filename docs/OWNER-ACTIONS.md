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
| OA1 | **Confirm the hosting provider and region, and open its account in the business's name, with production in a separate team** — recommended: DigitalOcean in Toronto, after the B1 check (`docs/design/environments-and-operations.md` OP2-OP3, OP5); staging about US$20-27 a month from B1, production about US$45-60 a month from F3 | Three environments (B1); always-on at launch (ADR 0026, PRD §9 item 7); Jamaica's transfer rule (ADR 0035) | Open |
| OA2 | **Five DNS records at GoDaddy:** `api.pryvis.com`, `share.pryvis.com`, and the staging trio `staging.pryvis.com`, `api.staging.pryvis.com` and `share.staging.pryvis.com` (exact values in the batch) | The session cookie must be first-party (`docs/design/api-layer.md` AP1); the share page has its own host (AL10); staging mirrors production, cookies included (OP1, OR4). Needed by B1-B2 | Open |
| OA3 | **Set a monthly spend limit** in the Claude developer console | Maintenance under Rule 15's approval gates (B4); the support chatbot later (PRD §9 item 10) | Open |
| OA4 | **Name the second staff member**, or confirm the single-operator fallback for now | Staff MFA and separated approvals (B7, a launch blocker; PRD §9 item 5, R1.34-R1.35) | Open |
| OA5 | **Confirm how you want to review code** — recommended: a pull request per build step, which you approve or ask about | The first code since planning (B1). The planning audit records that you do not yet review diffs (`docs/PLANNING-AUDIT.md` §3) | Open |
| OA6 | **Create the accounts for the services chosen in A5** — storage, malware scanning, error tracking, uptime — in the business's name, with payment details | Files and scanning (B5), monitoring (B3). Each service is recommended, with its cost, in design A5 | Open |
| OA7 | **Ask WiPay four questions** (exact wording in the batch): can small Jamaican businesses each open their own merchant account, and what does onboarding ask of them; is there a partner or referral sign-up; is there a server-to-server transaction query; are recurring payments offered | Design A10 is written to work either way; the answers choose the branch before D3 and D6 are built (PRD §9 item 1b; ADR 0029 E2) | **Moved** to the later WiPay batch, before H7 (ADR 0034) |
| OA8 | **Apply for Pryvis's own WiPay merchant account** (identity checks) — **held** until Stripe answers OA20; done only if Stripe does not work out (ADR 0033) | Tenants paying Pryvis by card (D6; ADR 0030 decision 7) | Held |
| OA9 | **Engage an accountant** and send them the questions in `docs/design/tax-and-documents.md` §6 (seven, with the design), **plus ADR 0033's**: Canadian GST/HST on subscriptions sold to Jamaican contractors, Jamaican tax on a service bought from a foreign company, and income tax on the arrangement between the Canadian and Jamaican businesses; **and the structure under consideration**: Solvnow (Canadian) owning the business, with Pryvis a Jamaican company handling customers locally | Their answers can change invoicing (D2), so they are wanted before it is built; the review is a launch gate (F2; PRD §9 item 8) | Open — **long lead** |
| OA10 | **Engage an attorney** and send them the questions: the Data Protection Act 2020 (roles, registration, breach notice, transfers, retention); whether our e-signature clears Jamaica's bar; the terms and privacy notice, including the aggregate-data consent clause; whether anything in the payments flow is regulated; **and ADR 0033's**: the terms with the Canadian company as the seller of subscriptions, the agreement between the Canadian and Jamaican businesses, and Stripe as a processor; **and the structure under consideration**: Solvnow owning the business and the Pryvis name, with Pryvis a Jamaican company handling customers locally — which company is the data controller under Jamaica's Data Protection Act and Canada's privacy law | The e-signature answer can change the accept flow (C5); sign-off is a launch gate (F2; PRD §9 item 6, ADR 0027 D14) | Open — **long lead** |

| OA20 | **Describe the business to Stripe in writing and keep its approval** (wording in the batch): the Canadian company sells subscriptions to software run by a related Jamaican business, to contractors in Jamaica | ADR 0033 condition 1; decides OA8 and D6 | Open — **long lead** |
| OA24 | **Put every production account in the business's name, with multi-factor sign-in on, and the domain's registrar lock on** — GoDaddy, GitHub, Vercel, the hosting provider, the mailbox, Stripe and A5's services; keep the recovery codes offline (OP11) | Whoever holds the domain holds the email, cookies and share links; one person's access must be removable alone. Before B1 | Open |
| OA25 | **Create a GitHub organisation for the business on the Team plan, and move the repository into it** (about US$4 per user a month); then set the ruleset on `main` and the repository settings exactly as listed in the batch | The merge gate needs rulesets on a private repository; GitHub's own deploy approval needs Enterprise, so the deploy gate moves to our console (OP8, OR2). **Before B1's first code** (B4) | Open |
| OA26 | **Create Claude's own GitHub account** (for example `pryvis-claude`) with write access only, and **connect Claude's sessions to it instead of your own account** (steps in the batch) | Today Claude acts as your administrator account, so no approval gate can hold (OP8, OR1). **Before B1's first code** (B4) | **Done 2026-10-09** — sessions connect as `yourpryvis`; `gh api repos/yattapang/Jam-Quote --jq .permissions` gives `"admin":false`, `"push":true` |
| OA27 | **Move Vercel to the Pro plan** (about US$20 a month) | Vercel's Hobby plan forbids commercial use, and pryvis.com already promotes a product (OP3, OR15). **Possibly due now** | Open |
| OA28 | **Make the backup key pair, keep the disaster key offline, and seal an escrow copy** with the attorney or the second staff member; keep it apart from the accounts' recovery codes (steps in the batch) | Backups are useless without a key that survives losing one person or one place (OP6, OP11, OR6). Before B3 | Open |
| OA22 | **Email the Information Commissioner the five questions** in `docs/DATA-PROTECTION-READING.md` §10 (wording in the batch) — free, and it settles the costliest unknowns before any lawyer | Hosting regions (A4, A5, before B1); registration and the impact assessment; whether contractors must register | Open — **long lead** |
| OA21 | **Open a Stripe account for the Canadian company and use test mode only** — no live activation until A10 is approved and OA20 is answered. Put the test keys in the environment's secret settings (steps in the batch), never in the chat | The test-mode experiment of ADR 0033 (A10) | Open |

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
| OA15 | ~~WiPay test credentials for staging~~ **Moved** to the later WiPay batch, before H7 (ADR 0034). Stripe's test mode is OA21 | — | Moved |

## Batch 4 — before the web launch (sent when phases D and E are signed off)

| # | Action | Why, and the step that needs it | Status |
|---|---|---|---|
| OA16 | **Receive the attorney's sign-off**, and the accountant's review, and pass both on | Launch gates (F2) | Open |
| OA17 | **Switch production on** — the paid plan from OA1, and billing for every service in production | Production (F3) | Open |
| OA18 | **Your own test accounts for the soft launch** | Soft launch, then the public launch (F4) | Open |
| OA23 | **Register Pryvis as a data controller** with the Information Commissioner (online; J$25,000 the first year, J$15,000 a year after; renew by 1 December). If the Canadian company sells the subscriptions, register it too, naming the Jamaican company as its representative (`docs/DATA-PROTECTION-READING.md` §3) | Before the first real contractor (F3-F4); Data Protection Act s. 15 | Open |
| OA19 | **App-store developer accounts** for Android and iOS, in the business's name | The mobile app (G4). Sent here, before the web launch, because the identity checks take weeks (PRD §9 item 9) | Open — **long lead** |

## Later batches

Written when their phases come near:

- **WiPay**, if card links for contractors' clients go ahead (H7): OA7's questions and OA15's test credentials;
- **WhatsApp Business** (I3);
- **Trinidad and Tobago's** payment provider and data-protection advice (J2, J3);
- **your confirmation to retire `original-app/`** (K1).

---

## Log

| Date | Batch or action | What happened |
|---|---|---|
| 2026-10-09 | OA26 | Done, begun early at the owner's choice: Claude's sessions now act as `yourpryvis`, with write access and no administrator rights (checked with `gh api user` and the repository's permissions). Until OA25's ruleset exists, Claude never pushes to `main` |
| 2026-10-06 | OA1, OA2, OA25-OA28 | From design A4's independent read: production in its own team; the staging web domain; the GitHub organisation (Team) and Claude's own account; Vercel Pro possibly due now; the backup keys and escrow |
| 2026-10-06 | OA1, OA2, OA24 | From design A4: the provider and region (DigitalOcean, Toronto, recommended), the staging DNS records, and accounts with MFA in the business's name |
| 2026-10-06 | OA22, OA23 | From the data-protection reading: the Commissioner's questions (batch 1) and registration (batch 4) |
| 2026-10-02 | OA7, OA15 | Moved to the later WiPay batch: WiPay card links move to release 2 (ADR 0034) |
| 2026-10-02 | OA8, OA9, OA10, OA20, OA21 | Stripe for subscriptions (ADR 0033): OA8 held; ADR 0033's questions added to OA9 and OA10; OA20-OA21 added to batch 1 |
| 2026-10-02 | — | File created from `docs/PRD.md` §9, `docs/BUILD-PLAN.md`, `docs/PLANNING-AUDIT.md` and the A1 and A2 designs. No batch sent yet |
