# Brief: independent read of the support and feedback design (build plan A3)

**Agent:** commit-reviewer, **Opus** (Rule 16.5: a privacy boundary — what reaches a model, what staff may see,
what leaves our isolation — and product direction; adversarial reading of a design, not a mechanical check).
**Under review:** `docs/design/support-and-feedback.md`, approved by the owner on 2026-10-02 (SF1-SF8 and §4), against
brief §15 (`docs/DEVELOPMENT-BRIEF.md`), Rules 15 and 25 (`docs/RULES.md`), ADRs 0027 (D9), 0029 (E1) and 0030
(decisions 3 and 4), PRD R1.38, R1.39, R1.42, R1.46-R1.48, `docs/design/api-layer.md` (AP9, AP10),
`docs/design/tax-and-documents.md` (T1's guard), `docs/SERVICE-REGISTER.md`, `docs/THREAT-MODEL.md` and
`docs/OWNER-ACTIONS.md`.

**As with A2, the owner relies on our judgement:** besides finding gaps, say for each of SF1-SF8 and the chatbot
route whether you would recommend the same, and if not, what and why.

## What to attack

1. **Personal data reaching a model (Rule 15).** Find any path by which a tenant's or client's personal data could
   reach Claude: through a redacted issue, a help article drafted from questions, a triage summary, error tracking
   linked to a ticket, phase 2's "answers from our help content", or anything the maintenance task list (A4) would
   read. Is SF8's guard specified precisely enough to build and plant against, and what does it miss (names not in
   the linked ticket, addresses, amounts, free-text paraphrase)?
2. **Isolation and staff access.** Is "`answer_support` covers tickets and nothing else" sound against R1.46-R1.48?
   Can a ticket become a side door (a tenant pasting another tenant's data; staff creating a ticket from an email and
   linking the wrong tenant; a client of a contractor writing in)? Does the mailbox notice leak anything?
3. **The help centre and search.** Is "search runs in the browser and sends nothing" true of every option a builder
   might pick? Does the "no-result count" or "did this help?" create any record that could hold what was typed?
4. **Consent and diagnostics (SF5).** Can the attached context carry personal data anyway (route templates, request
   ids that resolve to logged data, the error-tracking event)? Is the consent wording accurate?
5. **Retention and deletion (SF7).** Do the periods hold against a tenant's export and erasure (A11), the audit trail
   (which is append-only), backups, and the mailbox? Is anything kept that is never deleted?
6. **The chatbot route (§4).** Is phase 2 genuinely model-free at run time? Is phase 3's gate complete; is its cost
   estimate arithmetic right?
7. **Costs and the rejected options.** Are the stated prices quoted fairly from the cited sources, and are the
   reasons for rejecting a helpdesk and a WhatsApp line sound — or would you choose differently for a one-person
   support operation in Jamaica?
8. **Consistency and gaps.** Every place this design disagrees with the brief, the rules, the ADRs, the PRD, the
   other designs or the register; anything a builder of E1, E2 or H6 would have to make up.

## How to work

- Read; do not edit anything, commit, stash, `git checkout --` or `git restore`. Write your findings only in your
  reply. Synthetic data only. You may search the web to check a price.

## What to report

Findings numbered **SR1, SR2, …**, each with severity (blocker / major / minor), where, the evidence, and a
recommendation. Then a table SF1-SF8 and §4: **agree** / **disagree** (with your alternative, one line). Then one
line: **the design is sound to build from**, or **sound after the named changes**, or **not yet**. Then
`git status --short`, which must be empty.

## Expectations

```check
$ grep -c "^### SF[0-9] ·" docs/design/support-and-feedback.md
8
```

```check
$ grep -c "APPROVED by the owner, 2026-10-02 — every recommendation, SF1-SF8" docs/design/support-and-feedback.md
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
