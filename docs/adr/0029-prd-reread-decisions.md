# ADR 0029 — After the re-read: no chatbot at web launch, WiPay confirmed server-to-server, three Pro seats, one rule for a blocked seal

- **Status:** Accepted
- **Date:** 2026-10-02
- **Decided by:** the owner, accepting the re-read's recommendations E1-E4 (`docs/PRD-REVIEW-5.md`, "Re-read of
  the amended PRD").
- **Amends:** ADR 0027 D3 (how a per-tenant WiPay payment is trusted), D5 (the seat number) and D9 (the
  chatbot's timing).
- **Delegation (Rule 16.5):** Opus — product and security decisions.

## Context

The independent re-read of the amended PRD found that the amendments created new problems (C1-C10). Four
needed the owner: per-tenant WiPay accounts put the callback's signing key in the tenant's hands, so a
tenant could forge grade-6 evidence and an invoice's "paid" state (C1); the support chatbot would send what
people type to a model, which Rule 15 forbids (C4); Pro's seat count was stated three ways and lapse said
nothing about members (C6); and the web launch left the Free tier's fourth job undefined (C5).

## Decisions

1. **E1 — No chatbot at the web launch.** Release 1's support is email. The chatbot is designed in the
   support-model options paper the original brief requires (§15), which settles Rule 15 before anything is
   built. The owner keeps the chatbot as a goal.
2. **E2 — A per-tenant WiPay payment is trusted only when our server confirms it with WiPay.** Our server
   asks WiPay directly, server to server, whether the transaction happened, and records that answer as the
   evidence — never the callback body alone. **If WiPay offers no such query,** a payment through a tenant's
   own account is recorded as the tenant's (grade 1), never `deposit_paid` (grade 6).
3. **E3 — Pro has exactly 3 users.** On lapse, every member keeps read access and can record payments on
   money already invoiced; nothing new that is Pro is created; no seal is refused because of the lapse itself.
4. **E4 — One rule for a blocked seal, web and mobile.** A Free tenant's fourth job in a month is sealed
   and held blocked, exactly as on mobile (PRD R1.32a-b): nothing priced is lost, and the tenant numbers it
   next month or after upgrading. The same applies to a second member's seal of a revision already sealed:
   it is kept as a rejected seal (R1.18c, R1.18g-j), on the web as on the phone.

## Alternatives considered

The re-read's options: for E1, redacting input or amending Rule 15; for E2, no grade 6 at all in release 1;
for E3, suspending members beyond one on lapse; for E4, refusing to seal the fourth job on the web.

## Consequences

- WiPay must be asked whether it offers a transaction-status query (PRD §9 item 1b). Tenant WiPay credentials
  are a secret held per tenant, and the threat model gains a row for them.
- The register's Anthropic row stays "no runtime use" until the chatbot is designed.
- Seats are entitlement data with a number (Rule 14).
