# Pryvis tiers, feature groupings and the release order

Owner decisions (2026-09-20): three tiers — **Free, Pro, Business**; entitlements
**enforced server-side** with existing users **grandfathered**; features shipped **one at a
time**; next market after Jamaica is **Trinidad & Tobago**.

Design: ADR [0007](adr/0007-subscription-tiers-and-entitlements.md). Rules that govern the
build: [BUILD-RULES.md](BUILD-RULES.md).

---

## 1. Where the product stands against these objectives

| Objective | Today | Gap to close |
|---|---|---|
| Tiers with feature groups | One boolean: `plan` is `free` or `pro`; the only limit is `freeQuotesPerMonth` | Named entitlements, a tier ladder as data, one resolver, server enforcement |
| Rules as data, not logic | Rule pack per country in core plus `RulePackConfig` overrides; a document records the rates it used | Tier prices per country; timezone still Jamaica-wide |
| Currency abstracted | Amounts are integer minor units with a currency code; formatting only in core; tenant currency separate from platform billing currency | Platform prices are one currency; needs price per country when TT opens |
| Tenant- and country-aware model | `businessId` on every tenant row; `countryCode` on the business; ownership checks on caller-supplied ids; tenancy tested as a flow | Nothing structural outstanding; timezone per country |
| Tests for core workflows | 2,000+ unit tests, 39 cross-section flow tests against a real Postgres, parser-based guards | Keep the pattern: every feature ships flow tests at its seams |
| Docs explaining why | Dense "why" comments and a review register | ADR log now exists; keep it current |
| Naming and structure | Consistent by convention | Written down and enforceable; npm scope becomes `@pryvis/*` (ADR 0009) |

**The honest summary:** the foundations the multi-country goal needs are already in place —
rules as data, money as minor units, tenancy on every row, one shared core. What is missing
is the commercial layer: the product cannot currently express "this feature belongs to that
tier", so every feature after this one would be retrofitted. That is why tiers ship first.

## 2. The tier ladder

Prices are a commercial decision and are not set here; `PlanTierConfig` holds them per
country. What each tier *includes* is the design.

| | **Free** | **Pro** | **Business** |
|---|---|---|---|
| Who it is for | A contractor trying the product | A working solo contractor or a one-crew outfit | A firm with a team, an office and several crews |
| Quotes | 3 jobs **numbered** a month; revisions and declines free | Unlimited | Unlimited |
| Branded PDF quote | ✓ | ✓ | ✓ |
| Share by WhatsApp or email link | ✓ | ✓ | ✓ |
| Client list | ✓ | ✓ | ✓ |
| Catalog: materials, labour, equipment | ✓ | ✓ | ✓ |
| Job recipes (price a job once, reuse it) | **create one** | unlimited | unlimited |
| Invoices and payment recording | — | ✓ | ✓ |
| Payment reminders and overdue digest | — | ✓ | ✓ |
| Card payment links (WiPay) | — | ✓ | ✓ |
| Project costing and job profit | — | ✓ *(release 2)* | ✓ *(release 2)* |
| Retention tracking | — | ✓ *(release 2)* | ✓ *(release 2)* |
| Accountant exports (CSV) | — | ✓ *(release 2)* | ✓ *(release 2)* |
| Offline **sealing** — price and capture a job with no signal | ✓ | ✓ | ✓ |
| Offline **issuing** — a number at the gate (release 2) | — | ✓ | ✓ |
| Users on the account | 1 | 1 | up to 10, then per seat |
| Roles and approvals (who may send or discount) | — | — | ✓ |
| Multi-crew assignment and crew cost rates | — | — | ✓ |
| Consolidated reporting across projects | — | — | ✓ |
| Material price index and supplier comparison | — | read | read + alerts |
| Custom document branding (logo, colours, terms) | logo | logo + colours | full, plus per-client terms |
| WhatsApp Business sending (templated, receipts) | — | — | ✓ |
| API access and integrations | — | — | ✓ |
| Support | email | email | priority |

**A tick with *(release 2)* means the tier will include it and release 1 does not** (finding H15). The
site marks the same three the same way, and `new-app/web/test/site-guards.test.ts` fails if the site ever
sells an unmarked feature the current release does not deliver — this table has no such guard, which is
why the marking is written by hand and worth checking when the ladder changes.

Notes on the boundaries, since they are the commercial decisions:

- **Invoicing is the Pro line.** Quoting wins the customer; getting paid is what they will
  pay for. Free stays genuinely useful so the product spreads by word of mouth.
- **Offline sealing is on every tier, and that is deliberate (ADR 0023).** This table used to put
  "offline mobile use" on Pro. Sealing a job with no signal *is* the product's promise — "price the job
  while you are standing there" — and a free tier that fails at a gate does not spread by word of mouth,
  which is the only distribution this product has. What Pro buys is offline **issuing**: a real number at
  the gate, which needs device number leases and arrives in release 2.
- **Free creates one recipe (ADR 0023).** "View only" gave a new free tenant nothing to view, so the
  wedge could not demonstrate the one feature the product is chosen for. One is enough to price the same
  job twice and feel the value; the second is the most honest upsell in the ladder, because the
  contractor discovers the need themselves.
- **Business is about more than one person:** roles, approvals, crews, consolidated
  reporting. That is what a firm with an office actually needs, and it is the natural
  per-seat story.
- **WhatsApp Business sending sits on Business** because it carries a per-message cost and
  needs Meta verification; click-to-chat sharing stays on every tier.

## 2. Scope, decided 2026-09-24

**One product, built to verticalise later** (ADR 0017). The ladder below is unchanged by that
decision: one product, one set of tiers. What changes is the build - trade-specific behaviour
(units, material attributes, labour trades, starter recipes, document wording, quoting style) is a
**data pack**, so adding electrical or plumbing later is configuration and content rather than a
second product or a second tier ladder. A trade is never a tier and never appears in pricing.

## 2a. How a tenant gets an account, and how they upgrade

Owner decision, 2026-09-23. Recorded as a rule (Rule 14) and a decision (ADR 0015).

**Sign-up is self-service and free.** A contractor registers on pryvis.com, on the Free tier,
with no approval, no sales call and no waiting. Registration creates the business, its first
owner and a Free subscription in one transaction, so a tenant never exists without a plan.

**Upgrading is self-service by card.** The tenant chooses Pro or Business, pays by card
(WiPay), and their entitlements change when the payment succeeds - no deploy, no admin step,
because entitlements are data behind one resolver.

**Paying another way is not self-service, deliberately.** A bank transfer, cheque or cash
payment is recorded, approved by someone other than the person who activates it, and verified
against the bank statement rather than an uploaded receipt (Rule 13). Both routes end at the
same entitlement change; only the card route is automatic. That asymmetry is the fraud control,
and it is the reason a manual payment takes longer.

**Downgrading and lapsing** keep the tenant's data intact and remove the entitlements. What the
tenant may still do on Free - read their old invoices, export their data - is a product decision
owed with feature 1, and it should be generous: a contractor locked out of their own quote
history will not come back, and will tell people why.

What sign-up needs before it can face the public, none of which exists yet: rate limiting, email
verification before anything costs us money, and a duplicate registration that does not confirm
the address is taken (it emails the existing owner instead).

## 3. Features worth adding, in the order I would ship them

Each is one feature under the one-at-a-time rule, and each lands with its entitlement.

**1. Tiers and entitlements** (this one). Everything else plugs into it.

**2. Deposit and progress invoicing.** Construction is paid in stages: a deposit, progress
claims against work done, retention held and released. Retention exists; staged claims do
not. This is the most common reason a Jamaican contractor still uses a paper book.

**3. Client approval on the quote page.** The public page can already accept or decline. Contractors need
proof the client agreed to a price before work starts, which is exactly the dispute that costs them.

**Superseded in part by ADR 0024 (finding H15).** This item originally said "add a typed name, a timestamp
and a PDF record of the acceptance", and both halves have since been overtaken:

- the owner ruled that **a typed name is not legal in a dispute**, and that a properly constructed
  e-signature can be — so release 1 builds a **one-time-code-verified signature** over a hashed document,
  not a typed name;
- the acceptance does **not** carry a PDF record of its own. One hash lives on `document_render` and the
  acceptance references it (finding F17), because two hashes of one document is two things to keep in
  step.

The need this item names is real and unchanged; the mechanism it prescribed is not what gets built.

**4. Material price index with supplier comparison.** — and see `PRODUCT-OPPORTUNITIES.md`: this
is also the most defensible asset in the business, with two conditions that cannot be retro-fitted.
Using tenants' price data in aggregate needs their **consent in the sign-up terms**, and a
statistical guarantee that no tenant can infer a named competitor's buying price.
 Already planned. It makes the product
sticky: a quote priced from this week's prices is a quote a rival cannot match by hand.

**5. Variations and change orders as first-class documents.** A variation exists as a quote
descendant; make it a named, client-signable change with its own total and its own approval,
so the final invoice reconciles against the original quote.

**6. WhatsApp Business sending.** Templated delivery with receipts, so a contractor knows a
client opened the quote. Needs Meta verification lead time, so start the application early
even though it ships later.

**7. Crew time and labour capture.** Log hours against a job from the phone, price them from
the labour rate book, and feed job profit. Turns the costing screens from estimates into
actuals.

**8. Supplier purchase orders.** Issue a PO from a quote's material list. Suppliers already
sell to these contractors on account; a PO makes the product part of the buying flow.

**9. Statutory helpers per country.** GCT/VAT return summaries from the invoice ledger, and
statutory deduction summaries for crew. This is where "rules as data" pays for itself, and
it is a strong Business-tier reason.

**10. Multi-country onboarding.** A country picker at signup that loads the right rule pack,
currency, taxpayer-id format and document labels — the step that makes Trinidad & Tobago a
configuration rather than a project.

Deliberately not recommended yet: full accounting (QuickBooks integration beats rebuilding
it), inventory (contractors buy per job, not per stock), and a customer portal (the share
link already does the job).

## 4. How each feature ships

Per `docs/BUILD-RULES.md` §8: entitlement wired in at build time; rule-pack entries if the
feature is country-dependent; tests at all three layers with a planted defect per new test;
an ADR if it changes the system's shape; a row in the matrix above; plain-English wording;
an independent review before it lands.
