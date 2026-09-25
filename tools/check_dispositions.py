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

## What it does NOT prove (Rule 21.4)

- **Not that the cited text says what the disposition claims.** It checks that the author looked at every
  document the finding named, not that the edit was correct. Only a re-review does that, which is why
  Rule 1.10's re-review is not replaced by this.
- Nothing about findings whose `**Where:**` line omits a file it should have named.
- Nothing about sections cited by a name that does not exist — a stricter check could verify anchors, and
  that is owed rather than promised.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REVIEWS = ("docs/PRD-REVIEW.md", "docs/PRD-REVIEW-2.md")
# Files a "Where:" line may name. Anything else on that line is prose, not scope.
KNOWN = re.compile(r"(PRD\.md|domain-model\.md|TIERS\.md|SERVICE-REGISTER\.md|RULES\.md|THREAT-MODEL\.md|PHASE-0-AUDIT\.md|site\.ts|site-guards\.test\.ts)")
FINDING = re.compile(r"^## ([FG]\d+) · (.+?) — severity: (\w+)", re.M)
WHERE = re.compile(r"^\*\*Where:\*\* (.+?)(?=\n\*\*|\n\n)", re.M | re.S)
# A disposition row: | **F1** | blocker | text |
ROW = re.compile(r"^\|\s*\*\*([FG]\d+)\*\*\s*\|[^|]*\|\s*(.+?)\s*\|\s*$", re.M)
CLAIMS_CLOSED = re.compile(r"\*\*Closed\b", re.I)


def scope_of_findings(text: str) -> dict[str, set[str]]:
    """Every finding's id mapped to the set of files its Where line names."""
    scopes: dict[str, set[str]] = {}
    positions = [(m.start(), m.group(1)) for m in FINDING.finditer(text)]
    for index, (start, finding_id) in enumerate(positions):
        end = positions[index + 1][0] if index + 1 < len(positions) else len(text)
        body = text[start:end]
        where = WHERE.search(body)
        scopes[finding_id] = set(KNOWN.findall(where.group(1))) if where else set()
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

        for finding_id, disposition in ROW.findall(text):
            if not CLAIMS_CLOSED.search(disposition):
                continue  # Only "Closed" carries the burden.
            checked += 1
            scope = scopes.get(finding_id, set())
            cited = set(KNOWN.findall(disposition))
            # A disposition that cites a bare section ("§6.1a", "R1.24") without its file is not
            # enough: the whole failure was citing one document's section and calling it done.
            missing = scope - cited
            if missing:
                failures += 1
                print(f"{review}: {finding_id} claims Closed but does not cite:")
                for name in sorted(missing):
                    print(f"    {name}   (its Where line names it)")
                print(f"    cited: {', '.join(sorted(cited)) or '(no file named)'}")

    print(f"\n{checked} dispositions claiming Closed, checked across {len(REVIEWS)} review files")
    if failures:
        print(f"FAILED: {failures} overstate what changed")
        return 1
    print("Every Closed disposition cites every document its finding named.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
