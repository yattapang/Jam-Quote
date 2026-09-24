# Project rules

**Approved by the owner on 2026-09-23.** These rules govern every task on this project. They
are the single rulebook: the engineering rules written on 2026-09-20 (`BUILD-RULES.md`) are
folded in here, and `docs/adr/` keeps the reasoning behind each structural choice.

Product: **Pryvis** (pryvis.com). Built as JamQuote; renamed per ADR 0009.
Standing context: the development brief in `docs/DEVELOPMENT-BRIEF.md`.

---

## Rule 0 — The rules are read at the start of every task

Every task — mine, a subagent's, or a future maintainer's — begins by reading this file and
the ADRs that bear on the work, and states which rules apply to it. A task that has not cited
its rules has not started.

**Every process, not only the ones that write code.** A build, a review, an audit, a schema change,
a document, a deployment, an investigation, a question answered from memory: each one starts here.
The habit is the control, and a process that skips it has usually skipped something else.

**Every subagent brief carries this rule in its first line**, names the specific rules and ADRs that
bear on its task, and names the approved design it works against (Rule 1.1). An agent starts cold:
it knows nothing we have not told it, so the brief either hands it the rules or it works without
them. See Rule 16.

When a rule turns out to be wrong, it is changed deliberately, in writing, with the owner's
approval — never ignored quietly in one task.

---

## 1. How we work

1. **Design before code — a gate, not a preference (owner requirement, 2026-09-24).** Nothing is
   implemented until a design for it exists and the owner has approved it. The design says what
   problem is being solved, what it must achieve, the shape, the trade-offs, what is deliberately
   excluded, and how it will be proved. It is proportionate: a page or two for a feature, a
   paragraph for a small change. Designs live in `docs/design/`.

   **An ADR is not a design.** An ADR justifies one decision; a design says what is being built. A
   threat model and a domain model are what show the decisions add up.

   The failure mode has a name — **vibe coding**: building because the next step looks obvious, and
   finding out afterwards what got decided by accident. This project exists not to be that. It has
   already happened twice here (Foundations built ahead of Phase 1's artefacts; the marketing site
   started with no design and parked because of it), and both are recorded rather than smoothed
   over.

   **How it is enforced:** every task names the approved design it implements *before* it starts. If
   there is no design, the task is to write one. Where building ahead of the design is genuinely the
   right call, it is said to the owner at the time and recorded in `BRIEF-STATUS.md` — never
   discovered later.
2. **Audit before rebuild.** `original-app/` is read-only from the moment Phase 0 begins. It
   is deleted only when the owner says so, as its own commit.
3. **Small reviewable changes.** One scope per change, sized for a single pull request.
4. **Tests first, or alongside.** No feature is done without tests. **A test counts only once
   it has been shown to fail**: plant the defect, watch the test catch it, restore from a
   backup copy. A test that passes with the fix removed is worse than none — it teaches false
   confidence.
5. **Explain decisions.** State the options, the trade-offs and the recommendation. Record
   significant choices as dated ADRs.
6. **Flag, don't assume.** Ambiguity is surfaced. Assumptions are listed, not guessed at.
7. **The owner reviews every diff.** Nothing merges on "it seems to work".
8. **Living documents.** The brief, the PRD, the ADRs, the audit and this file are updated as
   proposed edits for the owner's approval when reality changes them — never left stale and
   never changed silently.

## 2. Code a stranger can follow

**Owner requirement (2026-09-23):** the code must be structured in a professional, standard
way, with inline comments, so that an independent person can follow it.

- **Standard shapes, no cleverness.** Conventional framework layouts, conventional names, one
  obvious way to do a thing. A pattern used once is a pattern to remove.
- **Consistent structure end to end:** a module holds its routes, its business logic, its
  validation and its tests together; shared rules live in a shared core; a reader who learns
  one module can navigate the next.
- **Names say what a thing is,** in the domain's language: `quote`, `tenant`, `customer`,
  `entitlement`. No abbreviations a newcomer would have to decode.
- **Comments explain WHY, not what.** Required wherever a reasonable person could "fix" the
  code and break it: a money or tax rule and where it must be applied; a tenancy or
  authorisation check; anything that exists because of a real defect (name the defect); a
  deliberate limit, so the next reader does not trust it further than it earns; a
  country-specific value, with a pointer to the rule pack that owns it.
- **Every module opens with a short header:** what it owns, what it trusts, what it must never
  do.
- **A project context file** at the root of the application (module map, conventions, common
  commands) so a person or Claude can orient before changing anything.
- **Runbooks** for the operations someone will have to perform at 2am.

**Enforcement.** Review, plus the guards below. A change whose reasoning is not on the page
is sent back.

## 3. Money, tax, country and time

- **Money is integer minor units plus a currency code.** Never floating point. Formatting
  happens in one shared place.
- **Percentages** are 0–100 and named as such; **dates** distinguish an instant from a
  calendar day.
- **Tax rules, number and date formats, and legal document wording are data per
  jurisdiction**, never hard-coded and never an `if (country === …)` branch in product code.
- **Timestamps are UTC**, converted only for display; a country's day boundary comes from its
  configuration.
- **i18n from the first screen** — language, locale, formatting.
- **One country is built, nothing prevents the next.**

## 4. Tenant isolation (owner requirement)

- `tenant_id` on every tenant-owned table, **row-level security** in the database, **and**
  tenant scoping in the application. Three layers, not one.
- Tenant context is set per request and per transaction; background jobs carry it explicitly.
- Everything else is scoped too: file paths and signed URLs, cache keys, search indexes,
  exports, generated PDFs, outbound messages, analytics and logs.
- **Automated cross-tenant leak tests run in CI:** tenant A cannot read or write tenant B's
  data through the API, search, exports, files or jobs.
- Our own staff access to tenant data is role-restricted, time-limited where practical, and
  logged.
- A caller-supplied id is ownership-checked before use, and a foreign id is answered exactly
  as one that does not exist.

## 5. Security and authentication, from each module's first commit

- **Default-deny authorisation.** Every route declares how it is protected; a route with no
  guard is a bug. Genuinely public routes are listed and justified.
- **Identity is re-resolved, not trusted.** A role or tenant in a token is a hint; the guard
  reads the truth from the database, so a suspension or demotion bites immediately.
- **Three kinds of route, declared:** authenticated, share-token addressed (the token is the
  authorisation, scoped to one document, revocable, and never mints a session), or
  deliberately public.
- **Passwords:** hashed, never logged, one shared minimum and maximum on every path that sets
  or checks one, never trimmed.
- **Sessions:** httpOnly, sameSite, secure in production; an expiry; a documented way to
  invalidate.
- **Reset tokens:** single-use, expiring, and the request path never reveals whether an
  address exists.
- **Multi-factor authentication** available to tenants and **mandatory** for our own staff and administrators — see the baseline below.
- **Input validated at the boundary by a schema**; output **projected**, not filtered.
- **Secrets in configuration**, never in code, logs, migrations or fixtures. No personal data
  in logs.
- **Rate limits on by default**, tighter on anything brute-forceable or costly.
- **Every money, permission or tenancy change is audited:** who, what, which tenant, when.
- **Uploads are hostile until proven:** type, size and dimension checks, malware scanning,
  private tenant-scoped storage, duplicate detection, retention.
- **Errors say what the user needs and nothing more** — no stack traces, SQL, internal paths
  or raw upstream messages.
- OWASP guidance, least privilege, dependency scanning, encrypted backups with **tested
  restores**, and a written incident and breach response plan.

### 5.1 Staff and administrator accounts — the higher bar (owner requirement, 2026-09-23)

Our own employees and platform administrators hold the most dangerous access in the system: the
admin console can suspend a tenant, change pricing, read audit detail and **impersonate a
tenant**. One compromised staff account is worth more than any single tenant's. So staff accounts
meet a stricter baseline than tenants, and these are minimums rather than aspirations:

- **MFA is mandatory, not offered.** A staff account without a second factor cannot sign in —
  enrolment happens before first use, not "soon". TOTP at minimum; a hardware key is preferred for
  anyone who can impersonate. Recovery codes are issued once, shown once, and stored hashed.
- **A longer password minimum than tenants** (20 characters against 12), and the same hashing
  rules. Length, not character classes: "one symbol" reliably produces `Password1!`.
- **Named individual accounts. No shared logins, ever**, and no shared credentials in a password
  manager note. An action must attribute to a person, or the audit log is decoration.
- **Short sessions with a hard expiry, and re-authentication for dangerous actions** —
  impersonation, changing a plan or price, reading unredacted money detail, changing another
  person's access. Re-authentication means the second factor again, not just a password.
- **Least privilege by named capability.** No "admin" role that means everything; a person holds
  the capabilities their job needs, and gaining one is an audited grant by someone else.
- **Impersonation is exceptional, visible and bounded:** a recorded reason, a time limit, an entry
  the tenant can see, and never a route to a credential or a payment instrument.
- **No standing access to production data.** Access is requested, time-limited, logged, and
  reviewed — and never to satisfy curiosity about a tenant's business.
- **Offboarding the same day**, with every session invalidated immediately (the session-version
  counter in ADR 0013 makes that one update) and capabilities revoked before the exit conversation
  is over.
- **Every staff action is audited with the actor, the tenant, the action and the time**, and staff
  cannot edit or delete the audit trail.
- **Enforced by the system, not by policy.** Each of the above is a check in code with a test, not
  a paragraph in a handbook. A rule only staff goodwill upholds is not a control.

**Where we stand today, plainly (Rule 17):** none of this is built. The admin console exists in
`original-app/` with a password, a 30-day session, no second factor and impersonation. **MFA for
staff is a launch blocker**, not a later improvement, and it is the largest single security gap in
the product.

## 6. Data integrity

- **Issued documents are immutable snapshots:** prices, tax rates, currency, wording and the
  assigned number freeze at issue.
- **Revisions are versions,** not edits to an issued document.
- **Numbering** is per-tenant, configurable (prefix, start, reset rule) and assigned
  atomically, so two documents issued at the same moment neither collide nor skip.
- **Audit log** for significant actions; **soft deletes** where history matters.
- **Versioned migrations only.** An applied migration is never edited; a correction is a new
  migration. No manual schema changes.

## 7. One rule, one place

Every shared rule — totals, tax, settlement, numbering, entitlements, renewal, date handling
— lives once, in the shared core, and every surface imports it. A guard fails when a rule is
restated by hand. This is not theory: a duplicated default and a duplicated cost rule both
drifted here and produced wrong figures.

## 8. Testing, and what "done" means

Three layers, each with a job:

1. **Unit** — one rule, executed, beside the file it tests.
2. **Integration and seam tests** — the joins between modules, against a **real** database.
   A mock cannot disagree with the database, and the costly defects here were all at seams.
3. **Guards** — a class of defect cannot return. Built on a shared parser that resolves names
   properly, never a text search, and each one states what it does *not* prove.

Plus **contract tests** on the API and the cross-tenant leak tests from rule 4.

**Done** means: the full gate green, a defect planted and caught per new test, an independent
review by someone who did not write the work, and the register updated with what the change
does not prove.

## 9. A module is complete only when someone else has attacked it

- **Independent review per module.** The reviewer did not build it, attacks rather than reads,
  plants the module's own defect, probes the boundary (foreign id, wrong tenant, missing
  capability, oversized value, hostile upload, leaked message), and treats every "this is safe
  because…" comment as unproven until executed.
- **Every dependency between modules has a seam test** against a real database, asserting the
  invariant rather than the call sequence, proved by planting a defect on one side. Both
  directions: a module must survive the other's refusals and empty answers.
- **Each surface's copy of an API shape is a seam too.** A type that compiles is not a type
  that matches.
- The module register records, per module, who reviewed it, its security pass, and which test
  covers each seam. A blank is work owed.

## 10. Portability and infrastructure staging (owner requirement)

- **Standard, portable technology:** PostgreSQL, standard containers and runtimes. No
  provider-proprietary service without a stated reason and no portable alternative.
- **Configuration, not code, decides where things run.** Connection strings, buckets,
  credentials and limits live in environment configuration.
- **Start on free tiers, designed within their limits:** connection pooling, files in object
  storage rather than the database, tolerance of cold starts and sleeping instances.
- **Back up from day one.** The export/import scripts written early are the migration path
  later.
- **An ADR records the free-tier setup and the trigger for moving to paid** — a concrete
  threshold, and the expected paid equivalent.

## 11. Communications

One outbound messaging service with pluggable channels; the rest of the application never
calls a channel directly. The document sent is always the issued snapshot. Delivery status is
recorded; sends are idempotent and retried; consent, opt-out and per-country rules are
respected; message costs are modelled in entitlements; messages requested offline are queued.

## 12. Offline (mobile)

A local database and a sync engine with an outbox; client-generated UUIDs so retries cannot
duplicate; **explicit conflict rules per entity**; encrypted local storage, remote sign-out
and a retention limit; sync status visible in the UI; tested under poor and interrupted
networks. What works offline, and whether a document may be issued offline, are ADR decisions.

## 13. Payments and activation controls (owner requirement)

Submitter, approver and activator are separate roles, and the system enforces that the
approver is not the activator. Activation or an upgrade proceeds only from an **approved**
payment record. Manual payments are verified against the bank record, not the uploaded
receipt alone. Where only one person is available, the system records a **single-operator
exception** with compensating controls: an alert, a required later second review, and regular
reconciliation. Strictness is configurable so it tightens as staff are added. Every step is
audited.

## 14. Entitlements and tiers

Plans, entitlements and limits are **data**. Every gated feature is checked through **one
entitlement service**, never a plan comparison at a call site. Entitlements are independent of
the billing provider. A refusal names the feature and the tier that includes it, in plain
words. Existing tenants are grandfathered by explicit, audited grants.

**How a tenant gets an account (owner requirement, 2026-09-23).** A tenant **signs itself up on
the website, free, with no approval from us** — Free is what makes the product spread, and a
contractor who has to wait for a sales call does not come back. Registration creates the tenant,
its first owner, and a **Free subscription in the same transaction**: a tenant never exists
without a plan. Upgrading is **self-service when paid by card**, and entitlements change when the
payment succeeds.

**A manual payment never upgrades anyone by itself** — it is recorded, approved by someone other
than the activator, and verified against the bank record (Rule 13). Both paths end at the same
entitlement change; only the card path is automatic.

Because registration is an **unauthenticated endpoint that creates rows**, it ships with the
defences that make that safe: rate limiting per address and per IP, email verification before
the account can cost us money, a bound on tenants per address, and a duplicate registration that
**does not reveal the address is taken** — it answers exactly as a new one and emails the
existing owner instead. Telling whoever typed it is an enumeration oracle and leaks who our
customers are.

## 15. Claude-assisted maintenance

- Claude proposes **pull requests**; CI and a human approve; nothing reaches production
  directly.
- Least-privilege tokens, no production write access, feature flags, staged rollouts,
  rollback.
- **No tenant or client personal data, and no secrets, are ever sent to the API** — redacted
  or synthetic data only.
- Automation targets the new application only; the parked original is out of scope.
- Budgets, usage alerts and caps. A lighter model for routine work, a stronger one for design
  and review.
- A named human stays accountable. That process is what separates this from vibe coding.

## 16. How work is delegated to agents (owner requirement)

Agents are how this project stays affordable. They are also how it can quietly go wrong, because an
agent starts **cold**: it knows nothing we have not written down, and it cannot be assumed to share
any of the context in which the work made sense.

### 16.1 Every agent reads the rules first

**The brief's first line carries Rule 0**, and the brief then names:

- the specific **rules** and **ADRs** that bear on the task — not "read the rules", but which ones
  and why;
- the **approved design** it is implementing (Rule 1.1), or that its task is to write one;
- the **step of the brief** the work belongs to (Rule 19);
- an explicit **do-not-touch list** — `original-app/` is read-only, and anything another live agent
  is working in;
- how to **plant and restore** a defect: copy to a backup first, restore from the backup, and
  **never `git checkout`** — that has destroyed uncommitted work here before;
- what it must **report**: what it planted, what it proved, what it did **not** check, and why.

### 16.2 The minimum capable model, and one hard thing at a time

| Work | Model |
|---|---|
| File inventories, greps, mechanical renames, formatting | Haiku |
| Building to a precise spec, writing tests, fixing a named defect | Sonnet |
| Architecture, schema, threat modelling, audits, adversarial review, product decisions | Opus |

**One complex agent at a time.** Never two build-class or two judgement-class agents at once.
Never spawn a second agent to do what a live one is already doing — wait for it, or send it a
message.

**A reviewing agent is a WRITER, not read-only.** It plants defects to prove guards, so it edits
files and runs the suite. Treat it as the one complex agent in flight, and do not start build work
that competes with it. (Clarified 2026-09-24 after I was about to run `npm install` in the shared
workspace while a review agent was running tests in the same `node_modules`.)

**While any agent is live, no shared-resource operations.** These interfere even when the files are
disjoint, and the cost is a wasted agent rather than a merge conflict:

- no `npm install` and no lockfile change;
- no full-gate or workspace-wide test run;
- no `git add -A`, no branch switch, no commit that sweeps the tree — the agent's working files are
  in it (Rule 16.3);
- no dependency upgrade, and no change to a shared config the agent's tests load.

Work that *is* safe alongside one agent: writing files in a directory it is not reviewing, and
documents. When in doubt, wait — an agent's whole run is worth more than a few minutes.

**The session is a shared budget.** An agent that dies with the session takes its findings with it
(Rule 16.3), so the practical limit is lower than it looks: **one agent, and the rest of the session
spent on work that does not need it.** Prefer letting an agent finish over starting a second thing
that has to be redone.

**A bounded brief beats a broad one.** An agent given a precise scope spends its budget on the work;
one given "review the codebase" spends it re-deriving what we already know. Handing over context we
already hold is cheaper than having it rediscovered.

**Do not delegate what needs the context.** If explaining the task costs more than doing it, do it.

### 16.3 An agent's silence is never a pass

Added after a real failure: an independent review was commissioned, the agent **died on a session
limit and returned nothing**, and the finding it was meant to produce did not exist. Nothing filled
that gap by default.

- **A failed or interrupted agent is reported as failed**, to the owner, in those words. Its absence
  of findings is never read as "found nothing".
- **The work it was doing stays owed** in `BRIEF-STATUS.md` until an agent actually completes it.
- **Never write, predict or imply an agent's findings.** If it has not reported, we do not know.
- **After any agent has touched the tree, verify it:** `git status`, look for stray backups or probe
  files, and confirm no planted defect was left behind. An agent that dies mid-plant leaves a real
  defect in the working tree.
- **An agent's working files are its own.** Do not delete or commit them while it is live — and a
  bulk `git add -A` will sweep them in, which has happened here. Untrack rather than delete.

### 16.4 What an agent's report is worth

A report is **evidence to check, not a verdict to adopt.** An agent can be confidently wrong, and a
finding that cannot be reproduced does not go in the register as fact. Reproduce what matters,
especially anything that would change a design or close a defect.

Cost discipline applies as it does anywhere else: budgets, usage alerts and caps (Rule 15), and a
named human accountable for what lands.

## 17. Where we are weak, stated plainly

Honesty about gaps is a rule, not a courtesy. Known gaps live in the module register and the
review register, and today include: no dependency-vulnerability check or secret scan in the
gate; no second factor anywhere, including the admin console; a long session with no rotation
and no live-session invalidation; and the mobile sync module has neither an independent review
nor a seam test.

## 18. Every service we depend on is recorded, with the reason (owner requirement)

`docs/SERVICE-REGISTER.md` is the asset register: every external service, piece of
infrastructure and third party, with **what it does, why it was chosen, what it costs, what data
it holds, and what we would do if it disappeared.** A service running in production and missing
from the register is a defect, not a paperwork oversight, and it is updated in the same change
that adds, removes or repoints a service.

It doubles as the **vendor and sub-processor register** — the *holds personal data* column is
what a tenant is entitled to ask for, and the basis of a Record of Processing Activities if one
is ever required.

Code dependencies are **not** listed by hand. They belong in a generated **SBOM** (CycloneDX or
SPDX) produced from the lockfile in CI, so "are we affected by this advisory?" is a query rather
than an investigation. An SBOM nobody scans is a file, not a control, so it lands together with
dependency-vulnerability scanning and secret scanning.

The register never contains a credential. It records *where* a secret lives, never its value.

**Enforcement.** Review, and the register's own "what this says about our exposure" section,
which is where a dependency with no substitute has to be admitted rather than discovered later.

## 19. The brief is the plan of record, and it is kept true (owner requirement)

`docs/DEVELOPMENT-BRIEF.md` is what we agreed to build and in what order. Drift is not usually a
decision; it is what happens when nobody checks. So:

- **Every task states where it sits in the brief** — which phase, which step of the delivery
  order — before it starts. Work that sits outside the brief is either a deliberate, recorded
  change to the plan or it is drift.
- **`docs/BRIEF-STATUS.md` is the tracker**, section by section: done, partly done, not started,
  with the evidence and the gaps. It is read at the start of a task and updated in the same change
  that moves it. A status file nobody updates is worse than none, because it reassures.
- **A phase's deliverables are not skipped silently.** Building ahead of the paper — a PRD, a
  domain model, a threat model — is sometimes the right call, and when it happens it is **named**
  in the status file and to the owner, not discovered later. If I notice we are ahead of the plan,
  saying so is part of the work.
- **When reality diverges from the brief, the brief changes** — as proposed edits for the owner's
  approval, never edited silently and never left stale. The brief's own instruction to propose
  edits after Phase 0 is an example, and it was missed once already.
- **A step that the brief requires and we have not done is stated plainly**, in the status file and
  in the answer to "where are we?" — including when nobody asked.

**Enforcement.** Rule 0 makes this file read at the start of every task, and this rule points at
the tracker. The honesty is the control: a tracker that only ever says "on plan" is not being
maintained.

**Two questions answered before any task begins**, and they are the whole of this rule in practice:
*which step of the brief is this?* and *which approved design does it implement?* (Rule 1.1). A task
that cannot answer both is not ready to start.

## 20. The public site, and what we say on it (owner requirement)

pryvis.com is the front door. A self-service product with no public description cannot be signed up
for, so the site is a launch dependency and not marketing polish.

- **We own the site.** Pages live in our own application, content in typed data files, deployed on
  free hosting we can leave (ADR 0018). A free **site builder** is not the same as free hosting: it
  puts our words in someone else's database, in their format, behind their editor, and "upgradable
  later" becomes a migration nobody scheduled. Rule 10 applies to the website exactly as it applies
  to the database.
- **Free now, upgradable deliberately.** Every free tool is chosen so leaving it is a change of
  configuration rather than a rewrite, and each one is entered in the service register with its
  upgrade trigger (Rule 18).
- **We claim nothing that is not true.** No testimonials we did not receive, no customer counts we
  cannot evidence, no logos we have no right to, no review scores, no invented awards. Until there
  are customers, the site sells the product on what it does. A prospect who discovers an invented
  claim has learned something true about us.
- **No price until the price is decided.** A placeholder number gets screenshotted and quoted back.
  Say what a tier includes and that pricing is coming.
- **No third-party scripts by default** — no trackers, tag managers, chat widgets or font CDNs. Each
  is a processor to register, a consent banner to justify and a performance cost. Analytics, if
  wanted, are privacy-preserving and registered like any other service.
- **The legal pages are real work, not filler.** Terms of Service and a Privacy Policy are required
  before a self-service sign-up that will take payment. The privacy policy names the processors and
  says plainly that data leaves the country. **They carry legal responsibility, so the owner
  approves the words**; until then they ship marked as drafts and are never presented as final.
- **It works for the person we are actually selling to:** a contractor on a phone, on mobile data,
  in sunlight. Mobile-first, accessible, fast, and legible outdoors. These are requirements with
  tests, not aspirations.
- **The site keeps working when the product is asleep.** Static pages that call nothing, so a
  cold-starting API or a sleeping free instance never makes the front door look broken.

**Enforcement.** Guards over the site's own pages: every page has a title and description, internal
links resolve, no external script or stylesheet host appears, and no social-proof claim exists
unless a data file provides evidence for it. Plus review, for the things a test cannot judge.

