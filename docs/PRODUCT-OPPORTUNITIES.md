# What to add, and what to take out

**The owner's question, 2026-09-24:** based on the product as proposed, are there additional
features or related business solutions worth adding? And are there features currently inside this
application that should be taken *out* and built as a separate solution, even if that solution needs
improvement?

**I misread this the first time.** I answered the brief's "one product or two" question as a
verticalisation question — whether the code should be ready for a second *trade*. That was a real
decision and it stands (ADR 0017), but it was not this question. This is a **product-portfolio**
question: what else could this business sell, and what is currently bundled that would be worth more
standing on its own.

**Method.** I went through the 34-item feature inventory in `PHASE-0-AUDIT.md` §6 asking two things
of each: *who else would pay for this on its own?* and *is this here because it belongs here, or
because it happened to get built here?* Then I looked at what the existing data makes possible that
the current feature set does not exploit.

**Nothing here is a decision.** It is analysis with recommendations, and the ones I would decline
are argued as plainly as the ones I would take.

---

## Part 1 — What the product already knows that it does not yet use

The most valuable additions are not new ideas. They are things the data already in the system makes
possible, where a competitor would need years of history to catch up.

### A1. The material price index — the strongest asset in the product (**recommend: build, and treat it as strategic**)

Every tenant enters supplier prices for materials. Across tenants, that is **a live price index for
Jamaican construction materials** — what things actually cost this week, by supplier, by parish.
Nobody else has this, and it compounds: the more contractors quote with it, the better it gets.

- **To the contractor:** "cement is up 8% this month, and your saved price is six weeks old — your
  next quote is under-priced." That is the single most useful sentence the product could say.
- **As a separate business:** a price index is saleable to people who will never write a quote —
  quantity surveyors, developers, insurers assessing rebuild costs, lenders sizing construction
  loans, and the trade press.

**This is the item I would most want the owner to think about**, because it has three conditions
attached that are easy to get wrong and hard to fix later:

1. **Consent and contract.** Using tenants' price data in aggregate must be disclosed and agreed
   from the first day, in the terms they accept at sign-up. Retro-fitting that consent later is
   either impossible or a breach of trust. If the index is ever a product, the terms must permit it
   *now*.
2. **Never identifying.** A tenant must never be able to infer a named competitor's buying price. That
   means minimum counts per data point and no single-source figures — a real statistical constraint,
   not a promise.
3. **It is worth more as a moat than as a line item.** Selling the index to third parties while it is
   also the reason contractors stay could undercut the core product. My instinct is: use it to win
   the market first, license it later.

### A2. Supplier-side presence (**recommend: explore, do not build yet**)

Contractors are already pricing from suppliers' catalogues by hand. A supplier who could publish a
current price list into Pryvis would get their products into quotes at the moment of decision. That
is a **second customer type with its own willingness to pay**, and the marketplace dynamic is real:
suppliers pay to reach contractors, contractors get prices they do not have to type.

Why not yet: it is a genuinely different product with a different sales motion, and it only works
once enough contractors are quoting to be worth reaching. **Sequence matters more than the idea.**

### A3. Proof of what was agreed (**recommend: build — cheap, and the pain is acute**)

Already listed as feature 3 in `TIERS.md`. Worth restating here because it is the one where
contractors lose the most money: a client who says "I never agreed to that price". The public quote
page already accepts; adding a typed name, a timestamp, an IP and a PDF record of the acceptance
turns the product into evidence. Small work, disproportionate value, and it is the foundation for
change orders.

### A4. Getting paid faster (**recommend: investigate the local reality first**)

The invoice ledger knows who owes what and for how long. Adjacent businesses exist here — invoice
financing, factoring, credit scoring of clients — and a contractor's worst problem is often cash
timing rather than winning work.

**This is a financial service, not a feature.** It needs a lender, regulatory advice and capital,
none of which we have. What is available *without* becoming a lender: telling a contractor which
clients actually pay late, and helping them ask for a deposit. That is a report and a nudge, not a
balance sheet.

### A5. The numbers the taxman wants (**recommend: build, Business tier**)

GCT return summaries from the invoice ledger, and statutory deduction summaries for crew. Already
item 9 in `TIERS.md`. Worth flagging as an *adjacent-business* answer too: the reason a contractor's
accountant currently charges them for data entry is that nobody gives the accountant clean data.
There is a modest business in being the tool accountants ask their construction clients to use.

---

## Part 2 — What could come out

I looked hard for candidates. There are two, and only one is clear.

### R1. The regulatory feed — **take it out** (already recommended as *drop* in the audit)

An admin-curated feed of regulatory updates. It has nothing to do with quoting: no shared data, no
shared workflow, and a per-item content cost with no revenue attached. It survives only because it
was built.

**Is it a separate solution?** Possibly a small one — a "what changed in Jamaican construction
regulation" newsletter or paid bulletin — but that is a **media product**, sold to a different buyer
on different economics, and it needs an editor rather than an engineer. It should not be inside a
quoting tool either way.

### R2. Project costing and job profit — **keep, but know why you are keeping it**

This is the honest candidate for extraction. Purchases, labour entries and job profit are
*bookkeeping*, adjacent to but distinct from quoting, and there is a recognisable separate product
in "job cost tracking for contractors" that would compete with QuickBooks-plus-a-spreadsheet.

**I recommend keeping it, for one specific reason:** it closes the loop that makes quoting
trustworthy. A contractor who learns that last month's quotes lost money prices better next month,
and that learning is what stops quoting being guesswork. Remove it and the product becomes a
document generator.

But it should stay **deliberately shallow** — enough to answer "did this job make money", not a
general ledger. The moment it grows trial balances and chart-of-accounts, it has become the other
product and should be reconsidered.

### Not candidates, and why

- **Invoicing** is not separable. It is the paid line (ADR 0007) and the reason people upgrade.
- **The catalog** is the engine every other feature reads. Extracting it would leave quoting with
  nothing to price from.
- **Job recipes** are the product's actual differentiator. If anything ever spins out, it will be
  built *around* these, not without them.
- **Mobile and sync** are a channel, not a product.

---

## Part 3 — Two related businesses the existing product does not address

Named for completeness, because the question invited it, and both are honestly out of scope now.

- **Sub-contractor and crew management** — scheduling, timesheets, statutory deductions, who is on
  which site. A real, adjacent pain, and a different product: workforce management. Crew time capture
  (`TIERS.md` item 7) is the shallow, in-scope slice; the rest is a separate build.
- **Client-side procurement** — the homeowner or developer collecting and comparing quotes. This is
  the marketplace temptation, and it puts us on the other side of the table from the people who pay
  us. **I would not.** A contractor will not price honestly in a tool that helps their client shop
  them around.

---

## What I would do, in order

1. **Decide the price-index question now, in the terms** (A1). It is the only item here whose option
   expires: the consent has to be in the sign-up terms from the first tenant, and the terms are
   being drafted this week.
2. **Build the acceptance record** (A3) — small, evidential, unblocks change orders.
3. **Drop the regulatory feed** (R1) as already recommended.
4. **Keep costing shallow and deliberate** (R2), with a written line for when it has grown too far.
5. **Park A2, A4 and the two adjacent businesses** as recorded opportunities with trigger conditions,
   not roadmap items.

## What this changes in the plan

- `TIERS.md` gains the acceptance record and the price index where they already sit in the feature
  order, plus the note that the index carries consent and anonymity conditions.
- The **terms of service** — currently a draft on the parked website branch — must settle the
  aggregate-data question before the first tenant signs up. That is now a dependency of sign-up, not
  of the website.
- The audit's *drop* verdict on the regulatory feed is confirmed rather than revisited.
