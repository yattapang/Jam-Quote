# ADR 0027 — Release 1's money, offline, platform, support and legal decisions (PRD review 5)

- **Status:** Accepted
- **Date:** 2026-10-02
- **Decided by:** the owner, accepting PRD review 5's recommendations D1-D14 (`docs/PRD-REVIEW-5.md`, summary
  §3), with two adjustments (D9, D14) and one choice the review left open (D2).
- **Affects:** `docs/PRD.md` (§4, §6, §7, §8, §9, §10, §11, §12, W3-W9), `docs/TIERS.md`, ADR 0023, the
  marketing site's copy, `docs/THREAT-MODEL.md`, `docs/SERVICE-REGISTER.md`. The PRD amendments are owed
  and tracked against review 5's findings.
- **Delegation (Rule 16.5):** Opus — product decisions over the plan of record.

## Context

Review 5 recommended not approving the PRD: five blockers were about whether release 1 can charge, tax,
collect and keep what it promises (B4, B5, B7, B9, B10), and each needed an owner decision. It listed
fourteen, with a recommendation for each.

## Decisions

| # | Decision | Answer |
|---|---|---|
| D1 | Offline scope in release 1 (B5) | **Seal-only offline:** cached reads, drafts on one device, and sealing. Creating records offline, offline variations and merging drafts across devices move to release 2. |
| D2 | App platform (B5, B22) | **React Native with Expo**, on Android and iOS: offline data in the device's encrypted keystore, and R1.18f's wipe as written. App-store accounts and review are a dependency (§9). |
| D3 | Whose WiPay account takes a client's card payment (B9) | **Each Pro tenant's own WiPay merchant account.** Pryvis never holds client money. Owed: confirm WiPay offers this to small Jamaican businesses, and what onboarding asks of them. |
| D4 | How tenants pay us (B7) | **Card in release 1 if WiPay supports it for our own account** (otherwise the manual flow, stated). On lapse: everything stays readable, money already invoiced can still be collected, reminders stop, and export always works. The billing term (monthly or yearly) is set with prices. |
| D5 | Pro seats (B6) | **About three users, no roles.** |
| D6 | Default acceptance bar for a client reachable only on WhatsApp (B18) | **Channel-aware:** grade 3 when the client has email, grade 2 when they do not. |
| D7 | Is the invoicing ceiling tax-inclusive (B10)? | **Tax-exclusive**, with GCT computed per invoice, which avoids the rate-change trap. Checked against the public guidance of Tax Administration Jamaica now; **an accountant reviews it before launch**. |
| D8 | Data export in release 1 (B4, B8) | **Build it.** |
| D9 | Support and staff access (B15, B26) | **Email support in release 1, and no staff impersonation in release 1.** *Owner's adjustment:* **a support chatbot as well, if possible.** It may see no tenant or client data (Rule 15: none goes to a model): it answers from our own help content and hands off to email, and its cost sits inside the Claude budget, which is not yet decided. If that budget is not set before release 1, the chatbot follows it. |
| D10 | Is a sealed quote sent automatically when the phone reconnects (B16)? | **No — the contractor taps send.** |
| D11 | Document number resets (B20) | **Never reset in release 1;** the year goes in the prefix. |
| D12 | A revoked device holding unsynced seals (B23) | **Re-authenticate and push first;** wipe without pushing only for a device marked lost. |
| D13 | Scope moves (B26) | **Move the signed-copy upload (R1.20c) to release 2; add retention billing guidance to release 1.** |
| D14 | Legal (B8, B22) | *Owner's adjustment:* **public legal information for now; an attorney before full launch.** Every place the product relies on a legal reading — the Data Protection Act, 2020, electronic signatures, GCT invoice requirements, payments regulation, the terms and privacy notice — cites its public source and is labelled **unverified**. The attorney (F15) becomes a **launch gate**, beside staff MFA. |

## Alternatives considered

The options for each decision are in review 5's summary table. The two adjustments: D9's chatbot was not
among the options; the owner added it. D14's single attorney visit before W5 and W9 is built was replaced
by public information now and an attorney before launch — cheaper and faster, at the risk that the
attorney changes something already built.

## Consequences

- The PRD is amended for every decision, then re-read before approval (Rule 1.10). The amendments are
  tracked against review 5's findings, each B row closing only after an independent check (Rule 24.6).
- D1 shrinks release 1: offline creation, offline variations and draft merge become release-2 work.
- D3 and D4 depend on WiPay's account model and recurring-payment support, neither yet confirmed.
- D7 changes the money model the code has today: the ceiling becomes tax-exclusive and the invoice gains
  tax fields — a migration, designed before W7 is built.
- D9's chatbot needs help content to exist first, and a budget; it never receives tenant data.
- D14 accepts that legal readings may be wrong until the attorney reviews them, so launch waits on that.
