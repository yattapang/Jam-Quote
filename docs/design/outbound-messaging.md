# Design: outbound messaging — one service, the email provider, delivery status, opt-out and caps

**Status: APPROVED by the owner, 2026-10-09 — every recommendation, MS1-MS10** ("approved"). **The owner signed off the
step, amendments included, on 2026-10-10** ("A6 is done"); A6 is ticked in the build plan. Build plan step A6
(`docs/BUILD-PLAN.md`). **Amended the same day to answer its independent read (MR1-MR24, §14)**; three amendments
changed what the owner had approved, and the owner decided each on 2026-10-09 (§14). Nothing here is built until C1;
the provider's accounts and the domain's records are owner actions (§12).

Date: 2026-10-09 · **Answers** `docs/PLANNING-AUDIT.md` §7 item 6 (one service, channels, delivery status and bounces,
opt-out, message caps; always the issued snapshot, as a PDF or an expiring link; per-tenant sender name and reply-to;
channel rules per country) and brief §12 · **Requirements** PRD R1.18 (delivery never happens on its own), R1.20b (a
code by email: 30 minutes, single use, five wrong attempts), R1.21 (email and WhatsApp click-to-chat on every tier),
R1.21b (the contractor sees what happened to every message), R1.21c (opt-out; a daily cap per tier as entitlement
data), R1.28 (reminders and a digest), and §9 item 1a (an authenticated sending domain) · **Carries** Rule 11 (one
outbound service; the issued snapshot; delivery recorded; idempotent and retried; nothing sent without the user's
act), Rule 3 (wording and channel rules as data per country), Rule 14 (caps through the one entitlement service),
Rule 15 (no personal data to a model), ADR 0035 (the privacy line on every message; regions; retention), and the
designs it must fit: `docs/design/api-layer.md` (AP6 signed provider callbacks and idempotency, AP9 nothing personal in
logs, AP10 jobs carry their tenant), `docs/design/environments-and-operations.md` (OP1, OP4 secrets, OP7 alerts, OP10
triggers), `docs/design/support-and-feedback.md` (SF2, SF3, SF7) and `docs/design/third-party-register.md` (RG1's nine
tests; RG7's AWS accounts; RG8's register rows) · **Delegation (Rule 16.5):** Opus, main session — choosing where
personal data goes, and the abuse controls on an unauthenticated-adjacent sending path, are judgement-class.

**Prices and capabilities are read from each vendor's own pages on 2026-10-09** (sources in §12), not from third-party
summaries — the lesson of A5's finding RR6. Where a capability could not be confirmed, it says so, and it is checked
at C1 before the build relies on it.

---

## Contents

1. The problem
2. MS1 · What is sent, by whom, to whom
3. MS2 · One service, an outbox, and channels
4. MS3 · The email provider
5. MS4 · Who a message is from, and the domain's records
6. MS5 · What a message says: templates, the issued snapshot, no tracking
7. MS6 · Delivery status, bounces and complaints
8. MS7 · Consent, opt-out, reminders and per-country rules
9. MS8 · Caps and abuse
10. MS9 · WhatsApp, and later channels
11. MS10 · What is kept, where, for how long — and the keys
12. What gets built, tests, what this does not do, costs, owner actions, sources
13. The mistakes this design is checked against (Rule 24)
14. The independent read, and where each finding is answered

## 1. The problem

**Today nothing is sent.** The rebuilt application has no outbound path; the old one called its email provider
(Resend) from several places, which the Phase 0 audit recorded as a finding (`docs/SERVICE-REGISTER.md` §2). Release 1
cannot work without sending: a quote reaches its client by email or WhatsApp (R1.21); a client accepts with a code sent
by email (R1.20b); sign-up verifies an address (Rule 14); reminders chase overdue invoices (R1.28); support replies go
out from the console (SF3).

**Who it is for.**
- **Delroy, a contractor**, who taps "send" on a quote at the roadside and needs to know it arrived — or that the
  address was wrong (R1.21b) — without understanding email.
- **His client**, who receives a message from a business they know, not from a company they have never heard of, and
  can stop the reminders (R1.21c).
- **The owner**, who pays per message, answers for every message sent in Pryvis's name, and must not have one abusive
  free tenant get the whole sending account suspended — which would stop every sign-up code and every quote for every
  tenant at once.

**What it must achieve:**
- one service through which every message leaves, so a provider can be swapped in one place (Rule 11);
- **a message is sent only because someone acted**: a contractor's tap, a client's request for a code, a person's
  sign-up — or a reminder setting the contractor switched on (MS7);
- the contractor sees the true outcome of each message: sent, delivered, bounced, or refused, never a hopeful "sent"
  (R1.21b);
- **no single tenant can stop another tenant's mail**, and no tenant can use Pryvis to send what it likes to whom it
  likes (MS8). *(Restated after the read, MR1: the draft said "no tenant can damage another tenant's ability to send",
  which its thresholds did not achieve.)* If many tenants together approach AWS's lines, **our own breaker pauses client
  mail for everyone** — codes to known addresses still go — before AWS would pause the account; that is damage to
  others, chosen and bounded, and it never touches sign-up and account mail, which have their own account;
- personal data in messages rests in Canada where a provider offers it (RG1 test 1), and the provider keeps as little
  as possible (MS10).

## 2. MS1 · What is sent, by whom, to whom

Every message in release 1, and none other. A new kind is added here first.

| # | Kind | To | Triggered by | Pryvis's role (ADR 0035) | Stream (MS4) | Channel |
|---|---|---|---|---|---|---|
| 1 | **Document sent** — quote, invoice, credit note | The tenant's client | The contractor taps send (R1.18, R1.21) | Processor | Client | Email, or WhatsApp click-to-chat (MS9) |
| 2 | **Acceptance code** (R1.20b) | The tenant's client | The client asks for it on the share page | Processor | Client | Email |
| 3 | **Overdue reminder** (R1.28) | The tenant's client | The tenant's reminder setting (MS7) and an overdue invoice | Processor | Client | Email |
| 4 | **Bounce notice** (R1.21b) | The contractor | A document or code to their client bounced | Controller | — | **In the app, not by email** (MS6) |
| 5 | **Overdue digest** (R1.28) | The tenant's owner | A weekly schedule the tenant can switch off | Controller | Account | Email |
| 6 | **Email verification** at sign-up (Rule 14) | The person signing up | Their sign-up | Controller | Account | Email |
| 7 | **"Someone tried to register with your address"** (Rule 14) | The existing owner | A duplicate sign-up | Controller | Account | Email |
| 8 | **Password reset** | The tenant user | Their request | Controller | Account | Email |
| 9 | **Subscription notices** (R1.37b, R1.37c) | The tenant's owner | A renewal, a failed payment, a lapse | Controller | Account | Email |
| 10 | **Support reply** (SF3) | Whoever wrote to support | Staff send it from the console | Controller | Account | Email |
| 11 | **Operational alert** (OP7) | The owner | A dead-letter job, a reconciliation mismatch (A12), a sending pause or the circuit breaker (MS8) | — (no personal data) | Account | Email |
| 12 | **"Confirm this support message is yours"** (SF3) *(added after the read, MR23)* | The account's own verified address | An email to `support@` from an address that matches an account | Controller | Account | Email; **at most one a day per account** — a forged From line cannot turn it into a flood |
| 13 | **A new member's address verification** (ADR 0029 E3, Pro members 2 and 3) *(MR23)* | The new member | The tenant's owner adding them | Controller | Account | Email; counted in A8's sign-up limits |

**Where an acceptance code goes is fixed by the contractor, never by the visitor** *(MR3)*. The approved acceptance
design says the channel "may be typed at send time" — by the contractor, when he sends the quote
(`docs/design/acceptance-evidence.md` §4.1) — and the acceptance records "which destination was actually used". So
the share page offers "send me a code" **only to the destination the contractor gave**; it has no field for typing
another address. A visitor holding a forwarded link can ask for a code, but only to the client's own address. That
removes the "email a friend" pattern AWS warns about, rather than limiting it. If the client's address is wrong, the
contractor corrects it and sends again.

**What is not sent, and why:**
- **No marketing, no newsletters, no "tips".** Release 1 sends only what someone's act or setting asked for. A
  marketing stream would need consent records and its own design.
- **No email for each bounce or each "viewed"** to the contractor (row 4): a bad address list would become an inbox
  flood. The app shows it; the weekly digest summarises it.
- **No SMS** (R1.20b: a new paid sub-processor, absent from the register) and **no WhatsApp Business sending** (R3).

## 3. MS2 · One service, an outbox, and channels

**The shape.** One module, `messaging`, owns every send. The rest of the application calls it and never a provider
(Rule 11; `api/src/core/architecture/import-boundaries.test.ts` already refuses reaching into another module's
internals).

1. **Asking to send writes a row, in the caller's own transaction.** Two tables, never one with a missing tenant
   *(MR12)*:
   - `outbound_message` — **tenant-owned**, with `tenant_id`, row-level security and composite keys (Rule 4.1), for
     every message a tenant's act causes (MS1 rows 1-3, 5, 9, 13);
   - `platform_outbound_message` — **no tenant**, for messages sent before any tenant exists or about no tenant (rows 6-8,
     10-12). The application role has **no privilege on it**; it is written and read only through named door functions,
     the privilege model's pattern, like the credential tables.

   Each row records the kind (MS1), the channel, the recipient, the related record, the template and its version, the
   parameters the template needs (identifiers — AP10), a **client key** (below) and status `queued`. **If the caller's
   transaction rolls back, the message never existed.** If it commits, it will be attempted. That is the outbox
   pattern: "send" and "the thing it reports" agree.
2. **One queue: AP10's job table** *(MR12)*. The same transaction enqueues one AP10 job per message, carrying the
   message's id and, for a tenant message, its `tenant_id`. The worker claims jobs through AP10's claim door — never by
   reading `outbound_message` directly — and runs a tenant's job inside `withTenant(tenant_id)`. Platform messages are
   a **declared platform job kind**, with the written reason "messages sent before or outside any tenant", reaching
   `platform_outbound_message` only through its doors.
3. **Secrets in a message are held sealed, briefly** *(MR13)*. An acceptance code, a reset link's token and a
   verification link's token must be rendered into the message, but are stored hashed everywhere else. So the plaintext
   is kept in `message_secret` — no tenant, no application privilege, door functions only — **sealed** with a key held
   in configuration (as `MFA_TOTP_KEYS` seals second-factor secrets, ADR 0021), and **deleted when the provider
   accepts the message** — or when the message reaches any final status (`failed`, `suppressed`) — and, whatever
   happens, **a sweep deletes any secret older than one hour**, so a worker that stops between acceptance and the delete
   leaves a secret for at most an hour (the closing check's D4). A code's own life is 30 minutes (R1.20b), so nothing
   valid outlives the sweep. A retry before acceptance re-sends the **same** code; after acceptance there is nothing to
   resend, and a new code is a new request. The share link's token follows the same rule if A9 stores it hashed.
4. **The job re-checks before it sends** *(MR10)*. A message can wait — offline on a phone, or in retries for hours.
   Before calling the provider, the job re-checks the message's own preconditions, per kind, and otherwise ends it
   `suppressed` with the reason:
   - a document: still the current, un-withdrawn, un-revoked issue or invoice;
   - a reminder: the invoice still unpaid, still not "do not remind", the subscription still active;
   - any tenant message: the tenant not suspended (R1.46), its sending not paused (MS8), the address not suppressed,
     the client not opted out (MS7);
   - a code: its code still unused and unexpired.
5. **The request to send is idempotent, without a time limit** *(MR10)*. AP6's idempotency records last seven days, and a
   phone may be offline longer. So `outbound_message` carries a **client key** with a unique index per tenant — the
   pattern R1.22g uses for variations — and a replay after any delay finds the row it already made.
6. **Retries.** A failure the provider calls temporary (throttling, a timeout, a 5xx) is retried with back-off — after 1,
   5, 30 and 120 minutes — then the row is `failed` and the contractor sees it (MS6). A permanent refusal is not
   retried. **AP10 asks that a job calling a provider pass an idempotency key; SES's send call takes none.** That
   exception is recorded here, with its consequence below.

**The duplicates this cannot prevent, stated in full** *(MR20)*: a message is sent at least once, and may rarely be
sent twice, when
- the provider accepts it but the reply is lost (a timeout after acceptance), and the retry sends it again; or
- the worker stops — a crash, a deploy, a lease that runs out — after the provider accepted it and before the job
  recorded that (AP10: every job is at-least-once).

A client may, rarely, receive the same quote twice. Losing a message silently would be worse, and Rule 11 says so.
**The brief said otherwise** — §12: "so nothing is sent twice" — so an edit was proposed to the owner (Rule 1.9), and
**approved and applied on 2026-10-10**: "Include retries and idempotency, so a request is never sent twice; a provider's
lost reply can still, rarely, cause a duplicate, and the design says when."

**Statuses, and what each means** — the contractor sees these words (MS6):

| Status | Meaning | Set by |
|---|---|---|
| `queued` | Asked for; not yet handed to the provider | The request |
| `sent` | The provider accepted it | The job |
| `delivered` | The recipient's mail server accepted it | The provider's event (MS6) |
| `bounced` | The address does not exist or refused it permanently | The provider's event |
| `complained` | The recipient marked it as spam | The provider's event |
| `failed` | Temporary failures ran out, or the provider refused it | The job |
| `suppressed` | **Not attempted**: the address bounced before, or the client opted out (MS7), or the tenant's sending is paused (MS8) | The job, before calling the provider |
| `handed_to_device` | WhatsApp only: the contractor's phone opened WhatsApp with the message. We cannot know more (MS9) | The app |

**A status only moves forward** *(MR9)*. The order is `queued` → `sent` → `delivered`, and `bounced`, `complained`,
`failed` and `suppressed` are final. Every write — the job's and the event door's — is conditional on that order, so a
late `sent` never overwrites `delivered`, and a late delivery event never overwrites `complained`. A complaint after
delivery moves `delivered` to `complained`; nothing moves a final status back.

**"Delivered" is not "read".** It means the recipient's server took it. Whether the client looked is known only when
they open the share page, which records its own view (A9). Nothing pretends otherwise.

**Channels** are adapters behind one interface: `email` (MS3's provider) and `whatsapp_click` (MS9) in release 1; a
WhatsApp Business adapter in release 3 (I3) and anything later plug in without the rest of the application changing.
Which channels a country allows is rule-pack data (MS7).

## 4. MS3 · The email provider

RG1's nine tests apply (`docs/design/third-party-register.md` RG1): Canada first; written processing terms; commercial
use allowed on the plan; separate per environment; portable.

| Option | Region | Cost at our size | For | Against |
|---|---|---|---|---|
| **A. (rec) Amazon SES, Canada (Central)** | **Canada** — listed among SES's regions on AWS's endpoint page | **US$0.10 per 1,000 emails "à la carte"** — new accounts now start on the dearer Essentials plan (about US$0.16) unless à la carte is chosen *(MR21)* — plus US$0.12 per GB of attachments, and **US$0.005 a month per SES tenant** plus US$0.005 per 1,000 of its emails (AWS's SES pricing page). At 100 tenants sending ten client emails a day, about 30,000 a month: **about US$4** | AWS is **already a sub-processor in Canada** (RG3, RG7), so no new company. Per-tenant **reputation isolation, with per-tenant suppression lists and automatic pausing** (SES "tenants", 2025). A **sandbox** that only delivers to verified addresses — so staging can never email a real person. *(How long SES keeps a message body after sending is **not stated** on any AWS page read — MR14 — and is not a reason for this choice)* | More to build: delivery events come through AWS's notification service (SNS), whose signatures we verify. New accounts start in the sandbox (200 emails a day) until AWS approves production use — **an owner action with a lead time** (OA29). No idempotency key on the send call (MS2's stated duplicate) |
| B. Resend | Multi-region sending; regions not listed on its pricing page | Free: 3,000 a month, **100 a day**; Pro US$20 a month for 50,000 | Simple; idempotency keys; signed webhooks | A new US company holding tenants' clients' messages; keeps logs **30 days** on Free, Pro and Scale; the free plan's 100 a day would block sends at 10 tenants |
| C. Postmark | Region not stated on its pricing page | Free: 100 a month; paid plans from about US$15 a month (to confirm) | Excellent deliverability; transactional and broadcast in separate "message streams" | Keeps **full message content 45 days** by default (7-365 days as a paid add-on): our share links and codes sit in its history. A new US company |
| D. Our own mail server | Toronto | A server, and the deliverability work | No processor | Deliverability from a fresh server is poor, and a mail server is a 2am job. Rejected |

**Recommendation: A, Amazon SES in Canada (Central).** The deciding reasons: no new company; Canada; per-tenant
isolation and suppression built in; a sandbox that keeps staging from reaching real people; and a cost of a few
dollars a month. *(Amended after the read, MR14: the draft also gave "the body is not kept" as a deciding reason. No
AWS page read says so — AWS says only that SES "encrypts all data at rest" — so it is withdrawn as a reason and treated
as unknown in MS10.)* **Decided by the owner, 2026-10-09: à la carte pricing** (MR21).

**How it is set up** (checked at C1, each pass or fail, recorded):
- **Two production email accounts** in RG7's organisation *(MR4; decided by the owner, 2026-10-09: "Separate
  account")*: **"production client email"** for the client stream and **"production account email"** for the account
  stream (MS4). AWS reviews and pauses **a whole account**, so a pause caused by tenants' client mail can no longer
  stop sign-up codes or password resets. Each needs AWS's production approval (OA29). Staging uses the staging account,
  **left in the sandbox for ever**: it can send only to addresses verified in it, which are the owner's test addresses.
- **Configuration sets**, one per stream, each publishing its events to one SNS topic in Canada, delivered to our API by
  HTTPS (MS6). **Each requires TLS** *(MR22; decided by the owner, 2026-10-09: "Require TLS")*: SES otherwise "sends
  the message unencrypted" when the receiving server cannot do TLS, and a message carries a share link or a code. A
  server that cannot do TLS gets nothing; the contractor sees "could not be delivered securely" and can share by
  WhatsApp. The account stream requires TLS too, for the same reason — its reset and verification links are credentials.
- **SES tenants** (AWS's feature), in the client account: one per Pryvis tenant that sends client mail, **named by an
  opaque id, never the business's name** (AWS advises against personal data in names and tags, MR15), with the
  **Standard** reputation policy. This is the second net; ours (MS8) is the first. **Its limit, in AWS's words:**
  tenants' "combined sending activity still affects your overall account reputation", and some findings need "a
  minimum representative volume" — so it isolates, but does not protect the account by itself (MR1).
- **Suppression per tenant, not per account** *(MR5)*. The client account uses **tenant-level suppression lists**: "bounces
  and complaints only affect the tenant that sent the email" (AWS). **SES suppresses for bounces only**; complaints are
  suppressed by us, per tenant, so that a client's own code request can pass (MS6) — SES's lists cannot tell a code
  from a reminder. Whether a tenant's or configuration set's suppression can be limited to bounces is a **C1 check**
  (AWS documents reasons for the account-level list and for configuration sets); if it cannot, complaint suppression
  in SES is switched off for the client configuration set and ours is the only one (the closing check's D5). One business's misconfigured mail server bouncing
  once for one contractor no longer stops every other contractor reaching it. The account stream, alone in its own
  account, uses account-level suppression for bounces. An entry is removed only through a named door: by **staff, with a
  recorded reason** (audited), when a client confirms the address works; and by **A11's erasure job**. AWS also keeps a
  **global suppression list** of hard-bounced addresses for up to 14 days, which we cannot clear (MS10).
- **Open and click tracking off.** Click tracking rewrites links through AWS's tracking domain, which would put share
  tokens into another system's logs; open tracking is a pixel that reports when someone reads their mail. Neither is
  wanted (MS5).
- **A tenant paused by SES** *(MR11)*: AWS says "any attempt to send email using that tenant will fail". That error is
  classified as `suppressed — paused by the provider`, not retried as temporary; SES's tenant status changes, which AWS
  publishes to **EventBridge** (not SNS), are routed by an EventBridge rule to an SNS topic, and so reach the same signed
  event route (MS6) with the same signature check, which
  marks the tenant paused, tells the contractor and alerts the owner.

**If AWS refuses or delays production access** (OA29): B (Resend) is the fallback, with its 30-day log retention
stated in the register and the privacy notice. The messaging module's channel interface makes the swap one adapter.

## 5. MS4 · Who a message is from, and the domain's records

**Two streams, two sending domains.** Mail Pryvis sends about accounts and mail a tenant sends to its clients behave
differently: the first is low-volume and must always arrive (a sign-up code that lands in spam loses a customer); the
second is driven by thousands of contractors, some careless. Mailbox providers such as Gmail keep a reputation per
sending domain, so one tenant's spam complaints must not drag down the sign-up codes.

| Stream | From | Reply-To | Domain |
|---|---|---|---|
| **Account** (MS1 rows 5-13) — **its own AWS account** (MS3) | `Pryvis <support@pryvis.com>`; support replies `Pryvis Support <support@pryvis.com>` — an address that exists and is read (the mailbox, RG6), so a reply or a bounce never vanishes *(MR16: the draft's `hello@` was in no owner action)* | `support@pryvis.com` | `pryvis.com` |
| **Client** (rows 1-3) | `<Business name> via Pryvis <documents@send.pryvis.com>` | **The contractor's own verified address** — the client's reply goes straight to the contractor and never passes through us | `send.pryvis.com` |

**Never the tenant's own domain in From.** Sending as `delroy@delroysplumbing.com` from our servers would fail that
domain's own checks (DMARC) and look exactly like spoofing — which, from our servers, it would be. The client sees the
business's name, and replies reach the business.

**The business name in From is cleaned, and checked by its shape, not its spelling** *(MR17)*:
1. **normalised first**: Unicode NFKC, then a confusables map (the Cyrillic `у` read as `y`, digits read as letters —
   `1` as `l`, `0` as `o`), with invisible characters (zero-width spaces and joiners) and spacing between letters
   removed — so "Prуvis", "Pry​vis", "P r y v i s" and "Pryv1s" all compare as "pryvis";
2. **then refused** if the normalised name contains a protected word or name: Pryvis; words a scam leans on —
   "support", "security", "bank", "billing", "account", "refund", "tax", "verification", "fraud", "disconnection";
   and a rule-pack list of the country's banks, utilities, telecoms and tax authority (for Jamaica, among others: NCB,
   Scotiabank, JN, Sagicor, JPS, NWC, Digicel, Flow, TAJ);
3. quotes, angle brackets, `@` and line breaks are removed, and it is cut to 60 characters.

**The residual, stated:** a deny-list is incomplete by construction. What does not depend on it: the From address is
always ours (`send.pryvis.com`); the display name always ends "via Pryvis"; the body is our fixed template, with no
links but ours; and a refused or suspicious name is visible to staff. **The share page is the larger surface**: it
shows the tenant's own line descriptions, notes and terms, so a phishing text blocked from the email could sit there.
That page is A9's, and A9 must treat the tenant's free text as untrusted for the same reason (links not made
clickable, no tenant-supplied HTML).

**The domain's records** (owner action OA11, exact values written into the batch from the SES and Microsoft 365
consoles when the identities are created). **The mailbox's records and SES's live side by side, and OA11 carries both**
*(MR16: the approval commit's OA11 listed only SES's, which left the mailbox with no MX record and made A5's RG6 untrue)*:
- **for the mailbox (RG6)**: Microsoft 365's **MX** record on `pryvis.com`, its **SPF** record (`include:` Microsoft's
  servers), its **DKIM** (two CNAME records, so the mailbox's own mail passes DMARC when it is forwarded), and its
  autodiscover record;
- **for SES**: **DKIM** for `pryvis.com` and for `send.pryvis.com` — three CNAME records each (SES "Easy DKIM",
  2048-bit) — and **a custom MAIL FROM** subdomain for each, `bounce.pryvis.com` and `bounce.send.pryvis.com`, each
  with an MX record to SES's Canadian feedback endpoint and its own SPF record, so bounces return to SES and SPF aligns
  without touching the root domain's SPF;
- **for staging**: its own identity on `staging.pryvis.com`, with its own DKIM — so under `p=reject` staging's mail is
  not refused, and staging can never sign as production;
- **DMARC** on `pryvis.com` (which covers its subdomains): `p=none` for the first four weeks, then `p=quarantine`, then
  `p=reject` once the reports show only our own senders. **Aggregate reports go to `dmarc@pryvis.com`, an alias of the
  mailbox** (added to OA12), deleted on the mailbox's schedule; they name sending servers and counts, not message
  content;
- **Google Postmaster Tools** verified for `send.pryvis.com` (a TXT record), because Gmail sends SES no complaint data
  (MS6) and this is where Gmail's own spam-rate figure for our domain can be read.

## 6. MS5 · What a message says: templates, the issued snapshot, no tracking

**Templates are ours, in code, versioned.** Each kind of MS1 has one template per language, plain text and simple
HTML, rendered by the job. The tenant never supplies HTML. Every string comes from the language catalogue (Rule 3:
i18n from the first message), and legal wording — the footer's privacy sentence — comes from the country's rule pack.

**A document is sent as a link, not an attachment** — the choice for the owner:

| Option | For | Against |
|---|---|---|
| **A. (rec) A link to the share page** (A9), where the client views the issued document and can download its PDF | Revocable and expiring (A9); the share page verifies the PDF's hash before serving it (R1.16a); the share page records a real "viewed"; the email is small; **the provider never handles the document itself** | A client who wants the PDF in their inbox must tap once more |
| B. The PDF attached | The client keeps it without tapping | Cannot be withdrawn once sent — a wrong quote stays in the client's inbox for ever; forwarded freely; larger messages and attachment charges; the provider handles the document |

**Recommendation: A.** Release 1's whole design leans on being able to withdraw a wrong document (scope reduction,
withdrawal, revisions); an attachment defeats that the moment it is sent. The contractor can still download the PDF
and send it from their own phone if a client insists.

**Always the issued snapshot** (Rule 11): the link points at the issue that was sealed, never at a draft; if a newer
revision is issued, the old link shows that it was superseded (A9's rule).

**What a client email contains**, and nothing more:
- the business's name, the document kind and number ("Quote Q-0042"), and the link;
- **an optional personal message** from the contractor: plain text, at most 500 characters, and **no web addresses**
  — a link typed by a tenant is how a phishing message would ride on our domain, so a message containing one is
  refused with that reason;
- the footer: "Sent by Pryvis on behalf of <business>", **the tenant's privacy line** from its document settings (ADR
  0035 decision 5; A7 owns the field), and, on reminders, the opt-out (MS7).

**No amount in the email.** The total is on the share page, behind the link. An inbox is read over a shoulder and
forwarded; the document number and the business's name are enough to recognise it.

**No tracking.** No open pixel, no click redirect (MS3). "Viewed" comes only from the share page itself, which the
client chose to open.

## 7. MS6 · Delivery status, bounces and complaints

**How events reach us.** SES publishes each message's events (delivery, bounce, complaint, rejection, delivery delay)
to an SNS topic, which posts them to `POST /v1/provider-events/ses` — **AP6's signed provider callback route kind**,
declared with its reason and a body-size limit:
- **the signature is verified as AWS describes** *(MR9)*: SNS signature version 2 only; the signing certificate fetched
  **over HTTPS** and only from an `sns.ca-central-1.amazonaws.com` host; the topic must be one of ours; anything else is
  refused;
- **a subscription confirmation** is confirmed only for one of our topics, and logged; any other is refused;
- each message carries an SES **message tag** with our message's id, so an event finds its row even if it arrives
  before the job recorded the provider's id;
- **idempotent on the SNS message id**, as AP6 de-duplicates by the provider's own event id *(MR9)*, so SNS's retries
  change nothing twice;
- the row is updated **through one door function** that sets only the status fields, owned by its own role — the
  privilege model's pattern — because the event arrives with no tenant context; it applies MS2's forward-only order.

**What the contractor sees** (R1.21b):
- on the issue or invoice, the **latest message's status in plain words**: "Sent", "Delivered to client@…", "Bounced
  — this address does not accept mail; check it with your client", "Marked as spam by the recipient", "Not sent — this
  client asked not to receive reminders", "Not sent — could not be delivered securely" (MS3's TLS);
- a **notice in the app** when a document or a code bounces (MS1 row 4), and the week's bounces in the digest;
- **a bounced acceptance code is shown on the client's share page** too: "We could not deliver the code to that
  address — please contact the business", because the destination is the contractor's to correct (MS1) (R1.21b).

**What a bounce or complaint does** — keyed on **(tenant, normalised address)**, never on a client record, so a new
client record with the same address does not escape it *(MR7)*:

| Event | Effect |
|---|---|
| **Hard bounce** | The address is undeliverable **for that tenant**: further sends to it are `suppressed` until the contractor corrects it. SES's tenant-level list holds it for that tenant only (MS3). Staff can lift a wrong entry with a recorded reason |
| Soft bounce (mailbox full, server down) | SES retries for a while; if it gives up, `bounced` with the reason "temporary" and **no** suppression |
| **Complaint** (marked as spam) | The address is suppressed for that tenant for documents and reminders, and the contractor is told; it counts towards the tenant's thresholds (MS8). **A code the client asks for is not suppressed** — asking is the client's own act *(MR6)* — and **the client can lift the suppression** by confirming, with a code sent to that address, that they want this business's messages (MS7's reversal) |
| Rejected or paused by SES | `failed`, or `suppressed` with the reason, including "paused by the provider" (MS3) |

**Gmail does not report complaints** *(MR2)*. AWS: "Gmail doesn't provide complaint data to SES." So a Gmail client who
marks a quote as spam produces **no** complaint event: the contractor is not told, and the per-tenant complaint count
does not move. Complaints are therefore **not** the main signal in MS8 — bounces, caps and the circuit breaker are —
and Gmail's own figure for our domain is read from Google Postmaster Tools (MS4), weekly, on the operations calendar
(OP12's Monday row, added by this design). The contractor-facing words never claim "no complaints".

## 8. MS7 · Consent, opt-out, reminders and per-country rules

**Rule 11's test, applied to each kind:** a document is sent because the contractor tapped send; a code because the
client asked for it, to the address the contractor gave (MS1); account mail because the person acted. **Reminders are
the one kind sent on a schedule**, so they need the contractor's explicit act:
- **reminders are off until the tenant switches them on**, in their settings, with a plain description of what will be
  sent and when; switching them on is audited;
- **an invoice marked "do not remind"** (R1.25a) is skipped;
- reminders **stop when the subscription lapses** (R1.37c), and are re-checked at send (MS2).

**Opt-out (R1.21c)** — on every reminder:
- a visible "Stop these reminders" link, and the `List-Unsubscribe` and `List-Unsubscribe-Post` headers so the
  recipient's mail app offers one-click unsubscribe (RFC 8058);
- **one address, two methods, and only one changes anything** *(MR8)*: `GET /v1/opt-out?t=…` shows a page with a
  "Stop reminders" button and **changes nothing** — so a corporate link-scanner that fetches links cannot opt anyone
  out; `POST /v1/opt-out` at the same address does it, from the button or from the mail app's one-click. Both are on the
  share host, declared `@PublicRoute("one-click opt-out from one tenant's reminders; the token names one address of one
  tenant and does nothing else")`, rate-limited at **30 requests a minute per IP**, idempotent;
- the token is an HMAC over (tenant, normalised address, purpose), with a key in OP4 — **not** over a client record
  *(MR7)*;
- **scope: one tenant's reminders to one address.** It does not stop documents the contractor sends by hand — those are
  what the client is waiting for — and it does not affect other tenants;
- **reversal needs the address, not a link** *(MR7)*: the contractor, and anyone a share link was forwarded to, can
  open the share page, so a share link cannot be the key. A client who wants reminders back asks on the share page, and
  **a code is sent to the opted-out address itself**; entering it reverses the opt-out. The record says who proved
  what. The contractor sees "This client opted out of reminders" and cannot reverse it.
- **RFC 8058 needs the two headers inside the DKIM signature** ("MUST be covered by the signature"). AWS's pages do not
  say whether Easy DKIM signs them; a C1 check reads a received reminder's DKIM `h=` tag. If they are not covered, SES's
  own DKIM is replaced by signing with our key for that stream (BYODKIM), and the check is repeated.

**The digest to a tenant** (MS1 row 5) is weekly, Monday morning Jamaica time, and the tenant can switch it off.

**Per-country rules are rule-pack data** (Rule 3; brief §8), never code branches. For Jamaica in release 1:

| Rule | Jamaica (release 1) |
|---|---|
| Channels available | Email; WhatsApp click-to-chat |
| Phone numbers for WhatsApp links | **Must include the area code** (876 or 658) — a seven-digit number is refused, because Jamaica has two area codes and guessing one could send the link to a stranger *(MR19)* |
| Reminder sending hours | 09:00-17:00, Monday to Friday, `America/Jamaica` |
| Reminders need an opt-out | Yes |
| Footer wording, and the privacy sentence's template | From the rule pack, in the country's languages |
| Protected names for the From check (MS4) | The rule pack's list of banks, utilities, telecoms and the tax authority |

**What has not been read:** whether Jamaica has rules on commercial electronic messages beyond the Data Protection Act's
right to object to direct marketing. Release 1 sends no marketing, and reminders to a business's own clients about
their own invoices are not marketing — but that reading is the attorney's to confirm (OA10).

## 9. MS8 · Caps and abuse

**The risk, plainly.** Sign-up is free and self-service (Rule 14). Without limits, someone could sign up, enter
"clients" at addresses that do not exist or do not want mail, and spend Pryvis's reputation. AWS judges **the whole
account**: in its words, at a bounce rate of "5% or greater, we'll place your account under review", at "10% or
greater, we might pause"; at a complaint rate of "0.1% or greater … under review", "0.5% or greater … might pause".
A pause of the client account would stop every tenant's quotes. **The draft's thresholds were not below those lines**
(MR1, a blocker): "above 5%" bounce was AWS's review line itself; "two complaints in 40 sends" was 5%, fifty times
AWS's; nothing was checked below 40 sends; and many small tenants, each under its own limit, could together pass
AWS's line with no tenant paused. Rebuilt, in five layers, the first four ours:

1. **Nothing reaches a client before the tenant's own address is verified** (Rule 14); no client message carries free
   content beyond MS5's personal message — no links, no HTML; and a code goes only to the contractor's chosen address
   (MS1).
2. **Caps, counted atomically** *(MR18)*. Per tenant per Jamaican calendar day, in a counter row incremented
   conditionally — ADR 0016's shape — so two sends at once cannot both take the last place:
   - **client emails** (MS1 rows 1 and 3): **Free 20, Pro 200** (set with the prices, OA13), through the one
     entitlement service (Rule 14); a refusal names the limit and the tier that raises it;
   - **a new tenant's first seven days: at most 10 a day**, whatever the tier — a ramp, because a fresh account with no
     history is where abuse starts;
   - **reminders may use at most half of the day's cap**, so the contractor's own sends always have the other half; a
     reminder the cap refuses waits for the next sending window, for up to three days, and is then skipped and listed in
     the digest;
   - **acceptance codes are counted separately**: per issue 5 an hour and 10 a day, and per tenant **three times its
     client-email cap** a day — never inside the client-email cap, so a client is not blocked from accepting because the
     contractor sent a lot that day.
3. **Per-tenant limits that work at small numbers**, counting codes as well as documents and reminders. A tenant's
   client mail is **paused** when, in a rolling window:
   - **3 hard bounces in 7 days**, whatever the volume — an absolute count, because a rate means nothing at 10 sends;
   - or, once it has sent 100 or more in 30 days, a **hard-bounce rate of 2% or more** — AWS's own "maintain a bounce
     rate below 2%";
   - or **2 complaints in 30 days**, whatever the volume (Gmail sends none, MS6, so this is a floor, not the main net).

   The tenant is told why, in plain words, and how to fix it; the owner is alerted; staff can lift the pause with a
   recorded reason (audited). **While paused, codes still go to addresses this tenant has delivered to before**, so a
   real client can still accept; the contractor can still share by WhatsApp.
4. **An automatic circuit breaker for the whole client account** *(MR1)*. From our own event counts, over the last 500
   client-account sends (or 7 days, whichever is more): a **hard-bounce rate of 2.5%**, or a **complaint rate of
   0.05%**, half of AWS's review lines, **pauses all client mail automatically** — except codes to addresses already
   delivered to — and alerts the owner. Only the owner resumes it, with a recorded reason. AWS's own reputation alarms
   (CloudWatch, on the account's bounce and complaint rates, at the same values) trip the same breaker through the
   signed event route, so the breaker acts even if our own counts are wrong. The alert travels by AWS's notification
   service, not SES, so it arrives when SES is what stopped.
5. **SES's own per-tenant pause** (MS3), the last net — useful, but per AWS it needs volume and does not protect the
   account by itself.

**The account stream has its own limits** *(MR4)*, in its own AWS account (MS3): per address, ADR 0016's buckets;
"someone tried to register" (row 7) at most once a day per address; a **global ceiling of 500 account emails a day**,
alarmed at 80% (raised as real sign-ups grow, OP10); and the same breaker at the same values, which stops row 7 first
and slows verification (row 6) to a trickle rather than stopping it. A8 carries the sign-up controls themselves; the
threat model's "volume registration" row points here (§12).

**The numbers are configuration**, and each is set from AWS's own published lines, read from its page on 2026-10-09
(§12's sources), not from memory.

## 10. MS9 · WhatsApp, and later channels

**Release 1 is click-to-chat** (R1.21): the server cannot send WhatsApp messages and does not try.
- The app builds a link — `https://wa.me/<number>?text=<message>` with the client's number in international form, or
  `https://wa.me/?text=<message>` if there is none, so the contractor picks the contact — and opens it **on the
  contractor's own device**. A number without its area code is refused (MS7's table), never guessed.
- The prefilled text is the same as the email's (MS5): the business, the document, the link, and the personal message.
- A row is written with channel `whatsapp_click` and status `handed_to_device`. **The product never says "sent" or
  "delivered" for WhatsApp**: it says **"Opened in WhatsApp — check that you pressed send"** *(MR19: the draft's "sent by
  you" claimed what the next sentence said we cannot know)*.

**The residual, stated:** on a computer, `wa.me` opens in a browser, so the prefilled text — with the share link and
its token — passes through WhatsApp's web service (Meta) on its way to the app. That is the contractor's own channel,
chosen by them, and the token remains revocable and expiring (A9). How the link behaves on each phone was not read from
WhatsApp's own page (it renders by script), and is checked by hand at C1 on an Android and an iPhone.

**Release 3** (I3) adds WhatsApp Business sending as a channel adapter: templates approved by Meta, the recipient's
consent, per-message cost, Meta's verification — and a new register row. Its own design comes then; nothing here
assumes its rules, which the brief says to check at build time.

## 11. MS10 · What is kept, where, for how long — and the keys

**Every copy of a message, and its lifetime** — rebuilt after the read found six copies missing *(MR15)*:

| Copy | Where | What | Lifetime, and erasure |
|---|---|---|---|
| `outbound_message` / `platform_outbound_message` rows | Our database (Toronto) | Kind, status, recipient address, related record, template version, provider id, times. **Not the body**, which is rebuilt from the template version and the issued snapshot if needed | **As long as the record it belongs to**: a document's sends with the document (the tax period, ADR 0035's schedule); a code's row 90 days; account mail 90 days; support replies with their ticket (24 months, SF7). Erasure redacts the address |
| `message_secret` (MS2) | Our database, sealed | A code's or token's plaintext | **Until the provider accepts the message** — normally seconds |
| AP10's job rows | Our database | Message id and tenant id only | AP10's own clean-up |
| AP6's idempotency records | Our database | The send request's response body — which therefore **never includes** a code, a token or the recipient's address | 7 days (AP6) |
| ADR 0016's rate-limit rows | Our database | An unsalted hash of a typed address ("reversible by guessing", ADR 0016's own words) | Until the bucket refills and the sweep deletes it; on erasure, the address's bucket is deleted |
| The message in transit, and after | SES, Canada | The whole message | **Unknown after sending**: no AWS page read states how long SES keeps a body (MR14); AWS states it is encrypted at rest. Treated as "kept for an unstated period" in the privacy notice until AWS's data-handling terms say otherwise (checked at C1) |
| SES's tenant-level and account-level suppression lists | SES, Canada | Addresses that hard-bounced, and complained ones for a tenant | Until removed; **erasure removes them** (A11's job, with the key below) |
| **AWS's global suppression list** | AWS, location not stated | Addresses that hard-bounced | **Up to 14 days, set by AWS; we cannot clear it.** Stated in the privacy notice |
| SNS event messages | SNS, Canada | **The message's headers** — subject, the business's name in From, the contractor's Reply-To, the opt-out URL — and the recipient | In transit; retried for a short time if our endpoint is down |
| DMARC aggregate reports | The mailbox (RG6) | Sending servers and counts; no content | The mailbox's 90 days |
| The recipient's mailbox | The client's own provider | The message | Outside our control, as for any email; the link inside it expires (A9) |

**On a client's erasure** (R1.44, A11): their address is redacted from message rows, removed from SES's tenant-level
list, and their rate-limit bucket deleted; the erasure ledger (OP1) records it. AWS's global list ages out within 14
days, which the notice says.

**The keys, for OP4's table** — rebuilt after the read found the management keys missing *(MR11)*:

| Key | Can do | Held by | Never held by |
|---|---|---|---|
| Client-account sending key | `SendEmail` through the client stream's configuration set, and **nothing else** (the exact IAM resources confirmed at C1 from AWS's authorisation reference, which the read could not load) | The production API's job worker | Staff, Claude, the files worker |
| Client-account tenant-management key | Create an SES tenant and associate its identity and configuration set; remove an entry from a tenant's suppression list (erasure, or staff's audited removal) | The production API's job worker, used only by those named jobs | Staff directly, Claude |
| Account-account sending key | `SendEmail` through the account stream's configuration set only | The production API's job worker | Staff, Claude, the files worker |
| The opt-out token's signing key (MS7) | Sign and check opt-out tokens | The production API | Everyone else |
| `message_secret`'s sealing key (MS2) | Seal and open message secrets | The production API | Everyone else |
| Staging's own SES key, sandboxed | Send to verified addresses only | Staging's API | Production |

Re-enabling a tenant SES paused is done by the owner in AWS's console, after reading why — not by a key the API holds.
SNS events need no shared secret: their signatures are AWS's, verified against AWS's certificate (MS6). **OP4's old
row** that named "the email key (A6)" as held by "the API service" is replaced by these rows.

**No personal data in logs** (AP9): the job logs the message id, kind and status — never the address, the subject or
the body.

## 12. What gets built, tests, what this does not do, costs, owner actions, sources

**The decisions, as approved by the owner on 2026-10-09, and as amended after the read** (§14):

| # | Decision | As approved | Amended after the read |
|---|---|---|---|
| MS1 | What is sent | Eleven kinds | Thirteen (SF3's confirmation, new members); **a code goes only to the contractor's chosen address** |
| MS2 | One service and the outbox | Outbox, statuses, at-least-once | Two tables (no null tenant); AP10's queue; sealed secrets; re-check at send; a client key; forward-only statuses; every duplicate named |
| MS3 | The provider | SES in Canada, one account | **Two production email accounts** (owner); **TLS required** (owner); **à la carte** (owner); tenant-level suppression; paused tenants and EventBridge handled; "body not kept" withdrawn as a reason |
| MS4 | Senders and the domain | Two streams, two domains | Account mail from `support@`; names checked by shape; the mailbox's records restored to OA11; staging's identity; the DMARC report address; Postmaster Tools |
| MS5 | Content | A link, no amount, no links, no tracking | Unchanged; the share page's free text named as A9's surface |
| MS6 | Events and outcomes | Signed SNS | SNS v2 over HTTPS, confirmation, de-duplication on SNS's id; Gmail's missing complaints stated; a client's code exempt from complaint suppression; keyed on the address |
| MS7 | Consent and opt-out | Reminders off by default | GET shows, POST acts; keyed on the address; reversal only by a code to that address; DKIM coverage checked |
| MS8 | Caps and abuse | Free 20 / Pro 200; thresholds; alarms | Atomic caps; a new-tenant ramp; reminders at most half; absolute low-volume limits; **an automatic account circuit breaker at half AWS's lines**; account-stream limits |
| MS9 | WhatsApp | "Opened in WhatsApp" | "Check that you pressed send"; area code required |
| MS10 | Copies and keys | As written | Six more copies; the management keys; OP4's old row replaced |

**What gets built, and when:**
- **On approval of the amendments (A6):** `docs/SERVICE-REGISTER.md` §0's SES row (two accounts; the body's retention
  unknown); A5's RG6, RG7 and RG8; OP2's list, OP4's rows, OP7's watch table and OP10's row in
  `docs/design/environments-and-operations.md`; SF7's pointer; the data-protection reading's §5 row; the threat model's
  rows; OA6, OA10, OA11, OA12 and OA29; and the brief edit of MS2, if the owner approves it.
- **C1 — email messaging:** the `messaging` module, both message tables with their policy and doors, `message_secret`,
  the send job on AP10's queue, the SES adapter, the SNS route and its door, the EventBridge rule, the templates for MS1
  rows 1-2, 6-8 and 12, the statuses, the caps and their counters, the per-tenant limits, the circuit breaker, the SES
  set-up in both accounts, and its checks.
- **C2 (sign-up)** uses rows 6-7 and 13; **C5 (share and accept)** uses row 2 and the bounced-code message; **D2
  (invoicing)** adds rows 3 and 5 and the opt-out; **D6** row 9; **E1** rows 10 and 12.

**Tests, each proved with a planted defect:**
- **The outbox is atomic** (MS2): a send requested in a transaction that rolls back leaves no row, no job and nothing
  sent. Plant: the row written outside the caller's transaction.
- **A replay sends once, at any age** (MS2): two requests with one client key create one row, including after AP6's
  record has expired. Plant: the unique index dropped.
- **Re-checked at send** (MS2): a quote withdrawn, a reminder's invoice paid, a tenant suspended — each after queueing —
  ends `suppressed` with no provider call. Plants: each re-check removed in turn.
- **Statuses only move forward** (MS2, MS6): a `sent` written after `delivered`, and a delivery event after
  `complained`, change nothing. Plant: the order check removed.
- **Secrets are gone once sent** (MS2): after the provider accepts a code's message, its `message_secret` row is gone,
  and the application role cannot read the table at any time. Plants: the delete skipped; a grant added.
- **Retries stop** (MS2): four temporary failures leave the row `failed`. Plant: an unbounded retry.
- **A paused tenant is not "failed"** (MS3): SES's paused-tenant error ends `suppressed — paused by the provider` and is
  not retried. Plant: the error classed as temporary.
- **Nothing reaches a provider for a suppressed address, an opted-out address or a paused tenant** (MS6-MS8). Plants:
  each check removed in turn.
- **A forged or foreign event is refused** (MS6): a bad signature, signature version 1, a certificate URL that is not
  HTTPS or not on `sns.ca-central-1.amazonaws.com`, another topic's ARN, or a subscription confirmation for another
  topic changes nothing. Plants: each check skipped.
- **An event applied twice changes nothing twice** (MS6), keyed on SNS's message id. Plant: the check removed.
- **Caps, atomically** (MS8): twenty-one concurrent sends on a Free tenant's day — **raced against real PostgreSQL**, as
  the race suite does (M32's lesson) — let exactly twenty through; a reminder cannot take the second half; a code is
  still sent. Plants: count-then-insert without the conditional increment; the cap counted per UTC day; codes counted
  in the client cap.
- **Low-volume limits** (MS8): a tenant's third hard bounce in seven days pauses it after three sends; while paused, a
  code to an address delivered before still goes and one to a new address does not. Plants: the absolute count
  replaced by a rate; the paused-code exception widened to every address.
- **The breaker** (MS8): synthetic events taking the client account to 2.5% bounces pause all client mail and alert the
  owner; account mail, in its own account, is untouched; only the owner's recorded act resumes it. Plants: the breaker
  scoped to one tenant; a resume without a reason.
- **The From name cannot impersonate** (MS4): the read's list — "Prуvis Billing" (Cyrillic), "Pry​vis",
  "P r y v i s Accounts", "Pryv1s Accounts", "National Commercial Bnk", "TAJ Tax Refund Unit", "JPS Disconnection
  Notice", "Fraud Department" — is refused, and an ordinary business name passes. Plant: normalisation skipped.
- **The personal message carries no link** (MS5). Plant: the check removed.
- **What leaves us is what we meant** (MS5, MS10): the **actual request** sent to SES — captured — contains the share
  link, no amount, no tracking, TLS required on its configuration set, the opt-out headers on a reminder and only on a
  reminder; the job's log lines contain no address; and AP6's stored response for the send contains no code, token or
  address. Plants: an amount added to the template; the address logged; the code returned in the response.
- **What SES adds, checked by hand at C1 and recorded:** a received reminder's DKIM `h=` tag covers `List-Unsubscribe`
  and `List-Unsubscribe-Post` (MS7); staging's sandbox refuses an unverified address (MS3); a configuration set
  requiring TLS refuses a server without it.
- **WhatsApp is never "sent"** (MS9), and a seven-digit number is refused. Plants: the status allowed; an area code
  guessed.
- **The opt-out** (MS7): GET changes nothing; POST opts out one address of one tenant from reminders, is refused if the
  token is altered, and leaves hand-sent documents going; reversal needs the code sent to that address, and possession
  of a share link is not enough. Plants: GET acting; the scope widened; the token unchecked; reversal by link.
- **A complaint does not block a client's own code** (MS6). Plant: the code suppressed by the complaint.
- **Cross-tenant** (Rule 4): tenant B cannot read, resend, re-check or change the status of tenant A's messages — by id,
  through the event route, or through the platform table's doors.

**What this does not do (Rule 21.4):**
- **It does not guarantee arrival.** "Delivered" means the client's server accepted it; spam folders are outside
  anyone's control.
- **At least once, not exactly once** (MS2): a lost reply, or a worker stopping after acceptance, can send a message
  twice.
- **Gmail's complaints are invisible to us** (MS6): Postmaster Tools gives a domain-wide figure, not who complained.
- **The From check is a deny-list**, normalised but incomplete by construction (MS4); the share page's free text is A9's.
- **How long SES keeps a body is unknown** (MS10), and AWS's global suppression list holds bounced addresses up to 14
  days where we cannot clear them.
- **WhatsApp's outcome is unknowable** (MS9), and on a computer the prefilled text passes through Meta's web service.
- **It does not read Jamaica's commercial-messaging law** beyond what is stated (MS7); the attorney does (OA10).
- **It does not design** the share page (A9), the document settings (A7), the sign-up controls (A8) or the erasure job
  (A11). It names what it needs from each.
- **SES's capabilities are read from AWS's pages, not exercised**: tenants, tenant-level suppression, the paused-tenant
  error and its EventBridge event, TLS enforcement, the sandbox, and the IAM resources a sending key can be limited to.
  Each is a C1 check.

**Costs** (à la carte, the owner's choice): SES about **US$4 a month** at 30,000 emails — US$0.10 per 1,000, plus
US$0.005 a month per SES tenant (about US$0.50 at 100 tenants) and US$0.005 per 1,000 of their emails; SNS and
EventBridge a few cents. **Production's total becomes about US$80-99 a month**: A5's about US$76-95 had no email line,
and this adds about US$4 *(the closing check's D2: the draft said it "stays within" A5's figure, which the sum does not
bear)*. OA1 carries the new figure. OP10's row: AWS's sending quota at
80%, and the breaker's alarms.

**Owner actions** (`docs/OWNER-ACTIONS.md`), on approval of the amendments:
- **OA6**: **two** production email AWS accounts (client and account) and SES in the staging account, sandboxed; **choose
  à la carte** for SES in each, when the account is opened.
- **OA11** (batch 2): **both sets of records** — the mailbox's (Microsoft's MX, SPF, DKIM and autodiscover) and SES's
  (DKIM and MAIL FROM for `pryvis.com` and `send.pryvis.com`) — staging's identity on `staging.pryvis.com`, DMARC's
  three stages with reports to `dmarc@pryvis.com`, and Google Postmaster Tools for `send.pryvis.com`.
- **OA12** (batch 2): `dmarc@pryvis.com` added as an alias of the mailbox.
- **OA29** (batch 2, **long lead**): **request SES production access in both production email accounts**, with each
  account's use case written in the batch. AWS can take days, ask questions or refuse; MS3's fallback applies if it does.
- **OA10**: does Jamaica regulate commercial electronic messages beyond the Data Protection Act, and do overdue reminders
  to a business's own clients fall under it?

**Sources** (read 2026-10-09 on each vendor's own pages):
- AWS: [SES endpoints and quotas](https://docs.aws.amazon.com/general/latest/gr/ses.html) (Canada (Central); sandbox
  200 per 24 hours); [SES pricing](https://aws.amazon.com/ses/pricing/) (à la carte US$0.10 per 1,000; Essentials the
  default for new accounts from 21 July 2026; tenants US$0.005 a month each); [SES tenants](https://docs.aws.amazon.com/ses/latest/dg/tenants.html);
  [the sending review FAQ](https://docs.aws.amazon.com/ses/latest/dg/faqs-enforcement.html) (review at 5% bounces and
  0.1% complaints, pause possible at 10% and 0.5%; "maintain a bounce rate below 2%"; CAPTCHA for "email a friend");
  [the account-level suppression list](https://docs.aws.amazon.com/ses/latest/dg/sending-email-suppression-list.html)
  ("remain there until you remove them"; "Gmail doesn't provide complaint data to SES"; tenant-level lists; the global
  list).
- Resend: [pricing](https://resend.com/pricing). Postmark: [pricing](https://postmarkapp.com/pricing).
- RFC 8058, one-click unsubscribe (§3.2 the GET and POST target; §4 the DKIM coverage requirement).

## 13. The mistakes this design is checked against (Rule 24)

The owner asked, on starting A6, that the rule about preventing repetition be kept in view. The draft answered with a
table mapping each recorded mistake to a line of the design. **The read found that table was itself the mistake it was
meant to prevent**: it promised answers, and most were not mechanical — the keys were still missing (RR4's class), a
vendor fact still had no vendor page (RR6's), and the approval commit itself left a twin contradicting its sibling
(M13's). That is recorded as **M45** in `docs/MISTAKES.md`. The table below says, for each row, what the read found
and what is mechanical now.

**Every row now carries one of three verdicts, and only these** *(the closing check's D3: the first amendment still
called C1 tests "executed")*: **Mechanical now** — a named check that runs today; **C1 test** — a test specified in §12,
which does not exist until C1 builds it; **Not mechanical** — caught only by a person, who is named.

| Mistake | What the read found | Now | Verdict |
|---|---|---|---|
| **RR6** (A5) — a vendor fact without the vendor's page | "Body not kept" had no page (MR14); Essentials pricing missed (MR21) | Withdrawn as a reason; every fact in §12's sources is a page read on 2026-10-09 | **Not mechanical** — the independent read checks each fact |
| **RR4, RR7, RR13** (A5) — keys missing from OP4 | Management keys missing; OP4's old row left (MR11) | MS10's key table rebuilt; OP4 updated | **Mechanical now** for the old row: the closing check's sweep. **Not mechanical** for completeness — the read |
| **RR8** (A5) — rest overstated | The global suppression list; OP2 (MR15, MR24) | Both in MS10; OP2 corrected | **Mechanical now** for OP2's phrase: the sweep. Otherwise **not mechanical** — the read |
| **RR10** (A5) — a test of a function, not of what left | Cannot see what SES adds (MR8) | The actual request captured; the received message read by hand | **C1 test** (the captured request), plus a **hand check** at C1 |
| **RR9** (A5) — a public route without kind or limits | No numbers; GET undeclared (MR8) | Kinds, limits and methods in MS6 and MS7 | **C1 test** (the opt-out route's tests); the declaration itself is enforced by the existing route guard once the route exists |
| **RR2** (A5) — a residual understated | Duplicates, WhatsApp (MR19, MR20) | MS2 and MS9 restated | **Not mechanical** — the read |
| **OR11** (A4), RR4 — copies not listed | Six missing (MR15) | MS10 rebuilt | **Not mechanical** — the read |
| **M23, M39** (Rule 21.10) — prose on who writes a table | Acceptable | No such sentence; the door and its test are C1 items | **C1 test** |
| **M14, H16, M18** — citations that do not exist | Passing | Unchanged | **Mechanical now** — `tools/check_citations.py` and `tools/check_schema_citations.py`, in the gate and CI |
| **M13, M15, M29** — a twin left contradicting its sibling | The approval commit re-made it (MR11, MR16, MR24) | Fixed; the closing check sweeps seven stale phrases | **Mechanical now** for those seven phrases only. **Not mechanical** in general — M45, and its proposed checker awaits the owner |
| **M16, M17** — amendments introducing defects | A process | §14 and the closing check | **Not mechanical** — the closing check, which found D1-D6 in these amendments |
| **M44** — CI not read | A promise | CI read after every push in this step | **Not mechanical** until OA25's ruleset requires CI to merge |
| **M43** — a tool for one environment | Fine | No new tooling | — |
| **AL6** — claiming under row security undefined | MR12 | MS2: AP10's queue and claim door; two tables | **C1 test** (the cross-tenant and claim tests) |
| **M31** — one of two twins handled | MR3, MR4, MR7 | Each twin named in MS1, MS7, MS8 | **Not mechanical** — the read and the closing check |
| **M32, M33** — a concurrency claim nobody raced | MR18 | The cap test is to be raced on real PostgreSQL | **C1 test** — not run until C1 |
| **M28** — a property claimed, never executed | MR1 | §1 restated; the breaker and low-volume tests specified | **C1 test** — not run until C1; until then the property is a design, not a fact |
| **RR3** (A5) — half a vendor's control | MR1 | MS3 quotes AWS's caveat; the breaker does not depend on SES's tenant pause | **Not mechanical** — the read; the breaker itself is a **C1 test** |

## 14. The independent read, and where each finding is answered

Read by Opus from `docs/briefs/2026-10-09-messaging-design-read.md` at `62eb0d5`.
- **Verdict:** "sound after the named changes".
- **Findings:** 24 — **1 blocker** (MR1), 15 major, 8 minor. Each is answered above.
- **Its view of each decision:** agreed with MS5; agreed in part with MS1, MS2, MS3, MS4, MS6, MS7, MS9 and MS10;
  disagreed with MS8. Each disagreement is adopted.

Confirmed on AWS's own pages before answering (Rule 16.4): AWS's review and pause lines and its 2% advice (MR1);
"Gmail doesn't provide complaint data to SES" (MR2); suppression "until you remove them", tenant-level lists and the
global list (MR5, MR15); Essentials as the new default, and the tenants' price (MR21). Confirmed in the repository:
OP4's contradicting row (MR11), SF7's dropped caveat (MR14), RG6 against OA11 (MR16), the threat model's "Resend"
(MR24). **MR3's open question was answered by the approved acceptance design** (§4.1: the contractor types the
channel). **Three amendments changed what the owner approved**, and the owner decided each on 2026-10-09 as
recommended: two production email accounts (MR4), TLS required (MR22), à la carte pricing (MR21).

| Finding | Severity | Answered in |
|---|---|---|
| MR1 · thresholds at or above AWS's lines; blind at low volume; no account breaker | blocker | MS8, layers 2-4; §1 restated; §12's tests |
| MR2 · Gmail sends no complaints | major | MS6; MS4's Postmaster Tools; MS8 layer 3; §12 |
| MR3 · codes as "email a friend"; codes outside the limits | major | MS1 (the contractor's address only); MS8 layers 2-3 |
| MR4 · the account stream shares the client account; no account limits | major | MS3 (two accounts, owner); MS8's account-stream limits |
| MR5 · account-wide, permanent, cross-tenant suppression | major | MS3 (tenant-level lists; staff removal); MS6's table |
| MR6 · a complaint blocks a client's own code, with no exit | major | MS6's table; MS7's reversal |
| MR7 · the contractor can reverse an opt-out through a share link | major | MS7 (reversal by code to the address; keyed on the address); MS6 |
| MR8 · GET not declared; DKIM coverage of the headers | minor | MS7; §12's hand check |
| MR9 · statuses can regress; de-duplication; SNS hardening | major | MS2's order; MS6's route |
| MR10 · no re-check at send; replay past seven days | major | MS2 items 4-5 |
| MR11 · management keys missing; paused tenants; EventBridge; OP4's old row | major | MS10's keys; MS3; OP4 |
| MR12 · claiming under row security; null tenants; AP10's exception | major | MS2 items 1-2 and 6 |
| MR13 · where a code's plaintext lives | major | MS2 item 3 |
| MR14 · "SES does not keep the body" unsupported | major | MS3; MS10; SF7 and the register corrected |
| MR15 · copies missing | major | MS10's table |
| MR16 · OA11 dropped the mailbox's records; report address; staging; `hello@` | major | MS4's records; OA11; OA12 |
| MR17 · deny-list by spelling; the share page's free text | major | MS4 (normalised; residual); A9 named |
| MR18 · caps' concurrency, reminders' share, refused reminders | minor | MS8 layer 2; §12's raced test |
| MR19 · "sent by you"; two area codes | minor | MS9; MS7's table |
| MR20 · duplicates understated; the brief | minor | MS2's duplicates; the brief edit proposed |
| MR21 · Essentials pricing; tenants' price | minor | MS3 (à la carte, owner); §12's costs; OA6 |
| MR22 · opportunistic TLS | minor | MS3 (TLS required, owner) |
| MR23 · two kinds missing | minor | MS1 rows 12-13 |
| MR24 · stale twins in OP2, the reading, the threat model, OP7 | minor | Each corrected in this change |
