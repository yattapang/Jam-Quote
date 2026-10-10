# Design: document settings and the PDF — what a tenant's client receives, and how it stays the record

**Status: APPROVED by the owner, 2026-10-10 — every recommendation, DS1-DS8** ("Approved"), with the owner's choice of
**no "Sent with Pryvis" line on any document, Free included — and that made known in the marketing of the tiers**.
Build plan step A7 (`docs/BUILD-PLAN.md`). Nothing here is built until C4 (issuing: the branded PDF and its storage).

Date: 2026-10-10 · **Answers** `docs/PLANNING-AUDIT.md` §7 item 7 (logo, header, colours, terms; the shared layout and
its presets; the render and its hash; the original application's branding cross-checked) and the owner's requirement 10
in brief §10 · **Requirements** PRD R1.13 (the sealed snapshot holds the document settings), R1.13a (the catalog date on
the internal copy), R1.16 (logo, header details, two brand colours, a shared layout, never an uploaded template), R1.16a
(the hash recorded once on `document_render`, verified whenever a stored PDF is re-served), R1.17 (validity) · **Carries**
Rule 3 (formats and legal wording as data per country), Rule 6 (issued documents are immutable snapshots), Rule 7 (money
formatted in one place), Rule 14 (tier features through the one entitlement service), ADR 0031 (revision numbering),
ADR 0035 decision 5 (the privacy line on every document), `docs/TIERS.md` (branding by tier), and the designs it fits:
`docs/design/tax-and-documents.md` (T8: what a tax invoice carries; T9: numbers), `docs/design/third-party-register.md`
(RG2: files, RG3: the logo disarmed in the files worker), `docs/design/outbound-messaging.md` (MS5: a document is sent
as a link, not an attachment), and A9 (the share page that serves the PDF) · **Delegation (Rule 16.5):** Opus, main
session.

**Vendor facts are read from the vendor's own pages on 2026-10-10** (§10's sources). What could not be confirmed is
marked as a check for C4.

---

## Contents

1. The problem
2. DS1 · What a tenant sets, by tier
3. DS2 · One shared layout, and what "presets" are
4. DS3 · Colours that stay legible
5. DS4 · What each document shows
6. DS5 · The renderer and its fonts
7. DS6 · When a PDF is made, what is stored, and how it stays the record
8. DS7 · Who may change the settings, and what a change does
9. DS8 · Offline, copies and retention
10. What gets built, tests, what this does not do, decisions for the owner, sources
11. The mistakes this design is checked against (Rule 24)

## 1. The problem

When Delroy sends a quote, the PDF is the business he is presenting: his logo, his name and address, his terms. When
his client accepts, the same PDF is the record of what was agreed — the acceptance points at it by its hash (R1.16a,
`docs/design/acceptance-evidence.md`). Two needs, and they pull apart: the tenant wants to change his branding freely,
and an issued document must never change.

**Today:** `document_settings` holds only the default acceptance bar and the deposit threshold (migration J8); the
logo, header details, colours and terms are owed. `document_render` exists, with its hash and a `settings` column, but
nothing renders.

**The original application, cross-checked (brief §10)** — read-only, to carry forward what worked:

| The original did | Carried forward? |
|---|---|
| Rendered with `@react-pdf/renderer` in Node | **Yes** (DS5) — it worked, needs no browser, and is reviewed rather than copied |
| Took PNG or JPEG logos, typed by their bytes, and refused SVG because it can carry script | **Yes** — now A5's eight upload steps (RG3) |
| Bounded the logo's box in both directions, so a tall or wide logo cannot push the header off the page | **Yes** (DS4) |
| Refused to render a PDF with no business name | **Yes, widened** — T8's required fields refuse the issue itself, before any render (DS4) |
| Used the built-in Helvetica font | **No** — it covers Western European characters only; an embedded font covers every client's name (DS5) |
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
| **Logo** | All | Uploaded through A5's eight steps; stored as the disarmed PNG (RG3) |
| **Business details** | All | Trading name, structured address (T8's two lines, town, region, optional postal code), phone, email, website. Registration number per T8 |
| **Two colours** — primary and accent | Pro | DS3. Free documents use Pryvis's neutral pair |
| **Default terms** — one text per document kind (quote, invoice) | All | Plain text, at most 2,000 characters, no links made clickable (MS5's reasoning applies to the PDF too); versioned (DS7) |
| **The privacy line** | All | ADR 0035 decision 5: one sentence, from the rule pack's default unless the tenant edits it |
| **Validity default** for quotes | All | R1.17 already sets 30 days; shown here, owned there |
| **Bank-transfer details** on invoices | Pro | Owned by D3 and A10 — a **protected change** (R1.29a, ADR 0034). A7 reserves the place on the layout only |
| Per-client terms | Business | Release 3; not designed here |

**Nothing else.** No custom fonts, no free-form text blocks, no uploaded templates (R1.16) — each would be a surface for
breaking the layout or for content no check can see.

## 3. DS2 · One shared layout, and what "presets" are

Brief §10 asks for "a small set of presets, not arbitrary custom layouts".

| Option | For | Against |
|---|---|---|
| **A. (rec) One layout; presets are colour pairs** | One thing to test, on paper and on a phone; every document recognisably the same product; the tenant still picks a look | Less choice of arrangement |
| B. Two or three layouts (logo left, centred, banner) | More individual | Each layout multiplies the tests — every document kind, every country's required fields, long names, many lines — and each is a place for a field to fall off the page |

**Recommendation: A for release 1.** The tenant chooses from six named colour pairs, or (Pro) his own two colours
within DS3's rule. A second layout can follow later as its own small design, if tenants ask for it.

## 4. DS3 · Colours that stay legible

A contractor will pick his brand's yellow. Yellow text on white cannot be read in sunlight.

- **Colours are never used where legibility depends on them.** Body text, numbers and totals are always near-black on
  white. The primary colour fills the header band and the table's header row; the accent marks rules and the total's
  underline.
- **Text that sits on a colour is chosen by contrast**: on the header band, white or near-black, whichever gives the
  higher contrast ratio — and the band is used only if one of them reaches **4.5:1** (WCAG's level for normal text).
  A colour too pale for either is used for rules only, and the band falls back to the neutral colour, with the
  settings screen saying so before saving.
- The check is code in the shared core, used by the settings screen and the renderer alike (Rule 7), so the screen's
  preview and the PDF cannot disagree.

## 5. DS4 · What each document shows

One layout, read from the **sealed snapshot** (R1.13), never from live settings:

1. **Header**: the logo in a box bounded in both directions (as the original did), the trading name, the address, the
   contact details, and the registration number where T8 requires it.
2. **Title and number**: the rule pack's title for the kind and the tenant's registration (T8: "Quote", "Tax Invoice",
   "Invoice", "Credit Note"), the number with its revision suffix (ADR 0031: "Q-0042 rev 2"), the issue date, and for
   a quote its valid-until date (R1.17); for an invoice the supply date (T8).
3. **The client**: name and address, as frozen on the issue (T8).
4. **Lines**: description, quantity, unit, price, amount; per-code tax as T8 requires; totals. **Money is formatted by
   the shared core** (Rule 7) — "J$12,500.00".
5. **Terms**: the snapshot's terms text for the kind.
6. **Payment details** on an invoice: the reserved place D3 fills.
7. **Footer, every page**: the privacy line (ADR 0035 decision 5), "Page 2 of 3", and the document number again, so a
   loose page is identifiable. **Never Pryvis's name or logo**, on any tier (the owner, 2026-10-10) — the document's
   metadata names the tenant as author; the PDF's "producer" field is the only place software is named, and it is not
   shown on the page.

**Long content breaks across pages, never off them.** A line's description may wrap; the table's header repeats on each
page; the totals are never orphaned from the last line. Each is a test (§10).

**What a document never shows:** the catalog date (R1.13a puts it on the **internal copy** only, below), costs or
margins, the acceptance bar, or anything the tenant has not chosen to send.

**The internal copy** (R1.13a): the same layout with an "Internal copy — not sent" band and the catalog date. Made on
demand, never stored, never hashed, never sent. **A draft preview** is the same, with "Draft — not issued" across each
page. Neither can reach a client: no share link, no message and no download from the share page can point at either.

## 6. DS5 · The renderer and its fonts

| Option | For | Against |
|---|---|---|
| **A. (rec) `@react-pdf/renderer` in the API, carried from the original** | Pure Node, no browser; the original's layout logic is reviewed and ported; document metadata, including **its creation date, can be set** (its documentation lists `creationDate`), so the stamp is the sealed time, not the clock | **Its documentation mentions no tagged-PDF support**, so screen readers get untagged text (§10's residual); variable fonts are refused ("only TTF and WOFF fonts files are supported") |
| B. HTML in headless Chromium | Rich layout; tagged PDFs are possible | A browser in the API: hundreds of megabytes, memory, and a large attack surface for tenant-supplied text |
| C. A low-level library (pdf-lib, PDFKit) | Small | Layout, wrapping and page breaks written by hand — the bugs this product does not need |

**Recommendation: A.** **Fonts: Noto Sans, embedded** (its repository states "the SIL Open Font License, Version 1.1"),
so every client's name renders — accents, other scripts — the same on every device, and nothing is fetched from a font
host at render time (Rule 20's spirit). Static TTF files are needed because the renderer refuses variable fonts; that
they are available is a **C4 check**.

**Same input, same bytes** is the goal, so that a render can be tested against a stored expected file: the creation
and modification dates are the sealed time, and nothing random goes in. Whether the renderer adds anything else that
varies (an internal id) is a **C4 check**; if it does, the test compares the PDF's text and layout, not its bytes.

## 7. DS6 · When a PDF is made, what is stored, and how it stays the record

**When:** once, **when the issue is numbered** — at sealing on the web; at sync on the mobile app later (R1.18) —
because the number is printed on it. Never again for that issue.

**What is stored:**
- the PDF, in the files bucket (RG2) at `tenants/<tenant_id>/render/<uuid>`;
- a `document_render` row: its storage key, **SHA-256**, byte size, and its `settings` — what it was made with: the logo
  object's key and hash, the colours, the preset, the terms version, the rule pack's version, the font's version and
  the renderer's version.

**How it stays the record** (R1.16a):
- **Re-served, never re-rendered.** The share page, the tenant's download and the staff console all read the stored
  bytes, **check their SHA-256 against the row, and refuse on a mismatch** (alerting the owner) — as RG2 already
  requires.
- **A settings change never touches an issued document.** The render reads the issue's snapshot (R1.13), not the live
  settings, and the issued PDF is already stored.
- **If stored bytes are lost or fail their hash,** they are restored from the backups (RG2). A **new render is never
  substituted silently**: if one is ever made — for example, after a backup is also lost — it is a **new
  `document_render` row with its own hash**, marked as a re-render with its reason, and any acceptance keeps pointing at
  the original row (`docs/design/acceptance-evidence.md`).

**The rule the database can hold:** `document_render` is insert-only, like the issue it belongs to. That a render is
never replaced is a C4 test (an update and a delete are refused), not a sentence (Rule 21.10).

## 8. DS7 · Who may change the settings, and what a change does

- **The tenant's owner** changes document settings in release 1 (roles beyond owner and member are release 3, ADR 0029
  E3).
- **Each change is a new version** of the settings row (the version column it already has, Rule 6's sense of a
  revision), recorded in the audit log: who, when, which fields — not the values of personal fields.
- **A change applies to documents sealed after it.** The settings screen says so in one sentence, and shows a preview
  rendered from the new settings with sample data.
- **The logo is replaced, never edited**: a new upload is a new object; the old one stays while any issued document's
  render records it, so the record can always be explained.

## 9. DS8 · Offline, copies and retention

- **Offline (the mobile app, G1):** the logo and settings are cached on the device so a draft preview works with no
  signal; **the issued PDF is still made by the server at sync**, when the number exists (R1.18). The mobile design
  owns the cache.
- **Copies of a PDF:** the files bucket; its backups (RG2, 35 days); what the client downloads; and any print. The share
  page's link expires (A9); a downloaded copy is the client's.
- **Retention:** an issued PDF is kept as long as its document — the tax-record period (ADR 0035's schedule). A PDF
  cannot be redacted, so when the document's personal fields are anonymised at the end of that period (R1.44), **the
  PDF is deleted**, and the financial record stays without it. A client's erasure request inside the tax period does
  not remove the PDF, because the law requires the record; A11 answers the person with that.

## 10. What gets built, tests, what this does not do, decisions for the owner, sources

**Decisions for the owner:**

| # | Decision | Recommended |
|---|---|---|
| DS1 | What a tenant sets, by tier — logo (all), colours (Pro), terms (all), bank details reserved for D3 | As written |
| DS2 | **One layout; presets are colour pairs** | A, one layout |
| DS3 | Colours used only where legibility does not depend on them; the 4.5:1 rule | As written |
| DS4 | What each document shows; the internal copy and draft never reach a client | As written |
| DS5 | `@react-pdf/renderer`, carried from the original; Noto Sans embedded | A |
| DS6 | **One render, at numbering, stored and hashed; re-served, never re-rendered** | As written |
| DS7 | Owner-only changes, versioned and audited, applying to later documents | As written |
| DS8 | Offline preview from a cache; the PDF deleted when its document is anonymised | As written |
| — | **A "Sent with Pryvis" line on Free tenants' documents?** `docs/TIERS.md` was silent. It would advertise the product on every Free quote; it is also our name on the tenant's document | **Decided by the owner, 2026-10-10: no** — no Pryvis branding on any document, any tier; and the site's Free tier says so (Your name on your documents, never ours — no Pryvis branding, even on Free), with `docs/TIERS.md` recording it |

**What gets built** (C4, issuing): `document_settings`' new columns, by a new migration (Rule 6); the settings screen
and its preview; the contrast rule in the shared core; the renderer module in the API with the embedded font; the
render at numbering, its storage and `document_render` row; the hash-verified serving path; the internal copy and draft
preview. The entitlement checks for colours go through D5's service.

**Tests, each proved with a planted defect:**
- **An issued PDF never changes**: changing the settings after an issue leaves its stored bytes and hash unchanged, and
  a new issue uses the new settings. Plant: the render reading live settings.
- **Re-served bytes are verified**: one altered byte is refused and alerted. Plant: the check skipped.
- **`document_render` is insert-only**: an update or delete is refused by the database. Plant: a grant added.
- **A pale colour cannot make text illegible**: a yellow primary gives a neutral band and a warning; text on every band
  meets 4.5:1. Plant: the contrast check bypassed.
- **Colours need Pro**: a Free tenant's colours are refused through the entitlement service, naming the tier. Plant: the
  entitlement check removed. (No guard yet stops a plan comparison at a call site; Rule 14 asks for one, and it is owed
  with the entitlement service at D5 — not claimed here.)
- **Long content**: 200 lines, a 2,000-character term, a 120-character client name and a very wide logo each stay on
  their pages; the table's header repeats; totals are not orphaned. Plants: wrapping disabled; the logo box unbounded.
- **Every character renders**: client names in accented Latin, Greek and Cyrillic come out as text, not boxes. Plant:
  Helvetica in place of the embedded font.
- **Required fields** (T8): a registered tenant with no registration number cannot issue a tax invoice. Plant: the
  check removed — T8's own test, run against this layout.
- **The internal copy and draft cannot reach a client**: no share link, message or share-page download can address
  them. Plant: a draft given a share link.
- **Same input, same output**: two renders of one snapshot are identical (or, if C4 finds a varying field, identical in
  text and layout). Plant: the clock used as the creation date.

**What this does not do (Rule 21.4):**
- **The PDF is not tagged for screen readers** — the renderer's documentation mentions no tagged-PDF support. The share
  page (A9) shows the same document as accessible HTML; the PDF is the printable record.
- **It does not design bank-transfer details** (D3, A10), per-client terms (release 3), or the share page (A9).
- **It does not prove the PDF is legally sufficient** as a tax invoice; T8's fields are unverified until the accountant
  answers (OA9).
- **A tenant can still choose ugly colours**; DS3 keeps them legible, not tasteful.

**Checks at C4** (vendor capabilities not confirmed from public pages): static Noto Sans TTF files are available; the
renderer adds nothing that varies between identical renders; it embeds only the glyphs used, or the file size stays
small; Noto Sans covers the scripts tested.

**Sources** (read 2026-10-10): `@react-pdf/renderer` — [fonts](https://react-pdf.org/fonts) ("only TTF and WOFF fonts
files are supported"; variable fonts not supported) and [the Document component](https://react-pdf.org/docs/v4/components/document)
(`creationDate`, `modificationDate`, `language`; no tagged-PDF support mentioned); Noto Sans —
[its repository](https://github.com/notofonts/latin-greek-cyrillic) ("licensed under the SIL Open Font License, Version
1.1"); WCAG 2.1 success criterion 1.4.3, contrast of 4.5:1 for normal text.

## 11. The mistakes this design is checked against (Rule 24)

Each row carries one of three verdicts, as A6's §13 settled: **Mechanical now** (a named check that runs today), **C1/C4
test** (specified here, not yet running), or **Not mechanical** (a person catches it, named).

| Mistake | How this design answers it | Verdict |
|---|---|---|
| **RR6** (A5), MR14 (A6) — a vendor fact without the vendor's page | Every vendor fact in §10's sources is a page read on 2026-10-10; three capabilities are marked C4 checks | **Not mechanical** — the independent read checks each fact |
| **M45** — a deferral left standing after its step is decided | This design defers to D3, A9, A10, A11 and G1 by name; when each is ticked, the deferral checker will flag any "decided in" phrase left standing | **Mechanical now** for the phrases `tools/check_deferrals.py` knows; **not mechanical** for other wordings |
| **M13, M29** — a twin left contradicting its sibling | On approval, `document_settings`'s schema comment, the domain model's row, and `docs/PRD.md` R1.16's wording are checked against DS1-DS6 in the same change | **Not mechanical** — the independent read and the closing check |
| **M23, M39** (Rule 21.10) — prose claiming who writes a table | "Never replaced" is stated as a C4 test of the database's grants, not as a sentence | **C4 test** |
| **RR2** (A5), MR20 (A6) — a residual stated too narrowly | The untagged PDF, legal sufficiency and the varying-bytes risk are each stated with their mechanism | **Not mechanical** — the read |
| **OR11, RR4, MR15** — copies not listed | DS8 lists every copy of a PDF and its lifetime | **Not mechanical** — the read |
| **M28** — a property claimed and never executed | "An issued PDF never changes" and "re-served bytes are verified" are each a planted test in §10 | **C4 test** |
