# Independent review: PRD release 1 and the domain model (Rule 1.10)

**Gate:** independent review of a plan the reviewer did not write. Owner approval answers *is this
what I want*; this answers *will it do what it says*. Findings are appended as they are found
(Rule 1.10), never held to the end.

Reviewed: `docs/PRD.md` (Proposed, 40 requirements) and `docs/design/domain-model.md` (Approved
2026-09-25, review outstanding), **together** — a gap between them is itself a finding.

Evidence read: `docs/RULES.md`, `docs/TIERS.md`, `docs/PHASE-0-AUDIT.md`, `docs/THREAT-MODEL.md`,
`docs/SERVICE-REGISTER.md`, `docs/MISTAKES.md`, `docs/adr/0022`, `docs/adr/0007`, `docs/adr/0015`,
`new-app/web/content/site.ts`, and the built guards under `new-app/web`.

Severity: **blocker** = building this part as written produces something wrong or unsafe ·
**major** = real rework later · **minor** = cheap to fix · **question** = only the owner can answer.

---

## F1 · The PRD and the approved domain model disagree, flatly, about whether a quote may be issued offline — severity: blocker
**Where:** `PRD.md` §4 and R1.18; `design/domain-model.md` §8 ("Sync, per entity")

**The claim under attack:**
PRD §4: *"**R1 requires connectivity to *issue*.** Issuing allocates a real number, freezes prices and
renders a PDF. Attempting it offline queues it and issues on reconnect"* and R1.18: *"Issuing requires
connectivity in R1."*
Domain model §8: *"Issuing offline is **allowed** — refusing it would break step 3 of the only story
that matters, and the number lease plus the immutable issue is what makes it safe."* Its per-entity
table says `quote_issue` · Offline: *"**create** (with a leased number)"*.

**Why it does not hold:** these are not two emphases of one decision, they are opposite answers to
the same question, and the domain model's answer is the **approved** one. The domain model does not
present offline issuing as a later phase: it argues that refusing it *breaks the only story that
matters*, and it builds two mechanisms (`number_series` device leases, the sync table) specifically
to permit it. The PRD then removes it from R1 and defers leases to R2 — without amending the domain
model, which Rule 1.9 and Rule 19 require to be updated as a proposed edit rather than contradicted
in a newer document. Whichever way the owner decides, one of the two documents is currently wrong,
and both are cited as authority by name elsewhere (PRD §14 header links the model as "Approved").

**What it would cost if built as written:** the schema step comes from the domain model (§10: *"The
physical schema … comes from the target-schema step, after this is approved"*). A builder taking the
model at its word designs `number_series` with device leases, lease expiry and burned-number
semantics in R1 — the exact component PRD §4 says is the difference between *"a two-week component
and a two-month one"*. A builder taking the PRD at its word ships a `number_series` with no lease
concept, and R2 then migrates the allocation path for the most dangerous column in the product
(document numbers), live, with issued documents already in the table.

**Suggested resolution:** the PRD's split is the defensible engineering call; the domain model must
be amended in the same change — §8's row for `quote_issue` and the paragraph beneath it marked as
R2, and §4's "Chosen: device number blocks" annotated that R1 allocates online only while the
*column shape* is designed now so R2 is additive. State explicitly in §4 whether R1's
`number_series` carries the lease columns from day one (recommended: yes, unused) so R2 is a code
change and not a migration of issued rows.

## F2 · "Under 60 seconds of interaction" cannot be demonstrated: no instrument, no definition, no device — severity: major
**Where:** `PRD.md` R1.8, §10 row 2, N4

**The claim under attack:** R1.8: *"From a client and a recipe, produce a priced draft in **under 60
seconds of interaction**, with no signal, on a mid-range Android phone."* §5's preamble: *"Each is
written to be **verifiable**: if it cannot be demonstrated, it is not a requirement, it is a hope."*
§10: *"Each needs instrumentation that is itself part of R1."*

**Why it does not hold:** three of the four terms are undefined and the measuring instrument does not
exist.
1. *"60 seconds of interaction"* is not *60 seconds elapsed*. Interaction time excludes thinking,
   measuring the fence, and talking to the client — but nothing says how it is segmented, when the
   clock starts (opening the app? selecting the client?) or stops (total visible? draft saved?).
2. *"mid-range Android phone"* names no device, no Android version, no CPU class and no browser. A
   target that moves with the handset market cannot be a pass/fail line.
3. *"with no signal"* requires the offline cache to be **warm**. On a cold cache the requirement is
   unachievable and the test would be measuring the wrong thing — but no requirement states the cache
   must be primed, nor how a tenant knows it is.
4. There is no requirement anywhere in §5 that creates the instrumentation §10 says is *"itself part
   of R1"*. R1.1–R1.40 contain no telemetry, timing, or analytics requirement at all, and N7 plus N8
   constrain what may be collected. So the signal in §10 has no requirement to live in.

Note the honest version already exists on the public site: `site.ts` `home.firstRun` says *"Your
first job of a kind takes a few minutes to price properly"*. The site scoped the claim; R1.8 did not.

**What it would cost if built as written:** the flagship requirement ships untested, or a test is
written that measures a scripted happy path on the developer's own laptop browser and is then quoted
as proof of a field claim — the exact shape Rule 21.1 forbids (*"A control's stated scope is quoted
from what the tool reports, never from what it was meant to do"*). §10's target then gets reported
green on an instrument that was never built.

**Suggested resolution:** replace R1.8 with something a machine can decide: a named benchmark device
(or a CI budget: *N* taps/keystrokes and *M* ms of scripted interaction on a throttled Lighthouse
profile), a defined start and stop event, a stated cache precondition, and a new requirement R1.41
creating the timing instrumentation §10 depends on, with its own "what this does not prove" line
(Rule 21.4).

## F3 · With variations deferred to R2, release 1 has no path for a change to an accepted quote — the only available move destroys the acceptance — severity: blocker
**Where:** `PRD.md` §3 step 5, §4 ("Why variations (W6) are R2 despite mattering"), §8;
`design/domain-model.md` §6.2 `variation`, §6.3

**The claim under attack:** PRD §4: *"they only bite after a job is won and changed, so the first
tenants will not hit them in week one — and doing them properly means client-signable change orders,
which is W5 again with a different subject."*

**Why it does not hold:** the deferral is argued on *timing* ("not in week one") and never says what
the product does in week three when it does bite. Traced through the approved model, there is no path
that preserves the data R1's own requirements depend on:

- R1.15: *"A revision is a **new issue** at the next revision number; the previous one is marked
  superseded and remains readable exactly as sent."*
- R1.20: *"One acceptance per issue, immutable."*
- Domain model §6.3, transitions that *"must be impossible, and are therefore tested"*: **"accepting
  a superseded issue"**.
- R1.23: invoices are raised *"against one accepted issue"*.

The accepted total lives on issue v1. A change means issuing v2, which supersedes v1. The acceptance
is attached to v1 and cannot be moved (immutable, one per issue); v2 can be accepted because it is not
superseded — at which point the tenant holds **two accepted issues for one job**, and R1.24's
invariant has two candidate accepted totals and no rule for choosing between them. The alternative is
that the contractor never revises, does the extra work, and invoices above the accepted total, which
R1.24 forbids outright. Either way the commonest event in construction — the client adds a gate — is
unrepresentable. The `variation` entity exists in the approved model precisely to answer *"who agreed
to the extra $40,000"*; R1 ships the invariant that needs that answer and not the entity that holds
it.

This is the exact shape Rule 1.10 names: *"a scope boundary that **hides work** rather than removing
it ('release 2' for something release 1 cannot function without)"*. PRD §4's own concession that W6 is
W5 reused is an argument about **cost**, not about whether R1 functions without it.

**What it would cost if built as written:** the first tenant whose job changes either abandons the
product or invoices outside it, which loses the one comparison (accepted total vs invoiced) the whole
Documents context exists to protect. Worse for us as a business: §10 measures *"Accepted quotes that
become an invoice ≥ 70%"*, so a changed job that leaves the product depresses R1's primary success
metric and we would read it as "W7 is not where they work" rather than "we shipped no change orders".

**Suggested resolution:** three options; the author should choose deliberately rather than leave the
case unnamed. (a) Pull a **minimal** variation into R1 — a priced change against an accepted issue
that re-derives the accepted total, **without** its own client-signable acceptance flow (the expensive
part, which can stay R2). This keeps R1.24 well defined. (b) Keep W6 in R2 but add an R1 requirement
stating the interim behaviour explicitly: what the accepted total becomes after a revision and which
issue an invoice attaches to. (c) Forbid revising an accepted issue in R1 and state the limitation in
the UI. (a) is recommended, (b) is acceptable; leaving it as it stands is not, because it delegates
the decision to whoever happens to build W7.

## F4 · R1.24, "the most important arithmetic invariant in the product", is written in terms of two things R1 does not build — and neither document gives it anywhere to be enforced — severity: blocker
**Where:** `PRD.md` R1.24, R1.25, §8; `design/domain-model.md` §6.2 `invoice`, `retention`,
`credit_note`, §3

**The claim under attack:** R1.24: *"The sum of issued invoices may never exceed the accepted total
plus accepted variations. **This is the most important arithmetic invariant in the product** and it
gets its own tests."* R1.25: *"Invoice status is **derived** from payments, credits and retention —
never stored."*

**Why it does not hold, on two counts.**

1. **It is written in R2 vocabulary.** *"plus accepted variations"* — variations are R2 (§3 step 5,
   §8). *"credits and retention"* — retention tracking is in §8's deliberate exclusions
   (*"variations and change orders · project costing and job result · **retention tracking**"*), yet
   R1.25 makes retention an input to an R1 derivation. Both the invariant and the status formula are
   specified against entities R1 does not contain, so "it gets its own tests" cannot be satisfied:
   there are no rows for two of the terms. (`PHASE-0-AUDIT.md` §6 #17 records retention as an
   existing feature with an **open defect** — *"Release must re-derive invoice status (open defect)"*
   — so deferring it while keeping it in the formula is also a decision about whether that defect
   ships.)
2. **It has no owner.** Rule 1.10: *"an invariant with **no owner** — stated in prose, enforced by
   nothing."* This invariant is a **cross-row aggregate**: SUM over `invoice` for one `quote_issue`,
   compared against a value derived from `acceptance` (plus variations). The domain model states it
   twice in prose and never once says where it is enforced. It cannot be a column CHECK; it is not a
   unique index; §3's convention list offers only *"`version` integer, compare-and-set on every
   write"*, which protects a single row and does nothing about two concurrent invoice issues that are
   each individually under the total and together over it. No serialized transaction, row lock,
   maintained counter column or deferred constraint trigger is named anywhere. Contrast
   `number_series`, where the model does exactly this work — *"Allocation is atomic and gapless per
   series"*, with three options weighed and one chosen. The money invariant gets no such paragraph,
   and it is the one the PRD calls most important.

**What it would cost if built as written:** the failure is silent and surfaces only under concurrency
or offline replay — two devices, or one device retrying a queued issue, each producing an
individually valid invoice that together exceed the accepted total. That is the same class as the old
application's negative amount due, which is R1.25's own stated justification. It arrives as real
over-billing of a real client and is found by the client's accountant rather than by us. Rule 16.5
puts *"money arithmetic … anything that decides an amount"* in the judgement class for exactly this
reason: *"a mistake leaves the suite green."*

**Suggested resolution:** before any W7 code, the domain model owes this invariant an enforcement
paragraph of the same weight as its numbering paragraph — name the mechanism (recommended: the sum is
checked inside one transaction holding a row lock on the `quote_issue`, or a maintained
`invoiced_minor` column on the issue with a CHECK against the accepted total, which makes it a
database guarantee rather than an application habit), and name the planted defect that proves it (a
concurrent double-issue). Separately, restate R1.24 in R1-only terms with the variations and retention
clauses marked as the R2 extension of the same rule.

## F5 · The public site sells four Pro features release 1 does not contain, and sells the Business tier with nothing marking it as unavailable — severity: blocker (Rule 20)
**Where:** `new-app/web/content/site.ts` → `site.pricing.tiers`; `PRD.md` §7, §8; `docs/TIERS.md` §2;
`new-app/web/test/site-guards.test.ts`

**The claim under attack:** `site.ts`, Pro `includes`: *"Unlimited quotes", "Reusable job recipes",
"Invoices and payment recording", "Payment reminders and an overdue list", "Card payment links",
"Retention tracking", "Project costing and job profit", "Accountant exports", "Offline use on your
phone"*. Against PRD §8: R1 excludes *"project costing and job result · retention tracking · offline
issuing and full sync … accountant CSV export"*. And PRD §7: *"Business is R3, and **until then the
site must not sell it as available**."*

**Why it does not hold:** line by line against R1.

| Site's Pro line | In R1? | Evidence |
|---|---|---|
| Unlimited quotes | yes | §7 |
| Reusable job recipes | yes | R1.5–R1.7 |
| Invoices and payment recording | yes | R1.23, R1.26 |
| Payment reminders and an overdue list | yes | R1.28 |
| Card payment links | yes | R1.29 |
| **Retention tracking** | **no** | §8 exclusions |
| **Project costing and job profit** | **no** | §8; W8 is R2 (§3) |
| **Accountant exports** | **no** | §8 exclusions |
| **Offline use on your phone** | **only partly, and not the part a reader assumes** | §4: R1 is offline for *pricing and drafting*; issuing needs connectivity |

That is a paid tier whose published list is three features and one large qualification away from what
the buyer receives, on the page where they decide to pay. The Business tier is worse: nine confident
features, and its only signal of unavailability is `priceLabel: null`, which reads as *price coming*,
not *product coming*. PRD §7 states the requirement in words and the site does not meet it.

**And the guard the PRD cites does not cover this.** PRD §7: *"The site shows no number by deliberate
choice and a guard enforces that (`honest-claims.test.ts`)"*. The file is actually
`new-app/web/test/site-guards.test.ts`, and its `describe("nothing untrue")` block contains exactly
`it("makes no social-proof claim, because there is no evidence for one")`, `it("shows a price only
where a price has been decided")` and `it("never claims speed without the condition that makes it
true")`. **No assertion reads `tier.includes`.** So the control named in the plan as protecting its
honesty has zero coverage of the claims most likely to be untrue — Rule 21's opening case: *"A control
that overstates its coverage is worse than no control, because it stops anybody asking the question."*
The PRD also cites the guard under a filename that does not exist in the tree, which is how a reader
concludes coverage exists without opening it.

**What it would cost if built as written:** Rule 20's own words — *"A prospect who discovers an
invented claim has learned something true about us."* Concretely: a contractor upgrades to Pro for
retention tracking and job profit, finds neither, and charges back — and those two are among the
reasons `TIERS.md` §3 gives for a contractor still using a paper book. It is also an internal
inconsistency in the plan: §4 treats the site's copy as a **constraint** on R1 (*"its Pro tier lists
'Offline use on your phone'. So release 1 cannot quietly be online-only — that would make the site an
over-claim"*) while §8 silently drops three other promises from the same array without applying the
same test.

**Suggested resolution:** (1) extend the site guard so every string in `tier.includes` maps to a
shipped entitlement — entitlements are data (R1.31), which makes this mechanically checkable rather
than a review item; in the interim add an explicit `shippedIn: "R1" | "R2" | "R3"` per feature line
with the guard requiring anything not R1 to render as *coming*, and ship it having fired once on
purpose (Rule 21.2). (2) Fix the PRD's reference to the guard's real filename. (3) Name the copy
change as owed work in §9 or in R1's scope, because today nobody owns it. This finding blocks the
pricing page, not the rest of the plan.

## F6 · The site describes R2 features in the present tense and lists R1 features as "coming next" — the roadmap is inverted — severity: major
**Where:** `site.ts` → `site.features.items`, `site.features.next`, `site.home.points`

**The claim under attack:** the page headed *"What it does"* contains *"Turn an accepted quote into an
invoice without retyping it. Record payments as they arrive, **hold and release retention**, and see
at a glance who is late."* and *"**Did the job make money?** Put purchases and labour against the job
as they happen and compare them with what you quoted."* Then `next`: *"Coming next, in this order and
one at a time: **staged deposit and progress invoicing, a signed record of the client's acceptance**,
change orders as their own documents, and supplier price comparison."*

**Why it does not hold:** retention release and job profit are R2 (PRD §8) and are stated as present
fact on a page titled what the product *does*. Meanwhile staged deposit and progress invoicing is
**R1.23** and the signed acceptance record is **R1.20** — both in R1, both listed as not yet here.
`home.points` repeats the inversion: *"See whether the job actually made money once the receipts are
in"* is R2 prose in a list of what the product does today.

**What it would cost if built as written:** the copy overstates two features R1 will not have and
understates the two R1 is built around — including `PHASE-0-AUDIT.md` §6 #34, *"Deposit and progress
invoicing | **absent** | The top-ranked missing feature for this trade"*. It breaks Rule 20 and
undersells the release in the same paragraph, and the `next` list is stale on launch day, which trains
a reader to discount the rest of the page.

**Suggested resolution:** rewrite `features.items`, `home.points` and `features.next` against R1's
numbered requirements once §4's release split is settled, and record the requirement id beside each
claim in the file's comments so the next edit cannot drift silently. Cheap now.

## F7 · Free tier gets "recipes: view only", and in release 1 there is nothing for a Free tenant to view — the wedge cannot demonstrate the differentiator — severity: major
**Where:** `PRD.md` R1.7, R1.8, §7, §10; `docs/TIERS.md` §2, §2 (scope); `design/domain-model.md` §5

**The claim under attack:** R1.7: *"Free tier: view and use recipes. Pro: create and edit them
(`TIERS.md`)."* §7's table: Recipes — Free *"use only"*.

**Why it does not hold:** `recipe` is a **Directory** entity in the approved model — tenant-owned,
`tenant_id` with row-level security (§3 convention 4), created by the tenant. A new Free tenant
therefore has **zero** recipes, cannot create one, and has nothing to view or use. "View only" is only
meaningful if a recipe arrives from somewhere the tenant did not create it, and the only mechanism
named anywhere in the repository is the trade **data pack** with *"starter recipes"* (`TIERS.md` §2,
ADR 0017) — which appears in **no** R1 requirement, has **no** entity (`trade` is the only
platform-owned reference entity in §5, and it holds trades, not recipes), and is not in §8's
exclusions either. It is neither in nor out of R1.

The consequence reaches the core claim. `site.ts` `home.heading` is *"Price it once. Then quote it at
the gate in minutes"*, and R1.8's 60-second requirement begins *"From a client and **a recipe**"*. So
on the tier whose purpose is to spread the product (Rule 14: *"Free is what makes the product
spread"*), the demonstration that sells it is unavailable — and §10 then asks those tenants to convert
(*"Free → Pro conversion ≥ 10% of tenants issuing ≥ 4 quotes/month"*) on the strength of a feature
they were never able to try. Note also the internal tension: a Free tenant who cannot save a recipe
must re-enter the build-up for each of their 3 monthly quotes, which is the paper-book workflow the
product exists to replace.

**What it would cost if built as written:** either Free converts far below target for a reason we
would misattribute to price, or this is discovered mid-build and starter-recipe content becomes
unplanned scope — per-trade content authoring in Jamaican units and prices, which is owner work, not
engineering.

**Suggested resolution:** the author should decide, because it is commercial, but it must be decided
before W2 is built. (a) Free may create a small number of recipes (e.g. 3), making "view only"
unnecessary and the entitlement a count like `quotes.per_month`; (b) R1 ships platform-owned starter
recipes as an explicit requirement plus an entity or seed mechanism, with the content named as an
owner dependency in §9; or (c) recipes become wholly Pro and the Free pitch stops resting on them —
which contradicts the site's heading and needs that copy changed too.

## F8 · `TIERS.md`, the PRD and the site give three different answers on whether offline is a Free feature — severity: major
**Where:** `PRD.md` §7; `docs/TIERS.md` §2; `site.ts` tier `includes`

**The claim under attack:** PRD §7: *"Offline pricing and drafting | Free ✓ | Pro ✓"*. `TIERS.md` §2:
*"Offline mobile use | Free — | Pro ✓ | Business ✓"*. `site.ts` lists *"Offline use on your phone"*
under **Pro only**, and Free's `includes` does not mention offline at all.

**Why it does not hold:** two of the three say offline is paid; the PRD says it is free. The PRD names
`TIERS.md` as the tier authority in its own header and then disagrees with it without amending it,
which Rule 1.9 forbids (*"never left stale and never changed silently"*) and Rule 19 makes a
plan-of-record problem rather than a documentation one. It is not cosmetic: the entitlement is **data**
resolved by one resolver (R1.31), so the value that ships comes from whichever document the builder
happens to read, and Rule 14 then grandfathers it by audited grant — making a later reversal a
migration plus a conversation with every early tenant.

There is also a product argument neither document makes: the offline catalog cache is the mechanism
that makes R1.8 achievable, and R1.8 is the site's headline claim. Gating it to Pro means the Free
tier cannot demonstrate the product's whole claim — the same failure as F7 by a different route.

**Suggested resolution:** the owner decides, and all three artefacts change in the same edit
(`TIERS.md` §2, PRD §7, `site.ts`). Recommendation: offline pricing on Free, since the cache lives on
the tenant's own device and costs us nothing, and it is what makes the wedge work.

## F9 · §10's success targets are arithmetically incompatible with the Free tier's own limit — severity: major
**Where:** `PRD.md` §10 rows 3 and 5, R1.32, §7

**The claim under attack:** §10: *"Quotes issued per active tenant per month | **≥ 4** by month two |
Below the free limit means they are trying it, not using it"* and *"Free → Pro conversion | **≥ 10% of
tenants issuing ≥ 4 quotes/month**"*. Against R1.32: *"Free tier limit: 3 new jobs quoted per calendar
month, enforced server-side."*

**Why it does not hold:** the free limit is **3** and the engagement target is **≥ 4**, so no Free
tenant can ever reach the target — the server refuses the fourth. The parenthetical *"below the free
limit means they are trying it"* treats 4 as above the limit, which it is, but then the metric measures
only tenants who have **already** converted (or who are blocked). The conversion denominator *"tenants
issuing ≥ 4 quotes/month"* is therefore the set of existing Pro tenants, and a conversion rate whose
denominator is the converted population cannot be computed. The signal we actually want — *"hit the
free ceiling"* — is a different, measurable event (a refused fourth quote), and it is not the one
written down.

**What it would cost if built as written:** the two metrics that decide whether the Pro line works are
uncomputable, so month two produces no answer, and the instrumentation built to serve them measures
the wrong population. Combined with F2 (no instrumentation requirement exists at all), §10 is
currently a table of intentions rather than the measured evidence it says it is (*"Measured, not
felt"*).

**Suggested resolution:** restate the engagement signal as *"tenants who reach the Free ceiling (a
refused fourth quote) in a month"* and the conversion signal as *"of tenants who hit the ceiling, the
percentage on Pro within 30 days"* — both derivable from entitlement refusals, which R1.31 already
routes through one resolver, and which is the cheapest place to instrument.

## F10 · "3 new jobs quoted per calendar month" does not define what it counts, and the obvious readings each break something — severity: question
**Where:** `PRD.md` R1.32, R1.12, R1.15, §7

**The claim under attack:** R1.32: *"Free tier limit: 3 new jobs quoted per calendar month, enforced
server-side with a clear, non-punitive message."*

**Why it does not hold:** "job quoted" is not an entity in the domain model. The candidates are
`quote` (the working draft), `quote_issue` (the snapshot), and the informal notion of a job. Each
reading has a consequence nobody has chosen:
- **Count drafts:** a contractor who starts a quote, mistypes and starts again has burned two of three.
  R1.12 makes drafts editable and versioned, so this punishes exactly the exploratory use Free exists
  to encourage.
- **Count issues:** a **revision** (R1.15: *"A revision is a new issue at the next revision number"*)
  is a new issue of the **same** job. Counting it consumes the tenant's allowance for correcting a
  typo on a quote they already sent — and not counting it requires the resolver to distinguish
  first-issue from revision, which is a rule nobody has written.
- **Count "jobs":** there is no job entity in R1 (`project` is Work, and Work is R2).

"Calendar month" is also unqualified: R1.17 establishes that day boundaries come from *"the
jurisdiction's"* timezone, but R1.32 does not say the month does, so the reset time is ambiguous in
exactly the way the domain model §3.8 warns about (*"the existing application answered it
Jamaica-wide"*).

**What it would cost if built as written:** the entitlement value is data and changeable (§11 risk 2
correctly says so), but the **unit being counted** is a code path, and changing it later is a rewrite
of the resolver plus a fairness question for every tenant already counted the old way. It is also the
single number a Free tenant will argue with us about.

**Suggested resolution:** the author should decide, because it is a commercial definition, but it must
be written into R1.32 before the entitlement is built: recommended *"distinct quotes that reach
`issued` for the first time, in the tenant's jurisdiction month; revisions of an already-counted quote
are free"*. That reading is also the one that makes F9's ceiling metric meaningful.

## F11 · §9's dependency list is incomplete: at least five things somebody else must deliver are missing, and two are not in the service register at all — severity: blocker (Rule 18)
**Where:** `PRD.md` §9; `docs/SERVICE-REGISTER.md` §1, §2, §4a; R1.36, R1.29, R1.28, R1.33, N10

**The claim under attack:** §9: *"R1 cannot launch without these, and none of them are engineering"* —
followed by five items: `info@pryvis.com` mail, tier prices, legal wording, the aggregate-data consent
clause, and a second staff account.

**Why it does not hold.** Each of the following is required by a numbered R1 requirement and is
somebody else's to deliver:

1. **A WiPay merchant account, approved.** R1.29: *"WiPay card payment links (Pro)."* WiPay is in the
   register and flagged as *"a genuine single point of dependence"* with *"no like-for-like local
   substitute"* — merchant onboarding is KYC on the owner's business, has a lead time we do not
   control, and is not engineering. It appears nowhere in §9.
2. **A verified sending domain for `pryvis.com`.** R1.21 (share by email), R1.28 (reminders and a
   digest) and the register's Resend row all require DKIM/SPF/DMARC records on the GoDaddy-registered
   domain, which only the owner can add. §9 item 1 covers `info@` **receiving** mail and says nothing
   about **sending** — and unauthenticated mail carrying a client's quote lands in spam, which fails
   R1.21 silently.
3. **A malware-scanning service. It does not exist in the register.** R1.36: *"Uploads: restricted
   type and size, **malware-scanned**, stored privately and tenant-scoped"*, and Rule 5 (*"Uploads are
   hostile until proven … malware scanning"*). `grep` of `SERVICE-REGISTER.md` for
   `malware|ClamAV|scan` returns only the secret-scanning and dependency-scanning rows in §4 — there
   is **no** scanning service for uploaded files. Rule 18: *"A service running in production and
   missing from the register is a defect, not a paperwork oversight."* Either a service must be chosen
   (a decision, a cost, a sub-processor holding tenant receipts) or R1.36 cannot be met.
4. **Private object storage. Also absent from the register.** R1.13 stores *"a hash of the rendered
   PDF"*, `document_render` carries a *"storage key"*, R1.36 requires uploads *"stored privately and
   tenant-scoped"*, and Rule 10 requires *"files in object storage rather than the database"*. The
   register's §1 lists Vercel, Render, Neon, GitHub and GoDaddy — no bucket. So every PDF and every
   deposit receipt in R1 has nowhere registered to live.
5. **The decision to pay for infrastructure.** N10 and §11 risk 4 both state the API sleeps and the
   first visit waits ~50s; §4a of the register is blunter — *"it is a launch blocker: a contractor
   tapping a share link and waiting 40 seconds concludes the product is broken"* — and names the
   trigger as *"the first paying tenant"*, owed its own ADR. That is a monthly cost only the owner can
   authorise, so by §9's own test (*"none of them are engineering"*) it belongs in this list.

**What it would cost if built as written:** each of 1–4 is discovered at integration time, when the
code that needs it is already written. 3 and 4 are worse than late: they are **unregistered
sub-processors handling tenant and client data**, which is the specific failure Rule 18 exists to
prevent, and the privacy policy (§9 item 3, currently a draft) has to name them — so the legal
dependency cannot be closed until they are chosen. Item 5 decides whether launch day looks broken.

**Suggested resolution:** add items 1–5 to §9, and open the two register gaps (upload scanning,
object storage) as decisions with ADRs before W4 and W9 are built, since both requirements
(R1.13/R1.36) are unbuildable without them. This finding blocks W4, W9 and the privacy policy, not
W1–W3.

## F12 · Release 1 has no requirement for the sign-up defences Rule 14 makes mandatory, and R1.30 is the one unauthenticated endpoint that creates rows — severity: blocker
**Where:** `PRD.md` R1.30, R1.31; Rule 14; `docs/TIERS.md` §2a

**The claim under attack:** R1.30, in full: *"Self-service sign-up on the website, free tier, no card
(ADR 0015)."* That is the entire requirement.

**Why it does not hold:** Rule 14 specifies, as an owner requirement, exactly what must ship *with*
registration: *"Because registration is an **unauthenticated endpoint that creates rows**, it ships
with the defences that make that safe: rate limiting per address and per IP, email verification before
the account can cost us money, a bound on tenants per address, and a duplicate registration that
**does not reveal the address is taken**."* `TIERS.md` §2a repeats it and states the position:
*"What sign-up needs before it can face the public, none of which exists yet: rate limiting, email
verification before anything costs us money, and a duplicate registration that does not confirm the
address is taken."*

None of the four appears in R1.30 or anywhere in §5. Rule 14's *"bound on tenants per address"* is
also now in tension with ADR 0022's decision that one person may hold several businesses with a
different address each — the bound and the multi-business rule need reconciling, and neither document
does it. Registration also has no stated requirement for the **email verification** step that ADR 0022's
global-uniqueness enforcement depends on: without verification, the first person to type an address
owns it and can lock out its real holder, and the non-enumerating duplicate response means the victim
is not told.

Related gap in the same area: §5 contains **no requirement for tenant sign-in, session handling or
password rules at all** — N6 mentions MFA availability and nothing else. That work exists in the tree
(ADR 0013, 0014, 0021), which is presumably why it was omitted; but Rule 1.2 says a design states what
the product needs rather than what happens to exist, and a requirement list that omits authentication
cannot be used to check that authentication was covered.

**What it would cost if built as written:** the most exposed endpoint in the product ships as a
one-line requirement, and the four defences become whatever the builder remembers. The enumeration
oracle is the specific one that cannot be fixed after launch without changing observable behaviour, and
Rule 14 calls it *"an enumeration oracle [that] leaks who our customers are"*.

**Suggested resolution:** expand R1.30 into R1.30a–d naming each of Rule 14's four defences as its own
verifiable requirement, reconcile the per-address tenant bound with ADR 0022, and add a requirement
line pointing at the existing authentication ADRs so the R1 list is complete enough to audit against.

## F13 · The domain model puts a deadline-bearing entity in Directory that the PRD never mentions in either its scope or its exclusions — severity: major
**Where:** `design/domain-model.md` §5 `price_observation`; `PRD.md` §5 (W1), §8, §9 item 4

**The claim under attack:** domain model §5: *"`price_observation` | What a tenant actually paid,
captured when a material cost changes. | Append-only. Feeds the price index, and **only with the
tenant's consent recorded at sign-up.**"* And: *"the consent clause must be settled in the terms before
the first tenant registers … The entity is designed now, and writing to it stays switched off until the
clause exists — **the switch is the tenant's recorded consent, not a configuration flag**."*

**Why it does not hold:** the PRD excludes *"the material price index"* (§8) and names the consent
clause as an owner dependency (§9 item 4, *"This **blocks registration**, not the website"*) — but
excluding the **index** is not the same as excluding the **capture**, and the model is explicit that
capture is gated on a per-tenant recorded consent. So R1 must, on the model's own terms, build two
things the PRD never asks for: (a) a consent value captured and stored **at registration** (the switch),
and (b) the `price_observation` write path hanging off every material cost change in W1, or a decision
to defer it. Neither is in §5's forty requirements, and §8's exclusion list does not name
`price_observation` either. It is in neither column.

This matters because of the model's own argument: consent *"cannot be consented to retro-actively"*.
If R1 registers tenants without capturing the consent value, every tenant from launch until the field
exists is permanently outside the price index — which the PRD calls *"the most defensible asset in the
business"* (§9 item 4). Deferring the entity is cheap; deferring the **consent field** is
irreversible for those tenants.

**What it would cost if built as written:** the launch cohort — the tenants we most want the data from,
because they are the ones who stayed — is excluded from the product's most defensible asset, and no
requirement failed to make it happen.

**Suggested resolution:** add an R1 requirement: *"registration records the tenant's aggregate-data
consent decision as a stored, audited value (§9 item 4's clause is its precondition); the
`price_observation` write path is R2."* That closes the irreversible half in R1 at the cost of one
column and leaves the index where §8 put it.

## F14 · R1 requirements with no entity, and one with no design: sections, detail levels, and the tenant-readable audit trail — severity: major
**Where:** `PRD.md` R1.10, R1.11, R1.40, R1.17; `design/domain-model.md` §6.2, §9 items 3–4, §10

**The claims under attack:** R1.10: *"Sections, so a quote reads the way a contractor talks about the
job."* R1.11: *"Two detail levels for the client: a summary, or fully itemised."* R1.40: *"A tenant can
read their own audit trail — what we did to their account, not only what they did."* R1.17: expiry
*"evaluated on the **jurisdiction's** day boundary, not the server's."*

**Why it does not hold — checked requirement by requirement against the model's entity tables:**
- **R1.10 sections:** the model has `quote_line` — *"A line on the working quote, **in a section**,
  ordered"* — and no `section` entity, no field named, and nothing about what happens to sections when
  a quote is issued. Since `quote_issue` freezes *"every line with its frozen description…"* and
  sections are not in that list, a re-rendered historical PDF may not reproduce the grouping the client
  saw. For an immutable-snapshot design, that is a real omission rather than a detail.
- **R1.11 detail levels:** no entity or field anywhere holds it. If it is chosen at render time it must
  be frozen on `document_render` (which records *"the settings used"*), and if it is a quote-level
  setting it belongs on `quote`/`quote_issue`. Unspecified means the client can be shown a different
  document from the one whose hash the `acceptance` points at — which touches the acceptance evidence
  chain, not just presentation.
- **R1.40 tenant-readable audit trail:** this is the requirement with the least support anywhere. The
  model's §9 items 3 and 4 say the audit subject union *"must grow with the model"* and that
  `platform_audit_entry` for staff actions *"is still owed"*. Exposing *"what we did to your account"*
  to a tenant means projecting staff actions — including the staff actor's identity, the reason for an
  impersonation, and any money detail Rule 5.1 restricts — across a trust boundary the threat model's
  §4.4 treats as inward-facing only. That needs its own design and a projection rule (Rule 5: *"output
  **projected**, not filtered"*), and neither document provides one.
- **R1.17 jurisdiction day boundary:** the model supports it (§3.8), but `TIERS.md` §1 records the gap
  as still open — *"timezone still Jamaica-wide"* — and no R1 requirement asks for the per-country
  timezone configuration that R1.17 depends on. R1.17 is currently a requirement resting on
  infrastructure nobody has been asked to build.

**What it would cost if built as written:** R1.10 and R1.11 are cheap to fix now and produce a
re-render that differs from what the client accepted if they are not (an evidence problem in exactly
the dispute the acceptance record exists for). R1.40 is not cheap: if it is built without a projection
design it leaks staff identity or money detail to tenants, and if it is discovered late it either
slips or ships thin.

**Suggested resolution:** add `section` (or a named field) and the detail level to `quote_issue`'s
frozen column list in the domain model; state in R1.11 which artefact freezes it. Split R1.40 into its
own design step before W-cross-cutting is built, and say plainly in the PRD that it depends on
`platform_audit_entry`, which the model records as owed. Add a requirement for per-jurisdiction
timezone configuration, or cite the existing rule-pack work that provides it.

## F15 · Two world-assumptions behind W5 are stated as settled and are not: that the client will accept by typed name on a phone, and that the resulting record is worth anything in a dispute — severity: question
**Where:** `PRD.md` §2 (the client row), R1.20, R1.22; `docs/adr/0022`; `docs/TIERS.md` §3 item 3

**The claim under attack:** PRD §2: *"**The client** — not a user … Has no account and will not create
one (ADR 0022). [Needs] To open a link, understand the price, and accept it with one tap."* R1.20:
*"Acceptance records a typed name, timestamp, IP and user agent, and its own PDF hash."*

**Why it does not hold:** ADR 0022 is cited as the authority and it does not answer this question. What
the owner decided there is narrow and explicit: *"A tenant's clients do not get a login."* That is a
decision about **accounts**, not about whether a Jamaican homeowner or, more importantly, a **main
contractor** will commit to a price by typing a name into a web page instead of signing a printed
quote. The second is the assumption the whole of W5 rests on, and it is the same *shape* as the one
ADR 0022 had to correct: the model asserted something about how contractors operate, *"which is not a
question the code could answer"* (domain model §9 item 1). Nobody has answered this one.

There is a second, sharper unknown stacked on it. `TIERS.md` §3 item 3 states the purpose:
*"Contractors need **proof** the client agreed to a price before work starts, which is exactly the
dispute that costs them."* No document says what evidentiary weight a typed name plus IP plus user
agent carries in Jamaica, whether the terms need to say something specific for it to function as
agreement, or whether the **client** (who never signed our terms) is bound by anything. §9 item 3
defers all legal wording to the owner, and the site's legal pages are drafts — so the feature whose
value is legal is being built with the legal question open.

**What it would cost if built as written:** if clients will not accept digitally, W5 is built and
unused and the product's differentiator reduces to a nicer PDF. If they accept but the record turns out
to be worth less than the contractor was led to believe, we have sold *"you have it in writing"*
(`site.ts`, features) as a benefit we cannot stand behind — which is a Rule 20 problem with a legal
edge rather than a marketing one.

**Suggested resolution:** the owner should decide, because only they can. Two concrete asks: (1) confirm
from contact with actual contractors that their clients will accept by link — the cheapest possible test
is showing one contractor the share page; (2) get the acceptance wording reviewed with the terms (§9
item 3) so the evidence claim is either supportable or softened in the copy. Neither is engineering, so
both belong in §9.

## F16 · The share page is the one client-facing surface exposed to the ~50-second cold start, and no requirement or mitigation covers it — severity: major
**Where:** `PRD.md` R1.22, N9, N10, §11 risk 4; `docs/SERVICE-REGISTER.md` §1, §4a

**The claim under attack:** N9: *"The public site keeps working when the API is asleep"*, and §11 risk
4: *"~50 seconds on the first visit after idle. **The public site is static and unaffected; the app is
not.** Rule 10's trigger for paid infrastructure should fire before the first paying tenant, not
after."* R1.22: *"The shared page works on a cheap phone on mobile data and needs no account."*

**Why it does not hold:** the risk is classified as an *app* problem, i.e. ours and Delroy's. It is not:
the **share link page is client-facing**, it reads an issue from the API, and the client who opens it is
the person we have the least claim on and one chance with. The register says so in the same words —
*"a contractor tapping a share link and waiting 40 seconds concludes the product is broken"* — and
measures it: *"52s cold, 0.37s warm"* (2026-09-24). So R1.22's *"works on a cheap phone on mobile
data"* is satisfiable on a warm instance and false on a cold one, and nothing in §5 or §6 states which
case the requirement is about.

Compounding it, R1.18's queued offline issue *"completes on reconnect"* — and reconnect is precisely
the moment the client is waiting, against an instance that has probably been idle. The two
requirements interact and neither mentions the other.

Note also that the existing mitigation is a control the register already records as having lied:
*"The `Keep API warm` workflow did not prevent it and **reported success while not preventing it**"*
(Rule 21's founding case). So there is currently no mitigation, only a decision not yet taken.

**What it would cost if built as written:** the first impression of the product, for the person who
decides whether Delroy gets the job, is a minute of blank screen. That is the single highest-leverage
failure in the release and it is currently filed as a risk rather than a requirement.

**Suggested resolution:** make it a numbered requirement — the share page renders its content without
waiting on a cold API (static generation or an edge cache of the issued snapshot, which is immutable
and therefore trivially cacheable: R1.13 guarantees *"No column on it is ever updated"*), with a stated
first-byte budget. That is a genuine engineering answer available *without* paying for infrastructure,
and it exploits the immutability the plan already bought. Then add the paid-infrastructure decision to
§9 (see F11 item 5) as the backstop.

## F17 · The PDF-hash evidence chain is specified twice, differently, and R1 has no requirement that the hash is ever checked — severity: minor
**Where:** `PRD.md` R1.13, R1.20; `design/domain-model.md` §7 `document_render`, §6.2 `acceptance`

**The claim under attack:** R1.13: the issue snapshot carries *"a hash of the rendered PDF"*. R1.20:
acceptance records *"its own PDF hash"*. Domain model §7: *"`document_render` … Immutable, and the hash
is what `acceptance` and `quote_issue` **point at**."*

**Why it does not hold:** the model says both entities *point at* the render's hash (one hash, two
references); the PRD says each **carries** its own hash (two hashes, which may differ — and if they can
differ, the difference means something nobody has defined: the client accepted a document that is not
the one we issued). More importantly, no requirement anywhere says the hash is ever **compared**. A
hash that is written and never verified is a field, not a control — Rule 21's distinction between a
control and a comforting artefact — and the one moment it would earn its place is a dispute months
later.

**What it would cost if built as written:** small to fix now, and the fix is a sentence. Left as is, a
dispute produces two hashes, no stored procedure for comparing them, and an argument about which
document the client saw.

**Suggested resolution:** state in the model whether there is one hash or two and what a mismatch
means, and add an R1 requirement that re-rendering or re-serving an accepted issue verifies the stored
hash and refuses (loudly) on mismatch, with a planted-mismatch test (Rule 21.2).

## F18 · The Phase 0 audit's own verdict on quote-to-invoice contradicts R1.23, and nothing reconciled them — severity: minor
**Where:** `docs/PHASE-0-AUDIT.md` §6 #15; `PRD.md` R1.23

**The claim under attack:** audit §6 #15: *"Quote → invoice conversion, **one invoice per quote** |
**keep** |"* — a keep verdict, meaning *port as-is*. R1.23 requires *"**Deposit, progress and final
invoices against one accepted issue**"*, i.e. many invoices per issue, and calls it *"the top-ranked
missing feature"* (the audit's own #34, marked **absent**).

**Why it does not hold:** #15 and #34 are inconsistent with each other inside the audit, and R1 sides
with #34. Rule 1.9 makes the audit a living document to be corrected as a proposed edit rather than
left contradicting the plan; a builder who reads the audit's keep verdict as licence to port the
one-invoice conversion path implements the wrong cardinality in the table the F4 invariant lives on.

**What it would cost if built as written:** trivial if caught in design, a schema change if not —
one-per-quote and many-per-issue differ by a unique constraint.

**Suggested resolution:** amend audit §6 #15 to **change** with the note *"cardinality becomes many
invoices per accepted issue (R1.23)"*, in the same edit that closes this finding.

## F19 · The PRD claims two gates are outstanding while the domain model it is built on is already approved — the review order is inverted — severity: minor
**Where:** `PRD.md` header table; `design/domain-model.md` header; Rule 1.10

**The claim under attack:** the PRD's own gate table says **Owner approval: Outstanding** and
**Independent review: Outstanding**, while the domain model header says *"**APPROVED** by the owner
2026-09-25 · independent review OUTSTANDING"* and *"schema work waits on the review"*.

**Why it does not hold:** the PRD's scope decisions (§4's release split, §8's exclusions) change what
the domain model must contain, and F1, F3, F4 and F13 are all findings where the PRD moved something
the approved model already settled. Approving the model first means every such move is now an
amendment to an approved document rather than an edit to a draft. Rule 1.10 requires the review before
*"the first line of code that implements a plan"*, which is satisfied — but the **sequence** of the two
approvals is what produced the four contradictions above, and it is worth recording so the next
document pair is approved in dependency order.

**What it would cost if built as written:** nothing directly; the cost has already been paid in F1,
F3, F4 and F13. Recording it is Rule 24's point — a mechanism rather than a reminder.

**Suggested resolution:** when these findings are closed, amend the domain model in the **same change**
as the PRD (Rule 23.5's discipline applied to designs), and note in `MISTAKES.md` that a dependent
design was approved before the document that scopes it, with the mechanism being: the narrower document
(scope) is approved before or with the broader one (model), never after.

---

## Summary

| # | Severity | One line | Blocks |
|---|---|---|---|
| F1 | **blocker** | PRD §4/R1.18 and the approved domain model §8 give opposite answers on offline issuing | W4, the schema step |
| F2 | major | R1.8's "under 60 seconds of interaction" has no defined clock, no named device, no cache precondition and no instrument — and §10's instrumentation has no requirement | W3, §10 |
| F3 | **blocker** | With W6 deferred, R1 has no path for a change to an accepted quote: revising supersedes the issue the acceptance is attached to | W7 |
| F4 | **blocker** | R1.24 is written in R2 vocabulary (variations, retention) and no document says where a cross-row money invariant is enforced | W7 |
| F5 | **blocker** | The site sells four Pro features R1 excludes and sells Business with no "not yet"; the guard the PRD cites reads nothing in `tier.includes` and is named by a filename that does not exist | the pricing page |
| F6 | major | The site states R2 features in the present tense and lists R1 features (R1.20, R1.23) as "coming next" | site copy |
| F7 | major | Free gets "recipes: view only" and R1 provides no recipe a Free tenant could view — the wedge cannot demonstrate the differentiator | W2, the Free tier |
| F8 | major | `TIERS.md`, PRD §7 and the site disagree on whether offline is a Free feature; the entitlement value comes from whichever is read | entitlement data |
| F9 | major | §10's "≥4 quotes/month" target is above the Free limit of 3, so no Free tenant can reach it and the conversion denominator is the converted population | §10 |
| F10 | question | "3 new jobs quoted per calendar month" never says what it counts; drafts, issues and revisions each break something | W9 entitlements |
| F11 | **blocker** | §9 omits five non-engineering dependencies; upload malware scanning and private object storage are **absent from the service register** entirely (Rule 18) | W4, W9, the privacy policy |
| F12 | **blocker** | R1.30 is one line; none of Rule 14's four mandatory registration defences is a requirement, and the per-address bound conflicts with ADR 0022 | W9 |
| F13 | major | `price_observation` and its at-sign-up consent are in neither R1's scope nor its exclusions, and the consent half is irreversible for the launch cohort | W1, registration |
| F14 | major | R1.10 sections, R1.11 detail levels and R1.40 the tenant-readable audit trail have no entity or no design; R1.17 depends on per-country timezone work nobody was asked for | W3, W4, cross-cutting |
| F15 | question | W5 rests on two unverified world-assumptions — that clients will accept by typed name, and that the record carries weight in a dispute; ADR 0022 answered neither | W5, §9 |
| F16 | major | The share page is client-facing and exposed to the measured ~52s cold start; N9 covers only the static site and no requirement covers the share page | W5 |
| F17 | minor | The PDF-hash chain is one hash in the model and two in the PRD, and nothing ever verifies it | W4, W5 |
| F18 | minor | `PHASE-0-AUDIT.md` §6 #15 keeps "one invoice per quote", contradicting R1.23 and its own #34 | W7 |
| F19 | minor | The domain model was approved before the PRD that scopes it, which is what produced F1, F3, F4 and F13 | process |

**Counts:** 6 blockers, 9 major, 3 minor, 2 questions (F10 and F15 are for the owner).

**The dependency order the blockers imply:** F1 and F4 must close before the physical schema is
written, because both change columns on `quote_issue`/`number_series`/`invoice`. F3 must close before
W7. F12 and F11 must close before W9 and W4. F5 blocks only the pricing page and can be fixed today.
Nothing here blocks W1, W2 or W3 except F7 (a commercial decision) and F2 (a measurability decision).

---

## What this review did not examine (Rule 21.4)

Stated explicitly, because a review whose scope is unstated reads as though it covered everything.

1. **No code was read except `new-app/web/content/site.ts` and `new-app/web/test/site-guards.test.ts`.**
   The API, the shared core, the existing schema and migrations, and `original-app/` were not examined.
   Claims in either document about what is already built (the nine existing tables, staff MFA, rate
   limiting, the audit log) were taken from the documents and from `SERVICE-REGISTER.md`, **not
   verified against the tree**.
2. **No tests were run** and nothing was executed — the brief forbade it, and another process may be
   using the same `node_modules`. So every statement here about a guard's coverage rests on **reading**
   the test file, not on watching it fire. Specifically, F5's claim that no assertion reads
   `tier.includes` comes from `grep` over `site-guards.test.ts` plus reading its `describe("nothing
   untrue")` block; it was not proved by planting a false tier feature and watching the guard pass
   (Rule 21.2's standard, which this review does not meet).
3. **The security content was not independently threat-modelled.** `THREAT-MODEL.md` was read only for
   its section structure and §4.4; N1 and N6–N8 were not attacked, no tenant-isolation reasoning was
   checked, and R1.19's share-link design was not compared against the threat model's public-surface
   section. A reviewer with the security brief should do that separately.
4. **The money arithmetic was not reviewed beyond R1.24's enforcement gap.** GCT treatment per line
   (R1.9), markup and discount interaction, rounding order, and the N2 ceiling were not checked. Rule
   16.5 places this in the judgement class and it deserves its own pass.
5. **ADRs were read selectively** — 0022 in full, 0007/0015/0020/0021 by grep for the specific claims
   cited. The other eighteen were not read, so an ADR that already answers one of these findings may
   exist and was missed. F11's register gaps in particular were checked by `grep` over
   `SERVICE-REGISTER.md` only (`malware|ClamAV|scan|bucket|storage`), not by searching the ADR set for
   an unregistered decision.
6. **Nothing was verified with the owner.** F10 and F15 are questions, not findings, precisely because
   the reviewer cannot answer them; F7's and F8's recommendations are commercial opinions offered for a
   decision, not conclusions.
7. **No estimate of effort or schedule** was attempted for anything recommended here, and the review
   did not check whether the release split is achievable in any particular timeframe — only whether R1
   is internally coherent.
8. **The brief (`DEVELOPMENT-BRIEF.md`) and `BRIEF-STATUS.md` were not read.** Both documents cite the
   brief by section repeatedly (§5a, §6, §10, §13, §15); those citations were taken at face value and
   not checked, so a requirement the brief mandates and the PRD omits would not have been found by this
   review.
9. **`MISTAKES.md` was read for its shape, not exhaustively** (the first ~60 lines). The brief asked
   whether the plan *repeats the shape* of past mistakes; F5 (a control that overstates coverage, M3's
   shape), F2 (a claim with no instrument, M3's shape) and F15 (an unverified assumption about the
   world, ADR 0022's shape) are that check's output, but a defect matching a later entry may have been
   missed.
