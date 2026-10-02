# Planning baseline audit — the original brief, against where we are

**Date:** 2026-10-02 · **Asked by the owner** after approving the PRD: *"go back to the basics of my planning
and requirements … ensure all required planning is completed before building … all needed rules are
created and adhered to … not drift from the guidelines originally specified … a registry of all third
party support needed and why each was chosen."* · **Against:** `docs/DEVELOPMENT-BRIEF.md` (revised
2026-09-24), the approved `docs/PRD.md`, `docs/RULES.md`, ADRs 0001-0030, `docs/design/`, and the code.

**What this is:** every owner requirement and every recommendation in the brief, mapped to where it is
decided, designed and built — and every place we have drifted, with a recommendation. **It changes nothing
by itself.** Where the plan is followed, nothing is proposed. Where it is not, the owner decides.

**Method and its limits (Rule 21.4).** Each row was checked against the files named in it, by reading or by
a command, on 2026-10-02 at HEAD `50d1235`. It is the builder's audit of the builder's work, so it is **not an
independent check** (Rule 24.6); an independent read of it is recommended before the designs start (§8). *("The six designs" are ADR 0030's; §7's list is longer — it contains those six and the other designs the PRD needs, finding PA1.)*
Legal and tax statements are not verified here.

---

## 0. Resolved since this audit was written (2026-10-02, same day)

- **D-1 decided by the owner:** a revision keeps its quote's number with a suffix (ADR 0031); PRD R1.14, R1.15
  and R1.32 amended.
- **D-2 resolved:** Rule 25, "Customer service and feedback", added through Rule 23.
- **D-3 resolved:** Rules 6, 11 and 12 amended to match ADR 0027 D10-D12 and ADR 0031, through Rule 23 (the
  citations of each reviewed), with the three dated notes Rule 23.5 requires in the brief.
- **The stale headers corrected:** the audit-log and row-identity designs, and `new-app/CLAUDE.md`'s MFA line.
- **Not approved by the owner:** the wider brief edits (brief §11's exemption count, §13 and §19's answers) —
  left as written; this audit records where they are stale.
- **Approved:** an independent read of this audit, before the designs start.

The sections below are the audit as written; §0 says what has changed since.

## 1. The verdict in one paragraph

**The planning is mostly in place and mostly followed, with three real drifts and a set of owed designs.**
The Phase 1 artefacts the brief requires exist and are approved: the PRD (approved 2026-10-02), the domain
model, the threat model, 30 ADRs and the register of third-party services. Tenant isolation, security,
money integrity and the public site follow the brief closely and are proved by tests. **The drifts:** a
decision that contradicts the brief on document numbering (§5, D-1); an owner requirement — customer
feedback feeding maintenance — that had no rule and no requirement until ADR 0030 (D-2); and three rules whose
text the owner's recent decisions have overtaken (D-3). **The gaps:** about twelve designs are owed before
the workflows they cover are built (§7), and the engineering-practice items of brief §17 (environments,
infrastructure as code, observability, tested restores) have a direction (ADR 0030) but no design. Build
order also drifted earlier — the documents data layer was built ahead of step 2 — but that was the owner's
recorded decision (ADR 0025), not an accident.

## 2. The ten owner requirements (brief §2)

| # | Requirement | Rule | Decided / planned | Designed | Built | Status |
|---|---|---|---|---|---|---|
| 1 | Strict data isolation between tenants and their clients | Rule 4 | ADR 0006, 0013; PRD N1 | Domain model; `design/privilege-model.md` | `tenant_id` + forced row security + `withTenant`, leak tests, policy-parity guard, the privilege model | **On plan.** The strongest-proved part of the system |
| 2 | Send documents by email and WhatsApp from the app | Rule 11 | PRD R1.21, R1.21b-c, R1.28; ADR 0027 D10 | **Owed:** the outbound messaging service | Nothing | **On plan, design owed** (§7) |
| 3 | The mobile app works offline | Rule 12 | ADRs 0023, 0027 D1-D2, 0028 (mobile follows the web launch) | Domain model §8 (amended); **owed:** the mobile sync design | Nothing | **On plan as re-decided by the owner** — offline arrives with the mobile app (ADR 0028). Rule 12's text needs aligning (D-3) |
| 4 | Security protects tenants' and their clients' data | Rules 4, 5, 5.1 | `THREAT-MODEL.md`; PRD N6-N8, R1.44-R1.45 | Privilege model, staff MFA, audit log | Auth, sessions, rate limiting, MFA service, audit log, privilege model | **Mostly on plan.** Owed: tested restores, the breach plan (R1.45), the processing agreement, field-level encryption *considered* (brief §11) — and **staff MFA's remaining items stay a launch blocker** (ADR 0021 lists them) |
| 5 | Manual payments approved by a different person; a receipt-upload form | Rule 13 | PRD R1.33-R1.37, W10 | **Owed:** the payment-approval flow and the staff console | Nothing | **On plan, design owed.** The second staff member is not yet named (owner, ADR 0028) |
| 6 | Maintainable with the Claude API, pay as you go | Rules 15, 16 | Brief §16; ADR 0030 decision 5 | **Owed:** environments and operations (runbooks, logs, error tracking, PR automation, a spend cap) | Rules 16.7-16.9, `tools/run_brief.py`, the delegation log | **Partly.** The spend cap is still unset (PRD §9 item 10) |
| 7 | Customer service built in; feedback helps maintenance | **None** | PRD R1.38 (email at launch); ADR 0030 decisions 3-4 | **Owed:** support and feedback design | Nothing | **Drift D-2:** no rule, and until ADR 0030 no requirement for the feedback loop |
| 8 | Two folders, structure designed up front | Rule 1.3 | ADRs 0010, 0012 | `new-app/CLAUDE.md` | `original-app/` and `new-app/`, each its own workspace | **On plan.** the `infra` and `mobile` folders of brief §4 are planned, not created |
| 9 | Free tier first, a planned path to paid | Rule 10 | ADR 0026 (paid and always on at launch); the register | **Owed:** environments and operations | Free tiers in use for the old application; the rebuilt API has no deployment | **Mostly on plan.** "Back up from day one": a backup exists and has **never been restored** (register §6) |
| 10 | Tenants brand their documents: logo, header, numbering, colours | Rule 6 (numbering only) | PRD R1.13-R1.16; domain model `document_settings` | **Owed:** document settings and the PDF | `document_settings` holds only the acceptance bar and the deposit threshold — **no logo, header or colour columns yet** | **On plan, design owed** — and **drift D-1** on numbering |

## 3. The working agreement (brief §3)

| Agreement | Followed? |
|---|---|
| Design before code — a gate | **Breached twice, as recorded in `BRIEF-STATUS.md`:** Foundations ahead of Phase 1, and the site without a design. **A third departure** — the documents data layer built before the PRD was approved — is recorded in the PRD's header; ADR 0025 records the owner's decision to move five invariants into a migration, not a decision to build ahead of the PRD (corrected after finding PA8). Whether every later built thing had its design first was not checked here. From here, **each workflow needs its own approved design** (PRD header) |
| Audit before rebuild | Followed (`PHASE-0-AUDIT.md`) |
| Small, reviewable changes | Mostly; the review-fix commits have been large |
| Tests first or alongside | Followed — and stricter: every control is proved by a planted defect |
| Explain decisions with options | Followed (ADRs, owner questions with options) — **except the support model (§15), decided before its options paper** — now owed (ADR 0030) |
| Flag, don't assume | Followed |
| The owner reviews every diff | **Not literally:** work is pushed to a branch the owner has not reviewed diff by diff; independent agent reviews stand in. **For the owner to confirm or tighten** — e.g. a pull request per design's build |

## 4. The brief's recommendations, section by section

| § | Recommendation | Where it stands |
|---|---|---|
| 7 | Modular monolith; **API-first, OpenAPI** | Monolith yes; OpenAPI **owed** (API layer design, ADR 0030) |
| 7 | PostgreSQL, `tenant_id`, row security, migrations only | Built |
| 7 | Client-generated UUIDs, `updated_at`, versions | Built (ADR 0019) |
| 7 | Mobile framework chosen by offline capability, as an ADR | ADR 0027 D2 (React Native/Expo), timing ADR 0028 |
| 7 | Portable tech; config not code; files out of the database; object storage from day one; backups from day one; free-tier ADR with a trigger | Portable and config-driven: yes. Object storage: **unchosen** (ADR 0030 → Cloudflare R2). Backups: **untested**. Trigger: **partly** — ADR 0026 makes the API host paid at launch, but Rule 10's ADR needs a concrete threshold and the paid equivalent for every free-tier piece, the database and storage included; that is owed with design 4 (finding PA7) |
| 8 | Money in minor units; tax rules, formats and wording as data per jurisdiction; UTC; i18n from the first screen; payment-provider abstraction; data protection reviewed early | Money: built. **Tax as data: owed** (the rule pack is owed in the rebuild; the GCT design, ADR 0030, now includes tenant-entered rates). UTC and i18n: in Rule 3, nothing of the UI built yet. **Payments abstraction: owed** — a brief recommendation (§8, §14) not yet placed in any decision; proposed for design 10, payments (finding PA5). Data protection: public information now, attorney before launch (ADR 0027 D14) |
| 9 | Plans and entitlements as data, one service, separate from billing, covering message costs | Decided (Rule 14, ADR 0007, PRD R1.31, R1.21c); `core/entitlements` **owed** |
| 10 | Immutable snapshots, revisions, audit log, soft deletes; per-tenant document settings; numbering with prefix, start and **reset rule**; **"the assigned number … never changes on revision"** | Snapshots, revisions, audit log, soft deletes: built. Reset rule: **removed for R1 by the owner** (ADR 0027 D11). Revision numbering: **drift D-1** |
| 11 | Isolation in layers; staff access logged; minimisation; encryption; export and deletion; terms, privacy, DPA reviewed by a lawyer; OWASP; MFA; secrets; dependency scanning; tested restores; breach plan; mobile encryption and remote sign-out | Isolation, MFA service, secret and dependency scanning: built. Export (R1.43), data requests (R1.44), breach plan (R1.45): required, not built. Lawyer: before launch (ADR 0027 D14). Tested restores: **owed** |
| 12 | One outbound service, pluggable channels; SPF/DKIM/DMARC; bounces; WhatsApp via approved provider or click-to-chat; delivery status; idempotent; consent; costs in entitlements; offline-requested messages queued | All required by the PRD; the service is **owed**. The sending domain is an owner dependency (§9 item 1a) |
| 13 | Local DB, sync engine, per-entity conflict rules; ADRs on what is cached and issued offline; encrypted; remote sign-out; sync status; web online-only unless decided | Decided for the mobile app (ADRs 0023, 0027, 0028); **the web is online-only, as the brief's default says** |
| 14 | Separation of duties; receipt upload; bank-statement verification; single-operator exception | PRD R1.33-R1.37, W10; design owed |
| 15 | **Present support options with costs before deciding**; bot rules; feedback-to-maintenance loop | Direction set (ADR 0030); **the options paper and the feedback design are owed** (D-2) |
| 16 | PR-based automation; least privilege; budgets and caps; runbooks; structured logs; no personal data to the API | PR-based and Rule 15: in place as practice. Runbooks, logs, error tracking, spend cap: **owed** |
| 17 | CI/CD with dev, staging, production; infrastructure as code; unit, integration, e2e and contract tests; observability; tested restores | CI: built (`.github/workflows/verify.yml`). Environments, IaC, e2e, observability, restores: **owed** (environments and operations design). **Contract tests: partly** — CI already fails when the checked-in wire contract drifts from the API's `@wire` types (`.github/workflows/verify.yml`, `new-app/packages/contract/`); the OpenAPI contract and its test are owed with design 2 (finding PA6) |
| 17a | The public site; terms and privacy approved | Built and guarded; terms and privacy are drafts until the attorney — **including the aggregate-data consent clause brief §5a requires before the first sign-up** (finding PA2) |

## 5. Drift — where we have departed from the brief or our own rules

**D-1 · Document numbers on revision.** Brief §10: *"The assigned number is fixed as part of the immutable
snapshot above and never changes on revision."* The approved PRD (R1.15, R1.32) makes a revision **a new
issue taking a new number** from the series, and the meter counts distinct quotes so revisions are free. These
contradict each other, and the schema follows the PRD. **For the owner to decide**, in the numbering design:
(a) keep the brief — a revision keeps its quote's number with a suffix (Q-0042 rev 2), which is what clients and
accountants usually cite; or (b) amend the brief to the PRD's rule. **Recommended: (a)** — it was your stated
requirement, it reads better on paper, and the metering does not depend on it. It changes how `issue_number` is
allocated, so it belongs in the numbering part of the GCT-and-documents work before W4 is built.

**D-2 · Owner requirement 7 had no rule and no requirement.** Customer service and the feedback loop are an
owner requirement in the brief; `docs/RULES.md` has no rule for them, and the PRD had no feedback requirement
until ADR 0030 set its direction. **Recommended:** a new rule, "Customer service and feedback (owner
requirement)", stating the bot rules of brief §15 and Rule 15's boundary, added through Rule 23; and a PRD
requirement for the feedback loop written with its design.

**D-3 · Three rules overtaken by the owner's decisions.** Rule 6 says numbering has a **reset rule** (now
never, ADR 0027 D11); Rule 11 says **messages requested offline are queued** (the owner decided nothing is sent
on its own — the contractor taps send, ADR 0027 D10 — so the rule should say a send tapped offline is queued and
nothing else is); Rule 12 says offline data has a **retention limit** (the owner decided an unsynced seal has
none, PRD R1.18d). **Recommended:** amend all three through Rule 23 so the rules and the decisions say the same
thing — Rule 19 requires the plan of record to be kept true.

**Also stale (correct in passing, no decision needed):** `docs/design/audit-log.md` and
`docs/design/row-identity-and-versioning.md` say "Proposed" though ADRs 0020 and 0019 record the owner's
approval and both are built; `new-app/CLAUDE.md` says of MFA "None of it is built" though the staff
second-factor service is (ADR 0021); brief §11 says there are "exactly two" exemptions from row security (the
privilege model changed that); brief §13's and §19's answers predate ADRs 0027-0029. The brief is a living
document (§1): **recommended**, a short set of proposed brief edits for the owner to approve, as was done on
2026-09-24.

## 6. Rules: created and adhered to?

Rules exist for every owner requirement except **7** (D-2), and requirement 10 is covered only for numbering
— the branding half is in the PRD and domain model, which is enough until its design. The rules are enforced
mechanically where they can be — `tools/check_rules.py`, `check_dispositions.py`, `check_citations.py`,
`check_schema_citations.py`, `run_brief.py`, and the code guards — and the four checkers ran clean on every
commit today. One adherence gap was found and fixed today: the disposition checker could not read review 5
(M42). Rule 15 (no personal data to a model) was the reason the chatbot left the web launch (ADR 0029 E1).

## 7. Planning still owed before building — the complete list

Ordered as agreed (ADR 0030), then by when the workflow is needed. Each is a design for the owner's approval;
nothing in it is built before then.

| # | Design | Unblocks | Includes |
|---|---|---|---|
| 1 | **Tax (GCT in Jamaica) and documents** | W3, W4, W7 | **The tax's name, label and registration-number name per country, as rule-pack data, with a guard against "GCT" in code** (owner, 2026-10-02); tax per invoice, tenant-entered rates per country, TRN, credit notes, refunds and client credits; whether a variation's total and the invoiced figure are net or gross; what a non-registered tenant's lines carry; **numbering (D-1, ADR 0031)**; the rule pack for Jamaica (PRD R1.9; finding PA3) |
| 2 | **API layer** | Everything with a screen | OpenAPI and its contract test, cookie sessions and CSRF, errors, idempotency, validation, start-up wiring (ADR 0030 decision 2); tenant context carried by background jobs and every storage path, signed URL and cache key tenant-scoped (brief §11) |
| 3 | **Support and feedback** | R1.38, owner requirement 7 | The options paper with costs (brief §15), the chatbot under Rule 15, the feedback loop, the new rule (D-2) |
| 4 | **Environments and operations** | Launch | Three environments, the blueprint, region, backups and restore drills, observability with no personal data in logs, runbooks, the Claude spend cap; **Rule 10's trigger with thresholds and paid equivalents for every free-tier piece** (PA7); connection pooling and cold-start tolerance; feature flags, staged rollouts and rollback; dependency updates as automated pull requests; the model tiers of Rule 15 (brief §§7, 16) |
| 5 | **The register completed** | R1.16, R1.16a, R1.33, R1.36 — logos, rendered PDFs and receipts need storage (PRD §9 item 1d; corrected from "R1.13", finding PA4) | R2, ClamAV, Sentry, uptime, inbox — each with "why this one" and privacy-notice lines; the rows for tenants' encrypted WiPay credentials in the register and the threat model (PRD R1.29); upload security — type, size, scanning, duplicates (brief §14) |
| 6 | **Outbound messaging** | W4 delivery, W5, R1.28 | One service, channels, delivery status and bounces, opt-out, message caps; always the issued snapshot, as a PDF or an expiring link; per-tenant sender name and reply-to; channel rules per country (brief §§8, 12) |
| 7 | **Document settings and the PDF** | W4, owner requirement 10 | Logo, header, colours, terms; the shared layout and its presets; the render and its hash; the original application's branding cross-checked (brief §10) |
| 8 | **Sign-up and verification** | W9, the first slice (brief §18 step 2) | Registration, the equality guard (PRD R1.30c), duplicate handling |
| 9 | **Share page and accept flow** | W5 | The always-on page, codes, the channel-aware bar |
| 10 | **Payments and the staff console** | W7, W9, W10, owner requirement 5 | Manual approval, card upgrade, per-tenant WiPay with server confirmation (and WiPay's answer on a transaction-status query), **the payments abstraction** (brief §8, §14; PA5), the email-receipt fallback, the console's screens, the platform audit trail |
| 11 | **Each workflow's screens** (W1-W10) | Each workflow | What the user sees and does — the PRD says what must be possible, not what it looks like |
| 12 | **The mobile app and sync** | The mobile launch | Seal-only offline, the outbox, revocation, the keystore — after the web launch; the logo and settings available offline; clock differences; tests under poor networks (brief §§10, 13) |
| 13 | **Data rights and the tenant's audit trail** (added after finding PA3) | Launch | Data export (R1.43), a person's requests about their data (R1.44), the written breach response (R1.45), and the tenant-readable audit trail (R1.40) |
| 14 | **The nightly reconciliation job** (added after finding PA3) | W7 | R1.24e: the hold the invoicing path reads, its clearing by staff with a recorded reason, the alert |

Owner dependencies that do not need a design but block launch are in PRD §9: `info@pryvis.com` receiving mail;
the sending domain; WiPay's answers; the malware scanner and object storage (designs 5); prices; approved legal
wording; **the aggregate-data consent clause in the terms — which blocks registration, not only launch** (brief
§5a: it "cannot be retro-fitted", so it must exist before the first tenant signs up; finding PA2); the second
staff member; the attorney; a paid host for the API; the accountant; app-store accounts; the Claude cap.

## 8. Recommended next steps

1. **The owner decides D-1** (revision numbering) — it shapes design 1.
2. **Rule changes through Rule 23:** a new rule for customer service and feedback (D-2); Rules 6, 11, 12
   aligned with the owner's decisions (D-3).
3. **Proposed brief edits** for the stale sections (§5's last paragraph), for the owner's approval.
4. **An independent read of this audit** (Sonnet, mechanical: every row's file checked) before the designs
   start, because this is the builder auditing the builder.
5. **The designs, in §7's order**, each approved before anything in it is built.

## 9. After the independent read (2026-10-02)

An independent read (Sonnet, brief `docs/briefs/2026-10-02-planning-audit-read.md`, at `fd10219`) found no row of
§2 false in substance, and nine gaps or imprecisions, PA1-PA9, all corrected above:

- **PA1:** "the six designs" are ADR 0030's; §7's list is the full set.
- **PA2:** the aggregate-data consent clause (brief §5a) was missing from the dependencies; it blocks registration.
- **PA3:** data export, data requests, the breach response and the tenant's audit trail (R1.40, R1.43-R1.45) and the
  reconciliation job (R1.24e) had no design — designs 13 and 14 added; design 1 and 5's contents completed.
- **PA4:** design 5 unblocks R1.16, R1.16a, R1.33 and R1.36, not R1.13.
- **PA5:** the payments abstraction is a brief recommendation not yet decided anywhere; placed in design 10.
- **PA6:** CI already checks the wire contract for drift; the OpenAPI contract test is what is owed.
- **PA7:** ADR 0026 covers the API host only; Rule 10's full trigger is owed with design 4.
- **PA8:** "breached three times, each recorded" overstated; corrected in §3.
- **PA9:** the brief items without a row — free-tier limits (pooling, cold starts), messaging rules per country,
  offline logo and settings, cross-checking the original branding, tenant-scoped storage, cache and logs, no
  personal data in logs, the issued snapshot as PDF or link, per-tenant sender and reply-to, clock differences and
  poor networks, upload security and the email fallback, support response times (Rule 25.3), feature flags and
  rollback, automated dependency updates, model tiers — are now each placed in a design in §7.
