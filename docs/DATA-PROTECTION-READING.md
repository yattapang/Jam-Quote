# Data protection — a reading of Jamaica's Act and Regulations for Pryvis

**Recommendations R1-R12 approved by the owner, 2026-10-06; recorded in ADR 0035.**

**General guidance, not legal advice.** This was written on 2026-10-06 at the owner's request ("You will assume the
role of a jamaican lawyer and give us the feedback that we will use as general guidance. We already know and accept
that you cannot give legal advice"). It reads the primary texts and states what they appear to require of Pryvis, and
how the design can meet those requirements at low cost until an attorney is engaged. Every statement cites the
section it rests on, so the attorney can check it quickly. **It is checked by the attorney before launch**
(build step F2; `docs/OWNER-ACTIONS.md` OA10). Until then, nothing in the product or on the site claims compliance on
the strength of this reading.

**Sources**, in `docs/legal-sources/`:

| Text | File | Read from |
|---|---|---|
| The Data Protection Act, 2020 (Act 4 of 2020) | `data-protection-act-2020.pdf` | A scanned copy (120 pages), read by text recognition; **a quotation should be checked against the page image** |
| The Data Protection Regulations, 2024 (Gazette, 4 March 2024) | `data-protection-regulations-2024.pdf` | The text layer |
| The Data Protection (Data Controller Registration) Regulations, 2024 (Gazette, 1 April 2024) | `data-controller-registration-regulations-2024.pdf` | The text layer |
| The Data Protection (Disposal of Personal Data) Regulations, 2024, as affirmed (Gazette, 17 September 2025) | `disposal-of-personal-data-regulations-2024.pdf` | The text layer |

**What these texts do not show**, and is checked with the Office of the Information Commissioner before relying on
it (§10):
- any order or notice made under the Act since — exemptions from registration (s. 15(2)), classes excused from the
  annual impact assessment (s. 45(4)), classes that must appoint a data protection officer (s. 20(6)(d)), countries
  deemed adequate (s. 31(5)(c)), or transfer terms the Commissioner has approved (s. 31(4)(h));
- the Act's commencement dates (s. 1). Public reporting has the main provisions in force from 1 December 2021 and the
  two-year compliance period (s. 76) ending in late 2023. **Treat the Act as fully in force.**

---

## 1. The ten things that matter most, in one table

| # | What the texts appear to require | Where | What it means for Pryvis |
|---|---|---|---|
| 1 | Every **data controller** registers with the Commissioner before processing personal data, pays a fee, and renews each year | ss. 15-18; Registration Regs 3, 4 and the Schedule | Pryvis registers. A company pays J$25,000 the first year and J$15,000 each year after. **Each contractor is probably a controller too** (§2), and registers on its own account |
| 2 | A **data processor** — someone processing on a controller's behalf — is bound through a **written contract**: it acts only on the controller's instructions and keeps equivalent security | s. 30(4)-(5) | For contractors' clients' data, Pryvis is the contractors' processor. Our terms must contain that contract (§2) |
| 3 | A **breach** is reported to the Commissioner within **72 hours**, and **each affected person** is told within **72 hours** | s. 21(3)-(5); Regs 10 | Stricter than most laws: the person must be told within 72 hours too. As processor, we must tell contractors **fast** enough for them to meet it (§6) |
| 4 | Personal data leaves Jamaica only to a country with **adequate protection**, or under a listed exception | s. 31 (the eighth standard) | All our services host outside Jamaica. This is the largest open legal question (§5) |
| 5 | Personal data are kept **no longer than necessary**, under a written retention and disposal policy with **minimum and maximum** periods, and disposed of so they cannot be recovered | s. 28; Disposal Regs 2 | "Kept permanently" is not available. Every kind of record needs a maximum period (§7) |
| 6 | Each controller submits an **annual data protection impact assessment** within 90 days of the year's end, unless excused by notice | s. 45 | A yearly filing for Pryvis, which our design documents can largely produce (§8) |
| 7 | A **data protection officer** is required for public authorities, for anyone processing **sensitive personal data**, for **large-scale** processing, and for any class the Commissioner names | s. 20; Regs 9 | Avoidable at launch if we **never hold sensitive data** and are not "large scale". Watch the e-signature (§4) |
| 8 | People have rights: access (30 days, free when electronic), stopping processing (a written answer in 21 days), correction (30 days), and a machine-readable copy | ss. 6-13; Regs 3-5, 8 and the fee schedule | Mostly the contractor's duty for clients' data; we provide the tools (§9) |
| 9 | Direct marketing needs consent, or the person must be a customer offered an opt-out at collection and in every message; consent is asked for **once** only | s. 10; Regs 7 | Marketing email to contractors works under the "customer" route with an opt-out in every message (§9) |
| 10 | Consent is not freely given if it is a **condition of the service** beyond what the service needs | s. 9(2)(b) | The price-index consent (brief §5a) should not be bundled into sign-up. Better: make the index **not personal data at all** (§4) |

**Penalties, for scale:**
- Most offences carry fines of up to J$2 million and imprisonment in the Parish Court (ss. 18, 21).
- Processing without the Commissioner's assessment where one is required carries up to J$5 million or five years
  (s. 19).
- A company can be fined up to **4% of its annual worldwide turnover** (s. 68(1)), and directors can be personally
  liable (s. 68(3)).
- People can claim compensation (s. 69).
- The Commissioner can issue fixed penalties (s. 62).
- Due diligence is a defence to several offences (ss. 16(8), 18(2), 21(7)), **so written policies and records of what
  was done are themselves protection.**

## 2. Who is the controller, and who is the processor

The Act's definitions (s. 2) decide everything else:
- **A controller** decides *why and how* personal data are processed.
- **A processor** processes them *on a controller's behalf*, and is not its employee.

**Our reading for Pryvis:**

| Personal data | Whose | Controller | Pryvis's role |
|---|---|---|---|
| A contractor's **clients** — names, addresses, phone numbers, emails, job details, acceptance evidence | The clients | **The contractor**, who decides to quote them and why | **Processor**, acting on the contractor's instructions |
| The contractor's **own account** — users' names, emails, sign-in records, plan, payments to Pryvis | The contractor's users (and a sole trader personally) | **Pryvis**, which decides why it holds them (to run the service and bill it) | Controller |
| **Support tickets** (`docs/design/support-and-feedback.md`) | The writer, and anyone named in it | **Pryvis**, for answering support | Controller. A ticket can also mention a client, which is why SF7's redaction and deletion rules exist |
| **Website visitors**, prospective customers, the `info@` mailbox | Each person | **Pryvis** | Controller |
| **Staff** | Our staff | **Pryvis** | Controller |
| The **price observations** (R1.41) | Usually nobody (§4) | — | Not personal data, if designed as §4 says |

**Why this split matters, and keeps costs down:**
1. A processor is not itself required to register for the data it processes on others' behalf. The registration duty
   (s. 15) and most standards attach to the controller (s. 21(1)). Pryvis registers for **its own** controller data,
   which is far narrower than "all the data in Pryvis".
2. A processor's duties come through **the contract** (s. 30(5)). Pryvis can therefore set out its duties once, in its
   terms, for every contractor at once.

**What the terms must contain — the processing contract** (s. 30(4)-(5)), in plain words:
- Pryvis processes clients' data **only to provide the service the contractor uses**, on the contractor's
  instructions, and for nothing else;
- Pryvis keeps security measures **equivalent to the seventh standard** (s. 30(1), (6)): encryption,
  confidentiality, integrity, availability, recovery, and regular testing — which the design already does (privilege
  model, row-level security, backups and restore drills in A4);
- Pryvis **tells the contractor about a breach** affecting their clients within **24 hours** of becoming aware, so the
  contractor can meet its own 72 hours (§6);
- Pryvis **helps the contractor answer** a client's request (access, correction, deletion) through the tools of
  design A11;
- Pryvis names its **sub-processors** (the hosting, email and storage services) and the **countries** they are in
  (§5), because the contractor needs both for its own registration (s. 16(2)(f)-(g));
- at the end of the service, Pryvis returns the data (the export, R1.43) and then deletes it on a stated schedule (§7).

**The consequence for contractors**, which they should be told plainly: a contractor who keeps clients' personal data
is, on this reading, a **data controller** who must register (s. 15) — J$7,500 the first year for a sole trader,
J$25,000 for a company, then J$5,000 or J$15,000 a year (Registration Regs, Schedule) — unless an exemption order
under s. 15(2) covers small businesses (§10, question 1). This duty exists whether or not they use Pryvis, so Pryvis
does not create it. But a help article should say so, and Pryvis can make it easy: a screen that lists what the
contractor needs for **its** registration — the categories of data, the purpose, the recipients, and the countries
where Pryvis stores it.

**If the Canadian company is in the structure** (ADR 0033; the owner's open question):
- A controller *not established in Jamaica* that offers services to people in Jamaica is covered by the Act
  (s. 3(1)(b)(ii)), and must **appoint a representative established in Jamaica** (s. 3(2)).
- If the Canadian company sells the subscriptions, it is the controller of **billing data** — the names and emails of
  the contractors' users, and the billing records. It then registers too (another J$25,000, then J$15,000 a year), and
  appoints a Jamaican representative. **The Jamaican Pryvis company can be that representative, at no extra cost.**
- The cleanest split: the **Jamaican company is the controller of everything except billing**, and the processor for
  contractors' clients; the **Canadian company is the controller of billing only**, with the Jamaican company as its
  representative. Stripe is the Canadian company's processor for card payments, and holds the card data itself.
- *(Pointer 2026-10-09: by the owner's choice in `docs/design/third-party-register.md` RG6, the Canadian company also
  holds the support mailbox's Microsoft account, so it handles support mail — including what clients write — for
  Pryvis. "Controller of billing only" no longer describes all it does; its role for that mail goes to the attorney
  with OA10.)*

## 3. Registration — what Pryvis must file, and when

**When:** before Pryvis processes personal data as a controller (s. 15(1)). That means **before the first real
contractor signs up** — the soft launch, build step F4. Use by the owner's own test accounts arguably processes only
the owner's own data, but registering before staging uses any real person's data is the safe course. The filing is
online, on the Commissioner's website (Registration Regs 4(1)).

**What it asks** (s. 16(2); Registration Regs 3(1)), and where our documents already hold the answer:

| Particular | Our source |
|---|---|
| Name, trade name, registered office, principal place of business, telephone numbers, TRN | The company's records |
| Data protection officer, or, if none is required, an authorised officer's contact details (Regs 3(1)(d), (f)) | §4: the owner, as authorised officer |
| Description of the personal data and the categories of people | §2's table; `docs/design/domain-model.md` |
| Purposes | §2's table |
| Recipients | The register, `docs/SERVICE-REGISTER.md` |
| **Every country outside Jamaica the data goes to, directly or indirectly** (s. 16(2)(g)) | §5's table |
| Number of locations, including any outside Jamaica (Regs 3(1)(i)) | The company's records |
| **Estimated number of people whose data is processed each year** (Regs 3(1)(j)) | An honest estimate from the business plan |
| Joint controllers (Regs 3(1)(k)) | None in the recommended split; the Canadian company files separately |
| **Number of processors, and the countries they operate in** (Regs 3(1)(l)) | §5's table |
| **Which lawful condition of s. 23(1) applies** (Regs 3(1)(m)) | §4: contract (s. 23(1)(b)) for contractors' accounts; legitimate interests (s. 23(1)(f)) for support and security, with the written assessment Regs 11(2) requires |
| Whether sensitive personal data is processed (Regs 3(1)(n)) | **No**, by design (§4) |
| Whether decisions are made solely by automatic means (Regs 3(1)(o)) | **No.** Keep it that way: nothing in Pryvis decides something significant about a person by itself |
| A general description of security measures (s. 16(1)(b)) | `docs/THREAT-MODEL.md` and the privilege model, summarised |

**Then:**
- **renew by 1 December every year** (Registration Regs 3(3)(b)), with the annual fee (s. 17(3));
- report **any change within 14 days** (Registration Regs 3(4)) — for example a new hosting provider or country.
  That is a reason to keep §5's table current in the register: a change there is a filing.

## 4. Design choices that keep Pryvis's obligations small

These choices cost little now and avoid larger duties later:

1. **Hold no sensitive personal data.** "Sensitive" includes health, criminal allegations, and **biometric data —
   which the Act defines to include behavioural characteristics such as "signature, keystrokes or voice"** (s. 2).
   - **Holding any of it** brings a data protection officer (s. 20(6)(b)), written consent for each use (s. 24(1)(a)),
     and stricter scrutiny.
   - **The e-signature stays a typed name**, with the one-time code and the record of consent (R1.20). A typed name is
     not a behavioural characteristic.
   - **A drawn or scanned handwritten signature may be biometric.** That decides the release-2 signed-copy upload
     (R1.20c): it either avoids storing signature images, or comes with the sensitive-data obligations. It is put to
     the attorney.
   - **Keystroke timing, voice notes and photographs of faces** are never collected.
   - **Free-text notes** are the leak. A contractor may type "client is diabetic, needs ramp". The product cannot
     prevent it, but the help article and the notes field's hint say: do not record health or criminal information
     about clients.
2. **Make the price index not personal data at all** (brief §5a, R1.41). A material, a price, a supplier, a date and a
   parish do not identify a living person. If observations are **stored without the tenant's identity**, and the
   index is only ever **aggregated across many tenants** — the statistical guarantee brief §5a already requires —
   then:
   - the index is outside the Act;
   - the consent question of s. 9(2)(b) (consent bundled into sign-up is not "freely given") largely disappears.

   The terms can still say plainly that anonymous price data is used. Any consent that remains should be a **separate,
   optional** choice, not a condition of signing up. This changes design A8 and R1.41's "consent flag", and is put to
   the attorney.
3. **Stay below "large scale"** (s. 20(6)(c)), which the texts do not define. A small number of contractors and their
   clients is unlikely to be large scale; the Commissioner's guidance is asked for (§10). Until a DPO is required, name
   **the owner as the authorised officer** (Registration Regs 3(1)(f)), with `privacy@pryvis.com` as the contact.
   - If a DPO becomes required, it can be a contractor rather than an employee (Regs 9(1)(a)).
   - It must report to senior management (Regs 9(1)(b)), and must not have a conflict of interest (s. 20(2)).
   - A DPO living outside Jamaica needs a Jamaican representative (Regs 9(2)).
4. **Choose lawful conditions on purpose**, and write them down (s. 23(1); Regs 11(2)):
   - **contract** (s. 23(1)(b)) for running a contractor's account and billing;
   - **legal obligation** (s. 23(1)(c)) for tax records;
   - **legitimate interests** (s. 23(1)(f)) for security logs, fraud prevention (the bank-details change alert, ADR
     0034) and support. Legitimate interests needs **a short written assessment for each use** (Regs 11(2)) — a
     paragraph each, kept with this document;
   - **consent** only where nothing else fits, because it can be withdrawn at any time (s. 9(1)(c)).
5. **Tell people what they need to know, where they are** (s. 22(4)-(6); Regs 11(1)):
   - **Contractors**, who give us their own data: the privacy notice at sign-up.
   - **Clients**, whose data the contractor gives us: the duty to inform them is **the contractor's** as controller
     (s. 22(4)(c)). **A short notice on every quote, invoice and share page** discharges most of it for them, at no
     cost: "[Business] uses Pryvis to prepare and send this document. Your details are used for this job and kept for
     [period]; ask [Business] about your information." It is a product feature that helps contractors comply, and it
     goes into designs A7 and A9.

## 5. Sending data outside Jamaica — the largest open question

**The rule** (s. 31). Personal data may not go to a country without "an adequate level of protection", judged in the
circumstances (s. 31(2)), unless an exception applies (s. 31(4)). The exceptions include:
- the person's **consent** (a);
- the transfer being **necessary for a contract with the person** (b), or for a contract made at their request or in
  their interest (c);
- **terms of a kind the Commissioner has approved** (h);
- **the Commissioner's authorisation** (i).

The Minister may list adequate countries (s. 31(5)(c)), and the Commissioner decides any other case (s. 31(7)).

**Where Pryvis's data goes** (from `docs/SERVICE-REGISTER.md`; to be confirmed for the rebuilt application in A4 and
A5):

| Service | Holds | Country (to confirm) |
|---|---|---|
| *(Pointer 2026-10-06: superseded by `docs/design/environments-and-operations.md` OP2 — production recommended in Toronto, Canada, on DigitalOcean, with backups at a second company in Canada; all candidate providers are US companies)* | | |
| Neon (the database) | Everything | United States, by default region |
| Render (the API) | Everything in transit, logs without personal data | United States |
| Vercel (the website) | Requests in transit | United States and edge locations |
| The email provider (A6) | Messages sent | United States, typically — *(pointer 2026-10-09: chosen in `docs/design/outbound-messaging.md` MS3: Amazon SES in Canada (Central))* |
| Storage, error tracking, uptime (A5) | Files; events without personal data | To be chosen — *(pointer 2026-10-09: chosen in `docs/design/third-party-register.md` RG2-RG6: files in Toronto, scanning and backups in Canada, errors in the EU, the mailbox in Canada)* |
| Stripe, under the Canadian company (ADR 0033) | Billing and card data | Canada and the United States |

**How each kind of data can lawfully leave:**
- **A contractor's own account data** can probably rest on **necessity for the contract** with the contractor
  (s. 31(4)(b)): the contractor signs up for an online service that is hosted abroad. That is stated in the terms
  and the privacy notice.
- **Clients' data** is the hard case. The client has no contract with Pryvis, and asking every client for consent is
  impractical. The routes, cheapest first:
  1. **Ask the Commissioner whether approved transfer terms exist** (s. 31(4)(h)). If they do, put them into our
     processing contract and into the agreements with our providers. **This costs a letter.** (§10, question 4.)
  2. **Prefer providers and regions in a country with a comprehensive privacy law.** Canada (PIPEDA) and the European
     Union (GDPR) make the adequacy case (s. 31(2)(e)-(h)) far easier than the United States, which has no general
     federal privacy law. Where a provider offers a Canadian or EU region at a similar price, choose it in A4 and A5.
     Moving the database later is costly, so **decide this before B1**.
  3. **Ask the Commissioner for a determination** on the countries actually used (s. 31(7)), or for an authorisation
     (s. 31(4)(i)), presenting our safeguards: encryption, row-level isolation, providers' contractual terms, and no
     personal data in logs.
- **Whatever the route**, the countries go into the registration (s. 16(2)(g)), the privacy notice, and the list
  given to contractors (§2).

**Recommendation:** treat the hosting region as a **design input for A4 and A5**, not an afterthought. Ask the
Commissioner (§10) before B1 builds the environments.

## 6. Breaches — 72 hours, twice

**What the texts require:**
- the **controller reports to the Commissioner within 72 hours** of becoming aware (s. 21(3)), using Form 7 (Regs 10(1));
- the report covers the facts, the nature of the breach, the categories and numbers of people and records, the
  measures taken, the consequences, and the DPO's contact (s. 21(4));
- further information follows as a further Form 7 (Regs 10(2)-(3));
- **each affected person is told within 72 hours** (Regs 10(4)), directly (post, email or similar) or, if that is not
  possible, publicly (Regs 10(5)-(6));
- the notice to a person, in plain language, covers:
  - what happened, and when;
  - the likely consequences, and which of their information is affected;
  - what has been done, and what will be done;
  - what they can do to protect themselves;
  - the contact for more information (Regs 10(7)).

**What it means for the design (A11, the breach response):**
1. **Find who is affected, fast.** Every row already carries its tenant. The response needs a prepared query that
   lists, per tenant, the clients and users affected by a given incident, with their contact details.
2. **Templates written in advance** for the Commissioner's report and for the notice to people, in plain language,
   reviewed by the attorney. Written under pressure, they will be wrong.
3. **As processor:** tell each affected contractor **within 24 hours**, with the per-tenant list and a draft notice
   they can send to their clients — so they can meet their 72 hours. This is in the processing contract (§2).
4. **As controller** (contractors' own accounts, support data): Pryvis itself reports to the Commissioner and tells
   the contractors' users within 72 hours.
5. **A contravention of any standard is reportable too**, not only a security breach (s. 21(3)(a)). The response
   plan covers both.
6. **Keep a log** of every incident considered, including those judged not reportable, with the reason. Due
   diligence is the defence (s. 21(7)).

## 7. Keeping and disposing of data — every record needs a maximum

**What the texts require:**
- data are not kept longer than necessary (s. 28(1)(a));
- a **written retention and disposal policy** with **minimum and maximum periods** (Disposal Regs 2(1)(b));
- a **regular review** (Disposal Regs 2(1)(a));
- data used to make a decision about a person are kept long enough for the person to ask for them (Disposal Regs
  2(1)(c));
- disposal is permanent and irreversible, so the data can no longer identify or be linked to the person — **including
  electronic copies** (Disposal Regs 2(2)).

**What changes in our plan.** The PRD calls several records "kept permanently" (R1.44): the client book, rejected
seals, the audit trail, and an acceptance's internet address and browser details. **"Permanently" does not fit the
fifth standard.** The recommended schedule, for the attorney to confirm, is below. Its periods are anchored on tax
law: Jamaican tax law requires business records to be kept for a period — commonly understood to be **seven years**,
which the accountant confirms (OA9).

| Record | Minimum | Maximum, then disposal | Why |
|---|---|---|---|
| Issued quotes, invoices, credit notes, payments | The tax-record period | Tax-record period + 1 year; then the client's personal fields anonymised and the financial record kept | Tax law (s. 23(1)(c)); R1.44 already plans "redact personal fields, keep the financial record" |
| A client in the client book with no document | — | 2 years after last use, unless the contractor keeps them | Not needed for anything else |
| Acceptance evidence (name, code record, internet address, browser details) | The life of the quote or job | The tax-record period of the related invoice, or 2 years if never invoiced | Evidence for a dispute: data kept for establishing or defending a legal claim (Disposal Regs 2(1)(a)(iii)) |
| Rejected seals | — | 1 year | No continuing purpose |
| The audit trail | 7 years (ADR 0020) | 7 years, then deleted | Already decided; entries hold identifiers, not message text (SF3) |
| Contractor account after the subscription ends | 30 days, for the export | 90 days, then deleted, except records the tax period requires | The export (R1.43), then nothing kept "just in case" |
| Support tickets | — | 24 months after closing (SF7) | Already decided |
| Backups | — | The backup cycle set in A4 (recommended: 35 days) | Deleted data lives on in a backup until it expires; the policy says so |
| Logs | — | 30-90 days; no personal data by design (AP9) | Operations only |

**Disposal must be real** (Disposal Regs 2(2)). A database delete plus backup expiry, or irreversible anonymisation,
meets it; "marking as deleted" does not. A11 designs the deletion jobs, and the policy is reviewed yearly — a calendar
item with the impact assessment (§8).

**Contractors' own duty.** Contractors set their own retention as controllers. Pryvis offers sensible defaults —
the schedule above — and an "anonymise this client" action (R1.44).

## 8. The annual impact assessment

Every controller submits a **data protection impact assessment each year**, within **90 days after the calendar
year ends** — that is, by about 31 March — in the form the Commissioner prescribes (s. 45(1), (3)). The Commissioner
may excuse classes of controllers by notice (s. 45(4)); whether any notice covers a business of Pryvis's size is
question 2 in §10.

It needs:
- a description of the processing and its purposes;
- an assessment of necessity and proportionality;
- the risks to people;
- the safeguards.

**Our design documents already hold most of this**: the threat model, the privilege model, the domain model, the
register, and this document. So the yearly filing is a few days of assembly, not a project. **First due:** by
31 March of the year after Pryvis starts processing personal data as a controller.

## 9. People's rights — what Pryvis builds, and who answers

**Who answers.** For **clients' data**, requests go to **the contractor** (the controller), and Pryvis helps (§2).
For contractors' **own** data and support data, Pryvis answers.

| Right | Time | Pryvis's tool (design A11) |
|---|---|---|
| Access — is my data processed, what, why, to whom (s. 6(2)(a)-(b)) | 30 days (s. 6(4)); free | A per-person report |
| A copy of the data (s. 6(2)(c)(i)) | 30 days | Free if electronic (Regs, Second Schedule, item 3) — so always offer it electronically |
| A machine-readable copy sent to another controller (s. 6(2)(c)(ii)) | 30 days | The CSV export (R1.43), and a per-client export |
| Stop processing (s. 11) | A written answer within **21 days** (s. 11(4)) | A "stop" flag on a client, which blocks new documents and messages |
| Correction (s. 13) | 30 days (s. 13(3)); tell everyone the data was disclosed to in the last 12 months (s. 13(3)(b)(ii)) | Editing a client, plus a note of the correction on frozen documents (an issued document is never edited, R1.27) |
| Identity check (s. 8(1)) | The clock waits until identity is shown | A check before any copy is released |
| Help for someone who cannot write the request (Regs 4(1)) | — | Support accepts requests by phone or in person, and writes them down |

**Direct marketing** (s. 10):
- marketing email to **existing contractors** rests on the "customer" route (s. 10(1)(b), (4)) — an opt-out when they
  sign up, and in every message;
- every message names the sender and gives an address to stop it (s. 10(5));
- prospects who are not customers need consent, asked for **once** (s. 10(2)), in the prescribed form (Regs 7, Form
  6);
- service messages — receipts, security alerts, reminders the contractor set up — are not direct marketing.

**The contractor's clients** receive only what the contractor sends them. Pryvis never markets to them.

## 10. Questions for the Information Commissioner — free, and worth asking first

The Commissioner's office gives guidance (s. 4(5)(d)). A short email from the owner can settle the costliest
unknowns, before any lawyer:

1. Has any order been made under **s. 15(2)** exempting small businesses or sole traders — for example, contractors
   keeping client records — from registration?
2. Has any notice been made under **s. 45(4)** excusing any class of controller from the **annual impact assessment**?
3. Has the Commissioner published guidance on **"large scale"** processing (s. 20(6)(c)), or prescribed classes that
   must appoint a **data protection officer** (s. 20(6)(d))?
4. Has the Commissioner **approved any transfer terms** (s. 31(4)(h)), or has the Minister **listed adequate
   countries** (s. 31(5)(c))? How should a software service hosted in the United States or Canada, processing
   clients' data on behalf of Jamaican businesses, show adequate protection?
5. Does a **software provider acting as a data processor** for its customers need to register for that processing,
   or only for the data it controls?

The answers go into this document, dated, and are put to the attorney with everything else.

## 11. What changes in our plan, recommended for the owner's approval

| # | Change | Where |
|---|---|---|
| R1 | The **processing contract** goes into the terms: Pryvis as processor for clients' data; tell the contractor of a breach within 24 hours; sub-processors and countries listed | Terms (E6); design A11 |
| R2 | **Register** Pryvis before the first real contractor; renew by 1 December; changes within 14 days. If the Canadian company is in the structure, it registers for billing, with the Jamaican company as its representative | `docs/OWNER-ACTIONS.md`, new action; F3-F4 |
| R3 | **No sensitive data:** the typed-name signature stays; the release-2 signed-copy upload is reconsidered for biometric data; notes fields warn against health and criminal information | R1.20, R1.20c; A7 |
| R4 | **The price index is anonymous and aggregate**, so it is not personal data; any remaining consent is separate and optional, never a condition of sign-up | Brief §5a, R1.41; A8 |
| R5 | **A privacy line on every quote, invoice and share page**, written by the contractor's settings, so contractors can inform their clients | A7, A9 |
| R6 | **Hosting regions are chosen with s. 31 in mind**: prefer Canada or the EU where the price is similar; decide before B1 | A4, A5 |
| R7 | **A retention schedule with a maximum for every record** (§7); "kept permanently" removed from the PRD | PRD R1.44; A11 |
| R8 | **The breach response** meets 72 hours to the Commissioner and to each person, with templates and a per-tenant query ready | A11 |
| R9 | **Rights tools** with their deadlines (§9) | A11 |
| R10 | **The owner as the authorised officer**, with a `privacy@` address, until a DPO is required | Registration; the privacy notice |
| R11 | **The annual impact assessment** on the calendar, assembled from the design documents | A4 (the operations calendar) |
| R12 | **Ask the Commissioner the five questions** of §10, before B1 | `docs/OWNER-ACTIONS.md`, batch 1 |

**What this costs:**
- registration of the Jamaican company: J$25,000 the first year, J$15,000 a year after;
- the same again for the Canadian company, if it sells the subscriptions;
- an email to the Commissioner;
- design work that fits into A4-A11 as they are written.

A good-practice assessment by the Commissioner (s. 4(8)) costs J$50,000 (Regs, Second Schedule, item 1). It is
optional, and not recommended until the product is built.

## 12. What this reading does not do (Rule 21.4)

- **It is not legal advice**, and it does not replace the attorney's review before launch (F2). The owner accepted
  this when asking for it.
- **The Act was read from a scan by text recognition.** A quoted word may be wrong; the page image governs.
- **It does not know of orders, notices or guidance made after these texts** (§10), or of court or Commissioner
  decisions interpreting them.
- **It does not cover Canadian law.** Canada's PIPEDA, and any provincial law, apply to the Canadian company, and its
  advisers cover them.
- **It does not settle tax-record periods** (§7). The accountant does.
- **It does not cover other Jamaican laws** that may touch the product: electronic transactions and signatures,
  consumer protection, and cybercrime.
