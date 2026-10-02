# Design: tax (GCT in Jamaica) and documents — rates, names, invoices, credits and numbers

**Status: APPROVED by the owner, 2026-10-02 — every recommendation, T1-T9.** **Amended the same day** to answer
its independent read (findings TD1-TD15, §8). The amendments make T4-T9 precise; one changes an approved rule
(T6: a credit note may now target tax codes, TD1). They are approved with the step's sign-off. Build plan step A1
(`docs/BUILD-PLAN.md`). The closing check is owed before the step is ticked. Nothing here is built until its
build steps (B6, C3, C4, D1-D2) begin.

Date: 2026-10-02 · **Implements the direction of** ADR 0027 D7 (a tax-exclusive ceiling), ADR 0030 decision 1 (tax
per invoice, tenant-entered rates, the tax's name per country), ADR 0031 (a revision keeps its quote's number) and
ADR 0005 (country rules are a versioned rule pack) · **Carries** Rule 3 (tax rules and legal wording are data per
jurisdiction; a country's day boundary comes from its configuration) · **Answers** PRD R1.9's list and finding
B10 · **Delegation (Rule 16.5):** Opus — money arithmetic and the most important invariant in the product.

**Every statement below about Jamaican tax law is our reading of public sources, labelled unverified.** The
owner's accountant checks it before launch (PRD §9 item 8). Nothing in the product asserts that it is right.

---

## 1. The problem, in one paragraph

The PRD stated tax in one line (R1.9), and the schema follows a different model from the one the owner has
since decided. Today:

- a quote issue carries **one** tax rate and a tax-inclusive total, and the ceiling is that total;
- **an invoice carries no tax and no number**, and a credit note carries neither;
- a variation is an amount with no lines;
- draft quote lines carry no tax treatment at all.

The owner has decided:

- the ceiling is net of tax, and tax is computed per invoice (ADR 0027 D7);
- tenants may enter their own rates (ADR 0030);
- the tax's very name is per country (ADR 0030);
- a revision keeps its quote's number (ADR 0031).

This design says what each document carries, how tax is computed on each, and how numbers are allocated, so
that W3, W4 and W7 can be built from it.

## 2. What public sources say about Jamaica (unverified — for the accountant)

| Fact | Our reading | Source |
|---|---|---|
| The tax and its rate | General Consumption Tax (GCT), standard rate **15%** | [TAJ](https://www.jamaicatax.gov.jm/general-consumption-tax1); [PayPro](https://payproglobal.com/saas-sales-tax/jamaica/) |
| Registration | Required above **J$15 million** of taxable supplies a year (from 1 April 2025; exempt supplies do not count) | [KPMG](https://kpmg.com/us/en/taxnewsflash/news/2025/03/tnf-jamaica-tax-measures-in-2025-2026-budget.html); [PwC](https://taxsummaries.pwc.com/jamaica/corporate/other-taxes) |
| **Building work is exempt** | "The construction, alteration, repair, extension, demolition or dismantling of any building", with site clearance, excavation, foundations, scaffolding, landscaping and access works | [TAJ, exempt goods and services](https://www.jamaicatax.gov.jm/documents/10181/106844/goods_and_services_exempt_from_gct.pdf/06003f7d-03b9-4e6a-89dc-698af3015aa5) |
| **…but installations and painting are not** | The exemption excludes installing heating, lighting, ventilation, power supply, drainage, sanitation, water supply, fire protection, air conditioning and elevators; internal cleaning; and **painting** | same |
| What a tax invoice must show | "Tax Invoice" prominently; the date of supply; a serial number; the supplier's name, address and GCT registration number; the customer's name and address; quantity and description; the rate and amount of GCT; the total including GCT | [TAJ GCT page](https://www.jamaicatax.gov.jm/general-consumption-tax1); [Uniform Software summary](https://uniformsoftware.com/template/jamaicatax) |
| Credit notes | GCT on a credit note reduces the GCT payable | same |
| **Contractors levy** | Whoever pays a contractor for construction, haulage or tillage operations **withholds 2%** of the gross and remits it; the contractor claims it against income tax | [PwC withholding](https://taxsummaries.pwc.com/jamaica/corporate/withholding-taxes) |
| **Withholding tax on specified services** | Certain payers withhold **3%** on payments of J$50,000 or more (before GCT) for specified services — including repairs or maintenance, decorating, landscaping and electrical engineering — and issue a certificate | [JNCB](https://www.jncb.com/About-Us/News-Room/News/Withholding-Tax-on-Specified-Services) |

**What this means for the product, before any decision:**

- **The trades the product serves straddle the line.** A builder's structural work is exempt. The electrician's
  and plumber's installation work, and the painter's work, are standard-rated. One job can hold both.
- **Many small contractors charge no GCT at all**, because they are below the registration threshold.
- **A client who withholds 2% or 3% has paid in full.** An invoice that reads "part-paid", and sends reminders
  for the withheld amount, would be wrong on the contractor's letterhead.

So the design needs three things: tax treatment per line, registration per tenant, and withholding recorded as a
kind of settlement rather than a shortfall.

## 3. The decisions

Each decision has options and a recommendation, marked **(rec)**. Text marked *(TDn)* was added to answer the
independent read's finding of that number (§8).

### T1 · Where the country's tax rules and names live

| Option | For | Against |
|---|---|---|
| **A. (rec) ADR 0005's two layers, plus the tenant's own.** A static **rule pack** per country in the shared core (`packages/core`, under a `jurisdiction` folder). It holds the tax's **name** ("General Consumption Tax"), its **short label** ("GCT"), the registration number's name ("TRN"), the default **tax codes** with rates and effective dates, the registration threshold, the tax-invoice requirements and wording, the withholding kinds, and the country's time zone. Staff overrides live in the database, audited (ADR 0005). Each tenant's **own tax settings** (T2) sit on top | Rate history is reviewed and tested like code; a missing database row cannot leave a tenant with no rules; adding Trinidad and Tobago is a new rule pack (VAT, "BIR number"), with no code change | A statutory rate change needs a release or a staff override. That is acceptable: such changes are rare, and tenants can set rates themselves |
| B. Everything in database tables, edited by staff | No release for a rate change | A blank row is a tenant with no tax; history depends on audit discipline; ADR 0005 rejected it |

**The tax-name guard** (owner's requirement; Rule 3) *(TD13)*. A test in CI fails when a tax's name or label
appears in the product outside its own rule pack. Labels always come from the rule pack. The scope is stated
exactly, so that the guard can be built and each evasion planted:

- **What it looks for.** Every rule pack's tax name, short label and registration-number name: for Jamaica,
  "General Consumption Tax", "GCT" and "TRN". The list is read from the rule packs themselves, so Trinidad and
  Tobago's pack adds "VAT" and "BIR number" with no change to the guard.
- **Matching is case-insensitive, on token boundaries.** Letters and digits continue a token; anything else ends
  one, including `_`. So `gct_jmd`, `GCT` and `Gct` all match, while a longer word that merely contains the
  letters does not. A multi-word name matches with any run of whitespace between its words.
- **What it reads.** Source and copy files under `new-app/` (`.ts`, `.tsx`, `.js`, `.json` other than lockfiles,
  `.sql`, `.html`, `.css`, `.md` inside `new-app/`, and document templates). Lockfiles and binary files are never
  read, so base64 in `package-lock.json` cannot match.
- **What it exempts:**
  - each country's rule-pack folder;
  - test files (`*.test.ts` and the `test/` folders), because a test may name Jamaica's tax in order to check
    Jamaica's behaviour;
  - the migrations already committed when the guard lands, **listed by name in the guard**. Rule 6 forbids
    editing them, and two of them carry "GCT" in comments. A migration written after the guard is not exempt.
- **The public site is in scope.** `web/content/site.ts` names GCT in its copy. When the guard lands (B6), that
  copy reads the label from Jamaica's rule pack, as every screen does.
- **Planted defects, one per evasion:** an upper-case label in a screen; a lower-case identifier; the full name in
  a template; a label in a new migration; and the site's copy with the label typed in.

### T2 · What the tenant sets, and how their own rates work

- **Registration:** registered or not, the registration number, and the date it took effect. A tenant that is
  **not registered charges no tax**. Every line takes the rule pack's **out-of-scope** code, and documents carry the
  rule pack's wording ("Not registered for General Consumption Tax"). No other tax code can be chosen.
- **Tax codes:** a registered tenant starts with the rule pack's codes — in Jamaica, *standard 15%*, *zero-rated*
  and *exempt*. The tenant **may change a rate or add a code** (owner, ADR 0030). Each code has:
  - a label;
  - a treatment: standard, zero, exempt or out of scope;
  - effective-dated rate versions, each a rate in basis points and the date it takes effect.

  Changing a rate adds a new version and never edits an old one.
- **No backdating** *(TD15)*. A new version takes effect today or later, by the country's calendar day. Each
  issued invoice and credit note also **freezes the rate it used** on its own tax lines, so nothing is ever
  recomputed. History cannot be rewritten by either route.
- **A rate that differs from the country default is shown, not blocked (rec).** The tenant sees it when setting
  the rate, and again on the sealing and invoicing screens: "You charge 12% — Jamaica's standard rate is 15% (as
  of …)". Blocking would defeat the owner's decision; silence would let a typing mistake mis-tax a client.
  - A tenant-**added** code is compared with the rule pack's default code of the same treatment *(TD15)*.
  - Zero-rated, exempt and out-of-scope codes have no rate to compare, so they raise no warning.
- **When the rule pack's rates change** *(TD11)*. A new rule-pack version is a statutory change. It arrives by a
  release, or, once the staff console exists (D7), by a staff override.
  - A tenant code that still carries the pack's previous default gets the new rate as a new version, from the
    statutory date (or the release date, if that is later — never retroactively).
  - A tenant code whose rate the tenant set themselves is **not** changed. The tenant is shown the change and
    decides.
  - The tenant's own version always wins. The difference warning above compares it with the current pack
    default.
- **Registration that changes during a job** *(TD11)*. **The invoice date governs**:
  - a tenant registered on that date charges tax;
  - a tenant not registered on that date issues an "Invoice" with no tax and the not-registered wording.

  A job sealed while the tenant was unregistered has out-of-scope lines. To invoice it after registering, the
  tenant maps each out-of-scope code to one of their codes for that job, and the mapping is recorded with the
  invoice. The screen says that the client agreed a price without tax; the net ceiling is unchanged and the tax
  is added on top. Question 7 of §6 puts this to the accountant.

### T3 · Which treatment each line gets

- Every **catalogue item, labour rate and equipment rate** carries a default tax code. A **recipe line** inherits
  it. A **quote line** carries its own: it is copied from the default and can be changed on the quote. Today only
  the sealed issue line has a treatment; the draft quote line gains a tax code too.
- **Every line keeps the code's identity, not only its treatment** *(TD10)*. Two of a tenant's codes can share a
  treatment. A reference to the code is carried by:
  - the draft line;
  - the sealed issue line, which also freezes the code's label and its rate as at the seal;
  - the variation line;
  - each invoice and credit-note tax line.
- **Presets for the trades (rec).** Jamaica's rule pack offers two named starting points a tenant can apply to a
  labour rate: "Building work (exempt)" and "Installation, painting and other work (standard)". Each is labelled
  *our reading of the GCT exemption; confirm with your accountant*. The tenant decides; we never infer it.

### T4 · The ceiling, variations and the invoiced figure — all net

Decided by the owner (ADR 0027 D7). The arithmetic:

- **Accepted net** is the accepted issue's `subtotal_minor`, which is net of tax. `issue_balance_open()` copies it
  instead of `total_minor` *(TD4)*.
- **A variation is net and has lines**, each with a tax code, so the job's tax mix follows the agreed scope
  *(TD5)*:
  - the variation keeps its stored header figure, `amount_minor`, positive or negative as today;
  - its lines must sum to that figure, checked at COMMIT by a deferred constraint trigger, as J11 does for issue
    lines;
  - a line can be inserted only in the transaction that inserted its variation. A line added later is refused,
    so a line can never move the ceiling outside the lock.
- **Ceiling** = accepted net + recorded variations' net (R1.22b, R1.24). **What counts as invoiced** is defined
  once, in `issue_balance_apply()` (R1.24), and is not restated here *(TD14)*. Its terms become net, because
  `amount_minor` on `invoice` and `credit_note` **means net** (TD4, below). Tax never enters the ceiling, so a rate
  change after acceptance cannot push a final invoice over it.
- **The ceiling also holds per tax code** *(TD1)*. For each code, the job's **scope** is its accepted net plus its
  variations' net. Its **billed** figure is computed as `issue_balance_apply()` computes the total, but over each
  invoice's and credit note's base for that code. Then:
  - billed never exceeds scope, for any code, and scope is never negative;
  - the database checks this under the same lock, at the same points, as the total ceiling — which it implies;
  - a negative variation that leaves a code billed beyond its new scope is refused, unless credit notes for that
    code are recorded first in the same transaction (T6).

  This is J4's remedy, applied per code. So the client is never left paying tax on work that was taken out of
  the job.

**Every reader and writer of the old gross figure, and what happens to each** *(TD4)*:

| Where | Today | After |
|---|---|---|
| `issue_balance_open()` (`20260927220000_privilege_model`) | copies `quote_issue.total_minor` (gross) | copies `subtotal_minor` (net) |
| `invoice.amount_minor`, `credit_note.amount_minor` | an amount; tax undefined | **net**. New columns hold the tax and the total, with a CHECK that the total is net plus tax, and the tax lines are checked at COMMIT (TD3) |
| `issue_balance_apply()` | sums `amount_minor`, with K1's `GREATEST(0, …)` floor per invoice | unchanged: it now sums net, floor kept. It also maintains the per-code figures |
| over-credit check in `issue_balance_enforce()` (`20260927110000_one_lock_per_quote`) | credit `amount_minor` against invoice `amount_minor` | unchanged (net against net). Plus the same check per code |
| `acceptance_withdrawal_guard()` (`20260927180000_acceptance_grade`) | the same comparison | unchanged (net against net) |
| the nightly reconciliation (A12, R1.24e) | not built | rebuilds the accepted figure from `subtotal_minor`, and the per-code figures from the lines |
| test N6, `db/test/documents-core.test.ts:647` | asserts the ceiling INCLUDES tax | **its intent flips**: it asserts the ceiling is net. Recorded with the change, not presented as "unchanged" |
| the no-stuck-state oracle, `db/test/no-stuck-state.test.ts:209` | ceiling from `total_minor` | ceiling from `subtotal_minor` |

- **The boundary is tested at net ceiling + 1** *(TD4)*. One invoice exactly at the net ceiling is accepted, and
  one a cent above it is refused.
  - **Plant A:** a gross figure in `issue_balance_open()` alone. It leaves extra room, so the +1 invoice is
    accepted and the test fails.
  - **Plant B:** the gross figure in the sum. It refuses the exact-ceiling invoice, and the test fails.
- **Existing rows** *(TD4)*. None exist. There is no production database before step F3, and development and
  staging are rebuilt from migrations. A migration could not recompute such rows anyway: forced row-level
  security hides them from it, as `20260926220000_withdrawal_after_full_credit` records. The migration's header
  states this assumption.
- **Grants** *(TD4)*. `pryvis_balance` received SELECT on the tables that existed in `20260927220000_privilege_model`
  and has no default privileges. Each new table that a balance function reads (the variation's lines, the per-code
  tax lines, the per-code balance) gets an explicit grant in its own migration. A test runs each balance function
  against each new table, so a missing grant fails in CI.

### T5 · Tax on each invoice — how a deposit or a progress claim is taxed

| Option | For | Against |
|---|---|---|
| **A. (rec) Apportion by the job's tax mix — what remains of it** *(TD1)*. An invoice is for a **net amount**. Its net is split across the job's tax codes in proportion to each code's **remaining base** (its scope less its billed figure, T4), never below zero. Each code's share is taxed at **that code's rate in force on the invoice date** | One input (an amount), as contractors bill today; every code's base adds up exactly on every invoice; a rate change applies from its date, as tax law expects | Rounding per invoice; a reader must see the split — the invoice shows it |
| B. Bill chosen lines or percentages of each line | Exact, line by line | A heavy screen for a contractor at a gate; R2 at the earliest |
| C. Each invoice takes its share of the quote's tax as sealed | Simple | Wrong after a rate change; contradicts D7 |

**The arithmetic, exactly** *(TD1, TD2, TD15)*:

1. **The amount.** A contractor may enter a figure or a percentage.
   - A percentage is a percentage of the **ceiling on the invoice date**, rounded half away from zero to the
     minor unit. The invoice stores the resulting amount; the percentage is shown, not stored as the truth.
   - The amount must be more than zero and no more than the remaining ceiling.
   - A **final** invoice is the one whose amount is the whole remaining ceiling. Nothing else about it is special.
   - A positive variation recorded after a final invoice is billed by a further invoice of kind `progress`.
2. **The split, by largest remainder.** For each code with a positive remaining base:
   - its exact share is amount × remaining ÷ total remaining;
   - each code first gets its share rounded down to the minor unit;
   - the cents left over go one each to the codes with the largest fractional parts — ties go to the larger
     remaining base, then the lower code identifier.

   No share can exceed its code's remaining base, and the shares always sum to the amount. So every invoice's
   code bases are whole and exact, and an invoice for the whole remaining ceiling bills each code exactly what
   remains. Nothing is left over for a final invoice to absorb, and a job billed entirely with progress invoices
   adds up the same way.
3. **The tax** is computed per code, on that code's base for this invoice, at the code's rate version in force on
   the invoice date. The result is rounded half away from zero at the minor unit, the convention already used for
   line totals (J11).
   - The **invoice date** is the calendar day on which `issued_at` falls in the country's time zone, from the rule
     pack (Jamaica: America/Jamaica; Rule 3).
   - That rounding is per invoice per code, so it is at most half a minor unit per code per invoice. It is **not**
     absorbed anywhere: the tax due is the sum of the tax actually charged on each invoice. ADR 0030's "the final
     invoice absorbs rounding" is corrected by a note there.
4. **No invoice can be negative.** No invoice carries a negative or zero code base, and none has a total of zero
   or less. The CHECKs and the per-code ceiling enforce it.

**Computed under the lock** *(TD3)*. The API takes `quote_money_lock_for_issue()` **first** in the invoice's
transaction, then reads the remaining bases, computes the split and the tax, and inserts. Reading the mix before
the lock would let a variation land between the read and the write (R1.24c).

The database holds the result on three counts, whatever the application does:

- the per-code ceiling (T4) refuses a split computed from a stale mix;
- a COMMIT-time check refuses an invoice or credit note whose tax lines do not sum to its net and its tax;
- each tax line's tax is checked against its base × its frozen rate, rounded as above.

The database does **not** prove that the split is the largest-remainder split. That stays the shared core's,
tested there (§7).

**The quote's tax is an estimate.** Shown on the sealed issue, it is labelled an **estimate at today's rate**; the
invoice's figure is the tax. The estimate itself is checked at COMMIT *(TD10)*: the issue's `tax_minor` must equal
the sum over its codes of each code's line total × the rate frozen on the line, rounded per code as above. That
takes up J11's owed tax check. `quote_issue.tax_rate_basis_points` becomes nullable in a new migration, and is
NULL for issues sealed with codes, because one rate no longer describes an issue.

### T6 · Credit notes and withdrawal

- **A credit note is for net amounts per tax code, against one invoice** *(TD1)*.
  - **An ordinary correction** names an amount, which is split across the invoice's codes in the invoice's
    proportions (largest remainder, as T5).
  - **A credit that goes with a scope change** names its codes. This is the credit recorded before a negative
    variation that would leave a code over-billed (T4). When several invoices carry the code, the latest is
    credited first.
  - For every code, a credit never exceeds that invoice's base for the code, less earlier credits against it.
- **Tax is reversed at the rates that invoice used**: a credit note corrects that invoice, so it uses its rates
  (rec). **It is computed cumulatively** *(TD12)*. For each code, the tax reversed to date is the credited base to
  date × the invoice's rate, rounded half away from zero; this credit reverses that figure less what earlier
  credits reversed. The credit that completes a code's base reverses exactly the remainder of that code's tax. A
  fully credited invoice therefore shows exactly zero tax, never a cent either way.
- **It carries its own number** (T9). It lowers the invoiced net exactly as today (J4), and its tax lowers the tax
  due.

### T7 · Payments, over-payments, credits and withholding

The PRD needs records that do not exist yet (R1.26, finding C2). **(rec)**, with the invariants that keep every
cent accounted for *(TD6)*:

- **A payment** records what actually arrived: the amount, date, method and reference. It is never refused.
- **A payment is allocated** to one or more invoices of the same client.
  - Any unallocated remainder is a **client credit**. The tenant later allocates it to another invoice of that
    client, or settles it with a recorded **refund**.
  - A payment recorded from an invoice is allocated to that invoice by default.
  - A payment recorded against the client is allocated oldest-due first, shown to the tenant and confirmed in
    the same screen.
- **Withholding is a kind of settlement, not a shortfall.** An allocation can carry a withheld part, recorded as
  three things:
  - **its kind**, from the rule pack (Jamaica: the 2% contractors levy; the 3% withholding on specified services).
    Each kind states its rate, its base (gross for the levy; net, before GCT, for the 3%) and its threshold;
  - **its amount;**
  - **the certificate reference.** This may be "to follow" and added later, as its own record.

  The invoice is then settled, its status reads "paid", and **no reminder chases a withheld amount**.

**The invariants**, each enforced in the database:

1. The allocations of a payment never exceed the payment.
2. For each invoice, allocations plus withholdings never exceed its total less its credit notes' totals.
3. A withholding never exceeds its kind's rate × its base on that invoice, rounded half away from zero, and is
   refused when that base is below the kind's threshold. A 15,000.00 "2% levy" on a 115,000.00 invoice is
   refused: the most the levy can be is 2,300.00.
4. A client's credit balance never falls below zero, and a refund never exceeds it.
5. When a credit note or a void leaves an invoice over-settled, the excess becomes client credit in the same
   transaction. Nothing is left hanging.

**One lock per client for money received.** Allocations, refunds, withholdings and client credit move under a
per-client lock: a row in a per-client balance table, taken FOR UPDATE and written only by balance functions,
like `issue_balance`. A client credit spans quotes, and the money lock is per quote, so two allocations of the
same credit to invoices on different quotes would otherwise both succeed. The lock order is in T9.

**Status and reminders.** Invoice status stays derived (R1.25), from allocations, withholdings and credit notes.

- No reminder is sent to a client who holds unallocated credit. The tenant is told to allocate it, so a payment
  already received is never chased.
- "Overdue" means a balance is due after allocation, withholding and credits, past the due date.

### T8 · What a tax invoice carries

The rule pack lists what a tax invoice must show, and its wording; the PDF reads it. For Jamaica (unverified) it
shows:

- the title "Tax Invoice", the supply date and the serial number;
- the tenant's name, address and registration number;
- the client's name and address;
- each line's quantity and description;
- each code's rate and tax, and the total with tax.

**Issuing a tax invoice is refused** if a field the rule pack requires is missing — a registered tenant with no
registration number, or a client with no address — and the refusal names the missing field. An unregistered
tenant's invoice is titled "Invoice" and carries the not-registered wording.

**What the schema needs for this** *(TD9)*:

- **Addresses.** `client` and `tenant` gain structured address columns: two lines, a town, a region and an
  optional postal code. The region's name comes from the rule pack (Jamaica: parish).
- **Frozen details.** Each invoice and credit note freezes, on its own row at insert, the tenant's name, address
  and registration number, and the client's name and address. Editing a client later never rewrites an issued
  tax invoice, as `quote_issue.client_name` already works for quotes.
- **Lines on a deposit or progress invoice.** One line per tax code, with quantity 1, the code's base as its
  amount, and a description built from the rule pack's wording: the invoice's kind, its percentage if one was
  entered, the quote number and the code's label (for example, "Deposit — 40% of Q-0042 — building work
  (exempt)"). A final invoice shows the same per-code lines, with "invoiced to date" beneath.
- **The supply date.** Until the accountant answers question 3 of §6, it is the invoice date (T5, step 3).

### T9 · Numbers

- **Quotes (ADR 0031).** A number is allocated **once per quote**, and every revision carries it. It is shown as
  "Q-0042" for the first issue the client sees and "Q-0042 rev 2" after (rec: no suffix on the first, so the
  common case reads cleanly).
- **Invoices and credit notes get numbers too.** Today neither has one, and a tax invoice must be serialised.
  Each has its own series per tenant, with a prefix and a start, and never resets in R1 (ADR 0027 D11). Numbers
  are allocated atomically at issue, **gapless per series**, through the same allocation function. The start can
  never move below the last number allocated (R1.14, finding C8).
- **Schema** *(TD7)*. All in new migrations (Rule 6):
  - a **quote-number row** per quote, unique per quote, and unique per series and number;
  - a **per-issue numbering row**, insert-only, one per issue. It records the quote's number and the revision
    number shown. `quote_issue` keeps **no UPDATE path** (domain model §6.1a), so a revision sealed offline,
    before any number exists, gains its number as its own row;
  - `quote_issue_state()` is redefined in a new migration to read the new row. An issue is
    `sealed_awaiting_number` until its numbering row exists, and `issued` after. Every trigger that reads the
    state reads it through that function, so none changes;
  - `issue_number` receives no new rows: a new migration adds a trigger that refuses inserts. None exist outside
    tests, for the reason given in T4;
  - `invoice` and `credit_note` each gain a number from their series, set at insert.
- **Which revision is shown.** The revision shown counts **numbered** issues only, so the client never sees a gap.
  `quote_issue.revision` keeps counting seals.
  - A rev 1 blocked by the Free limit and never numbered, followed by a rev 2 that is released, shows as "Q-0042",
    because it is the first document the client sees.
  - **The quote's number is allocated, and metered** (ADR 0031: the meter is unchanged), at the first numbering
    of any issue of the quote, whichever revision that is.
  - A rejected seal never reaches numbering. A withdrawn acceptance's next revision takes the next shown
    revision.
- **Lock order** *(TD8)*. The order is: **the quote's money lock, then the client's lock (T7), then the series
  lock**. No transaction holds two quotes' locks. The allocation function enforces the order itself:
  - it is given the issue, invoice or credit note, and takes `quote_money_lock_for_issue()` before the series
    row;
  - two revisions numbered concurrently therefore serialise on the quote. The second finds the quote's number
    already allocated and allocates only its revision;
  - a J4 remedy's credit notes, then its variation, then a later invoice in one transaction take the locks in
    the same order.

  The series row is tenant-wide, so an invoice waiting on one quote's lock briefly holds up numbering on that
  tenant's other quotes. That is accepted: these transactions are short, and the order removes the deadlock. The
  race suite gains this shape, and the build adds it to `new-app/CLAUDE.md`'s list of deadlock shapes under
  "Financial writes".

## 4. What gets built once approved

1. **Migrations** (new; none edited — Rule 6):
   - tenant tax settings (registration, number and effective date) and tenant tax codes, with effective-dated
     rate versions. The treatment CHECK gains "out of scope" (TD11);
   - address columns on `client` and `tenant` (TD9);
   - a tax code reference on the draft quote line. The sealed issue line gains the code's reference, label and
     rate as sealed. `quote_issue.tax_rate_basis_points` becomes nullable, and the issue's tax is checked at
     COMMIT (T5, TD10);
   - `issue_balance_open()` copies the net, and the per-code balance is kept by the balance functions, inside the
     same lock. Every row of T4's table is changed as it says, with test N6's flipped intent recorded (TD4);
   - variation lines, with the stored header checked against them at COMMIT and lines allowed only in the
     header's transaction (TD5);
   - on `invoice` and `credit_note`: `amount_minor` as net, a tax column and a total column, frozen party details
     (TD9), a per-code tax-line table each, a number, and the COMMIT checks (TD3);
   - payments, allocations, client credits, refunds and withholdings, the per-client lock, and the invariants of
     T7 (TD6);
   - the quote-number row, the per-issue numbering row, the redefined `quote_issue_state()`, the refusal on
     `issue_number`, and one allocation function for all three series, which takes the locks in order (TD7, TD8);
   - explicit grants to `pryvis_balance` on each new table its functions read (TD4).
2. **The rule pack** in the shared core: Jamaica's names, labels, codes with effective dates, threshold, time
   zone, invoice requirements and withholding kinds (rate, base and threshold) — with the tax-name guard (T1).
3. **The tax arithmetic** in the shared core, written once (Rule 7) and used by the API and the PDF alike: the
   percentage, the largest-remainder split, per-code rounding, and cumulative credit reversal.
4. **`new-app/CLAUDE.md`**: the new lock order and its deadlock shape, under "Financial writes".

## 5. Tests, each proved with a planted defect

**The ceiling**

- **The boundary** (TD4): an invoice exactly at the net ceiling is accepted, and one at net ceiling + 1 is
  refused. Plants: the gross figure in `issue_balance_open()` alone, and the gross figure in the sum.
- An invoice whose net fits but whose total with tax would not, is **accepted**.
- **The per-code ceiling** (TD1): the read's two examples run as tests.
  - The −95,000.00 standard variation after a 50% deposit is refused alone, and accepted after a 45,000.00
    standard credit. The final invoice then bills 50,000.00 exempt and no tax.
  - The −300,000.00 variation after 800,000.00 invoiced needs 200,000.00 of standard credit. Afterwards the tax
    charged equals 15% of the standard scope.
  - Plant: the per-code check removed. Both tests fail.
- **A variation's lines** (TD5): lines that do not sum to the header are refused at COMMIT, and a line added in a
  later transaction is refused.

**Invoice tax**

- **The split** (TD2): 10,000.00 over three equal codes splits 3,333.34 + 3,333.33 + 3,333.33. A job billed
  entirely with progress invoices adds up exactly. Plant: rounding each share half away from zero, which sums
  to 9,999.99 — the test fails.
- A rate change between two progress invoices taxes each at its own date's rate, and the bases still add up.
- The invoice date is the Jamaican calendar day. A boundary case: 04:30 UTC is still the previous day in Jamaica.
- Rounding: a set of amounts whose naive per-line rounding differs from per-code rounding.
- **The COMMIT checks** (TD3): an invoice whose tax lines do not sum to its header is refused. A stale split
  (a variation committed between the read and the insert) is refused by the per-code ceiling.

**Credit notes**

- A credit note reverses tax in its invoice's proportions, at its invoice's rates.
- **Cumulative reversal** (TD12): three credits of 100.10 against an invoice for 300.30 reverse exactly 45.05.
  Credits of 333.43, 333.43 and 333.44 against an invoice for 1,000.30 reverse exactly 150.05. Plant: tax on each
  credit computed alone — both tests fail.

**Tenant settings and documents**

- An unregistered tenant cannot choose a tax code; its invoice carries no tax and the not-registered wording.
- Registration after sealing: the invoice requires the code mapping. Deregistration: the invoice carries no tax.
- A rate version dated before today is refused. A tenant code still on the pack default follows a new pack
  version; a tenant-set rate does not.
- A tax invoice missing a required field is refused, naming the field. Editing the client afterwards leaves the
  issued invoice unchanged.

**Payments**

- Over-payment becomes a client credit, and a 2% withholding settles an invoice with no reminder.
- **The invariants** (TD6): a "levy" above 2% of the gross is refused; two concurrent allocations of one credit
  to invoices on two quotes — one is refused (race suite); a credit note on a paid invoice moves the excess to
  client credit.

**Numbers**

- Revisions keep their quote's number. Invoice and credit-note series are gapless under concurrent allocation.
  Both run in the race suite, on real PostgreSQL.
- **Numbering** (TD7): a blocked rev 1 followed by a released rev 2 shows "Q-0042" and meters once. Two revisions
  numbered concurrently share one quote number.
- **Lock order** (TD8): a J4 remedy and an invoice on another quote of the same tenant, run concurrently, finish
  without deadlock (race suite).

**The tax-name guard**

- It catches every evasion that T1 lists, each planted.

## 6. Questions for the accountant (before launch)

1. Is our reading of the construction exemption and its exclusions right? How should a job that mixes building
   work with installation be invoiced?
2. Are materials supplied within an exempt construction service exempt too?
3. For a deposit or progress invoice, is apportioning tax by the job's remaining mix acceptable? When is the tax
   point — the invoice date, or payment?
4. Does a rate change apply by invoice date to work already contracted?
5. Is the tax-invoice field list complete, including whether the customer's registration number is required?
6. How should the 2% contractors levy and the 3% withholding be shown on the invoice and in the contractor's
   records? Is the 3% threshold measured per payment or per invoice?
7. A contractor registers part-way through a job priced without tax. Must the later invoices charge tax on the
   remaining work, and on what base?

## 7. What this does not do (Rule 21.4)

- It does not settle any of the law. §2 is our reading of public sources, unverified, until the accountant
  answers §6.
- It does not build Trinidad and Tobago's rule pack — only the shape that makes it a data change.
- It does not let a contractor invoice chosen lines (T5 option B): R2 at the earliest.
- It does not file returns or produce tax reports. An accountant export is excluded from R1 (PRD §8).
- It does not cover imported services, customs, or income tax beyond recording what was withheld.
- **The database does not prove that an invoice's split is the largest-remainder split** (T5). It proves the
  bounds: no code over its scope, lines summing to the header, and tax matching base × rate. The exact split is
  the shared core's, tested there.
- Staff overrides of a rule pack arrive with the staff console (D7). Until then a statutory change ships as a
  release.

## 8. The independent read, and where each finding is answered

Read by Opus from `docs/briefs/2026-10-02-tax-design-read.md` at `8448b17`. Verdict: "not yet … sound after the
named changes". The read named 15 findings: one blocker, ten major and four minor. Each is answered above.

| Finding | Severity | Answered in |
|---|---|---|
| TD1 · bases go negative when a variation moves the mix; tax over-charged after a J4 credit | blocker | T4 (the per-code ceiling), T5 (split by remaining base, no negative invoice), T6 (credits that target codes) |
| TD2 · rounding of the net split unspecified; "final" undefined; ADR 0030's wording | major | T5, steps 1-3; a note in ADR 0030 |
| TD3 · tax computed outside the lock; nothing ties tax lines to the header | major | T5, "Computed under the lock" |
| TD4 · other readers of the gross figure; N6 and the oracle; the boundary plant; existing rows; grants | major | T4's table and the paragraphs after it |
| TD5 · a variation line's relationship to the ceiling | major | T4, the variation bullet |
| TD6 · withholding unbounded; client credit unlocked; over-allocation; "overdue" | major | T7, the invariants and the per-client lock |
| TD7 · numbering against the append-only issue | major | T9, Schema and "Which revision is shown" |
| TD8 · lock order of the series against the quote | major | T9, Lock order; §4 item 4 |
| TD9 · addresses, frozen details, deposit lines, supply date | major | T8, "What the schema needs" |
| TD10 · the line keeps no code identity; `tax_rate_basis_points`; J11's owed check | major | T3, and T5's estimate paragraph |
| TD11 · registration mid-job; out of scope; precedence over time | major | T2 |
| TD12 · credit-note tax drifts by rounding | minor | T6, cumulative reversal |
| TD13 · the guard's scope | minor | T1, the tax-name guard |
| TD14 · other documents without a pointer; T4 restated "invoiced" | minor | T4 now refers to `issue_balance_apply()`. Pointers added in PRD R1.9, R1.14, R1.24 and §12; domain model §6.1a, §6.2a (three places), §6.3 and §7; ADR 0030 decision 1 |
| TD15 · day boundary; backdated rates; added codes' warning; staff overrides after D2 | minor | T5 step 3; T2; §7 |
