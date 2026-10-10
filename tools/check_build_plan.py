"""A step of the build plan is ticked only with its evidence — the owner's checklist, made mechanical.

## Why this exists

The owner asked (2026-10-02) for a checklist built into the build order, so that finishing a part of the build
means the same thing every time. `docs/BUILD-PLAN.md` states what "done" means — design approved, built with
planted defects, gate green, independently reviewed, closed by a check, recorded, signed off by the owner — and
asks that each tick carry its evidence. A tick is a sentence; this makes it a claim that can be checked.

## What it checks

Every ticked step (`- [x] <ID> · …`) must be followed, on the next line, by an evidence line of exactly this
shape:

    Done: <YYYY-MM-DD> · commit `<sha>` · review `<path>` · closing `<path>` · owner: approved <YYYY-MM-DD>

and the commit must exist in this repository, and both briefs must be files in it. A step whose box is
neither `[ ]` nor `[x]`, or an ID used twice, fails too. It prints the count of steps done and open.

**Every line that carries a checkbox must parse as a step** (since 2026-10-10, M46). The plan is read by one parser,
`read_plan`, which `tools/check_deferrals.py` imports too, so the two tools can never disagree about which steps
exist or are ticked. A line outside a code fence that contains a one-character bracket — `[x]`, `[ ]`, `[X]`, `[✓]` —
and is not exactly `- [<box>] <A-K><number> · …` is a failure, whatever its shape: a numbered list, a blockquote, a
bold or backticked or lower-case id, an id outside A-K, no id at all. This replaced, on Rule 21.9's instruction, two
pattern-based patches that each let a different set of shapes vanish silently (M46). A code fence opened with ``` or
~~~ must be closed with the same, or the run fails.

## What it does NOT prove (Rule 21.4)

- That the evidence is the RIGHT evidence: a real commit and a real brief that belong to another step pass.
  The review and the closing check are where that is judged.
- That the owner approved: the line records it; only the owner's own word in the conversation, recorded in
  `docs/BRIEF-STATUS.md`, is the approval.
- Anything about the order of steps, or a step done out of order.
- A step written with no checkbox at all (a plain bullet) is not a step to this tool; it is neither counted nor
  reported. The count of steps printed every run is where a missing one would show.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAN = ROOT / "docs" / "BUILD-PLAN.md"

STEP = re.compile(r"^- \[(.)\] ([A-K]\d+) · ")
# Any one-character bracket: the signature of a checkbox, in whatever shape it was written.
BOX = re.compile(r"\[[^\]\n]\]")
FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})")
EVIDENCE = re.compile(
    r"^  Done: (\d{4}-\d{2}-\d{2}) · commit `([0-9a-f]{7,40})` · review `([^`]+)` · closing `([^`]+)`"
    r" · owner: approved (\d{4}-\d{2}-\d{2})\s*$"
)


def read_plan(path: Path = PLAN) -> tuple[list[tuple[int, str, str]], list[str]]:
    """The plan's steps as (line index, box, id), and every line that looks like a step but is not one.

    The one parser of the plan: tools/check_deferrals.py imports it, so the two tools always agree."""
    lines = path.read_text(encoding="utf-8").splitlines()
    steps: list[tuple[int, str, str]] = []
    problems: list[str] = []
    fence: str | None = None
    for index, line in enumerate(lines):
        # The plan shows a worked example of a ticked step inside a code block; examples are not steps.
        opening = FENCE.match(line)
        if opening:
            mark = opening.group(1)[0]
            if fence is None:
                fence = mark
            elif fence == mark:
                fence = None
            continue
        if fence is not None:
            continue
        step = STEP.match(line)
        if step and step.group(1) in (" ", "x"):
            steps.append((index, step.group(1), step.group(2)))
        elif step:
            # In the parser, not only in main(): when this check lived in main(), check_deferrals.py — which imports
            # only the parser — read "[X] A5" as "A5 not ticked" and skipped its deferrals silently (the plants of
            # 2026-10-10 found it before commit).
            problems.append(f"docs/BUILD-PLAN.md:{index + 1}: {step.group(2)}'s box is [{step.group(1)}] — "
                            "only [ ] or [x]")
        elif BOX.search(line):
            problems.append(f"docs/BUILD-PLAN.md:{index + 1}: a checkbox on a line that is not a step in the form "
                            "'- [ ] A1 · …' — this tool and check_deferrals.py would otherwise miss it")
    if fence is not None:
        problems.append("docs/BUILD-PLAN.md: a code fence is never closed — every step after it would be skipped")
    return steps, problems


def commit_exists(sha: str) -> bool:
    result = subprocess.run(["git", "cat-file", "-e", f"{sha}^{{commit}}"], cwd=ROOT, capture_output=True)
    return result.returncode == 0


def main() -> int:
    lines = PLAN.read_text(encoding="utf-8").splitlines()
    steps, problems = read_plan()
    seen: set[str] = set()
    done = open_ = 0
    for index, box, step_id in steps:
        where = f"docs/BUILD-PLAN.md:{index + 1}"
        if step_id in seen:
            problems.append(f"{where}: {step_id} appears twice")
        seen.add(step_id)
        if box == " ":
            open_ += 1
            continue
        done += 1
        following = lines[index + 1] if index + 1 < len(lines) else ""
        evidence = EVIDENCE.match(following)
        if not evidence:
            problems.append(f"{where}: {step_id} is ticked without its evidence line (see the checklist's form)")
            continue
        _, sha, review, closing, _ = evidence.groups()
        if not commit_exists(sha):
            problems.append(f"{where}: {step_id} cites commit {sha}, which is not in this repository")
        for label, path in (("review", review), ("closing", closing)):
            if not (ROOT / path).is_file():
                problems.append(f"{where}: {step_id}'s {label} brief `{path}` is not a file in the repository")

    if not seen:
        problems.append("docs/BUILD-PLAN.md: no steps parsed — a plan this tool cannot read is not checked")
    for problem in problems:
        print(problem)
    print(f"\n{done} steps done, {open_} open, in docs/BUILD-PLAN.md")
    if problems:
        print(f"FAILED: {len(problems)} ticked steps without their evidence")
        return 1
    print("Every ticked step carries its evidence.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
