# Design: environments and operations — where Pryvis runs, how it is changed, and how it is kept safe

**Status: APPROVED by the owner, 2026-10-06 — every recommendation, OP1-OP12** ("Approved"), including production in
Toronto on DigitalOcean subject to OP2's check at B1. **Amended the same day** to answer its independent read (OR1-OR20,
§15). That includes two blockers: Claude's own GitHub identity, and the deploy gate moved into the staff console. The
amendments are approved with the step's sign-off. Written section by section and saved as it went, at the owner's
request. Build plan step A4 (`docs/BUILD-PLAN.md`). Next: an independent read, a closing check, then the owner's sign-off ticks A4.
Nothing here is built until steps B1-B4 begin.

Date: 2026-10-06 · **Implements the direction of** ADR 0030 decision 5 (environments and operations), as changed by
ADR 0035 (hosting regions chosen with the Data Protection Act's s. 31 in mind) · **Carries** Rule 10 (portability, and
the trigger for leaving free tiers), Rule 15 (Claude-assisted maintenance and its three approval gates), ADR 0026 (the
API always on at launch), `docs/design/api-layer.md` (AP8's start-up, time limits and measured proxy hops; AP10's job
worker), `docs/design/support-and-feedback.md` (SF8's redacted task list, which feeds the start gate) and
`docs/DATA-PROTECTION-READING.md` (§5 transfers, §7 retention, §8 the annual impact assessment) · **Answers**
`docs/PLANNING-AUDIT.md` §7 item 4, including finding PA7 (Rule 10's trigger with thresholds and paid equivalents for
every free-tier piece) · **Delegation (Rule 16.5):** Opus — operations and security.

**Prices are public list prices found on 2026-10-06, in US dollars, mostly from third-party summaries, and are checked
on each vendor's own page before anything is bought** (sources in §14).

---

## Contents

1. The problem
2. OP1 · Three environments, and where real data may live
3. OP2 · The hosting region
4. OP3 · Hosts, plans and what they cost
5. OP4 · Configuration and secrets
6. OP5 · From a change to production: the pipeline
7. OP6 · Backups and restore drills
8. OP7 · Monitoring and alerts
9. OP8 · The three approval gates for Claude-assisted maintenance, and their interface
10. OP9 · Runbooks
11. OP10 · Rule 10's trigger: every free-tier piece, its limit and its paid equivalent
12. OP11 · Security operations: accounts, keys and dependencies
13. OP12 · The operations calendar
14. What gets built, tests, what this does not do, and sources
15. The independent read, and where each finding is answered

## 1. The problem

Today the only deployment is the **old** application. The blueprint in the repository (`render.yaml`) still points at
`original-app` on Render's free plan in Oregon, and a GitHub workflow (`keep-api-warm.yml`) pings it to keep it awake.
The rebuilt application has never been deployed anywhere: no environment, no backups, no monitoring, and no way for an
administrator to approve a change before it runs.

The owner has decided, in the documents this design implements:
- the API is always on at launch (ADR 0026);
- three environments (ADR 0030 decision 5);
- Claude-assisted maintenance runs nothing without an administrator's recorded approval, at three gates, through an
  interface built for it (Rule 15);
- hosting regions are chosen with Jamaica's rule on transfers abroad in mind (ADR 0035).

Since those decisions, three facts have come to light:
- **neither Render nor Neon offers a Canadian region.** Both offer US-East (Virginia, Ohio) and Frankfurt in the EU.
  Other providers do offer Toronto (OP2);
- **neither can move an existing service or database to another region.** The region is chosen at creation;
- **Vercel's free Hobby plan does not allow commercial use.** The register lists the site on Hobby.

This design decides where each environment runs, what it costs, how a change reaches production, how data is backed
up and restored, how problems are noticed, how Claude's work is approved, and what is done on a calendar.

## 2. OP1 · Three environments, and where real data may live

| Environment | Purpose | Data | Who uses it |
|---|---|---|---|
| **Development** | Building and testing on a developer's machine, and Claude sessions | **Synthetic only** — the seed data and tests already in the repository | Developers, Claude |
| **Staging** | The last check before production: the same code, configuration shape and region as production | **Synthetic only**, plus the owner's own test accounts | The owner, reviewers, the restore drill's checks |
| **Production** | Real contractors and their clients | **The only place real personal data lives** | Contractors, their clients, staff through the console |

**The rule that matters most: production data never leaves production** (Rule 15; ADR 0035). It is never copied to
staging or development — not for a bug, not for a test, not "just this once".
- **Database copies are a trap here.** A branch, fork or snapshot of the production database *is* a full copy of
  production data, whichever provider offers it. So production has **its own database cluster**, and development and
  staging live on **separate** databases seeded with synthetic data. No copy is ever taken from production, except by
  the restore drill (OP6), which restores inside production's own account and region and is deleted afterwards.
- **A bug that only real data shows** is reproduced by writing a synthetic case that has the same shape, never by
  copying the real row.
- **Restore drills** (OP6) restore into a separate, short-lived database cluster in production's own account and
  region, run their checks and are destroyed. Their results hold counts and pass/fail, never data.

**Every kind of copy of production data, and its lifetime** *(OR11)* — the complete list, so that "no copies" is checkable:

| Copy | Where | Lifetime |
|---|---|---|
| The provider's own daily backups and point-in-time history | The production database provider | The plan's window (confirmed when buying; must be 35 days or less) |
| A point-in-time restore, if one is ever made | A new cluster in production's account | Deleted once the incident is resolved, and recorded in the operations log |
| The nightly encrypted dumps | The backup store (OP6) | 35 days |
| The monthly restore drill | A throwaway cluster in production's account | Hours; destroyed after the checks |
| The yearly rebuild drill | A throwaway cluster in production's account | Hours; destroyed after the checks |

**Restoring must not undo an erasure** *(OR11)*. When a person's data is erased (R1.44, ADR 0035), the erasure is
written to an **erasure ledger** — identifiers only, never the data itself. Restoring any copy replays the ledger before
the restored data is used. So a restore cannot silently bring back what someone asked to delete.

**Each environment is separated at every layer:**
- its own database (production in its own project);
- its own API service;
- its own web deployment;
- its own secrets — no key is shared across environments;
- its own storage bucket (A5);
- its own error-tracking project.

A staging key that leaks opens nothing in production.

**Addresses:**

| | Production | Staging |
|---|---|---|
| Website and web app | `pryvis.com` | **`staging.pryvis.com`** — a custom domain, so staging's pages are same-site with staging's API and the cookie rules of AP2 work as in production *(OR4)* |
| API | `api.pryvis.com` | `api.staging.pryvis.com` |
| Share page | `share.pryvis.com` | `share.staging.pryvis.com` |

The staging hosts follow the same cookie rules as production (AP1-AP2): pages from `staging.pryvis.com` call
`api.staging.pryvis.com`. A Vercel preview address (`*.vercel.app`) would be cross-site to the API, so the session
cookie would never be sent, and staging could not test what it claims to *(OR4)*. The three staging DNS records join
OA2.

## 3. OP2 · The hosting region

**The rule that drives this** (ADR 0035; `docs/DATA-PROTECTION-READING.md` §5): personal data may leave Jamaica only
for a country with adequate protection, or under an exception. So the production region is a legal choice as well as
a speed choice. **Synthetic data is not personal data**, so development and staging are free to run anywhere. **Only
production's region matters.**

**What the providers offer** (checked 2026-10-06; §14):

| Provider | Canada | EU | US-East | Note |
|---|---|---|---|---|
| Render (today's API host) | No | Frankfurt | Virginia, Ohio | A service's region cannot be changed after creation |
| Neon (today's database) | No | Frankfurt, London | Virginia, Ohio | Azure regions deprecated |
| **DigitalOcean** | **Toronto** | Frankfurt, Amsterdam, London | New York | App hosting and managed PostgreSQL from one provider |
| Supabase (PostgreSQL) | Canada (Central) | Several | Several | Free plan pauses after a week idle; we would use only its database |
| Fly.io | Toronto | Frankfurt | Virginia | Managed PostgreSQL in Toronto reported; to confirm |
| Vercel (site and web app) | No function region in Canada | Frankfurt | Washington, D.C. | Static pages from its global edge |

**The options for production:**

| Option | Speed from Jamaica (round trip) | Data protection (s. 31) | Cost (production) | Change from today |
|---|---|---|---|---|
| A. US-East, on Render and Neon | Fastest: about 40-60 ms | Hardest: the US has no general federal privacy law, so this rests on the Commissioner approving our safeguards | About US$55-95 a month | None |
| B. Frankfurt, on Render and Neon | Slowest: about 110-140 ms | Easy: the EU's GDPR | About the same as A | Region only |
| **C. (rec) Toronto, on DigitalOcean** | About 50-70 ms, close to A | **Strong:** Canada has a comprehensive private-sector privacy law (PIPEDA), and the owner's Canadian company is already there (ADR 0033) | About US$25-40 a month for the API and database (§4) *(OR15)* | A new provider for the API and database; Vercel stays for the site |

**Why C.** It is nearly as fast as US-East and nearly as strong as the EU on data protection, and it costs no more —
less than A or B at launch size. The portability rule (Rule 10) is what makes the move cheap: standard PostgreSQL and a
standard container, so nothing in the code is tied to Render or Neon.

**Vercel stays, and holds no personal data** (this is what makes its lack of a Canadian region harmless):
- the web app is served as pages and code that **run in the browser**;
- the browser fetches data **directly from `api.pryvis.com`** (AP1);
- Vercel's servers never fetch or render a contractor's or client's data;
- the site's server-side functions, if any, handle only public pages.

**How "Vercel holds no personal data" is made true and checkable** *(OR12)*:
- **The web app is a static export.** It is built as plain files, and the build is checked to contain **no server
  functions at all**. That is a test a machine can run, unlike "no page fetches tenant data".
- **No proxying through Vercel:** no rewrites that forward API calls, and no middleware reading cookies.
- **Links in emails** (verification, sign-in, password reset) carry their token **after the `#`**, which browsers never
  send to a server. So no token or address reaches Vercel's request logs.
- **Vercel's analytics are off.** Any analytics added later goes into the register first.

The register keeps Vercel's row as "in transit only; nothing stored" (`docs/SERVICE-REGISTER.md`).

**Before committing to C — a short check on staging at B1**, each item pass or fail:
1. **The privilege model's migrations run unchanged on DigitalOcean's managed PostgreSQL:** creating the NOLOGIN roles,
   SECURITY DEFINER functions, forced row-level security, and the least-privilege check passing for the API's role.
   This is the item most likely to need work, because a managed database restricts some role powers.
2. **The backup role works** *(OR10)*: create a read-only role that bypasses row-level security (OP6), take a full
   dump with it, and restore that dump the way the drill does (OP6). On PostgreSQL 16 only a role that itself bypasses
   row-level security can grant that power, so a managed database may not allow it. This is as likely to fail as
   item 1.
3. **A pre-deploy step for migrations** (OP5) and **a scheduled job for the nightly backup** (OP6) are available.
4. **Object storage in Toronto** for files (A5); backups go to a different company (OP6).
5. **Prices** on DigitalOcean's own page, for the sizes chosen.
6. **R1.8's timing** measured from Jamaica.

All six items run against a **managed database cluster**, the product production uses — not App Platform's cheaper
"development database", which is a different and more restricted product *(OR10)*.

If item 1 or 2 fails and cannot be fixed within the privilege model's rules, the fallback is **B (Frankfurt)**, then
A — each recorded with its reason.

**One caveat for the s. 31 analysis** *(OR16)*: DigitalOcean is a United States company, so data it holds in Toronto
can still be reached by US legal process. Canada's law protects it in Canada, but the Commissioner should hear this
when asked (OA22). Every option on this page shares the same caveat, because all the candidate providers are US
companies.

**Development and staging:**
- **Development** is local. CI uses a PostgreSQL container inside the CI run, as `verify.yml` does today, because the
  race suite needs full database powers *(OR16)*. A free hosted database for Claude sessions is optional. None of this
  holds anything but synthetic data, so its region does not matter.
- **Staging** runs on **the same provider, products and settings as production**, at the smallest sizes — including a
  managed database cluster, not a development database *(OR10)* — so a deploy that works on staging works in
  production. Mixing providers or products between staging and production is how "it worked on staging" fails.

**This changes ADR 0030 decision 5** ("keep the current providers … Hosting region US-East"), which was written before
the Data Protection Act was read. The ADR carries a dated note pointing here once the owner approves.

**Services that still sit outside Canada**, listed for the registration and the privacy notice (s. 16(2)(g)):
- Stripe, through the Canadian company (Canada and the United States);
- Vercel (in transit only, as above);
- the transactional email provider (A6);
- error tracking (A5: an EU or Canadian data region where offered);
- GitHub, which holds code and synthetic data only — never personal data.

**Accounts.** A region is chosen per project or service, not per account, so **no new account is needed to comply**.
But every production account should be **in the business's name** — the Jamaican company, or the Canadian company for
Stripe (ADR 0033) — with the owner as administrator and MFA on (OP11). That covers DigitalOcean (new), Vercel, GitHub,
the mailbox and A5's services. Today's Render and Neon accounts are kept for the old application until K1, then closed.
If the Toronto check fails, they are reused, in the business's name, for option B.

## 4. OP3 · Hosts, plans and what they cost

**Production at the web launch, option C** (estimates; checked on DigitalOcean's page before buying):

| Piece | Plan | Why | About, per month |
|---|---|---|---|
| API (DigitalOcean App Platform, Toronto) | One always-on web service, 1-2 GB memory | Always on (ADR 0026); Nest with Prisma and a job worker in one process | US$10-25 |
| Database (DigitalOcean managed PostgreSQL, Toronto) | Single node, 1 GB to start | Daily backups and point-in-time restore included; standard PostgreSQL | US$15 |
| Website and web app (Vercel) | **Pro**, one seat | Hobby forbids commercial use | US$20 |
| Object storage, error tracking, uptime, malware scanning | Chosen in A5 | — | Mostly free tiers at launch |
| **Total, production** | | | **about US$45-60 a month**, before A5's services |

**Staging:** the same provider and products at the smallest sizes — a small web service and the smallest **managed
database cluster** *(OR10)*. About **US$20-27 a month**, from when B1 creates it.

**Development:** local, plus a free hosted database. About **US$0**.

**Before launch:** only development, and staging from B1, run — roughly **US$20-27 a month**, plus Vercel Pro and
GitHub's Team plan (OP8, about US$4 per user a month). Production is created at F3, when OA17 switches it on.

**Vercel Pro may already be due** *(OR15)*. Vercel's ban on commercial use of Hobby is generally read to cover any site
that promotes a product for sale, and pryvis.com already does (ADR 0018). The safe reading is to move to Pro **now**,
not at the pricing work. It is put to the owner as its own action (OA27).

**For comparison:** option B (Render and Neon in Frankfurt) is about US$55-95 a month in production, with staging near
US$0 on free tiers.

The old application's free deployment and its keep-warm workflow are retired with `original-app/` (K1), or earlier if
the owner prefers.

## 5. OP4 · Configuration and secrets

**Configuration decides where things run, not code** (Rule 10).

- **The API's deployment is described in a versioned file** — the host's app specification, committed to the
  repository. It defines the staging and production services from `new-app/`, in the region OP2 chooses, with every
  secret marked as set in the host's dashboard, never in the repository. Today's `render.yaml` describes the old
  application; its entry is removed
  when K1 retires it.
- **The web app's settings** — Vercel's Root Directory (`new-app/web`), its function region and its environment
  variables — are dashboard settings that cannot be versioned. They are written down in the deploy runbook (OP9), so
  they can be rebuilt from the page.
- **Every value the API needs is validated at start-up** (AP8). A missing or malformed value refuses to boot, and the
  message names the value, never its contents.

**The secrets, per environment, and who holds them** *(complete list, OR14)*:

| Secret | Held by | Never held by |
|---|---|---|
| The API's database login (the application role of the privilege model) | The API service | Anyone else |
| The **migration** credential (creates and alters tables and roles) | The pre-deploy step only (OP5) | The running API |
| The **backup** database credential (reads every row; OP6) | The backup job only | The API, staff, Claude |
| The backup job's **storage** credential (add only; OP6) | The backup job only | Everyone else |
| The backup job's **signing** key (OP6) | The backup job only | Everyone else |
| The **drill** decryption key (OP6) | Released only to an approved drill run | Everything else, between drills |
| The **disaster** decryption key (OP6) | The owner, offline, with an escrowed copy (OP11) | Every service |
| The CSRF key, the session pepper if any, the MFA sealing keys (ADR 0021) | The API service | — |
| The console's **approval-signing** key and the **GitHub App's** private key (OP8) | The production API only | Staging, GitHub, Claude |
| The **deploy** tokens for the API host and Vercel (OP5, OP8) | The production API only, used by the Deploy page | GitHub, staging, Claude |
| Stripe's keys (ADR 0033), the email key (A6), the storage keys (A5), the error-tracking key | The API service | — |
| The staging smoke tenant's login | Staging's smoke-check job | Production; it opens nothing there |

- **No key is shared between environments.** Staging has its own of everything, and **production's checks never trust
  staging's keys** — in particular, an approval signed by staging's console is worthless in production *(OR14)*.
- **No secret sits at the repository level in GitHub**, except synthetic ones used by tests *(OR5)*. A workflow on any
  pushed branch can read repository-level secrets, so none may open anything real.
- **No secret is ever pasted into a conversation with a model** (Rule 15), into the repository, or into a ticket. The
  repository's secret scanning (gitleaks, already in CI) catches the repository case.
- **Rotation** is in OP11.

**Feature flags, for staged rollouts.** A change that should reach a few tenants first is switched on by a flag:
- a **global** flag in configuration;
- or a **per-tenant** grant, which the staff console already plans through `grant_entitlement` (R1.46).

The first tenants for any staged change are the owner's own test accounts, then a few willing contractors, then
everyone. A flag is removed once the change is everywhere, so flags do not pile up.

## 6. OP5 · From a change to production: the pipeline

**Build once, then promote the same build** *(OR5)*. A container image is built **once**, by CI, from a merged commit,
and pushed to an image registry under its **digest** — a fingerprint of its exact contents. Staging and production run
that same digest. Production never builds from a branch, so it never runs code that differs from what staging tested.

**Every change takes one path, and each step must pass before the next:**

1. **A pull request.** Nothing is pushed straight to `main` (OP8).
2. **CI runs** (`.github/workflows/verify.yml`, extended): typecheck; the full test suite with real PostgreSQL; the
   checkers in `tools/`; the contract drift test; secret scanning; dependency audit; the site build.
3. **Merge gate** (OP8).
4. **CI builds the image** from the merged commit and pushes it to the registry. The digest is recorded.
5. **Staging deploys that digest**, with migrations first (step 7). The staging deploy uses the host's own GitHub
   integration, so **no staging token lives in GitHub** *(OR5)*.
6. **Smoke checks run against staging:**
   - `/health/ready` answers;
   - **a real browser** signs in at `staging.pryvis.com` through the cookie flow *(OR4)*;
   - a synthetic quote is priced and issued;
   - its share page opens on the share host.

   A pass marks the digest **ready for production**, recorded with the commit, the time and the results. A failure
   stops the line.
7. **Migrations run before the new code starts**, in the host's pre-deploy step, with the migration credential (OP4).
   - **Expand, then contract.** A migration must work with the previous version of the code still running: add a
     column, then use it in a later release; stop using one, then drop it in a later release.
   - That is what makes rolling back the code safe without rolling back the database.
   - Migrations are never edited and never run backwards (Rule 6). A bad one is corrected by a new one.
8. **Deploy gate** (OP8). The administrator approves **a ready digest** on the staff console's Deploy page. The console
   then deploys that digest to production through the host's API, and promotes the matching web build on Vercel.
   **Production never deploys automatically**:
   - the host's "deploy on push" is **off** for production;
   - Vercel's automatic production deploys from `main` are **off**, so a merged web change does not go live on its
     own *(OR4)*;
   - the API and the web are promoted **together**, from the same commit.
9. **After the production deploy:** **read-only** smoke checks — `/health/ready`, the sign-in page, and a synthetic
   tenant that **drafts** a quote and never issues it *(OR13)*. Issuing in production would create numbered, permanent
   records and could send email.

**Where production is kept apart** *(OR5)*:
- **Production lives in its own DigitalOcean team**, separate from staging. A team is the boundary for API tokens, so
  no staging token can touch production.
- The only production deploy tokens sit in the production API (OP4), used by the Deploy page.
- **The host's dashboard** can also deploy or roll back. Only the owner has access to production's team, with MFA
  (OP11), and the runbook says to use the Deploy page instead. Any dashboard deploy shows up as a version the API did not
  expect at start-up (next paragraph).

**The record** *(OR13)*. The API records its own deployment **when it starts**: the version, the digest, and the
deployment that the console's approval created. The approval itself is in the platform audit trail (R1.48). So GitHub
holds no production database credential for writing the record.

**Rolling back:**
- **Code:** the Deploy page offers the previous ready digest. It is the same approval, and is quick. The host's and
  Vercel's own rollback are the fallback in the runbook. Expand-then-contract makes this safe.
- **Data:** never by reversing a migration. A bad write is corrected by a forward fix; damaged data is restored from
  the point-in-time history or a backup (OP6), as the restore runbook says, with the erasure ledger replayed (OP1).

## 7. OP6 · Backups and restore drills

**Two layers, because they protect against different things:**

| Layer | Protects against | How | Kept |
|---|---|---|---|
| **Point-in-time restore** (the managed database) | "Undo the last few hours": a bad deploy, a mistaken bulk change | The provider's history, included in the plan; the window is confirmed when buying, and must be 35 days or less (OP1) | The plan's window |
| **Nightly backup** | **Losing the provider or the account**, or anything older than the window | A logical dump, signed and encrypted, held by **a different company** in Canada, under a lock that nobody can lift early | **35 days**, then deleted (ADR 0035) |

**The backup store is with a different company** *(OR7)*. A backup with the same provider and account as the live
database does not survive losing that account, or an attacker inside it.
- **The recommended store:** AWS S3 in its Canada (Central) region, under a separate account owned by the business.
  A5 confirms the choice and its price, which is cents a month at our size.
- **Object Lock in compliance mode, for 35 days.** Every backup is locked when written: no one — not the job, not an
  attacker, not the owner — can delete or overwrite it until the lock ends. The bucket's lifecycle rule deletes it
  after that. This is what "add but not delete or overwrite" means in practice. An ordinary upload credential could
  overwrite a file of the same name.

**How the nightly backup works:**
1. **A scheduled job in the production region** (the host's scheduled job, checked at B1, OP2) runs the dump each
   night, with the **backup database credential** (OP4).
2. It **encrypts the dump to two recipients** *(OR6)*:
   - the owner's **disaster key**, held offline;
   - a separate **drill key**, used only by the monthly drill.

   Either key can decrypt, so losing one does not lose every backup.
3. It **signs** the dump and its manifest with the job's own **signing key** *(OR7)*. Encryption to a public key is
   something anyone can do, so encryption alone cannot prove a backup came from our job. The signature can.
4. It uploads both to the locked store with an add-only credential.
5. **The manifest** beside each dump holds the date, the schema version and a row count per table. No data.
6. **It reports success to a heartbeat check** (OP7). A missed night alerts the owner. So does a newest backup older
   than 26 hours *(OR8)*.

**The backup credential is the one deliberate exception to row-level isolation.** A dump must read every tenant's
rows, so this role bypasses row-level security. That is exactly what the privilege model forbids for the API
(privilege model D4).
- **What keeps it safe:** the credential exists only in the backup job; it is read-only; it is never given to the API,
  to staff or to a model; it is rotated on the calendar (OP12).
- **The limit, stated:** the privilege model's least-privilege check verifies the API's own role at start-up, not this
  one. The backup role's attributes are checked by the drill instead (step 4 below).
- **Whether a managed database even allows this role** is OP2's check item 2.

**The monthly restore drill** — everything stays in Canada and in production's own account (OP1):
1. **An approved drill run starts** in production's team. The **drill key** is released to that run only. The disaster
   key never leaves the owner.
2. It takes the newest backup and **verifies its signature first**. An unsigned or badly signed file is refused, and
   the owner is alerted *(OR7)*. Only then is it decrypted.
3. It restores into **a separate, throwaway database cluster** — never into a database inside the production cluster
   *(OR7)*. Roles belong to a whole cluster, so restoring inside production's cluster would let a planted backup reach
   production's roles. The order *(OR19)*:
   - create the login roles first;
   - then a full restore that includes database-level settings (the dump is taken with them), so the privilege
     model's database permissions come back as they were.
4. **Check it:**
   - the schema is at the expected migration;
   - row counts match the manifest;
   - the least-privilege check passes for the application role;
   - the backup role has only the attributes it should;
   - the nightly reconciliation (A12) runs clean in a dry run.
5. **Record the result** in the operations log: the date, how long the restore took, pass or fail, and the counts. No
   data.
6. **Destroy the cluster**, and **rotate the drill key** on the schedule in OP11.

**Once a year: a full rebuild drill.** Build a new cluster from nothing — login roles, then the full restore (step 3's
order), then the checks — and decrypt with the **disaster key** this time, so that key is proven too. It shows the
region could be changed, or the provider left, if it ever had to be (Rule 10).

**If the owner's disaster key is lost** *(OR6)*: the drill key still opens every backup. If both are lost, a new pair
is made at once, and the backups made before it are unreadable. The point-in-time window still covers recent mistakes,
and full protection returns once the new pair has written backups. A sealed **escrow copy** of the disaster key (OP11)
is what prevents the second case.

**Targets for release 1** (honest for a one-person operation):
- **at most 24 hours of data lost**, and minutes within the point-in-time window;
- **back in service within 4 working hours.**

**What deletion means, with backups** (ADR 0035 §7). Data deleted from the live database remains in the
point-in-time window and in backups until they expire — at most 35 days. The privacy notice says so, and a person's
deletion request is answered with that fact. A restore replays the erasure ledger (OP1), so a restored backup does not
bring back what was erased.

## 8. OP7 · Monitoring and alerts

**What is watched, and who is told:**

| Watch | Tool | Alert when | Goes to |
|---|---|---|---|
| The API, the share host and the site are up | An uptime monitor (A5) checking `/health/ready` and the site every few minutes, from outside | Two checks fail in a row | The owner by email and phone notification |
| Errors | Error tracking (A5), with personal-data scrubbing and AP9's redacted shape, in an EU data region where offered | A new kind of error, or a sudden rise | The owner by email |
| Background jobs | The job table (AP10) | Any job in the dead-letter state; the reconciliation fails or does not run | The owner by email |
| **The nightly backup** *(OR8)* | **A heartbeat check** in the uptime monitor, pinged by each successful backup; and the age of the newest object in the backup store | **No ping by its deadline; the newest backup older than 26 hours**; a drill that refuses a backup's signature | The owner by email and phone notification |
| Money arithmetic | The nightly reconciliation (R1.24e, A12) | A mismatch | The support address (SF2) |
| The database | The provider's usage figures | 80% of a plan limit (OP10) | The owner by email |
| Spending | Each provider's spend alerts; the Claude spend cap (OA3) | 80% of a budget | The owner by email |

**No alert carries personal data.** Alerts carry identifiers, counts and error kinds (AP9).

**Who responds, honestly:**
- In release 1 that is the owner, and the second staff member once named (OA4).
- **During working hours (Jamaica time),** the target is to start on a "down" alert within an hour.
- **Outside working hours, it is best effort.** The status is told to people on the site's help page, not hidden. A
  stated, kept promise is better than an implied one that is not.
- Paid round-the-clock on-call is a later decision, with a trigger in OP10.

**What is not watched in release 1:** performance dashboards, distributed tracing, and log search beyond what the
providers include. They are added when a real problem needs them, not before.

## 9. OP8 · The three approval gates for Claude-assisted maintenance, and their interface

The owner's requirement (2026-10-02, Rule 15): Claude-assisted maintenance must have "a trigger or interface that
allows the administrator to approve it without it just running blindly". Rule 15 names three gates:
- **start** — Claude begins a task only after it is approved;
- **merge** — every change is a pull request the administrator approves, after CI;
- **deploy** — production changes only on the administrator's approval.

Each approval is recorded with who and when. And **Claude never holds production credentials** (Rule 15: "no
production write access").

**What the independent read found, and confirmed** *(OR1, OR2)*, which shapes everything below:
- **Today Claude acts on GitHub as the owner's own account, which has administrator rights.** Claude-assisted commits
  have reached `main` directly, under the owner's name. GitHub cannot tell Claude's work from the owner's, and an
  administrator can bypass any rule. **No gate can hold until Claude has its own, limited identity.**
- **GitHub's "required reviewer" for deployments works on private repositories only on its Enterprise plan.** On the
  Free, Pro and Team plans it is silently ignored once a repository is private. The owner has decided the repository
  goes private before the first paying contractor. So a deploy gate built on GitHub environments would vanish exactly
  when production starts.

### First: Claude gets its own identity, with no administrator rights *(OR1)*

- **A separate GitHub account for Claude**, owned by the business: a machine account named, say, `pryvis-claude`. It is
  a repository member with **write** access, so it can push branches and open pull requests. It has **no administrator
  role, no bypass, and it is not a code owner.**
- **Claude's sessions connect to GitHub as that account, never as the owner's.** The owner does their own GitHub work
  in their own account, directly on github.com. The exact steps to connect Claude's sessions to the machine account are
  confirmed when it is set up (OA26).
- **The default flips** *(OR1)*. Every pull request needs a start approval (below) **unless its author is on a short
  allow-list**: the owner, and Dependabot (OP11). Claude does not have to be "recognised" — anything not on the
  allow-list is treated as needing approval.

### The repository's plan *(OR2)*

| Option | Merge gate | Deploy gate | Cost |
|---|---|---|---|
| A. Keep the repository public | Works on the free plan | GitHub's required reviewer works | US$0 — but the source code is public, which the owner decided against |
| B. GitHub Enterprise | Works | GitHub's required reviewer works on a private repository | About US$21 per user a month |
| **C. (rec) A business organisation on GitHub's Team plan, with the deploy approval in our own staff console** | **Rulesets work on a private repository** | **Our Deploy page** (OP5 step 8), which needs no GitHub feature at all, and **keeps every production credential out of GitHub** | About **US$4 per user a month** |

Option C is cheaper than B, and stronger. In B the deploy credentials would still sit in GitHub. In C, GitHub cannot
deploy production at all.

### The start gate — approvals that GitHub checks through our own app *(OR3, OR9)*

| Option | For | Against |
|---|---|---|
| A. A signature checked by a CI workflow | Simple | **A pull request can change the workflow that checks it, or the public key it checks against** — the check runs the pull request's own code *(OR3)* |
| **B. (rec) A status set by our own GitHub App, from outside the pull request** | **Nothing in the pull request can change it.** A ruleset can require a status from one named app | We build a small app (B8) |
| C. A schedule that picks up tasks on its own | Hands-off | Exactly what the owner ruled out: work running blindly |

**How option B works:**
1. **Triage** (SF8) turns a ticket into a redacted task that passes the guard. It enters the **maintenance list** in the
   staff console as *proposed*. The owner can also add a task directly, and it passes the same guard.
2. **The administrator reads it** (SF8's second human check) and chooses **Approve to start**, or **Reject** with a
   reason.
3. **Approving is recorded** in the platform audit trail (R1.48): who, when, the task number, and a fingerprint of the
   exact text approved.
4. **Approving creates a working branch name** for that task, such as `claude/task-42-k7q2`, and **binds the
   approval to it**:
   - the binding expires after 14 days;
   - it is used up when that branch's pull request merges *(OR3)*;
   - one approval can therefore never be reused for other work.
5. **The administrator starts the Claude session** with the task's text and its branch name. The text goes only into
   the session: **never into git, a commit, or a pull request** *(OR9)*. The pull request carries the task number only.
   That keeps SF8's promise that a redaction miss can be deleted.
6. **Pryvis's GitHub App** — owned by the business and installed on the repository — is told by GitHub when a pull
   request opens or changes. It is a signed provider callback to our API (`docs/design/api-layer.md` AP6). Then:
   - the API checks the branch is bound to an approved task that is unexpired and unused;
   - it sets a status named `pryvis/start-approval` on the pull request: pass or fail;
   - it also notes **when a pull request changes the workflows, the checkers in `tools/`, or the code owners file**,
     because those are the files that could weaken the gates. It reads the list of changed files from GitHub itself,
     not from the pull request's code.
7. **The ruleset requires `pryvis/start-approval` from that app**, for every pull request whose author is not on the
   allow-list. A status from any other source does not count.

**Until the console and the app exist** *(OR18)*: the start gate is the administrator's explicit instruction to start
a session, and the merge gate (below) is the enforcement. This holds through the build phases, while no production data
exists. The app and the Maintenance page are built **before production is created** (F3): build step B8.

### The merge gate — a ruleset on `main` *(OR1, OR20)*

On the business organisation's **Team** plan, a ruleset on `main`:
- changes only through a pull request; **no direct pushes, by anyone**;
- **the required checks must pass**: CI (`verify.yml`) and, for pull requests needing it, `pryvis/start-approval` from
  the app;
- **an approving review from a code owner.** The owner is the code owner of the whole repository, with particular
  entries for `.github/`, `tools/` and the code owners file itself;
- **a new commit dismisses an earlier approval**, so what merges is what was approved;
- **bypass:** the owner only, and **for pull requests only** — never for a direct push. Every bypass is recorded by
  GitHub. Claude's account is never on the bypass list;
- **Claude's account** has write access only. It can submit a review, but only a code owner's review counts, so its
  approval does nothing.

**Repository settings that close the side doors** *(OR20)*:
- "Allow GitHub Actions to create and approve pull requests" is **off**;
- workflows run with **read-only permissions by default**, and each job asks for only what it needs;
- **no `pull_request_target` workflows** and **no self-hosted runners** (none exist today);
- forked pull requests get no secrets, and first-time contributors need approval to run workflows (GitHub's default,
  kept).

**The one-person case.** The owner's own pull requests, which should be rare, merge by the owner's recorded bypass.
When a second staff member is named (OA4), they review the owner's pull requests, and the bypass is removed.

### The deploy gate — the Deploy page in the staff console *(OR2, OR5)*

- **The administrator approves a ready digest** — one that passed staging's smoke checks (OP5 step 6) — on the staff
  console's **Deploy** page, signed in with MFA (ADR 0021).
- **The console deploys it**, using deploy tokens that only the production API holds (OP4), and promotes the matching
  web build on Vercel. The approval is recorded in the platform audit trail: who, when, the digest and the commit.
- **GitHub holds no production credential at all.** No workflow, branch or pull request can deploy production.
- **Migrations** run inside that approved deploy (OP5 step 7), so no database change reaches production without it.
- Production is created at F3, after the console exists (B8), so **production never exists without this gate**.

### What the administrator sees, and what is recorded

| Gate | Where they approve | Recorded by |
|---|---|---|
| Start | The staff console's **Maintenance** page | The platform audit trail: who, when, the task, the fingerprint, the bound branch |
| Merge | The pull request on GitHub | GitHub's review record; bypasses recorded too |
| Deploy | The staff console's **Deploy** page | The platform audit trail: who, when, the digest, the commit; the API records its own start (OP5) |

**Claude's limits, in one place:**
- **Its own GitHub account, with write access only** — no administrator rights and no bypass.
- **Synthetic data only** (Rule 15). Claude never sees production data, and never holds a production secret.
- **Its spend has a monthly cap** (OA3), and **a lighter model is used for routine tasks** (Rule 15).
- **Every change it makes is a pull request** that the administrator approves.

**Emergencies use the same three gates, done quickly.** There is no "skip the gates" switch. The fastest path — a
small pull request, CI, the review, the deploy from the console on a phone — is written into the deploy runbook (OP9).

## 10. OP9 · Runbooks

**What a runbook is:** short, numbered steps, kept in a `runbooks` folder under `docs/` (created with the first runbook), written so that someone tired, at night, can
follow them without guessing. Each one is **rehearsed before launch (F3)**, and again after any change to what it
covers.

| Runbook | Covers |
|---|---|
| **Deploy and roll back** | The OP5 path; the emergency path; rolling back code on the API host and Vercel; the dashboard-only settings (OP4) needed to rebuild a service from scratch |
| **Restore** | Point-in-time restore; restoring from a nightly backup at the second company; the drill (OP6); deciding which one a situation needs; **replaying the erasure ledger** before restored data is used (OP1) |
| **Recover the backup keys** | Using the drill key if the disaster key is lost; opening the escrowed disaster key; making a new key pair (OP6, OP11) |
| **Rotate a key** | Each secret in OP4: how to create the new one, deploy it, retire the old one, and confirm nothing still uses it. That includes the MFA sealing keys' order (ADR 0021) and the backup key pair |
| **Offboard a staff member, the same day** | Remove their platform capabilities; end their sessions (the version bump, ADR 0013); remove them from GitHub, the providers and the mailbox; rotate any secret they could have seen; record it all |
| **Respond to a breach** | The steps and templates of A11, with the 72-hour clocks to the Commissioner and to each person (ADR 0035) |
| **A provider is down** | What to tell contractors, where; what still works; when to restore elsewhere (OP6's rebuild drill makes this possible) |
| **Measure the proxy hops** | AP8's `trust proxy` setting: deploy the probe on staging, read the forwarded chain, set the value and record the evidence |

## 11. OP10 · Rule 10's trigger

Rule 10: "an ADR records the free-tier setup and the trigger for moving to paid — a concrete threshold, and the
expected paid equivalent". Finding PA7 asked for it for **every** free-tier piece. This table is that record. ADR
approval of this design makes it the ADR.

**The general rule:** watch each limit, and act at **80% for two weeks running**. A limit reached by surprise is an
outage.

| Piece | Free or starting plan | Its limit | Move up when | To | About |
|---|---|---|---|---|---|
| Website and web app (Vercel) | Hobby | Hobby forbids commercial use | **Now** — the site already promotes a product *(OR15)* | Pro, one seat | US$20 a month |
| The repository (GitHub) | A personal account | No rulesets on a private repository; no organisation | **Before B1's first code** — the gates need it (OP8) | A business organisation on the **Team** plan | About US$4 per user a month |
| CI database | A PostgreSQL container inside each CI run *(OR16)* | None that matters | — | — | US$0 |
| A hosted development database (optional) | A provider's free plan | About 0.5 GB and limited compute | 80% of storage or compute | That provider's pay-as-you-go plan | About US$5 a month |
| Staging (API and database) | The smallest sizes, including a managed database cluster (OP3) | Small memory and storage | Staging tests fail for size, not code | One size up | About US$10 a month more |
| Production database | 1 GB single node | Storage and CPU | 70% of storage, or CPU above 70% for a week | The next size | About US$30 a month |
| Production database, failover | None: a single node, with backups (OP6) | One machine | An outage longer than the 4-hour target, or **50 paying contractors** | A standby node (high availability) | About double the database's cost |
| Production API | 1-2 GB, one instance | Memory, CPU | Memory above 80%, or response times above target for a week | More memory, or a second instance | US$10-25 a month more |
| Backup store (OP6) | Pay per gigabyte; cents at our size | — | — | — | Cents a month; A5 confirms |
| Error tracking (A5) | Free plan | Events a month | 80% for two months | The paid plan | Priced in A5 |
| Uptime monitor and heartbeat (A5) | Free plan | Number of checks, alert channels | More checks needed, or phone alerts wanted | The paid plan | Priced in A5 |
| Object storage for files (A5) | Free allowance | Stored gigabytes | 80% | Pay per gigabyte | Priced in A5 |
| CI minutes (GitHub Actions) | The plan's monthly allowance for a private repository | Minutes a month | 80% for two months | Paid minutes | A few dollars a month |
| Claude-assisted maintenance | **Not free:** a monthly cap (OA3) | The cap | 80% of the cap, by alert | The owner raises the cap, or the work waits | The owner's choice |
| Round-the-clock response | Working hours only (OP7) | One person | A paying contractor needs a stated response time, or **50 paying contractors** | A paid on-call arrangement, or a second responder | Decided then |

**Recorded each quarter** (OP12): each row's current use, in the operations log.

## 12. OP11 · Security operations

**Accounts:**
- **Every production account is in the business's name**, with the owner as administrator (OP2's accounts paragraph):
  the API host (a **separate team for production**, OP5), the database, the backup store, Vercel, the GitHub
  organisation, the domain registrar (GoDaddy), the mailbox, Stripe and A5's services.
- **Every one has multi-factor sign-in turned on.** That includes **the domain registrar.** Whoever controls the domain
  controls the email, the cookies and the share links, so the domain is the single most valuable account. Its
  **registrar lock** is also turned on.
- **No shared logins.** Each person has their own account, so access can be removed for one person (OP9's offboarding).
- **Claude has its own GitHub account, with write access only** (OP8). It holds no other credential.

**Keeping the most important secrets safe** *(OR6)*:
- **Recovery codes** for the accounts, and **the backup disaster key**, are kept **in different places.** One theft or
  fire must not take both.
- **"Offline" means offline.** A password manager that syncs to the cloud is not offline. The disaster key is kept on
  paper or an offline device, and **an escrowed copy** is sealed with the attorney or with the second staff member
  once named (OA4). Either one is enough to restore.

**Keys** — every secret of OP4, and when it is rotated *(OR14)*:

| Key | Rotated |
|---|---|
| Application secrets (the CSRF key, the session pepper if any, provider keys) | Yearly; **at once** if exposure is suspected; when a person who could have seen them leaves |
| Database passwords (the API's, migration and backup credentials) | Yearly, and on the same events |
| MFA sealing keys (ADR 0021) | Yearly, by the prepend-and-retire method its runbook describes |
| The console's approval-signing key, and the GitHub App's private key (OP8) | Yearly, and on the same events |
| The deploy tokens (the API host and Vercel) | Yearly, and on the same events |
| The backup storage credential and the backup signing key | Yearly |
| The drill key (OP6) | After each drill's year of use, or at once if a drill run is suspected of exposure |
| The disaster key (OP6) | Every two years. Backups expire within 35 days, so the old key is destroyed 35 days after the switch |

**Dependencies:**
- **Automated update pull requests** (GitHub's Dependabot), weekly and grouped. They are ordinary pull requests, so
  they pass CI and the merge gate (OP8). Dependabot is on the allow-list, so they need no start approval, but they
  still need the owner's review. Security updates are flagged for the same week.
- **The dependency audit in CI becomes blocking** for high and critical advisories in production dependencies, at B2
  (it is advisory today, `docs/SERVICE-REGISTER.md` §4).
- **Secret scanning (gitleaks)** stays in CI, over the full history.

## 13. OP12 · The operations calendar

**Kept in the owner's calendar, with reminders.** Each result — pass or fail, counts, never data — is written to the
operations log, a dated file in the repository created with the first entry.

| When | What | Where it is defined |
|---|---|---|
| Nightly (automatic) | The backup; the reconciliation | OP6; R1.24e |
| Weekly, Mondays | Support triage; dependency pull requests | SF8; OP11 |
| Monthly | **The restore drill**; review alerts, spend and backup listings | OP6; OP7 |
| Quarterly | Who has access to what; Rule 10's figures | OP11; OP10 |
| By **31 March** each year | **The data protection impact assessment** for the previous year | Act s. 45; ADR 0035 |
| Yearly | The full rebuild drill, **with the disaster key**; key rotation; **checking the escrowed key is intact**; rehearsing the runbooks; reviewing the retention policy (Disposal Regs 2(1)(a)); reviewing this design | OP6; OP11; OP9; ADR 0035 |
| By **1 December** each year | **Renewing Pryvis's registration** with the Information Commissioner, and the Canadian company's if it is registered | Registration Regs 3(3)(b); OA23 |
| Within **14 days** of a change | Telling the Commissioner of a change in the registration particulars — a new provider or country counts (OP2) | Registration Regs 3(4) |

## 14. What gets built, tests, what this does not do, and sources

**What gets built, and in what order** *(OR18)*:
- **B4 — the GitHub foundation, before B1's first code:**
  - the business organisation on the Team plan;
  - Claude's own account with write access only, and the owner's account no longer connected to Claude's sessions
    (OP8);
  - the ruleset on `main`, the code owners file, and the repository settings that close the side doors (OP8).

  Nothing is written to `main` by Claude after this, except through a reviewed pull request. Only the owner can set
  these up, so each is an owner action: OA25-OA28, with OA1 and OA2 *(OR17)*.
- **B1 — environments:**
  - the Toronto check, all six items (OP2), then staging on the chosen provider, in its own team;
  - the app specification file (OP4);
  - the staging addresses, including `staging.pryvis.com` (OA2);
  - the non-production database with synthetic seed data;
  - the web app as a static export, with its check (OP2).
- **B2 — start-up and pipeline:**
  - API start-up (A2's AP8);
  - CI extended (OP5 step 2), with the audit blocking (OP11);
  - build once into the registry;
  - staging deploys of the digest with migrations first;
  - the browser smoke checks;
  - Vercel's automatic production deploys turned off.
- **B3 — monitoring and resilience:**
  - error tracking and the uptime monitor, with the backup heartbeat (A5, OP7);
  - the job alerts;
  - the backup job, the locked store at the second company, and the signing key and two encryption keys;
  - **the first restore drill — rehearsed on staging, with the same providers and settings as production**;
  - the runbooks (OP9).
- **B8 — the console's gates** (new step, after B7's staff MFA, before F3): the Maintenance page, the Pryvis GitHub App
  and its `pryvis/start-approval` status, the Deploy page, and the API recording its own deployment (OP8, OP5).
- **At F3**, production is created in its own team, and **the first production backup and restore drill run before
  any real contractor arrives** (F4).

**Tests, each proved with a planted defect:**
- **Production data stays in production:** the non-production database holds only seeded synthetic tenants. Plant: a
  real-looking email domain in the seed — the seed check fails.
- **Vercel holds no tenant data:** the web build contains no server functions, and no rewrite or middleware proxies the
  API *(OR12)*. Plant: one server-rendered page — the build check fails.
- **The start gate** *(OR3)*:
  - a pull request from a non-allow-listed author, on a branch with no approval, gets a failing
    `pryvis/start-approval`;
  - an approval is refused on a second branch, after its pull request has merged, and after 14 days;
  - a `pryvis/start-approval` status set by anything but our app does not satisfy the ruleset.

  Plants: a pull request reusing a merged task's branch binding; an expired binding; a status posted with an ordinary
  token.
- **The merge gate:** a direct push to `main` is refused, even by the owner; Claude's account cannot merge; and an
  approval is dismissed by a new commit. This is checked once, by hand, at B4 and recorded, because it is GitHub's
  setting rather than our code.
- **The deploy gate:**
  - **no GitHub workflow holds a production credential.** A test lists the repository's and environments' secrets and
    fails on any production one;
  - only a digest marked ready by staging can be deployed from the console.

  Plants: a production token added to the repository's secrets; a deploy request for an unmarked digest.
- **Backups** *(OR6, OR7, OR8)*:
  - the store refuses deletion or overwrite during the lock;
  - a dump with a bad signature is refused by the drill;
  - either key decrypts;
  - a missed night raises the heartbeat alert.

  Plants: a delete with the job's credential; a dump re-signed with another key; the schedule disabled.
- **The drill restores into its own cluster**, in the order of OP6 step 3, and its least-privilege check passes on the
  restored database *(OR19)*.
- **Migrations are expand-then-contract** *(OR19)*: the previous release's API test suite — excluding the schema
  snapshot test, which by design fails against any newer migration — runs against the new schema. Plant: a migration
  dropping a column the previous release reads.
- **Erasure survives a restore** *(OR11)*: an erased client is absent after restoring a backup made before the
  erasure. Plant: the ledger replay skipped.
- **Alerts:** a planted dead-letter job and a missed backup each raise an alert, with no personal data in it.

**What this does not do (Rule 21.4):**
- It does not choose the storage, error-tracking, uptime or malware-scanning services — A5 does, within OP2's region
  rule, OP6's second-company rule and OP10's thresholds.
- It does not design the breach response's content — A11 does. OP9 only lists its runbook.
- **It does not make Pryvis highly available.** One database node and one API instance mean a provider fault is an
  outage, recovered within the 4-hour target. Failover is OP10's trigger.
- It does not offer round-the-clock response (OP7).
- It does not settle the legal question. Toronto makes the transfer case strong, not certain. All candidate providers
  are US companies (OP2), and the Commissioner's answer (OA22) and the attorney decide.
- **The Toronto check (OP2) may fail** on the privilege model's role powers, or on the backup role. Then option B is
  the plan, as OP2 says.
- **Before B8, the start gate is the administrator's instruction, not a machine check** (OP8). That is acceptable only
  because no production data exists until F3.
- **The read could not reach DigitalOcean's, Vercel's or GitHub's websites**, so several provider capabilities are
  confirmed at B1 and B4, not now: role powers, Object Lock, scheduled jobs, team-scoped tokens, and rulesets on the
  Team plan.

**Sources** (checked 2026-10-06; prices from third-party summaries, to be confirmed on each vendor's page):
- Render: [regions](https://render.com/docs/regions); pricing
  ([costbench](https://costbench.com/software/developer-tools/render/),
  [makerkit](https://makerkit.dev/pricing-calculator/render)).
- Neon: [regions](https://neon.com/docs/introduction/regions); [pricing](https://neon.com/pricing),
  [jetadmin](https://www.jetadmin.io/blog/neon-pricing/).
- Vercel: Hobby's commercial restriction and Pro's price
  ([makerkit](https://makerkit.dev/blog/saas/vercel-cost), [schematic](https://schematichq.com/blog/vercel-pricing));
  [function regions](https://vercel.com/docs/functions/regions).
- DigitalOcean: pricing ([kuberns](https://kuberns.com/blogs/digitalocean-pricing/),
  [infratally](https://infratally.com/articles/digitalocean-managed-postgresql-pricing-2026-billing-model/)); Toronto
  availability is confirmed at B1.
- Supabase: [regions](https://supabase.com/docs/guides/platform/regions);
  [free plan](https://costbench.com/software/database-as-service/supabase/free-plan/).
- Fly.io: [regions](https://fly.io/docs/reference/regions); [managed PostgreSQL](https://fly.io/docs/mpg).

## 15. The independent read, and where each finding is answered

Read by Opus from `docs/briefs/2026-10-06-operations-design-read.md` at `67906dc`.
- **Verdict:** "sound after the named changes".
- **Findings:** 20, of which **2 are blockers**, 8 major and 10 minor. Each is answered above.
- **Its own view of each recommendation:**
  - it agreed with OP1, OP2, OP4, OP7, OP9, OP10, OP11 and OP12;
  - it disagreed, at least in part, with OP3, OP5, OP6 and OP8.

  Each disagreement is adopted.

The two blockers were confirmed against the repository and GitHub's own documentation:
- Claude has been acting as the owner's administrator account;
- GitHub's deploy approval disappears on a private repository below Enterprise.

| Finding | Severity | Answered in |
|---|---|---|
| OR1 · Claude acts as the owner's administrator account, so no gate holds | blocker | OP8, Claude's own identity and the allow-list; B4 first; OA26 |
| OR2 · GitHub's deploy approval disappears on a private repository below Enterprise | blocker | OP8, the repository's plan (option C) and the console's Deploy page; OA25 |
| OR3 · the signature check can be defeated from the pull request, and replayed | major | OP8's start gate, option B: our app's status, bound to one branch, single use, expiring |
| OR4 · Vercel deploys `main` on its own; the preview address breaks the cookie rules | major | OP5 step 8; OP1's `staging.pryvis.com`; the browser smoke check |
| OR5 · no "exact commit" mechanism; side doors to production | major | OP5: build once, the digest, production in its own team, no repository-level secrets |
| OR6 · the drill needs the offline key; losing it loses every backup | major | OP6, two recipients; OP11, escrow and separate storage |
| OR7 · same-provider backups; no real write-once; unsigned dumps restored inside production | major | OP6: a second company, Object Lock, signed dumps, a throwaway cluster |
| OR8 · a backup that never runs goes unnoticed | major | OP6 step 6; OP7's heartbeat row |
| OR9 · the task text would land in git | major | OP8 step 5: the text goes only to the session |
| OR10 · staging on a different database product; the backup role untested | major | OP2, check item 2 and the managed-cluster note; OP3 |
| OR11 · deletion and "no copies" claims incomplete | minor | OP1's copies table and the erasure ledger; OP6 |
| OR12 · the Vercel test proves too little | minor | OP2: a static export, tokens after `#`, no analytics |
| OR13 · production smoke checks issue documents; credentials in GitHub | minor | OP5 step 9 and the record |
| OR14 · keys missing from the inventory and rotation | minor | OP4's table; OP11's table |
| OR15 · costs do not add up; Vercel Pro may be due now | minor | OP2's table; OP3; OP10; OA27 |
| OR16 · Render, Neon and the US still assumed elsewhere; CI's database; the US-company caveat | minor | OP2; OP10; pointers in the API design, the data-protection reading, the threat model and the register |
| OR17 · owner actions missing | minor | `docs/OWNER-ACTIONS.md`: OA1, OA2, OA25-OA28 |
| OR18 · the build order leaves gaps | minor | §14's order: B4 first, the new B8, the drill rehearsed on staging and run at F3 |
| OR19 · the drill and rollback tests would not work as worded | minor | OP6 step 3; §14's tests |
| OR20 · unstated GitHub hardening | minor | OP8, "Repository settings that close the side doors" |
