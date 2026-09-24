# Where we are against the development brief

**Why this file exists.** The owner asked on 2026-09-24 whether we were drifting — following the
brief and updating it — and the honest answer was partly yes. Nothing tracked our position
against the brief's own phases, so drift was possible without anyone noticing. This is that
tracker, and Rule 19 requires it to be read at the start of a task and updated at the end.

**Legend:** ✅ done · 🟡 partly done · ❌ not started · ⏭️ deliberately later

Last reviewed: **2026-09-24**. Staff MFA is **paused** at a clean point (schema and the
strengthened guard are committed; no service code started). The marketing site is **built and
landed** against its approved design (`docs/design/marketing-site.md`), with nine guards proved by
planting. The independent review (Rule 9) ran, reported 15 findings, and **all 15 are now closed** —
each with the defect planted and the fix proved (`REVIEW-FINDINGS.md`).

---

## The headline, stated plainly

**The code is in the right place. The documents are behind, and one required step was skipped.**

Everything built so far — tenancy with leak tests, authentication, the schema, CI — is exactly
§18's step 1, "Foundations". That is not drift. But:

1. **The brief-revision step in §5 was skipped.** The brief says that once the audit is complete
   and product scope is decided, Claude proposes specific edits to the brief reflecting what was
   found. That did not happen, and I did not flag it. It is the clearest single instance of drift
   and it is now item 1 of what is owed.
2. **Phase 1 (§6) is mostly unwritten** — no PRD, no domain model, no threat model, no approved
   target schema — while implementation has proceeded. Each piece of code was approved through an
   ADR and directed by the owner, so this is not unilateral, but the brief's order was not
   honoured and the gap was not named until asked.
3. **The audit log is missing from Foundations.** §18 lists it in step 1 alongside auth and
   tenancy. It has not been built.
4. **Seven of the fourteen open questions in §19 are unanswered**, and the brief says they should
   be surfaced early.
5. **The design-before-build gate was breached twice** — Foundations ahead of Phase 1's artefacts,
   and the marketing site with no design at all. On 2026-09-24 the owner made it a hard gate
   (Rule 1.1): designs live in `docs/design/`, and a task names its approved design before it
   starts. The site implementation is parked until its design is approved.
6. ~~The independent review did not happen.~~ **Done.** The first agent failed on a session limit
   and returned nothing; the second reported incrementally so its findings could survive that, and
   found a red gate plus a critical guard hole in code I had written and reviewed myself. All 15
   findings are closed. **Rule 9's breach is closed for this slice** — and the rule is no longer
   theoretical.

---

## Phase 0 — audit (§5)

| Deliverable | State | Evidence |
|---|---|---|
| Schema review | ✅ | `PHASE-0-AUDIT.md` §1 |
| Architecture review | ✅ | §2 |
| Requirement-gap review | ✅ | §3 |
| Risk list | ✅ | §4 — 23 findings |
| Migration notes | ✅ | §5 |
| Product & feature review from the live site | 🟡 | §6 — **there is no marketing site**, so it was derived from code and the public pages and is marked unverified |
| Feature inventory, keep/change/drop | ✅ | §6 — 34 items |
| Product-scope recommendation | ✅ | §6 — one product |
| **Owner's scope DECISION** (the brief's gate on Phase 1) | ✅ | **2026-09-24: one product, built to verticalise later** — ADR 0017. Trade behaviour becomes a data pack; tier ladder unchanged |
| **Portfolio review — what to add, what to take out** | ✅ | `PRODUCT-OPPORTUNITIES.md`, 2026-09-24. The owner's actual §5 question, which I first misread as the verticalisation question. One item carries a deadline: price-index consent must be in the terms before the first tenant signs up |
| **Proposed edits to the brief after the audit** | ✅ | `BRIEF-EDITS-PROPOSED.md`, 2026-09-24 — eight edits, **approved by the owner and applied to the brief** the same day |

## Phase 1 — requirements and design (§6)

| Deliverable | State | Note |
|---|---|---|
| PRD (users, workflows, scope for first country and release) | ❌ | Nothing written |
| Domain model | ❌ | Entities exist in ADRs and the schema, never mapped as a whole. **Must be written in trade-neutral language** (ADR 0017) |
| Threat model | ✅ | `THREAT-MODEL.md`, 2026-09-24 — 9 assets, 9 adversaries, 6 trust boundaries, every control marked BUILT / PARTIAL / OWED with test evidence. It endorsed the authentication design and named five gaps, the audit log first |
| ADRs | ✅ | 16, dated, with alternatives and consequences |
| Target database schema for approval | 🟡 | The authentication slice is built and approved piecemeal; the product schema has not been designed or approved |

## §18 delivery order

**1. Foundations**

| Item | State | Evidence |
|---|---|---|
| Authentication | 🟡 | Default-deny routes, identity re-resolved per request, revocable sessions, sign-in, rate limiting (ADRs 0013–0016). **Owed:** staff MFA (in flight), HTTP transport, sign-up, password reset |
| Tenancy with cross-tenant leak tests | ✅ | `tenant_id` + forced RLS + `withTenant`, proved against real Postgres; every table must now be protected or exempt with a reason |
| Schema | 🟡 | **Client-generated ids, row versions and tombstones done** 2026-09-24 (ADR 0019), with partial indexes and a convention guard. **Owed:** the audit log's tables, and the product schema itself |
| Audit log | ❌ | **Missing from step 1** |
| CI | ✅ | Both workspaces gate on every push |

**2. First end-to-end vertical slice** (quote → email → accept) ❌ not started
**3.** Catalog, tax, PDF, tiers and entitlements, billing with manual-payment approval ⏭️
**4.** Offline sync, WhatsApp sending, support channel ⏭️
**5.** Second country (Trinidad & Tobago) ⏭️
**6.** Retire `original-app/` ⏭️ — only on the owner's explicit confirmation

## §19 open questions

| Question | State |
|---|---|
| Product scope | ✅ One product, as scoped |
| Current stack and storage problems | ✅ Audit §1–2 |
| First and second country | ✅ Jamaica, then Trinidad & Tobago |
| Tier definitions and limits | 🟡 Tiers and features settled (`TIERS.md`); per-feature numeric limits and prices not set |
| Mobile approach | ❌ Expo assumed because it exists; never decided |
| Offline scope, and may a quote be issued offline | ❌ |
| WhatsApp approach | ✅ Click-to-chat now, Business API on the Business tier |
| Support model, buy or build | ❌ |
| Payment approval staffing at launch | ❌ Rule 13 has a single-operator exception, but the actual headcount is unanswered |
| Payment and billing providers | ✅ WiPay; platform billing to confirm |
| Hosting region and data residency | ❌ Relevant: data currently leaves Jamaica (`SERVICE-REGISTER.md` §6) |
| Free-tier providers and the paid trigger | 🟡 Recorded in the service register; **the ADR Rule 10 requires is owed** |
| Data to migrate | ✅ None — no live tenants |
| Claude API budget cap | ❌ |

## What is owed, in the order I would do it

Items 1 and 2 were done on 2026-09-24. `COMPLIANCE-REVIEW.md` adds one that outranks the rest.

1. ~~Proposed edits to the brief~~ ✅ — approved and applied to `DEVELOPMENT-BRIEF.md`. The brief now carries §5a (the portfolio review), §17a (the public website), the design-before-build gate in §3, and the Foundations status in §18.
2. ~~Threat model~~ ✅.
3. ~~The independent review of `new-app`~~ ✅ **done, and its register is clear.**
3a. ~~The marketing site design~~ ✅ — `docs/design/marketing-site.md`, **Proposed**, awaiting the
   owner. The parked implementation waits on it. Its sharpest dependency is not code: if
   `hello@pryvis.com` does not receive mail, the site's only call to action is broken.
4. **PRD and domain model** (§6), in trade-neutral language (ADR 0017). The vertical slice needs
   both.
5. **Audit log** — named in Foundations, missing, and the threat model makes it the control every
   staff safeguard depends on for detection. **Next.**
6. **Finish authentication:** staff MFA (Rule 5.1 launch blocker, paused), sign-out and session
   rotation, HTTP transport, sign-up, password reset.
7. **Dependency scanning, secret scanning and an SBOM** — cheap, mechanical, and the only defence
   against a class we currently cannot see at all.
8. ~~Schema: client-generated ids and row versioning~~ ✅ **done 2026-09-24** (ADR 0019). Owed
   with the persistence layer: a guard that every repository writes `AND version = $n`, and one
   that every query filters `deleted_at IS NULL`.
9. **A `TradePack` in core** with the guard that fails on a trade branch (ADR 0017), before the
   catalog work makes construction assumptions hard to remove.
10. Answer the seven open questions, each as an ADR or a PRD entry.
