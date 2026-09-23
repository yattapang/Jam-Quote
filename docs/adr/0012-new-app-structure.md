# 0012 — The structure of `new-app/`

**Date:** 2026-09-23
**Status:** Accepted — approved by the owner on 2026-09-23
**Follows:** ADR 0010 (selective rebuild), ADR 0009 (the brand is Pryvis), the brief §4 and §7

## Context

ADR 0010 settled *what* gets rebuilt. This settles *where it goes*, before any code exists,
because the brief is explicit that the structure is designed upfront rather than left to
emerge, and because the owner requires code an independent person can follow (Rule 2).

Three findings from the Phase 0 audit bear directly on the layout, and each one is answered by
a specific choice below:

1. **Module boundaries were a convention.** Any service could import any other module's Prisma
   model, and several did. A folder layout alone did not stop it.
2. **The web app hand-mirrored API response shapes**, and nothing proved the fields still
   matched. A type that compiles is not a type that agrees.
3. **`packages/core` resolved through its built `dist`**, so api and web builds went stale
   until core was rebuilt — a trip-hazard that cost real debugging time.

## Decision

### The tree

`new-app/` is its own npm-workspace root, with the npm scope **`@pryvis/*`** from its first
commit (ADR 0009 — new code carries the real name; nothing renames in `original-app/`).

```
new-app/
  CLAUDE.md                  the project context file: module map, conventions, commands
  package.json               workspace root: api, web, mobile, packages/*
  turbo.json
  tsconfig.base.json

  db/                        @pryvis/db — the schema is the single source of truth
    schema.prisma
    migrations/              never edited once applied (Rule 6)
    seed/                    synthetic data only; no tenant or client data (Rule 15)
    policies/                the row-level-security policies, as reviewable SQL

  api/                       @pryvis/api — NestJS
    src/
      core/                  cross-cutting, trusted by every module
        tenancy/             request-scoped tenant context; sets the RLS variable per transaction
        auth/                default-deny guards, sessions, MFA
        entitlements/        the one resolver every gated feature asks
        audit/               who did what, to which tenant, when
        money/               the boundary conversion and the ceiling check (ADR 0011)
        errors/              what a caller is allowed to be told
        architecture/        the guards that hold this structure in place
      modules/
        tenants/             each module: <name>.controller.ts, .service.ts, .dto.ts,
        users/                 index.ts (its public surface), colocated *.test.ts
        customers/
        catalog/
        quotes/
        invoices/
        payments/
        billing/             plans, tiers, subscription terms
        messaging/           the one outbound service; channels are adapters
        support/
        reporting/
        sync/
      integration/           seam and flow tests against a real Postgres
      main.ts
  web/                       @pryvis/web — Next.js App Router
    app/  components/  lib/
  mobile/                    @pryvis/mobile — Expo
    app/  db/ (local replica)  sync/ (outbox)
  packages/
    core/                    @pryvis/core — money, tax, totals, settlement, rule packs
    contract/                @pryvis/contract — generated API client and types
    ui/                      @pryvis/ui — design tokens and primitives
    test-ast/                @pryvis/test-ast — the one parser every guard uses
  infra/
    docker-compose.yml       local Postgres, so RLS is exercised in development
    env/                     dev, staging, production definitions (no secrets)
```

### The five rules this layout exists to enforce

**1. A module owns its data and exposes a surface.** A module may import `core/`, `packages/*`,
and another module's `index.ts` — never another module's service, DTO or Prisma model directly.
*Enforced by* a guard test over the import graph, using the ported `test-ast` parser, proved by
planting a cross-module deep import and watching it fail. This is the answer to audit finding 1:
the boundary becomes a test, not a habit.

**2. Every module opens with a header saying what it owns, what it trusts, and what it must
never do** (Rule 2), and every file it holds is either its controller, its service, its DTOs,
its public surface, or a test. No `utils.ts`, no `helpers.ts` — a name that says nothing is a
place things hide.

**3. The schema lives in `db/`, not inside `api/`.** It is read by the api, by migrations, by
seeds and by tooling, so it belongs to none of them. The RLS policies sit beside it as
reviewable SQL rather than buried in a migration, because they are the tenancy rule and a
reviewer must be able to read them without a diff archaeology exercise.

**4. The contract is generated, never mirrored.** Module DTOs are the single definition; the
build emits an OpenAPI document and generates `packages/contract`, which web and mobile
consume. The generated output is checked in, and **CI regenerates it and fails on any diff.**
This is the answer to audit finding 2 — the drift the old guard could not see becomes a build
failure.

**5. Workspace packages are consumed from source.** No `dist` step in development;
`tsconfig.base.json` project references and Next's `transpilePackages` handle it. This is the
answer to audit finding 3.

### Conventions, fixed now so they are not argued later

- **Files** are kebab-case (`quote-totals.ts`); **React components** are PascalCase; **tests**
  are `*.test.ts` beside their subject, matching the ported guards.
- **The tenant table is `tenant`, its column is `tenant_id`** (Rule 4), even though the UI says
  "business" to the contractor. `original-app/` keeps `businessId` forever — it is read-only,
  and ADR 0009 forbids renaming live database identifiers.
- **Domain words, not abbreviations:** `tenant`, `customer`, `quote`, `invoice`, `entitlement`.
  The tenant's client is a **customer**, to end the `client`/`Client`/HTTP-client ambiguity
  that runs through the old code.
- **Money is minor units named `…MinorUnits`** rather than `…Cents`, because the ceiling and the
  minor unit are per jurisdiction (ADR 0011) and "cents" quietly assumes one.
- **Percentages** stay `…Pct`, 0–100.
- `CLAUDE.md` at `new-app/`'s root is the project context file the brief asks for, so a person
  and Claude read the same orientation.

## Alternatives considered

**Modules at the top level of `api/src/` with no `modules/` folder** (the old layout). Rejected:
`core/` and a domain module then look alike, and the distinction between "everything trusts
this" and "this is one bounded feature" is exactly what a newcomer needs to see first.

**Keep the schema in `api/prisma/`.** Conventional for Prisma and one less package. Rejected:
it makes the database the api's private property, when the migration scripts, the seeds and the
RLS policies are all first-class artefacts, and the brief names `db/` as the single source of
truth for structure.

**tRPC instead of a generated OpenAPI client.** End-to-end types with no generation step, which
would close the drift gap more elegantly. Rejected: the product has genuinely public REST
surfaces (share links, the payment-gateway callback, a future Business-tier API), and a mobile
client with an offline outbox wants a stable versioned wire format, not a TypeScript-coupled
one.

**One shared `packages/` between `original-app/` and `new-app/`,** to avoid porting core twice.
Rejected: it would make `original-app/` not read-only in practice — every change for the new
app would reach into the old one, which is the exact coupling ADR 0010 separated.

**Vertical slices holding their own web routes beside their api module.** Rejected: two
deployment targets with different rendering models do not usefully share a folder, and the
mobile client would have no place in that scheme.

## Consequences

- Six of the seven rebuild items from ADR 0010 have an obvious home; `core/tenancy` plus
  `db/policies` is the one that has to be right first, because everything else stores data
  under it.
- **The import-graph guard and the contract-drift check are infrastructure and must exist
  before the modules do.** A rule with nothing enforcing it is a comment (Rule 2), so these two
  are the first tests written, each proved by planting its defect.
- Generating the contract adds a build step, and a stale checked-in client is now a red CI run
  rather than a silent mismatch. That is the trade being bought deliberately.
- `packages/core` is ported into `new-app/packages/core` as its own reviewed change. For a
  period the same rules exist in both trees. That duplication is bounded by `original-app/`
  being frozen, and it ends when `original-app/` is deleted.
- Renaming `client` to `customer` and `…Cents` to `…MinorUnits` means the port of core is not a
  copy — it is a reviewed adaptation, which costs time and is the point of Rule 1.2.
- `infra/docker-compose.yml` exists so row-level security runs in development. RLS that is only
  enabled in production is a rule nobody tests.

## What this ADR does not decide

- **The mobile framework.** The tree assumes Expo because that is what exists and what the team
  knows; if a different framework is chosen it gets its own ADR and `mobile/` changes shape.
- **Hosting and the free-tier-to-paid trigger** (Rule 10) — owed as its own ADR.
- **The target schema itself.** This says where it lives, not what is in it; the schema comes
  from the Phase 1 domain model, for the owner's approval.
- **Whether `new-app/` gets its own CI job or shares the existing one.** It is a second job in
  `.github/workflows/verify.yml`, added when the first code lands, not now.
