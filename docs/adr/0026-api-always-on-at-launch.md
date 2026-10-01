# ADR 0026 — The API is paid and always on at launch; until then the share page wakes it

- **Status:** Accepted
- **Date:** 2026-10-01
- **Decided by:** the owner, accepting the recommendations made when sizing review 3's finding H17.
- **Affects:** `docs/PRD.md` R1.20b, R1.21a and N10; `docs/SERVICE-REGISTER.md` §4a; `docs/THREAT-MODEL.md`
  §4a's verification-code row.
- **Delegation (Rule 16.5):** Opus — it decides what a client meets at the one moment the product converts.

## Context

The API runs on a free instance that sleeps after about 15 minutes and takes 40-70 seconds to answer the
first request after that (`docs/SERVICE-REGISTER.md` §4a, measured). R1.21a protected the share page's
**reading** from that by pre-rendering it. But accepting a quote at the default bar (grade 3,
`docs/design/acceptance-evidence.md` §9) needs several calls to the API — ask for a code, read it in the
inbox, submit it — separated by the client's trip to their email. Finding H17: the accept path met the
cold start twice, against a code whose lifetime no document stated, so the likely outcome was an abandoned
acceptance that looks to the contractor like the client ignoring the quote. N10 has said since review 1
that free infrastructure is "acceptable for a prototype, not at launch", and that the trigger for paying is
an owed ADR. This is that ADR.

## Decisions

### 1. At launch, the API is a paid instance that does not sleep

A launch requirement, not an improvement: no tenant outside the owner's own test accounts uses the product
while the API can spin down. It is a recurring cost, accepted because the accept path is the product's one
conversion step and it lands on the tenant when it fails. The provider and plan are chosen when the
deployment is set up and recorded in `docs/SERVICE-REGISTER.md`.

### 2. Until then, the share page wakes the API when it opens

When a client opens a share link, the page — served pre-rendered, so it does not wait — sends one request
to the API in the background. By the time the client has read the quote and taps accept, the API is
usually awake. If it is not, the page says plainly that it is connecting, rather than showing a blank
screen. This costs nothing and needs no new service. Rejected for the prototype: a scheduled pinger (it
uses the free plan's hours, and our own GitHub-scheduled one never worked — `SERVICE-REGISTER.md` §4a), and
moving accepting into the website's serverless functions (it splits the API across two places for one
endpoint).

### 3. A verification code lasts 30 minutes, is single-use, and allows five wrong attempts

Thirty minutes is comfortably longer than two cold starts and a slow inbox together. Single-use, and at
most five wrong attempts per code, keep a six-digit code unguessable. The existing per-issue and
per-recipient rate limits on requesting codes stand (`THREAT-MODEL.md` §4a).

## Consequences

- Nothing is built yet: the share page, the accept endpoints and the code are application work. This ADR
  fixes what they must do.
- The free tier remains for the prototype, with the honest statement in `SERVICE-REGISTER.md` §4a.
- If the paid instance is not in place, launch waits. That is the point of writing it down before the
  launch date exists.
