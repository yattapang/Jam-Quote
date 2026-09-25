"""Every 'Rule N' / 'Rule N.M' reference in the repository must name a rule that exists.

## Why this is a gate and not a habit

On 2026-09-24 Rule 1's sub-rules were an auto-numbered markdown list. Inserting a new item as 1.2
silently renumbered everything after it, and four documents written earlier — three ADRs and the
Phase 0 audit — were left citing rules that had moved out from under them. **A citation that quietly
points at the wrong rule is worse than a missing one, because it still reads as authority.**

Nothing detected that. A reader would have had to notice, and the whole lesson of Rule 21 is that
nobody does. So it is mechanical now.

## What it checks

Every `Rule N` and `Rule N.M` in tracked Markdown, TypeScript, SQL, YAML, TOML and Prisma files
resolves to a rule defined in `docs/RULES.md` — top-level headings, sub-headings, and the bold
explicitly-numbered sub-rules.

## What it does NOT prove (Rule 21.4)

- Nothing about whether a citation points at the RIGHT rule, only that the rule exists. "Rule 1.3"
  where 1.6 was meant resolves fine. Only reading catches that.
- Nothing about `original-app/`, which is skipped: it is read-only, and its references are history.
- Nothing about rules cited in prose without the word "Rule" ("the design gate", "the plant
  doctrine").
"""
import re, subprocess, sys, collections

rules = open('docs/RULES.md', encoding='utf-8').read()

# What exists: top-level headings, sub-headings, and bold inline sub-rules.
top = set(re.findall(r'^## (\d+)\.', rules, re.M))
sub = set(re.findall(r'^### (\d+\.\d+)', rules, re.M))
sub |= set(re.findall(r'^\*\*(\d+\.\d+)\s', rules, re.M))
sub |= set(re.findall(r'^- \*\*(\d+\.\d+)\s', rules, re.M))
sub |= set(re.findall(r'^> \*\*(\d+\.\d+)\s', rules, re.M))
top.add('0')  # Rule 0 is titled, not numbered like the rest

files = subprocess.run(['git', 'ls-files'], capture_output=True, text=True).stdout.split()
skip = ('original-app/',)          # read-only; its references are history, not ours to edit
exts = ('.md', '.ts', '.tsx', '.sql', '.yml', '.yaml', '.toml', '.prisma', '.mjs', '.json')

refs = collections.defaultdict(list)
for f in files:
    if f.startswith(skip) or not f.endswith(exts):
        continue
    try:
        text = open(f, encoding='utf-8').read()
    except (UnicodeDecodeError, FileNotFoundError):
        continue
    for i, line in enumerate(text.split('\n'), 1):
        for m in re.finditer(r'\bRules? (\d+(?:\.\d+)?)', line):
            refs[m.group(1)].append((f, i))

bad = {}
for ref, where in sorted(refs.items(), key=lambda kv: [int(p) for p in kv[0].split('.')]):
    ok = ref in sub if '.' in ref else ref in top
    if not ok:
        bad[ref] = where

print(f"rules defined      : top-level {len(top)}, sub-rules {len(sub)}")
print(f"distinct refs found: {len(refs)} across {sum(len(v) for v in refs.values())} places")
print("sub-rules defined  :", ' '.join(sorted(sub, key=lambda x:[int(p) for p in x.split('.')])))
if bad:
    print("\nDANGLING REFERENCES:")
    for ref, where in bad.items():
        print(f"  Rule {ref} -> not defined; cited at")
        for f, i in where[:6]:
            print(f"      {f}:{i}")
    sys.exit(1)
print("\nAll rule references resolve.")
