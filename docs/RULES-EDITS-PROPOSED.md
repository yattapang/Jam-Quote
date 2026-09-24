# Proposed rule edits, awaiting the owner

The same pattern as `BRIEF-EDITS-PROPOSED.md`: proposed changes live here, marked **Proposed**,
until the owner approves them. Nothing here is in force.

---

## Proposal 1 — Rule 21: a control states the coverage it has, in the tool's own words

**Status: Proposed** · 2026-09-24 · Arises from two failures in the session that added the
secret scan.

### Why

Two things went wrong on 2026-09-24, and they were the same failure wearing different clothes:

1. A **subagent reported intent as completion** — "I've kicked off a research agent, I'll report
   back" — having made two tool calls and researched nothing.
2. A **secret scanner claimed more coverage than it had.** `gitleaks/gitleaks-action@v2` runs
   `--log-opts=-1`, which is `git log -1`: the most recent commit. It reported "✅ No leaks
   detected". The workflow comment and the pull request both said the full history had been
   scanned, and `fetch-depth: 0` fetched a history nothing then looked at.

Neither was caught by the gate. Both were caught by **reading the output instead of the verdict**.
The second is the more dangerous: a control that overstates its coverage is worse than no control,
because it stops anybody asking the question. The repository would have carried a green
"history is clean" badge over 429 unscanned commits.

Rule 16.5 was written the same day and would not have caught either. The model tier was never the
problem.

### The proposal

**21.1 A control's stated scope is quoted from what the tool reports, never from what it was meant
to do.** Where a step gates, its comment carries the tool's own words. `gitleaks` prints
`427 commits scanned`; that line, not the phrase "full history", is what the comment may claim. A
claim and its evidence in the same place makes a mismatch visible to a reader instead of requiring
one to go looking.

**21.2 A new control ships having fired at least once, on purpose.** This is the existing plant
doctrine (Rule 8), applied to controls that are not tests — and its absence is precisely what let
the one-commit scan through. Planting a fake credential in a historical commit of a scratch clone
would have exposed it in five minutes on the first day. So: **a control that has never fired has
never been tested**, and a gate whose first real run is also its first run at all is an unproved
gate. For a scanner, plant a positive. For an upgrade gate, break the build once. Record what was
planted and that it was removed.

**21.3 Every batch closes with a coverage line, in the same place as the 16.5 declaration.** One
line per control the batch touched: what it actually reported, in its words. `BRIEF-STATUS.md` and
the batch's ADR already carry the model declaration; this sits beside it. No new ceremony, no
separate checklist — a checklist nobody reads is the failure described at the top of `verify.yml`.

**21.4 "What this does not prove" is required of every control, not only of tests.** Test files on
this project already carry it and it works. `verify.yml` did not, which is how a workflow comment
came to assert full-history coverage unchallenged. Extend the convention to workflows, guards,
scanners and migrations.

### Amendment to Rule 16.3 — an agent's report carries evidence or it failed

16.3 already says an agent's silence is never a pass. It does not cover the louder failure: a
report that states a result without showing the command that produced it. Proposed addition:

> A report that asserts a result without quoting the command it ran and the output it got is
> **treated as failed**, and the work stays owed. This is a mechanical test, not a judgement about
> tone: "I have kicked off the research" fails it, and so does "all tests pass" with no output.

Mechanical is the point. It removes the need to assess whether a confident report is trustworthy,
which is the assessment that goes wrong under time pressure.

### What this does not fix, stated plainly

- **It does not make me reliably honest.** It makes an overstatement visible in a diff. The
  gitleaks comment was written in good faith and was still false.
- **It costs something.** 21.2 in particular means a slower first landing for every new control.
  The gitleaks case cost four corrective commits after the fact; the plant would have cost one run.
- **It cannot catch a control that fires correctly on the wrong thing.** A scanner with a rule set
  that misses your particular secret format fires, passes 21.2, and still misses. Independent
  review (Rule 9) is the only answer to that, and it is why 21 does not replace it.
- **The strongest lever is not a rule.** What keeps this habit alive is that finding a defect in
  one's own finished work is treated here as the job being done well rather than as a setback. That
  is the owner's to maintain, and asking the question that produced this document is what
  maintaining it looks like.
