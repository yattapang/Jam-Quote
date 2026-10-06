# Design: environments and operations — where Pryvis runs, how it is changed, and how it is kept safe

**Status: DRAFT, in progress — written section by section and saved as it goes (owner, 2026-10-06).** Build plan step
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

*(Sections are filled in order; an unfilled section reads "to be written".)*

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
- **neither Render nor Neon offers a Canadian region.** Both offer US-East (Virginia, Ohio) and Frankfurt in the EU;
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
- **Neon's database branches are a trap here.** A branch of the production database *is* a full copy of production
  data. So production gets **its own Neon project**, and development and staging live in a **separate** Neon project
  seeded with synthetic data. A branch is never taken from production, except by the restore drill (OP6), which runs
  inside the production project and is deleted afterwards.
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

**What the providers offer** (checked 2026-10-06; §14):
- **Render:** Oregon, Ohio, Virginia, Frankfurt, Singapore. No Canada. A service's region cannot be changed after it is
  created.
- **Neon:** AWS US-East (Virginia, Ohio), US-West, Frankfurt, London, Singapore, Sydney, São Paulo. No Canada. Its
  Azure regions are deprecated.
- **Vercel:** functions run in one region chosen per project (Washington, D.C. by default; Frankfurt is available).
  Static pages are served from its global edge.

So the real choice is **US-East or Frankfurt**, for all three together. The database, API and web functions must sit
in one region, or every request crosses the Atlantic twice.

| Option | For | Against |
|---|---|---|
| **A. US-East** (Render Virginia, Neon `aws-us-east-1`, Vercel `iad1`) | Nearest Jamaica: roughly 40-60 ms per round trip; the providers' default | The United States has no general federal privacy law, so the "adequate protection" test of s. 31 is harder to meet for clients' data. It rests on the Commissioner approving our safeguards, or on approved transfer terms (`docs/DATA-PROTECTION-READING.md` §5) |
| **B. (rec) Frankfurt, EU** (Render Frankfurt, Neon `aws-eu-central-1`, Vercel `fra1`) | The EU's GDPR is the clearest case of adequate protection, which makes s. 31 far easier to satisfy. Same providers, same prices | Roughly 110-140 ms per round trip from Jamaica. Each page needs a few calls, so the app feels slightly slower, and the cheap-phone timing target (R1.8) must be measured on staging |
| C. Wait, and choose later | No commitment yet | Development and staging still need a region. Production cannot move once created, but nothing real exists before F3, so later means "by F3", not "never" |

**Recommendation: Frankfurt (B) for staging and production, decided now and confirmed before F3.**
- Staging is built in the same region, so that R1.8's timing test is honest.
- **Reversing** it before F3 costs nothing but recreating staging. After launch it costs a migration.
- **The decision point:** the Commissioner's answer to question 4 (OA22), and R1.8 measured on staging from Jamaica.
  - If the Commissioner says US hosting with our safeguards is acceptable, **and** Frankfurt fails R1.8, then production
    moves to US-East before F3.
  - Otherwise Frankfurt stands.
- **This changes ADR 0030 decision 5's "US-East, nearest Jamaica"**, which was written before the Data Protection Act
  was read. The ADR carries a dated note pointing here.

**Services outside the main region**, listed for the registration and the privacy notice (s. 16(2)(g)):
- Stripe, through the Canadian company (Canada and the United States);
- the transactional email provider (A6: choose one with an EU region);
- error tracking (A5: an EU data region where offered);
- GitHub, which holds code and synthetic data only — never personal data.

## 4. OP3 · Hosts, plans and what they cost

**Production at the web launch** (estimates; checked on the vendors' pages before buying):

| Piece | Plan | Why that plan | About, per month |
|---|---|---|---|
| API (Render, Frankfurt) | **Standard**: 2 GB memory, 1 CPU, always on | Always on (ADR 0026). 512 MB (Starter) is tight for Nest with Prisma and a job worker in one process. Malware scanning runs separately (A5) | US$25 |
| Database (Neon, Frankfurt) | **Launch**, usage-based, no monthly minimum | Scale-to-zero is turned **off** for production, so the first request after a quiet hour is not slow; point-in-time restore; branches for the drill | US$10-30 at launch scale (compute about US$0.11 per CU-hour, storage US$0.35 per GB-month) |
| Website and web app (Vercel) | **Pro**, one seat | Hobby forbids commercial use | US$20 |
| Object storage, error tracking, uptime, malware scanning | Chosen in A5 | — | Mostly free tiers at launch (A5 prices them) |
| The Render workspace | To confirm: Render bills some features per workspace member | — | US$0-19 |
| **Total, production** | | | **about US$55-95 a month**, before A5's services |

**Staging:**
- Render's **free** plan (it sleeps when idle, which is acceptable for staging) — but in Frankfurt, like production;
- the non-production Neon project on the **free** plan;
- Vercel previews, included in Pro;
- about **US$0**.

**Development:** local, plus the non-production Neon project. About **US$0**.

**Before launch** (now until F3): only staging and development run, so the monthly cost stays near zero. Production is
created at F3, when OA17 switches it on. The old application's free deployment and its keep-warm workflow are retired
when `original-app/` is (K1), or earlier if the owner prefers.

## 5. OP4 · Configuration and secrets

**Configuration decides where things run, not code** (Rule 10).

- **The API's blueprint is rewritten for the rebuild.** `render.yaml` today describes the old application. The new one
  defines `pryvis-api-staging` and `pryvis-api-production` from `new-app/`, region Frankfurt (OP2), with every secret
  marked `sync: false`, so it lives in Render's dashboard, never in the repository. The old service's entry is removed
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
6. **Migrations run before the new code starts**, in Render's pre-deploy step, with the migration credential (OP4).
   - **Expand, then contract.** A migration must work with the previous version of the code still running: add a
     column, then use it in a later release; stop using one, then drop it in a later release.
   - That is what makes rolling back the code safe without rolling back the database.
   - Migrations are never edited and never run backwards (Rule 6). A bad one is corrected by a new one.
7. **Deploy gate.** A workflow, `deploy-production`, deploys **the exact commit that passed staging**, and only after
   the administrator approves it (OP8). Production never deploys automatically.
8. **After the production deploy:** the same smoke checks run against production, using a dedicated synthetic test
   tenant that holds no real data.

**Rolling back:**
- **Code:** Render's "roll back to the previous deploy", and Vercel's instant rollback. Both are one action, and both
  are in the runbook. Expand-then-contract makes this safe.
- **Data:** never by reversing a migration. A bad write is corrected by a forward fix; damaged data is restored from
  the point-in-time history or a backup (OP6), as the restore runbook says.

**The record:** GitHub records who approved each merge and each production deploy, and when. The deploy workflow
also writes a line to the platform audit trail (R1.48): the commit, the approver and the time.

## 7. OP6 · Backups and restore drills

**Two layers, because they protect against different things:**

| Layer | Protects against | How | Kept |
|---|---|---|---|
| **Point-in-time restore** (Neon) | "Undo the last few hours": a bad deploy, a mistaken bulk change | Neon's history on the Launch plan; the window is confirmed when buying | The plan's window |
| **Nightly backup** | Losing the provider, the project, or anything older than the window | A logical dump (`pg_dump`), encrypted, in object storage in the same region (Frankfurt; A5) | **35 days**, then deleted (ADR 0035) |

**How the nightly backup works:**
1. A **scheduled job inside the production region** (a Render cron job) runs the dump each night, with the **backup
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
| The database | Neon's usage figures | 80% of a plan limit (OP10) | The owner by email |
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

To be written.

## 10. OP9 · Runbooks

To be written.

## 11. OP10 · Rule 10's trigger

To be written.

## 12. OP11 · Security operations

To be written.

## 13. OP12 · The operations calendar

To be written.

## 14. What gets built, tests, what this does not do, and sources

To be written.
