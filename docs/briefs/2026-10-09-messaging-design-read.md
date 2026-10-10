# Brief: independent read of the outbound messaging design (build plan A6)

**Rule 0 first:** read `docs/RULES.md` and state which rules apply before starting. **You have no subagents; you do
this work yourself** (Rule 16.6).

**Agent:** commit-reviewer, **Opus** (Rule 16.5: where personal data goes, and abuse controls on a sending path that an
unauthenticated share-page visitor can trigger, are judgement-class; this is adversarial reading of a design).
**Brief step:** build plan A6 (`docs/BUILD-PLAN.md`), phase A — a planning step, whose "review" is an independent read.
**Under review:** `docs/design/outbound-messaging.md`, approved by the owner on 2026-10-09 (MS1-MS10), and the changes
made on approval to `docs/SERVICE-REGISTER.md` (§0), `docs/OWNER-ACTIONS.md` (OA6, OA10, OA11, OA29),
`docs/design/third-party-register.md` (RG7, RG8), `docs/design/environments-and-operations.md` (OP2, OP4, OP10),
`docs/design/support-and-feedback.md` (SF7) and `docs/DATA-PROTECTION-READING.md` (§5).
**Read it against:** Rules 3, 4, 5, 11, 14, 15, 21 and 24 (`docs/RULES.md`); ADRs 0016, 0026, 0027, 0033, 0034 and
0035 (`docs/adr/`); `docs/PRD.md` (R1.18, R1.20, R1.20b, R1.21-R1.21c, R1.25a, R1.28, R1.37b-c, §9 item 1a);
`docs/design/api-layer.md` (AP6, AP9, AP10, AP11); `docs/design/third-party-register.md` (RG1, RG7, RG8);
`docs/design/environments-and-operations.md`; `docs/design/support-and-feedback.md`; `docs/design/privilege-model.md`;
`docs/DEVELOPMENT-BRIEF.md` §12; `docs/MISTAKES.md`.
**Do not touch:** anything. This is a read. `original-app/` is read-only in any case.

**As with A2-A5, the owner relies on our judgement:** besides finding gaps, say for each of MS1-MS10 whether you would
recommend the same, and if not, what and why. You may search the web to check AWS's or another provider's
capability, region, terms or price — **from the vendor's own pages**, not summaries (A5's RR6). The design marks
several SES capabilities as unconfirmed; confirming or refuting any of them is valuable.

## What to attack

1. **"Nothing is sent without someone's act" (Rule 11; MS1, MS7).** Find a path by which a message is sent that no one
   asked for, or sent again after it was asked once: reminders and the digest, a revision superseding an earlier one,
   the mobile outbox replaying (R1.18), a job retried, an event replayed.
2. **Pryvis as a weapon (MS8, MS5, MS4).** Find how a free tenant — or **an unauthenticated visitor on a share page**,
   who can request acceptance codes to a typed address (R1.20) — could make Pryvis email someone who never dealt with
   the tenant, flood an address, send phishing, impersonate a bank or Pryvis, or get the whole SES account reviewed or
   paused. Test the caps' exclusions, the per-issue and per-address limits, and the thresholds' arithmetic at small
   volumes.
3. **The truth of what the contractor sees (MS2, MS6; R1.21b).** Can a status claim more than happened — "delivered"
   read as "read", a WhatsApp share as "sent", a message `suppressed` shown as sent? Can a forged or replayed event
   change a status? Is the at-least-once residual stated truly?
4. **Personal data and copies (MS10; ADR 0035; RG1).** Is every copy of a message listed, with its lifetime and its
   erasure path? Is "SES does not keep the body" stated no more strongly than AWS's own terms support? Are the share
   link's token and the acceptance code exposed anywhere they should not be (provider, logs, SNS, `wa.me`)? Is every key
   in OP4?
5. **Deliverability and the domain (MS4).** Are the two streams, the custom MAIL FROM, DKIM, SPF and the staged DMARC
   correct and buildable alongside the mailbox on `pryvis.com` (A5's RG6)? Does anything break the mailbox's own mail?
6. **Opt-out (MS7; R1.21c; RFC 8058).** Its scope, its token, its public route, and who can reverse it.
7. **§13, the mistake mapping (Rule 24, the owner's instruction).** For each row, is the answer real and mechanical,
   or a promise to be careful? Name any recorded mistake (`docs/MISTAKES.md`, or A4's OR and A5's RR findings) this
   design could repeat that §13 does not list.
8. **Consistency and gaps.** Every place this design disagrees with the rules, the ADRs, the PRD, the other designs,
   the register or the owner actions; anything a builder of C1, C2, C5 or D2 would have to make up.

## How to work

- Read; do not edit anything, commit, stash, `git checkout --` or `git restore`. Write your findings only in your
  reply. Synthetic data only.
- Report findings **as you find them**, in your reply's order, so a run cut short still leaves what it found (Rule 16.3).

## What to report

Findings numbered **MR1, MR2, …**, each with severity (blocker / major / minor), where, the evidence (quote the line,
or the command and its output, or the vendor page), and a recommendation. Then a table MS1-MS10: **agree** /
**disagree** (with your alternative, one line). Then what you did **not** examine (Rule 21.4). Then one line: **the
design is sound to build from**, or **sound after the named changes**, or **not yet**. Then `git status --short`, which
must be empty.

## Expectations

```check
$ grep -c "^## [0-9]*\. MS[0-9]* ·" docs/design/outbound-messaging.md
10
```

```check
$ grep -c "APPROVED by the owner, 2026-10-09 — every recommendation, MS1-MS10" docs/design/outbound-messaging.md; grep -c "Amazon SES" docs/SERVICE-REGISTER.md; grep -c "^| OA29 |" docs/OWNER-ACTIONS.md
1
1
1
```

```check
$ for t in check_rules check_dispositions check_citations check_schema_citations check_build_plan; do python3 tools/$t.py 2>&1 | tail -1; done
All citations resolve, and no rule has changed unreviewed.
Every Closed disposition cites every document its finding named.
Every cited filename and symbol resolves. (Paths are checked by tools/check_schema_citations.py, not here.)
Every citation in the forms this tool checks resolves (its docstring lists them, and what it does not check).
Every ticked step carries its evidence.
```

```check
$ git status --short
```
