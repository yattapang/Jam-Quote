"""A cited file, path or symbol must exist.

## Why this exists

This class of defect happened twice, and the second time was inside the fix for the first:

- `PRD.md` credited a guard called `honest-claims.test.ts` as the reason prices on the site were
  safe. **No such file has ever existed** (finding F5, logged as M14). The claim was protected by a
  citation rather than by a test.
- The fix for M14 put a comment in `site.ts` citing **`honestClaims` in site-guards.test.ts** — a
  symbol that does not exist either (finding H16). **The defect was re-committed inside its own
  fix**, which by Rule 24.4 means the lesson was decorative until it had a mechanism.

Rule 24.5's test: would this have caught it mechanically? Both, yes, and in under a second.

## What it checks

1. **Cited repository paths — retired here (finding R11, owner's decision 2026-09-30).** This tool
   skipped any path whose first segment was not a top-level directory (J1) and any line near a
   "denial" phrase (R11). Paths are checked by `tools/check_schema_citations.py`, which resolves
   paths in the forms its docstring lists and states the forms it does not (V13: this said "every one
   with no skip", which Rule 21.8 forbids); one guard per class rather than two that drift apart. Its check that a
   migration comment's identifier appears as text is retired for the same reason: that tool checks
   the identifier against the catalogue the migrations build instead.
2. **Cited bare filenames exist somewhere.** A backticked filename with no directory must match some
   tracked file's basename. This is the M14 case exactly: a guard credited by a name that never
   existed.
3. **A symbol cited *in* a named file appears in that file.** The pattern `` `symbol` in `file` ``
   (or without the second pair of backticks) asserts the symbol's text is present in that file. This
   is the H16 case exactly.

## What it does NOT prove (Rule 21.4)

- **Not that the cited thing does what the sentence claims.** `site-guards.test.ts` exists and the
  PRD could still credit it with a guarantee it does not provide. Only reading catches that, and it
  is why Rule 1.10's review is not replaced by this.
- Nothing about paths written without backticks, which are invisible to it. That is a deliberate
  limit: prose mentions filenames loosely and a greedier pattern would cry wolf, and a guard that
  cries wolf gets switched off (the narrowing already learned in `site-guards.test.ts`).
- Nothing about `original-app/`, which is read-only and whose references are history.
- Nothing about URLs, package names or anything outside the repository.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

SKIP_PREFIXES = ("original-app/",)

# Documents whose citations are EVIDENCE rather than claims, so a name that does not resolve is the
# point rather than a defect. Two kinds, and each entry needs its reason:
#
#  - Closed registers about the old application. Their citations were accurate when written and the
#    files have since moved or been deleted. That is what a historical record looks like, and editing
#    one to satisfy a guard would be falsifying it.
#  - Review registers and the mistake ledger, whose SUBJECT MATTER is broken citations. A review that
#    could not name `honest-claims.test.ts` could not report that it never existed, and the ledger
#    could not record the lesson.
#
# The alternative was a growing list of English idioms ("does not exist", "is actually", "survived
# long enough to") which is whack-a-mole: the exemption belongs to the document's purpose, not to a
# turn of phrase.
EVIDENCE_DOCS = {
    "REVIEW-FINDINGS.md": "Closed register about original-app; its paths are history.",
    "docs/COMPLIANCE-REVIEW.md": "The same, for the compliance pass.",
    "docs/PRD-REVIEW.md": "A review register: naming a broken citation is its job.",
    "docs/PRD-REVIEW-2.md": "The same.",
    "docs/PRD-REVIEW-3.md": "The same.",
    # Review 4 asked for this itself, in its housekeeping note: J1 and J9 exist only by naming phantoms.
    # Added 2026-09-27 together with its K1-K6 re-review, which names scratchpad probes not retained here.
    "docs/PRD-REVIEW-4.md": "The same.",
    "docs/MISTAKES.md": "The ledger records the phantom name as the lesson (M14, H16).",
    "docs/RULES-ENFORCEMENT-AUDIT.md": "Cites the phantom as the evidence for this very guard.",
}

# A citation may deliberately name something that does NOT exist: the ledger and the reviews discuss
# `honest-claims.test.ts` precisely because it never existed (M14). A sentence saying so is correct
# prose, not a broken citation, so a line that denies the thing's existence is exempt. The phrasing
# list is narrow on purpose — a guard that cries wolf gets switched off.
# No line is skipped for the phrases around it. A window of "denial" phrases ("rather than",
# "would be", ...) used to excuse whole lines, in silence (finding R11). Its only real work, measured
# when it was removed, was excusing the two lesson names below, which are now exempted by name.

# Names used as ILLUSTRATIONS or as work owed, rather than as citations. Each carries its reason, and
# the list is deliberately short: every entry is a place this guard is blind, so it should be hard to
# add and impossible to add silently — the same discipline as policy-parity's EXEMPT.
EXEMPT_NAMES = {
    "utils.ts": "Cited as a name NOT to use — 'never call a file utils.ts' (Rule 2).",
    "helpers.ts": "The same prohibition, in the same sentences.",
    "admin.ts": "A hypothetical module in an example, not a file anybody claims exists.",
    "sign-up.md": "A design that is owed and listed as owed: a citation to planned work.",
    "honest-claims.test.ts": (
        "M14's phantom, cited as the lesson this tool exists for. It must never be created: "
        "a file by that name would turn every lesson citing it into a false claim that it guards."
    ),
}

# The H16 case, cited as the lesson: `symbol` in `file`, where the symbol is absent on purpose.
EXEMPT_SYMBOLS = {
    ("honestClaims", "site-guards.test.ts"): "H16's phantom symbol, quoted in this tool's own history.",
}

SCAN_EXTS = (".md", ".ts", ".tsx", ".sql", ".yml", ".yaml", ".toml", ".py", ".prisma", ".mjs")

# A bare filename in backticks, no slash — the M14 case. Examples are described rather than
# written, because a fake filename in a comment is itself a broken citation and this guard would
# (correctly) flag its own documentation.
CITED_FILE = re.compile(r"`([A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:ts|tsx|js|mjs|sql|py|md|prisma|yml|yaml|toml))`")
# A backticked identifier, then "in", then a filename with or without backticks — the H16 case.
CITED_SYMBOL_IN = re.compile(
    r"`([A-Za-z_][A-Za-z0-9_]{2,})`\s+(?:is\s+)?in\s+`?([A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:ts|tsx|js|mjs|sql|py))`?"
)


def all_tracked() -> list[str]:
    """Everything, INCLUDING original-app, because citations legitimately point into it."""
    out = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True).stdout
    return out.split()


def scannable(files: list[str]) -> list[str]:
    """What we read citations OUT OF — which is narrower than what they may point at.

    The first run of this guard produced 228 findings and almost all were noise of two kinds, both
    worth recording because the narrowing is the interesting part of a guard (the same lesson
    `site-guards.test.ts` already learned):

    - `original-app/` was excluded from the INDEX, so every legitimate citation into the old
      application looked broken. It is now indexed and merely not scanned.
    - `.claude/agents/*.md` are briefs about the old application that cite paths relative to ITS
      root (`packages/core/src/...`), not the repository's. Those are not broken citations, they are
      a different base directory, and no guard can tell the difference. Skipped.
    """
    return [
        f
        for f in files
        if f.endswith(SCAN_EXTS)
        and not f.startswith(SKIP_PREFIXES)
        and not f.startswith(".claude/")
        and f not in EVIDENCE_DOCS
    ]


def main() -> int:
    files = all_tracked()
    by_basename: dict[str, list[str]] = {}
    for f in files:
        by_basename.setdefault(Path(f).name, []).append(f)

    problems: list[str] = []
    names_used: set[str] = set()
    symbols_used: set[tuple[str, str]] = set()
    scanned = 0

    for path in scannable(files):
        try:
            text = Path(path).read_text(encoding="utf-8")
        except (UnicodeDecodeError, FileNotFoundError):
            continue
        scanned += 1
        text_lines = text.splitlines()

        for number, line in enumerate(text_lines, 1):
            where = f"{path}:{number}"

            for cited in CITED_FILE.findall(line):
                if "/" in cited or cited in by_basename:
                    continue
                if cited in EXEMPT_NAMES:
                    names_used.add(cited)
                    continue
                problems.append(
                    f"{where}: cited file `{cited}` matches no file in the repository"
                )

            for symbol, filename in CITED_SYMBOL_IN.findall(line):
                targets = by_basename.get(Path(filename).name, [])
                if not targets:
                    continue  # the filename itself is reported by the rule above
                if any(symbol in Path(t).read_text(encoding="utf-8") for t in targets):
                    continue
                if (symbol, filename) in EXEMPT_SYMBOLS:
                    symbols_used.add((symbol, filename))
                    continue
                problems.append(
                    f"{where}: `{symbol}` is cited as being in {filename}, and is not there"
                )

    # An exemption that excuses nothing is a comment pretending to be a decision, and the next
    # mistake it would excuse is silent. So an unused entry fails the run.
    for name in sorted(set(EXEMPT_NAMES) - names_used):
        problems.append(f"EXEMPT_NAMES: `{name}` excuses no citation any more — remove the entry")
    for symbol, filename in sorted(set(EXEMPT_SYMBOLS) - symbols_used):
        problems.append(
            f"EXEMPT_SYMBOLS: `{symbol}` in {filename} excuses no citation any more — remove the entry"
        )

    # UNTRACKED FILES ARE INVISIBLE, and that has now cost two rounds: a green local run followed by
    # a red CI run, both times because a new migration had not been staged yet. Saying so is cheap and
    # the alternative is trusting a result that was computed over the wrong set of files (Rule 21.1).
    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        capture_output=True, text=True, check=True,
    ).stdout.split()
    unseen = [f for f in untracked if f.endswith(SCAN_EXTS) and not f.startswith(SKIP_PREFIXES)]

    print(f"scanned {scanned} tracked files")
    if unseen:
        print()
        print(
            f"NOTE: {len(unseen)} untracked file(s) were NOT scanned, because this reads "
            f"git ls-files. Stage them and run again before trusting a green result:"
        )
        for f in unseen[:10]:
            print(f"  {f}")
    if problems:
        print(f"\n{len(problems)} broken citation(s):")
        for problem in problems:
            print(f"  {problem}")
        print(
            "\nA citation that names something which does not exist reads as evidence and is not. "
            "This has happened twice (M14, H16) — the second time inside the fix for the first."
        )
        return 1
    print(
        "Every cited filename and symbol resolves. (Paths are checked by "
        "tools/check_schema_citations.py, not here.)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
