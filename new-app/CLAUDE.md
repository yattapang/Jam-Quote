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
npm test                     # db + api + contract
npm run contract:generate    # after changing any @wire type; commit the result
```

A change to a `@wire` type is not finished until the contract is regenerated and committed. CI
regenerates it and fails on a diff.

## Testing, and what "done" means

Three layers (Rule 8): unit tests beside the subject; seam and flow tests against a **real**
database — PGlite, which is Postgres in process, because a mock cannot disagree with an RLS
policy; and guards that hold a defect class shut.

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

Not built yet, and each is honest work owed rather than a detail:

- **Sign-in.** Nothing issues sessions; tests insert session rows directly. Token format, cookie
  handling and rotation-on-use come next, behind the `SessionReader` port.
- **Password hashing** — argon2id versus Node's scrypt is its own ADR, because a native
  dependency affects every deployment target.
- **MFA** — the largest open gap in Rule 5. Cheap to add now: a factor check belongs in the
  resolver's step 4.
- **`DefaultDenyGuard` is not yet registered globally**, because there is no application module.
  Until it is, its tests prove the logic and not the production wiring.
- The HTTP layer, so no OpenAPI document and no generated client — the contract generator emits
  types only and grows when routes arrive.
- `core/entitlements`, `core/audit`, `core/money`, `web/`, `mobile/`, `infra/`, and the port of
  `packages/core`.
