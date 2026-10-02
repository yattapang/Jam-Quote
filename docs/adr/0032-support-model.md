# ADR 0032 — The support model: a ticket built in, a help centre that sends nothing, and a gated route to a chatbot

- **Status:** Accepted
- **Date:** 2026-10-02
- **Decided by:** the owner, approving `docs/design/support-and-feedback.md` (SF1-SF8 and its §4), then signing off
  build plan step A3 with the amendments from its independent read (SR1-SR15).
- **Affects:** PRD R1.38, R1.42, R1.43, R1.44; ADR 0030 decisions 3 and 4; Rules 15 and 25; build steps E1, E2 and H6.
- **Delegation (Rule 16.5):** Opus — product direction, and a privacy boundary.

## Context

Brief §15 requires that customer service be built into the model, that the options be presented with pros, cons
and cost before anything is built, and that the decision be recorded as an ADR. ADR 0029 E1 had already ruled out a
chatbot at the web launch, because Rule 15 forbids sending what a person types to a model. The options paper is the
design named above.

## Decision

1. **Support conversations live in a small ticket built into Pryvis**, under row-level security and audited, rather
   than in a hosted helpdesk. The deciding reason is that support messages carry tenants' clients' data; a helpdesk
   would hold a further copy outside our isolation. **Revisit** at more than 20 new tickets a day for a month.
2. **One mailbox, two addresses** (`info@`, `support@`). Its provider is chosen in A5, and must delete mail
   automatically on a schedule.
3. **Three ways in:** "Contact support", "Report a problem", and email. An emailed ticket joins a tenant's account
   only after the tenant confirms it, signed in. Support never changes sign-in details on an email's word.
4. **A help centre in our own site**, searched in the browser with a library that makes no network request while
   a person types.
5. **Tier and app version are recorded on every ticket; the page and error references need consent.** This changes
   ADR 0030 decision 4, which put all three behind consent; the design governs, and ADR 0030 carries a note.
6. **The promise:** a reply within one working day (Jamaica time). **Tickets are kept 24 months after closing**,
   subject to the attorney; every other copy has its own rule.
7. **Feedback reaches maintenance only as redacted issues**, written by staff, refused by a server-side guard when
   they match personal data, and held in a deletable database. The administrator's start approval (Rule 15) is the
   second check.
8. **The chatbot, in three phases:** none at the web launch; release 2 answers from our help articles by in-browser
   search, with no model; a live assistant only after the owner amends Rule 15, the attorney reviews it, and the gate
   in the design's §4 is met.

## Consequences

- No new processor of tenant data at the web launch beyond the mailbox and the transactional email provider.
- A small build in E1-E2, and replies copied into tickets by hand until inbound email handling exists.
- The owner's chatbot goal has a route that does not depend on changing Rule 15 until the owner chooses to.
