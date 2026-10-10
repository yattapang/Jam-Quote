"""A design may call an answer "Mechanical now" only when a committed brief shows the check running against it.

## Why this exists

Designs carry a table of the recorded mistakes they are checked against (Rule 24), each row with a verdict:
**Mechanical now**, a C-step test, or **Not mechanical**. Three designs in a row over-claimed it. A6's table called
untested things executed (docs/MISTAKES.md M45), and A7's called the deferral checker mechanical for a design whose
deferrals it matches none of (M47, finding DR13). The verdict was the author's word, in prose — M23's shape. Rule 24.7
makes the claim cite its evidence, and this tool fails when it does not.

## What it does

1. Scans every tracked `docs/design/*.md`, outside code fences, for table rows (lines starting with "|") that carry
   the verdict "Mechanical now" (any case; "not mechanical now" is not the verdict).
2. Each such row must cite, in backticks, at least one `docs/briefs/<name>.md` that is a tracked file, and at least one
   cited brief must hold a ```check block whose text names this design's own path (`docs/design/<file>.md`) — a check
   that `tools/run_brief.py` ran, on the commit the brief names, against this design.
3. Fails, naming the file, line and what is missing. Prints its coverage every run (Rule 21.1).

## What it does NOT prove (Rule 21.4)

- That the cited check tests what the row claims. A brief whose check block greps this design for anything satisfies
  it; whether the check fits the claim is the closing check's reading. This makes the claim cite evidence; it does not
  judge the evidence.
- That the check still passes today. A brief's checks run on the commit it names; a later edit can break them unseen.
- Verdicts outside a table row, or worded otherwise ("mechanically enforced", "a guard exists"), are not seen. The
  verdict is a fixed phrase on purpose (A6's §13); a new wording is a reason to extend this tool, not to evade it.
- Only `docs/design/`. ADRs, the PRD and the rules are not scanned.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

VERDICT = re.compile(r"(?<!not )\bmechanical now\b", re.IGNORECASE)
BRIEF_CITE = re.compile(r"`(docs/briefs/[^`\s]+\.md)`")
FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})")
CHECK_BLOCK = re.compile(r"^```check[^\n]*\n(.*?)^```", re.DOTALL | re.MULTILINE)


def tracked(prefix: str) -> list[str]:
    out = subprocess.run(["git", "ls-files", "--", prefix], cwd=ROOT, capture_output=True, text=True, check=True)
    return [p for p in out.stdout.splitlines() if p]


def check_blocks(brief: str) -> list[str]:
    return CHECK_BLOCK.findall((ROOT / brief).read_text(encoding="utf-8"))


def main() -> int:
    designs = [p for p in tracked("docs/design/") if p.endswith(".md")]
    briefs = set(tracked("docs/briefs/"))
    if not designs:
        print("FAILED: no tracked design files found; refusing to report a clean run over nothing.")
        return 1
    rows = 0
    failures: list[str] = []
    for design in designs:
        fence = None
        for n, line in enumerate((ROOT / design).read_text(encoding="utf-8").splitlines(), 1):
            m = FENCE.match(line)
            if m:
                mark = m.group(1)[0]
                if fence is None:
                    fence = mark
                elif mark == fence:
                    fence = None
                continue
            if fence or not line.startswith("|") or not VERDICT.search(line):
                continue
            rows += 1
            cited = BRIEF_CITE.findall(line)
            if not cited:
                failures.append(f"{design}:{n}: claims 'Mechanical now' but cites no brief under docs/briefs/")
                continue
            missing = [b for b in cited if b not in briefs]
            if missing:
                failures.append(f"{design}:{n}: cites {', '.join(missing)}, not a tracked brief")
                continue
            if not any(design in block for b in cited for block in check_blocks(b)):
                failures.append(
                    f"{design}:{n}: no check block in {', '.join(cited)} names {design}, so nothing shows the check "
                    "running against this design"
                )
        if fence:
            failures.append(f"{design}: a code fence is never closed, so the rows after it were not checked")
    print(f"scanned {len(designs)} tracked design files; {rows} table rows claim 'Mechanical now'")
    for f in failures:
        print("  " + f)
    if failures:
        print(f"FAILED: {len(failures)} 'Mechanical now' claims without a brief's check behind them (Rule 24.7).")
        return 1
    print("Every 'Mechanical now' row cites a brief whose check ran against its design (Rule 24.7; its docstring "
          "lists what that does not prove).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
