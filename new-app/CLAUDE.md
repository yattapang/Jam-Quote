# `new-app/` — project context

Read this before changing anything here. It is the orientation file ADR 0012 requires, for a
person or for Claude.

**First, Rule 0:** read `../docs/RULES.md` and the ADRs that bear on your task, and state which
rules apply. A task that has not cited its rules has not started.

## What this is

Pryvis: quoting and invoicing for contractors, Jamaica first, Trinidad & Tobago next. This
folder is the **selective rebuild** (ADR 0010) — the layers the Phase 0 audit condemned are
rebuilt here; the layers it found sound are ported from `../original-app/` by deliberate review,
never copied.

`../original-app/` is **read-only**. Do not change it, and do not import from it.

## Where things are, and what may depend on what

```
db/         the schema, its migrations, its RLS policies, synthetic seeds
api/src/core/       cross-cutting; every module trusts it; it depends on NO module
api/src/modules/*   one bounded feature each, reachable only through its index.ts
packages/core       shared money, tax, totals, settlement, rule packs
packages/contract   GENERATED wire types — never hand-edited
```

The dependency rule, enforced by `api/src/core/architecture/import-boundaries.test.ts`:

- a module may import `core/`, a `@pryvis/*` package, its own files, or another module's
  `index.ts`;
- it may **not** reach into another module's internals;
- `core/` may **not** import a module at all;
- a **computed** dynamic import inside `modules/` is refused outright — it is the one way to
  cross a boundary unseen.

## How tenant isolation works

Three layers (Rule 4). Understand all three before touching data access:

1. `tenant_id` on every tenant-owned table — `db/schema.prisma`.
2. Row-level security refuses rows that do not match `current_setting('app.tenant_id')` —
   `db/policies/001-tenant-isolation.sql`, applied by the migrations, `FORCE`d so the table
   owner is not exempt.
3. `withTenant()` sets that variable, **transaction-locally** — `api/src/core/tenancy/`.

**Every read and write goes through `withTenant`.** Forgetting it returns *nothing*, not
everything — that is the property the whole design is for. `withoutTenant()` exists for
sign-in and platform administration, and grants nothing by itself.

Never accept a tenant id from a request body, query string, header or token claim.

## Conventions

- Files kebab-case; React components PascalCase; tests `*.test.ts` beside their subject.
- Tables and columns snake_case; Prisma models PascalCase with explicit `@map`.
- The tenant's client is a **customer**. The tenant is a **tenant** in code and a "business" in
  the UI.
- Money is integer minor units in 64-bit columns named `…_minor_units`, ceiling 999,999,999.99
  validated at one boundary (ADR 0011). Percentages are `…Pct`, 0–100.
- No `utils.ts`, no `helpers.ts`. A name that says nothing is where things hide.
- Every module opens with a header: what it owns, what it trusts, what it must never do.
- Comments say **why**, especially for a money rule, an authorisation check, a deliberate limit,
  or anything that exists because of a real defect — name the defect.

## Commands

Run from this directory.

```bash
npm install
npm run typecheck
npm test                     # db + api + web + contract
npm run contract:generate    # after changing any @wire type; commit the result
npm run build -w @pryvis/web # the public site; CI builds it too
```

**`npm test` runs the packages one at a time** (`--concurrency=1`), and that is deliberate. Several
suites each start their own in-process Postgres, and running them in parallel starves them on a
modest machine: the gate fails, a different suite each time, with nothing wrong in the code. A
flaky gate is worse than a slow one — it teaches everyone to re-run instead of investigate, and
then a real failure gets re-run too. If you want the parallel run while iterating, call
`npx turbo run test` directly and treat a failure as unproven until you have repeated it serially.

A change to a `@wire` type is not finished until the contract is regenerated and committed. CI
regenerates it and fails on a diff.

**A new or replaced function must pin its search path** — `SET search_path = pg_catalog, public, pg_temp`
(or an `ALTER FUNCTION` after it). `CREATE OR REPLACE` drops the setting, and without it a temporary table
can stand in for a real one: that let an invoice past the ceiling (finding Y7). `db/test/function-search-path.test.ts`
fails on any unpinned plain function in `public` — not on a procedure, an aggregate, or a function in
another schema (finding Z3); keep functions in `public`, or extend the guard first.

**A new migration is not finished until `db/schema-objects.json` is regenerated and committed:** in
`db/`, run `PRYVIS_WRITE_SCHEMA_OBJECTS=1 npx vitest run test/schema-objects.test.ts`. That file is the
list of every table, column, function, trigger, policy, index and constraint the migrations build, read
from PostgreSQL's catalogue; `tools/check_schema_citations.py` resolves citations against it, and
`npm test` fails if it is stale (findings S3, S4 — the tool used to parse the SQL, and got it wrong).

## Testing, and what "done" means

Three layers (Rule 8): unit tests beside the subject; seam and flow tests against a **real**
database — PGlite, which is Postgres in process, because a mock cannot disagree with an RLS
policy; and guards that hold a defect class shut.

**One suite needs real PostgreSQL:** `db/test/concurrency.pg.test.ts` races two and three sessions,
which PGlite (one connection) cannot. It runs when `PRYVIS_PG_URL` points at a superuser connection
(it creates and drops a throwaway database) and prints a loud SKIPPED line otherwise; CI sets
`PRYVIS_REQUIRE_PG`, which turns a missing database into a failure. Both variables are declared in
`turbo.json`, because Turbo drops undeclared environment variables — and did, silently, the first time.
In a fresh container, `sh tools/pg-local.sh` (from the repository root) creates and starts a throwaway cluster on port
55440; then run the suite with `PRYVIS_PG_URL=postgres://postgres@127.0.0.1:55440/postgres PRYVIS_REQUIRE_PG=1`.

**Financial writes must run under READ COMMITTED** (the PostgreSQL default). Acceptance, acceptance evidence, invoice, void,
credit note, variation, withdrawal, sealing, opening a balance row and a balance recompute all take a per-quote lock that is
only correct when each statement sees what the transaction it waited for committed; under REPEATABLE
READ or SERIALIZABLE they are refused with SQLSTATE 25000 (finding P1). Do not pass an `isolationLevel`
to a transaction that writes any of them. Four shapes can deadlock (the fourth is at the end of this
paragraph; SQLSTATE 40P01, detected by
PostgreSQL, nothing left wrong) and must be retried: a transaction that writes on two quotes; one that
writes on a quote and then seals the same quote — which includes the wrong-document remedy (void or credit,
withdraw, seal the next revision) if it is run as ONE transaction; and one that writes on **two issues of
the same quote** — two client responses, or a response and an invoice — while another transaction does the
same in the other order (finding S9, executed on real PostgreSQL 16; it deadlocked before J13 too, on the
old unique index). Run those steps as separate transactions: **a client response is alone in its
transaction** — no second response, and no invoice, void, credit note or variation on the same quote beside
it (finding T11: one response plus an invoice on another issue of the quote, in opposite order, deadlocked
2 of 2). If a flow must combine them, retry on 40P01. **Acceptance evidence and a withdrawal count as writes on
their issue** (they take the same per-issue lock as a response, finding J6): record a deposit's evidence
alone in its transaction too. **A fourth shape (finding W2): a withdrawal against a transaction that holds
the issue's balance row — a variation, invoice, void or credit note, applied — and then records evidence or
withdraws on the same issue.** The withdrawal takes the issue lock before the balance row; that
transaction takes them the other way, and no single order serves both. Executed in
`db/test/concurrency.pg.test.ts` (W2): detected, one side rolled back, nothing left wrong. **A withdrawal runs
alone in its transaction**, and so does evidence; if a flow must combine them, retry on 40P01.

**A test counts only once it has been shown to fail.** Plant the defect, watch the test catch
it, restore from a *backup copy* — never `git checkout`, which has destroyed uncommitted work
here before. Every guard states what it does **not** prove; keep that habit.

## State of play

Built: `db/` with proven isolation; both structural guards; `core/tenancy`; `core/auth`
(default-deny route protection, identity re-resolved from the database, revocable sessions —
ADR 0013); and two skeleton modules (`tenants`, `users`) that exist so the guards have real
subjects.

**Route protection is mandatory.** Every route declares `@Authenticated()`,
`@ShareTokenRoute()` or `@PublicRoute("why")`. An undeclared route is refused at runtime and
fails the build. `@PublicRoute` needs a real reason — that reason is what makes reviewing every
open surface a glance instead of an audit. Running the api tests prints the full route inventory
with its protection.

Also built: **rate limiting** (token buckets in Postgres, per IP and per hashed email, checked
before the expensive hash — ADR 0016), **password hashing** (Node's scrypt, parameters stored in the hash, rehash on
successful sign-in — ADR 0014) and **sign-in** (ADR 0015). Credentials live in `app_credential`,
outside row-level security, because sign-in must find a user by email before any tenant is known;
every exemption from row security is named with its reason in `db/test/policy-parity.test.ts`.

**The privilege model** (`docs/design/privilege-model.md`; migration `20260927220000_privilege_model`).
The migrations create three NOLOGIN roles and every grant — the test harness grants nothing of its own:

- `pryvis_app` — the ordinary role every request runs as. Ordinary access to every table, except: **no
  privilege at all** on the credential tables (`app_credential`, `app_session`, `mfa_totp`,
  `mfa_recovery_code`, `registration_claim`), and SELECT only on `issue_balance` and
  `platform_capability`. A new table **or view** gets its grants by default — so **a new secret table must
  be revoked explicitly, and a new view must be `WITH (security_invoker = true)`** (a view otherwise runs
  as its owner, outside row security: finding AA2). `db/test/privilege-model.test.ts` fails on any
  relation in any schema the application can reach outside row security that it does not name.
- `pryvis_auth` — owns the **door functions** (`credential_for_email`, `session_create`,
  `session_resolve`, `mfa_*`, …), `SECURITY DEFINER`, each reading or writing one row by its key. Auth
  code calls these; it never writes SQL against a credential table.
- `pryvis_balance` — owns `issue_balance_open()` and `issue_balance_apply()`, the only writers of
  `issue_balance`.

A session secret never reaches the database: the client holds it, `app_session.token_hash` holds its
SHA-256 (`api/src/core/auth/session-token.ts`). `least_privilege_violations()` describes the calling role,
and `api/src/core/auth/least-privilege.ts` refuses to start on any violation — **not yet called by
anything**, because there is no bootstrap. In tests, writing a credential table directly needs `RESET
ROLE` first (the owner), as the fixtures in `api/src/core/auth/*.test.ts` do.

**SQL is always a fixed string.** Values go only as `$n` parameters; never build a statement with
`${…}`, `+` or a variable — `api/src/core/architecture/sql-is-static.test.ts` fails the build on it. This
is the control the privilege model leans on: an injection in our server can still impersonate a user
through the write doors (an accepted limit, `docs/THREAT-MODEL.md` §4f).

Not built yet, and each is honest work owed rather than a detail:

- **Sign-up.** Tenants register themselves free on the website (Rule 14, ADR 0015). It needs
  rate limiting, email verification before anything costs us money, and a duplicate registration
  that does **not** reveal the address is taken — it emails the existing owner instead. That last
  one means sign-up depends on the messaging service existing first.
- **HTTP transport for sessions** — cookie, CSRF, rotation-on-use. Sign-in returns a session
  reference; nothing yet carries it over the wire.
- **MFA — and for staff it is a launch blocker, not an improvement** (Rule 5.1). Our own
  employees and administrators must have a second factor, a 20-character password minimum, named
  individual accounts, short sessions with re-authentication before impersonation or a price
  change, and same-day offboarding. **The second-factor service is built** (`api/src/core/auth/mfa.ts`,
  ADR 0021) and the resolver refuses a capability-holder without a confirmed factor; what ADR 0021
  lists as owed — and the staff console itself (PRD W10) — is not built, and staff MFA stays a launch
  blocker until it is. Release 1 has no impersonation (ADR 0029). *(Corrected 2026-10-02: this said
  "None of it is built".)*
- **Rate-limit housekeeping.** `rate_limit_bucket` grows until old rows are deleted. An absent
  bucket is a full one, so nothing breaks — but the table needs a periodic sweep.
- A guard asserting `app_user.email` and `app_credential.email` stay equal.
- **`DefaultDenyGuard` is not yet registered globally**, because there is no application module.
  Until it is, its tests prove the logic and not the production wiring.
- The HTTP layer, so no OpenAPI document and no generated client — the contract generator emits
  types only and grows when routes arrive.
- `core/entitlements`, `core/audit`, `core/money`, `web/`, `mobile/`, `infra/`, and the port of
  `packages/core`.
