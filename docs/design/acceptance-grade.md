# Design: the acceptance grade, its evidence, and the bar (J6, J7, J8)

**Status: APPROVED by the owner 2026-10-01 — every recommendation (option A throughout, D1-D7); D4 then
reversed to a per-tenant key after the re-review (W7), and superseded issues settled (W4: no grade, no
evidence, no response).** Built
by `new-app/db/migrations/20260927180000_acceptance_grade/migration.sql`.

Date: 2026-10-01 · Answers findings **J6**, **J7** and **J8** of `../PRD-REVIEW-4.md` · Amends
`acceptance-evidence.md` §4.2, §4.3, §4.4, §7 and §9 once approved · Delegation (Rule 16.5): Opus — it
decides what the product tells a contractor their acceptance is worth in a dispute.

---

## 1. What the three findings say, in one paragraph each

- **J6.** Three documents say the grade is "derived" and none says *how*: max, latest or set; what a
  deposit against a decline grades; whether a withdrawn acceptance keeps its grade; and §7's proof
  ("remove an evidence row, the grade falls") needs a superuser to defeat the very immutability §7 also
  asserts, and passes or fails depending on which row is removed.
- **J7.** The four columns prepared for inbound replies have no uniqueness key, so a webhook retried by
  Meta or Google inserts a second undeletable evidence row — M18 again, one table over. And the "reserved
  reply address" names no artefact.
- **J8.** The bar ("this quote is accepted when …") is set on the mutable `quote`, never frozen into the
  issue, so a tenant can lower it after the client has the document. `document_settings` is cited as if
  it exists; it does not. And §4.3 (the bar decides "accepted") contradicts §4.4 (invoicing unlocks at
  grade 2 regardless).

## 2. Facts already settled, which narrow the choices

1. **One accepted row per issue, declines unlimited, withdrawn is final** (J13, built:
   `acceptance_accepted_issue_key`).
2. **A deposit is an invoice of kind `deposit`** (R1.23; `invoice_kind_check`), and every invoice needs
   the ceiling, which needs an accepted, unwithdrawn acceptance (`issue_ceiling_minor`). **So a deposit
   cannot be invoiced before an acceptance exists.** This decides more of J6 and J8 than either finding
   noticed.
3. **Rule 6:** what was asked of the client freezes at seal.
4. **Payments are not built.** A deposit's "paid" fact will arrive from WiPay or a bank — itself an
   at-least-once webhook.

**Not a decision — how the grade is computed mechanically.** Each evidence row carries a `kind`, never a
grade: `tenant_recorded` (1), `signed_copy_uploaded` (1), `link_tap` (2), `code_verified` (3),
`inbound_reply` (4), `deposit_paid` (6). The mapping lives in ONE SQL function,
`acceptance_grade(issue_id)`, shaped like `quote_issue_state()`. So a retired grade 5 cannot be asserted
(no kind maps to it), and re-grading a kind is a reviewed function change, never a data change. The
acceptance's own act (a link tap, a verified code, a tenant's record) is its first evidence row, written
in the same transaction and required at COMMIT by a deferred trigger, so there is one combining rule and
no second source of the grade.

## 3. The decisions

Each has a recommendation, marked **(rec)**, and the reason.

### D1 · How evidence combines into a grade (J6)

| Option | For | Against |
|---|---|---|
| **A. The highest grade among the evidence (rec)** | "Rises when evidence arrives" becomes true by definition; a weaker later row cannot weaken a deposit; one number to compare with the bar | Hides that the other pieces exist — so the screen must list them, not just show the number |
| B. The most recent | Simple | A later tenant note (grade 1) would erase a paid deposit's grade 6 — the record would understate itself |
| C. No number, only the set | Most honest | Nothing to compare with the bar; every consumer invents its own combining rule, which is the J6 defect |

### D2 · What evidence may attach to — the deposit-against-a-decline case (J6)

| Option | For | Against |
|---|---|---|
| **A. Only the issue's accepted acceptance; refused at insert otherwise (rec)** | The case J6 found becomes unrepresentable. Fact 2 means a deposit can only exist after an acceptance anyway | A client who pays without tapping accept must be recorded as accepting first — but fact 2 already requires that |
| B. Any response row, graded only when accepted | Keeps everything | A grade-6 row sits on a decline forever, and every reader must remember to filter it — the trap J6 describes |
| C. The issue, not a response | Evidence survives a decline-then-accept | Evidence before acceptance is graded against nothing, and a deposit can't precede acceptance (fact 2) |

### D3 · What a withdrawn acceptance grades (J6)

| Option | For | Against |
|---|---|---|
| **A. No grade (NULL), read as "withdrawn"; new evidence refused (rec)** | Matches the ceiling, which already reads 0 once withdrawn; the evidence rows stay as history | A screen must say why there is no grade |
| B. Keeps its highest grade | Nothing to explain | Reports grade-6 evidence for an acceptance the tenant retracted — the record overstates itself |
| C. Grade 0 | A number | 0 isn't on the ladder; it reads as "grade 0 evidence" rather than "no acceptance" |

### D4 · The idempotency key for third-party evidence (J7)

**Reversed by the owner, 2026-10-01, after the re-review (W7): the key is per tenant — option B as
amended below — not A.** A was approved on the reason "provider ids are unguessable", which is false for
bank references and for email Message-IDs, which the sender chooses: the global key let one tenant probe
whether another holds a bank reference. A retried webhook comes back to the tenant it was first
attributed to, so `(tenant, source, external_id)` still stops every replay. *(Note, 2026-10-02, PRD review 5 finding B21: release 1 has no bank integration, so a bank reference the tenant types is **not** `deposit_paid` evidence — a hand-recorded deposit is `tenant_recorded`, grade 1; only a provider-confirmed payment is grade 6. The key above still governs whatever provider ids arrive.)* Built by
`new-app/db/migrations/20260927190000_rereview_fixes/migration.sql`. The table below is kept as decided
at the time.

| Option | For | Against |
|---|---|---|
| **A. Unique `(source, external_id)` across all tenants, where an external id is present (rec)** | Same shape and lesson as `variation_issue_client_reference_key`; a provider's message or transaction id names one event in the world, so one row, ever. Covers deposit webhooks too (fact 4), not just replies | A collision across tenants would be refused; provider ids are unguessable, so it reveals nothing practical |
| B. Unique per tenant | Strict tenant separation | The same provider event could be recorded under two tenants — the duplicate the key exists to stop |

### D5 · The reply address (J7)

J7 asked derived or stored. **The finding misses something: the preparation's premise is wrong.** An email's reply address is in the email that was sent. No database column makes an email already sent attributable. Worse, if release 1 sets Reply-To to an address we host while nothing receives mail there, the client's replies vanish. Today they reach the contractor.

| Option | For | Against |
|---|---|---|
| **A. Derived from the issue id, no column; release 1 keeps Reply-To as the tenant's own address; grade 4 applies only to issues sent after inbound mail is switched on (rec)** | Free; can't drift; clients' replies keep reaching the contractor; states the truth that release-1 quotes never earn grade 4 | Release-1 quotes stay at grade ≤3 (or 6 with a deposit) for life |
| B. Derived, and release 1 sends Reply-To to us, forwarding to the tenant | Release-1 quotes become attributable later | Needs inbound mail infrastructure and a new sub-processor in release 1 — exactly what decision 2 of 2026-09-26 deferred |
| C. A stored `reply_address` column on `quote_issue` | Format can change later | Stores what nothing reads in release 1, and still doesn't fix emails already sent |

### D6 · Whether the bar gates invoicing (J8)

**Not a decision:** the bar is frozen at seal in a new column on `quote_issue`, `acceptance_bar_grade` (2, 3 or 6 — proposed, not built), resolved from the quote or the tenant default. The quote's own bar is nullable, meaning "use the default". Changing a default never touches an issue already sealed (Rule 6).

| Option | For | Against |
|---|---|---|
| **A. No — the ceiling unlocks on any accepted, unwithdrawn acceptance, as built; the bar decides whether the product calls it "accepted to your standard" or "accepted, deposit not yet paid" (rec)** | Matches the built SQL (§4.4 said "grade 2 or above" until W3 corrected it to this); keeps the ordinary undisputed job flowing; the frozen bar makes the J8 trick visible forever instead of silent | A tenant can still invoice a job whose bar isn't met — by design, the bar is a record and a prompt, not a lock |
| B. Yes — no invoice until the grade meets the bar | Strongest | **Unbuildable for a grade-6 bar:** the deposit is itself an invoice (fact 2), so it could never be issued |
| C. Yes, except deposit invoices | Enforces the deposit before other billing | A second ceiling rule keyed on invoice kind, and more surface for the race shapes `new-app/CLAUDE.md` already lists |

### D7 · `document_settings` (J8)

| Option | For | Against |
|---|---|---|
| **A. Build it now, minimal: one row per tenant, default bar (3, per decision 1 of 2026-09-26) and the deposit threshold, nullable (rec)** | The default bar needs a home before the first seal; small | One more table now |
| B. Don't build it; the application supplies the default; reword R1.20g | Less now | The default lives in code, and the PRD names a table that doesn't exist until someone builds it |

## 4. What gets built once D1-D7 are answered (option A throughout)

One migration:

- `acceptance_evidence`: kind, source, external id, provider-reported sender, received-at, who recorded it. Row security allows read and append only, with a composite key to `acceptance`.
- A trigger refusing evidence on a decline or a withdrawn acceptance (D2, D3).
- The partial unique index (D4).
- `acceptance_grade()` (D1, D3).
- A deferred check that every accepted acceptance has its first evidence row.
- A new column, `acceptance_bar_grade`, on `quote_issue` (NOT NULL), and the same on `quote` (nullable).
- `document_settings` (D7).

Every seal fixture gains the bar column, the way J11's gained a line.

Documents in the same change (Rule 24.6): `acceptance-evidence.md` §4.2–4.4, §7 and §9 decision 2 (five preparations, with the reply address corrected per D5); PRD R1.20d/f/g/h; `domain-model.md`.

**§7's proof, replaced (J6):** compute the grade; insert a higher piece of evidence and the grade rises; insert a lower one and it does not fall; UPDATE and DELETE are refused. Then plant each defect: the index removed (a replayed message is accepted twice), the outcome filter removed (evidence on a decline is accepted), the withdrawal branch removed (a withdrawn acceptance keeps its grade), and the deferred check removed (an acceptance with no evidence row commits).

## 5. What this does not do (Rule 21.4)

- No inbound endpoint, parser or provider. Grade 4 has a kind and a key, and no writer.
- No payments. `deposit_paid` has a kind and a key; nothing writes it until R1.23's payment path exists.
- Provider ids are printable ASCII (finding Y3). An internationalised email Message-ID (RFC 6532 allows
  UTF-8) would be refused: it fails closed, and is to be revisited when the inbound writer is built (Z5).
- Nothing about the share page or how a below-bar acceptance reads on screen.
- Nothing about legal sufficiency. That remains the attorney's answer (ADR 0024).
