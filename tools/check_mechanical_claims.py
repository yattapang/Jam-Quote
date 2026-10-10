"""A design may call an answer "Mechanical now" only when a committed brief shows the check running against it.

## Why this exists

Designs carry a table of the recorded mistakes they are checked against (Rule 24), each row with a verdict:
**Mechanical now**, a C-step test, or **Not mechanical**. Three designs in a row over-claimed it. A6's table called
untested things executed (docs/MISTAKES.md M45), and A7's called the deferral checker mechanical for a design whose
deferrals it matches none of (M47, finding DR13). The verdict was the author's word, in prose — M23's shape. Rule 24.7
makes the claim cite its evidence, and this tool fails when it does not.

## Its shape, and why (Rule 21.9)

The first two versions looked for the verdict only in Markdown table rows, outside code fences and HTML comments — so
they had to read Markdown, and each reading had holes: an indented or blockquoted row, a fence mark inside a comment, a
backticked "<!--", a zero-width character inside the phrase (A7's closing check and its re-check, M47). Two misses of
one class, so the shape was replaced: **this tool reads no Markdown structure at all.** Every line of every tracked
design that says the verdict — in a table, in prose, in a fence, in a comment, in a quote — must cite the brief. A
design that wants to *describe* the verdict without claiming it words the description otherwise, or cites the brief.

## What it does

1. Reads every tracked `docs/design/*.md`, line by line, and normalises each line for matching: HTML entities decoded
   (`&nbsp;`), Unicode NFKC (non-breaking and fullwidth forms), every invisible format character removed (Unicode
   category Cf: zero-width spaces and joiners, soft hyphens) — read twice, once dropped and once as a space, so both
   "Mech<ZWSP>anical now" and "Mechanical<ZWSP>now" are seen — emphasis and code marks (`*`, `_`, backtick) dropped,
   and whitespace collapsed.
2. A line whose normalised text says "mechanical now" (any case; "not mechanical now" is not the verdict) must cite, in
   backticks, at least one `docs/briefs/<name>.md` that is a tracked file, and at least one cited brief must hold a
   ```check block whose text names this design's own path — a check that `tools/run_brief.py` ran, on the commit the
   brief names, against this design.
3. The phrase split across two lines ("Mechanical" at the end of one, "now" at the start of the next) fails too, asking
   for it to be rejoined: Markdown renders the break as a space.
4. Prints its coverage every run (Rule 21.1), and fails, naming file, line and what is missing.

## What it does NOT prove (Rule 21.4)

- That the cited check tests what the row claims. A brief whose check block greps this design for anything satisfies
  it; whether the check fits the claim is the closing check's reading. This makes the claim cite evidence; it does not
  judge the evidence.
- That the check still passes today. A brief's checks run on the commit it names; a later edit can break them unseen.
- Other wordings of the verdict ("mechanically enforced", "a guard exists"). The verdict is a fixed phrase on purpose
  (A6's §13); a new wording is a reason to extend this tool, not to evade it.
- The phrase split across more than two lines, or by characters that are not invisible (a hyphen, a letter look-alike
  that NFKC does not fold, such as Cyrillic "о" for "o").
- Only `docs/design/`. ADRs, the PRD and the rules are not scanned.
- It is deliberately stricter than Markdown: a verdict inside a code block or a comment, which a reader never sees,
  still fails. Word it otherwise.
"""

from __future__ import annotations

import html
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

VERDICT = re.compile(r"(?<!not )\bmechanical now\b", re.IGNORECASE)
SPLIT = re.compile(r"(?<!not )\bmechanical$", re.IGNORECASE)
STARTS_NOW = re.compile(r"^now\b", re.IGNORECASE)
BRIEF_CITE = re.compile(r"`(docs/briefs/[^`\s]+\.md)`")
CHECK_BLOCK = re.compile(r"^```check[^\n]*\n(.*?)^```", re.DOTALL | re.MULTILINE)


def tracked(prefix: str) -> list[str]:
    out = subprocess.run(["git", "ls-files", "--", prefix], cwd=ROOT, capture_output=True, text=True, check=True)
    return [p for p in out.stdout.splitlines() if p]


def check_blocks(brief: str) -> list[str]:
    return CHECK_BLOCK.findall((ROOT / brief).read_text(encoding="utf-8"))


def normalised(line: str, invisible: str = "") -> str:
    """The line as read for the verdict: entities decoded, NFKC, invisible characters replaced by `invisible`, emphasis
    marks dropped, whitespace collapsed."""
    text = unicodedata.normalize("NFKC", html.unescape(line))
    text = "".join(invisible if unicodedata.category(c) == "Cf" else c for c in text)
    text = re.sub(r"[*_`]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def says_verdict(line: str) -> bool:
    """Read twice: invisible characters dropped ("Mech<ZWSP>anical") and read as a space ("Mechanical<ZWSP>now")."""
    return any(VERDICT.search(normalised(line, sep)) for sep in ("", " "))


def main() -> int:
    designs = [p for p in tracked("docs/design/") if p.endswith(".md")]
    briefs = set(tracked("docs/briefs/"))
    if not designs:
        print("FAILED: no tracked design files found; refusing to report a clean run over nothing.")
        return 1
    claims = 0
    failures: list[str] = []
    for design in designs:
        lines = (ROOT / design).read_text(encoding="utf-8").splitlines()
        plain = [normalised(line) for line in lines]
        for i, line in enumerate(lines):
            n = i + 1
            if i + 1 < len(plain) and SPLIT.search(plain[i]) and STARTS_NOW.match(plain[i + 1]):
                failures.append(f"{design}:{n}: the verdict is split across lines {n}-{n + 1}; join it on one line")
                continue
            if not says_verdict(line):
                continue
            claims += 1
            cited = BRIEF_CITE.findall(html.unescape(line))
            if not cited:
                failures.append(f"{design}:{n}: says 'Mechanical now' but cites no brief under docs/briefs/")
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
    print(f"scanned {len(designs)} tracked design files, every line; {claims} lines say 'Mechanical now'")
    for f in failures:
        print("  " + f)
    if failures:
        print(f"FAILED: {len(failures)} 'Mechanical now' claims without a brief's check behind them (Rule 24.7).")
        return 1
    print("Every 'Mechanical now' line cites a brief whose check ran against its design (Rule 24.7; its docstring "
          "lists what that does not prove).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
