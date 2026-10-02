# ADR 0028 — Release 1 launches as a web app; the mobile app, and offline capture with it, follows

- **Status:** Accepted
- **Date:** 2026-10-02
- **Decided by:** the owner, after ADR 0027, with one choice put to them (offline at web launch).
- **Amends:** ADR 0027 D2 (the platform stands; its timing changes) and the timing of ADR 0023 decision 2
  (offline sealing on every tier — unchanged in substance, delivered with the mobile app).
- **Affects:** `docs/PRD.md` (§4, §7, §9, §10, §11, R1.8, R1.12, R1.18-R1.18j, R1.29, R1.37e, N5), the
  marketing site's copy and its guard.
- **Delegation (Rule 16.5):** Opus — product decisions.

## Context

ADR 0027 chose React Native with Expo for the contractor's app, because release 1's offline requirements
need the device's keystore and lock, which a browser does not reliably give (finding B5). The owner then
decided to **hold the mobile launch until the web app is ready**. A web app cannot keep the owner's earlier
requirement — *the data must be captured offline and kept until the device can sync* (M13) — reliably: there
is no device keystore, and a mobile browser may delete a site's stored data. So the offline promise needed
an answer at web launch.

## Decisions

1. **Release 1 ships in two steps.** First **the web app**, used online — on a phone's browser or a
   computer — for everything release 1 does. Then **the React Native (Expo) app**, which brings
   **offline sealing** and everything that rests on it (R1.8's offline walkthrough, R1.12's no-signal
   survival, the outbox and the R1.18 family, R1.37e's entitlement cache, N5). The mobile app launches
   when the web app is ready; nothing in it changes the server's rules.
2. **At web launch, pricing and sealing need a connection** (the owner's choice, 2026-10-02). The site's
   "Works with no signal" line is marked **"coming with the mobile app"** until then, so nothing over-claims
   (Rule 20). The seal, number and deliver acts (PRD §4) stay separate; on the web all three happen online.
3. **WiPay, restated:** each tenant connects **their own** WiPay merchant account, in their Pryvis account
   settings, and their clients' card payments go there (ADR 0027 D3). **Pryvis's own WiPay account takes
   only tenants' subscription payments to us.** We do not see or touch clients' money.
4. **The second staff member is not yet named.** The two-person controls stay as specified (R1.34), with
   the single-operator exception (R1.35) as the recorded fallback; naming the person stays on the owner's
   list (PRD §9 item 5).
5. **The owner holds a Claude developer account**, which the support chatbot (ADR 0027 D9) will use. A
   monthly spend limit for it is still to be set.

## Alternatives considered

- **The web app works offline too, as an installable PWA** — keeps the promise at web launch, but a mobile
  browser may delete unsynced seals, there is no device keystore, and the sync engine would be built twice.
  Rejected by the owner.
- **Launch both together** — the owner chose not to wait for the mobile app.

## Consequences

- The web launch carries no sync engine at all, which is the risk §4 of the PRD most wanted out of the money
  release.
- The core "on the spot with no signal" promise arrives with the mobile app, not on day one. A contractor at
  a gate with no signal cannot seal on the web app; the site must say so until the mobile app ships.
- App-store developer accounts are needed for the mobile release, not the web launch.
- §10's offline measures start at the mobile launch.
