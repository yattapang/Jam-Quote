# Design: the third-party register completed — file storage, malware scanning, error tracking, uptime, the mailbox

**Status: APPROVED by the owner, 2026-10-09 — every recommendation, RG1-RG9** ("Approved"), with the owner's two
choices: **the Canadian company holds the mailbox** (RG6), and **the PDF residual is accepted** for release 1 (RG3).
**Amended the same day to answer its independent read (RR1-RR17, §12)**. Two amendments changed what the owner had
approved, and **the owner decided both on 2026-10-09**: PDF receipts are **rasterised** in the files worker (RG3, RR2),
and uptime is **UptimeRobot's Solo plan** (RG5, RR6). **The owner signed off the step, amendments included, on
2026-10-09** ("A5 is done"); A5 is ticked in the build plan. Build plan step A5
(`docs/BUILD-PLAN.md`). Written section by section and saved as it went, as A4 was. Nothing here is
built or bought before its build step; the accounts are owner actions OA6 (batch 1) and OA12 (batch 2).

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
12. The independent read, and where each finding is answered

## 1. The problem

The register (`docs/SERVICE-REGISTER.md`) describes the **old** application: Render, Neon and Vercel's Hobby plan, the
old email set-up, and WiPay as the payment path. Since it was written the owner has decided that production runs in
Toronto on DigitalOcean (OP2), that subscriptions go through Stripe under the Canadian company (ADR 0033), and that
WiPay card links wait for release 2 (ADR 0034). The register has not caught up, and Rule 18 says a service in production
and missing from it is a defect.

Five services that release 1 cannot do without have **no row at all** — the register's §3a names two of them on
purpose, and the other three are named only in the designs that need them *(RR17)*:

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
| **A. (rec) DigitalOcean Spaces, Toronto, in production's own team** | Toronto | **US$5 a month** each for staging and production, including 250 GiB stored and 1 TiB transfer; then US$0.02 a GiB | **No new company**: the same provider, team and region as the API and database (OP2), so no new transfer and no new processor. S3 API. Per-bucket keys (since January 2025), so the API's key opens one bucket only. Time-based lifecycle expiry | Encryption at rest is **not confirmed** from DigitalOcean's public pages — checked at B5. **Object Lock and expiry of old versions are not offered** (its S3-compatibility page lists lifecycle "for time-based expiration and removing incomplete multipart uploads" only) *(RR5)*. Keys come only as "Read" or "Read/Write/Delete", made in the control panel *(RR4)* |
| B. AWS S3, Canada (Central), Montréal | Canada | Cents a month at our size | Mature: Object Lock, tag-based access, malware scanning in place (RG3) | **A new company holding tenants' files at rest**, and AWS already holds the backups (OP6). Backing up files that live at AWS then needs a third place, because OP6's rule is that a backup is at a different company from what it protects |
| C. Cloudflare R2 | No Canadian location; an EU jurisdiction is offered | Free up to 10 GB | No transfer charges | Fails RG1 test 1 while a Canadian option exists at a similar price |
| D. The database | Toronto | Database storage | No new service | Rule 10 keeps files out of the database; dumps and restores grow with every receipt |

**Recommendation: A.** It adds nothing to the list of who holds what at rest, it is in the region already chosen, and
its cost is fixed and small. **If Spaces does not encrypt at rest** (checked at B5), the answer is not to move the
files *(RR5)*: the files worker (RG3) **encrypts each object itself before storing it**, with a key held in configuration
and never beside the files — the way `MFA_TOTP_KEYS` seals second-factor secrets (ADR 0021) — and decrypts it when it
is served. Nothing else in this design changes. (The earlier fallback, swapping the files to S3 and their backup to
Spaces, is withdrawn: Spaces has no Object Lock, so the backup would lose OP6's lock.)

**The rules for the buckets**, in addition to AP11's (server-made keys `tenants/<tenant_id>/<kind>/<uuid>`, signed URLs
of five minutes issued only after the owning row is read under row-level security):
- **One private bucket per environment** for files, in that environment's team. No public access, no listing, **no
  CDN** — a CDN caches, and a cached receipt outlives its signed URL.
- **Three keys, each named in OP4, and no others** *(RR4)*. Spaces offers only "Read" or "Read/Write/Delete":
  - **the API's** read/write/delete key: it writes rendered PDFs, signs download URLs, and deletes files on erasure;
  - **the files worker's** read/write/delete key (RG3), which stores disarmed uploads — a separate key, so either can
    be rotated or revoked alone;
  - **the backup job's** read key (below).
  No staff member and no model holds any of them. Spaces makes keys only in its control panel, so each is made by the
  owner (OA6) and rotated on OP11's calendar.
- **Versioning off** *(RR5)*. Spaces cannot expire old versions, so with versioning on, a deleted or replaced file
  would survive for ever as an old version, breaking ADR 0035 decision 7. Recovery from a mistaken delete comes from the
  nightly backups instead, which keep 35 days. So a deleted file is gone from the bucket at once, and from the backups
  within 35 days — the same window as everything else.
- **Served with care.** A signed URL is for one object and `GET` only. Receipts are served as downloads
  (`Content-Disposition: attachment`) with the content type we recorded, never the uploader's; nothing uploaded is ever
  served inline from a `pryvis.com` origin.
- **Rendered PDFs are verified when re-served** (R1.16a): the stored hash is checked against the bytes before the
  share page hands them out. A mismatch is refused and alerted, never served.

**Backing up the files.** OP6 backs up the database only; the files need the same protection.
- **The nightly backup job (OP6) also archives the files bucket**, with its read key: every current object, in one
  encrypted and signed archive beside the database dump, at the second company under the same 35-day Object Lock. At
  launch size this is a full copy each night, so any single night's archive restores everything.
- **Trigger:** when the files bucket passes **5 GB**, the job switches to a **rolling copy** *(RR14)*: each night it
  copies, encrypted and signed, every file that is new **or whose newest backup copy is more than 28 days old**, each
  copy locked for 35 days. So every live file always has a copy younger than 35 days, and a deleted file's last copy
  expires within 35 days — both promises kept. (A weekly full archive with nightly increments, as first written, cannot
  keep both: the oldest restore point would need a full archive up to 42 days old.) Five gigabytes copied nightly is
  about 150 GB a month of Spaces' 1 TiB transfer allowance; the rolling copy moves about a quarter of the files a week.
- **The restore drill (OP6) restores the files too**, into a **standing drill bucket** in production's team, with its
  own read/write/delete key that, like OP6's drill key, is released only to an approved drill run *(RR4)*. A lifecycle
  rule empties that bucket one day after anything is written, and the drill empties it when it ends. The drill checks
  that every file a restored row points to exists and matches its recorded hash.
- **The erasure ledger (OP1) records object keys as well as rows**, so a restore deletes the files of anyone erased
  since the backup was taken.

**Every copy of a file, and its lifetime** — OP1's "complete list" of copies, extended to files *(RR4)*:

| Copy | Where | Lifetime |
|---|---|---|
| The upload, before it is scanned | The quarantine bucket (RG3) | Until the scan job finishes; at most about two days, by the lifecycle rule |
| The stored file | The files bucket | Until the tenant or an erasure deletes it; no old versions |
| The nightly archives, or rolling copies | The backup store (RG7) | 35 days |
| The drill's restored files | The standing drill bucket | Hours; at most a day |

**Checked at B5, before anything is built on it** (pass or fail, recorded): Spaces in Toronto encrypts data at rest
(if not, the files worker encrypts, above); a "Read" per-bucket key can read and not write, and opens no other bucket;
the drill bucket's one-day expiry works; a signed URL expires at five minutes; the price on DigitalOcean's own page.

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
| 4. Dimensions, from the header | At most 4,000 × 4,000 pixels | Images at most 6,000 × 6,000 (a phone photo is about 4,000 × 3,000) | Read before decoding, so a small file that would expand to gigabytes is refused unopened |
| 5. **Malware scan** | Yes | Yes | Before anything of ours decodes the file |
| 6. **Disarm**, in the files worker (below), never in the API | Decoded and **re-encoded as a new PNG**, at most 1,024 pixels wide; all metadata dropped | Images re-encoded **at their own size**, so small print stays legible *(RR16)*; metadata dropped. PDFs: see "PDF receipts" below | What we store and serve is our own output, not the uploader's bytes. Re-encoding also drops a photo's location data |
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
| **B. (rec) AWS GuardDuty Malware Protection for S3, on a quarantine bucket in Canada (Central)** | Canada | **About US$0 at launch** — each AWS account has 1,000 objects and 1 GB scanned a month free; then about US$0.09 per GB scanned plus a small charge per object | AWS maintains the engine and its signatures. Its verdict is written onto the object as a tag, and **a bucket policy can refuse to release any object not tagged clean** — so the store itself enforces "never read unscanned" | **AWS sees each upload in plain form**, briefly (about two days at most, below). A new AWS account to secure. The scan takes seconds to a minute, so the upload shows "checking" first |
| C. A scanning service reached by API (various vendors) | Mostly the United States | Free tiers to tens of dollars a month | Simple to call | A new company, usually in the US, holding tenants' receipts. **VirusTotal and services like it are excluded outright**: files submitted to them are shared with their community of researchers, which would disclose tenants' financial documents |
| D. Disarm only, no scanner | — | US$0 | Re-encoding defeats most image attacks | Cannot disarm a PDF cheaply, and Rule 5 and R1.36 require a scan: changing that is the owner's decision under Rule 23, not this design's |

**Recommendation: B, with A as the fallback** if B fails its check at B5. The deciding reasons: the guarantee is
enforced by the store rather than by our code alone; the cost is near nothing at our volume, against about US$100 a
month for A across two environments; and the data stays in Canada. The cost of B is honest: AWS becomes a processor of
uploads for the minutes they wait in quarantine, and its register row says so.

**The files worker — where hostile bytes are decoded** *(RR1)*. Decoding an image is where a decoder exploit runs,
and the scanner only knows the malware it knows. So decoding never happens in the API, which holds the database login,
the MFA sealing keys, the console's approval-signing key, the GitHub App key and the deploy tokens (OP4). It happens in
a **separate container** in the same team — the files worker — which holds only:
- the quarantine read key (tag-gated, below) and permission to delete quarantine objects;
- its own files-bucket key (RG2);
- a database login that can call **one door function**, which records an upload's verdict and hashes, and nothing else
  (the privilege model's pattern: a narrow `SECURITY DEFINER` door, owned by its own role).

A decoder exploit in the worker can reach quarantined uploads, the files bucket and that one door — not production's
secrets, other tenants' rows, or the deploy path. **That residual is stated:** such an exploit could read or replace
stored files. The worker is the smallest App Platform size that decodes a 6,000 × 6,000 image within memory, about
**US$10-12 a month per environment** (1 GiB), with the decoder's own pixel limit set as a second net below step 4.

**How B works:**
1. After steps 1-4, the API writes the upload to a **quarantine bucket** in a dedicated AWS account — **not** the
   backup account, whose credentials stay as narrow as OP6 made them. The bucket is **unversioned**, so a delete
   leaves no old version behind *(RR11)*. The object key is the AP11 key. The upload's row is recorded with status
   *checking*. The API's key there is **`s3:PutObject` and nothing else** — no tagging permission — and the API sets no
   tags at upload *(RR3)*.
2. GuardDuty scans the object and tags it with its verdict.
3. The files worker (above) reads the tag of each upload still *checking*. The quarantine bucket's policy carries
   **both of AWS's statements** *(RR3)*:
   - **NoReadUnlessClean**: nobody but GuardDuty's own role may read an object's contents unless its
     `GuardDutyMalwareScanStatus` tag is `NO_THREATS_FOUND`;
   - **OnlyGuardDutyCanTagScanStatus**: nobody but GuardDuty's role may set that tag.

   And because the accounts sit in an AWS organisation, an **organisation policy** forbids modifying that tag
   everywhere except by GuardDuty, as AWS requires for organisations. So no key of ours — the API's, the worker's, or
   the owner's — can mark an unscanned object clean.
4. **Clean:** the worker disarms the file (step 6), stores the result in the files bucket (RG2), records the hashes
   through its door, and deletes the quarantine copy (its key has `s3:DeleteObject` there, declared in OP4).
   **Threat found:** the upload is marked *refused*, the quarantine copy deleted, the tenant told, and the owner
   alerted with the tenant reference and the verdict only. An audit entry records it.
   **Anything else** (unsupported, failed, no verdict within 15 minutes): *refused*, as above. Fail closed.
5. A lifecycle rule expires **everything** in the quarantine bucket after one day, whatever happened to the job. AWS
   rounds expiry to the next midnight UTC and may remove objects later still, so an abandoned upload can wait **about
   two days**, not one *(RR11)*.

**PDF receipts** *(RR2)*. The residual the owner accepted was stated too narrowly, and it is restated here for the
owner to decide again:
- a receipt served as a download opens in the computer's **default PDF program** (Acrobat, for example), not
  necessarily the browser's sandboxed viewer, and nothing enforces "use the browser";
- a PDF can harm without any exploit: **PDF JavaScript** in desktop readers, **embedded files**, **launch actions**,
  and **links to phishing pages**;
- the person opening receipts in release 1 is **the owner, who holds every administrator account** — production's
  team, the AWS organisation, the disaster key — so a compromise there is the worst one available.

| Option | What staff see | Cost | Residual |
|---|---|---|---|
| A. As approved: the PDF as uploaded, as a download | The original PDF, in whatever opens it | — | All of the above |
| **B. (rec) Rasterised in the files worker** | **Images of the receipt's pages**, made in the files worker (which holds no secrets of value, RR1) and shown in the console like any image receipt. The original PDF is kept as evidence, and downloadable only through a deliberate "download original", which warns and is audit-logged | A PDF renderer in the files worker; no new service | A PDF that exploits the **renderer** reaches only the worker (RR1's residual). Staff never open the original unless they choose to |
| C. Refuse PDFs; accept only photos or screenshots | Images only | — | None from PDFs; a bank's PDF statement must be screenshotted first, which is friction for every tenant |

**Recommendation: B** — the isolation that RR1 requires anyway makes rasterising cheap, and it removes the residual
from the person with the most to lose. **Decided by the owner, 2026-10-09: B** ("Rasterise"). The earlier acceptance
of A is superseded.

Bank PDFs restricted with an owner password may be reported by GuardDuty as unsupported and refused; that is
checked at B5 with real samples from Jamaican banks' statement exports *(RR16)*.

**Duplicates (R1.36)** — a reused receipt is a fraud signal, not an inconvenience:
- the SHA-256 of the **original** upload and the bank reference typed with it are recorded;
- **the limits, stated** *(RR15)*: the hash catches only a byte-identical file — the same file uploaded twice. A photo
  re-saved, cropped or forwarded through WhatsApp has different bytes and is not caught. The reference is compared
  after normalising it (case, spaces and punctuation removed), and references shorter than four characters or on a
  short list of common words ("cash", "deposit", "transfer") are never matched;
- **the match is made in the staff console, not in the tenant's context** *(RR15)*: when staff open a payment for
  approval, the console asks a door function — called with the staff member's capability, outside any tenant — whether
  the hash or reference matches another manual payment, and shows the match there. **Nothing is written to a row the
  tenant can read**, so no other tenant's payment id ever reaches a tenant;
- the approver decides with the match in front of them (Rule 13). A match never blocks on its own, because a tenant's
  honest second upload of the same receipt is common, and approval already requires the bank statement (R1.34);
- A10 (payments) owns the screen and the door; this design fixes the rule.

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
  browser error is posted to our own API, which forwards it in the same redacted shape. **That route** *(RR9)*:
  - is declared `@PublicRoute("browser error reports, including from the unauthenticated share page")`, with a tight
    per-IP rate limit;
  - accepts **only closed lists**: the page as one of a fixed set of page templates, never a path (a share page's real
    path carries its token, which AP9 calls a credential), and the error kind from a fixed set — SF5's rule, applied to
    both fields. Anything else is dropped;
  - forwards at most **500 browser reports a month** in total; past that it counts them in our own log and forwards
    nothing more, so an unauthenticated caller cannot use up the plan and blind the "new kind of error" alert.
- **Our redaction first, Sentry's second:** the SDK's own sending of personal data is off; **tracing is off, and the
  SDK's default integrations are off** — breadcrumbs of outgoing requests would carry signed-URL query strings *(RR10)*;
  every event passes our redactor (AP9's); Sentry's server-side scrubbing is on; storing internet addresses is off.
- **Retention:** the plan's own retention, at most 90 days (SF7's table).
- **Two projects**, staging and production, each with its own key, held by that environment's API.
- **What stays in the US** *(RR8)*: Sentry stores error events in Frankfurt, but keeps account details, organisation
  settings, audit logs and project keys in the US, and may process data from elsewhere under its agreement. The
  sub-processor list says "error events at rest in the EU".

**Staff reach an error only through the console** *(RR7)*. SF5 decided that staff open the error behind a ticket
"through the console, which checks answer_support and records the access" (finding SR10). Sentry's API, which that
link needs, is on its **Team plan and above, not Developer**. So:
- until the console's support screens are built (E1-E2), only the owner signs in to Sentry, as its administrator;
- **when that link is built, the Team plan is bought** (US$26 a month) and its read-only token is declared in OP4,
  held by the production API;
- **no Sentry login is ever given to other staff**: a seat would bypass the capability check and the access record.
  The earlier trigger "a second staff member needs access" is withdrawn.

**Trigger** (§10): 80% of the monthly error allowance for two months, **or** the console's error link being built —
then the Team plan.

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

**OP7's second backup check** *(RR13)*: besides the heartbeat, OP7 alerts when "the newest backup [is] older than 26
hours", read from the store itself, so that a job that pings but writes nothing is caught. It runs as a small job in
the production API's worker each morning, with a **list-only key** on the backup bucket (`s3:ListBucket`, nothing
else: it sees names and dates, never contents), declared in OP4. It alerts the owner by email.

**The options:**

| Option | Cost | For | Against |
|---|---|---|---|
| A. Better Stack Uptime, free plan *(approved, then found to be "Free for personal projects", RR6)* | **US$0** for 10 monitors and heartbeats together, checked every 3 minutes, alerts by email and Slack. Phone and text alerts need a responder licence, about US$29-34 a month | Monitors and heartbeats in one place; a status page if wanted | Free alerts are email and Slack only; phone calls cost the licence |
| **B. (rec, amended) UptimeRobot, Solo plan** | About **US$9 a month**: heartbeats included, checks every 60 seconds, push notifications by its app; voice and text credits extra. Its free plan (50 monitors every 5 minutes) is also allowed for business use by its own terms | Commercial use explicit in its terms; one service for monitors and heartbeats | A paid plan from day one, though a small one |
| C. Healthchecks.io for heartbeats, plus another service for monitors | Free for 20 heartbeats; paid US$20 a month | Strong at heartbeats | Two services where one does |
| D. DigitalOcean's own uptime checks | Included | No new company | The provider watching itself: a fault that takes down production can take down its monitor too |

**The approved recommendation was A. The read found RG1 test 4 applied backwards** *(RR6)*, and the vendors' own pages
confirm it (read 2026-10-09):
- **Better Stack's** pricing page labels its free plan **"Free for personal projects"**. Its paid plans begin at about
  US$21-25 a month for monitors, plus about US$29-34 a month for a responder licence for phone and text alerts.
- **UptimeRobot's** own terms (updated June 2026) say it **"is available for any use, including commercial and business
  use"**; the "hobby and non-profit" wording came from a third-party summary. Its Solo plan, about **US$9 a month**,
  includes heartbeat monitors and checks every 60 seconds; its mobile app's push notifications come with every plan, and
  voice and text credits are bought separately.

**Amended recommendation: B, UptimeRobot's Solo plan, from the start** (about US$9 a month): commercial use is
explicit, heartbeats are included, and checks are faster. Whether heartbeats are on its free plan is read differently
by different pages, so the design does not rely on it. OP7's "phone notification" is met by the app's push
notification; voice calls are bought as credits if the owner wants them. **Decided by the owner, 2026-10-09: UptimeRobot's Solo
plan**, replacing the approved Better Stack.

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

**Recommendation: C**, set up under the **Canadian company** so that its mail rests in Canada. **Decided by the owner,
2026-10-09: the Canadian company holds the mailbox.** It ties the mailbox to the structure still being settled with the
accountant and attorney (OA9, OA10); if their advice moves it to the Jamaican company, the mail would rest in
Microsoft's North American region, and the register and the sub-processor list change with it. **Fallback: A**, if
Microsoft's retention tags fail their check on Business Basic and Zoho confirms its cleanup on the free plan and in its
Canadian data centre, with the period at 2 months.

**How it is set up** (owner action OA12, batch 2):
- **the Microsoft tenant is created with Canada as its country**, by the Canadian company. The residency commitment
  applies "if Customer provisions its tenant in Canada", and covers mailbox content **at rest**; moving the tenant later
  is a migration, not a setting *(RR12, RR8)*;
- one licensed mailbox, `info@`; `support@` and `privacy@` as aliases; multi-factor sign-in on (OP11);
- **the deletion, set so the whole path is at most 90 days** *(RR12)*. Microsoft's service description marks retention
  tags available on Business Basic. But an item a tag deletes stays in "Recoverable Items" for 14 days by default (up
  to 30), so:
  - a default tag on the whole mailbox with the **Permanently Delete** action at **76 days**, so that 76 plus the 14-day
    recoverable window is 90;
  - the recoverable window left at its 14-day default — it can be raised to 30, which would break the 90, so it is
    never raised (the closing check's note);
  - **users cannot opt out**: "Never Delete" is a system tag that cannot be removed, and users may apply tags by
    default, so the role that lets a user choose their own retention tags is removed from every mailbox user;
- **checked by hand twice and recorded** in the operations log: at set-up, that the tag and the role restriction are in
  place; and **on the operations calendar 91 days after mail starts arriving**, that a message older than 90 days is
  gone — it cannot be proved sooner;
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
| Production backup | The locked backup bucket | The owner, with MFA. The backup job holds an add-only key; the morning backup-age check a list-only key (RG5; OP4) |
| Production upload scanning | The quarantine bucket (unversioned) and GuardDuty (RG3) | The owner, with MFA. The API holds a `PutObject`-only key; the files worker a key that reads tags, reads contents only when clean, and deletes. Both of AWS's bucket-policy statements, and the organisation policy reserving the scan tag to GuardDuty *(RR3)* |
| Staging | Staging's backup bucket and quarantine bucket; SES, **kept in the sandbox** (A6) | The owner, with MFA |
| *(Added by A6, 2026-10-09)* Production email | SES in Canada (Central): its configuration sets, SES tenants and SNS event topics (`docs/design/outbound-messaging.md` MS3) | The owner, with MFA. The production API's job worker holds a key that can only send through those configuration sets |

The organisation's own management account holds nothing but billing and the organisation policy that reserves the `GuardDutyMalwareScanStatus` tag to GuardDuty (RR3). Separate accounts mean a leaked scanning key
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
| **DigitalOcean** — App Platform, managed PostgreSQL, Spaces | The API and its job worker; the files worker (RG3); the database; the files | **Yes — everything** | Toronto, Canada | OP2-OP3; RG2 | Standard containers, PostgreSQL and the S3 API: restore the backups at another provider (OP6's yearly rebuild drill proves it) |
| **Vercel** (Pro) | The site and the web app, as static files | In transit only; nothing stored (OP2) | Global edge | OP2-OP3 | Any static host |
| **AWS** — S3 and GuardDuty | The backup store (ciphertext only); the upload quarantine and its scan (plain uploads, about two days at most) | Backups: encrypted, unreadable to AWS. Quarantine: **yes, briefly** | Canada (Central) | OP6; RG3; RG7 | Backups: any store with a write-once lock. Scanning: ClamAV in our own hosting (RG3 option A) |
| **Sentry** (Developer plan) | Error tracking | **No, by design** (AP9; RG4) — a scrubbing mistake is the residual | Error events at rest in the EU (Frankfurt); account data and settings in the US | RG4 | Another error tracker; the redacted shape is ours |
| **UptimeRobot** (Solo; the owner's decision after RR6) | Uptime checks and heartbeats | No — URLs and check names | — | RG5 | Another monitor; the checks are plain HTTP |
| **Microsoft 365** (Business Basic) | The mailbox: `info@`, `support@`, `privacy@` | **Yes — whatever people write to us** | Mailbox content at rest in Canada, for a tenant provisioned in Canada by the Canadian company (RG6) | RG6 | Any mail provider: change the domain's MX record, export the mailbox |
| **The transactional email provider** — *Amazon SES in Canada (Central), chosen in A6 (`docs/design/outbound-messaging.md` MS3), 2026-10-09* | Codes, quotes, invoices and replies sent by the product | **Yes** — addresses, and each message while it is delivered | Canada (Central) | A6 | Behind the one messaging service (Rule 11), so a swap is one adapter |
| **The Canadian company** (Solvnow, ADR 0033) | Holds the mailbox's Microsoft account (RG6), and sells subscriptions through Stripe | **Yes** — support mail, including what clients write; tenants' billing details | Canada | RG6; ADR 0033 | The mailbox moves to the Jamaican company's own Microsoft tenant: a migration |
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

| Sub-processor | What it does for Pryvis | Where the data rests | Where it may be processed |
|---|---|---|---|
| DigitalOcean | Hosting, database and file storage | Canada | Under its terms, which allow support and administration from elsewhere |
| Amazon Web Services | Encrypted backups; checking uploaded files for malware | Canada | Under its terms |
| **The Canadian company** (Solvnow) | Holds our email inbox's account, and sells subscriptions | Canada | Canada |
| Microsoft, for the Canadian company | Our email inbox | Canada | Under its terms, including outside Canada |
| Vercel | Delivers the website and web app; **data passes through, nothing is stored** | — | Its global network |
| Amazon Web Services (SES) — *chosen in A6* | Sending email | Canada (messages in transit; bounced addresses) | Under its terms |
| Stripe | Subscription payments | Canada and the United States | Under its terms |
| Sentry | Error reports, built to contain no personal data | European Union (error events) | The United States for account data |

*(Amended after the read, RR8: the Canadian company and Vercel added — OP2 lists Vercel for the registration and the
notice; locations qualified as "at rest", because ADR 0035 decision 1 promises "the countries they operate in", and
Microsoft's and Sentry's commitments are about storage, not every place data is processed. Each "under its terms" is
replaced by the countries the provider's own terms name before the notice is published (E6). The Canadian company's
role — processor of Pryvis's support mail, and seller of subscriptions — goes to the attorney with OA10.)*

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
| The files worker (RG3, RR1) | About US$10-12 | About US$10-12 |
| Upload scanning: GuardDuty (RG3) | About US$0, within the free allowance | About US$0 |
| Backup store: S3 (RG7) | About US$1-3 | Cents |
| Error tracking: Sentry (RG4) | US$0 | (same organisation) |
| Uptime: UptimeRobot Solo (RG5, RR6) | About US$9 | (same account) |
| Mailbox: Microsoft 365 (RG6) | About US$6 | — |
| **Added** | **about US$31-35** | **about US$15-17** |

So production moves from OP3's **about US$45-60** to **about US$76-95 a month**, and staging from about US$20-27 to
**about US$35-44** *(amended after the read: the files worker, RR1, and the uptime plan, RR6; the approved figures were
US$57-75 and US$25-32)*. Option A for scanning instead of B would add about **US$80-100 a month** across the two
(ClamAV would run in the files worker, sized up to 4 GiB).

**OP10's rows that said "priced in A5", now priced** (the same rule: act at 80% for two weeks running unless stated):

| Piece | Starting plan | Its limit | Move up when | To | About |
|---|---|---|---|---|---|
| Object storage (Spaces) | US$5 base | 250 GiB stored, 1 TiB transfer | 80% of either | Pay per use | US$0.02 a GiB stored, US$0.01 a GiB transfer |
| The files archive in the nightly backup | A full copy each night | — | Files bucket past **5 GB** (RG2) | The rolling copy (RR14) | Saves transfer and storage; no new fee |
| Upload scanning (GuardDuty) | Free allowance | 1,000 objects and 1 GB a month | Past the allowance | Pay per use | About US$0.09 a GB, plus a small charge per object |
| Backup store (S3) | Pay per use | — | — | — | About US$1-3 a month at launch |
| Error tracking (Sentry) | Developer, free | 5,000 errors a month; one user; no API | 80% for two months, **or** the console's error link is built (RR7) | Team | US$26 a month |
| Uptime (UptimeRobot) | Solo | Its monitor count; push alerts | Voice or text alerts wanted — **at the latest, the first paying contractor** — or more checks | Voice and text credits; the next plan | Credits as used; the next plan priced then |
| The files worker | 1 GiB | Memory | Legitimate receipts refused for memory | 2 GiB | About US$25 a month |
| Mailbox (Microsoft 365) | One user | One person reading it | A second staff member reads support (OA4) | A second licence, or a shared mailbox | About US$6 a month a user |

## 11. What gets built, tests, what this does not do, owner actions, and sources

**The decisions, as approved by the owner on 2026-10-09:**

| # | Decision | Recommended |
|---|---|---|
| RG1 | The nine tests every service must meet | As written |
| RG2 | File storage | DigitalOcean Spaces in Toronto, with the files archived in the nightly backup |
| RG3 | Upload security and the scanner | The eight steps; AWS GuardDuty on a quarantine bucket in Canada, ClamAV as the fallback; **PDF receipts not disarmed in release 1 — residual accepted by the owner, 2026-10-09**. *Amended after the read:* decoding in a separate files worker (RR1); **PDF receipts rasterised in the files worker — owner, 2026-10-09** (RR2) |
| RG4 | Error tracking | Sentry, EU region, free plan, API only |
| RG5 | Uptime and heartbeats | Better Stack free; phone alerts bought at the first paying contractor at the latest. *Amended after the read:* **UptimeRobot Solo, about US$9 a month — owner, 2026-10-09** (RR6) |
| RG6 | The mailbox | Microsoft 365 Business Basic, **held by the Canadian company** (owner, 2026-10-09) |
| RG7 | The backup store | AWS S3 in Canada, three AWS accounts as listed |
| RG8 | The register rewritten, and the sub-processor list | As written |
| RG9 | The costs and triggers | As written |

**What gets built, and when:**
- **On approval (this step, A5):** `docs/SERVICE-REGISTER.md` rewritten (RG8); OP10's table in
  `docs/design/environments-and-operations.md` carries a dated pointer to §10 here; `docs/DATA-PROTECTION-READING.md`
  §5's table and `docs/THREAT-MODEL.md`'s hostile-upload row point here; OA6 and OA12 name the services (below).
- **B3 — monitoring and resilience:** Sentry's two projects, the redactor in front of it, tracing and default
  integrations off; the browser-error route with its closed lists and cap; the uptime checks and three heartbeats; the
  morning backup-age check; the AWS organisation, its accounts and its tag policy; the backup bucket under Object Lock
  (RG7's check first); the files archive in the nightly backup; the standing drill bucket; the drill restoring files
  and checking their hashes.
- **B5 — file storage and malware scanning:** the Spaces buckets and their three keys (RG2's check first); the
  quarantine bucket, GuardDuty and both policy statements (RG3's check first); **the files worker** with its one door;
  the upload route kind with steps 1-8; the disarming of images; **the rasterising of PDF receipts** (RR2, the owner's
  decision); the warned, audit-logged "download original"; the hashes recorded; AP11's storage port.
- **A6** chooses the transactional email provider, and fills its row here. **A10** builds the duplicate match's screen
  and door on RG3's rule.

**Tests, each proved with a planted defect:**
- **Never read unscanned** (RG3): a read of a quarantine object with the files worker's key before its tag says clean
  is refused by the bucket. Plant: the policy's tag condition removed — the read succeeds, and the test fails.
- **Nobody but GuardDuty can mark a file clean** (RG3, RR3): an upload carrying the tag `NO_THREATS_FOUND`, sent with
  the API's key, is refused; setting that tag afterwards with the API's key, the worker's key, or the owner's own role
  is refused. Plant: the `OnlyGuardDutyCanTagScanStatus` statement removed — the pre-tagged object becomes readable,
  and the test fails.
- **Staff never receive an uploaded PDF by default** (RG3, RR2): the console's receipt view for a PDF serves only the
  worker's page images; the original comes only through "download original", which writes an audit entry. Plants: the
  view serving the original; the download skipping its audit entry.
- **Decoding never happens in the API** (RG3, RR1): the API's code contains no image or PDF decoder, and the files
  worker's environment contains none of the API's secrets (the OP4 names are listed and checked absent). Plant: an
  image library imported in the API; a deploy-token variable given to the worker.
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
- **Duplicates** (RG3): the same receipt from two tenants is matched when staff open it, the door returns only the
  matching payment's id, and **no tenant-readable row ever holds another tenant's payment id**. Plants: the door
  returning the other tenant's name; the match written to the tenant's payment row.
- **Rendered PDFs verified on re-serve** (RG2; R1.16a): a stored PDF altered by one byte is refused and alerted. Plant:
  the hash check skipped.
- **Receipts are never inline** (RG2): a signed URL for a receipt carries the attachment disposition and our recorded
  type. Plant: the uploader's type passed through.
- **Error events carry nothing personal** (RG4, RR10): synthetic errors carrying an email address, a name, a cookie,
  a filled-in path and a signed URL are raised through the real SDK, and **the envelope its transport would send is
  captured and searched** — not the redactor's output alone — with none of them found, and no breadcrumbs or spans.
  Plants: the redactor bypassed for one field; the SDK's default integrations switched back on.
- **The browser-error route** (RG4, RR9): a report naming a real path instead of a page template, or an unknown error
  kind, is dropped; the 501st report in a month is counted and not forwarded. Plants: the closed list skipped; the cap
  removed.
- **No third-party script** (RG1 test 8): the web app's build contains no Sentry or other third-party script, as the
  site's guard already checks for the site. Plant: the browser SDK imported.
- **Files survive a restore** (RG2): the drill finds every file a restored row points to, with a matching hash, and a
  file erased after the backup is gone after the restore. Plant: the ledger's object keys not replayed.
- **The heartbeats alert** (RG5): a backup that does not run raises the alert. Plant: the job's ping removed (OP7's test).
- **The backup-age check alerts** (RG5, RR13): a backup bucket whose newest object is 27 hours old raises the alert.
  Plant: the age threshold compared the wrong way.
- **By hand, and recorded** (provider settings, not our code): the mailbox's tag, its role restriction, and — on the
  calendar, 91 days after mail starts — that a message older than 90 days is gone (RG6); Object Lock refusing a delete
  (RG7); a "Read" Spaces key refused a write and refused on another bucket (RG2); a bank's owner-password PDF statement
  through the scan (RG3).

**What this does not do (Rule 21.4):**
- **It does not choose the transactional email provider** (A6) or design the payments screens (A10).
- **It does not settle the legal question.** Canada is the strongest place offered, not a certainty; every provider here
  is a United States company (OP2's caveat), and the Commissioner (OA22) and the attorney decide.
- **AWS sees uploads in plain form** while they wait in quarantine — normally minutes, about two days at most for an
  abandoned one (RG3). That is a choice, made for the store-enforced guarantee and the cost; option A avoids it for
  about US$80-100 a month.
- **A decoder exploit in the files worker** reaches quarantined uploads, the files bucket and its one door — it could
  read or replace stored files — but not production's secrets or the database beyond that door (RG3, RR1).
- **Error tracking sits in the EU, not Canada**, and its "no personal data" rests on our redactor and Sentry's scrubbing
  together. A mistake in both reaches Frankfurt. Sentry keeps account data in the US (RG4).
- **PDF receipts** (RG3, RR2): staff see images of the pages, made in the files worker. A PDF that exploits the
  **renderer** reaches only the worker (RR1's residual). The residual returns only if someone chooses "download
  original", which warns and is audit-logged.
- **The duplicate match catches only byte-identical files** and normalised references (RG3, RR15). A re-saved or
  forwarded photo of a reused receipt is not caught; the bank statement check (R1.34) is the control that is.
- **The scanner knows only what it knows.** A signature or model scan catches known and common malware, not a targeted
  file built for us.
- **Free plans change their terms.** Each plan's terms are read from the vendor's own terms page, not from summaries
  (RR6) — Sentry's now, and Zoho's if the fallback is used — and the quarterly figures (OP12) are the place a change is
  noticed.
- **Several capabilities are unconfirmed from public pages** and are checked before the build relies on them: Spaces'
  encryption at rest (B5); Microsoft's retention tags on Business Basic and its Canadian residency for the chosen
  company (OA12); Zoho's cleanup on its free plan, if the fallback is used; AWS prices in Canada (B3).

**Owner actions** (`docs/OWNER-ACTIONS.md`) — **no new action**; four made precise:
- **OA1** carries the new production estimate (RG9).
- **OA6** (batch 1) names the accounts: DigitalOcean Spaces, its three keys and the files worker are part of OA1's
  DigitalOcean account; **an AWS organisation with three accounts and the tag policy** (RG7, RR3); **Sentry** (EU region,
  chosen when the organisation is created); **the uptime service** (RG5). Each in the business's name, with MFA (OA24).
- **OA10** gains a question *(RR8)*: the Canadian company holds the support mailbox and sells subscriptions — is it
  Pryvis's processor for that mail, what contract does that need, and how is it named in the privacy notice?
- **OA12** (batch 2) names the mailbox: **Microsoft 365 Business Basic**, bought by the Canadian company, **with Canada
  chosen as the tenant's country when it is created**, the 76-day Permanently Delete tag, the role restriction, and
  `support@` and `privacy@` as aliases (RG6, RR12).

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
- Better Stack: [pricing](https://betterstack.com/pricing) ("Free for personal projects"). UptimeRobot:
  [pricing](https://uptimerobot.com/pricing/) and [its terms](https://uptimerobot.com/terms/) ("available for any use,
  including commercial and business use"). Healthchecks.io: [pricing](https://healthchecks.io/pricing/).
- Added after the read: DigitalOcean's [Spaces S3 compatibility](https://docs.digitalocean.com/products/spaces/reference/s3-compatibility/)
  (lifecycle "for time-based expiration and removing incomplete multipart uploads"); AWS's
  [tag-based access for Malware Protection for S3](https://docs.aws.amazon.com/guardduty/latest/ug/tag-based-access-s3-malware-protection.html)
  (both statements, and the organisation requirement); Sentry's [pricing](https://sentry.io/pricing/) (API on Team and
  above); Microsoft's [data residency product terms](https://learn.microsoft.com/en-us/microsoft-365/enterprise/m365-dr-product-terms).
- Zoho Mail: [automatic email cleanup](https://prezohoweb.zoho.com/mail/help/adminconsole/automatic-email-cleanup.html);
  the free plan ([codroid](https://codroiditlabs.com/is-zoho-mail-free/)).
- Microsoft: [Exchange retention tags and policies](https://learn.microsoft.com/nl-nl/exchange/security-and-compliance/messaging-records-management/retention-tags-and-policies);
  [Exchange Online limits](https://learn.microsoft.com/en-us/office365/servicedescriptions/exchange-online-service-description/exchange-online-limits);
  Canadian data residency ([summary](https://kurtsh.com/2026/01/13/info-microsoft-365-commercial-data-residency/)).
- Google Workspace: [data regions by edition](https://knowledge.workspace.google.com/admin/compliance/compare-data-region-features-across-google-workspace-editions);
  pricing ([emailvendorselection](https://www.emailvendorselection.com/google-workspace-pricing/)).

## 12. The independent read, and where each finding is answered

Read by Opus from `docs/briefs/2026-10-09-register-design-read.md` at `20d652c`.
- **Verdict:** "sound after the named changes".
- **Findings:** 17 — **8 major**, 9 minor, no blocker. Each is answered above.
- **Its own view of each recommendation:** agreed with RG1, RG2, RG6 and RG7; agreed in part with RG3, RG4 and RG9;
  disagreed with RG5, and in part with RG8. Each disagreement is adopted — two of them, RG3's PDF residual and RG5's
  provider, changed what the owner had approved, and the owner decided both on 2026-10-09 as recommended.

Four findings were confirmed on the vendors' own pages before being answered (Rule 16.4): Spaces' lifecycle covers
time-based expiry only (RR5); AWS's tag-based access gives two statements and requires an organisation policy (RR3);
Better Stack's free plan is "Free for personal projects" and UptimeRobot's terms allow business use (RR6); Sentry's API
is on Team and above (RR7).

| Finding | Severity | Answered in |
|---|---|---|
| RR1 · image decoding inside the process holding every production secret | major | RG3, the files worker; §11's test and residual; RG9's cost |
| RR2 · the accepted PDF residual was stated too narrowly | major | RG3, "PDF receipts": restated; **rasterised, the owner's decision** |
| RR3 · only half of AWS's tag control; the API's key; the worker's delete | major | RG3 "How B works" steps 1, 3 and 4; RG7's accounts; §11's pre-tag test |
| RR4 · the files key and the files backup contradict; no drill target; copies list | major | RG2: three keys, the standing drill bucket, every copy of a file; OP4's rows |
| RR5 · old versions cannot be expired on Spaces; the swap fallback | major | RG2: versioning off; the fallback is our own encryption |
| RR6 · RG1 test 4 applied backwards | major | RG5 — **UptimeRobot Solo, the owner's decision**; RG9 |
| RR7 · RG4 contradicts SF5 on staff access to errors | major | RG4, "Staff reach an error only through the console"; RG9's trigger |
| RR8 · the sub-processor list incomplete or imprecise | major | RG8's rows and list; RG4; RG6; OA10 |
| RR9 · the browser-error route under-specified | minor | RG4, the route; §11's test |
| RR10 · the personal-data test checks the redactor, not the payload | minor | RG4, tracing and integrations off; §11's envelope test |
| RR11 · "at most one day" in quarantine | minor | RG3 steps 1 and 5; RG8 |
| RR12 · the 90-day deletion needs three more settings | minor | RG6 "How it is set up"; OA12 |
| RR13 · OP7's backup-age check has no home | minor | RG5; RG7; OP4; §11's test |
| RR14 · the incremental trigger cannot keep both promises | minor | RG2, the rolling copy; RG9 |
| RR15 · duplicate limits; where the match lives | minor | RG3 "Duplicates"; §11 |
| RR16 · receipt legibility; owner-password PDFs | minor | RG3 steps 4 and 6; the B5 check |
| RR17 · stale text: the privacy-notice sentence, OA1, "five services" | minor | §1; the register's §0; OA1 |
