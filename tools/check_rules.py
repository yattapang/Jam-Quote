"""The rulebook and everything that cites it are checked together.

## Why this exists

`docs/RULES.md` is cited in nearly 300 places. Two failures on 2026-09-24 showed that citations rot
silently:

1. Rule 1's sub-rules were an auto-numbered markdown list. Inserting a new 1.2 renumbered every item
   after it, and three ADRs plus the Phase 0 audit were left citing rules that had moved out from
   under them. Nothing detected it.
2. The first version of this tooling checked only that a cited rule **exists**. "Rule 1.3" where 1.6
   was meant resolves perfectly, so existence-checking would have passed the very drift it was
   written for.

A citation that quietly points at the wrong rule is worse than a missing one: it still reads as
authority. So this does three things, and the second is the one that actually stops drift.

## What it checks

1. **Every citation resolves.** Each `Rule N` / `Rule N.M` in tracked text names a rule that exists.
2. **No rule has changed without its citations being reviewed.** `docs/rules-manifest.json` records
   every rule's number, title and a hash of its text. If a rule's wording or title changes, or a
   number appears or disappears, this FAILS and prints **every file and line that cites the affected
   rule** — the review list, handed over rather than left to be found. Clearing it means running
   `--update`, which is a deliberate act that lands in the diff.
3. **A retired rule keeps its number.** A number that the manifest knows and `RULES.md` no longer
   defines is a removal, and removals must be tombstoned in place ("retired, see X") so that no
   existing citation silently retargets and no number is ever reused.

## What it does NOT prove (Rule 21.4)

- It cannot tell whether a citation is *apt* — whether Rule 1.3 is the right rule for the sentence
  around it. It can only guarantee that somebody was shown the citation list at the moment the rule
  changed. The reading is still human work.
- Nothing about rules referred to in prose without the word "Rule" ("the design gate", "the plant
  doctrine"). Those are invisible to it.
- Nothing about `original-app/`, which is skipped: it is read-only, and its references are history.
- A hash catches any edit, including a typo fix. That is deliberate — the alternative is guessing
  which edits are "meaningful", and an unreviewed renumber is exactly what guessing let through.

Usage:
    python tools/check_rules.py            # the gate; CI runs this
    python tools/check_rules.py --update   # after deliberately changing a rule
"""

from __future__ import annotations

import collections
import hashlib
import json
import re
import subprocess
import sys

RULES = "docs/RULES.md"
MANIFEST = "docs/rules-manifest.json"
SKIP_PREFIXES = ("original-app/",)
EXTS = (".md", ".ts", ".tsx", ".sql", ".yml", ".yaml", ".toml", ".prisma", ".mjs", ".py")

# A rule definition: a top-level heading, a sub-heading, or a bold explicitly-numbered sub-rule.
DEFINITIONS = (
    # Rule 0 is titled rather than numbered like the rest, and it is cited eleven times, so it
    # needs a pattern of its own rather than a special case bolted on afterwards.
    re.compile(r"^## Rule (?P<id>\d+) [-—] (?P<title>.+)$", re.M),
    re.compile(r"^## (?P<id>\d+)\. (?P<title>.+)$", re.M),
    re.compile(r"^### (?P<id>\d+\.\d+) (?P<title>.+)$", re.M),
    re.compile(r"^- \*\*(?P<id>\d+\.\d+) (?P<title>[^*]+)\*\*", re.M),
    re.compile(r"^\*\*(?P<id>\d+\.\d+) (?P<title>[^*]+)\*\*", re.M),
)
CITATION = re.compile(r"\bRules? (\d+(?:\.\d+)?)")


def rule_sort_key(rule_id: str) -> list[int]:
    return [int(part) for part in rule_id.split(".")]


def parse_rules(text: str) -> dict[str, dict[str, str]]:
    """Every rule in the book, with its title and a hash of its own text.

    A rule's text runs from its definition line to the start of the next definition, so a rule's
    hash changes when its wording changes and not when a neighbour's does.
    """
    found = []
    for pattern in DEFINITIONS:
        for match in pattern.finditer(text):
            found.append((match.start(), match.group("id"), match.group("title").strip()))
    found.sort()

    rules: dict[str, dict[str, str]] = {}
    for index, (start, rule_id, title) in enumerate(found):
        end = found[index + 1][0] if index + 1 < len(found) else len(text)
        body = text[start:end]
        rules[rule_id] = {
            "title": title.rstrip(".").strip(),
            "hash": hashlib.sha256(body.encode("utf-8")).hexdigest()[:16],
        }
    return rules


def find_citations() -> dict[str, list[tuple[str, int]]]:
    files = subprocess.run(
        ["git", "ls-files"], capture_output=True, text=True, check=True
    ).stdout.split()
    citations: dict[str, list[tuple[str, int]]] = collections.defaultdict(list)
    for path in files:
        if path.startswith(SKIP_PREFIXES) or not path.endswith(EXTS):
            continue
        try:
            text = open(path, encoding="utf-8").read()
        except (UnicodeDecodeError, FileNotFoundError):
            continue
        for number, line in enumerate(text.split("\n"), 1):
            for match in CITATION.finditer(line):
                citations[match.group(1)].append((path, number))
    return citations


def show_citations(rule_id: str, citations: dict[str, list[tuple[str, int]]]) -> None:
    places = citations.get(rule_id, [])
    if not places:
        print("        (nothing cites it)")
        return
    for path, line in places:
        print(f"        {path}:{line}")


def main() -> int:
    update = "--update" in sys.argv
    text = open(RULES, encoding="utf-8").read()
    current = parse_rules(text)
    citations = find_citations()

    if update:
        json.dump(
            {
                "generated_from": RULES,
                "note": (
                    "Regenerated deliberately with tools/check_rules.py --update. Every rule whose "
                    "hash changed had its citations reviewed at that moment."
                ),
                "rules": {k: current[k] for k in sorted(current, key=rule_sort_key)},
            },
            open(MANIFEST, "w", encoding="utf-8"),
            indent=2,
        )
        open(MANIFEST, "a", encoding="utf-8").write("\n")
        print(f"Manifest rewritten: {len(current)} rules.")
        print("\nReview the citations of everything you changed before committing.")
        return 0

    failures: list[str] = []

    # 1. Every citation resolves.
    dangling = {r: w for r, w in citations.items() if r not in current}
    if dangling:
        failures.append("dangling citations")
        print("DANGLING CITATIONS — these name a rule that does not exist:")
        for rule_id in sorted(dangling, key=rule_sort_key):
            print(f"  Rule {rule_id}")
            show_citations(rule_id, citations)

    # 2 and 3. The manifest, which is what turns a silent renumber into a red build.
    try:
        manifest = json.load(open(MANIFEST, encoding="utf-8"))["rules"]
    except FileNotFoundError:
        print(f"\n{MANIFEST} is missing. Create it with: python tools/check_rules.py --update")
        return 1

    added = sorted(set(current) - set(manifest), key=rule_sort_key)
    removed = sorted(set(manifest) - set(current), key=rule_sort_key)
    changed = sorted(
        (r for r in set(current) & set(manifest) if current[r]["hash"] != manifest[r]["hash"]),
        key=rule_sort_key,
    )

    if removed:
        failures.append("rules removed without a tombstone")
        print("\nRULES REMOVED — a number must never be retired silently or reused:")
        for rule_id in removed:
            print(f"  Rule {rule_id} — was \"{manifest[rule_id]['title']}\". Cited at:")
            show_citations(rule_id, citations)
        print("  Tombstone it in place (\"retired, see X\") so no citation silently retargets.")

    if changed:
        failures.append("rules changed without their citations being reviewed")
        print("\nRULES CHANGED — review every citation below, then run --update:")
        for rule_id in changed:
            was, now = manifest[rule_id]["title"], current[rule_id]["title"]
            moved = " ** TITLE CHANGED **" if was != now else ""
            print(f"  Rule {rule_id}{moved}")
            if moved:
                print(f'        was: "{was}"')
                print(f'        now: "{now}"')
            show_citations(rule_id, citations)

    if added:
        failures.append("new rules not in the manifest")
        print("\nNEW RULES — run --update to record them:")
        for rule_id in added:
            print(f"  Rule {rule_id} — \"{current[rule_id]['title']}\"")

    total = sum(len(v) for v in citations.values())
    print(
        f"\n{len(current)} rules defined · {total} citations across {len(citations)} distinct rules"
    )
    if failures:
        print("FAILED: " + "; ".join(failures))
        return 1
    print("All citations resolve, and no rule has changed unreviewed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
