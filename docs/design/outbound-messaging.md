# Design: outbound messaging — one service, the email provider, delivery status, opt-out and caps

**Status: APPROVED by the owner, 2026-10-09 — every recommendation, MS1-MS10** ("approved"). Build plan step A6
(`docs/BUILD-PLAN.md`). Nothing here is built until C1; the provider's account and the domain's records are owner
actions (§12).

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
- **no tenant can damage another tenant's ability to send**, and no tenant can use Pryvis to send what it likes to
  whom it likes (MS8);
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
| 11 | **Operational alert** (OP7) | The owner | A dead-letter job, a reconciliation mismatch (A12), a sending pause (MS8) | — (no personal data) | Account | Email |

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

1. **Asking to send writes a row, in the caller's own transaction.** `outbound_message` (a new tenant-owned table, with
   `tenant_id` and row-level security like every other; a platform message such as a sign-up code has none — see
   below) records: the kind (MS1), the channel, the recipient, the related record (the issue, invoice, ticket…), the
   template and its version, the parameters the template needs (identifiers, never copies of personal data — AP10),
   and status `queued`. **If the caller's transaction rolls back, the message never existed.** If it commits, the
   message will be attempted. That is the outbox pattern, and it is what makes "send" and "the thing it reports"
   agree.
2. **A job sends it** (AP10). The job claims `queued` rows, renders the template, calls the channel, and records the
   provider's message id and status `sent` — or a failure, below. A tenant's message is sent inside
   `withTenant(tenant_id)`; a platform message (MS1 rows 6-8, 11) is a **declared platform job kind**, with its written
   reason, as AP10 requires.
3. **The request to send is idempotent** (AP6): the client's idempotency key means a double tap, or the mobile app's
   outbox replaying a send after a lost connection (R1.18), creates one row, not two.
4. **Retries.** A failure the provider calls temporary (throttling, a timeout, a 5xx) is retried with back-off — after 1,
   5, 30 and 120 minutes — then the row is `failed` and the contractor sees it (MS6). A permanent refusal is not
   retried.

**The one duplicate this cannot prevent, stated:** if the provider accepts a message but the reply is lost (a timeout
after acceptance), the retry sends it again. The provider recommended in MS3 has no idempotency key on its send call,
so at-least-once is the honest promise. A client may, rarely, receive the same quote twice. Losing a message silently
would be worse, and Rule 11 says so.

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
| **A. (rec) Amazon SES, Canada (Central)** | **Canada** — listed among SES's regions on AWS's endpoint page | **US$0.10 per 1,000 emails**, plus US$0.12 per GB of attachments (AWS's SES pricing page). At 100 tenants sending ten client emails a day, about 30,000 a month: **about US$3** | AWS is **already a sub-processor in Canada** (RG3, RG7), so no new company. **Does not keep message bodies** after sending. Per-tenant **reputation isolation with automatic pausing** (SES "tenants", 2025). A **sandbox** that only delivers to verified addresses — so staging can never email a real person | More to build: delivery events come through AWS's notification service (SNS), whose signatures we verify. New accounts start in the sandbox (200 emails a day) until AWS approves production use — **an owner action with a lead time** (OA29). No idempotency key on the send call (MS2's stated duplicate) |
| B. Resend | Multi-region sending; regions not listed on its pricing page | Free: 3,000 a month, **100 a day**; Pro US$20 a month for 50,000 | Simple; idempotency keys; signed webhooks | A new US company holding tenants' clients' messages; keeps logs **30 days** on Free, Pro and Scale; the free plan's 100 a day would block sends at 10 tenants |
| C. Postmark | Region not stated on its pricing page | Free: 100 a month; paid plans from about US$15 a month (to confirm) | Excellent deliverability; transactional and broadcast in separate "message streams" | Keeps **full message content 45 days** by default (7-365 days as a paid add-on): our share links and codes sit in its history. A new US company |
| D. Our own mail server | Toronto | A server, and the deliverability work | No processor | Deliverability from a fresh server is poor, and a mail server is a 2am job. Rejected |

**Recommendation: A, Amazon SES in Canada (Central).** The deciding reasons: no new company; the message body is not
kept by the provider, so the share links and codes inside it are not sitting in a dashboard for a month; Canada; and
a cost of a few dollars a month. The extra build (event signatures, the sandbox request) is a one-time cost, and the
sandbox is itself a safety property for staging.

**How it is set up** (checked at C1, each pass or fail, recorded):
- **A fourth AWS account, "production email"**, in RG7's organisation, so SES's sending key and its reputation are
  apart from the backups and the upload scanner. Staging uses the staging account, **left in the sandbox for ever**:
  it can send only to addresses verified in it, which are the owner's test addresses.
- **Configuration sets**, one per stream (MS4), each publishing its events to one SNS topic in Canada, delivered to
  our API by HTTPS (MS6).
- **SES tenants** (AWS's feature): one per Pryvis tenant that sends client mail, with the **Standard** reputation
  policy — AWS pauses a tenant on high-impact findings. This is the second net; our own thresholds (MS8) are the first.
- **Account-level suppression for bounces only.** A hard-bounced address is suppressed across all tenants, because an
  address that does not exist does not exist for anyone. **Complaints are not suppressed account-wide**: a client who
  marks one contractor's quote as spam has said nothing about another contractor, so complaints are suppressed per
  tenant, by us (MS6).
- **Open and click tracking off.** Click tracking rewrites links through AWS's tracking domain, which would put share
  tokens into another system's logs; open tracking is a pixel that reports when someone reads their mail. Neither is
  wanted (MS5).

**If AWS refuses or delays production access** (OA29): B (Resend) is the fallback, with its 30-day log retention
stated in the register and the privacy notice. The messaging module's channel interface makes the swap one adapter.

## 5. MS4 · Who a message is from, and the domain's records

**Two streams, two sending domains.** Mail Pryvis sends about accounts and mail a tenant sends to its clients behave
differently: the first is low-volume and must always arrive (a sign-up code that lands in spam loses a customer); the
second is driven by thousands of contractors, some careless. Mailbox providers such as Gmail keep a reputation per
sending domain, so one tenant's spam complaints must not drag down the sign-up codes.

| Stream | From | Reply-To | Domain |
|---|---|---|---|
| **Account** (MS1 rows 5-11) | `Pryvis <hello@pryvis.com>`; support replies `Pryvis Support <support@pryvis.com>` | `support@pryvis.com` (the mailbox, RG6) | `pryvis.com` |
| **Client** (rows 1-3) | `<Business name> via Pryvis <documents@send.pryvis.com>` | **The contractor's own verified address** — the client's reply goes straight to the contractor and never passes through us | `send.pryvis.com` |

**Never the tenant's own domain in From.** Sending as `delroy@delroysplumbing.com` from our servers would fail that
domain's own checks (DMARC) and look exactly like spoofing — which, from our servers, it would be. The client sees the
business's name, and replies reach the business.

**The business name in From is cleaned:** quotes, angle brackets, `@`, line breaks and anything resembling an address
are removed; it is cut to 60 characters; and a name that contains "Pryvis", "support", "security", "bank" or a bank's
name from a short list is refused at the tenant settings, so a tenant cannot appear as us or as a bank.

**The domain's records** (owner action OA11, exact values written into the batch from the SES console when the
identities are created):
- **DKIM** for `pryvis.com` and for `send.pryvis.com`: three CNAME records each (SES "Easy DKIM", 2048-bit);
- **a custom MAIL FROM** subdomain for each — `bounce.pryvis.com` and `bounce.send.pryvis.com` — each with an MX record
  to SES's Canadian feedback endpoint and an SPF record, so bounces return to SES and SPF aligns;
- **SPF** on `pryvis.com` itself stays Microsoft's (the mailbox, RG6) — SES sends with its own MAIL FROM, so the two do
  not collide;
- **DMARC** on `pryvis.com` (which covers its subdomains): `p=none` for the first four weeks with aggregate reports
  going to a dedicated address, then `p=quarantine`, then `p=reject` once the reports show only our own senders. The
  reports name sending servers and counts, not message content.

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
to an SNS topic, which posts them to `POST /v1/provider-events/ses` — **AP6's signed provider callback route kind**:
- the SNS message's signature is verified against AWS's certificate, fetched only from an `sns.ca-central-1.amazonaws.com`
  address, and the topic must be ours; anything else is refused;
- each message carries an SES **message tag** with our `outbound_message` id, so an event finds its row even if it
  arrives before the job recorded the provider's id;
- the route is idempotent on (provider message id, event type), so SNS's retries change nothing twice;
- the row is updated **through one door function** that sets only the status fields, owned by its own role — the
  privilege model's pattern — because the event arrives with no tenant context.

**What the contractor sees** (R1.21b):
- on the issue or invoice, the **latest message's status in plain words**: "Sent", "Delivered to client@…", "Bounced
  — this address does not accept mail; check it with your client", "Marked as spam by the recipient", "Not sent — this
  client asked not to receive reminders";
- a **notice in the app** when a document or a code bounces (MS1 row 4), and the week's bounces in the digest;
- **a bounced acceptance code is shown on the client's share page** too: "We could not deliver the code to that
  address", with the way to try another channel or to contact the business (R1.21b).

**What a bounce or complaint does:**

| Event | Effect |
|---|---|
| **Hard bounce** | The address is marked undeliverable on that client, for that tenant; further sends to it are `suppressed` until the contractor corrects the address. SES also suppresses it account-wide (MS3) |
| Soft bounce (mailbox full, server down) | SES retries for a while; if it gives up, `bounced` with the reason "temporary" and **no** suppression |
| **Complaint** (marked as spam) | That client's address is suppressed **for that tenant, for every kind of message**, and the contractor is told; it counts towards the tenant's complaint rate (MS8) |
| Rejected by SES (for example, a virus or a suppressed address) | `failed` or `suppressed`, with the reason |

## 8. MS7 · Consent, opt-out, reminders and per-country rules

**Rule 11's test, applied to each kind:** a document is sent because the contractor tapped send; a code because the
client asked for it; account mail because the person acted. **Reminders are the one kind sent on a schedule**, so they
need the contractor's explicit act:
- **reminders are off until the tenant switches them on**, in their settings, with a plain description of what will be
  sent and when; switching them on is audited;
- **an invoice marked "do not remind"** (R1.25a) is skipped;
- reminders **stop when the subscription lapses** (R1.37c).

**Opt-out (R1.21c)** — on every reminder:
- a visible "Stop these reminders" link, and the `List-Unsubscribe` and `List-Unsubscribe-Post` headers so the
  recipient's mail app offers one-click unsubscribe (RFC 8058);
- the link carries a signed, single-purpose token (an HMAC over the message's id, with a key in OP4) and is served at
  `POST /v1/opt-out` on the share host, declared `@PublicRoute("one-click opt-out from a tenant's reminders; the
  token names one client of one tenant and does nothing else")`, rate-limited, idempotent;
- **scope: one tenant's reminders to one client.** It does not stop documents the contractor sends by hand — those
  are what the client is waiting for — and it does not affect other tenants;
- the contractor sees "This client opted out of reminders" and **cannot switch it back on**; only the client can,
  from the share page.

**The digest to a tenant** (MS1 row 5) is weekly, Monday morning Jamaica time, and the tenant can switch it off.

**Per-country rules are rule-pack data** (Rule 3; brief §8), never code branches. For Jamaica in release 1:

| Rule | Jamaica (release 1) |
|---|---|
| Channels available | Email; WhatsApp click-to-chat |
| Phone numbers' default country code, for WhatsApp links | +1 876 / +1 658 |
| Reminder sending hours | 09:00-17:00, Monday to Friday, `America/Jamaica` |
| Reminders need an opt-out | Yes |
| Footer wording, and the privacy sentence's template | From the rule pack, in the country's languages |

**What has not been read:** whether Jamaica has rules on commercial electronic messages beyond the Data Protection Act's
right to object to direct marketing. Release 1 sends no marketing, and reminders to a business's own clients about
their own invoices are not marketing — but that reading is the attorney's to confirm (OA10 gains the question, §12).

## 9. MS8 · Caps and abuse

**The risk, plainly.** Sign-up is free and self-service (Rule 14). Without limits, someone could sign up, enter
thousands of "clients", and use Pryvis's domain to send phishing — or simply send carelessly to bad addresses. AWS
watches the whole account's bounce and complaint rates and, past its thresholds, reviews and then pauses it: **every
sign-up code and every quote, for every tenant, would stop.** Four layers stop that, the first three ours:

1. **Nothing reaches a client before the tenant's own address is verified** (Rule 14), and no client message carries
   free content beyond MS5's personal message — no links, no HTML.
2. **A daily cap per tier** (R1.21c), held as entitlement data and checked through the one entitlement service (Rule
   14). It counts client emails (MS1 rows 1 and 3) per tenant per Jamaican calendar day. Recommended defaults, set with
   the prices (OA13): **Free 20 a day, Pro 200 a day.** A refusal names the limit and the tier that raises it.
   **Acceptance codes are not in the tenant's cap** — a client must never be unable to accept because the contractor
   sent a lot that day — but are limited per issue (5 an hour, 10 a day) and per address (ADR 0016's buckets).
3. **Per-tenant reputation thresholds, below AWS's**: over the last 30 days, once a tenant has sent at least 40 client
   emails, a **hard-bounce rate above 5%**, or **two or more complaints**, **pauses that tenant's client mail**. The
   tenant is told why, in plain words, and how to fix it; the owner is alerted; staff can lift the pause with a
   recorded reason (audited). While paused, the contractor can still share by WhatsApp.
4. **SES's own per-tenant pause** (MS3), the second net. And **account-wide alarms**: AWS's own alarms email the owner
   if the whole account's bounce rate passes 2% or its complaint rate 0.05% — through AWS's notification service, not
   through SES, so the alarm still arrives if SES is the thing that stopped.

**The thresholds are configuration**, and AWS's own published review thresholds are read from its page at C1 and the
values set comfortably below them.

## 10. MS9 · WhatsApp, and later channels

**Release 1 is click-to-chat** (R1.21): the server cannot send WhatsApp messages and does not try.
- The app builds a link — `https://wa.me/<number>?text=<message>` with the client's number in international form
  (the rule pack's default country code fills in a local number), or `https://wa.me/?text=<message>` if there is none,
  so the contractor picks the contact — and opens it **on the contractor's own device**.
- The prefilled text is the same as the email's (MS5): the business, the document, the link, and the personal message.
- A row is written with channel `whatsapp_click` and status `handed_to_device`. **The product never says "sent" or
  "delivered" for WhatsApp**: it says "Opened in WhatsApp — sent by you". Whether the contractor pressed send, we cannot
  know.

**The residual, stated:** on a computer, `wa.me` opens in a browser, so the prefilled text — with the share link and
its token — passes through WhatsApp's web service (Meta) on its way to the app. That is the contractor's own channel,
chosen by them, and the token remains revocable and expiring (A9). On a phone, the link opens the app directly.

**Release 3** (I3) adds WhatsApp Business sending as a channel adapter: templates approved by Meta, the recipient's
consent, per-message cost, Meta's verification — and a new register row. Its own design comes then; nothing here
assumes its rules, which the brief says to check at build time.

## 11. MS10 · What is kept, where, for how long — and the keys

**Every copy of a message, and its lifetime** — written so that "the provider keeps nothing" is checkable (the lesson
of A4's OR11 and A5's RR4):

| Copy | Where | What | Lifetime |
|---|---|---|---|
| The `outbound_message` row | Our database (Toronto) | Kind, status, recipient address, related record, template version, provider id, times. **Not the body** — it is rebuilt from the template version and the issued snapshot if ever needed | **As long as the record it belongs to**: a document's sends with the document (the tax period, ADR 0035's schedule); a code's row 90 days; account mail 90 days; support replies with their ticket (24 months, SF7) |
| The message in transit | SES, Canada | The whole message, briefly, while delivering | Minutes; **SES does not keep the body after sending** (to confirm in AWS's data-handling terms at C1) |
| Event records | SNS, Canada | Event metadata, including the recipient address | In transit only; retried for a short time if our endpoint is down |
| The suppression list | SES account-level, Canada | Addresses that hard-bounced | Until removed — **an erasure removes the address** (A11's erasure job calls SES's delete-suppressed-destination) |
| The recipient's mailbox | The client's own provider | The message | Outside our control, as for any email; the link inside it expires (A9) |

**On a client's erasure** (R1.44, A11): the client's address is redacted from their `outbound_message` rows, and
removed from the SES suppression list; the erasure ledger (OP1) records it.

**The keys, for OP4's table** (the lesson of A5's RR4, RR7 and RR13: name every credential when it is designed):

| Key | Held by | Never held by |
|---|---|---|
| SES sending key — `ses:SendEmail` on the production email account's configuration sets only | The production API's job worker | Staff, Claude, the files worker |
| The opt-out token's signing key (MS7) | The production API | Everyone else |
| Staging's own SES key, sandboxed | Staging's API | Production |

SNS events need no shared secret: their signatures are AWS's, verified against AWS's certificate (MS6).

**No personal data in logs** (AP9): the job logs the message id, kind and status — never the address, the subject or
the body.

## 12. What gets built, tests, what this does not do, costs, owner actions, sources

**The decisions, as approved by the owner on 2026-10-09:**

| # | Decision | Recommended |
|---|---|---|
| MS1 | The eleven kinds of message, and what is not sent | As written |
| MS2 | One service, the outbox, statuses, at-least-once with its stated duplicate | As written |
| MS3 | The provider | **Amazon SES in Canada**, a fourth AWS account; Resend as the fallback |
| MS4 | Two streams on two domains; never the tenant's domain in From; the records | As written |
| MS5 | **A link, not an attachment**; no amount in the email; no links in the personal message; no tracking | As written |
| MS6 | Events by signed SNS; what the contractor sees; bounce and complaint effects | As written |
| MS7 | **Reminders off until the tenant switches them on**; opt-out scope; Jamaica's rules as data | As written |
| MS8 | Caps **Free 20 / Pro 200 a day** (set with the prices); per-tenant thresholds; AWS alarms | As written |
| MS9 | WhatsApp click-to-chat; "opened in WhatsApp", never "sent" | As written |
| MS10 | Copies, retention, erasure, keys | As written |

**What gets built, and when:**
- **On approval (A6):** the register's transactional-email row and the sub-processor list (`docs/SERVICE-REGISTER.md`
  §0; `docs/design/third-party-register.md` RG8) name SES; RG7's account table gains the production email account; OP4
  gains MS10's keys; SF7's row for "our replies, as sent" points here; OA6, OA10 and OA11 are made precise and OA29 is
  added (below).
- **C1 — email messaging:** the `messaging` module, `outbound_message` with its policy, the send job, the SES adapter,
  the SNS route and its door, the templates for MS1 rows 1-2 and 6-8, the statuses on the issue, the caps, the
  per-tenant thresholds, the SES set-up and its checks.
- **C2 (sign-up)** uses rows 6-7; **C5 (share and accept)** uses row 2 and the bounced-code message on the share page;
  **D2 (invoicing)** adds rows 3 and 5 and the opt-out; **D6** row 9; **E1** row 10.

**Tests, each proved with a planted defect:**
- **The outbox is atomic** (MS2): a send requested in a transaction that rolls back leaves no row and sends nothing.
  Plant: the row written outside the caller's transaction.
- **A double tap sends once** (MS2): two requests with one idempotency key create one row. Plant: the key ignored.
- **Retries stop** (MS2): a provider that fails temporarily four times leaves the row `failed`, after the fourth
  back-off. Plant: an unbounded retry.
- **Nothing reaches a provider for a suppressed address, an opted-out client or a paused tenant** (MS6-MS8): each ends
  `suppressed` with no call made. Plants: each check removed in turn.
- **A forged or foreign event is refused** (MS6): a body with a bad signature, a certificate URL off
  `sns.ca-central-1.amazonaws.com`, or another topic's ARN changes nothing. Plants: each check skipped.
- **An event applied twice changes nothing twice** (MS6). Plant: the idempotency check removed.
- **The cap and its exclusions** (MS8): the 21st Free client email in a Jamaican day is refused with the tier named;
  an acceptance code is still sent. Plants: the cap counted per UTC day; codes counted in the cap.
- **The pause** (MS8): a tenant crossing a threshold is paused, its client mail `suppressed`, and another tenant's
  mail unaffected. Plant: the pause applied account-wide.
- **The From name cannot impersonate** (MS4): names containing `"`, `<`, `@`, a line break, "Pryvis" or a bank's name
  are cleaned or refused. Plant: the cleaner skipped.
- **The personal message carries no link** (MS5). Plant: the check removed.
- **What leaves us is what we meant** (MS5, MS10): the **actual request** sent to the SES adapter — captured, not the
  template's output alone — contains the share link, no amount, no tracking settings, the opt-out headers on a
  reminder and only on a reminder; and the job's log lines for it contain no address. (The lesson of A5's RR10.)
  Plants: an amount added to the template; the address logged.
- **WhatsApp is never "sent"** (MS9): a `whatsapp_click` row cannot reach `sent` or `delivered`. Plant: the status
  allowed.
- **The opt-out** (MS7): the token opts out exactly one client of one tenant from reminders, is refused if altered, and
  a hand-sent document to that client still goes. Plants: the scope widened to all kinds; the signature unchecked.
- **Staging cannot email a real person** (MS3): checked by hand at C1 — a send to an unverified address from staging is
  refused by SES's sandbox — and recorded.
- **A cross-tenant test** (Rule 4): tenant B cannot read, resend or change the status of tenant A's messages, by id or
  through the event route.

**What this does not do (Rule 21.4):**
- **It does not guarantee arrival.** "Delivered" means the client's server accepted it; spam folders are outside
  anyone's control. DKIM, SPF, DMARC and the separate client stream improve the odds; they do not decide them.
- **At-least-once, not exactly-once** (MS2): a lost reply after acceptance can send a message twice.
- **WhatsApp's outcome is unknowable** (MS9), and on a computer the prefilled text passes through Meta's web service.
- **It does not read Jamaica's commercial-messaging law** beyond what is stated (MS7); the attorney does (OA10).
- **It does not design the share page, its link's form or its expiry** (A9), the document settings that hold the
  privacy line (A7), or the erasure job (A11). It names what it needs from each.
- **SES's capabilities are read from AWS's pages, not yet exercised**: tenants and their reputation policy, the
  sandbox's refusal, suppression by reason, and that the body is not kept. Each is a C1 check.

**Costs:** SES about **US$3 a month** at 30,000 emails, rising with use (US$0.10 per 1,000); SNS's charges for
deliveries to an HTTPS endpoint are a few cents at this volume. Production's total stays within A5's about US$76-95 a
month. OP10 gains a row: **SES — trigger: AWS's sending quota at 80%** (the quota is raised on request), and the
account's bounce or complaint alarm.

**Owner actions** (`docs/OWNER-ACTIONS.md`), on approval:
- **OA6** gains the **production email** AWS account (and SES in the staging account, sandboxed).
- **OA11** (batch 2) gains its exact contents: MS4's DKIM, MAIL FROM and DMARC records for `pryvis.com` and
  `send.pryvis.com`, with DMARC's staged policy and its report address.
- **New, OA29** (batch 2, **long lead**): **request SES production access** in the production email account, with the
  use case written in the batch (transactional mail only, opt-out on reminders, bounce and complaint handling as MS6
  and MS8 describe). AWS can take days, ask questions, or refuse; MS3's fallback applies if it refuses.
- **OA10** gains a question: does Jamaica regulate commercial electronic messages beyond the Data Protection Act, and
  do overdue reminders to a business's own clients fall under it?

**Sources** (read 2026-10-09 on each vendor's own pages):
- AWS: [SES endpoints and quotas](https://docs.aws.amazon.com/general/latest/gr/ses.html) (Canada (Central) listed;
  sandbox default 200 per 24 hours, 1 per second); [SES pricing](https://aws.amazon.com/ses/pricing/) (US$0.10 per
  1,000; US$0.12 per GB of attachments); [SES tenants](https://docs.aws.amazon.com/ses/latest/dg/tenants.html) and
  [their announcement](https://aws.amazon.com/about-aws/whats-new/2025/08/amazon-ses-tenant-isolation-automated-reputation-policies/).
- Resend: [pricing](https://resend.com/pricing) (3,000 a month and 100 a day free; Pro US$20; 30-day retention).
- Postmark: [pricing](https://postmarkapp.com/pricing) (45-day content retention by default; message streams).
- RFC 8058, one-click unsubscribe (the `List-Unsubscribe-Post` header).

## 13. The mistakes this design is checked against (Rule 24)

The owner asked, on starting A6, that the rule about preventing repetition be kept in view. Rule 24.4 says a repeat
means the first answer was decorative; so this section names each recorded mistake that a design of this kind could
repeat, and the line of this design that answers it — for the independent read to attack.

| Mistake (ledger or finding) | What it was | How this design answers it |
|---|---|---|
| **RR6** (A5) | A vendor's terms taken from a third-party summary, backwards | Every vendor fact here is from the vendor's own page (§12's sources); what was not confirmed is marked "to confirm" or "C1 check" |
| **RR4, RR7, RR13** (A5) | Credentials needed by the design but missing from OP4 | MS10 names every key, who holds it and who never does |
| **RR8** (A5) | "Where the data is" overstated as where it rests | MS10's copies table separates rest from transit; SES's "does not keep the body" is marked to confirm |
| **RR10** (A5) | A privacy test that checked a function, not what actually left | §12's test captures the actual request sent to the adapter |
| **RR9** (A5) | A public route with no declared kind or limits | MS7's opt-out route and MS6's event route each name their kind, their check and their limit |
| **RR2** (A5) | A residual stated too narrowly | Each residual is stated with its mechanism: the duplicate (MS2), WhatsApp through Meta's web (MS9), arrival (§12) |
| **OR11** (A4), RR4 (A5) | "No copies" claimed without listing copies | MS10's every-copy table, with erasure for each |
| **M23, M39** (Rule 21.10) | Prose claiming who writes a table, wrong three times | No sentence here says "only X writes" `outbound_message`. Its writers are named as build items (the send request, the job, and one door for events), and C1 must ship the test that inserts through each — or the claim is not made |
| **M14, H16, M18** (Rule 21.8) | Citing files or symbols that do not exist | Things to be built are named as to-be-built (`outbound_message`, the `messaging` module, the routes); the checkers run before every commit |
| **M13, M15, M29** | One document fixed, its twin left saying the opposite | §12 lists every document that said "chosen in A6" or depends on this — the register, RG7, RG8, OP4, OP10, SF7, OA6, OA10, OA11 — and all change in the approval commit |
| **M16, M17** | Amendments introducing new defects | The read's findings will be answered in a dedicated section, and the closing check re-reads each answer, as A4 and A5 did |
| **M44** | CI red for a week while local gates passed | After every push in this step, the pull request's checks are read before the next step begins |
| **M43** | A tool that worked only in one environment | Nothing new in tooling here; the checks named for C1 are AWS-console checks, recorded by hand, not scripts assumed to run anywhere |
