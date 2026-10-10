# Design: document settings and the PDF — what a tenant's client receives, and how it stays the record

**Status: APPROVED by the owner, 2026-10-10 — every recommendation, DS1-DS8** ("Approved"), with the owner's choice of
**no "Sent with Pryvis" line on any document, Free included — and that made known in the marketing of the tiers**.
**Amended the same day to answer its independent read (DR1-DR16, §12); closing check closable; the amended design
signed off by the owner, 2026-10-10** ("Approved"). Three amendments changed what the owner had
approved, and **the owner decided all three on 2026-10-10 as recommended** ("Recommendations accepted"): PDFs are
**rendered in the files worker**, not the API (DS5, DR1); the site's line is **narrowed to the documents** (DS4, DR8);
**colour presets are Pro**, and a downgraded tenant's later documents use the neutral pair (DS1, DR10). Build plan step
A7 (`docs/BUILD-PLAN.md`). Nothing here is built until C4 (issuing: the branded PDF and its storage).

Date: 2026-10-10 · **Answers** `docs/PLANNING-AUDIT.md` §7 item 7 (logo, header, colours, terms; the shared layout and
its presets; the render and its hash; the original application's branding cross-checked) and the owner's requirement 10
in brief §10 · **Requirements** PRD R1.13 (the sealed snapshot holds the document settings), R1.13a (the catalog date on
the internal copy), R1.16 (logo, header details, two brand colours, a shared layout, never an uploaded template), R1.16a
(the hash recorded once on `document_render`, verified whenever a stored PDF is re-served), R1.17 (validity) · **Carries**
Rule 3 (formats and legal wording as data per country), Rule 5 (uploads are hostile), Rule 6 (issued documents are
immutable snapshots), Rule 7 (money formatted in one place), Rule 14 (tier features through the one entitlement
service), ADR 0031 (revision numbering), ADR 0035 decision 5 (the privacy line on every document), `docs/TIERS.md`
(branding by tier), and the designs it fits: `docs/design/tax-and-documents.md` (T8: what a tax invoice carries; T9:
numbers), `docs/design/third-party-register.md` (RG2: files, RG3: the logo disarmed in the files worker),
`docs/design/outbound-messaging.md` (MS5: a document is sent as a link, not an attachment), and A9 (the share page that
serves the PDF) · **Delegation (Rule 16.5):** Opus, main session.

**Vendor facts are read from the vendor's own pages on 2026-10-10** (§10's sources). What could not be confirmed is
marked as a check for C4.

---

## Contents

1. The problem
2. DS1 · What a tenant sets, by tier
3. DS2 · One shared layout, and what "presets" are
4. DS3 · Colours that stay legible
5. DS4 · What each document shows
6. DS5 · The renderer, where it runs, and its fonts
7. DS6 · When a PDF is made, what is stored, and how it stays the record
8. DS7 · Who may change the settings, and what a change does
9. DS8 · Offline, copies and retention
10. What gets built, tests, what this does not do, decisions for the owner, sources
11. The mistakes this design is checked against (Rule 24)
12. The independent read, and where each finding is answered

## 1. The problem

When Delroy sends a quote, the PDF is the business he is presenting: his logo, his name and address, his terms. When
his client accepts, the same PDF is the record of what was agreed — the acceptance points at its render row, whose hash
proves the bytes (R1.16a). Two needs, and they pull apart: the tenant wants to change his branding freely, and an
issued document must never change.

**Today:** `document_settings` holds only the default acceptance bar and the deposit threshold (migration J8), one row
per tenant, overwritten in place; the logo, header details, colours and terms are owed. `document_render` exists, with
its hash and a `settings` column, for **quote issues only** (its migration says invoices "will need one too"), and
nothing renders. `quote_issue` freezes the client's name and the terms text, and nothing else of what the PDF shows
*(DR2, DR5)*.

**The original application, cross-checked (brief §10)** — read-only, to carry forward what worked:

| The original did | Carried forward? |
|---|---|
| Rendered with `@react-pdf/renderer` in Node | **The library, yes; where it ran, no** (DS5) — it decoded the logo inside the web server, which A5's RR1 forbids *(DR1)* |
| Took PNG or JPEG logos, typed by their bytes, and refused SVG because it can carry script | **Yes** — now A5's eight upload steps (RG3) |
| Bounded the logo's box in both directions, so a tall or wide logo cannot push the header off the page | **Yes** (DS4) |
| Refused to render a PDF with no business name | **Yes, widened** — T8's required fields refuse the issue itself, before any render (DS4) |
| Used the built-in Helvetica font | **No** — an embedded font gives the same glyphs on every device; which characters Helvetica lacks is not read from a vendor page here, and §10's "every character renders" test, whose plant is Helvetica, proves the difference *(DR13)* |
| Kept the logo's bytes in the database | **No** — files belong in the files bucket (Rule 10; RG2) |
| **Re-rendered the PDF on every download**, storing no copy and no hash | **No** — that makes "what the client saw" unknowable after the settings change. One render, stored, hashed (DS6) |
| Had no colours, no presets, a quote prefix and an invoice prefix | Colours added by tier (DS3); numbering is T9's |

**What it must achieve:**
- the tenant's branding on every quote, invoice and credit note, within what his tier includes;
- **an issued document's PDF is made once and never changes**, and serving it proves it unchanged (R1.16a);
- every document legible on a phone screen and on paper, whatever colours the tenant picks;
- the country's required wording and fields, from the rule pack, never from code (Rule 3; T8).

## 2. DS1 · What a tenant sets, by tier

`docs/TIERS.md` decides the tiers: "Custom document branding (logo, colours, terms)" is **logo** on Free, **logo +
colours** on Pro, and **full, plus per-client terms** on Business (release 3). Each is checked through the one
entitlement service (Rule 14), never a plan comparison.

| Setting | Tier | Notes |
|---|---|---|
| **Logo** | All | Uploaded through A5's eight steps; stored as the disarmed PNG (RG3), with its SHA-256 recorded by the API |
| **Business details** | All | Trading name, structured address (T8's two lines, town, region, optional postal code), phone, email, website. Registration number per T8 |
| **Colours** — a preset pair, or his own primary and accent | **Pro** — presets included *(owner, 2026-10-10, DR10)* | DS2, DS3. Free documents use the neutral pair |
| **Default terms** — one text per document kind (quote, invoice) | All | Plain text, at most 2,000 characters, no links made clickable (MS5's reasoning applies to the PDF too); only characters the embedded fonts draw (DS5) |
| **The privacy line** | All | ADR 0035 decision 5: one sentence, from the rule pack's default unless the tenant edits it; **1-300 characters, never empty** — an empty one is refused, since every document must carry one *(DR16)* |
| **Validity default** for quotes | All | R1.17 already sets 30 days; shown here, owned there |
| **Bank-transfer details** on invoices | Pro | Owned by D3 and A10 — a **protected change** (R1.29a, ADR 0034). A7 reserves the place on the layout only |
| Per-client terms | Business | Release 3; not designed here |

**The tier is applied at seal, not only at saving** *(DR10)*. Saving colours is refused on Free; and when an issue is
sealed, the entitlement service is asked again, and the palette frozen into the snapshot (DS6) is the tenant's if he is
entitled to it, the neutral pair if not. So a Pro tenant who drops to Free keeps his stored colours, unused, and his
later documents are neutral; earlier documents keep what they were issued with.

**Nothing else.** No custom fonts, no free-form text blocks, no uploaded templates (R1.16) — each would be a surface for
breaking the layout or for content no check can see.

## 3. DS2 · One shared layout, and what "presets" are

Brief §10 asks for "a small set of presets, not arbitrary custom layouts".

| Option | For | Against |
|---|---|---|
| **A. (rec) One layout; presets are colour pairs** | One thing to test, on paper and on a phone; every document recognisably the same product; the tenant still picks a look | Less choice of arrangement |
| B. Two or three layouts (logo left, centred, banner) | More individual | Each layout multiplies the tests — every document kind, every country's required fields, long names, many lines — and each is a place for a field to fall off the page |

**Recommendation: A for release 1.** A Pro tenant chooses from six named colour pairs, or his own two colours; a Free
tenant's documents use the neutral pair *(DR10)*. A second layout can follow later as its own small design, if tenants
ask for it.

## 4. DS3 · Colours that stay legible

A contractor will pick his brand's yellow, or a mid-blue that neither white nor dark-grey text reads well on.

- **Colours are never used where legibility depends on them.** Body text, numbers and totals are always the defined
  **body text colour, `#1A1A1A`, on white** (17.4:1). The primary colour fills the header band and the table's header
  row; the accent marks rules and the total's underline, which carry no meaning of their own.
- **Text on a colour is pure black (`#000000`) or pure white, whichever gives the higher contrast ratio.** With those
  two, **every colour reaches at least 4.5:1** (WCAG's level for normal text) — the worst case, a mid-grey, gives about
  4.6:1 — so no colour is refused and no band falls back *(DR9)*. The draft's rule ("near-black", undefined, with a
  fallback for "pale" colours) was wrong both ways: yellow reads well with dark text, and the colours that fail a
  dark-grey text are mid-tones (`#2E86DE` gives 4.63:1 with `#1A1A1A` but only 3.76:1 with white; `#808080` 4.41:1 at
  best with `#1A1A1A`). Using pure black on bands is what removes the failure.
- The choice is code in the shared core, used by the settings screen and the renderer alike (Rule 7), so the screen's
  preview and the PDF cannot disagree.

## 5. DS4 · What each document shows

One layout, read from **the issue's sealed snapshot** (DS6: R1.13), never from live settings:

1. **Header**: the logo in a box bounded in both directions (as the original did), the trading name, the address, the
   contact details, and the registration number where T8 requires it.
2. **Title and number**: the rule pack's title for the kind and the tenant's registration (T8: "Quote", "Tax Invoice",
   "Invoice", "Credit Note"), the number with its revision suffix (ADR 0031: "Q-0042 rev 2"), the issue date, and for
   a quote its valid-until date (R1.17); for an invoice the supply date (T8).
3. **The client**: name and address, as frozen in the snapshot — on a quote by DS6's new columns, on an invoice or
   credit note by T8's frozen details *(DR2: T8 freezes invoices and credit notes only)*.
4. **Lines**: description, quantity, unit, price, amount; per-code tax as T8 requires; totals. **Money is formatted by
   the shared core** (Rule 7) — "J$12,500.00".
5. **Terms**: the snapshot's terms text for the kind.
6. **Payment details** on an invoice: the reserved place D3 fills.
7. **Footer, every page**: the privacy line (ADR 0035 decision 5), "Page 2 of 3", and the document number again, so a
   loose page is identifiable. **Never Pryvis's name or logo**, on any tier (the owner, 2026-10-10). **The PDF's
   metadata names no software either** *(DR14)*: the renderer sets both `creator` and `producer` to "react-pdf" unless
   told otherwise (its Document page), so `author`, `creator` and `producer` are all set to the tenant's trading name.

**What the owner's decision covers, and what it does not** *(DR8)*. The PDF carries no Pryvis name or logo. **The email
that carries the link does**: A6 approved the From line "<Business> via Pryvis" and a footer naming Pryvis
(`docs/design/outbound-messaging.md` MS4-MS5), for the reasons recorded there. The share page (A9) is not designed yet.
So the site says what is true of the documents only — **"No Pryvis name or logo on your quotes and invoices — even on
Free"** *(owner, 2026-10-10)* — and `docs/TIERS.md` says the same.

**Long content breaks across pages, never off them.** A line's description may wrap; the table's header repeats on each
page; the totals are never orphaned from the last line; the footer holds a 300-character privacy line. Each is a test
(§10).

**What a document never shows:** the catalog date (R1.13a puts it on the **internal copy** only, below), costs or
margins, the acceptance bar, or anything the tenant has not chosen to send.

**The internal copy** (R1.13a): the same layout with an "Internal copy — not sent" band across each page and the
catalog date. Made on demand from the issue's snapshot, never stored, never hashed. **A draft preview** is the same,
with "Draft — not issued" across each page. **Pryvis never sends either**: no share link, no message and no share-page
download can address them. The tenant can download one and forward it himself; the band on every page is what then
tells its reader it is not the document *(DR16: the draft said "neither can reach a client", which overclaimed)*.

## 6. DS5 · The renderer, where it runs, and its fonts

**The library:**

| Option | For | Against |
|---|---|---|
| **A. (rec) `@react-pdf/renderer`, carried from the original** | Pure Node, no browser; the original's layout logic is reviewed and ported; document metadata, including **its creation date, can be set** (its documentation lists `creationDate`), so the stamp is the sealed time, not the clock | **Its documentation mentions no tagged-PDF support**, so screen readers get untagged text (§10's residual); variable fonts are refused ("only TTF and WOFF fonts files are supported"); **it decodes images** — its image package depends on `png-js` and `jay-peg` and also parses SVG *(DR1)* |
| B. HTML in headless Chromium | Rich layout; tagged PDFs are possible | A browser: hundreds of megabytes, memory, and a large attack surface for tenant-supplied text |
| C. A low-level library (pdf-lib, PDFKit) | Small | Layout, wrapping and page breaks written by hand — the bugs this product does not need |

**Where it runs** *(DR1, decided by the owner, 2026-10-10)*. Rendering decodes the logo, and A5 put every decoder
outside the API (RG3, RR1: "decoding never happens in the API"). So the renderer runs **in the files worker**, which
already decodes uploads and holds none of the API's secrets:

| Option | For | Against |
|---|---|---|
| **A. (rec, decided) The files worker** | Already isolated for exactly this reason; no new service; RG3's test ("the API's code contains no image or PDF decoder") stays true | The worker's memory must hold a render as well as a decode (a C4 check, below); a compromised worker could alter the PDFs it makes — the same reach RG3 already states ("could read or replace stored files") |
| B. A new render container | The narrowest reach | A third container to deploy, size and monitor, for no reach the worker does not already have |
| C. The API | Simplest | Reopens RR1: a hostile logo reaches the process holding the database login, the MFA keys and the deploy tokens |

**How a render is asked for and returned.** The API sends the worker the issue's frozen snapshot as data, with the
logo's object key **and its SHA-256 as the API recorded it**. The worker reads the logo, **checks its hash against the
API's before decoding** (so a logo replaced in storage is refused, not decoded), renders, and returns the PDF's bytes.
**The API hashes the bytes itself, stores them with its own key, and writes the `document_render` row** — the worker gets
no new key and no new door. The request goes over App Platform's internal network, never a public route. The worker
holds the snapshot's personal data in memory for the render only, and logs none of it (AP9).

**Fonts: Noto Sans, embedded** (its repository states "the SIL Open Font License, Version 1.1"), so nothing is fetched
from a font host at render time (Rule 20's spirit). Static TTF files are needed because the renderer refuses variable
fonts; that they are available is a **C4 check**. **What it covers** *(DR14: the draft said "every client's name", which
overclaimed)*: the latin-greek-cyrillic set — Latin with its accents, Greek and Cyrillic. **Characters the embedded font
cannot draw are refused when they are typed** — in a client's name, a line's description, the terms, the business
details — by one "printable" check in the shared core that the forms and the renderer both use, naming the character,
so a document never prints a box. That includes **emoji**: the renderer's fonts page says "PDF documents do not support
color emoji fonts", and its only alternative fetches images from a CDN at render time, which is refused here.

**Bounded input** *(DR16)*: at most 500 lines, the terms at 2,000 characters and every other text field at its form's
limit, checked before a render is asked for; and the worker refuses a render that runs past 30 seconds or its memory
limit, which DS6's failure path then handles.

**Same input, same bytes** is the goal, so that a render can be tested against a stored expected file: the creation
and modification dates are the sealed time, taken from the snapshot, and nothing random goes in. Whether the renderer
adds anything else that varies (an internal id) is a **C4 check**; if it does, the test compares the PDF's text and
layout, not its bytes.

**PDF/A** *(DR14)*: the renderer offers b-level PDF/A ("Only b-level (visual appearance) conformance is supported").
**Not adopted in release 1**: the record is our stored copy and its verified hash, not the file's format; PDF/A would
add a validator to the build for a benefit no tenant, accountant or rule has asked for. Stated in §10 as a residual.

## 7. DS6 · When a PDF is made, what is stored, and how it stays the record

**The snapshot, and where it lives** *(DR2)*. "The sealed snapshot" was named and never held: nothing froze the header,
the logo or the colours, and a render at numbering — which can come days after the seal (a Free seal blocked by the
limit, a mobile seal numbered at sync, R1.18) — would have read whatever the settings were by then. So:
- **Settings are versioned rows, never overwritten** *(DR2, with DS7)*: a new insert-only `document_settings_version`
  row per change, holding the business details, the logo's object key and hash, the colour choice, the terms per kind,
  the privacy line and the validity default. `document_settings` keeps the acceptance bar and deposit threshold, and
  points at the current version.
- **Every issue records, at seal**: the settings version it was sealed with; the **palette resolved at seal** through
  the entitlement service (DS1); the rule pack's version; and, on a quote, the client's address (`quote_issue` freezes
  only the name today). Invoices and credit notes carry the same three, beside T8's frozen party details. A device that
  seals offline states the version it sealed with, and the seal is refused if that version is not the tenant's.
- The render, the internal copy and the share page (below) all read the issue and the version it names — never the live
  settings.

**When:** once the issue is **numbered** — at sealing on the web; at sync on the mobile app later (R1.18) — because the
number is printed on it.

**If the render fails** *(DR11)*. Numbering commits first, in its own transaction, so the gapless series (T9) never
depends on a render. The render is then a job keyed by the issue: retried with backoff, each try from the same snapshot
(so a retry makes the same bytes); the issue shows **"PDF being prepared"**, and after an hour of failures **"PDF
delayed — we're on it"**, with the owner alerted. **A numbered issue with no render cannot be delivered** — no share
link, no message — as a sealed issue with no number cannot (`docs/design/domain-model.md` §6.1a). A retry is not a
re-render: until one render is stored, the first is still being made.

**What is stored:**
- the PDF, in the files bucket (RG2) at `tenants/<tenant_id>/render/<uuid>`;
- a `document_render` row: its storage key, **SHA-256**, byte size, and its `settings` — the settings version, the
  palette, the rule pack's version, the font's version and the renderer's version;
- **for every kind of issued document** *(DR5)*: the row gains nullable `invoice_id` and `credit_note_id` beside
  `issue_id`, with a check that **exactly one** is set and composite tenant keys as `issue_id` has — the shape the
  table's own migration named. Each kind has its own unique "one original" index, below.

**One original render, held by the database** *(DR4)*. The row gains `kind` (`original` or `re-render`) and, on a
re-render, `reason` and the original's id. A partial unique index allows **one `original` per document**, so a second
"first" render is refused, not stored beside the first. The share page and every download serve the original. If the
original's bytes are ever lost **and** a backup is lost too, a re-render is made from the same snapshot:
- **if its bytes hash the same**, it *is* the original — the bytes are restored under the original row (which the
  existing unique (issue, SHA-256) key would anyway forbid inserting twice), and an audit entry records the restore;
- **if they differ** (a renderer or font changed), it is a new `re-render` row with its own hash and reason, served in
  the original's place with "Re-made on <date>" on each page; **any acceptance keeps pointing at the original row**,
  through its (render, issue, tenant) key in `new-app/db/schema.prisma` *(DR15: the draft credited this to
  `docs/design/acceptance-evidence.md`, which never mentions renders)*.

**How it stays the record** (R1.16a):
- **Re-served, never re-rendered.** The share page, the tenant's download and the staff console all read the stored
  bytes, **check their SHA-256 against the row, and refuse on a mismatch** (alerting the owner) — as RG2 requires.
- **Streamed through the API, never by signed URL** *(DR6)*. A signed URL hands the browser to storage after the check,
  and the bytes could be replaced in between — both the API's key and the files worker's can write. So the API reads
  the bytes, hashes **the bytes it is about to send**, and sends those same bytes. AP11's signed URLs remain for other
  files, never for renders.
- **The share page shows the same snapshot, not a second document** *(DR7)*. A9 is owed this requirement: the share
  page's HTML is generated from the **same issue and settings version** as the render, through the same shared view
  model, and always offers the PDF; the acceptance records the render id it was shown with (as the schema already
  requires). "The same" means the same frozen data, not the same bytes — the PDF stays the record, and the share page
  says so beside the accept button.
- **A settings change never touches an issued document.** The render reads the issue's settings version, and the issued
  PDF is already stored.

**The rule the database holds:** `document_render` is insert-only. Today that rests on row-level security alone — the
application role holds `UPDATE` and `DELETE` on the table from the privilege model's blanket grant, and an update is
silently skipped, not refused *(DR3)*. C4's migration **revokes `UPDATE` and `DELETE` on `document_render`** (and on the
disposal table, DS8) from the application role, so either is refused with an error.

## 8. DS7 · Who may change the settings, and what a change does

- **The tenant's owner** changes document settings in release 1 (roles beyond owner and member are release 3, ADR 0029
  E3).
- **Each change is a new `document_settings_version` row** (DS6), never an edit of the last, recorded in the audit log:
  who, when, which fields — not the values of personal fields. Old versions are kept while any issue names them, which
  is every version an issue was sealed with.
- **A change applies to documents sealed after it** — sealed, not numbered: an issue sealed before the change and
  numbered after it still shows the old settings, because it names the old version *(DR2)*. The settings screen says
  so in one sentence, and shows a preview rendered from the new settings with sample data.
- **The logo is replaced, never edited**: a new upload is a new object; the old one stays while any settings version an
  issue names records it — numbered or not — so a seal waiting for its number never loses its logo *(DR2)*.

## 9. DS8 · Offline, copies and retention

- **Offline (the mobile app, G1):** the settings version and logo are cached on the device so a **draft preview** works
  with no signal; **the issued PDF is still made by the server at sync**, when the number exists (R1.18). The mobile
  design owns the cache. Brief §10 asks for "offline PDF generation"; this narrows it to the draft, because issuing needs
  a connection in release 1 (brief §13's answer, ADR 0022) — **the brief edit was approved by the owner, 2026-10-10, and
  made** (Rule 19) *(DR16)*.
- **Every copy of a PDF** *(DR13: the draft's list was short)*:

| Copy | Where | Lifetime |
|---|---|---|
| The stored render | The files bucket (RG2) | As long as its document (below) |
| The bytes while rendering | The files worker's memory | The render only; never written to its disk, never logged |
| The nightly archives, or rolling copies | The backup store (RG2, RG7) | 35 days |
| The drill's restored copy | The standing drill bucket (RG2) | Hours; at most a day |
| What the client downloads or prints | The client's device | The client's; outside our reach |
| What the tenant downloads | The tenant's device | The tenant's |
| What staff download from the console | A staff device | Only under the console's capability for documents, each view audit-logged (Rule 5.1) *(DR16)*; the console design names the capability |
| The internal copy and the draft preview | Made on demand, streamed, not stored | The request; a downloaded one is the tenant's |

- **The backup job checks before it copies** *(DR16)*: each render's bytes are hashed against their row before being
  archived, and a mismatch is alerted rather than archived as if good — otherwise, after 35 days, a silently replaced
  render could be the only copy left.
- **Retention:** an issued PDF is kept as long as its document — the tax-record period (ADR 0035's schedule). A PDF
  cannot be redacted, so when the document's personal fields are anonymised at the end of that period (R1.44), **the
  PDF is deleted**, and the financial record stays without it. A client's erasure request inside the tax period does
  not remove the PDF, because the law requires the record; A11 answers the person with that.
- **A deleted PDF leaves a record, not a hole** *(DR12)*. The render row is insert-only and keeps its key and hash, so
  the deletion is an insert-only **`document_render_disposal`** row (the render, when, why). Serving reads it and says
  "removed at the end of the retention period" instead of alerting a loss; a restore does not bring the file back; the
  restore drill expects no file for a disposed render; and the erasure ledger (OP1, RG2) records the object key, so a
  restore from an older backup deletes it again.

## 10. What gets built, tests, what this does not do, decisions for the owner, sources

**Decisions for the owner:**

| # | Decision | Recommended |
|---|---|---|
| DS1 | What a tenant sets, by tier — logo (all), colours **and presets** (Pro), terms (all), bank details reserved for D3; the tier applied at seal | As written — **presets Pro, decided by the owner, 2026-10-10** (DR10) |
| DS2 | **One layout; presets are colour pairs** | A, one layout |
| DS3 | Colours used only where legibility does not depend on them; band text pure black or white, so every colour reaches 4.5:1 | As written (amended, DR9) |
| DS4 | What each document shows; no Pryvis name in the PDF or its metadata; the internal copy and draft never sent by Pryvis | As written — **the site's line narrowed to the documents, decided by the owner, 2026-10-10** (DR8) |
| DS5 | `@react-pdf/renderer`; **in the files worker**; Noto Sans embedded; unprintable characters refused at input | A — **in the files worker, decided by the owner, 2026-10-10** (DR1) |
| DS6 | **One original render per document, after numbering, from a versioned snapshot; stored and hashed; streamed and verified; never re-rendered silently** | As written (amended, DR2-DR7, DR11) |
| DS7 | Owner-only changes, each a new settings version, applying to documents sealed after it | As written |
| DS8 | Offline preview from a cache; every copy listed; the PDF deleted when its document is anonymised, with a disposal record | As written (amended, DR12, DR16) |
| — | **A "Sent with Pryvis" line on Free tenants' documents?** `docs/TIERS.md` was silent. It would advertise the product on every Free quote; it is also our name on the tenant's document | **Decided by the owner, 2026-10-10: no** — no Pryvis branding on any document, any tier; and the site's Free tier says so ("No Pryvis name or logo on your quotes and invoices — even on Free", narrowed from the first wording by DR8), with `docs/TIERS.md` recording it |

**What gets built** (C4, issuing), by new migrations (Rule 6):
- `document_settings_version` (insert-only) and `document_settings`' pointer to the current version;
- on `quote_issue`: the settings version, the resolved palette, the rule pack's version and the client's frozen
  address; on `invoice` and `credit_note`: the settings version, palette and rule pack's version;
- on `document_render`: `invoice_id` and `credit_note_id` with the exactly-one check, `kind`, `reason`, the original's
  id, and one partial unique index per document kind for the original; `UPDATE` and `DELETE` revoked from the
  application role;
- `document_render_disposal` (insert-only, the same revocation);
- the settings screen and its preview; the contrast choice and the printable-character check in the shared core;
- the renderer in the files worker, with the embedded font, its hash check of the logo and its limits; the API's
  render job, its retry and its visible states;
- the streamed, hash-verified serving path; the internal copy and draft preview;
- the backup job's hash check of renders. The entitlement checks for colours go through D5's service.

**Tests, each proved with a planted defect** *(DR3: the draft's first and third plants could not fail their tests)*:
- **An issued PDF never changes, and shows what was sealed**: seal, **then** change the logo, colours and address,
  **then** number — the PDF shows the old settings; a new issue sealed after the change shows the new ones. Plant: the
  render reading live settings.
- **Re-served bytes are verified, and the bytes sent are the bytes checked**: one altered byte is refused and alerted;
  a replacement written to storage after the check is not what reaches the client. Plants: the check skipped; the check
  made on a separate read from the bytes sent.
- **`document_render` is insert-only**: an update or a delete by the application role **fails with an error** (not zero
  rows). Plant: the migration's revocation removed.
- **One original per document**: a second original for one issue, invoice or credit note is refused; a re-render with a
  different hash is stored as `re-render` and acceptances still point at the original. Plant: the partial index
  dropped.
- **Every document kind renders**: an invoice and a credit note each get a render row; a row naming two documents, or
  none, is refused. Plant: the exactly-one check removed.
- **A render failure leaves no gap and no undeliverable link**: storage refusing writes leaves the issue numbered,
  "PDF being prepared", with no share link possible; when storage returns, the retry stores it. Plant: the share link
  allowed before the render.
- **Colours need Pro, at seal**: a Free tenant saving colours or a preset is refused, naming the tier; a Pro tenant who
  drops to Free gets the neutral pair on his next seal. Plants: the save check removed; the seal-time check removed.
  (No guard yet stops a plan comparison at a call site; Rule 14 asks for one, and it is owed with the entitlement
  service at D5 — not claimed here.)
- **Every colour stays legible** *(DR9)*: across a 4,096-colour grid and every grey, the band's text reaches 4.5:1;
  `#2E86DE` takes black text. Plant: `#1A1A1A` used as the band's dark text — the mid-tones then fail.
- **The logo is checked before it is decoded** *(DR1)*: a stored logo whose bytes no longer match the API's recorded
  hash is refused by the worker without being decoded. Plant: the worker's hash check removed. And A5's own test —
  "the API's code contains no image or PDF decoder" — now covers the renderer: Plant: the renderer imported in the API.
- **No software named** *(DR14)*: the PDF's metadata contains neither "Pryvis" nor "react-pdf". Plant: `creator` left
  unset.
- **Long content**: 500 lines, a 2,000-character term, a 300-character privacy line, a 120-character client name and a
  very wide logo each stay on their pages; the table's header repeats; totals are not orphaned; 501 lines are refused
  before any render. Plants: wrapping disabled; the logo box unbounded; the line limit removed.
- **Every printable character renders, and nothing else is accepted**: client names in accented Latin, Greek and
  Cyrillic come out as text, not boxes; an emoji or a character outside the font is refused at input, naming it.
  Plants: Helvetica in place of the embedded font; the printable check removed.
- **Required fields** (T8): a registered tenant with no registration number cannot issue a tax invoice. Plant: the
  check removed — T8's own test, run against this layout.
- **The internal copy and draft are never sent by Pryvis**: no share link, message or share-page download can address
  them, and each carries its band on every page. Plants: a draft given a share link; the band removed.
- **Same input, same output**: two renders of one snapshot, **with the clock injected at two different times**, are
  identical (or, if C4 finds a varying field, identical in text and layout). Plant: the clock used as the creation date
  *(DR3: two renders in the same second would have passed the plant)*.
- **A disposed PDF**: serving says "removed", the drill expects no file, and a restore deletes it again from the
  erasure ledger. Plant: the disposal row ignored by the drill.

**What this does not do (Rule 21.4):**
- **The PDF is not tagged for screen readers** — the renderer's documentation mentions no tagged-PDF support. The share
  page (A9) shows the same snapshot as accessible HTML; the PDF is the printable record.
- **It is not PDF/A.** The renderer offers only b-level conformance, and the record rests on our stored copy and its
  verified hash, not the format.
- **A compromised files worker could alter the PDFs it renders** before the API hashes them — the same reach A5 already
  states for the files it stores (RG3). The hash proves a PDF unchanged since it was stored, not that the worker made it
  honestly.
- **It does not design bank-transfer details** (D3, A10), per-client terms (release 3), the share page (A9) beyond the
  requirement owed to it in DS6, or the staff console's capability for documents.
- **It does not prove the PDF is legally sufficient** as a tax invoice; T8's fields are unverified until the accountant
  answers (OA9).
- **Scripts beyond Latin, Greek and Cyrillic** are refused at input, not drawn.
- **A tenant can still choose ugly colours**; DS3 keeps them legible, not tasteful.
- **The email that carries a document names Pryvis** (A6's From line and footer); only the document does not.

**Checks at C4** (vendor capabilities not confirmed from public pages): static Noto Sans TTF files are available; the
renderer adds nothing that varies between identical renders; it embeds only the glyphs used, or the file size stays
small; Noto Sans covers the scripts tested; the files worker's 1 GiB (RG3) holds a 500-line render as well as a decode,
or the size moves to the 2 GiB step A5's sizing table already prices (`docs/design/third-party-register.md`).

**Sources** (read 2026-10-10): `@react-pdf/renderer` — [fonts](https://react-pdf.org/fonts) ("only TTF and WOFF fonts
files are supported"; variable fonts not supported; "PDF documents do not support color emoji fonts") and
[the Document component](https://react-pdf.org/docs/v4/components/document) (`creationDate`, `modificationDate`,
`language`; `creator` and `producer` both default to "react-pdf"; `conformance`, "Only b-level (visual appearance)
conformance is supported"; no tagged-PDF support mentioned); its image package's own `package.json` (`@react-pdf/image`
3.1.0: dependencies `png-js`, `jay-peg`, `@react-pdf/svg`), read by the independent read; Noto Sans —
[its repository](https://github.com/notofonts/latin-greek-cyrillic) ("licensed under the SIL Open Font License, Version
1.1"); WCAG 2.1 success criterion 1.4.3, contrast of 4.5:1 for normal text, with its relative-luminance formula, from
which DS3's ratios are computed.

## 11. The mistakes this design is checked against (Rule 24)

Each row carries one of three verdicts, as A6's §13 settled: **Mechanical now** (a check that runs today, shown
running against this design in a committed brief — Rule 24.7), **C4 test** (specified here, not yet running), or **Not
mechanical** (a person catches it, named).

**The read found this table over-claimed again** *(DR13)* — recorded as **M47** in `docs/MISTAKES.md`. The draft
called the deferral checker mechanical for this design, and it matches none of this design's deferrals; it promised
twins checked "on approval" in a commit that touched none of them; and it miscounted its own C4 checks. Each row below
is restated.

| Mistake | How this design answers it | Verdict |
|---|---|---|
| **RR6** (A5), MR14 (A6) — a vendor fact without the vendor's page | Every vendor fact in §10's sources is a page read on 2026-10-10, re-read for DR14; four capabilities are marked C4 checks, five with the worker's memory; the Helvetica claim is withdrawn to a test | **Not mechanical** — the independent read and the closing check check each fact |
| **M45** — a deferral left standing after its step is decided | This design's deferrals ("Owned by D3 and A10", "A9 is owed", "A11 answers", "G1") are in forms `tools/check_deferrals.py` does not see — the read ran its patterns over this file and they match none | **Not mechanical** — the closing check of each of those steps |
| **M13, M29** — a twin left contradicting its sibling | Fixed in this change, not "on approval": `docs/PRD.md` R1.16 (reads the snapshot; colours by tier), `docs/design/domain-model.md`'s `document_settings` row (versions) and its Deliver row (the render is at numbering), RG2's serving and backup lines, AP11 (renders are streamed), `docs/TIERS.md` and the site's line | **Not mechanical** — the closing check sweeps each, by its brief |
| **M23, M39** (Rule 21.10) — prose claiming who writes a table | "Insert-only" is now a revocation in C4's migration and a test that an update fails with an error — the read found the prose was false today | **C4 test** |
| **M14** — a citation of something that is not there | DR15: the acceptance design was credited with a rule it does not contain; now the schema's key is cited | **Not mechanical** for what a cited document *says* — `tools/check_citations.py` resolves names and paths, not content; the read found this one |
| **M28** — a property claimed and never executed | Every DS6 property has a planted test in §10, and two plants that could not fail (DR3) are replaced | **C4 test** |
| **RR2** (A5), MR20 (A6) — a residual stated too narrowly | The untagged PDF, PDF/A, the worker's reach, the email's Pryvis name and the refused scripts are each stated with their mechanism | **Not mechanical** — the read |
| **OR11, RR4, MR15** — copies not listed | DS8's table now lists eight copies, with the worker's memory, the drill bucket and every download | **Not mechanical** — the read |
| **RR1** (A5) — a decoder where the secrets are | DR1: the renderer decodes images, so it moved to the files worker | **C4 test** — A5's "no decoder in the API" test, extended to the renderer |
| **Rule 20** — a public claim that is not true | DR8: the site's line claimed more than the documents | **Not mechanical** — the site guard checks the line is listed as delivered, not that it is true; the read and the closing check |

## 12. The independent read, and where each finding is answered

Read by Opus from `docs/briefs/2026-10-10-document-design-read.md` at `6de59d1`.
- **Verdict:** "sound to build from once the named changes are made" — DR1-DR11 before C4 starts.
- **Findings:** 16 — **1 blocker** (DR1), 10 major, 5 minor.
- **Its view of each decision:** agreed with DS2; agreed with changes or in principle with DS4, DS6, DS7 and DS8;
  disagreed in part with DS1, as written with DS3, and on placement with DS5. Each disagreement is adopted.

Confirmed before answering (Rule 16.4): the image package's dependencies, in the installed package (DR1); the
application role's `UPDATE` and `DELETE` grant on `document_render`, in the privilege-model migration (DR3); the render
table's quote-only foreign key and its migration's own note on invoices (DR5); the From line and footer in A6 (DR8);
the contrast ratios, recomputed (DR9); `creator`'s and `producer`'s defaults, `conformance`, and the emoji line on the
renderer's own pages (DR14); and that `docs/design/acceptance-evidence.md` never mentions renders (DR15). **Three
amendments changed what the owner approved**, and the owner decided each on 2026-10-10 as recommended: rendering in the
files worker (DR1), the narrowed site line (DR8), presets on Pro (DR10).

| Finding | Severity | Answered in |
|---|---|---|
| DR1 · rendering in the API puts image decoders in the API | blocker | DS5 (in the files worker; the logo's hash checked before decoding); §10's tests |
| DR2 · nothing stores the snapshot; numbering can come after the seal | major | DS6 (settings versions; what every issue records); DS4 item 3; DS7 |
| DR3 · two plants that cannot fail; insert-only resting on row security | major | §10's tests restated; DS6 (the revocation) |
| DR4 · "once" has no holder; the re-render conflicts with the index | major | DS6 (one original per document; identical and differing re-renders) |
| DR5 · invoices and credit notes have no render row | major | DS6 (the exactly-one columns); §10 |
| DR6 · a signed URL skips the hash check | major | DS6 (streamed through the API); AP11's pointer; §10 |
| DR7 · the share page's HTML is a second, unhashed version | major | DS6 (A9's requirement: the same snapshot and view model) |
| DR8 · the site's line claims more than the documents | major | DS4 (what the decision covers); the site, `docs/TIERS.md` (owner) |
| DR9 · the contrast rule contradicts its test | major | DS3 (pure black or white on bands; the body colour defined); §10 |
| DR10 · presets on Free; colours kept after a downgrade | major | DS1, DS2 (presets Pro, owner; the tier applied at seal); §10 |
| DR11 · no path for a render failing after numbering | major | DS6 (outside the numbering transaction; retries; visible states); §10 |
| DR12 · a deleted PDF still pointed to by an insert-only row | minor | DS8 (the disposal record; serving, restore, drill, erasure ledger) |
| DR13 · §11 overstated its mechanisms; copies missing | minor | §11 restated; M47; Rule 24.7; DS8's copies |
| DR14 · `creator` names the software; emoji; PDF/A; the font's reach | minor | DS4 item 7; DS5 (printable check, emoji, PDF/A, the font's coverage) |
| DR15 · a rule credited to a document that does not contain it | minor | DS6 (the schema's key cited) |
| DR16 · privacy line, render size, the draft's reach, staff access, the brief, the backup | minor | DS1; DS5's bounds; DS4's internal copy; DS8's copies and backup check; the brief edit, approved and made |
