
# Proposed edits to the development brief

**This is the step §5 of the brief required and I skipped:** once the audit is complete and the
owner has decided on product scope, propose specific edits to the brief reflecting what was
actually found. It was owed since Phase 0 and is late; Rule 19 now exists so it cannot be missed
again.

**Nothing here is applied.** These are proposals for your approval. On your yes, I edit
`docs/DEVELOPMENT-BRIEF.md` in one commit and record the change in `BRIEF-STATUS.md`.

Each edit says what the brief currently assumes, what turned out to be true, and the replacement
text.

---

## Edit 1 — §5: the live website does not exist

**The brief says** to use the current live website as the source of truth for what the product
does, extracting purpose, positioning, benefits, public pricing and user-facing workflows.

**What is true:** there is no marketing website. `apps/web/app/page.tsx` redirects `/` straight to
`/dashboard`, and the Vercel deployment is the logged-in application. There is no owner-written
public copy to extract, so the product review was derived from the code and the two public pages
and is marked unverified in the audit.

**Proposed replacement:**

> **Product and feature review.** There is no marketing website; the deployment is the application
> behind a login. Derive the product's purpose, features and workflows from the code and from the
> only public surfaces that exist (the login page and the public quote/invoice pages), and mark
> positioning and pricing as **unverified** until the owner confirms them. Producing that public
> copy — what the product is, who it is for, what it promises — is itself a deliverable, owed
> before launch, and the PRD is where it starts.

**Why it matters beyond bookkeeping:** a product with no public description cannot be signed up
for. This is a launch dependency hiding inside a documentation gap.

---

## Edit 2 — §4: the folder structure, as it actually turned out

**The brief proposes** `original-app/`, `new-app/`, `docs/`, and asks Claude to confirm whether the
reorganisation happens on a branch and whether any pipeline references old paths.

**What is true:** done on 2026-09-23 as 711 tracked renames (ADR 0010). Two additions the brief did
not anticipate: each application is **its own npm-workspace root**, so they never share a lockfile;
and **one deploy-critical setting could not be versioned** — Vercel's Root Directory is a dashboard
value, and the web deploy fails until it is repointed by hand.

**Proposed addition to §4:**

> **As built (2026-09-23, ADR 0010).** `original-app/` and `new-app/` are each their own
> npm-workspace root, with their own `package.json`, lockfile and `turbo.json`, so a dependency
> upgrade in one cannot destabilise the other. `render.yaml` carries `rootDir: original-app` and CI
> runs each workspace as its own job. **Vercel's Root Directory is a dashboard setting and cannot
> be versioned**; it must be changed by hand in the same window as any move, and the web deploy
> fails until it is. Any future folder move inherits that constraint.

---

## Edit 3 — §5: the scope decision, and the product-portfolio question it actually asked

**I misread this the first time.** I answered §5's scope question as a *verticalisation* question —
whether the code should be ready for a second trade — and proposed brief wording to match. That
decision is real and stands (ADR 0017), but the owner's question was a **product-portfolio** one:
given the product as proposed, what else is worth adding, and what currently inside it would be
worth more as a separate solution.

Both belong in the brief, and they are different things: one is about how the code is structured, the
other about what the business sells.

**Proposed replacement for the scope paragraph:**

> **Product scope (decided 2026-09-24).** One product — quoting, invoicing, payment and job profit
> for contractors — with the **trade-specific parts built as data from the first commit** so a second
> trade is configuration rather than a new product (ADR 0017). The tier structure in §9 is unchanged.
> Product code must never branch on a trade, exactly as it must never branch on a country (Rule 3);
> construction is the first trade, not the only one, and no entity, table or type is named for it.

**Proposed new subsection, §5a — the portfolio review:**

> **§5a. What to add, and what to take out.** The feature inventory is also read for portfolio
> questions, and the answers are recorded in `docs/PRODUCT-OPPORTUNITIES.md`: which adjacent features
> or related businesses the existing data makes possible, and which bundled features would be worth
> more as a separate solution. This is reviewed again at the end of each delivery step in §18, because
> the answers change as the data grows. Recommendations are the owner's to decide.
>
> **The finding that carries a deadline:** every tenant enters supplier prices, so the product
> accumulates a live price index for Jamaican construction materials — the most defensible asset in
> the business, and one no competitor can copy without the same history. Using it, even in aggregate,
> requires the tenant's consent **in the terms they accept at sign-up**, plus a statistical guarantee
> that no tenant can infer a named competitor's buying price. That consent cannot be retro-fitted, so
> **the terms of service must settle it before the first tenant signs up** — which makes it a
> dependency of registration, not of the website.
>
> Confirmed for removal: the admin-curated regulatory feed, which shares no data and no workflow with
> quoting and carries a content cost with no revenue. If it lives, it lives as a media product with an
> editor, not inside a quoting tool.

**Why the correction matters:** the verticalisation answer shapes the code, and I had let it stand in
place of the portfolio answer — which shapes the *terms of service*, and therefore has a deadline the
code question does not.

## Edit 4 — §18: Foundations, as it actually proceeded, and what is still missing from it

**The brief's step 1** is authentication, tenancy with cross-tenant leak tests, schema (including
client-generated ids and versioning for future sync), audit log, CI.

**What is true:** tenancy, authentication and CI are built to a standard I am willing to defend.
**Two named items are not:** the **audit log** does not exist, and the schema has **no
client-generated ids and no row versioning** — which the brief deliberately put in step 1 so sync
would not be a retrofit.

**Proposed addition:**

> **Foundations — status at 2026-09-24.** Built: tenancy (`tenant_id` + forced row-level security +
> request-scoped context, with leak tests against a real Postgres), authentication (default-deny
> routes, identity re-resolved per request, revocable sessions, sign-in, rate limiting), and CI
> gating both workspaces. **Still owed within step 1:** the audit log, staff MFA, and
> client-generated ids with row versioning. Step 1 is not complete until those land, and the
> vertical slice in step 2 does not start before them.

---

## Edit 5 — §3 and §6: design before build, as a gate rather than a principle

**The brief says** design before code: propose designs, schemas and trade-offs first, and write no
implementation until they are approved.

**What is true:** it was not followed. ADRs were written for every decision and each build step was
directed by the owner, but the **PRD, domain model and threat model were not written** while
Foundations was built, and the marketing site was started with no design at all — an ADR arguing the
platform choice is not a design of what the site says or what each page must achieve. The owner's
instruction on 2026-09-24 was to go back to design-before-build and hold the rule going forward, in
those words, to prevent vibe coding. The site work is parked on a branch rather than kept and
relabelled a prototype.

**Proposed replacement for §3 item 1:**

> 1. **Design before code, as a gate.** Nothing is implemented until a design for it exists and the
>    owner has approved it. The design is written down — what problem, what it must achieve, the
>    shape, the trade-offs, what is deliberately excluded, and how it will be proved — and it is
>    proportionate: a page or two for a feature, a paragraph for a small change. An ADR is **not** a
>    design: it justifies one decision. A threat model and a domain model are what show the decisions
>    add up.
>
>    **This gate was breached twice** — Foundations built ahead of Phase 1's artefacts, and the
>    marketing site started with none — and both are recorded in `BRIEF-STATUS.md` rather than
>    smoothed over. The failure mode has a name: **vibe coding**, building because the next step is
>    obvious and discovering afterwards what was decided by accident. It is what this project exists
>    not to be.
>
>    **How it is enforced:** every task states which approved design it implements, before it starts.
>    If none exists, the task is to write one. Where building ahead is deliberately the right call, it
>    is named to the owner at the time and recorded — never discovered later.

## Edit 6 — §11 and §14: what the audit and threat model added to the security requirements

**Proposed additions**, each from something found rather than imagined:

> - **Row-level security is not optional, and `FORCE` is part of it.** Postgres exempts a table's
>   owner from its own policies, and the application's migration role owns the tables — so `ENABLE`
>   alone leaves isolation switched on and doing nothing for exactly the connection that matters.
> - **Every table is tenant-protected or exempt with a written reason.** There are two exemptions,
>   both authentication bootstrap (a session and a credential must be readable before a tenant is
>   known), plus non-tenant infrastructure. A guard refuses a third that arrives quietly.
> - **Staff and administrators meet a higher bar than tenants** (Rule 5.1): MFA mandatory, a longer
>   password minimum, named individual accounts, re-authentication before impersonation or a price
>   change, least privilege by named capability, and same-day offboarding.
> - **Rate limiting is part of authentication, not an operational afterthought.** A deliberately
>   expensive password hash on an unauthenticated endpoint is a denial-of-service lever; the hash
>   and its limiter ship together.
> - **Self-service registration is a security surface.** It is unauthenticated and creates rows, so
>   it ships with rate limits, email verification before anything costs us money, and a duplicate
>   registration that does not confirm the address is taken.

---

## Edit 7 — §19: answers so far, and the seven still open

**Proposed replacement for the open-questions list**, marking what is settled:

> Answered: product scope (one product, verticalise later, 2026-09-24); the current stack and its
> storage problems (audit §1–2); first and second country (Jamaica, then Trinidad & Tobago); tier
> definitions (`TIERS.md` — numeric limits and prices still open); WhatsApp approach (click-to-chat
> now, Business API on the Business tier); payment provider (WiPay); data to migrate (none — no live
> tenants).
>
> **Still open, and each now blocking something specific:** the mobile framework (Expo is assumed
> because it exists, never decided); offline scope, and whether a quote may be issued offline; the
> support model, buy or build; payment-approval staffing at launch, which sets how strict Rule 13
> can be on day one; hosting region and data residency, which matters because tenant and customer
> data currently leaves Jamaica; the free-tier-to-paid trigger, which Rule 10 requires as an ADR;
> and the Claude API budget cap.

---

## Edit 8 — the marketing website belongs in the brief, not beside it

**What the brief says:** nothing. It treats the live website as an existing thing to audit (§5) and
never contemplates building one.

**What is true:** there is no website, the owner owns pryvis.com and has asked for it, and a
self-service product with no public description cannot be signed up for. It is a launch dependency —
so on the owner's instruction it goes *into* the brief, with a design, a place in the delivery order
and its own deliverables, rather than proceeding as a side project.

**Proposed new §17a, and an addition to §18:**

> **§17a. The public website.** pryvis.com is the product's front door and a launch dependency, not
> marketing polish. It is built as pages in our own application, content in data files, on free
> hosting we can leave — never a site builder that holds our words in its own format (ADR 0018,
> Rule 20). Deliverables: a written design of what each page must achieve and for whom, approved
> before any page is built; the pages themselves; **Terms of Service and a Privacy Policy approved by
> the owner**, which registration legally depends on and which must settle the aggregate-data question
> in §5a; and guards proving no third-party tracker, no unevidenced social-proof claim, and no price
> displayed before a price is decided.
>
> **In §18's delivery order it sits inside step 2**, the first end-to-end vertical slice, because the
> journey that matters is *land on the site → sign up → build a quote → send it → get it accepted*.
> Building the site earlier is allowed; building it in isolation is not — a front door to nothing is
> not a milestone.

**Why inside step 2 rather than before it:** the site's only job is to start that journey. Shipping it
alone produces a page asking people to sign up for something that cannot yet accept them — which is
exactly the state the parked branch is in, with a `mailto:` standing in for registration.

## What I recommend you do with this

Approve edits 1, 2, 4, 6 and 7 as written — they record what happened.

**Edit 3 is the one to read closely.** It carries the only deadline here: the price-index consent has
to be in the terms of service before the first tenant signs up, and it cannot be added afterwards.

**Edit 5 is the one that changes how we work**, and it is the owner's instruction rather than my
suggestion. It turns design-before-build from a principle into a gate with a named failure mode.

**Edit 8 puts the website inside the brief** and inside step 2 of the delivery order, so it is built
against a design and lands as part of a journey rather than as a front door to nothing.
