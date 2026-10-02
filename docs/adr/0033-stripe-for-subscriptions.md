# ADR 0033 — Stripe as the candidate for tenants' subscription payments to Pryvis, with WiPay kept as the fallback

- **Status:** Accepted as a direction, **conditional** on the checks below. It is settled in design A10 (payments).
- **Date:** 2026-10-02
- **Decided by:** the owner, 2026-10-02.
  - "Stripe would be for subscriptions only for tenants to pryvis."
  - "The Canadian company would sell the subscriptions on behalf of pryvis, I would however treat my canadian
    company as the payment handler with the business run in Jamaica."
  - On being told that Stripe expects the account holder to be the seller: "If that is the case I would make the
    canadian company the seller."
- **Affects:** ADR 0030 decision 7 (Pryvis's own WiPay account); PRD R1.37a-R1.37b (card upgrades, recurring
  payments); build plan A10 and D6; `docs/OWNER-ACTIONS.md` (OA8, and new actions); the register (A5).
- **Delegation (Rule 16.5):** Opus — payments, and a legal and tax structure.

## Context

ADR 0030 decision 7 has Pryvis's own WiPay merchant account take tenants' subscription payments. The owner is a
Canadian and Jamaican citizen and holds a Canadian business, which can open an ordinary Stripe account. That cannot
be done for a Jamaican business today.

Stripe offers subscriptions with automatic renewal, failed-payment retries and card updates. WiPay offers those only
if the answers to OA7 say so. Stripe's fees for a Canadian account, from third-party summaries to be checked on
Stripe's own page, are:

- 2.9% + CA$0.30 per charge;
- plus 0.8% for a card issued outside Canada;
- plus 2% when currency is converted.

**What does not change:** tenants' clients still pay tenants into the tenant's own account (ADR 0027 D3,
R1.29). Stripe cannot hold a Jamaican tenant's own merchant account. Its payouts to Jamaica send money a platform has
collected, which would put clients' money through Pryvis — the one thing the owner has ruled out. **Stripe is for
subscriptions only.**

## Decision

1. **Stripe is the candidate** for tenants' subscription payments to Pryvis, through the owner's Canadian company.
   **The Canadian company is the seller of the subscriptions** (owner, 2026-10-02): it contracts with tenants for
   their subscription, takes payment in its own Stripe account, and pays the Jamaican business, which runs the
   product, under an agreement between the two companies.
   **WiPay stays the fallback**, and nothing about WiPay is removed from the plan.
2. **One payments layer, two providers.** Design A10 makes payments provider-neutral:
   - subscriptions, invoices and payments hold a provider name and that provider's references, never
     provider-specific columns;
   - each provider is an adapter behind one interface;
   - the provider for each purpose — Pryvis's subscriptions, tenants' collections — is configuration.

   Reverting to WiPay for subscriptions is a configuration change, not a rebuild.
3. **Testing happens in Stripe's test mode only**, with no real money. It is a time-boxed experiment on a separate
   branch whose findings feed A10, and whose code is not merged. It is done only after A10 sets what it must prove:
   - a Jamaican card paying in JMD or USD;
   - a subscription renewing, failing and lapsing (R1.37c);
   - Stripe's webhooks reaching our API as a signed provider callback (`docs/design/api-layer.md`, AP6).
4. **Live use waits on the conditions below.** Stripe holds card details; Pryvis never sees or stores them.
5. **Secrets.** Stripe's keys go into the environment's secret settings, never into the conversation or the
   repository (Rule 15). Any tool that gives an AI direct access to the Stripe account is used against a test-mode
   account only, never the live one.

## Conditions before live use

1. **Stripe approves the Canadian company's account for this business.** Stripe's agreement expects the account
   holder to sell its own goods or services; with the Canadian company as the seller, that is the ordinary case.
   Stripe is still told the full structure when the account is opened — a subscription to software run by a related
   Jamaican business — and its approval is kept on file.
2. **The accountant** (Canada and Jamaica) answers:
   - Canadian sales tax (GST/HST) on subscriptions sold to Jamaican contractors;
   - Jamaican tax on a service bought from a foreign company;
   - income tax on the arrangement between the two companies.
3. **The attorney** answers:
   - which company the terms of service name as the seller;
   - the agreement between the companies;
   - Stripe as a processor in the privacy notice.
4. **The register** gains a Stripe row (A5), and the threat model a row for its webhooks.

## Consequences

- OA8 (Pryvis's own WiPay merchant account) is held until Stripe answers; it proceeds if Stripe does not work out.
- New owner actions join batch 1 as long-lead items (`docs/OWNER-ACTIONS.md`).
- A10's scope grows by one adapter and one experiment; no other design changes.
- If every condition is met, a later ADR replaces ADR 0030 decision 7's last sentence for subscriptions. Until then
  that sentence stands as the fallback.
