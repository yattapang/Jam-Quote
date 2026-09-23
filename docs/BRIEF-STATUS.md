# Where we are against the development brief

**Why this file exists.** The owner asked on 2026-09-24 whether we were drifting — following the
brief and updating it — and the honest answer was partly yes. Nothing tracked our position
against the brief's own phases, so drift was possible without anyone noticing. This is that
tracker, and Rule 19 requires it to be read at the start of a task and updated at the end.

**Legend:** ✅ done · 🟡 partly done · ❌ not started · ⏭️ deliberately later

Last reviewed: **2026-09-24**, at commit `f057400` plus the in-flight MFA work.

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
| Product-scope recommendation | ✅ | §6 — one product; owner confirmed the UAE HVAC app is not theirs |
| **Proposed edits to the brief after the audit** | ❌ | **Skipped. Owed first.** |

## Phase 1 — requirements and design (§6)

| Deliverable | State | Note |
|---|---|---|
| PRD (users, workflows, scope for first country and release) | ❌ | Nothing written |
| Domain model | ❌ | Entities exist in ADRs and the schema, never mapped as a whole |
| Threat model | ❌ | The security work so far implies one; it has never been written down, so it cannot be reviewed |
| ADRs | ✅ | 16, dated, with alternatives and consequences |
| Target database schema for approval | 🟡 | The authentication slice is built and approved piecemeal; the product schema has not been designed or approved |

## §18 delivery order

**1. Foundations**

| Item | State | Evidence |
|---|---|---|
| Authentication | 🟡 | Default-deny routes, identity re-resolved per request, revocable sessions, sign-in, rate limiting (ADRs 0013–0016). **Owed:** staff MFA (in flight), HTTP transport, sign-up, password reset |
| Tenancy with cross-tenant leak tests | ✅ | `tenant_id` + forced RLS + `withTenant`, proved against real Postgres; every table must now be protected or exempt with a reason |
| Schema | 🟡 | Auth tables only. **Owed:** client-generated ids and versioning for future sync, which §18 names explicitly |
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

1. **Proposed edits to the brief** (§5's final step) — the skipped item.
2. **Threat model** (§6) — most valuable now, because it retroactively validates or challenges
   the authentication work rather than being written after the fact.
3. **PRD and domain model** (§6), which the first vertical slice needs anyway.
4. **Audit log** — named in Foundations and missing.
5. **Finish authentication:** staff MFA (Rule 5.1 calls it a launch blocker), HTTP transport,
   sign-up, password reset.
6. **Schema: client-generated ids and row versioning**, since §18 puts them in step 1 precisely so
   sync is not a retrofit.
7. Answer the seven open questions, each as an ADR or a PRD entry.
