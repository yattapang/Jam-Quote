# Design: the third-party register completed — file storage, malware scanning, error tracking, uptime, the mailbox

**Status: PROPOSED — awaiting the owner.** Build plan step A5 (`docs/BUILD-PLAN.md`). Written section by section and
saved as it goes, as A4 was. Nothing here is built, or bought, until the owner approves it; the accounts are owner
action OA6, sent with batch 1.

Date: 2026-10-09 · **Answers** `docs/PLANNING-AUDIT.md` §7 item 5 ("the register completed": storage, scanning, error
tracking, uptime, inbox, each with why this one and its privacy-notice line; the tenants' WiPay credentials; upload
security) and PRD §9 items 1c and 1d · **Unblocks** R1.16, R1.16a, R1.33 and R1.36 · **Carries** Rule 5 (uploads are
hostile until proven), Rule 10 (portable, and a trigger for leaving each free tier), Rule 18 (every service recorded,
with the reason), Rule 20 (no third-party scripts on the site), ADR 0035 (hosting regions chosen with the Data
Protection Act's s. 31 in mind; a sub-processor list for contractors), and the decisions this design must fit:
`docs/design/environments-and-operations.md` (OP1 every environment separate; OP2 production in Toronto; OP6 backups at
a second company; OP7 what is watched; OP10 the trigger table; OP11 accounts), `docs/design/api-layer.md` (AP9 the
redacted error shape; AP11 tenant-scoped files and five-minute signed URLs) and `docs/design/support-and-feedback.md`
(SF2 the mailbox; SF7 its 90-day deletion) · **Delegation (Rule 16.5):** Opus, main session — service selection that
decides where personal data goes, and upload security, are judgement-class (Rule 16.2).

**Prices are public list prices found on 2026-10-09, in US dollars, partly from third-party summaries, and are checked
on each vendor's own page before anything is bought** (sources in §11). Where a capability could not be confirmed from a
public page, it says so, and it is checked at B1, B3 or B5 before the build relies on it.

---

## Contents

1. The problem
2. RG1 · What every service must meet
3. RG2 · File storage
4. RG3 · Uploads: type, size, scanning and duplicates
5. RG4 · Error tracking
6. RG5 · Uptime and heartbeats
7. RG6 · The mailbox
8. RG7 · The backup store, confirmed
9. RG8 · The register rewritten, and the sub-processor list
10. RG9 · Costs, and the rows OP10 left to A5
11. What gets built, tests, what this does not do, owner actions, and sources

## 1. The problem

The register (`docs/SERVICE-REGISTER.md`) describes the **old** application: Render, Neon and Vercel's Hobby plan, the
old email set-up, and WiPay as the payment path. Since it was written the owner has decided that production runs in
Toronto on DigitalOcean (OP2), that subscriptions go through Stripe under the Canadian company (ADR 0033), and that
WiPay card links wait for release 2 (ADR 0034). The register has not caught up, and Rule 18 says a service in production
and missing from it is a defect.

Five services that release 1 cannot do without have **no row at all**, and its §3a says so on purpose:

| Needed for | Why it cannot wait |
|---|---|
| **File storage** | Logos (R1.16), rendered PDFs and their hash (R1.16a), deposit receipts (R1.33). Rule 10 keeps files out of the database |
| **Malware scanning** | R1.36 and Rule 5: every upload is scanned before it is stored or served |
| **Error tracking** | OP7 alerts on new errors; SF5 links a support ticket to its error |
| **Uptime and heartbeats** | OP7 watches the API, the share host, the site, and the nightly backup's heartbeat (OR8) |
| **The mailbox** | `info@`, `support@` and `privacy@pryvis.com` (SF2, ADR 0035 decision 10); SF7's 90-day deletion is the deciding requirement |

Two more were decided elsewhere and left for A5 to confirm: **the backup store** (OP6 recommends AWS S3 in Canada under
Object Lock; "A5 confirms the choice and its price") and **the rows for tenants' encrypted WiPay credentials**, now a
release-2 item (ADR 0034).

**Who this is for.** The owner, who pays for and answers for each of these; a contractor, or their client, who asks
"who holds my data, and where?" and is entitled to the answer (ADR 0035 decision 1); the Information Commissioner, to
whom the countries must be declared (s. 16(2)(g)); and whoever builds B3 and B5, who needs a chosen service and its
rules, not a shortlist.

**What it must achieve:**
- each service chosen, with why this one, what it holds, where, what it costs, and what we would do without it;
- **no personal data leaves Canada for these five unless there is no reasonable alternative**, and where it does, the
  register says so;
- **an upload that has not been scanned clean can never be served** — enforced by the system, not by a careful
  caller;
- a total cost the owner can see before agreeing, and a trigger for each free tier (OP10);
- the register rewritten, so it describes what will run, not what ran.

## 2. RG1 · What every service must meet

Nine tests, applied to every candidate below. A candidate that fails one is rejected, or the failure is put to the
owner in so many words.

1. **Where the data rests.** Production's personal data rests **in Canada** where a provider offers it at a similar
   price; otherwise the EU; the United States only if there is no reasonable alternative, and then the register says
   so (ADR 0035 decision 6; OP2). Development and staging hold synthetic data only, so their region does not matter —
   but staging uses the same products as production (OP2), so in practice it is the same region.
2. **Holds the least it can.** A service that needs identifiers and counts is given identifiers and counts, never
   names, addresses or document contents (AP9). The less a service holds, the less its region matters.
3. **Written processing terms.** Pryvis is the processor of contractors' clients' data (ADR 0035 decision 1), so every
   service that holds personal data must offer a data processing agreement, accepted when the account is opened, and
   must name its own sub-processors. A service without one cannot hold personal data.
4. **Commercial use is allowed on the plan we use.** Vercel's Hobby plan taught this (OR15): a free plan whose terms
   forbid business use is not free for us.
5. **In the business's name, with multi-factor sign-in, no shared logins** (OP11), and listed in OA24.
6. **Separate per environment** (OP1): its own project, bucket or key for staging and for production, so a staging key
   opens nothing in production. Production's pieces sit in production's own team or account where the provider has
   one.
7. **Portable.** A standard protocol — the S3 API, SMTP and IMAP, an HTTP check — so leaving is a configuration change
   and a data copy, not a rewrite (Rule 10). Each row in §9 says what we would do if it went away.
8. **Never in the browser.** No third-party script, font or beacon on the site or the web app (Rule 20; OP2's static
   export). A service the browser would talk to directly is reached through our API instead.
9. **Recorded when it is added** (Rule 18): its register row, its line in the privacy notice's sub-processor list
   (§9), where its secret lives (never the secret), and its row in OP10's trigger table — in the same change.

## 3. RG2 · File storage

**What is stored, and how much.** Three kinds of file in release 1:

| Kind | Written by | Read by | Size | Volume at launch |
|---|---|---|---|---|
| Logo (R1.16) | The tenant, once or twice | Our PDF renderer; the tenant's settings page | Up to 2 MB as uploaded; about 100 KB as stored (RG3) | One per tenant |
| Rendered PDF (R1.16a) | Our renderer, at issue | The share page, the tenant, the client | About 100-300 KB | One per issued document |
| Deposit receipt (R1.33) | The tenant | Pryvis staff, approving a manual payment | Up to 10 MB | A few per tenant a year |

At 100 tenants that is well under 10 GB. Volume is not the deciding factor; region, isolation and the scan are.

**The options:**

| Option | Region | Cost | For | Against |
|---|---|---|---|---|
| **A. (rec) DigitalOcean Spaces, Toronto, in production's own team** | Toronto | **US$5 a month** each for staging and production, including 250 GiB stored and 1 TiB transfer; then US$0.02 a GiB | **No new company**: the same provider, team and region as the API and database (OP2), so no new transfer and no new processor. S3 API. Per-bucket keys (since January 2025), so the API's key opens one bucket only. Versioning and lifecycle rules | Object Lock and encryption at rest are **not confirmed** from DigitalOcean's public pages — checked at B5 (below) |
| B. AWS S3, Canada (Central), Montréal | Canada | Cents a month at our size | Mature: Object Lock, tag-based access, malware scanning in place (RG3) | **A new company holding tenants' files at rest**, and AWS already holds the backups (OP6). Backing up files that live at AWS then needs a third place, because OP6's rule is that a backup is at a different company from what it protects |
| C. Cloudflare R2 | No Canadian location; an EU jurisdiction is offered | Free up to 10 GB | No transfer charges | Fails RG1 test 1 while a Canadian option exists at a similar price |
| D. The database | Toronto | Database storage | No new service | Rule 10 keeps files out of the database; dumps and restores grow with every receipt |

**Recommendation: A.** It adds nothing to the list of who holds what at rest, it is in the region already chosen, and
its cost is fixed and small. Its two unconfirmed properties are checked before B5 builds on them; if Spaces does not
encrypt at rest, B (S3 in Canada) takes its place and the file backup moves to Spaces — the same design with the two
roles swapped.

**The rules for the buckets**, in addition to AP11's (server-made keys `tenants/<tenant_id>/<kind>/<uuid>`, signed URLs
of five minutes issued only after the owning row is read under row-level security):
- **One private bucket per environment** for files, in that environment's team. No public access, no listing, **no
  CDN** — a CDN caches, and a cached receipt outlives its signed URL.
- **One key, for the API only**, scoped to that bucket by a per-bucket key. No staff member, no other job, and no model
  holds it (OP4's table gains the row).
- **Versioning on, with a lifecycle rule** that deletes a replaced or deleted version after **35 days** — the same
  window as the backups (OP6), so deletion means the same thing everywhere (ADR 0035 decision 7).
- **Served with care.** A signed URL is for one object and `GET` only. Receipts are served as downloads
  (`Content-Disposition: attachment`) with the content type we recorded, never the uploader's; nothing uploaded is ever
  served inline from a `pryvis.com` origin.
- **Rendered PDFs are verified when re-served** (R1.16a): the stored hash is checked against the bytes before the
  share page hands them out. A mismatch is refused and alerted, never served.

**Backing up the files.** OP6 backs up the database only; the files need the same protection.
- **The nightly backup job (OP6) also archives the files bucket**: every current object, in one encrypted and signed
  archive beside the database dump, at the second company under the same 35-day Object Lock. At launch size this is a
  full copy each night, so any single night's archive restores everything.
- **Trigger:** when the files bucket passes **5 GB**, the job switches to a weekly full archive with nightly
  increments, kept so that every restore point within 35 days is complete (§10). Five gigabytes copied nightly is
  about 150 GB a month of Spaces' 1 TiB transfer allowance, and 35 copies are about 175 GB in the backup store; past
  that, full nightly copies stop being the cheap choice.
- **The restore drill (OP6) restores the files too**, and checks that every file a restored row points to exists and
  matches its recorded hash.
- **The erasure ledger (OP1) records object keys as well as rows**, so a restore deletes the files of anyone erased
  since the backup was taken.

**Checked at B5, before anything is built on it** (pass or fail, recorded): Spaces in Toronto encrypts data at rest;
a per-bucket key can be limited to one bucket; versioning and the lifecycle rule behave as written; a signed URL
expires at five minutes; the price on DigitalOcean's own page.

## 4. RG3 · Uploads: type, size, scanning and duplicates

**The threat** (`docs/THREAT-MODEL.md`, "a hostile upload"): a file that harms whoever opens it — a staff member
approving a receipt, or a client viewing a PDF with the tenant's logo — or that harms our server while we read it (a
decompression bomb, an image that exploits a decoder). Rule 5: "uploads are hostile until proven".

**Two upload kinds in release 1**, and no others: the **logo** and the **deposit receipt**. Support takes no
attachments (SF5). The release-2 signed-copy upload (R1.20c) is reconsidered under ADR 0035 decision 3 and, if kept,
joins this list with its own limits.

**Every upload passes these steps, in this order, and fails closed at each:**

| Step | Logo | Deposit receipt | Why this order |
|---|---|---|---|
| 1. The route | An upload route (AP11), authenticated, rate-limited | The same | Nobody uploads anonymously |
| 2. Size, while it streams | Refused past **2 MB** | Refused past **10 MB** | Counted as bytes arrive, so a large file is refused without being held in memory |
| 3. Type, from the bytes | **PNG or JPEG only.** SVG is refused: it can carry script | **PDF, PNG or JPEG** | The file's first bytes decide, never its name or the type the browser claims |
| 4. Dimensions, from the header | At most 4,000 × 4,000 pixels | Images at most 10,000 × 10,000 | Read before decoding, so a small file that would expand to gigabytes is refused unopened |
| 5. **Malware scan** | Yes | Yes | Before anything of ours decodes the file |
| 6. **Disarm** | Decoded and **re-encoded as a new PNG**, at most 1,024 pixels wide; all metadata dropped | Images re-encoded the same way; **PDFs kept as uploaded** (below) | What we store and serve is our own output, not the uploader's bytes. Re-encoding also drops a photo's location data |
| 7. Duplicate check | — | The original's SHA-256 **and** the payment reference (R1.36) | See below |
| 8. Stored | In the files bucket (RG2), status *ready* | The same | Only now can a signed URL be issued for it |

A file that fails any step is deleted, and the person who uploaded it is told plainly which rule it broke ("we accept
PNG or JPEG logos up to 2 MB"; "we could not check this file — please upload a photo, or a PDF without a password").
A file the scanner cannot read — a password-protected PDF, an unsupported format, a scan that errors — is **refused,
not passed**.

**The scanner — the options:**

| Option | Where | Cost | For | Against |
|---|---|---|---|---|
| A. ClamAV, in our own container in production's team | Toronto | **About US$50 a month per environment**: ClamAV needs 3-4 GB of memory for its signatures, and more during its daily reload, so the 4 GiB instance size — for staging too, as OP2 requires | No new company: nothing leaves our own hosting | Doubles production's hosting estimate (OP3); detects known malware by signature only; one more service to keep patched and alive |
| **B. (rec) AWS GuardDuty Malware Protection for S3, on a quarantine bucket in Canada (Central)** | Canada | **About US$0 at launch** — each AWS account has 1,000 objects and 1 GB scanned a month free; then about US$0.09 per GB scanned plus a small charge per object | AWS maintains the engine and its signatures. Its verdict is written onto the object as a tag, and **a bucket policy can refuse to release any object not tagged clean** — so the store itself enforces "never read unscanned" | **AWS sees each upload in plain form**, briefly (at most a day, below). A new AWS account to secure. The scan takes seconds to a minute, so the upload shows "checking" first |
| C. A scanning service reached by API (various vendors) | Mostly the United States | Free tiers to tens of dollars a month | Simple to call | A new company, usually in the US, holding tenants' receipts. **VirusTotal and services like it are excluded outright**: files submitted to them are shared with their community of researchers, which would disclose tenants' financial documents |
| D. Disarm only, no scanner | — | US$0 | Re-encoding defeats most image attacks | Cannot disarm a PDF cheaply, and Rule 5 and R1.36 require a scan: changing that is the owner's decision under Rule 23, not this design's |

**Recommendation: B, with A as the fallback** if B fails its check at B5. The deciding reasons: the guarantee is
enforced by the store rather than by our code alone; the cost is near nothing at our volume, against about US$100 a
month for A across two environments; and the data stays in Canada. The cost of B is honest: AWS becomes a processor of
uploads for the minutes they wait in quarantine, and its register row says so.

**How B works:**
1. After steps 1-4, the API writes the upload to a **quarantine bucket** in a dedicated AWS account — **not** the
   backup account, whose credentials stay as narrow as OP6 made them. The object key is the AP11 key. The upload's row
   is recorded with status *checking*.
2. GuardDuty scans the object and tags it with its verdict.
3. A job (AP10) reads the tag of each upload still *checking*. The quarantine bucket's policy lets that job read an
   object's **contents only if its tag says no threats were found**.
4. **Clean:** the job disarms the file (step 6), stores the result in the files bucket (RG2), records the hashes, marks
   the upload *ready*, and deletes the quarantine copy.
   **Threat found:** the upload is marked *refused*, the quarantine copy deleted, the tenant told, and the owner
   alerted with the tenant reference and the verdict only. An audit entry records it.
   **Anything else** (unsupported, failed, no verdict within 15 minutes): *refused*, as above. Fail closed.
5. A lifecycle rule deletes **everything** in the quarantine bucket after one day, whatever happened to the job.

**Why PDFs are not disarmed in release 1.** Rewriting a PDF safely means running a PDF parser over hostile input on
our own server, which is a risk of its own; rasterising every receipt is a larger build than release 1 needs. Instead:
the scan; a download, never an inline view from our origin (RG2); and the staff console's instruction to open receipts
in the browser's own viewer. **The residual is stated:** a PDF that exploits an unknown flaw in a PDF viewer, and that
the scanner does not know, reaches a staff member's browser. Rasterising receipts is the next step if that is judged
too much.

**Duplicates (R1.36)** — a reused receipt is a fraud signal, not an inconvenience:
- the SHA-256 of the **original** upload (before re-encoding, so the same photo always gives the same hash) and the
  bank reference typed with it are recorded;
- a new receipt whose hash **or** reference matches **any** earlier manual payment — this tenant's or another's — is
  accepted but **flagged to the approver**, who sees what it matches. Across tenants the match is answered by a door
  function (the privilege model) that returns only "matches payment X", and only to staff;
- the approver decides with the flag in front of them (Rule 13). A flag never blocks on its own, because a tenant's
  honest second upload of the same receipt is common;
- A10 (payments) owns the screen and the table; this design fixes the rule.

**Logos and the PDF.** The renderer uses only the disarmed PNG. A logo changed after issue never alters an issued
document: the rendered PDF, with its hash, is the record (R1.16a).

## 5. RG4 · Error tracking

**What it is for** (OP7, SF5): an alert when a new kind of error appears or errors suddenly rise, and a way for staff
to open the error behind a support ticket's reference. It receives **AP9's redacted shape and nothing more**: the error
kind, the request id, the route's template (`/v1/quotes/:id`, never the filled-in path), the release, and stack frames
of our own code. No request bodies, headers, cookies, query strings, user names, email addresses or internet
addresses.

**The options:**

| Option | Region | Cost | For | Against |
|---|---|---|---|---|
| **A. (rec) Sentry, EU data region (Frankfurt), Developer plan** | EU | **US$0**: one user, 5,000 errors a month. Team plan US$26 a month | The standard tool; server-side scrubbing as a second net behind ours; per-project keys, so staging and production are separate (RG1 test 6) | No Canadian region; the region cannot be changed once the organisation is created, so it is chosen right the first time. One user only on the free plan |
| B. GlitchTip (Sentry-compatible), run by us in Toronto | Toronto | About US$25-40 a month per environment (a service, a database and a cache) | Nothing leaves our hosting | Another service to run, patch and back up, to protect data we have already arranged not to send |
| C. The host's logs only | Toronto | US$0 | Nothing new | No alert on a new kind of error, which OP7 requires |

**Recommendation: A.** The deciding reason is that error tracking, built as AP9 says, holds **no personal data**, so
its region is a weak concern and running our own (B) buys little. The EU region is still chosen over the US, because
a scrubbing mistake is possible and the EU is the safer place for one to land (RG1 test 1).

**How it is set up:**
- **The API only.** The web app and the share page do **not** load Sentry's browser script (RG1 test 8; Rule 20). A
  browser error is posted to our own API (`POST /v1/client-errors`, rate-limited, a fixed schema of error kind, page
  template and release), which forwards it in the same redacted shape.
- **Our redaction first, Sentry's second:** the SDK's own sending of personal data is off, every event passes our
  redactor (AP9's), Sentry's server-side scrubbing is on, and storing internet addresses is off.
- **Retention:** the plan's own retention, at most 90 days (SF7's table).
- **Two projects**, staging and production, each with its own key, held by that environment's API.

**Triggers** (§10): 80% of the monthly error allowance for two months, **or** a second staff member who needs access
(OA4) — then the Team plan.

## 6. RG5 · Uptime and heartbeats

**What is watched** (OP7):

| Check | Kind | How often | Alert |
|---|---|---|---|
| `api.pryvis.com/health/ready` | From outside | Every 3 minutes | Two failures in a row |
| `share.pryvis.com` (a fixed health path, never a real share link) | From outside | Every 3 minutes | The same |
| `pryvis.com` | From outside | Every 3 minutes | The same |
| `api.staging.pryvis.com/health/ready` | From outside | Every 3 minutes | Email only, working hours |
| **The nightly backup** (OP6, OR8) | Heartbeat: the job pings on success | Daily | No ping within 26 hours |
| **The nightly reconciliation** (A12) | Heartbeat | Daily | No ping within 26 hours |
| **The monthly restore drill** (OP6) | Heartbeat | Monthly | No ping within 35 days |

That is four monitors and three heartbeats. A check holds a URL and a name, never personal data.

**The options:**

| Option | Cost | For | Against |
|---|---|---|---|
| **A. (rec) Better Stack Uptime, free plan** | **US$0** for 10 monitors and heartbeats together, checked every 3 minutes, alerts by email and Slack. Phone and text alerts need a responder licence, about US$29-34 a month | Monitors and heartbeats in one place; a status page if wanted | Free alerts are email and Slack only; phone calls cost the licence |
| B. UptimeRobot | Free: 50 monitors every 5 minutes, but its free plan is described as for hobby and non-profit projects (§11) — **fails RG1 test 4**. Solo plan about US$9 a month | Simple; cheap paid plan | The free plan's commercial-use position is unclear, so we would pay from the start |
| C. Healthchecks.io for heartbeats, plus another service for monitors | Free for 20 heartbeats; paid US$20 a month | Strong at heartbeats | Two services where one does |
| D. DigitalOcean's own uptime checks | Included | No new company | The provider watching itself: a fault that takes down production can take down its monitor too |

**Recommendation: A**, with two honest notes. First, **its free plan's alerts are email and Slack**: OP7's "phone
notification" is met at launch by email arriving on the owner's phone, not by a call. A real call or text for a
production outage needs the responder licence; the trigger to buy it is the first paying contractor (§10), or sooner
if the owner wants it. Second, the free plan's terms are read for commercial use before the account is opened (RG1
test 4); if they forbid it, B's paid plan replaces it.

The uptime service holds no personal data, so its region is not a concern; it is listed for completeness (§9).

## 7. RG6 · The mailbox

**What it is:** one mailbox, `info@pryvis.com`, with **`support@`** (SF2) and **`privacy@`** (ADR 0035 decision 10)
as aliases. People write to it, so **it holds personal data** — whatever they choose to send, attachments included.

**The deciding requirement** (SF2, SF7): mail received, sent and deleted is **deleted automatically after 90 days**,
by a rule in the provider, not by someone remembering. Price comes second; region third, but it counts, because the
mailbox holds what clients and contractors write.

**The options:**

| Option | Cost | Automatic deletion | Region | Against |
|---|---|---|---|---|
| A. Zoho Mail, Forever Free | US$0, up to 5 users, 5 GB each | Zoho's "automatic email cleanup" deletes by age — 2, 4, 8, 10 or 12 months, so **2 months**, not 90 days. Zoho says it is being released in phases, and **does not say which plans have it** | Zoho runs a Canadian data centre; whether a free account can use it is **not confirmed** | Web and app only (no IMAP). The deciding requirement is unconfirmed on this plan |
| B. Zoho Mail Lite | About US$1-1.25 per user a month (confirm on Zoho's page) | The same cleanup, if offered on the plan | As A | As A, for a little money |
| **C. (rec) Microsoft 365 Business Basic** | About **US$6 per user a month** (annual) | Exchange's own **retention tags**: a default tag on the whole mailbox that **deletes items after 90 days**. Microsoft's newer retention policies need a dearer plan, but these older Exchange tags are a different feature. **To confirm on the plan before relying on it** | **Canada**, for a tenant whose account is set up with a Canadian address — Microsoft commits to keeping Exchange data in Canada for such tenants | US$6 a month more than A; a Microsoft account to secure |
| D. Google Workspace, Business Starter | About US$7 per user a month (annual), US$8.40 monthly | **Only with Vault**, which Starter lacks (an add-on, or the Business Plus plan) | Data regions are not offered on Starter | Fails the deciding requirement at this price |

**Recommendation: C**, set up under the **Canadian company** so that its mail rests in Canada — **a decision for the
owner**, because it ties the mailbox to the structure still being settled with the accountant and attorney (OA9,
OA10). If it is set up under the Jamaican company instead, the mail rests in Microsoft's North American region, which
the register then says. **Fallback: A**, if Zoho confirms its cleanup on the free plan and in its Canadian data centre,
with the period at 2 months.

**How it is set up** (owner action OA12, batch 2):
- one licensed mailbox, `info@`; `support@` and `privacy@` as aliases; multi-factor sign-in on (OP11);
- the 90-day deletion tag on the whole mailbox, **checked by hand once** — a message older than 90 days is gone — and
  recorded in the operations log;
- the provider's own filtering of spam and malicious attachments on. **An attachment emailed to us is never carried
  into the product**: anything that needs action becomes a ticket (SF3), written by staff;
- mail **sent by the product** goes through the transactional email provider (A6), never through this mailbox (SF2).
  The records the domain needs for both (MX for receiving, SPF, DKIM and DMARC for sending) are written out in OA11.

## 8. RG7 · The backup store, confirmed

OP6 recommended the store; this section confirms it and prices it.

**Confirmed: AWS S3, Canada (Central), in an AWS account used for nothing else,** with Object Lock in compliance mode
for 35 days and a lifecycle rule that deletes after the lock ends. The reasons are OP6's: a different company from the
live database (DigitalOcean), in Canada, with a lock nobody — not the job, not an attacker, not the owner — can lift
early.

**What it holds:** the nightly database dump and, from this design, the nightly files archive (RG2), each **encrypted
before it leaves our host** to the two keys of OP6. AWS stores ciphertext it cannot read.

**What it costs:** S3 Standard is about US$0.023 a GB a month in the US-East region; Canada (Central) is priced
slightly higher, to be read from AWS's own calculator before buying. At launch the dumps are small and the files under
1 GB, so 35 nightly copies are tens of gigabytes: **about US$1-3 a month**. Writing to S3 costs nothing in transfer;
reading back for a drill costs AWS's transfer price on a few gigabytes.

**The AWS accounts, all in the business's name, under one AWS organisation for billing:**

| Account | Holds | Who can sign in |
|---|---|---|
| Production backup | The locked backup bucket | The owner, with MFA. The backup job holds an add-only key (OP4) |
| Production upload scanning | The quarantine bucket and GuardDuty (RG3) | The owner, with MFA. The API holds a put-only key; the scan job a key that reads tags, and contents only when clean |
| Staging | Staging's backup bucket and quarantine bucket | The owner, with MFA |

The organisation's own management account holds nothing but billing. Separate accounts mean a leaked scanning key
opens nothing in the backup store, and a staging key opens nothing in production (RG1 test 6).

**Checked at B3, before the first backup is written** (pass or fail, recorded): Object Lock in compliance mode on a
bucket in Canada (Central); an add-only key cannot delete or overwrite a locked object; the lifecycle rule deletes after
the lock; the price on AWS's own page.

## 9. RG8 · The register rewritten, and the sub-processor list

**On approval, `docs/SERVICE-REGISTER.md` is rewritten for the rebuilt application** — in the same change (Rule 18;
Rule 23.5), with each row marked *chosen, not yet in use* until the build step that turns it on. The old application's
rows (Render, Neon, Vercel Hobby, the keep-warm workflow) move to a short section of their own, kept until K1 retires
`original-app/`.

**The rebuilt application's rows:**

| Service | What it does | Holds personal data | Where | Decided in | If it went away |
|---|---|---|---|---|---|
| **DigitalOcean** — App Platform, managed PostgreSQL, Spaces | The API and its job worker; the database; the files | **Yes — everything** | Toronto, Canada | OP2-OP3; RG2 | Standard containers, PostgreSQL and the S3 API: restore the backups at another provider (OP6's yearly rebuild drill proves it) |
| **Vercel** (Pro) | The site and the web app, as static files | In transit only; nothing stored (OP2) | Global edge | OP2-OP3 | Any static host |
| **AWS** — S3 and GuardDuty | The backup store (ciphertext only); the upload quarantine and its scan (plain uploads, at most one day) | Backups: encrypted, unreadable to AWS. Quarantine: **yes, briefly** | Canada (Central) | OP6; RG3; RG7 | Backups: any store with a write-once lock. Scanning: ClamAV in our own hosting (RG3 option A) |
| **Sentry** (Developer plan) | Error tracking | **No, by design** (AP9; RG4) — a scrubbing mistake is the residual | EU (Frankfurt) | RG4 | Another error tracker; the redacted shape is ours |
| **Better Stack** (free plan) | Uptime checks and heartbeats | No — URLs and check names | — | RG5 | Another monitor; the checks are plain HTTP |
| **Microsoft 365** (Business Basic) | The mailbox: `info@`, `support@`, `privacy@` | **Yes — whatever people write to us** | Canada, if set up under the Canadian company (RG6) | RG6 | Any mail provider: change the domain's MX record, export the mailbox |
| **The transactional email provider** | Codes, quotes, invoices and replies sent by the product | **Yes** — addresses and documents sent | Chosen in A6 | A6 | Behind the one messaging service (Rule 11), so a swap is one adapter |
| **Stripe**, through the Canadian company | Tenants' subscriptions by card | **Yes** — the tenant's billing details; card numbers never touch us | Canada and the United States | ADR 0033; A10 | WiPay, the fallback (ADR 0033; OA8) |
| **GitHub** (Team, the business's organisation) | Code, CI, Claude's pull requests | No — code and synthetic data only | United States | OP8 | Any git host; CI rewritten |
| **GoDaddy** | The domain's registrar | The registrant's contact details | — | — | Transfer to another registrar |
| **Anthropic** (Claude) | Claude-assisted maintenance | **Never** — redacted or synthetic only (Rule 15) | United States | Rule 15 | Human development continues |
| **WiPay** — release 2 | Our merchant account if Stripe does not work out (OA8, held); each tenant's own account for card links (R1.29, H7) | Payer details, held by WiPay | Jamaica and the Caribbean | ADR 0033; ADR 0034 | Bank transfer, recorded by hand |

**Tenants' WiPay credentials (release 2).** When H7 builds card links, each tenant's WiPay keys are stored **encrypted in
the database**, sealed with a key held in configuration and never in the database — the way `MFA_TOTP_KEYS` seals
second-factor secrets (ADR 0021). The register's secrets table and the threat model's WiPay row (C1) already say so;
this design changes nothing there, and H7's design owns the detail.

**The sub-processor list** — what a contractor is given and what the privacy notice says (ADR 0035 decisions 1 and 2;
s. 16(2)(g)). Only services that hold personal data appear:

| Sub-processor | What it does for Pryvis | Where the data is |
|---|---|---|
| DigitalOcean | Hosting, database and file storage | Canada |
| Amazon Web Services | Encrypted backups; checking uploaded files for malware | Canada |
| Microsoft | Our email inbox | Canada *(or North America — RG6's decision)* |
| The transactional email provider | Sending email | *(A6)* |
| Stripe | Subscription payments | Canada and the United States |
| Sentry | Error reports, built to contain no personal data | European Union |

All of them are United States companies (OP2's caveat): data held in Canada can still be reached by US legal process,
and the notice says so in a sentence.

**Where the secrets live**, replacing the register's §5 for the rebuilt application: every key is in the API host's
settings for its own environment (OP4), except the backup job's keys (its own job's settings) and the owner's offline
disaster key (OP11). The register names each key and its place, never its value.

## 10. RG9 · Costs, and the rows OP10 left to A5

**What this design adds, a month, at launch:**

| Piece | Production | Staging |
|---|---|---|
| Files: Spaces (RG2) | US$5 | US$5 |
| Upload scanning: GuardDuty (RG3) | About US$0, within the free allowance | About US$0 |
| Backup store: S3 (RG7) | About US$1-3 | Cents |
| Error tracking: Sentry (RG4) | US$0 | (same organisation) |
| Uptime: Better Stack (RG5) | US$0 | (same account) |
| Mailbox: Microsoft 365 (RG6) | About US$6 | — |
| **Added** | **about US$12-14** | **about US$5** |

So production moves from OP3's **about US$45-60** to **about US$57-75 a month**, and staging from about US$20-27 to
**about US$25-32**. Option A for scanning instead of B would add about **US$100 a month** across the two.

**OP10's rows that said "priced in A5", now priced** (the same rule: act at 80% for two weeks running unless stated):

| Piece | Starting plan | Its limit | Move up when | To | About |
|---|---|---|---|---|---|
| Object storage (Spaces) | US$5 base | 250 GiB stored, 1 TiB transfer | 80% of either | Pay per use | US$0.02 a GiB stored, US$0.01 a GiB transfer |
| The files archive in the nightly backup | A full copy each night | — | Files bucket past **5 GB** (RG2) | Weekly full, nightly increments | Saves transfer and storage; no new fee |
| Upload scanning (GuardDuty) | Free allowance | 1,000 objects and 1 GB a month | Past the allowance | Pay per use | About US$0.09 a GB, plus a small charge per object |
| Backup store (S3) | Pay per use | — | — | — | About US$1-3 a month at launch |
| Error tracking (Sentry) | Developer, free | 5,000 errors a month; one user | 80% for two months, **or** a second staff member needs access (OA4) | Team | US$26 a month |
| Uptime (Better Stack) | Free | 10 monitors and heartbeats; email and Slack alerts | Phone or text alerts wanted — **at the latest, the first paying contractor** — or more than 10 checks | A responder licence; more monitors | About US$29-34 a month; about US$21-25 per 50 monitors |
| Mailbox (Microsoft 365) | One user | One person reading it | A second staff member reads support (OA4) | A second licence, or a shared mailbox | About US$6 a month a user |

## 11. What gets built, tests, what this does not do, owner actions, and sources

**The decisions put to the owner** — each recommendation, and the one choice that is the owner's alone:

| # | Decision | Recommended |
|---|---|---|
| RG1 | The nine tests every service must meet | As written |
| RG2 | File storage | DigitalOcean Spaces in Toronto, with the files archived in the nightly backup |
| RG3 | Upload security and the scanner | The eight steps; AWS GuardDuty on a quarantine bucket in Canada, ClamAV as the fallback; **PDF receipts not disarmed in release 1, with the residual accepted** |
| RG4 | Error tracking | Sentry, EU region, free plan, API only |
| RG5 | Uptime and heartbeats | Better Stack free; phone alerts bought at the first paying contractor at the latest |
| RG6 | The mailbox | Microsoft 365 Business Basic — **and which company holds it: the Canadian one (mail in Canada) or the Jamaican one** |
| RG7 | The backup store | AWS S3 in Canada, three AWS accounts as listed |
| RG8 | The register rewritten, and the sub-processor list | As written |
| RG9 | The costs and triggers | As written |

**What gets built, and when:**
- **On approval (this step, A5):** `docs/SERVICE-REGISTER.md` rewritten (RG8); OP10's table in
  `docs/design/environments-and-operations.md` carries a dated pointer to §10 here; `docs/DATA-PROTECTION-READING.md`
  §5's table and `docs/THREAT-MODEL.md`'s hostile-upload row point here; OA6 and OA12 name the services (below).
- **B3 — monitoring and resilience:** Sentry's two projects and the redactor in front of it; the browser-error route;
  Better Stack's checks and three heartbeats; the AWS organisation and its accounts; the backup bucket under Object
  Lock (RG7's check first); the files archive in the nightly backup; the drill restoring files and checking their
  hashes.
- **B5 — file storage and malware scanning:** the Spaces buckets and per-bucket keys (RG2's check first); the
  quarantine bucket, GuardDuty and its policy (RG3's check first); the upload route kind with steps 1-8; the scan job;
  the disarming of images; the hashes recorded; AP11's storage port.
- **A6** chooses the transactional email provider, and fills its row here. **A10** builds the duplicate flag's screen
  and table on RG3's rule.

**Tests, each proved with a planted defect:**
- **Never read unscanned** (RG3): a read of a quarantine object with the scan job's key before its tag says clean is
  refused by the bucket. Plant: the policy's tag condition removed — the read succeeds, and the test fails.
- **Fail closed** (RG3): a verdict other than clean, and no verdict within 15 minutes, both leave the upload *refused*.
  Plant: the job treating "unsupported" as clean.
- **Type from the bytes** (RG3 step 3): an SVG named `logo.png`, and a PDF sent as a logo, are refused. Plant: the check
  reading the file name.
- **Size while streaming** (step 2): an 11 MB receipt is refused before it is read in full, with memory bounded. Plant:
  the limit checked after buffering.
- **Decompression bomb** (step 4): a small PNG declaring 50,000 × 50,000 pixels is refused before decoding. Plant: the
  dimension check removed.
- **Disarm** (step 6): a JPEG carrying location data is stored as a PNG with no metadata. Plant: the original stored
  instead.
- **Duplicates** (RG3): the same receipt from two tenants is flagged, and the door function returns only the matching
  payment's id. Plant: the door returning the other tenant's name.
- **Rendered PDFs verified on re-serve** (RG2; R1.16a): a stored PDF altered by one byte is refused and alerted. Plant:
  the hash check skipped.
- **Receipts are never inline** (RG2): a signed URL for a receipt carries the attachment disposition and our recorded
  type. Plant: the uploader's type passed through.
- **Error events carry nothing personal** (RG4): synthetic errors carrying an email address, a name, a cookie and a
  filled-in path come out of the redactor with none of them. Plant: the redactor bypassed for one field.
- **No third-party script** (RG1 test 8): the web app's build contains no Sentry or other third-party script, as the
  site's guard already checks for the site. Plant: the browser SDK imported.
- **Files survive a restore** (RG2): the drill finds every file a restored row points to, with a matching hash, and a
  file erased after the backup is gone after the restore. Plant: the ledger's object keys not replayed.
- **The heartbeats alert** (RG5): a backup that does not run raises the alert. Plant: the job's ping removed (OP7's test).
- **By hand, once, and recorded** (provider settings, not our code): the mailbox's 90-day deletion (RG6); Object Lock
  refusing a delete (RG7); a per-bucket key refused on another bucket (RG2).

**What this does not do (Rule 21.4):**
- **It does not choose the transactional email provider** (A6) or design the payments screens (A10).
- **It does not settle the legal question.** Canada is the strongest place offered, not a certainty; every provider here
  is a United States company (OP2's caveat), and the Commissioner (OA22) and the attorney decide.
- **AWS sees uploads in plain form** for the minutes they wait in quarantine (RG3). That is a choice, made for the
  store-enforced guarantee and the cost; option A avoids it for about US$100 a month.
- **Error tracking sits in the EU, not Canada**, and its "no personal data" rests on our redactor and Sentry's scrubbing
  together. A mistake in both reaches Frankfurt.
- **PDF receipts are not disarmed** (RG3). A PDF that exploits an unknown viewer flaw and is unknown to the scanner
  reaches a staff member's browser.
- **The scanner knows only what it knows.** A signature or model scan catches known and common malware, not a targeted
  file built for us.
- **Free plans change their terms.** Sentry's, Better Stack's and Zoho's free plans are read for commercial use when each
  account is opened (RG1 test 4), and the quarterly figures (OP12) are the place a change is noticed.
- **Several capabilities are unconfirmed from public pages** and are checked before the build relies on them: Spaces'
  encryption at rest (B5); Microsoft's retention tags on Business Basic and its Canadian residency for the chosen
  company (OA12); Zoho's cleanup on its free plan, if the fallback is used; AWS prices in Canada (B3).

**Owner actions** (`docs/OWNER-ACTIONS.md`), updated on approval — **no new action**, two made precise:
- **OA6** (batch 1) names the accounts: DigitalOcean Spaces is part of OA1's DigitalOcean account; **an AWS organisation
  with three accounts** (RG7); **Sentry** (EU region, chosen when the organisation is created); **Better Stack**. Each in
  the business's name, with MFA (OA24).
- **OA12** (batch 2) names the mailbox: **Microsoft 365 Business Basic**, held by the company the owner chooses in RG6,
  with the 90-day deletion tag, and `support@` and `privacy@` as aliases.

**Sources** (checked 2026-10-09; third-party summaries are confirmed on each vendor's page before buying):
- DigitalOcean: [Spaces in Toronto](https://www.digitalocean.com/blog/digitalocean-spaces-now-available-in-toronto);
  [Spaces pricing](https://www.digitalocean.com/pricing/spaces-object-storage);
  [per-bucket keys](https://www.digitalocean.com/blog/spaces-bucket-keys);
  [Spaces features](https://docs.digitalocean.com/products/spaces/details/features/);
  [App Platform pricing](https://www.digitalocean.com/pricing/app-platform).
- AWS: [GuardDuty Malware Protection for S3 pricing](https://docs.aws.amazon.com/guardduty/latest/ug/pricing-malware-protection-for-s3-guardduty.html)
  and [its 2025 price reduction](https://aws.amazon.com/about-aws/whats-new/2025/02/amazon-guardduty-malware-protection-s3-price-reduction);
  [S3 pricing](https://aws.amazon.com/s3/pricing/).
- ClamAV: [running in Docker](https://docs.clamav.net/manual/Installing/Docker.html), with its memory needs.
- Sentry: [data storage location](https://docs.sentry.io/organization/data-storage-location/); plans
  ([costbench](https://costbench.com/software/developer-tools/sentry/free-plan/)).
- Better Stack: [pricing](https://betterstack.com/pricing). UptimeRobot: [pricing](https://uptimerobot.com/pricing/),
  and its free plan's commercial-use position ([notifier](https://notifier.so/guides/uptimerobot-pricing-2026/)).
  Healthchecks.io: [pricing](https://healthchecks.io/pricing/).
- Zoho Mail: [automatic email cleanup](https://prezohoweb.zoho.com/mail/help/adminconsole/automatic-email-cleanup.html);
  the free plan ([codroid](https://codroiditlabs.com/is-zoho-mail-free/)).
- Microsoft: [Exchange retention tags and policies](https://learn.microsoft.com/nl-nl/exchange/security-and-compliance/messaging-records-management/retention-tags-and-policies);
  [Exchange Online limits](https://learn.microsoft.com/en-us/office365/servicedescriptions/exchange-online-service-description/exchange-online-limits);
  Canadian data residency ([summary](https://kurtsh.com/2026/01/13/info-microsoft-365-commercial-data-residency/)).
- Google Workspace: [data regions by edition](https://knowledge.workspace.google.com/admin/compliance/compare-data-region-features-across-google-workspace-editions);
  pricing ([emailvendorselection](https://www.emailvendorselection.com/google-workspace-pricing/)).
