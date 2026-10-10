"""A step of the build plan is ticked only with its evidence — the owner's checklist, made mechanical.

## Why this exists

The owner asked (2026-10-02) for a checklist built into the build order, so that finishing a part of the build
means the same thing every time. `docs/BUILD-PLAN.md` states what "done" means — design approved, built with
planted defects, gate green, independently reviewed, closed by a check, recorded, signed off by the owner — and
asks that each tick carry its evidence. A tick is a sentence; this makes it a claim that can be checked.

## What it checks

1. **Every step the plan holds is read** — against a complete index, not a shape. `docs/build-plan-manifest.json` lists
   every step id. The steps this tool parses must be exactly those ids: a step that does not parse — whatever was done
   to its line (`[ x]`, `[]`, `[xx]`, `( x )`, `☑`, a numbered list, a blockquote, a bold or full-width id …) — is
   reported missing, and one that appears without being in the index is reported new. Changing the plan's steps on
   purpose means running `python tools/check_build_plan.py --update`, which rewrites the index and lands in the diff
   (Rule 23.3's pattern). This replaced, on Rule 21.9's instruction, two pattern-based guards that each let a different
   set of tick shapes vanish silently (M46).
2. Every ticked step (`- [x] <ID> · …`) is followed, on the next line, by an evidence line of exactly this shape:

       Done: <YYYY-MM-DD> · commit `<sha>` · review `<path>` · closing `<path>` · owner: approved <YYYY-MM-DD>

   and the commit exists in this repository, and both briefs are files in it.
3. An evidence line ("  Done: …") that does not follow a ticked step fails — an orphan means a tick was lost above it.
4. A box other than `[ ]` or `[x]`, a step id used twice, and a code fence (``` or ~~~) never closed all fail.
5. Ids are read in ASCII after Unicode normalisation (NFKC), so a full-width `A５` is `A5` to this tool and to
   `tools/check_deferrals.py`, which reads the plan through this module's `read_plan` and never a parser of its own.

## What it does NOT prove (Rule 21.4)

- That the evidence is the RIGHT evidence: a real commit and a real brief that belong to another step pass.
  The review and the closing check are where that is judged.
- That the owner approved: the line records it; only the owner's own word in the conversation, recorded in
  `docs/BRIEF-STATUS.md`, is the approval.
- Anything about the order of steps, or a step done out of order.
- That the index is right: `--update` records whatever the plan holds when it is run. Reviewing that diff is the
  control, as with `docs/rules-manifest.json`.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAN = ROOT / "docs" / "BUILD-PLAN.md"
MANIFEST = ROOT / "docs" / "build-plan-manifest.json"

STEP = re.compile(r"^- \[(.)\] ([A-K][0-9]+) · ")
FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})")
EVIDENCE_START = re.compile(r"^\s*Done:")
EVIDENCE = re.compile(
    r"^  Done: (\d{4}-\d{2}-\d{2}) · commit `([0-9a-f]{7,40})` · review `([^`]+)` · closing `([^`]+)`"
    r" · owner: approved (\d{4}-\d{2}-\d{2})\s*$"
)


def read_plan(path: Path = PLAN) -> tuple[list[tuple[int, str, str]], list[str]]:
    """The plan's steps as (line index, box, id), and every problem that makes the parse incomplete.

    The one parser of the plan: tools/check_deferrals.py imports it, so the two tools always agree. Its completeness is
    proved against the manifest of step ids, not by recognising malformed shapes (Rule 21.9)."""
    lines = [unicodedata.normalize("NFKC", line) for line in path.read_text(encoding="utf-8").splitlines()]
    steps: list[tuple[int, str, str]] = []
    problems: list[str] = []
    fence: str | None = None
    previous_ticked = False
    for index, line in enumerate(lines):
        where = f"docs/BUILD-PLAN.md:{index + 1}"
        opening = FENCE.match(line)
        if opening:
            mark = opening.group(1)[0]
            if fence is None:
                fence = mark
            elif fence == mark:
                fence = None
            previous_ticked = False
            continue
        if fence is not None:
            continue  # the plan's worked example of a tick sits in a fence; examples are not steps
        step = STEP.match(line)
        if step and step.group(1) in (" ", "x"):
            steps.append((index, step.group(1), step.group(2)))
        elif step:
            problems.append(f"{where}: {step.group(2)}'s box is [{step.group(1)}] — only [ ] or [x]")
        elif EVIDENCE_START.match(line) and not previous_ticked:
            problems.append(f"{where}: an evidence line with no ticked step directly above it — was a tick lost?")
        previous_ticked = bool(step and step.group(1) == "x")
    if fence is not None:
        problems.append("docs/BUILD-PLAN.md: a code fence is never closed — every step after it would be skipped")

    ids = [step_id for _, _, step_id in steps]
    seen: set[str] = set()
    for step_index, _, step_id in steps:
        if step_id in seen:
            problems.append(f"docs/BUILD-PLAN.md:{step_index + 1}: {step_id} appears twice")
        seen.add(step_id)
    if MANIFEST.is_file():
        expected = json.loads(MANIFEST.read_text(encoding="utf-8"))["steps"]
        for missing in [s for s in expected if s not in seen]:
            problems.append(f"docs/BUILD-PLAN.md: step {missing} is in the index but its line does not parse as "
                            "'- [ ] ID · …' or '- [x] ID · …' — fix the line, or, if the step was removed on purpose, "
                            "run tools/check_build_plan.py --update")
        for extra in [s for s in ids if s not in expected]:
            problems.append(f"docs/BUILD-PLAN.md: step {extra} is not in the index — if it was added on purpose, run "
                            "tools/check_build_plan.py --update")
    else:
        problems.append(f"{MANIFEST.relative_to(ROOT)} is missing — create it with tools/check_build_plan.py --update")
    return steps, problems


def commit_exists(sha: str) -> bool:
    result = subprocess.run(["git", "cat-file", "-e", f"{sha}^{{commit}}"], cwd=ROOT, capture_output=True)
    return result.returncode == 0


def update_manifest() -> int:
    saved = MANIFEST.read_text(encoding="utf-8") if MANIFEST.is_file() else None
    if saved is not None:
        MANIFEST.unlink()  # read the plan without the index, so the parse is not judged against the old one
    try:
        steps, problems = read_plan()
    finally:
        if saved is not None and not MANIFEST.is_file():
            MANIFEST.write_text(saved, encoding="utf-8")
    problems = [p for p in problems if "build-plan-manifest.json is missing" not in p]
    if problems:
        print("\n".join(problems))
        print("\nNot updating the index from a plan this tool cannot read in full.")
        return 1
    data = {
        "generated_from": "docs/BUILD-PLAN.md",
        "note": "Regenerated deliberately with tools/check_build_plan.py --update. Every step the plan holds; a step "
                "whose line stops parsing is then reported missing, whatever was done to it.",
        "steps": [step_id for _, _, step_id in steps],
    }
    MANIFEST.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{MANIFEST.relative_to(ROOT)}: {len(steps)} steps recorded")
    return 0


def main() -> int:
    if "--update" in sys.argv:
        return update_manifest()
    lines = [unicodedata.normalize("NFKC", line) for line in PLAN.read_text(encoding="utf-8").splitlines()]
    steps, problems = read_plan()
    done = open_ = 0
    for index, box, step_id in steps:
        where = f"docs/BUILD-PLAN.md:{index + 1}"
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

    if not steps:
        problems.append("docs/BUILD-PLAN.md: no steps parsed — a plan this tool cannot read is not checked")
    for problem in problems:
        print(problem)
    print(f"\n{done} steps done, {open_} open, in docs/BUILD-PLAN.md ({len(steps)} parsed; the index holds "
          f"{len(json.loads(MANIFEST.read_text(encoding='utf-8'))['steps']) if MANIFEST.is_file() else 0})")
    if problems:
        print(f"FAILED: {len(problems)} problem(s) in the build plan")
        return 1
    print("Every ticked step carries its evidence.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
