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
reviews in `WIDE_SCOPE`; for the older reviews the same check runs and its misses are PRINTED as legacy
gaps owed an audit, so the narrower historical check can no longer read as clean.

## What it does NOT prove (Rule 21.4)

- **Not that the cited text says what the disposition claims.** It checks that the author looked at every
  document the finding named, not that the edit was correct. Only a re-review does that, which is why
  Rule 1.10's re-review is not replaced by this.
- Nothing about findings whose `**Where:**` line omits a file it should have named.
- Not that the ten legacy gaps it prints were closed properly — only that nothing cited those paths.
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
# Enforced on review 4 onward. Reviews 1-3 were closed against the narrower name list; widening it showed
# TEN of their Closed rows never cited a file their own Where line named (ADRs 0023 and 0024, a review
# register, check_rules.py, rules-manifest.json, MISTAKES.md). Each needs its closure re-audited, not a
# filename pasted into the row — so they are PRINTED as legacy gaps on every run, by name, and counted,
# rather than failing the build or being hidden. Moving a review into WIDE_SCOPE is the act of finishing
# that audit.
WIDE_SCOPE = {"docs/PRD-REVIEW-4.md"}
BACKTICKED_PATH = re.compile(r"`([^`\s]+/[^`\s]+\.[a-z]+)`")


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


def scope_line_names(text: str, finding_id: str) -> str:
    """The Where line of one finding, for telling legacy name-list scope from path scope."""
    positions = [(m.start(), m.group(1)) for m in FINDING.finditer(text)]
    for index, (start, fid) in enumerate(positions):
        if fid == finding_id:
            end = positions[index + 1][0] if index + 1 < len(positions) else len(text)
            where = WHERE.search(text[start:end])
            return where.group(1) if where else ""
    return ""


def main() -> int:
    failures = 0
    checked = 0
    legacy: list[str] = []

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
            cited = set(KNOWN.findall(disposition)) | {key for key in scope if key in disposition}
            # A disposition that cites a bare section ("§6.1a", "R1.24") without its file is not
            # enough: the whole failure was citing one document's section and calling it done.
            missing = scope - cited
            if missing and review not in WIDE_SCOPE:
                legacy_missing = missing - set(KNOWN.findall(scope_line_names(text, finding_id)))
                missing = missing - legacy_missing
                if legacy_missing:
                    legacy.append(f"{review}: {finding_id} does not cite {', '.join(sorted(legacy_missing))}")
            if missing:
                failures += 1
                print(f"{review}: {finding_id} claims Closed but does not cite:")
                for name in sorted(missing):
                    print(f"    {name}   (its Where line names it)")
                print(f"    cited: {', '.join(sorted(cited)) or '(no file named)'}")

    print(f"\n{checked} dispositions claiming Closed, checked across {len(REVIEWS)} review files "
          f"(path-level scope enforced on {len(WIDE_SCOPE)} of them)")
    if legacy:
        print(f"\nLEGACY GAPS, owed an audit ({len(legacy)}): Closed rows in older reviews that do not cite a "
              f"path their Where line names. Not failing yet; not clean either.")
        for line in legacy:
            print(f"  {line}")
    if failures:
        print(f"FAILED: {failures} overstate what changed")
        return 1
    if legacy:
        print(f"Every Closed disposition cites every document in the scope enforced for its review; "
              f"{len(legacy)} legacy gap(s) above are NOT covered by that statement.")
    else:
        print("Every Closed disposition cites every document its finding named.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
