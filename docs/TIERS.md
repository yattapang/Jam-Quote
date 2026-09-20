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
| Quotes | 3 new jobs quoted a month | Unlimited | Unlimited |
| Branded PDF quote | ✓ | ✓ | ✓ |
| Share by WhatsApp or email link | ✓ | ✓ | ✓ |
| Client list | ✓ | ✓ | ✓ |
| Catalog: materials, labour, equipment | ✓ | ✓ | ✓ |
| Job recipes (price a job once, reuse it) | view only | ✓ | ✓ |
| Invoices and payment recording | — | ✓ | ✓ |
| Payment reminders and overdue digest | — | ✓ | ✓ |
| Card payment links (WiPay) | — | ✓ | ✓ |
| Project costing and job profit | — | ✓ | ✓ |
| Retention tracking | — | ✓ | ✓ |
| Accountant exports (CSV) | — | ✓ | ✓ |
| Offline mobile use | — | ✓ | ✓ |
| Users on the account | 1 | 1 | up to 10, then per seat |
| Roles and approvals (who may send or discount) | — | — | ✓ |
| Multi-crew assignment and crew cost rates | — | — | ✓ |
| Consolidated reporting across projects | — | — | ✓ |
| Material price index and supplier comparison | — | read | read + alerts |
| Custom document branding (logo, colours, terms) | logo | logo + colours | full, plus per-client terms |
| WhatsApp Business sending (templated, receipts) | — | — | ✓ |
| API access and integrations | — | — | ✓ |
| Support | email | email | priority |

Notes on the boundaries, since they are the commercial decisions:

- **Invoicing is the Pro line.** Quoting wins the customer; getting paid is what they will
  pay for. Free stays genuinely useful so the product spreads by word of mouth.
- **Business is about more than one person:** roles, approvals, crews, consolidated
  reporting. That is what a firm with an office actually needs, and it is the natural
  per-seat story.
- **WhatsApp Business sending sits on Business** because it carries a per-message cost and
  needs Meta verification; click-to-chat sharing stays on every tier.

## 3. Features worth adding, in the order I would ship them

Each is one feature under the one-at-a-time rule, and each lands with its entitlement.

**1. Tiers and entitlements** (this one). Everything else plugs into it.

**2. Deposit and progress invoicing.** Construction is paid in stages: a deposit, progress
claims against work done, retention held and released. Retention exists; staged claims do
not. This is the most common reason a Jamaican contractor still uses a paper book.

**3. Client approval on the quote page.** The public page can already accept or decline; add
a typed name, a timestamp and a PDF record of the acceptance. Contractors need proof the
client agreed to a price before work starts, which is exactly the dispute that costs them.

**4. Material price index with supplier comparison.** Already planned. It makes the product
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
