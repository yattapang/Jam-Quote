"""A brief's expectations, executed — so a brief is checked on the HEAD it names, not trusted (Rule 16.7).

## Why this exists

Two closing checks in a row went out with expected outputs that were wrong. M36: two greps that could not
see what they checked. M37, within the hour: the fix was applied, then undone by the next edit, because the
expectations were run while the tree was still changing and not again before launch. Both prevention notes
said the same thing — the brief's expectations must be executed as the last step before launch, on the
exact commit the checker will see — and both said it was "not mechanical". This makes it mechanical.

## What a brief file is

A markdown file, committed under `docs/briefs/`. Prose is for the reader — the checker agent, or a person.
Each expectation is a fenced block tagged `check`:

    ```check
    $ git status --short
    ```

The first line is the command, after `$ `. Every line after it is the EXACT standard output expected; an
empty block body means "no output". The command runs with `bash -c` from the repository root.

## What it does

1. Refuses to run on a dirty tree — an expectation run on uncommitted edits describes no commit (M37).
2. Prints the HEAD it ran on, so the brief's status entry can name it.
3. Runs every check in order and compares standard output exactly (trailing whitespace on each line, and
   trailing blank lines, are ignored). Prints PASS or FAIL per check, with the expected and actual output
   of every failure.
4. Refuses to call the run good if the tree is dirty AFTERWARDS — a check that plants a defect must restore
   it (Rule 21.2's plant doctrine), and one that did not has left a defect in the tree.

The same command is what the checker runs; the builder runs it first, after the final commit, and records
the HEAD and the count. That is the whole control: one file, executed twice, on one commit.

## What it does NOT prove (Rule 21.4)

- That the expectations are the RIGHT ones. A check can pass and test nothing — M36's greps would have
  "passed" against the wrong text. Choosing what to check is still the brief author's judgement.
- Anything in the prose. Items a checker must read rather than run are not executed here.
- Anything about standard error, or exit codes: only standard output is compared. A command whose failure
  matters must make it visible on standard output (`; echo "exit $?"`).
- That a check is side-effect free. It runs real commands; a brief is reviewed like code.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHECK = re.compile(r"^```check[ \t]*\n(.*?)^```[ \t]*$", re.M | re.S)
TIMEOUT_SECONDS = 1800


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def normalise(text: str) -> list[str]:
    lines = [line.rstrip() for line in text.splitlines()]
    while lines and lines[-1] == "":
        lines.pop()
    return lines


def checks(brief: str) -> list[tuple[str, list[str]]]:
    found = []
    for index, match in enumerate(CHECK.finditer(brief), start=1):
        body = match.group(1).splitlines()
        if not body or not body[0].startswith("$ "):
            raise SystemExit(f"check {index}: its first line must be the command, as '$ <command>'")
        found.append((body[0][2:], normalise("\n".join(body[1:]))))
    return found


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python3 tools/run_brief.py <brief.md>")
        return 2
    brief = Path(sys.argv[1])
    expectations = checks(brief.read_text(encoding="utf-8"))
    if not expectations:
        print(f"{brief}: no ```check blocks — a brief with nothing to execute is not a checked brief")
        return 1

    dirty = git("status", "--porcelain")
    if dirty:
        print("REFUSED: the tree has uncommitted changes, so these expectations would describe no commit (M37):")
        print(dirty.rstrip())
        return 1
    head = git("rev-parse", "--short", "HEAD").strip()
    print(f"HEAD {head}")

    passed = 0
    for index, (command, expected) in enumerate(expectations, start=1):
        try:
            result = subprocess.run(["bash", "-c", command], cwd=ROOT, capture_output=True, text=True,
                                    timeout=TIMEOUT_SECONDS)
            actual = normalise(result.stdout)
        except subprocess.TimeoutExpired:
            actual = [f"<timed out after {TIMEOUT_SECONDS}s>"]
        if actual == expected:
            passed += 1
            print(f"PASS {index}: {command}")
        else:
            print(f"FAIL {index}: {command}")
            print("  expected:")
            for line in expected or ["<no output>"]:
                print(f"    {line}")
            print("  actual:")
            for line in actual or ["<no output>"]:
                print(f"    {line}")

    after = git("status", "--porcelain")
    if after:
        print("FAIL: the tree is dirty after the checks — one of them changed a file and did not restore it:")
        print(after.rstrip())

    print(f"Brief {brief} at HEAD {head}: {passed} of {len(expectations)} expectations hold"
          + (", and the tree was left dirty" if after else "") + ".")
    return 0 if passed == len(expectations) and not after else 1


if __name__ == "__main__":
    sys.exit(main())
