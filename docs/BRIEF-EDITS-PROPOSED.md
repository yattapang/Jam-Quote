
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

## Edit 3 — §5 and §9: the scope decision, and what "verticalise later" commits us to

**The brief asks** for a product-scope recommendation for the owner to decide: one product as
scoped, a second product, or full integration.

**Decided by the owner, 2026-09-24: one product, built to verticalise later.** Not one of the
brief's three options exactly — it is the first with an explicit constraint attached, and it
changes the design rather than only the scope.

**Proposed replacement for the scope paragraph:**

> **Product scope (decided 2026-09-24).** One product — quoting, invoicing, payment and job profit
> for contractors — with the **trade-specific parts built as data from the first commit** so a
> second trade is configuration rather than a new product. The tier structure in §9 is unchanged:
> Free, Pro, Business, with invoicing at Pro and team features at Business. A second product is not
> planned; the option is kept open by the data boundary, not by a second codebase.
>
> **What this commits the build to.** Alongside the jurisdiction rule pack there is a **trade
> pack**: the unit vocabulary, material categories and attributes, the labour trade list, default
> job recipes, document wording and the quoting style a trade expects. Product code must never
> branch on a trade, exactly as it must never branch on a country (Rule 3). Construction is the
> first trade, not the only one, and no entity, table or type is named for it.

**Why the distinction is worth the words:** "one product" alone would have let the build hard-code
construction into names and logic, and a second trade would then have meant a second codebase — the
option you chose to keep would have been spent without anyone deciding to spend it.

---

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

## Edit 5 — §6: Phase 1 ran out of order, and the brief should say what that costs

**The brief says** design before code, and Phase 1 produces the PRD, domain model, threat model,
ADRs and target schema before implementation.

**What is true:** ADRs were written for every decision and each build step was approved, but the
**PRD, domain model and threat model were not written** while Foundations was built. The threat
model now exists (2026-09-24) and, written afterwards, it mostly validated the work — but that was
luck as much as judgement, and it is not a precedent to rely on.

**Proposed addition:**

> **Order, and what it cost.** Foundations was built before the PRD, domain model and threat model
> were written. The threat model, written afterwards, endorsed the authentication design and found
> no defect in it — but it also surfaced five gaps that an earlier reading would have scheduled
> differently, the audit log first among them. **Design-before-code is not satisfied by an ADR per
> change.** An ADR justifies one decision; a threat model and a domain model are what show the
> decisions add up. Where building ahead of the paper is deliberate, it is stated in
> `BRIEF-STATUS.md` and to the owner at the time (Rule 19).

---

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

## What I recommend you do with this

Approve edits 1, 2, 4, 5, 6 and 7 as written — they record what happened. **Edit 3 is the one worth
reading closely**, because it converts your scope decision into a constraint the build must honour
from the first commit, and it is the one that costs design effort later if it is wrong now.
