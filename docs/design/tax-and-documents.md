# Design: tax (GCT in Jamaica) and documents — rates, names, invoices, credits and numbers

**Status: APPROVED by the owner, 2026-10-02 — every recommendation, T1-T9.** Build plan step A1
(`docs/BUILD-PLAN.md`); the independent read and closing check are owed before the step is ticked. Nothing here is
built until its build steps (B6, C3, C4, D1-D2) begin.

Date: 2026-10-02 · **Implements the direction of** ADR 0027 D7 (a tax-exclusive ceiling), ADR 0030 decision 1 (tax
per invoice, tenant-entered rates, the tax's name per country), ADR 0031 (a revision keeps its quote's number), ADR
0005 (country rules are a versioned rule pack) · **Answers** PRD R1.9's list and finding B10 · **Delegation (Rule
16.5):** Opus — money arithmetic and the most important invariant in the product.

**Every statement below about Jamaican tax law is our reading of public sources, labelled unverified.** It is
checked by the owner's accountant before launch (PRD §9 item 8); nothing in the product asserts that it is right.

---

## 1. The problem, in one paragraph

The PRD's whole statement of tax was one line (R1.9), and the schema follows a different model from the one the
owner has since decided: a quote issue carries **one** tax rate and a tax-inclusive total, the ceiling is that
total, **an invoice carries no tax and no number**, a credit note carries neither, a variation is an amount with
no lines, and draft quote lines carry no tax treatment at all. Meanwhile the owner has decided that the ceiling is
net of tax and tax is computed per invoice (ADR 0027 D7); that tenants may enter their own rates (ADR 0030); that
the tax's very name is per country (ADR 0030); and that a revision keeps its quote's number (ADR 0031). This design
says what the documents carry, how tax is computed on each, and how numbers are allocated, so W3, W4 and W7 can be
built from it.

## 2. What public sources say about Jamaica (unverified — for the accountant)

| Fact | Our reading | Source |
|---|---|---|
| The tax and its rate | General Consumption Tax (GCT), standard rate **15%** | [TAJ](https://www.jamaicatax.gov.jm/general-consumption-tax1); [PayPro](https://payproglobal.com/saas-sales-tax/jamaica/) |
| Registration | Required above **J$15 million** of taxable supplies a year (from 1 April 2025; exempt supplies do not count) | [KPMG](https://kpmg.com/us/en/taxnewsflash/news/2025/03/tnf-jamaica-tax-measures-in-2025-2026-budget.html); [PwC](https://taxsummaries.pwc.com/jamaica/corporate/other-taxes) |
| **Building work is exempt** | "The construction, alteration, repair, extension, demolition or dismantling of any building", with site clearance, excavation, foundations, scaffolding, landscaping and access works | [TAJ, exempt goods and services](https://www.jamaicatax.gov.jm/documents/10181/106844/goods_and_services_exempt_from_gct.pdf/06003f7d-03b9-4e6a-89dc-698af3015aa5) |
| **…but installations and painting are not** | The exemption excludes installing heating, lighting, ventilation, power supply, drainage, sanitation, water supply, fire protection, air conditioning, elevators; internal cleaning; and **painting** | same |
| What a tax invoice must show | "Tax Invoice" prominently; date of supply; a serial number; the supplier's name, address and GCT registration number; the customer's name and address; quantity and description; the rate and amount of GCT; the total including GCT | [TAJ GCT page](https://www.jamaicatax.gov.jm/general-consumption-tax1); [Uniform Software summary](https://uniformsoftware.com/template/jamaicatax) |
| Credit notes | GCT on a credit note reduces the GCT payable | same |
| **Contractors levy** | Whoever pays a contractor for construction, haulage or tillage operations **withholds 2%** of the gross and remits it; the contractor claims it against income tax | [PwC withholding](https://taxsummaries.pwc.com/jamaica/corporate/withholding-taxes) |
| **Withholding tax on specified services** | Certain payers withhold **3%** on payments of J$50,000 or more (before GCT) for specified services — including repairs or maintenance, decorating, landscaping, electrical engineering — and issue a certificate | [JNCB](https://www.jncb.com/About-Us/News-Room/News/Withholding-Tax-on-Specified-Services) |

**What this means for the product, before any decision:** the trades the product is for straddle the line. A
builder's structural work is exempt; the electrician's and plumber's installation, and the painter's work, are
standard-rated; one job can hold both. Many small contractors are below the registration threshold and charge no
GCT at all. And a client who withholds 2% or 3% has **paid in full** — an invoice that reads "part-paid" and sends
reminders for the withheld amount would be wrong on the contractor's letterhead. So: tax treatment per line,
registration per tenant, and withholding as a kind of settlement, not a shortfall.

## 3. The decisions

Each has options and a recommendation, **(rec)**.

### T1 · Where the country's tax rules and names live

| Option | For | Against |
|---|---|---|
| **A. (rec) ADR 0005's two layers, plus the tenant's own.** A static **rule pack** per country in the shared core (`packages/core`, under a `jurisdiction` folder): the tax's **name** ("General Consumption Tax"), its **short label** ("GCT"), the registration number's name ("TRN"), the default **tax codes** with rates and effective dates, the registration threshold, the tax-invoice requirements and wording, and the withholding kinds. Staff overrides in the database (audited, ADR 0005). Then each tenant's **own tax settings** (T2) on top | Rate history is reviewed and tested like code; a missing database row cannot leave a tenant with no rules; adding Trinidad and Tobago is a new rule pack (VAT, "BIR number"), no code change | A statutory rate change needs a release or a staff override — acceptable: they are rare, and tenants can set rates themselves |
| B. Everything in database tables, edited by staff | No release for a rate change | A blank row is a tenant with no tax; history depends on audit discipline; ADR 0005 rejected it |

**A guard** (owner's requirement): a test fails if `GCT` (or `TRN`) appears in product code, screens or document
templates outside the Jamaica rule pack and the tests that exercise it. Labels always come from the rule pack.

### T2 · What the tenant sets, and how their own rates work

- **Registration:** registered or not; the registration number; the date it took effect. A tenant that is **not
  registered charges no tax**: every line is out of scope, and documents carry the rule pack's wording ("Not
  registered for General Consumption Tax"). No tax code can be chosen.
- **Tax codes:** a registered tenant starts with the rule pack's codes — in Jamaica, *standard 15%*, *zero-rated*,
  *exempt* — and **may change a rate or add a code** (owner, ADR 0030). Each code has a label, a rate in basis
  points, a treatment (standard, zero, exempt), and an effective date; changing a rate adds a new effective-dated
  version, never edits an old one, so history cannot be rewritten.
- **A rate that differs from the country default is shown, not blocked (rec):** when set, and on the sealing and
  invoicing screens, "You charge 12% — Jamaica's standard rate is 15% (as of …)". Blocking would defeat the owner's
  decision; silence would let a typing mistake mis-tax a client.

### T3 · Which treatment each line gets

- Every **catalogue item, labour rate and equipment rate** carries a default tax code; a **recipe line** inherits
  it; a **quote line** carries its own (it is copied, and can be changed on the quote). Today only the sealed
  issue line has a treatment — `quote_line` gains one.
- **Presets for the trades (rec):** the Jamaica rule pack offers two named starting points a tenant can apply to
  a labour rate — "Building work (exempt)" and "Installation, painting and other work (standard)" — each labelled
  *our reading of the GCT exemption; confirm with your accountant*. The tenant decides; we never infer it.

### T4 · The ceiling, variations and the invoiced figure — all net

Decided by the owner (ADR 0027 D7); stated here as the arithmetic:

- **Accepted net** = the accepted issue's subtotal (net of tax). The `issue_balance` row holds it instead of the
  tax-inclusive total.
- **A variation is net and has lines** (`variation_line`), each with a tax code, so the job's tax mix follows the
  agreed scope. Its total is the sum of its lines' nets; positive or negative as today.
- **Ceiling** = accepted net + recorded variations' net (R1.22b, R1.24). **Invoiced** = the sum of each live
  invoice's **net** less its credit notes' net. Tax never enters the ceiling, so a rate change after acceptance
  cannot push a final invoice over it.

### T5 · Tax on each invoice — how a deposit or a progress claim is taxed

| Option | For | Against |
|---|---|---|
| **A. (rec) Apportion by the job's tax mix.** An invoice is for a **net amount** (a percentage or a figure). Its tax is computed per tax code: the net is split across the codes in proportion to the job's net mix (accepted lines plus variations, as at the invoice), and each code's share is taxed at **that code's rate in force on the invoice date**. The **final** invoice bills the remainder of each code's base, so the bases add up exactly | One input (an amount) as contractors bill today; exact bases; a rate change applies from its date, as tax law expects | Rounding per invoice; a reader must see the split — the invoice shows it |
| B. Bill chosen lines or percentages of each line | Exact, line by line | A heavy screen for a contractor at a gate; R2 at the earliest |
| C. Each invoice takes its share of the quote's tax as sealed | Simple | Wrong after a rate change; contradicts D7 |

**Rounding (rec):** per invoice, per tax code, on that code's net base, half away from zero at the minor unit —
the convention already used for line totals (J11). The quote's tax, shown on the sealed issue, is labelled an
**estimate at today's rate**; the invoice's is the tax.

### T6 · Credit notes and withdrawal

A credit note is for a net amount against one invoice and **reverses tax in the same proportions as that
invoice's tax lines**, at the rates that invoice used (rec — a credit note corrects that invoice, so it uses its
rates). It carries its own number (T9). It lowers the invoiced net exactly as today (J4), and its tax lowers tax
due.

### T7 · Payments, over-payments, credits and withholding

The PRD needs records that do not exist yet (R1.26, finding C2). **(rec)**:

- A **payment** records what actually arrived: amount, date, method, reference — never refused.
- A payment is **allocated** to one or more invoices of the same client. Any unallocated remainder is a **client
  credit**, which the tenant later allocates to another invoice of that client, or settles with a recorded
  **refund**.
- **Withholding is a kind of settlement, not a shortfall.** An allocation can carry a withheld part — its kind from
  the rule pack (Jamaica: the 2% contractors levy; the 3% withholding on specified services), its amount, and the
  certificate reference. The invoice is then settled, status "paid", and **no reminder chases a withheld amount**.
- Invoice status stays derived (R1.25): from allocations, withholdings and credit notes.

### T8 · What a tax invoice carries

The rule pack lists what a tax invoice must show and its wording; the PDF reads it. For Jamaica (unverified): the
title "Tax Invoice", the supply date, the serial number, the tenant's name, address and registration number, the
client's name and address, each line's quantity and description, each code's rate and tax, and the total with
tax. **Issuing a tax invoice is refused** if a field the rule pack requires is missing (a registered tenant with no
registration number, a client with no address), with the missing field named. An unregistered tenant's invoice is
titled "Invoice" and carries the not-registered wording.

### T9 · Numbers

- **Quotes (ADR 0031):** a number is allocated **once per quote**, at the first issue's numbering; every revision
  carries it. Shown as "Q-0042" for the first issue and "Q-0042 rev 2" after (rec: no suffix on the first, so the
  common case reads cleanly).
- **Invoices and credit notes get numbers too** — today neither has one, and a tax invoice must be serialised. Each
  has its own series per tenant (prefix and start; never resets in R1, ADR 0027 D11), allocated atomically at
  issue, **gapless per series**, through the same allocation function.
- **Schema (rec):** a `quote_number` row per quote (unique per quote and per series-and-number); the issue refers to
  its quote's number and its revision, and `issue_number` stops being allocated per issue; `invoice` and
  `credit_note` each gain a number from their series. All in new migrations (Rule 6). The start can never move
  below the last number allocated (R1.14, finding C8).

## 4. What gets built once approved

1. **Migrations** (new; none edited — Rule 6):
   - tenant tax settings (registration, number, effective date) and tenant tax codes with effective-dated rates;
   - a tax code column on `quote_line` (proposed, not built); `quote_issue_line` keeps its treatment and gains the code's label and rate as sealed;
   - `issue_balance` holds the accepted **net**, and `issue_balance_apply()` re-sums **net** invoiced — the ceiling
     function changes, inside the same lock (the R1.24 tests and the race suite re-run unchanged in intent);
   - `variation_line`; `invoice` and `credit_note` gain net, tax and total, a per-code tax-line table each, and a
     number; payments, allocations, client credits, refunds and withholdings;
   - `quote_number`, and the allocation function for all three series.
2. **The rule pack** in the shared core: Jamaica's names, labels, codes with effective dates, threshold, invoice
   requirements and withholding kinds — with the `GCT` guard (T1).
3. **The tax arithmetic** in the shared core, once (Rule 7): apportionment, rounding, credit reversal — used by the
   API and the PDF alike.

## 5. Tests, each proved with a planted defect

- The ceiling is net: an invoice whose net fits but whose total with tax would not, is **accepted**; one whose net
  exceeds the ceiling is refused — and with the old tax-inclusive ceiling planted, the first fails.
- A rate change between two progress invoices taxes each at its own date's rate, and the bases still add up.
- A deposit on a mixed job apportions tax by the net mix; the final invoice's bases make the sum exact.
- Rounding: a set of amounts whose naive per-line rounding differs from per-code rounding.
- A credit note reverses tax in its invoice's proportions.
- An unregistered tenant cannot choose a tax code; its invoice carries no tax and the not-registered wording.
- A tax invoice missing a required field is refused, naming it.
- Over-payment becomes a client credit; a 2% withholding settles an invoice with no reminder.
- Revisions keep their quote's number; invoice and credit-note series are gapless under concurrent allocation (the
  race suite, on real PostgreSQL).
- The `GCT` guard catches a planted hard-coded "GCT" in a screen.

## 6. Questions for the accountant (before launch)

1. Is our reading of the construction exemption and its exclusions right, and how should a job that mixes building
   work with installation be invoiced?
2. Are materials supplied within an exempt construction service exempt too?
3. For a deposit or progress invoice, is apportioning tax by the job's mix acceptable, and when is the tax point —
   the invoice date, or payment?
4. Does a rate change apply by invoice date for work already contracted?
5. Is the tax-invoice field list complete, including whether the customer's registration number is required?
6. How should the 2% contractors levy and the 3% withholding be shown on the invoice and in the contractor's
   records?

## 7. What this does not do (Rule 21.4)

- It does not settle any of the law: §2 is public reading, unverified, until the accountant answers §6.
- It does not build Trinidad and Tobago's rule pack — only the shape that makes it a data change.
- It does not let a contractor invoice chosen lines (T5 option B): R2 at the earliest.
- It does not file returns or produce tax reports; an accountant export is excluded from R1 (PRD §8).
- It does not cover imported services, customs, or income tax beyond recording what was withheld.
