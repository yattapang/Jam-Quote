# ADR 0035 — The data protection approach: processor for clients' data, registration, 72-hour notices, transfers, retention

- **Status:** Accepted
- **Date:** 2026-10-06
- **Decided by:** the owner, approving every recommendation (R1-R12) of `docs/DATA-PROTECTION-READING.md` §11
  ("approved"). That reading is general guidance, not legal advice, from the Data Protection Act 2020 and its 2024
  regulations, and it is checked by the attorney before launch (F2).
- **Affects:** brief §5a; PRD R1.20c, R1.41, R1.44 and §9; designs A4, A5, A7, A8, A9 and A11; the terms and privacy
  notice (E6); `docs/OWNER-ACTIONS.md` (OA22, OA23).
- **Delegation (Rule 16.5):** Opus — a privacy boundary and the product's legal position.

## Context

The owner chose to work from the primary texts until an attorney is engaged, at low cost. The reading found that the
Act's duties fall mainly on data controllers, that a processor is bound through a written contract (s. 30(4)-(5)),
and that the product's design can keep Pryvis's own obligations narrow.

## Decision

1. **Roles.** Pryvis is the **processor** of contractors' clients' data, and the contractor is its controller. Pryvis is
   the **controller** of contractors' own accounts, support data, its website and staff. The terms carry the written
   processing contract, including:
   - Pryvis acts only on the contractor's instructions;
   - Pryvis keeps security equivalent to the seventh standard;
   - Pryvis notifies the contractor of a breach **within 24 hours**;
   - Pryvis lists its sub-processors and the countries they operate in.
2. **Registration.** Pryvis registers as a data controller before the first real contractor, renews by 1 December, and
   reports changes within 14 days (OA23). If the Canadian company sells the subscriptions (ADR 0033), it registers for
   billing data, with the Jamaican company as its representative in Jamaica (s. 3(2)).
3. **No sensitive personal data, by design.**
   - The e-signature stays a typed name.
   - The release-2 signed-copy upload (R1.20c) is reconsidered, because a handwritten signature may be biometric data
     (s. 2).
   - Notes fields warn against recording health or criminal information.
4. **The price index is anonymous and aggregated.** Price observations are stored without the tenant's identity and
   used only across many tenants, so they are not personal data. Any remaining consent is separate and optional,
   **never a condition of sign-up** (s. 9(2)(b)). This replaces brief §5a's "consent in the terms they accept at
   sign-up" (a dated note is added there, Rule 23.5).
5. **A privacy line on every quote, invoice and share page**, taken from the contractor's settings, so contractors can
   inform their clients (s. 22(4)).
6. **Hosting regions are a design input.** A4 and A5 choose regions with s. 31 (transfers outside Jamaica) in mind,
   preferring Canada or the EU where the price is similar, before B1 builds the environments.
7. **Every record has a maximum retention period.** "Kept permanently" is removed (R1.44). The schedule in the reading's
   §7 is the starting point, with the tax-record period confirmed by the accountant. Disposal is irreversible,
   including backups once they expire.
8. **The breach response** meets 72 hours to the Commissioner and 72 hours to each affected person (s. 21; Regs 10),
   with prepared templates and a per-tenant "who is affected" query (A11).
9. **Rights tools** meet the Act's deadlines: access, copy and correction in 30 days, and a written answer to a "stop
   processing" request in 21 days (A11).
10. **The owner is the authorised officer**, with `privacy@pryvis.com` as the contact, until a data protection officer
    is required.
11. **The annual impact assessment** goes on the operations calendar, assembled from the design documents (A4).
12. **The owner asks the Information Commissioner** the five questions of the reading's §10 before B1 (OA22).

## Consequences

- Designs A4, A5, A7, A8, A9 and A11 carry these requirements. Each design cites this ADR.
- The PRD carries pointers at R1.20c, R1.41, R1.44 and §9.
- Costs: registration of the Jamaican company (J$25,000, then J$15,000 a year), and the same for the Canadian company
  if it sells the subscriptions.
- The attorney reviews the reading and this ADR before launch. A different legal view changes this ADR, not the
  reading alone.
