"""A step that is decided is never still "to be decided" somewhere else.

## Why this exists

Designs defer to later build steps: "the storage provider is chosen in A5", "priced in A5", "A5 confirms the choice".
When the later step is ticked in docs/BUILD-PLAN.md, each such sentence has to be rewritten or given a dated pointer to
the design that decided it. Twice in two days one was left standing, and a document went on saying a decided thing was
still open (docs/MISTAKES.md M45; findings MR16 and MR24 of design A6). Only a reviewer reading found them. This makes
the finding mechanical for the forms it knows. Design: docs/design/deferral-checker.md.

## What it does

1. Collects the ticked step ids from docs/BUILD-PLAN.md ("- [x] A5 · ...").
2. Scans every tracked Markdown file, except those skipped by purpose (SKIPPED, printed every run), for a deferral
   phrase: a deferral verb + "in"/"by" + an optional "design" + a step id, or a step id + a deferral verb (FORWARD,
   BACKWARD below).
3. A phrase naming a ticked step is resolved only if the same line also carries a quotation of it, a dated pointer
   ("Pointer YYYY-MM-DD"), or a backticked docs/design/*.md path after it. Anything else fails the run.
4. Prints its coverage every run: files scanned and skipped, phrases found, those naming ticked steps, how each was
   resolved, and the failures (Rule 21.1).

## What it does NOT prove (Rule 21.4)

- Other wordings pass unseen: "(A6)" used as a placeholder, "owed to A5", "waits for A6", "chosen in the A5 step", two
  spaces inside the phrase, a step id glued to a word ("matchedA5"), or the phrase broken across two lines (the scan is
  per line, and a resolution counts only on the phrase's own line). The verb list is short on purpose; a second miss
  of the same class means replacing this tool's shape, not adding a verb (Rule 21.9).
- It reads the plan's ticks through check_build_plan.py's parser (`read_plan`). A line carrying a checkbox that is not
  a well-formed step, or a fence left open, stops the run rather than shrinking the set it checks (M46). A step written
  with no checkbox at all is not a step to either tool.
- A deletion that leaves another document relying on what was removed is invisible to it (A6's MR16).
- A resolution is checked for presence, not truth: a dated pointer to the wrong design passes.
- Deferrals to steps not yet ticked are correct and are not checked.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAN = ROOT / "docs" / "BUILD-PLAN.md"

# Files whose purpose is to record history or to quote findings; a deferral phrase in them is a record of the past.
# Exempt by purpose, never by wording (Rule 21.8). Each is printed on every run.
SKIPPED = {
    "docs/MISTAKES.md": "the mistakes ledger quotes the stale phrases it records",
    "docs/BRIEF-STATUS.md": "the dated status log records what was true when written",
    "docs/DELEGATION-LOG.md": "the delegation log records past launches",
}
SKIPPED_PREFIXES = {
    "docs/briefs/": "briefs quote findings and the wording they check for",
    "docs/PRD-REVIEW-": "review registers quote the text they reviewed",
}

STEP = r"[A-K][0-9]{1,2}"
VERBS = r"chosen|priced|decided|designed|confirmed|settled|named|picked"
FORWARD = re.compile(rf"\b(?:to be |not yet )?(?:{VERBS}) (?:in|by) (?:design )?({STEP})\b", re.IGNORECASE)
# Case-insensitive, like FORWARD: before 2026-10-10 this was case-sensitive, and "a6 will confirm" passed unseen (found
# by the independent check, docs/briefs/2026-10-10-deferral-checker-check.md).
BACKWARD = re.compile(rf"\b({STEP}) (?:chooses|confirms|prices|decides|will choose|will confirm|will decide)\b",
                      re.IGNORECASE)
POINTER = re.compile(r"pointer \d{4}-\d{2}-\d{2}", re.IGNORECASE)
DESIGN_PATH = re.compile(r"`docs/design/[A-Za-z0-9_.-]+\.md`")
QUOTES = [('"', '"'), ("“", "”")]


def tracked_markdown() -> list[str]:
    out = subprocess.run(["git", "ls-files", "*.md"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return [line for line in out.splitlines() if line]


def ticked_steps() -> set[str]:
    # The plan is read by check_build_plan.py's own parser, never a second copy (Rule 7): two copies of the parsing
    # disagreed twice in one day — first this tool read a fenced example as a B1 tick, then both let malformed tick
    # lines vanish silently (M46). If the parser cannot read every checkbox line, refuse to run rather than check a
    # smaller set than the plan holds.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from check_build_plan import read_plan

    steps, problems = read_plan(PLAN)
    if problems:
        raise SystemExit("\n".join(problems) + "\nnot checking deferrals against a plan that cannot be read in full")
    return {step_id for _, box, step_id in steps if box == "x"}


def skip_reason(path: str) -> str | None:
    if path in SKIPPED:
        return SKIPPED[path]
    for prefix, reason in SKIPPED_PREFIXES.items():
        if path.startswith(prefix):
            return reason
    return None


def inside_quotes(line: str, start: int, end: int) -> bool:
    for open_q, close_q in QUOTES:
        before = line.rfind(open_q, 0, start)
        if before == -1:
            continue
        after = line.find(close_q, end)
        if after == -1:
            continue
        # Straight quotes pair up: the phrase is quoted only if an odd number of quotes precede it.
        if open_q == close_q and line.count(open_q, 0, start) % 2 == 0:
            continue
        return True
    return False


def main() -> int:
    ticked = ticked_steps()
    files = tracked_markdown()
    scanned, skipped = [], []
    found = naming_ticked = 0
    resolved = {"quotation": 0, "dated pointer": 0, "cites the deciding design": 0}
    failures = []

    for path in files:
        reason = skip_reason(path)
        if reason:
            skipped.append((path, reason))
            continue
        scanned.append(path)
        text = (ROOT / path).read_text(encoding="utf-8", errors="replace")
        for number, line in enumerate(text.splitlines(), start=1):
            for pattern in (FORWARD, BACKWARD):
                for match in pattern.finditer(line):
                    found += 1
                    step = match.group(1).upper()
                    if step not in ticked:
                        continue
                    naming_ticked += 1
                    if inside_quotes(line, match.start(), match.end()):
                        resolved["quotation"] += 1
                    elif POINTER.search(line):
                        resolved["dated pointer"] += 1
                    elif DESIGN_PATH.search(line, match.end()):
                        resolved["cites the deciding design"] += 1
                    else:
                        failures.append((path, number, step, match.group(0)))

    print(f"ticked steps: {', '.join(sorted(ticked, key=lambda s: (s[0], int(s[1:])))) or 'none'}")
    print(f"scanned {len(scanned)} tracked Markdown files; skipped {len(skipped)} by purpose:")
    shown = set()
    for path, reason in skipped:
        key = next((p for p in SKIPPED_PREFIXES if path.startswith(p)), path)
        if key in shown:
            continue
        shown.add(key)
        count = sum(1 for p, _ in skipped if p.startswith(key)) if key in SKIPPED_PREFIXES else 1
        print(f"  {key}{'*' if key in SKIPPED_PREFIXES else ''} ({count}) - {reason}")
    print(f"{found} deferral phrases found; {naming_ticked} name a ticked step; resolved: "
          + ", ".join(f"{n} by {kind}" for kind, n in resolved.items()))
    if failures:
        print()
        for path, number, step, phrase in failures:
            print(f"{path}:{number}: '{phrase}' defers to {step}, which is ticked - rewrite it, or add "
                  f"'(Pointer YYYY-MM-DD: ...)' naming the design that decided it")
        print(f"\nFAILED: {len(failures)} deferral(s) to a decided step")
        return 1
    print("No deferral names a decided step, in the forms this tool checks (its docstring lists what it does not).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
