# Design: environments and operations — where Pryvis runs, how it is changed, and how it is kept safe

**Status: DRAFT, in progress — written section by section and saved as it goes (owner, 2026-10-06).** Build plan step
A4 (`docs/BUILD-PLAN.md`). After approval: an independent read, a closing check, then the owner's sign-off ticks A4.
Nothing here is built until steps B1-B4 begin.

Date: 2026-10-06 · **Implements the direction of** ADR 0030 decision 5 (environments and operations), as changed by
ADR 0035 (hosting regions chosen with the Data Protection Act's s. 31 in mind) · **Carries** Rule 10 (portability, and
the trigger for leaving free tiers), Rule 15 (Claude-assisted maintenance and its three approval gates), ADR 0026 (the
API always on at launch), `docs/design/api-layer.md` (AP8's start-up, time limits and measured proxy hops; AP10's job
worker), `docs/design/support-and-feedback.md` (SF8's redacted task list, which feeds the start gate) and
`docs/DATA-PROTECTION-READING.md` (§5 transfers, §7 retention, §8 the annual impact assessment) · **Answers**
`docs/PLANNING-AUDIT.md` §7 item 4, including finding PA7 (Rule 10's trigger with thresholds and paid equivalents for
every free-tier piece) · **Delegation (Rule 16.5):** Opus — operations and security.

**Prices are public list prices found on 2026-10-06, in US dollars, mostly from third-party summaries, and are checked
on each vendor's own page before anything is bought** (sources in §14).

---

## Contents

1. The problem
2. OP1 · Three environments, and where real data may live
3. OP2 · The hosting region
4. OP3 · Hosts, plans and what they cost
5. OP4 · Configuration and secrets
6. OP5 · From a change to production: the pipeline
7. OP6 · Backups and restore drills
8. OP7 · Monitoring and alerts
9. OP8 · The three approval gates for Claude-assisted maintenance, and their interface
10. OP9 · Runbooks
11. OP10 · Rule 10's trigger: every free-tier piece, its limit and its paid equivalent
12. OP11 · Security operations: accounts, keys and dependencies
13. OP12 · The operations calendar
14. What gets built, tests, what this does not do, and sources

*(Sections are filled in order; an unfilled section reads "to be written".)*

## 1. The problem

To be written.

## 2. OP1 · Three environments, and where real data may live

To be written.

## 3. OP2 · The hosting region

To be written.

## 4. OP3 · Hosts, plans and what they cost

To be written.

## 5. OP4 · Configuration and secrets

To be written.

## 6. OP5 · From a change to production: the pipeline

To be written.

## 7. OP6 · Backups and restore drills

To be written.

## 8. OP7 · Monitoring and alerts

To be written.

## 9. OP8 · The three approval gates for Claude-assisted maintenance, and their interface

To be written.

## 10. OP9 · Runbooks

To be written.

## 11. OP10 · Rule 10's trigger

To be written.

## 12. OP11 · Security operations

To be written.

## 13. OP12 · The operations calendar

To be written.

## 14. What gets built, tests, what this does not do, and sources

To be written.
