# Design: environments and operations — where Pryvis runs, how it is changed, and how it is kept safe

**Status: DRAFT, for the owner's approval** (written section by section and saved as it went, at the owner's request, 2026-10-06). Build plan step
A4 (`docs/BUILD-PLAN.md`). After approval: an independent read, a closing check, then the owner's sign-off ticks A4.
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
- **Restore drills** (OP6) restore into an isolated, short-lived target inside the production project, run their checks
  and are destroyed. Their results hold counts and pass/fail, never data.

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
| Website and web app | `pryvis.com` | a Vercel preview address, protected by Vercel's deployment protection |
| API | `api.pryvis.com` | `api.staging.pryvis.com` |
| Share page | `share.pryvis.com` | `share.staging.pryvis.com` |

The staging hosts need the same cookie rules as production (AP1-AP2): staging pages call `api.staging.pryvis.com`
from a staging web origin. The two staging DNS records join OA2.

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
| **C. (rec) Toronto, on DigitalOcean** | About 50-70 ms, close to A | **Strong:** Canada has a comprehensive private-sector privacy law (PIPEDA), and the owner's Canadian company is already there (ADR 0033) | About US$30-45 a month for the API and database (§4) | A new provider for the API and database; Vercel stays for the site |

**Why C.** It is nearly as fast as US-East and nearly as strong as the EU on data protection, and it costs no more —
less than A or B at launch size. The portability rule (Rule 10) is what makes the move cheap: standard PostgreSQL and a
standard container, so nothing in the code is tied to Render or Neon.

**Vercel stays, and holds no personal data** (this is what makes its lack of a Canadian region harmless):
- the web app is served as pages and code that **run in the browser**;
- the browser fetches data **directly from `api.pryvis.com`** (AP1);
- Vercel's servers never fetch or render a contractor's or client's data;
- the site's server-side functions, if any, handle only public pages.

The register keeps Vercel's row as "in transit only; nothing stored" (`docs/SERVICE-REGISTER.md`), and B1 adds a test
that fails if a web page fetches tenant data on the server.

**Before committing to C — a short check on staging at B1**, each item pass or fail:
1. **The privilege model's migrations run unchanged on DigitalOcean's managed PostgreSQL:** creating the NOLOGIN roles,
   SECURITY DEFINER functions, forced row-level security, and the least-privilege check passing for the API's role.
   This is the item most likely to need work, because a managed database restricts some role powers.
2. **A pre-deploy step for migrations** (OP5) and **a scheduled job for the nightly backup** (OP6) are available.
3. **Object storage in Toronto** for files and backups (A5), or another Canadian store.
4. **Prices** on DigitalOcean's own page, for the sizes chosen.
5. **R1.8's timing** measured from Jamaica.

If item 1 fails and cannot be fixed within the privilege model's rules, the fallback is **B (Frankfurt)**, then A —
each recorded with its reason.

**Development and staging:**
- **Development** is local, plus a free hosted database for Claude sessions and CI. Its region does not matter
  (synthetic data only).
- **Staging** runs on **the same provider and settings as production**, at the smallest sizes, so a deploy that works on
  staging works in production. Mixing providers between staging and production is how "it worked on staging" fails.

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

**Staging:** the same provider at the smallest sizes — a small web service and a development database. About
**US$12 a month**, from when B1 creates it.

**Development:** local, plus a free hosted database. About **US$0**.

**Before launch:** only development, and staging from B1, run — roughly **US$12 a month plus Vercel Pro**. That is the
only cost before F3. Vercel Pro can wait until the site carries commercial content: the marketing site's price list
counts, so the switch is due with the pricing work (OA13). Production is created at F3, when OA17 switches it on.

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

**The secrets, per environment, and who holds them:**

| Secret | Held by | Never held by |
|---|---|---|
| The API's database login (the application role of the privilege model) | The API service | Anyone else |
| The **migration** credential (creates and alters tables and roles) | The pre-deploy step only (OP5) | The running API |
| The **backup** credential (reads every row; OP6) | The backup job only | The API, staff, Claude |
| The CSRF key, the session-token hash pepper if any, the MFA sealing keys (ADR 0021) | The API service | — |
| Stripe's keys (ADR 0033), the email key (A6), the storage keys (A5), the error-tracking key | The API service | — |
| The backup **decryption** key (OP6) | The owner, offline and in a password manager | Every service; the backup job holds only the **public** key, so it can encrypt but never read |

- **No key is shared between environments.** Staging has its own of everything.
- **No secret is ever pasted into a conversation with a model** (Rule 15), into the repository, or into a ticket. The
  repository's secret scanning (gitleaks, already in CI) catches the repository case.
- **Rotation** is in OP11.

**Feature flags, for staged rollouts.** A change that should reach a few tenants first is switched on by a flag:
- a **global** flag in configuration;
- or a **per-tenant** grant, which the staff console already plans through `grant_entitlement` (R1.46).

The first tenants for any staged change are the owner's own test accounts, then a few willing contractors, then
everyone. A flag is removed once the change is everywhere, so flags do not pile up.

## 6. OP5 · From a change to production: the pipeline

**Every change takes one path, and each step must pass before the next:**

1. **A pull request.** Nothing is pushed straight to `main`.
2. **CI runs** (`.github/workflows/verify.yml`, extended): typecheck; the full test suite with real PostgreSQL; the
   checkers in `tools/`; the contract drift test; secret scanning; dependency audit; the site build.
3. **Merge gate.** The administrator approves the pull request (OP8). Only then can it merge to `main`.
4. **Staging deploys automatically** from `main`, with migrations first (step 6).
5. **Smoke checks** run against staging automatically:
   - `/health/ready` answers;
   - a synthetic contractor signs in;
   - a synthetic quote is priced and issued;
   - its share page opens on the share host.

   A failure stops the line.
6. **Migrations run before the new code starts**, in the host's pre-deploy step, with the migration credential (OP4).
   - **Expand, then contract.** A migration must work with the previous version of the code still running: add a
     column, then use it in a later release; stop using one, then drop it in a later release.
   - That is what makes rolling back the code safe without rolling back the database.
   - Migrations are never edited and never run backwards (Rule 6). A bad one is corrected by a new one.
7. **Deploy gate.** A workflow, `deploy-production`, deploys **the exact commit that passed staging**, and only after
   the administrator approves it (OP8). Production never deploys automatically.
8. **After the production deploy:** the same smoke checks run against production, using a dedicated synthetic test
   tenant that holds no real data.

**Rolling back:**
- **Code:** the host's "roll back to the previous deploy", and Vercel's instant rollback. Both are one action, and both
  are in the runbook. Expand-then-contract makes this safe.
- **Data:** never by reversing a migration. A bad write is corrected by a forward fix; damaged data is restored from
  the point-in-time history or a backup (OP6), as the restore runbook says.

**The record:** GitHub records who approved each merge and each production deploy, and when. The deploy workflow
also writes a line to the platform audit trail (R1.48): the commit, the approver and the time.

## 7. OP6 · Backups and restore drills

**Two layers, because they protect against different things:**

| Layer | Protects against | How | Kept |
|---|---|---|---|
| **Point-in-time restore** (the managed database) | "Undo the last few hours": a bad deploy, a mistaken bulk change | The provider's history, included in the plan; the window is confirmed when buying | The plan's window |
| **Nightly backup** | Losing the provider, the project, or anything older than the window | A logical dump (`pg_dump`), encrypted, in object storage in the same country (A5) | **35 days**, then deleted (ADR 0035) |

**How the nightly backup works:**
1. A **scheduled job inside the production region** (the host's scheduled job, checked at B1, OP2) runs the dump each night, with the **backup
   credential** (OP4).
2. It **encrypts the dump with the owner's public key** before it leaves the job. The job cannot decrypt what it
   wrote; only the owner's offline key can.
3. It writes to a bucket where its credential can **add but not delete or overwrite**. An attacker holding that
   credential cannot erase the backups. The bucket's own lifecycle rule deletes each copy at 35 days.
4. It writes a small **manifest** beside each dump: the date, the schema version, and a row count per table. No data.
5. A failure alerts the owner (OP7).

**The backup credential is the one deliberate exception to row-level isolation.** A dump must read every tenant's
rows, so this role bypasses row-level security. That is exactly what the privilege model forbids for the API
(privilege model D4).
- **What keeps it safe:** the credential exists only in the backup job; it is read-only; it is never given to the API,
  to staff or to a model; it is rotated on the calendar (OP12).
- **The limit, stated:** the privilege model's least-privilege check verifies the API's own role at start-up, not this
  one. So the backup role's attributes are checked by the restore drill instead (step 3 below).

**The monthly restore drill:**
1. Take the **latest nightly dump**, and decrypt it with the owner's key, in a short-lived job.
2. Restore it into a **temporary database inside the production project**. It never goes to staging or development
   (OP1).
3. **Check it:**
   - the schema is at the expected migration;
   - row counts match the manifest;
   - the least-privilege check passes for the application role;
   - the backup role has only the attributes it should;
   - the nightly reconciliation (A12) runs clean in a dry run.
4. **Record the result** in the operations log: the date, how long the restore took, pass or fail, and the counts. No
   data.
5. **Destroy the temporary database.**

**Once a year: a full rebuild drill.** Build a new project from nothing — migrations, then the latest dump, then the
checks. It proves the region could be changed, or the provider left, if it ever had to be (Rule 10).

**Targets for release 1** (honest for a one-person operation):
- **at most 24 hours of data lost**, and minutes within the point-in-time window;
- **back in service within 4 working hours.**

**What deletion means, with backups** (ADR 0035 §7). Data deleted from the live database remains in the
point-in-time window and in backups until they expire — at most 35 days. The privacy notice says so, and a person's
deletion request is answered with that fact.

## 8. OP7 · Monitoring and alerts

**What is watched, and who is told:**

| Watch | Tool | Alert when | Goes to |
|---|---|---|---|
| The API, the share host and the site are up | An uptime monitor (A5) checking `/health/ready` and the site every few minutes, from outside | Two checks fail in a row | The owner by email and phone notification |
| Errors | Error tracking (A5), with personal-data scrubbing and AP9's redacted shape, in an EU data region where offered | A new kind of error, or a sudden rise | The owner by email |
| Background jobs | The job table (AP10) | Any job in the dead-letter state; the nightly backup or reconciliation fails or does not run | The owner by email |
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

### The start gate — a task list in the staff console

| Option | For | Against |
|---|---|---|
| **A. (rec) The maintenance list in the staff console, with a signed approval** | The list SF8 feeds already lives there, redacted and deletable. Approval is a recorded act by a named person. A signature lets CI **verify** that Claude's work traces to an approved task, so the gate is enforced, not just recorded | We build one page and a small signing step |
| B. GitHub issues with an "approved" label | Nothing to build | Anyone with triage rights can add a label, including an automated account, so the gate is not enforced. It copies the task text into another system |
| C. A schedule that picks up tasks on its own | Hands-off | Exactly what the owner ruled out: work running blindly |

**How option A works:**
1. **Triage** (SF8) turns a ticket into a redacted task that passes the guard. It enters the **maintenance list** as
   *proposed*. The owner can also add a task directly — a dependency update, an idea of their own — and it passes the
   same guard.
2. **The administrator reads the task** — which is also SF8's second human check — and chooses **Approve to start**
   or **Reject**, with a reason.
3. **Approving is recorded** in the platform audit trail (R1.48): who, when, the task's number, and a fingerprint of
   the exact text approved.
4. **Approving produces a brief:** the task's text, its number, and an **approval signature**. The console signs these
   with a private key that only it holds.
5. **The administrator starts the Claude session** with that brief. In release 1 the administrator starts the session
   themselves, which is itself part of the gate. Nothing starts a session automatically.
6. **Claude's pull request carries the task number and the signature.** A CI check verifies the signature against the
   console's **public** key, which is committed in the repository.
   - A pull request from Claude without a valid signature for an approved task **fails CI**, and cannot merge.
   - A pull request whose task text no longer matches the approved fingerprint fails too.
   - The owner's own pull requests are not Claude's work, and do not need a signature.

The signature proves an approved task **existed**. It does not prove the change stays within the task. That is what the
merge gate's review is for.

### The merge gate — GitHub's branch protection

Set on `main` as a GitHub ruleset:
- changes only through a pull request; no direct pushes;
- **the required CI checks must pass**, including step 6's signature check for Claude's pull requests;
- **one approving review from the administrator**, named as code owner of the whole repository;
- **a new commit dismisses an earlier approval**, so what merges is what was approved;
- **Claude's GitHub app can push branches and open pull requests, and nothing more.** It cannot approve, merge, bypass
  the rules, or change them.

**The one-person case.** GitHub does not let anyone approve their own pull request. The administrator's own pull
requests — which should be rare — merge through the administrator's **bypass**, which GitHub records. Claude's pull
requests always need the administrator's review. When a second staff member is named (OA4), they review the
administrator's pull requests, and the bypass is removed.

### The deploy gate — a GitHub environment

- The `deploy-production` workflow (OP5) runs in a GitHub **environment** named `production`, with the administrator
  as **required reviewer**. The workflow waits until they approve it in GitHub.
- **Production's deploy credentials are secrets of that environment.** They exist only for an approved run, so
  nothing else — no other workflow, no Claude session — can deploy.
- Only `main` may deploy to production, and only a commit that passed staging.
- **Migrations** run inside the same approved deploy (OP5 step 6), so no database change reaches production without
  this approval.

### What the administrator sees, and what is recorded

| Gate | Where they approve | Recorded by |
|---|---|---|
| Start | The staff console's **Maintenance** page | The platform audit trail: who, when, the task, the fingerprint |
| Merge | The pull request on GitHub | GitHub's review record |
| Deploy | The deployment request on GitHub (it can be approved from the GitHub mobile app) | GitHub's deployment record, and a line in the platform audit trail written by the workflow |

**Claude's limits, in one place:**
- **Synthetic data only** (Rule 15). Claude never sees production data, and never holds a production secret.
- **Its spend has a monthly cap** (OA3), and **a lighter model is used for routine tasks** (Rule 15).
- **Every change it makes is a pull request** that a person approves.

**Emergencies use the same three gates, done quickly.** There is no "skip the gates" switch. The fastest path — a
small pull request, CI, approval, the deploy approval from a phone — is written into the deploy runbook (OP9).

## 10. OP9 · Runbooks

**What a runbook is:** short, numbered steps, kept in a `runbooks` folder under `docs/` (created with the first runbook), written so that someone tired, at night, can
follow them without guessing. Each one is **rehearsed before launch (F3)**, and again after any change to what it
covers.

| Runbook | Covers |
|---|---|
| **Deploy and roll back** | The OP5 path; the emergency path; rolling back code on the API host and Vercel; the dashboard-only settings (OP4) needed to rebuild a service from scratch |
| **Restore** | Point-in-time restore; restoring from a nightly backup; the drill (OP6); deciding which one a situation needs |
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
| Website and web app (Vercel) | Hobby, until commercial content | Hobby forbids commercial use | **The site shows prices or takes sign-ups** — a rule, not a threshold | Pro, one seat | US$20 a month |
| Development database | A provider's free plan | About 0.5 GB and limited compute | 80% of storage or compute | That provider's pay-as-you-go plan | About US$5 a month |
| Staging (API and database) | The smallest paid sizes on the production provider (OP3) | Small memory and storage | Staging tests fail for size, not code | One size up | About US$10 a month more |
| Production database | 1 GB single node | Storage and CPU | 70% of storage, or CPU above 70% for a week | The next size | About US$30 a month |
| Production database, failover | None: a single node, with backups (OP6) | One machine | An outage longer than the 4-hour target, or **50 paying contractors** | A standby node (high availability) | About double the database's cost |
| Production API | 1-2 GB, one instance | Memory, CPU | Memory above 80%, or response times above target for a week | More memory, or a second instance | US$10-25 a month more |
| Error tracking (A5) | Free plan | Events a month | 80% for two months | The paid plan | Priced in A5 |
| Uptime monitor (A5) | Free plan | Number of checks, alert channels | More checks needed, or phone alerts wanted | The paid plan | Priced in A5 |
| Object storage (A5) | Free allowance | Stored gigabytes | 80% | Pay per gigabyte | Priced in A5 |
| CI minutes (GitHub Actions) | The monthly free allowance for a private repository | Minutes a month | 80% for two months | Paid minutes | A few dollars a month |
| Claude-assisted maintenance | **Not free:** a monthly cap (OA3) | The cap | 80% of the cap, by alert | The owner raises the cap, or the work waits | The owner's choice |
| Round-the-clock response | Working hours only (OP7) | One person | A paying contractor needs a stated response time, or **50 paying contractors** | A paid on-call arrangement, or a second responder | Decided then |

**Recorded each quarter** (OP12): each row's current use, in the operations log.

## 12. OP11 · Security operations

**Accounts:**
- **Every production account is in the business's name**, with the owner as administrator (OP2's accounts paragraph):
  hosting, database, Vercel, GitHub, the domain registrar (GoDaddy), the mailbox, Stripe and A5's services.
- **Every one has multi-factor sign-in turned on.** That includes **the domain registrar.** Whoever controls the domain
  controls the email, the cookies and the share links, so the domain is the single most valuable account. Its
  **registrar lock** is also turned on.
- **Recovery codes are kept offline**, with the backup decryption key (OP6).
- **No shared logins.** Each person has their own account, so access can be removed for one person (OP9's offboarding).
- **Claude's GitHub app** can push branches and open pull requests, and nothing more (OP8). Claude holds no other
  credential.

**Keys** (the secrets of OP4):

| Key | Rotated |
|---|---|
| Application secrets (the CSRF key, the session pepper if any, provider keys) | Yearly; **at once** if exposure is suspected; when a person who could have seen them leaves |
| Database passwords (the API's, migration and backup credentials) | Yearly, and on the same events |
| MFA sealing keys (ADR 0021) | Yearly, by the prepend-and-retire method its runbook describes |
| The backup key pair (OP6) | Every two years; old backups expire within 35 days, so the old private key is destroyed 35 days after the switch |

**Dependencies:**
- **Automated update pull requests** (GitHub's Dependabot), weekly and grouped. They are ordinary pull requests, so
  they pass CI and the merge gate (OP8). Security updates are flagged for the same week.
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
| Yearly | The full rebuild drill; key rotation; rehearsing the runbooks; reviewing the retention policy (Disposal Regs 2(1)(a)); reviewing this design | OP6; OP11; OP9; ADR 0035 |
| By **1 December** each year | **Renewing Pryvis's registration** with the Information Commissioner, and the Canadian company's if it is registered | Registration Regs 3(3)(b); OA23 |
| Within **14 days** of a change | Telling the Commissioner of a change in the registration particulars — a new provider or country counts (OP2) | Registration Regs 3(4) |

## 14. What gets built, tests, what this does not do, and sources

**What gets built:**
- **B1 — environments:**
  - the Toronto check (OP2), then staging on the chosen provider;
  - the app specification file (OP4);
  - the staging addresses (OA2);
  - the test that the web app fetches no tenant data on Vercel's servers;
  - the non-production database with synthetic seed data.
- **B2 — start-up and pipeline:**
  - API start-up (A2's AP8);
  - CI extended (OP5 step 2), with the audit blocking (OP11);
  - the staging auto-deploy with migrations first;
  - the smoke checks;
  - the `deploy-production` workflow and its environment.
- **B3 — monitoring and resilience:**
  - error tracking and the uptime monitor (A5);
  - the job and backup alerts;
  - the nightly backup job, the bucket and the key pair;
  - **the first restore drill**;
  - the runbooks (OP9).
- **B4 — the approval interface:**
  - the staff console's Maintenance page;
  - the approval signature and its CI check;
  - GitHub's ruleset on `main` and code owners;
  - the production environment's required reviewer (OP8).

**Tests, each proved with a planted defect:**
- **Production data stays in production:** the non-production database holds only seeded synthetic tenants. Plant: a
  real-looking email domain in the seed — the seed check fails.
- **Vercel holds no tenant data:** no web page fetches tenant data on the server. Plant: a page that does — the check
  fails.
- **The start gate:**
  - a Claude pull request without a valid approval signature fails CI;
  - so does one whose task text no longer matches the approved fingerprint.

  Plants: a forged signature; an approved task edited after approval.
- **The merge gate:** a direct push to `main` is refused, and an approval is dismissed by a new commit. This is checked
  once, by hand, at B4 and recorded, because it is GitHub's setting rather than our code.
- **The deploy gate:** the production workflow does not start without the reviewer's approval, and its secrets are
  absent from every other workflow. Plant: the same deploy step in an unprotected workflow — it has no credentials and
  fails.
- **Backups:**
  - the nightly job's credential cannot delete or overwrite a backup;
  - a backup cannot be read without the owner's key;
  - the restore drill's checks fail on a truncated dump.

  Plants: a delete attempt with the job's credential; a dump with a table removed.
- **Migrations are expand-then-contract:** a migration that drops a column the previous release still reads fails the
  rollback test (the previous code run against the new schema). Plant: such a drop.
- **Alerts:** a planted dead-letter job and a failed backup each raise an alert, with no personal data in it.

**What this does not do (Rule 21.4):**
- It does not choose the storage, error-tracking, uptime or malware-scanning services — A5 does, within OP2's region
  rule and OP10's thresholds.
- It does not design the breach response's content — A11 does. OP9 only lists its runbook.
- **It does not make Pryvis highly available.** One database node and one API instance mean a provider fault is an
  outage, recovered within the 4-hour target. Failover is OP10's trigger.
- It does not offer round-the-clock response (OP7).
- It does not settle the legal question. Toronto makes the transfer case strong, not certain; the Commissioner's answer
  (OA22) and the attorney decide.
- **The Toronto check (OP2) may fail** on the privilege model's role powers. Then option B is the plan, as OP2 says.

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
