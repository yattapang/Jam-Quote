# Design: how a client accepts, and what that acceptance is worth

**Status: APPROVED by the owner 2026-09-26 · independent review OUTSTANDING (Rule 1.10).**

| Gate | Question | State |
|---|---|---|
| **Owner approval** | Is this what you want built? | ✅ **2026-09-26**, with the three §9 decisions answered |
| **Independent review** | Will this do what it says? | **Outstanding** — no code until it closes |

Date: 2026-09-26 · Closes findings **H9** and **H10** · Supersedes part of
[ADR 0024](../adr/0024-acceptance-evidence.md) · Delegation (Rule 16.5): Opus — it decides what a
document is worth in a dispute.

---

## 1. The problem, and what the owner has told us

Two findings, both about the same sentence in the PRD.

- **H9.** Acceptance requires a one-time code sent to "the channel the tenant holds for that client", and
  **nothing requires a client to have a channel at all.** For a client with no email, W5's core flow has
  nowhere to send anything.
- **H10.** The channel is supplied by **the tenant**. So a code sent to it, and confirmed by whoever holds
  it, proves nothing against the party most likely to be in a dispute with the client: the tenant.

The owner's information, which changes the shape:

> The client will have either or both WhatsApp and email. They can respond to the quote as accepted and
> there has to be some form of deposit payment, if the tenant so chooses to confirm acceptance, or accept
> by responding in an email, WhatsApp, e-signature.

That is not one mechanism. It is **several, of different evidential strength**, and the tenant picks which
one counts for a given job. Designing it as one mechanism is what produced both findings.

## 2. What cannot be fixed, stated before anything else

**No mechanism in which the tenant supplies the counterparty's address can prove anything against the
tenant.** A code sent to an address Delroy typed, confirmed by whoever holds that address, is worth
nothing if Delroy holds it. No amount of cryptography touches this, and a design that implied otherwise
would be the third version of ADR 0024's original mistake.

Only two things help, and this design uses both:

1. **A third party the tenant does not control enters the chain** — money (a bank or WiPay), an inbound
   message (Google or Meta), or a signature provider that does identity checks.
2. **The evidence is labelled honestly**, so nobody relies on more than exists.

## 3. What this must achieve

1. A client with **only** WhatsApp, or **only** email, can accept.
2. A contractor at a gate who does not yet have either can still seal and send later.
3. The tenant can require a **deposit** as the thing that confirms acceptance, per the owner's words.
4. The record says **what actually happened** and never more.
5. Invoicing is not blocked for the ordinary job nobody disputes.
6. Nothing claims legal sufficiency; that remains the attorney's answer (ADR 0024).

## 4. The shape

### 4.1 The channel (H9)

**A channel is required at the point of use, not on the client row.** A `client` may exist with neither
address — a walk-up at a gate is a real client — but **a share link may only be minted for a client with
at least one channel**, and the channel may be typed at send time rather than stored.

The `acceptance` records **which destination was actually used**, not which ones were on file. That is the
fact that matters later.

### 4.2 The ladder (H10)

One `acceptance` per issue, and an **append-only `acceptance_evidence`** table, because the owner's flows
produce *several* pieces for one acceptance — a WhatsApp reply *and* a deposit. The **grade is derived**
from the evidence rows, exactly as issue state and invoice status already are (ADR 0025 decision 3), so
there is no stored grade to drift.

**The doctrine, which comes before the table because getting it wrong is what produced finding J5: the
grade measures WHO WITNESSED the acceptance, never how convincing the artefact looks.** A signed page looks
like strong evidence, and that is exactly why it was mis-ranked.

| Grade | Evidence | Who witnesses it | Available in R1? |
|---|---|---|---|
| 1 | Tenant records "the client agreed" — **including a tenant-uploaded signed document or screenshot** | **nobody** | Yes |
| 2 | Someone holding the link tapped accept | possession of a link | Yes |
| 3 | One-time code to a stored or typed channel | the channel holder — *if the channel is genuine* | Yes, by email |
| 4 | The client's **own reply**, by email or WhatsApp | Google / Meta | **No — see §6** |
| ~~5~~ | **Retired 2026-09-26 (J5).** Was "a signed document returned and uploaded", witnessed by "the client's hand" | — | — |
| 6 | **Deposit paid** | the bank or WiPay | Yes |

**Why grade 5 was wrong, and why its number is tombstoned rather than reused.** A signed document
*uploaded by the tenant* comes from the tenant's device, with the tenant's credentials, and no third party
is in the chain at any point — so by §2's own test it cannot outrank anything, let alone grade 4, the one
grade that has Google or Meta in it. §6 of this document already convicted a tenant-uploaded screenshot as
"grade 1 dressed as grade 4"; a scanned signature arrives by the same path and the same argument applies.
The design asserted "the client's hand" as a witness when nobody in the system has seen the client's hand.

The number stays retired rather than being reused by grade 6, for the reason Rule 23.2 gives about rule
numbers: other documents cite these grades, and a reused number turns an old citation into a confident lie.

**The artefact is still recorded, and it still matters — as a fact, not as a grade.** `acceptance_evidence`
holds "a signed document is on file", with who uploaded it and when. In a dispute between the client and
the tenant that document may be the most useful thing in the file; we simply are not the ones vouching for
it, and the grade is our attestation rather than a rating of the paperwork.

**A client-uploaded document is a different thing and earns a real grade.** If the client attaches the
signed page through the share link, the file arrives from a session the tenant does not control — the same
difference as between a tenant's screenshot and an inbound reply. That is **deferred**, because it means an
upload endpoint open to an unauthenticated party, which needs the malware scanning and object storage
decisions that are still open (`../SERVICE-REGISTER.md` §3a). When it lands it becomes a new grade beside 4,
and grade 5 stays retired.

### 4.3 The tenant chooses the bar

Per quote, with a tenant default: *this quote is accepted when …* grade 2, grade 3, or **grade 6 (a
deposit)**. That is the owner's "if the tenant so chooses" made into a setting rather than a convention.

### 4.4 What stays strictly separate

**The invoicing ceiling unlocks on operational acceptance (grade 2 or above). The evidence grade is a
separate recorded fact.** Conflating them would stop the product working for the overwhelming majority of
jobs nobody ever disputes — and ADR 0024 already made the opposite mistake once, by treating a typed name
as proof.

## 5. Trade-offs, and what was rejected

- **Require a channel on every client** — rejected. It makes the gate flow fail for a walk-up client,
  which is the one moment the product must not fail.
- **A stored `evidence_grade` column** — rejected. It is derivable, and a stored derived value is the
  second source of truth that produced the old application's negative amount due.
- **One mechanism for everyone** — rejected; it is what produced H9 and H10. A $40,000 fence and a
  $400 gate repair do not need the same proof, and forcing the heavier one on both means contractors
  route around the product.
- **A commercial signature provider** (DocuSign and similar) — **not rejected, deferred.** It genuinely
  solves §2 by putting an identity-checking third party in the chain. It costs money per envelope, adds a
  sub-processor holding client documents, and needs a register entry. Worth revisiting when a tenant asks
  for it, and the ladder means adding it later is a new grade rather than a redesign.
- **Verifying the channel ourselves, independently of the tenant** — rejected as theatre. We would still
  be verifying an address the tenant gave us.

## 6. The dependency that limits this, and it is the honest headline

**Grade 4 — the client's own reply — is the best evidence available short of money, and release 1 cannot
have it.**

- **WhatsApp:** release 1 uses click-to-chat (`TIERS.md`), so the client's reply goes to the
  **contractor's own phone**. We never see it, so we cannot witness it. Inbound WhatsApp needs the
  Business API, which is release 3 and carries Meta verification and per-message cost.
- **Email:** we send through Resend but have **no inbound mail handling**. Receiving a reply means an
  address we host, an endpoint that parses mail, and a new sub-processor — and brief §14 already lists
  "automated inbound-email handling can come later".

So in release 1 the available grades are **1, 2, 3 and 6** — grade 5 is retired (§4.2) and a signed
document uploaded by the tenant is grade 1 — and the strongest one that does not depend on new
infrastructure is **6, the deposit** — which is why the owner's instinct to treat a deposit as
confirmation is the right one, and not merely a convenience.

A screenshot of a WhatsApp reply, uploaded by the tenant, is **grade 1 dressed as grade 4**, and this
design refuses to grade it higher. It is evidence the tenant holds and can fabricate.

## 7. How it will be proved (Rule 21.2)

Each by planting the defect it exists to catch:

- a share link minted for a client with no channel → refused;
- an acceptance whose recorded destination differs from the one the code went to → refused;
- a quote requiring grade 6 marked accepted with no payment → refused;
- an `acceptance_evidence` row updated or deleted → refused by the absence of a policy;
- the derived grade computed with an evidence row removed → the grade falls, proving it is derived rather
  than stored;
- a tenant-uploaded screenshot → recorded at grade 1, never higher;
- a tenant-uploaded **signed document** → also grade 1, and the "a signed document is on file" fact
  recorded beside it, proving the artefact is kept without being graded (J5);
- the retired grade 5 asserted by any row → refused, so the number cannot come back by accident.

## 8. What this design does not prove (Rule 21.4)

- **Nothing about legal sufficiency in Jamaica.** Grade 6 proves money moved against a document; what the
  parties *agreed* still rests on the document's hash. The attorney's answer stands outstanding
  (ADR 0024).
- **Nothing against a tenant who controls the client's mailbox.** §2 says why that is unfixable here.
- **Nothing about the client's identity.** No grade below 6 involves anyone checking who a person is.
- **Nothing about the UI.** Which grade a screen asks for, and how a refusal reads, is application work.

## 9. The owner's decisions, 2026-09-26

**1. The default bar is grade 3** — a one-time code to a stored or typed channel. Available in release 1,
and the tenant remains free to require a deposit on any quote.

**2. Grade 4 (the client's own reply) is bought after growth, and release 1 prepares for it.** Deferred
deliberately, so "prepare" has to mean something specific rather than a good intention. It means exactly
four things and no more:

- **`acceptance_evidence` carries what an inbound message needs from the start**: the channel, the
  external message id, the sender as the provider reported it, and the received-at timestamp. Nullable
  and unused in release 1. This is the one place a column is added ahead of need, and the reason is that
  adding it later means migrating rows that are append-only financial evidence.
- **The grade function already knows grade 4**, so switching it on is a row appearing, not a code change
  to the derivation.
- **The reply-to address convention is reserved now** — quotes are sent with a per-issue reply address so
  a future inbound handler can attribute a reply without guessing. Reserving the shape costs a line;
  retrofitting it means every quote already sent is unattributable.
- **The register records it as an owed decision** with its two costs named — an inbound endpoint and a new
  sub-processor holding client replies (Rule 18).

**Nothing else is built.** No parsing, no endpoint, no provider. If growth never comes, release 1 carries
four nullable columns and a reply address nobody reads, which is the cheapest failed bet available.

**3. A deposit is suggested automatically above a value the tenant sets.** Not a hard rule and not our
number: `document_settings` gains a `deposit_suggested_above_minor` threshold, the tenant sets it (unset
means never), and above it the product **suggests** grade 6 when a quote is sent. The tenant can decline
per quote.

Suggested rather than enforced, because the contractor knows which clients are good for it and we do not —
and a product that refuses to send a quote until the contractor agrees to demand money is a product that
gets worked around.
