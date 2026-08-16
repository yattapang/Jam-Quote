# JamQuote — Functional Audit Checklist

**Purpose:** find gaps by using the app the way a contractor does, including
the seams between screens that unit tests cannot reach.

**How to use.** Work through a section at a time. Each item says what to do and
what CORRECT looks like — if what you see differs, that is a finding even if
nothing crashed. Note the tab, what you did, what you expected, what happened.
A screenshot beats a description for anything visual.

**Do it on a phone.** Every round of real use has found layout defects that
passed on desktop. Where an item is desktop-only it says so.

**Sign in as** `yattapang@gmail.com` (business "Jamquote") for normal use, and
use **view-as-tenant** from the admin console to inspect Blackwood, which is
the only tenant with enough data to make Reports render.

**The bias of this document:** it weights *silently wrong* above *visibly
broken*. A screen that fails loudly gets reported by anyone. A quote that
prints the wrong unit, or a report that quietly counts the wrong thing, is
what actually costs a contractor money.

---

## 0. Before you start

- [ ] Note the date and which build you are on (the footer/commit if shown).
- [ ] Have a second browser or private window available for the isolation
      checks in §7.
- [ ] Expect Blackwood to have 11 quotes, 7 clients, 7 projects, 0 invoices.
      Anything else means data changed since 2026-08-15 — worth knowing before
      you interpret Reports.

---

## 1. Catalogs — the libraries everything else draws on

### Materials
- [ ] Add a material with a category, a sold-by unit and a price.
- [ ] Add one using **+ New category…** from within the form. Correct: the new
      category is selectable immediately, without a page reload.
- [ ] Add a material with **coverage** configured — measured in `m²`, covers
      `4` per box, waste `10%`.
- [ ] Edit a saved material. Correct: every field you set comes back populated,
      including coverage. A field that silently empties on edit is a data-loss
      bug, not a display bug.

### Labour
- [ ] Add a labour rate. Open the **Trade type** dropdown *without typing*.
      Correct: an "+ Add a new trade" row is visible immediately.
- [ ] Create a trade from there. Correct: it is selected on the rate you are
      building, not just added to a list somewhere.
- [ ] Set the rate's unit using **+ Add a unit…** and type `sq ft`.
      Correct: the list shows `$X / sq ft`, not `$X / unit`.

### Equipment
- [ ] Add an item marked **hired**, with a vendor and phone.
- [ ] Add one marked **owned**. Correct: vendor fields disappear.
- [ ] Edit the hired one and switch it to owned, save, reopen.
      Correct: no stale vendor details linger on a machine you now own.

### Jobs (the library)
- [ ] With no jobs saved, read the empty state. Correct: it explains what a job
      is with a concrete example — not just "nothing here".
- [ ] Build a job from components: a material, a labour rate, unit `sq ft`.
      Correct: the unit cost is computed from the components as you add them.
- [ ] **Phone only:** check the Saved material/labour picker inside each
      component row is full width and usable. It was 32px wide until recently.

---

## 2. Quotes — the screen that matters most

### Line kinds
For **each** of Material, Labour, Equipment and Job:
- [ ] Set **Kind**, then open **Saved**. Correct: the picker offers that
      library — materials for Material, rates for Labour, and so on.
- [ ] Use the **+ Add new…** row in each. Correct: the modal opens over the
      quote, the new entry appears in the dropdown *immediately*, it is applied
      to the line, and **nothing you had already typed on the quote is lost**.
- [ ] For Job, the quick form asks name/unit/rate only. Correct: after saving,
      the line is priced at the rate you typed — **not $0**. This is the single
      most important check on this page.
- [ ] Switch a line's Kind after filling it in. Correct: your description,
      quantity and price survive; the old library's identity does not.

### Units and coverage
- [ ] Put the `sq ft` labour rate on a line. Correct: the line's unit reads
      `sq ft`.
- [ ] Put the coverage material on a line, enter `40` as the measured quantity.
      Correct: the quantity becomes **11 boxes** (40 + 10% = 44, ÷4 = 11) and
      the working is shown beneath.
- [ ] Type `13` over the computed quantity. Correct: it stays 13 — the
      calculator does not overwrite you — and the hint says what will be billed.
- [ ] Put a job priced per `sq ft` on a line, then **view the PDF**.
      Correct: it reads `sq ft`, not `unit`. Check the PDF, not just the editor.

### Structure and totals
- [ ] Give lines custom headings. Correct: they group under those headings on
      the PDF.
- [ ] Set discount, deposit and GCT. Correct: the totals panel and the PDF
      agree to the cent.
- [ ] Save, reopen for edit. Correct: every line returns with its kind, unit,
      price and heading intact. A job line still shows its job.
- [ ] Email the quote to yourself. Correct: it arrives, the logo is present,
      and the status becomes **Sent**.
- [ ] Mark it Accepted. Correct: the option exists and the status moves.

---

## 3. Projects, Clients, Invoices

- [ ] Create a client with town/parish. Add a project for them.
- [ ] Set the project's stage and progress. Correct: both persist on reload.
- [ ] Convert an accepted quote to an invoice. Correct: **every line, total and
      unit carries across unchanged**.
- [ ] Edit the draft invoice: change the bill-to client. Correct: it saves, and
      clearing it back to none also sticks.
- [ ] Finalize, then record a partial payment. Correct: status becomes PARTIAL
      and the balance is right.
- [ ] Record the remainder. Correct: PAID.
- [ ] Void a payment. Correct: the balance goes back up; the invoice stops
      being PAID.
- [ ] Email the invoice. Correct: arrives with the logo.

---

## 4. THE MONEY SEAM — do this one carefully

This is the part nothing else tests, and where a wrong number is invisible.

- [ ] Note the quote's **total**. Convert it to an invoice. Correct: the
      invoice total is identical.
- [ ] Open **Reports** for a period covering today.
  - [ ] "Invoiced" includes that invoice's total.
  - [ ] "Collected" does **not** move until you record a payment.
  - [ ] Record a payment. Correct: "Collected" rises by exactly that amount,
        and does so in the period the payment was **paid**, not the period the
        invoice was raised.
- [ ] Check **outstanding by client** shows the unpaid balance against the
      right client.
- [ ] Change the period to one that **excludes** the invoice. Correct:
      invoiced/collected drop out, but **receivables still show the debt** —
      an old debt is still owed today. If receivables empty out, that is a bug.
- [ ] Sum the **sales-by-month chart**. Correct: it equals the invoiced and
      collected headline figures above it.
- [ ] Mark a quote accepted, then invoice it. Correct: your **win rate does not
      fall**. Invoicing a job you won must not look like losing it.
- [ ] Check the dashboard's **overdue** figure against an invoice with a past
      due date. Correct: it is not $0.

---

## 5. Settings — Catalog & vocabulary

- [ ] Hide a curated category you never use. Correct: it disappears from the
      material form's category picker **and** the quote line's filter.
- [ ] Restore it. Correct: it comes back everywhere.
- [ ] Hide one of your own trades. Correct: gone from the labour form's picker.
- [ ] Confirm a material already using a hidden category still exists and still
      shows that category. Hiding is not deleting — if data vanished, that is a
      serious finding.
- [ ] Open a **previously sent** quote/PDF that used a hidden unit. Correct:
      unchanged. A document a customer holds must never change.

---

## 6. JamQuote staff — the admin console

Sign in as the admin account.

- [ ] Tenant list: real plans display correctly (a Pro tenant must not read as
      Free), and MRR is not $0.00 for a paying tenant.
- [ ] Open a tenant drawer. Correct: quotas and MRR match the actual plan.
- [ ] **View as tenant** on Blackwood.
  - [ ] A banner names the tenant and says read-only, and stays visible **as
        you scroll**.
  - [ ] You can browse every tenant screen.
  - [ ] Attempt an edit — save a quote, record a payment. Correct: it is
        **refused**. Staff must not be able to act as a contractor.
  - [ ] Exit returns you to the admin console still signed in as yourself.
- [ ] Audit log: your view-as session is recorded, with who and when.
- [ ] **Phone only:** every console tab fits — no content cut off, tables
      scroll inside their own card rather than the page sliding sideways.
- [ ] Financials/overview: note anything that looks like placeholder data
      (round numbers, identical values, a suspiciously tidy chart). Some
      fixture values are known to remain here.

---

## 7. Tenant isolation — the check that must never fail

- [ ] In a second window, sign in as a **different** tenant.
- [ ] Confirm you see only that business's clients, quotes, materials and
      reports. Zero rows from the other.
- [ ] Hide a catalog entry as tenant A. Correct: tenant B is **unaffected** —
      curated entries are shared, and one contractor's preference must never
      change another's list.
- [ ] While viewing as a tenant, try to reach the admin console. Correct:
      refused.

---

## 8. Known and already recorded — do not re-report

- Card checkout (WiPay) is not built; credentials outstanding.
- Mobile app screens still show mock data.
- Quote email has no logo (invoice email does).
- The sidebar shows your own business name during a view-as session.
- Some admin console figures are still fixture values.
- A tenant cannot see that staff viewed their data (policy question, #41).

---

## 9. Recording findings

For each, note: **tab · what you did · what you expected · what happened**, and
whether it was **wrong** (a bug) or **awkward** (an improvement). Both are
worth capturing, but they get fixed in different orders — a wrong number ships
before a clumsy flow.

Flag anything where the app **looked like it worked and did not**. Those are
the expensive ones, and they are exactly what this checklist is weighted to
find.
