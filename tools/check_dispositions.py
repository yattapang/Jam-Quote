"""A review finding may not be marked Closed unless the disposition cites every document it named.

## Why this exists

On 2026-09-25 a first review produced 19 findings. The author amended two documents and wrote a
disposition table claiming 5 of 6 blockers closed. A second review checked the amended text rather than
the table and found **three rows overstated what changed**:

- **F1** named `domain-model.md` §4 and §6.1; the amendment added §6.1a and never touched §4, which still
  reads *"Allocate at sync … Rejected"* and *"Chosen: device number blocks"*. The contradiction moved
  from between two documents to inside one.
- **F17** named `acceptance` in the model and R1.20 in the PRD; only the PRD's R1.16a was added, so both
  documents still say the acceptance carries *"its own PDF hash"*.
- **F3** named the model's `variation` row, which still demands *"its own acceptance … signable on its
  own"* — contradicting the R1 requirement that says there is no client signature on a variation.

All three are the same failure: **a change written into one clause, or one document, and reported as
complete.** It is the shape the ledger logged as M13, and it recurred in the commit that logged it —
which by Rule 24.4 means the lesson was decorative until it had a mechanism. This is the mechanism.

## What it checks

For every finding in a review file:

1. Each finding's `**Where:**` line names the files it concerns. That is the finding's **scope**.
2. If the disposition table marks that finding `Closed`, the disposition text must cite **every file in
   that scope** — by name, with a section, requirement id or line anchor.
3. A finding may be `Open`, `Accepted`, `Half closed` or anything else with no citation requirement.
   Only the word that claims completeness carries the burden.

**Path-level scope (added 2026-09-27, finding P7).** A Where line naming a full path — a migration, a
test, a tool — makes that path scope too, keyed by migration directory name or file name. Enforced on the
reviews in `WIDE_SCOPE`, which since 2026-10-01 is every review: the ten legacy gaps reviews 2 and 3 had —
Closed rows that never cited a file their own Where line named — were audited one by one (two were real:
ADR 0024 still described the design H9 and H10 overturned, and was amended), and the older reviews then
moved in. A gap now fails the build.

## What it does NOT prove (Rule 21.4)

- **Not that the cited text says what the disposition claims.** It checks that the author looked at every
  document the finding named, not that the edit was correct. Only a re-review does that, which is why
  Rule 1.10's re-review is not replaced by this.
- Nothing about findings whose `**Where:**` line omits a file it should have named.
- That an older review's closure was right because its row now cites a path: the 2026-10-01 audit read each
  named document against its finding once; this checks the citation stays, not the reading.
- Shape checks (Q6) run on SHAPE_SCOPE reviews only (review 4): reviews 1-3 word their closures in older
  forms ("**Closed by design.**"), and rewording closed history to fit a later convention is not done. A disposition row whose id is not bolded is caught,
  but reported as a bad status: the first bold row for that id is then the reviewer's summary table.
- Nothing about sections cited by a name that does not exist — a stricter check could verify anchors, and
  that is owed rather than promised.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# Every review register, and the list is explicit rather than a glob: adding one is a deliberate act
# that shows in a diff. Review 3 was missing here for its first three dispositions, which meant this
# guard silently checked nothing about them — a control narrower than it reads (Rule 21.1).
REVIEWS = ("docs/PRD-REVIEW.md", "docs/PRD-REVIEW-2.md", "docs/PRD-REVIEW-3.md", "docs/PRD-REVIEW-4.md")
# Files a "Where:" line may name. Anything else on that line is prose, not scope.
KNOWN = re.compile(r"(PRD\.md|domain-model\.md|TIERS\.md|SERVICE-REGISTER\.md|RULES\.md|THREAT-MODEL\.md|PHASE-0-AUDIT\.md|site\.ts|site-guards\.test\.ts)")
FINDING = re.compile(r"^## ([FGHJ]\d+) · (.+?) — severity: (\w+)", re.M)
WHERE = re.compile(r"^\*\*Where:\*\* (.+?)(?=\n\*\*|\n\n)", re.M | re.S)
# A disposition row: | **F1** | blocker | text |
ROW = re.compile(r"^\|\s*\*\*([FGHJ]\d+)\*\*\s*\|[^|]*\|\s*(.+?)\s*\|\s*$", re.M)
# Review 4 names its scope as full backticked PATHS — migrations, tests, tools — which KNOWN, a list of
# document names written for reviews 1-3, cannot see. Adding review 4 to REVIEWS without this would have
# given each J finding a scope of only the documents KNOWN happens to list: a guard checking less than it
# reports, which is M20 and M24 again (finding P7 of the fourth J4 re-review). So every backticked path in
# a Where line is scope too, keyed by what a disposition naturally cites: a migration by its directory
# name (every one is called migration.sql), anything else by its file name.
# History: enforced at first on review 4 only. Reviews 1-3 were closed against the narrower name list, and
# widening it showed TEN of their Closed rows never cited a file their own Where line named (ADRs 0023 and
# 0024, a review register, check_rules.py, rules-manifest.json, MISTAKES.md). Each needed its closure
# re-audited, not a filename pasted into the row, so until then they were PRINTED as legacy gaps on every
# run. The audit was done on 2026-10-01 — each named document read against its finding; eight agreed, and
# two (H9, H10) exposed ADR 0024 still describing the overturned design, which was amended — and every
# review is now enforced.
# Every review, and not a separate list: a review left out of an opt-in set would have its gaps pass
# SILENTLY — the shape M38 records, which planting a gap with review 3 left out showed on 2026-10-01.
WIDE_SCOPE = set(REVIEWS)
# The status-wording and heading checks (Q6), separately: review 4 onward only (see the docstring).
SHAPE_SCOPE = {"docs/PRD-REVIEW-4.md"}
BACKTICKED_PATH = re.compile(r"`([^`\s]+/[^`\s]+\.[a-z]+)`")


# Q6 (fifth J4 re-review): a key is cited only as a whole token. Plain substring matching let a row
# "cite" `acceptance-evidence.md` by naming `0024-acceptance-evidence.md`, and `RULES.md` by naming
# `BUILD-RULES.md`. The character before a key may be a path separator but not part of a file name.
def cites(key: str, text: str) -> bool:
    return re.search(r"(?:^|[^\w.-])" + re.escape(key) + r"(?![\w.-])", text) is not None


# In WIDE_SCOPE reviews a disposition row must open with one of these, exactly. Anything else — a
# non-bold "Closed.", "**Resolved.**", a typo — used to drop the row out of the closure count silently,
# visible only as the printed count moving by one (Q6, and M24 before it).
STATUSES = ("**Closed.**", "**Fixed, re-review owed.**", "**Open")
ANY_FINDING_HEADING = re.compile(r"^## ([A-Z]\d+)\b", re.M)
ANY_FINDING_ROW = re.compile(r"^\|\s*\**([A-Z]\d+)\**\s*\|", re.M)


def shape_failures(review: str, text: str, scopes: dict[str, set[str]]) -> list[str]:
    """For WIDE_SCOPE reviews: every finding parses with a scope, and every row has a known status."""
    problems = []
    parsed = set(scopes)
    for heading_id in dict.fromkeys(ANY_FINDING_HEADING.findall(text)):
        if heading_id not in parsed:
            problems.append(f"{review}: finding {heading_id}'s heading does not parse, so its scope is unknown")
        elif not scopes[heading_id]:
            problems.append(f"{review}: finding {heading_id} has no parsable Where line, so its scope is empty")
    # The FIRST row per id is the disposition. Review 4 also carries the reviewer's summary table,
    # whose rows share the same shape; judging the last occurrence checked that table instead.
    rows: dict[str, str] = {}
    for row_id, disposition in ROW.findall(text):
        rows.setdefault(row_id, disposition)
    for row_id in ANY_FINDING_ROW.findall(text):
        if row_id not in rows:
            problems.append(f"{review}: the row for {row_id} does not parse (bold id, three columns)")
    for row_id, disposition in rows.items():
        if not disposition.startswith(STATUSES):
            problems.append(f"{review}: {row_id}'s status is not one of {', '.join(STATUSES)}")
    return problems


def path_key(path: str) -> str:
    parts = path.rstrip("/").split("/")
    return parts[-2] if parts[-1] == "migration.sql" and len(parts) > 1 else parts[-1]
# "**Closed", and the ways a disposition says the same thing in other words. A row rewritten as
# "**Reopened by J12, then closed**" silently STOPPED being checked — which is how a disposition table
# loses a row: not by lying, but by drifting out of the pattern that carries the burden. Caught while
# correcting H2 after J12 reopened it, and only because the printed count dropped by one. That is the
# argument for printing the count, and it is Rule 21.1 in miniature.
CLAIMS_CLOSED = re.compile(r"\*\*(?:Closed|Re-?closed|Reopened[^*]{0,160}?clos)", re.I)


def scope_of_findings(text: str) -> dict[str, set[str]]:
    """Every finding's id mapped to the set of files its Where line names."""
    scopes: dict[str, set[str]] = {}
    positions = [(m.start(), m.group(1)) for m in FINDING.finditer(text)]
    for index, (start, finding_id) in enumerate(positions):
        end = positions[index + 1][0] if index + 1 < len(positions) else len(text)
        body = text[start:end]
        where = WHERE.search(body)
        if not where:
            scopes[finding_id] = set()
            continue
        line = where.group(1)
        scopes[finding_id] = set(KNOWN.findall(line)) | {path_key(p) for p in BACKTICKED_PATH.findall(line)}
    return scopes


def main() -> int:
    failures = 0
    checked = 0

    for review in REVIEWS:
        path = Path(review)
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        scopes = scope_of_findings(text)
        if review in SHAPE_SCOPE:
            for problem in shape_failures(review, text, scopes):
                failures += 1
                print(problem)

        for finding_id, disposition in ROW.findall(text):
            if not CLAIMS_CLOSED.search(disposition):
                continue  # Only "Closed" carries the burden.
            checked += 1
            scope = scopes.get(finding_id, set())
            cited = {key for key in scope if cites(key, disposition)}
            # A disposition that cites a bare section ("§6.1a", "R1.24") without its file is not
            # enough: the whole failure was citing one document's section and calling it done.
            missing = scope - cited
            if missing:
                failures += 1
                print(f"{review}: {finding_id} claims Closed but does not cite:")
                for name in sorted(missing):
                    print(f"    {name}   (its Where line names it)")
                print(f"    cited: {', '.join(sorted(cited)) or '(no file named)'}")

    print(f"\n{checked} dispositions claiming Closed, checked across {len(REVIEWS)} review files "
          f"(path-level scope enforced on {len(WIDE_SCOPE)} of them)")
    if failures:
        print(f"FAILED: {failures} overstate what changed")
        return 1
    print("Every Closed disposition cites every document its finding named.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
