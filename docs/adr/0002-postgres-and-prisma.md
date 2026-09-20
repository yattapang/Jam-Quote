# 0002 — Postgres via Prisma, migrations checked in, no database enums

**Status:** Accepted (2026-07, recorded 2026-09-20)

## Context
The data is financial and multi-tenant: quotes, invoices, payments and an audit trail that
must survive schema change. Production is Neon Postgres with a Render-hosted API.

## Decision
Postgres, accessed through Prisma. Every schema change is a checked-in SQL migration, never
`db push`. An applied migration is never edited; a correction is a new migration. Columns
that behave like enumerations are plain text validated against a core enum, not Postgres
enums.

## Alternatives considered
- **Database enums.** Rejected: every country rollout and every new status would need an
  `ALTER TYPE` coordinated with a deploy. Plain text plus a core enum keeps the valid set in
  one place that the API, the web app and the mobile app all read.
- **An ORM with a looser migration story.** Rejected: an edited migration diverges silently
  per environment. One attempt to edit an already-applied migration was caught in review; it
  would have broken the checksum on every deployed database.

## Consequences
- Referential rules (unique, partial unique, `ON DELETE`) live in SQL, visible in the
  migration, which is where a reviewer looks for them.
- Tests run against a real Postgres in-process (PGlite) with every migration applied, so a
  constraint is part of what the tests exercise.
- Plain-text enum columns rely on core enums plus DTO validation to stay honest.
