# Brief: closing check of the outbound messaging design after its read (MR1-MR24)

**Rule 0 first:** read `docs/RULES.md` and state which rules apply before starting. **You have no subagents; you do
this work yourself** (Rule 16.6).

**Agent:** general-purpose, **Sonnet** (Rule 16.9: mechanical — every item names the text to read, and the expectations
below are executed; the adversarial work was the Opus read, whose findings are summarised at the end of this brief and
recorded in the design's §14 and `docs/BRIEF-STATUS.md`).
**Brief step:** build plan A6 (`docs/BUILD-PLAN.md`), phase A.
**Under check:** `docs/design/outbound-messaging.md` as amended, with `docs/OWNER-ACTIONS.md` (OA6, OA10, OA11, OA12,
OA29), `docs/design/environments-and-operations.md` (OP2, OP4, OP7, OP10), `docs/design/third-party-register.md` (RG6,
RG7, RG8), `docs/design/support-and-feedback.md` (SF7), `docs/SERVICE-REGISTER.md` (§0), `docs/DATA-PROTECTION-READING.md`
(§5), `docs/THREAT-MODEL.md` and `docs/MISTAKES.md` (M45), at the commit that adds this brief.
**Do not touch:** anything. This is a reading check.

## What to do

1. From the repository root, run `python3 tools/run_brief.py docs/briefs/2026-10-09-messaging-design-closing-check.md`
   and report its full output. Every check must PASS, and the tree must be clean afterwards.
2. For each of MR1-MR24 (summarised below), read the design's §14 row for it and the sections that row names. Report
   **answered** or **not answered**, quoting the sentence that answers it. A finding is answered when the design states
   a rule a builder can follow for every part of the recommendation, or states plainly why a part is not taken. Check in
   particular:
   - MR1: the per-tenant limits include **absolute counts** that work below 40 sends; the rates are **below** AWS's
     review lines (5% bounces, 0.1% complaints); an **automatic** account circuit breaker exists, and says who resumes it;
   - MR3: a code goes only to the contractor's chosen address, citing `docs/design/acceptance-evidence.md` §4.1;
   - MR4: the account stream is in its own AWS account, with its own limits, in MS3, MS8, RG7 **and** OA6 and OA29;
   - MR5 and MR7: suppression and opt-out are keyed on (tenant, normalised address); opt-out reversal needs a code sent
     to that address;
   - MR11: every key named in MS10 appears in OP4's table, and OP4 no longer names "the email key (A6)" as held by "the
     API service";
   - MR13: the plaintext of a code has one stated home, its lifetime, and what a retry does;
   - MR16: OA11 carries the mailbox's records **and** SES's, and RG6's sentence about OA11 is now true;
   - MR20: every duplicate mechanism is named, and the brief edit is proposed, not made.
3. **Add up the costs** in §12's "Costs" and check them against OP10's SES row and A5's production total.
4. **Check §13 and M45 against each other**: for each §13 row that claims something is mechanical, name the check that
   runs; report any row that claims mechanism without one.
5. Report, for the read's MS1-MS10 opinion table (summarised below): is each "disagree" or "agree in part" adopted, and
   where?
6. Do not edit, commit, stash, `git checkout --` or `git restore` anything. There is no code, so there are no plants.

## Report

The runner's output; MR1-MR24, each answered / not answered, with its quoted sentence; the cost check; the §13 check;
the adoption lines; and a last line, **closable** or **not closable**, for MR1-MR24 as a set. Nothing else.

## Expectations

Twenty-four findings in the design's answer table, each cited in the body too:

```check
$ grep -c "^| MR[0-9]* ·" docs/design/outbound-messaging.md
24
```

```check
$ for n in $(seq 1 24); do c=$(grep -oE "\bMR$n\b" docs/design/outbound-messaging.md | wc -l); [ "$c" -ge 2 ] || echo "MR$n only $c"; done; echo checked
checked
```

The amendment, the owner's three decisions and the ledger entry are recorded:

```check
$ grep -c "Amended the same day to answer its independent read (MR1-MR24" docs/design/outbound-messaging.md; grep -c 'decided by the owner, 2026-10-09: "Separate' docs/design/outbound-messaging.md; grep -c 'decided by the owner, 2026-10-09: "Require TLS"' docs/design/outbound-messaging.md; grep -c "Decided by the owner, 2026-10-09: à la carte pricing" docs/design/outbound-messaging.md; grep -c "^### M45 ·" docs/MISTAKES.md
1
1
1
1
1
```

**M45's mechanical part for this step: no document still carries a phrase the read found stale** (MR11, MR14, MR5,
MR19, MR24, MR4, MR16). Empty output means none:

```check
$ git grep -n -F -e "email key (A6), the storage keys" -e "which does not keep the body after sending" -e "Account-level suppression for bounces only" -e "Opened in WhatsApp — sent by you" -e "so in fact inside Canada" -e 'A fourth AWS account, "production email"' -e "Pryvis <hello@pryvis.com>" -- docs ':!docs/briefs' ':!docs/MISTAKES.md'
```

The repository's checkers are clean:

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

## The read's findings, summarised

From the read's reply (brief `docs/briefs/2026-10-09-messaging-design-read.md`, at `62eb0d5`); each finding's substance
is restated in the design's §14 with the section that answers it.

- **MR1 · blocker** — per-tenant thresholds at or above AWS's review lines (5% bounces; 0.1% complaints), blind below 40
  sends; many small tenants could pass AWS's line with none paused; the account alarm only emails. *Recommended:*
  absolute counts at low volume, rates genuinely below AWS's, an automatic account circuit breaker.
- **MR2 · major** — Gmail sends SES no complaint data; state it; do not rely on complaints; consider Postmaster Tools.
- **MR3 · major** — codes as an "email a friend" feature outside the cap; decide who types the destination; count codes
  in the limits without letting a pause block codes to the stored address.
- **MR4 · major** — the account stream shares the client stream's AWS account and has no caps; a separate account.
- **MR5 · major** — account-level suppression is permanent and cross-tenant; use tenant-level lists; an audited removal.
- **MR6 · major** — a complaint blocks the client's own code requests with no exit.
- **MR7 · major** — the contractor can reverse an opt-out through a share link; reversal by a code to the address; key
  on the address.
- **MR8 · minor** — only POST declared for opt-out; DKIM coverage of the RFC 8058 headers unconfirmed.
- **MR9 · major** — statuses can regress; de-duplicate on SNS's id as AP6 does; SNS v2, HTTPS, subscription handling.
- **MR10 · major** — no re-check at send; replay after AP6's seven days makes a second row; a client key.
- **MR11 · major** — management keys missing; paused-tenant error; EventBridge consumer; OP4's contradicting row.
- **MR12 · major** — claiming under row security undefined; null tenants in a tenant table; AP10's exception unrecorded.
- **MR13 · major** — where a code's plaintext lives between request and render.
- **MR14 · major** — "SES does not keep the body" is a deciding reason with no AWS page behind it; SF7 dropped the caveat.
- **MR15 · major** — copies missing: the global suppression list, SNS headers, idempotency records, rate-limit rows, job
  payloads, DMARC reports; SES tenant names must be opaque.
- **MR16 · major** — the approval commit's OA11 dropped the mailbox's records, making RG6 false; the DMARC report
  address, staging's identity and `hello@` exist in no owner action.
- **MR17 · major** — the From check matches spelling (confusables pass); the share page carries the tenant's free text.
- **MR18 · minor** — cap enforcement's race; reminders' share of the cap; refused reminders.
- **MR19 · minor** — "sent by you" claims what cannot be known; two area codes.
- **MR20 · minor** — duplicates understated; the brief's "nothing is sent twice".
- **MR21 · minor** — Essentials pricing by default; the tenants' price.
- **MR22 · minor** — opportunistic TLS.
- **MR23 · minor** — SF3's confirmation email and new members' verification missing from MS1.
- **MR24 · minor** — stale twins in OP2, the data-protection reading, the threat model and OP7.

**Its MS1-MS10 view:** MS1 in part (MR3, MR23); MS2 in part (MR9, MR10, MR12, MR13); MS3 agree on SES in Canada,
disagree on account-level suppression, choose à la carte (MR5, MR21); MS4 in part (MR4, MR16, MR17); MS5 agree, with TLS
and the share-page surface (MR17, MR22); MS6 in part (MR2, MR6, MR9, MR11); MS7 in part (MR7, MR8); **MS8 disagree**
(MR1, MR3, MR4, MR18); MS9 in part (MR19); MS10 in part (MR11, MR15).
