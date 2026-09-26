# Threat model

**Phase 1 deliverable, brief §6.** Written 2026-09-24, deliberately *after* the authentication
work and *before* the rest, so it either validates what exists or condemns it while changing it is
still cheap. Rule 19: it was owed and late, and the status tracker says so.

Scope: the rebuild in `new-app/`. `original-app/` is frozen and read-only; its weaknesses are
catalogued in `PHASE-0-AUDIT.md` §4 and are not re-litigated here.

**What this model is for.** Not a compliance artefact. It exists to answer three questions for
each asset: who would want it, how would they get it, and what stops them — with **the honest
status of each control**, because a threat model listing only intended controls is marketing.

---

## 1. What we are protecting, in order of how much it hurts to lose

| # | Asset | Why it matters |
|---|---|---|
| A1 | **A tenant's customer list and contact details** | Their commercial relationships. A competitor holding it is a direct business injury, and the people in it never consented to us |
| A2 | **A tenant's prices, margins and job recipes** | Their competitive advantage. Recipes are the most valuable thing they build in the product |
| A3 | **Issued documents** (quotes, invoices) | Evidence in a payment dispute. If they can be altered after issue, they are worth nothing |
| A4 | **Money movement and settlement state** | Payments, balances, retention. Wrong here means a contractor is out of pocket |
| A5 | **Credentials** — passwords, TOTP secrets, sessions, recovery codes | The key to A1–A4 for one tenant |
| A6 | **Platform staff access** | The key to A1–A4 for *every* tenant. The highest-value asset in the system |
| A7 | **Entitlements and subscription state** | Revenue integrity: paid features taken for free, or a tenant wrongly locked out |
| A8 | **Availability** | A contractor quoting on a phone at a site cannot wait; a dead API loses the customer, not just the request |
| A9 | **Our own reputation as a data processor** | Tenants' customers' personal data crosses borders through us (`SERVICE-REGISTER.md` §6) |

## 2. Who we are defending against

| | Adversary | Capability | What they want |
|---|---|---|---|
| T1 | **A curious or malicious tenant** | A valid account, the full API, time | Another tenant's customers, prices, recipes (A1, A2) |
| T2 | **An unauthenticated attacker on the internet** | Scripts, botnets, our public endpoints | Any account; or to exhaust us (A5, A8) |
| T3 | **A tenant's own staff member, or ex-staff** | Credentials that were valid, possibly still are | Data to take to a new employer; or to alter a document (A1–A3) |
| T4 | **A customer holding a share link** | One unguessable URL | Other documents, other customers' documents (A1, A3) |
| T5 | **Our own staff** | Admin capabilities, impersonation | Curiosity, fraud, or a compromised laptop (A6 — everything) |
| T6 | **An attacker who obtains a database dump** | Every row, no application, no environment | Credentials to reuse elsewhere (A5) |
| T7 | **A compromised or hostile dependency** | Code execution inside our process | Anything |
| T8 | **A provider or insider at Neon, Render, Vercel or Resend** | Storage or transit access | A1, A9 |
| T9 | **Someone defrauding the payment path** | A forged receipt, a colluding approver | Free subscriptions (A7) |

## 3. Trust boundaries

1. **Internet → API.** Everything crossing it is hostile until validated. Default-deny routes.
2. **Tenant → tenant, inside one database.** The boundary with no network to hide behind. Three
   layers: `tenant_id`, forced row-level security, application scoping (Rule 4).
3. **Authenticated → authorised.** Being signed in is not permission. Roles, capabilities and
   entitlements are separate questions.
4. **Tenant → platform staff.** Crossed only by impersonation: explicit, capability-gated,
   audited, time-bounded.
5. **Application → third parties** (Resend, WiPay, Neon, Vercel, Render). Data leaves us here.
6. **Us → Claude API.** No tenant or client personal data, and no secrets, ever (Rule 15).

## 4. Threats, controls, and what is actually true today

Status is deliberately harsh: **BUILT** means it exists with a test that fails when it is removed.

> **Corrected 2026-09-24.** An independent review (Rule 9) found three rows below claiming BUILT
> that did not meet that definition — the global default-deny guard is registered nowhere, the
> new-table guard never reads what a policy says, and the import guard misses one route. They are
> now PARTIAL with the gap named. A threat model that grades its own controls generously is worse
> than none, because it is the document people check instead of the code.

**PARTIAL** means something exists but not the whole control. **OWED** means it does not exist.

### 4.1 Cross-tenant access (T1, T3 → A1, A2)

| Threat | Control | Status | Evidence |
|---|---|---|---|
| A query missing its tenant filter returns everyone's rows | Forced RLS: no tenant in context ⇒ **zero rows**, not all rows | **BUILT** | `db/test/tenant-isolation.test.ts`; a `SELECT` with no `WHERE` returns one tenant's rows inside `withTenant` and nothing outside |
| RLS enabled but the app connects as the table owner, which Postgres exempts | `FORCE ROW LEVEL SECURITY`, asserted per table | **BUILT** | `policy-parity.test.ts` fails on enabled-but-not-forced |
| A new table ships with no policy | Every table must be tenant-protected or exempt **with a reason** | **PARTIAL** (F1) | `policy-parity.test.ts` catches a table with *no* policy, but **counts policies without reading them** — a table with `USING (true)` passes and leaks every tenant's rows. The behavioural test only queries `tenant` and `app_user`. **The most serious open finding.** |
| A caller supplies another tenant's id | Tenant comes only from the session store; a foreign id is answered as a nonexistent one | **BUILT** | `tenant-isolation.test.ts`, `db-caller-resolver.test.ts` |
| A pooled connection leaks a tenant into the next request | `set_config(..., true)` — transaction-local | **BUILT** | `tenant-context.test.ts`; planting `false` fails it |
| The readable policy file drifts from what was applied | Migration embeds it verbatim; guard compares | **BUILT** | `policy-parity.test.ts` |
| A module reaches into another module's internals and bypasses its checks | Import-boundary guard | **PARTIAL** (F3) | `import-boundaries.test.ts` catches static and dynamic imports and refuses computed specifiers — but **misses `createRequire(import.meta.url)(…)`**, in both directions |
| Exports, PDFs, cache keys, search, logs scoped per tenant | — | **OWED** | None of these exist yet; each must be tenant-scoped when built |

### 4.2 Authentication and sessions (T2, T3 → A5)

| Threat | Control | Status | Evidence |
|---|---|---|---|
| A route ships with no protection and is open | A global guard bound with `APP_GUARD`, **and** a build-time guard; route inventory printed each run | **BUILT** (F2 closed 2026-09-24) | `app.module.test.ts` boots the real application and enumerates every registered route, refusing any not intended public; removing `APP_GUARD` fails it. `route-protection-coverage.test.ts` reads every file, finds controllers by decorator and resolves renamed imports. **Still not proved:** a production bootstrap — there is no `main.ts` — and behaviour with a real session, because nothing can read one yet |
| A dump yields reusable passwords | scrypt, per-password salt, parameters in the hash | **BUILT** | `password.test.ts` |
| A corrupt hash row becomes a universal password | Lengths validated | **BUILT** | Found as a real bypass in review: `scrypt$65536$8$1$$` verified *every* password |
| Account enumeration through the sign-in response | One message for every failure | **BUILT** | `sign-in.test.ts` |
| Enumeration through response *timing* | Unknown email still pays for a real hash | **BUILT** | Planting the skip fails the test |
| Password guessing at scale | Token buckets per IP and per hashed email, before the hash | **BUILT** | `rate-limiter.test.ts`, `sign-in.test.ts` |
| A demoted or sacked user keeps their powers | Role and status re-read from the database every request | **BUILT** | `db-caller-resolver.test.ts` |
| A stolen session cannot be killed | `session_version`; one UPDATE invalidates every token | **BUILT** | Same file |
| **Staff sign in with only a password** | MFA mandatory for staff (Rule 5.1) | **OWED — schema only, service paused** | Highest-severity open item |
| A stolen session is long-lived | 12-hour expiry | **PARTIAL** | Expiry yes; **rotation-on-use owed** |
| A token is replayed after sign-out | Revocation column exists | **PARTIAL** | Nothing calls it: **sign-out is not built** |
| Password reset abused to take over an account | Single-use expiring tokens, no existence disclosure | **OWED** | Reset does not exist |
| Credential stuffing using breached passwords | Breach-list check at sign-up | **OWED** | Worth doing; cheap via a k-anonymity API |

### 4.3 Public surfaces (T2, T4 → A1, A3)

| Threat | Control | Status |
|---|---|---|
| A share token exposes more than its one document | Token scopes to one document; unknown, draft and withdrawn answered identically | **OWED** — the route kind is declared and named, no such route exists yet |
| A share link becomes a login | `@ShareTokenRoute` never mints a session | **BUILT** (as a property of the guard: no caller is resolved) |
| Registration confirms whether an email is registered | Duplicate answers as new; the existing owner is emailed | **OWED** — registration not built; ADR 0015 fixes the design |
| Registration creates unlimited tenants, or sends mail on demand | Rate limits, email verification before anything costly | **OWED** |
| A hostile upload (malware, zip bomb, SVG with script) | Type, size, dimension checks; scanning; private tenant-scoped storage | **OWED** — no uploads yet |

### 4.4 Platform staff (T5 → A6, everything)

| Threat | Control | Status |
|---|---|---|
| One stolen staff password yields every tenant's data | MFA mandatory; hardware key for impersonators | **OWED** — the single largest risk in the product |
| "Admin" means everything | Named capabilities, granted by another named person, revocable, audited | **PARTIAL** — `platform_capability` schema exists; nothing reads it yet |
| Impersonation used casually or unnoticed | Recorded reason, time limit, visible to the tenant, audited | **OWED** |
| Staff browse tenant data out of curiosity | No standing access; time-limited, logged, reviewed | **OWED** |
| An ex-employee retains access | Same-day offboarding; `session_version` makes it one update | **PARTIAL** — mechanism exists, process does not |
| Staff edit the audit trail | Append-only; staff cannot modify | **OWED** — no audit log at all yet, and §18 puts it in Foundations |

### 4.5 Document and money integrity (T3, T9 → A3, A4, A7)

| Threat | Control | Status |
|---|---|---|
| An issued document is altered after the fact | Immutable snapshot enforced by the database, not convention | **OWED** — the audit found it was convention in `original-app` |
| A figure exceeds the column and wraps or is rejected late | 64-bit minor units, ceiling validated at one boundary (ADR 0011) | **OWED** — decided, not built |
| Two documents collide on a number, or a number is skipped | Per-tenant atomic assignment | **OWED** in `new-app` (worked in `original-app`; must be ported) |
| A manual payment activates a subscription with no second pair of eyes | Submitter ≠ approver ≠ activator; verified against the bank record, not the receipt | **OWED** — Rule 13 written, nothing built |
| A paid feature is used on Free | One entitlement resolver, server-side | **OWED** — the reason tiers are feature 1 |
| Money values differ between screens | One rule in core, imported everywhere; a guard fails on a restatement | **OWED** in `new-app` — exists in `original-app` and must be ported with its guard |

### 4.6 Infrastructure, dependencies, providers (T6, T7, T8 → A5, A8, A9)

| Threat | Control | Status |
|---|---|---|
| A dependency with a known vulnerability ships | Dependency scanning in CI + an SBOM | **OWED** — named in Rule 18 and the audit |
| A secret is committed | Secret scanning in CI | **OWED** |
| A secret reaches a log | No personal data or secrets in logs; reviewed | **PARTIAL** — the rule exists; no log redaction code yet |
| A database dump yields TOTP secrets alongside password hashes | Secrets encrypted at rest, key in configuration only | **PARTIAL** — schema designed for it; service paused. Honest limit: an attacker with **both** database and environment has them; no KMS |
| Backups exist but have never been restored | Tested restores | **OWED** — `SERVICE-REGISTER.md` §6 calls the backup "a belief" |
| Volumetric attack exhausts the free instance | App-level limits; a CDN or WAF above | **PARTIAL** — app limits built; nothing upstream |
| A provider reads tenant data | Contractual, not technical | **ACCEPTED** — recorded in the register; field-level encryption is not proportionate at this stage |
| Tenant data sent to the Claude API | Redacted or synthetic only (Rule 15) | **PROCESS** — a discipline, not yet a technical control |

## 4a. The contractor's phone is now a place tenant data lives (added 2026-09-25, G14)

Review found **one** device line in this whole model, about staff laptops, while the release-1 amendments
put a tenant's catalog, client book, labour rates and **sealed financial documents** on a contractor's
phone, held until it can sync. That is a new trust boundary and it was undefended here.

| Threat | What is actually true today | Control |
|---|---|---|
| **A lost or stolen phone** holds the catalog, the client book and sealed issues | The outbox is specified as encrypted at rest (PRD R1.18) and nothing verifies that claim yet | Local encryption keyed to the device's own keystore, a session that expires, and the app locking behind the device's own authentication. **An unlocked phone is an authenticated user and no app-level control changes that** |
| **Remote sign-out cannot reach an offline device** — and that device may hold the only copy of a sealed document | Stated as a control in brief §13; it is a *server* control and the offline device is precisely the case it cannot reach | Honest statement instead of a false control: sign-out revokes the **session**, so the device can no longer sync or fetch, and the local store is wiped **when it next connects**. Until then the data is on the phone. The mitigation that actually works is expiry — a local store with a maximum age — and **it must never delete a sealed document that has not reached the server** (domain model §8) |
| **A sealed document is the only copy** | True by construction while it waits | Visible pending count, a warning after a few days (R1.18b), and the draft survives so the job can be re-priced. **An outbox is not a backup and the product must not imply it is** |
| **The pre-rendered share page** (R1.21a) is served without the API answering | Unexamined until now | The link is a **credential**: high-entropy, hashed at rest, scoped to one issue, expiring, revocable. Pre-rendering must not make a document readable by a URL that is guessable, cached by an intermediary, or still live after revocation — so revocation has to invalidate the cached copy, which is a requirement on whatever serves it, not a detail |
| **An uploaded "signed" copy is forgeable** by either side (R1.20c) | New in release 1 | We record who uploaded it and when, and **we do not certify it**. A tenant can forge one as easily as a client can, and saying so plainly is the control — a product that vouched for it would be making a claim it cannot support |
| **The verification code channel** (R1.20b) is the attribution for an e-signature | New in release 1 | A code is single-use, short-lived, rate-limited per issue and per recipient, and the channel it went to is recorded on the acceptance. Guessing a six-digit code with no rate limit is the whole attack |

**What this section does not cover:** anything about the device's own operating system, a rooted or
malware-bearing phone, or a tenant's staff photographing a client list. Those are real and are outside what
we can control; the honest position is that a tenant's data on a tenant's phone is partly the tenant's
responsibility, and the terms should say so rather than implying we can protect it there.

## 4b. Registration, which is the one unauthenticated endpoint that creates rows (added 2026-09-26, H14)

| Threat | What is actually true today | Control |
|---|---|---|
| **An email bomb aimed at a known tenant.** A duplicate registration deliberately does not reveal the address is taken and **mails the existing owner instead** (Rule 14) — so anyone who knows a tenant's address can make us send them a hundred messages | Nothing is built yet, and the PRD's own list of registration bounds had silently dropped the per-address limit while presenting itself as exhaustive | A rate limit **per address** as well as per IP (PRD R1.30d). The non-enumerating response is right and it is exactly what creates this, which is why the two must ship together |
| **Volume registration to burn our sending quota or reputation** | — | Verification before anything costs us money: an unverified claim reserves nothing and sends one message |
| **Squatting on a competitor's address** to lock them out | The unique index is on `app_user.email`, and a claim is not a user (ADR 0025 decision 5) | Claims expire in 72 hours; the address is taken only on verification, so squatting requires controlling the mailbox |
| **CGNAT makes an IP bound useless or harmful** | Jamaican mobile networks put tens of thousands of subscribers behind one address | The IP limit is on *attempts* and deliberately loose; the real defences are verification and the free tier's own cost ceiling. **No device fingerprinting** — it was proposed and removed as a tracking technology nobody had weighed |

**What this section does not cover:** a determined attacker with many real mailboxes. They can create many
free tenants, and the bound on what each can consume (three numbered jobs a month) is what makes that
pointless rather than any identity check.

## 4c. The tenant supplies the client's address, so an acceptance proves little against the tenant (added 2026-09-26, H10)

The threat nobody had written down: **the party most likely to be in a dispute with a client is the tenant,
and the tenant is who tells us the client's email or WhatsApp number.** A one-time code sent to that
address, confirmed by whoever holds it, is worth nothing if the tenant holds it.

This is not a defect to fix. It is a structural limit of any flow where one party names the other's
address, and the honest responses are the two the acceptance design uses
(`docs/design/acceptance-evidence.md`):

| Response | Why it helps |
|---|---|
| **A third party the tenant does not control enters the chain** | Money (a bank or WiPay), an inbound reply held by Google or Meta, or a signature provider doing identity checks. None can be fabricated by the tenant |
| **The evidence is labelled** | A six-grade ladder with the grade **derived** from append-only evidence, so nothing in the product claims more than happened. A tenant-uploaded screenshot is grade 1 |

**What this means for release 1:** the strongest grade available without new infrastructure is a **deposit**,
because the bank is the witness. Grade 4 — the client's own reply — needs inbound handling we have not
bought (`SERVICE-REGISTER.md` §3b).

**What we must never do:** present a grade-3 acceptance as proof against the tenant. It proves someone
holding the tenant-supplied channel confirmed a code, which is a different sentence, and the UI must say
the second one.

## 5. The five things I would fix first, in order

1. **Staff MFA** (§4.4). One password currently stands between an attacker and every tenant's
   data. Paused mid-build; Rule 5.1 calls it a launch blocker and this model agrees.
2. **The audit log** (§4.4). Without it, none of the staff controls can be *detected*, only
   intended — and §18 puts it in Foundations, where it is missing.
3. **Dependency and secret scanning, plus an SBOM** (§4.6). Cheap, mechanical, and the only
   defence against a class we currently cannot see at all.
4. **Sign-out and session rotation** (§4.2). A revocation column nothing calls is not revocation.
5. **Issued-document immutability as a database property** (§4.5) — before documents exist, because
   retrofitting immutability onto live data is far harder.

## 6. What this model does not cover

- **Physical and personnel security**, beyond staff access controls. We have no offices and no
  devices under management; a compromised laptop is a real vector with no technical answer here.
- **Denial of service at network scale.** Application limits cannot address it, and nothing sits
  upstream.
- **Regulatory analysis.** Jamaica's Data Protection Act and Trinidad & Tobago's equivalent bear on
  §4.6 and A9. This model notes that data leaves the country; it is not legal advice, and a
  compliance review is owed before the second country.
- **`original-app/`.** Frozen. Its risks are in the audit, and the only mitigation is replacing it.
- **Quantitative likelihood.** Every "status" here is evidence-based; the ordering in §5 is
  judgement, and the owner may reasonably order it differently.
