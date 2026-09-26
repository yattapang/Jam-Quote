# ADR 0024 — A typed name is not evidence; a proper e-signature can be

> ## AMENDED THE SAME DAY, 2026-09-25 — and the amendment moves work INTO release 1
>
> This ADR was written on the owner's statement that *"the typed name on a phone acceptance record on
> the phone is not legal in a dispute"*, and it parked stronger acceptance in release 2 pending legal
> advice (§5, below). The owner then corrected it: **"esignatures can work."**
>
> Those are two different claims and the distinction is the whole decision:
>
> | Claim | Status |
> |---|---|
> | A **typed name** alone is evidence | **Rejected** by the owner. Everything in §1 and §2 stands unchanged |
> | A **properly constructed e-signature** can hold | **Accepted.** So §5 is wrong to park it, and §3's signed-paper path is a fallback rather than the answer |
>
> The revised decision is in **§6**, which supersedes §5. The original §5 is left in place rather than
> deleted, because an ADR that quietly rewrites itself is worth less than one that shows what changed
> (Rule 1.9).

- **Status:** Accepted
- **Date:** 2026-09-25
- **Decided by:** the owner, answering the question the first Rule 1.10 review raised as F15 and
  ADR 0023 §4 sent to the attorney: **"The typed name on a phone acceptance record on the phone is not
  legal in a dispute."**
- **Affects:** W5 (share and accept), R1.20, the terms, and one sentence of public copy.
- **Delegation (Rule 16.5):** Opus — this changes what a document is worth, which is design, not build.

## Context

R1.20 records a typed name, a timestamp, the IP and the user agent when a client taps *Accept* on a
share link. The PRD treated that as settled evidence. The review flagged it as an **unverified assumption
about the world** (Rule 1.10), and the owner has now answered: it is not legal in a dispute.

**This ADR takes that as given and does not argue it.** Where the bar actually sits is the attorney's to
say, not ours, and nothing below should be read as legal advice.

This is the **second** time a fact about the world has overturned something written into a plan — the
first was global email uniqueness (ADR 0022). Both were caught because they were flagged as questions
rather than asserted, which is the only reason neither cost a migration. Rule 1.10's inclusion of that
category is earning its place.

## Decisions

### 1. Stop implying the record is evidence — everywhere it is implied

- **Public copy.** `site.ts` says of the accept flow: *"you have their answer in writing."* A contractor
  reads that as *I am covered*. It goes. The flow can be described without implying evidentiary weight.
- **The UI states what it recorded, not what it proves.** "Accepted by *name typed*, *date*, from
  *address*" is true. "Signed" and "agreed" are not ours to assert.
- **The terms** must not represent the tap as a signature. This lands in the wording already awaiting the
  owner's approval, so it costs one paragraph rather than a second legal review.

The site's own roadmap already lists *"a signed record of the client's acceptance"* as coming next, so
the site never claimed to have one. The defect was one sentence and the PRD's assumption, not the
positioning.

### 2. Tap-to-accept stays, as an **operational** signal

It is not worthless — it is just not evidence. It is what unblocks invoicing, and R1.24's ceiling is an
**internal control**, not a legal instrument: "do not bill more than was agreed" protects the client and
the contractor's own bookkeeping whether or not a court would care. So the workflow is unchanged and
invoicing is not gated on stronger evidence, which would stop the product working for the common case
where nobody ever disputes anything.

### 3. Release 1 gains a signed-copy path, because it is cheap and it is what contractors already do

> **Amended 2026-09-26 (finding J5).** This section stands, with one correction made in
> `../design/acceptance-evidence.md` §4.2: a signed copy **uploaded by the tenant** is recorded at
> **grade 1, witnessed by nobody**, because it arrives from the tenant's device with the tenant's
> credentials. The path is worth having and the artefact is worth keeping; what was wrong was ranking it
> above evidence with an uncontrolled third party in the chain.

**R1: the quote PDF carries a signature block, and a signed copy can be uploaded against the issue.**
The contractor prints or sends it, the client signs on paper or in a PDF reader, and the photograph or
file is attached to the immutable issue as its own `document_render`-style record with its own hash. No
new entity, no new flow to design — an upload path against `quote_issue`, using the same private,
tenant-scoped, malware-scanned storage R1.36 already requires.

This produces the artefact an attorney would actually ask for, and it costs a fraction of an e-signature
integration. It is the answer for the job where real money is at stake.

### 4. Money is the strongest evidence available, and it is already in release 1

**A paid deposit is conduct.** A client who pays 40% has behaved in a way no typed name matches, and
R1.23 already builds deposit invoicing. So the product records the deposit payment as **corroboration of
acceptance**, linked to the issue, and the recommended flow for anything substantial becomes *accept,
then deposit*. Nothing new is built for this; it is a link and a sentence in the UI.

### 5. Channel-verified acceptance waits for the attorney to say what would suffice

The obvious upgrade is a one-time code to the client's phone or email, so the record proves control of a
channel rather than possession of a link. It is moderate work and it is **release 2, deliberately**:
building a stronger record that still does not cross the bar is waste, and only the attorney can say
where the bar is. The question to ask is narrow — *what would make a client's electronic acceptance
hold?* — and it goes with the terms.

## Consequences

- **R1.20 is rewritten**: the record is an operational acceptance, not a signature, and the requirement
  says so in its own text so nobody re-derives the old assumption from the field list.
- **W5 gains one requirement** (signed-copy upload) and **loses a claim**. Net work: small.
- **The upload dependency hardens.** The signed copy is another hostile file in private storage, so
  ADR 0023's owed decisions on **malware scanning and object storage** (`SERVICE-REGISTER.md` §3a) are
  now load-bearing for W5 as well as W9. Two workflows now wait on those two choices.
- **One sentence of site copy changes**, and it lands with the F5 amendment the owner approved — mark
  undelivered features with the release they land in, rather than removing them.
- **The threat model needs a line**: an uploaded "signed" copy is a document a tenant can forge as easily
  as a client can. We store what we are given and say who uploaded it and when; we do not certify it. That
  honesty is the control.

## 6. Supersedes §5 — a verified e-signature is the release 1 acceptance mechanism

Since a properly constructed e-signature can hold, parking it is the wrong call: it makes release 1 ship
an acceptance record the owner has already said is worth nothing in a dispute, and then asks contractors
to trust it. So **W5's acceptance becomes a verified electronic signature in release 1**, and it is built
to the elements such regimes generally require rather than to whatever is easiest:

| Element | How it is met | Already exists? |
|---|---|---|
| **Attribution** — the signature is tied to a person, not to whoever holds a link | A one-time code sent to the channel **the tenant has on file for that client**, entered to sign. Possession of the link stops being sufficient | `share_link` exists; the code and the verification record are new |
| **Intent** — an explicit act of signing, clearly labelled | A signing step that says it is a signature, separate from reading the quote. Not a generic "continue" | New, and it is a UI requirement as much as a data one |
| **Consent to sign electronically** | Captured and recorded at the moment of signing | New, one field |
| **Integrity** — exactly what was signed, provably | The `document_render` hash is bound into the `acceptance` row (R1.16a already requires one hash, referenced rather than copied) | Exists |
| **Audit trail** | Timestamp, IP, user agent, which channel the code went to, and the verification event | Mostly exists on `acceptance` |
| **Reproducibility** — the signer can be given back exactly what they signed | The immutable issue plus the hashed render | Exists (domain model §6.1) |

**The channel is the real constraint, and it decides the cost.** The code must reach the client on
something the tenant recorded, and:

- **Email is effectively free** through the sender already in the service register — and it needs the
  **verified sending domain** that is already an owner dependency (PRD §9 item 1a). No new service.
- **SMS is a new paid service and a new sub-processor**, absent from the register. It is the channel most
  Jamaican clients would prefer, which makes it a real decision rather than a detail.
- **WhatsApp Business** sending is release 3 and carries per-message cost and Meta verification.

**Recommendation: release 1 verifies by email, and the client record gains a phone number for later.**
If a client has no email, the fallback is §3's signed copy — which is why §3 survives the amendment
rather than being deleted.

**What this does not become:** a claim that our implementation satisfies Jamaica's Electronic Transactions
Act. The elements above are what such regimes generally ask for; whether ours clears the bar is the
attorney's call, and the difference is that we are now designing **toward a standard** instead of parking
the question. The narrow question for them is unchanged and cheap to ask: *does a one-time-code-verified
signature over a hashed document hold?*

## What this does not settle

- **Whether our specific implementation clears Jamaica's bar.** The owner's attorney answers that. §6 is
  built to the standard elements so that the answer is likely yes and cheap to adjust if not — a
  different position from §5's, which was to build nothing until told.
- **Whether a client will sign and return a PDF in practice.** If they will not, the honest position is
  that quotes accepted by tap are commercially useful and evidentially thin, and the contractor should
  know which of their jobs need more.
