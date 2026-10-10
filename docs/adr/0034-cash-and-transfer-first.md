# ADR 0034 — Cash and bank transfer first: WiPay card links move after the web launch, and invoices carry bank details

- **Status:** Accepted
- **Date:** 2026-10-02
- **Decided by:** the owner, 2026-10-02:
  - "most of my tenants clients will pay them in cash or through bank transfers, so WiPay will not be a major part
    of their business while stripe offers me features and flexibility for tenant payments to me";
  - "Stripe also helps me with tenants in other countries outside jamaica";
  - choosing both recommendations put to them: move WiPay card links to after the launch, and show the contractor's
    bank details on invoices at launch.
- **Affects:** PRD R1.20d, R1.29, §8 and a new R1.29a; ADR 0027 D3; ADR 0029 E2; `docs/TIERS.md`; the public site's
  copy and its guard; build plan D3 and a new H7; `docs/OWNER-ACTIONS.md` (OA7, OA15); designs A7, A9 and A10.
- **Delegation (Rule 16.5):** Opus — release scope, money and a fraud surface.

## Context

Release 1 planned WiPay card payment links as a Pro feature, paid into each contractor's own WiPay merchant account
(R1.29). That brought several costs:

- per-contractor credentials stored as secrets;
- a server-to-server confirmation with WiPay (ADR 0029 E2);
- three open questions to WiPay (OA7);
- a register entry with "no local substitute".

The owner reports that most clients pay contractors in cash or by bank transfer. Recording those payments is already
in release 1 (R1.26). For the contractors' own subscriptions, Stripe — through the owner's Canadian company, as the
seller (ADR 0033) — also serves contractors outside Jamaica, which a Jamaican gateway would not.

## Decision

1. **WiPay card payment links for contractors' clients move to release 2** (build step H7). Release 1 keeps payment
   recording for cash, bank transfer, cheque and any other method (R1.26). The payments layer stays provider-neutral
   (ADR 0033), so a card provider is an addition later, not a rebuild. Pryvis still never holds clients' money.
2. **Grade 6 acceptance evidence** — a deposit a provider confirms — needs a provider, so it is **not available in
   release 1**. A deposit the contractor records is grade 1 (`tenant_recorded`), as R1.20d already says when no
   provider confirmation exists. The grade's definition is kept for when H7 arrives.
3. **Invoices show the contractor's bank details, at launch** (new R1.29a):
   - **What is stored:** the contractor saves the bank name, branch, account name, account number and account type
     in their settings.
   - **Where it appears:** an invoice and its share page show them under "Pay by bank transfer", with the invoice
     number as the payment reference to quote.
   - **Frozen at issue:** the details are frozen on the invoice when it is issued, like the party details of
     `docs/design/tax-and-documents.md` T8. Changing them later never rewrites an issued invoice.
   - **Changing them is a fraud target**, because a changed account number diverts a client's payment. So a change:
     - needs a recent sign-in (re-authentication), and a second factor where the user has one;
     - is recorded in the tenant's audit trail;
     - is announced by email to every user of the tenant, with the date and the last four digits only.
   - **Nothing more:** Pryvis never moves the money and never confirms a transfer. A transfer is a payment the
     contractor records.
4. **Contractors outside Jamaica** pay their subscription through Stripe (ADR 0033), whatever their country's local
   gateways. That is part of why Stripe is the candidate, and it is recorded here.

## Consequences

- **The public site** stops selling "Card payment links" as a release-1 feature. The tier line and the pricing
  sentence carry "coming in release 2". The site's guard now refuses an unmarked claim of card payment links, proved
  by planted defects.
- **`docs/TIERS.md`** marks the line as release 2.
- **Build plan:** D3 becomes the bank-transfer details step, and H7 holds the WiPay connection. The WiPay owner
  actions (OA7, OA15) move to a later batch, before H7.
- **Fewer launch dependencies:** contractors' WiPay credentials are not stored in release 1, so their threat-model
  and register entries move to H7.
- **Designs:** A7 (the invoice layout) and A9 (the share page) carry the bank details; A10 covers the payments layer
  with Stripe for subscriptions and no card provider for contractors in release 1.
- **Later:** if contractors ask for card payments, H7 brings WiPay or another provider the owner then chooses.
