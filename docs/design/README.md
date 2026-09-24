# Designs

**Nothing is implemented without an approved design in this folder** (Rule 1.1). That rule became a
gate on 2026-09-24, at the owner's instruction, after it had been breached twice.

## What a design is

One file per piece of work, named for it (`marketing-site.md`, `audit-log.md`, `sign-up.md`), and
proportionate — a page or two for a feature, a paragraph for a small change. It answers:

1. **What problem, for whom.** Named people in a real situation, not "users".
2. **What it must achieve** to be worth building, stated so that failure is recognisable.
3. **The shape.** Screens, endpoints, tables, states — enough that someone else could build it and
   arrive somewhere close.
4. **The trade-offs**, and what was considered and rejected.
5. **What is deliberately excluded**, so scope creep is visible as a change rather than a drift.
6. **How it will be proved** — which tests, and which defect each one is planted with (Rule 8).
7. **What it depends on**, including anything owed by someone else or by the owner.

## What a design is not

**An ADR.** An ADR justifies one decision and records what was rejected. A design says what is being
built. Both exist; neither substitutes for the other, and "there is an ADR" was exactly the
reasoning that let the marketing site get built without a design.

**A ticket.** A list of tasks is not a design — it is the output of one.

## Status

Each design carries a header: **Proposed** (awaiting the owner), **Approved** (build it), or
**Superseded** (with a pointer to what replaced it). A design is approved by the owner, not by me.

## Designs

| Design | Status | For |
|---|---|---|
| [domain-model.md](domain-model.md) | **Proposed** | The whole product as entities, designed from the eight steps of the job rather than from the tables that exist (Rule 1.2). Six contexts; a quote that is two things so an issued document cannot be edited; deposit and progress invoicing; number leases so issuing works with no signal; separation of duties modelled rather than documented. Names five corrections to work already built |
| [staff-mfa.md](staff-mfa.md) | **Approved & built** 2026-09-24 | TOTP with RFC test vectors, enrolment before access, a key id so the key can be rotated, and re-authentication before impersonation. Names four corrections to the schema already built (Rule 1.2) |
| [audit-log.md](audit-log.md) | **Approved & built** 2026-09-24 | Append-only, enforced by grants rather than by code; atomic with the change it describes; tenant-readable so a tenant can see what we did to their data |
| [row-identity-and-versioning.md](row-identity-and-versioning.md) | **Approved & built** 2026-09-24 | Client-generated UUIDv7 ids, a version column compared on write, and tombstones — the schema half of offline sync, which §18 puts in Foundations so it is not a retrofit |
| [api-bootstrap.md](api-bootstrap.md) | **Built** 2026-09-24 | The composition root and making default-deny real (F2). Explicitly NOT the HTTP layer: no `main.ts`, no session transport |
| [marketing-site.md](marketing-site.md) | **Approved & built** 2026-09-24 | pryvis.com — the six public pages, the sign-up hole and how it is handled for now, and the seven guards. Leads on the on-the-spot estimate (Delroy at the roadside). Built and landed on `main`: six static pages, content as data, nine guards proved by planting |
