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

1. **Cited repository paths exist.** A backticked path containing `/` and a known extension, in any
   tracked Markdown or source comment, must resolve to a real file.
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
    "docs/MISTAKES.md": "The ledger records the phantom name as the lesson (M14, H16).",
    "docs/RULES-ENFORCEMENT-AUDIT.md": "Cites the phantom as the evidence for this very guard.",
}

# A citation may deliberately name something that does NOT exist: the ledger and the reviews discuss
# `honest-claims.test.ts` precisely because it never existed (M14). A sentence saying so is correct
# prose, not a broken citation, so a line that denies the thing's existence is exempt. The phrasing
# list is narrow on purpose — a guard that cries wolf gets switched off.
DENIALS = re.compile(
    r"does not exist|never existed|no such file|is not there|matches no file|"
    r"that does not exist|not a real|never been|phantom|"
    # A review QUOTES a broken citation and corrects it in the next breath ("the file is actually
    # …"). That is the review doing its job, so the correction idiom is exempt too.
    r"is actually|"
    # Counterfactuals: a comment explaining the road NOT taken names the thing it rejected.
    # "A nullable `withdrawn_at` would need an UPDATE grant" is a reason, not a claim.
    r"would need|would be|would mean|would have|instead of|rather than|we did not|nobody|"
    r"the alternative|alternative was|which needs an|rejected",
    re.I,
)

# Names used as ILLUSTRATIONS or as work owed, rather than as citations. Each carries its reason, and
# the list is deliberately short: every entry is a place this guard is blind, so it should be hard to
# add and impossible to add silently — the same discipline as policy-parity's EXEMPT.
EXEMPT_NAMES = {
    "utils.ts": "Cited as a name NOT to use — 'never call a file utils.ts' (Rule 2).",
    "helpers.ts": "The same prohibition, in the same sentences.",
    "admin.ts": "A hypothetical module in an example, not a file anybody claims exists.",
    "sign-up.md": "A design that is owed and listed as owed: a citation to planned work.",
}

SCAN_EXTS = (".md", ".ts", ".tsx", ".sql", ".yml", ".yaml", ".toml", ".py", ".prisma", ".mjs")
CODE_EXTS = (
    ".md", ".ts", ".tsx", ".js", ".mjs", ".sql", ".yml", ".yaml", ".toml", ".json", ".py",
    ".prisma", ".css", ".svg", ".png", ".html",
)

# `some/path/file.ts` — a path, with at least one slash.
CITED_PATH = re.compile(r"`([A-Za-z0-9_@./-]+/[A-Za-z0-9_.-]+\.[a-z]{2,6})`")
# A bare filename in backticks, no slash — the M14 case. Examples are described rather than
# written, because a fake filename in a comment is itself a broken citation and this guard would
# (correctly) flag its own documentation.
CITED_FILE = re.compile(r"`([A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:ts|tsx|js|mjs|sql|py|md|prisma|yml|yaml|toml))`")
# A backticked snake_case identifier — a column, table or setting name — which must appear somewhere
# in the SAME file outside its own backticks. This is the class the guard MISSED on the day it was
# written: the Documents migration's comment said "`client_reference` is the idempotency key" and the
# column did not exist, which is M14 wearing SQL. An underscore is required, because that is what
# separates an identifier from an English word in backticks.
CITED_IDENTIFIER = re.compile(r"`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`")

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
    existing = set(files)
    by_basename: dict[str, list[str]] = {}
    for f in files:
        by_basename.setdefault(Path(f).name, []).append(f)

    # A path is only checkable if it is anchored at a real top-level entry: a path starting with a
    # directory this repository actually has. One starting with a segment it does not have is
    # relative to some other root and unjudgeable from here.
    top_level = {f.split("/", 1)[0] for f in files}

    # Every migration's text with its own backticks stripped, so a claim in a comment is checked
    # against real SQL rather than against another comment repeating it.
    migration_bodies = [
        re.sub(r"`[^`]*`", "", Path(f).read_text(encoding="utf-8"))
        for f in files
        if "/migrations/" in f and f.endswith(".sql")
    ]

    problems: list[str] = []
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
            # A denial may sit on the neighbouring line, because prose wraps. The window is one line
            # either side and no more: widen it further and a denial three sentences away starts
            # excusing an unrelated citation.
            window = " ".join(text_lines[max(0, number - 2) : number + 1])
            if DENIALS.search(window):
                continue

            for cited in CITED_PATH.findall(line):
                if not cited.endswith(CODE_EXTS):
                    continue
                if cited.split("/", 1)[0] not in top_level:
                    continue  # relative to a different root; see `scannable`
                if cited in existing or Path(cited).exists():
                    continue
                # A path relative to the citing file is legitimate too.
                if (Path(path).parent / cited).exists():
                    continue
                problems.append(f"{where}: cited path `{cited}` does not exist")

            for cited in CITED_FILE.findall(line):
                if "/" in cited or cited in by_basename or cited in EXEMPT_NAMES:
                    continue
                problems.append(
                    f"{where}: cited file `{cited}` matches no file in the repository"
                )

            # ONLY IN MIGRATIONS, and the narrowing is the lesson. The first version applied this to
            # every source file and flagged six legitimate comments: a test header naming the tables
            # it nearly dropped, and a core module explaining the created_at/updated_at convention.
            # Those files DISCUSS names that live elsewhere, which is normal prose.
            #
            # A migration is different: it is the file that BRINGS a column into existence, so a
            # comment there describing one in the present tense is a claim about its own contents.
            # That is where `client_reference` was credited and absent.
            if "/migrations/" in path and path.endswith(".sql"):
                for cited in CITED_IDENTIFIER.findall(line):
                    # Checked against EVERY migration, not this one. A migration's comment claims
                    # something about the database, and the database is the sum of the migrations —
                    # so a column introduced by a later one (a correction, Rule 6) resolves, which
                    # is exactly the case `client_reference` turned out to be.
                    # Word boundaries, not a substring. The first version matched `client_reference`
                    # inside the index name `variation_issue_client_reference_key`, so a planted
                    # defect passed — the guard was satisfied by a longer identifier that merely
                    # contained the cited one.
                    standalone = re.compile(rf"(?<![A-Za-z0-9_]){re.escape(cited)}(?![A-Za-z0-9_])")
                    if any(standalone.search(body) for body in migration_bodies):
                        continue
                    problems.append(
                        f"{where}: `{cited}` is described here and appears nowhere else in this file"
                    )

            for symbol, filename in CITED_SYMBOL_IN.findall(line):
                targets = by_basename.get(Path(filename).name, [])
                if not targets:
                    continue  # the filename itself is reported by the rule above
                if any(symbol in Path(t).read_text(encoding="utf-8") for t in targets):
                    continue
                problems.append(
                    f"{where}: `{symbol}` is cited as being in {filename}, and is not there"
                )

    print(f"scanned {scanned} tracked files")
    if problems:
        print(f"\n{len(problems)} broken citation(s):")
        for problem in problems:
            print(f"  {problem}")
        print(
            "\nA citation that names something which does not exist reads as evidence and is not. "
            "This has happened twice (M14, H16) — the second time inside the fix for the first."
        )
        return 1
    print("Every cited path, filename and symbol resolves.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
