# Brief: closing check of the re-read's fixes (C1-C10), before the owner approves the PRD

**Agent:** general-purpose, **Sonnet** (Rule 16.9: mechanical — every step, plant and expected output is
written below; the adversarial work was the Opus re-read, and its findings are fixed). **Scope:** commits
`7a27ac9` (the fixes and ADR 0029) and `bc48db5` (ADR 0030). **Findings:** `docs/PRD-REVIEW-5.md`, the section
"Re-read of the amended PRD", and the C rows of the disposition table at the top of that file.

## What to do

1. From the repository root, run `python3 tools/run_brief.py docs/briefs/2026-10-02-prd-reread-closing-check.md`
   and report its full output. Every check must PASS and the tree must be clean afterwards.
2. Then, for each of C1-C10, read the finding, its disposition row, and the text the row cites, and report
   **holds** or **does not hold**, quoting the line you read. For C7 and C8 the plants below are the evidence;
   for the others, the sentence. Check in particular:
   - C1: `docs/PRD.md` R1.20d and R1.29 say a per-tenant WiPay payment is trusted only after our server
     confirms it with WiPay, and `docs/THREAT-MODEL.md` §4.6 has a row for a tenant forging a WiPay payment;
   - C2: R1.22b and R1.24 carry the tax-basis note, and R1.9 asks whether variations and the invoiced figure
     are net or gross;
   - C3: `docs/design/domain-model.md` §8 marks the offline-create and merge cells as release 2, and its
     sign-out paragraph and `docs/THREAT-MODEL.md` §4a's sign-out row say an ordinary revocation pushes first;
   - C4: R1.38 says support is email with no chatbot at the web launch;
   - C5: R1.4 is marked [mobile], R1.8 names the web launch's network, and R1.32 says a fourth Free job is
     sealed and held blocked on the web;
   - C6: §7 and `docs/TIERS.md` say exactly 3 users, and R1.37c says every member keeps access on lapse;
   - C9 and C10: the features-page sentence and the register's rows.
3. Do not edit, commit, stash, `git checkout --` or `git restore` anything. The plants below copy a file to a
   backup, edit it, run one test file, copy the backup back and prove it with `diff -q`.

## Report

The runner's output; C1-C10 each holds / does not hold with its line; and a last line, **closable** or **not
closable**, for C1-C10 as a set. Nothing else.

## Expectations

Ten C rows in the disposition table, each fixed with a re-review owed:

```check
$ grep -c "^| \*\*C[0-9]*\*\* |.*Fixed, re-review owed" docs/PRD-REVIEW-5.md
10
```

No seat count of "about 3" survives in the PRD or the tiers:

```check
$ grep -cE "about (3|three)( |,|\))" docs/PRD.md docs/TIERS.md
docs/PRD.md:0
docs/TIERS.md:0
```

The decision records exist:

```check
$ test -f docs/adr/0029-prd-reread-decisions.md && test -f docs/adr/0030-planning-directions.md && echo both
both
```

The number-series test refuses every value but `never`, and the site guards pass:

```check
$ cd new-app/db && npx vitest run test/documents-core.test.ts -t "B20" 2>&1 | grep -oE "Tests +[0-9]+ passed \| [0-9]+ skipped \([0-9]+\)"
Tests  5 passed | 137 skipped (142)
```

```check
$ cd new-app/web && npx vitest run test/site-guards.test.ts 2>&1 | grep -oE "Tests +[0-9]+ passed \([0-9]+\)"
Tests  12 passed (12)
```

**Plant 1 (C8):** a CHECK that refuses only the two old words; the B20 block must fail; restored.

```check
$ f=new-app/db/migrations/20260928010000_number_series_never_resets/migration.sql; b=$(mktemp); cp $f $b; sed -i "s/CHECK (\"reset_rule\" = 'never');/CHECK (\"reset_rule\" NOT IN ('yearly', 'monthly'));/" $f; grep -c "NOT IN" $f; (cd new-app/db && npx vitest run test/documents-core.test.ts -t "B20" 2>&1 | grep -oE "Tests +[0-9]+ failed"); cp $b $f; diff -q $b $f && echo restored
1
Tests  2 failed
restored
```

**Plant 2 (C7, gap 1):** a release-3 feature wearing the mobile marker; the tier guard must fail; restored.

```check
$ f=new-app/web/content/site.ts; b=$(mktemp); cp $f $b; python3 -c "import sys;p=sys.argv[1];s=open(p).read();a='          \"Up to 3 users\",\n';assert s.count(a)==1;open(p,'w').write(s.replace(a,a+'          \"Roles and approvals (coming with the mobile app)\",\n'))" $f; (cd new-app/web && npx vitest run test/site-guards.test.ts 2>&1 | grep -oE "Tests +[0-9]+ failed"); cp $b $f; diff -q $b $f && echo restored
Tests  1 failed
restored
```

**Plant 3 (C7, gap 3):** an unmarked offline claim on the home page; the site-wide guard must fail; restored.

```check
$ f=new-app/web/content/site.ts; b=$(mktemp); cp $f $b; python3 -c "import sys;p=sys.argv[1];s=open(p).read();a='\"Quote from your phone, standing up, on mobile data. No laptop, no office, no calling back later.\",';assert s.count(a)==1;open(p,'w').write(s.replace(a,'\"Works with no signal: price and seal a job offline today.\",'))" $f; (cd new-app/web && npx vitest run test/site-guards.test.ts 2>&1 | grep -oE "Tests +[0-9]+ failed"); cp $b $f; diff -q $b $f && echo restored
Tests  1 failed
restored
```

**Plant 4 (C7, gap 4):** a marker in a different sentence from the claim; the site-wide guard must fail; restored.

```check
$ f=new-app/web/content/site.ts; b=$(mktemp); cp $f $b; python3 -c "import sys;p=sys.argv[1];s=open(p).read();a='Record payments as they arrive and see at a glance who is late.\",';assert s.count(a)==1;open(p,'w').write(s.replace(a,'Record payments as they arrive, hold and release retention today. Coming in release 2: change orders.\",'))" $f; (cd new-app/web && npx vitest run test/site-guards.test.ts 2>&1 | grep -oE "Tests +[0-9]+ failed"); cp $b $f; diff -q $b $f && echo restored
Tests  1 failed
restored
```

The four checkers are clean:

```check
$ for t in check_rules check_dispositions check_citations check_schema_citations; do python3 tools/$t.py 2>&1 | tail -1; done
All citations resolve, and no rule has changed unreviewed.
Every Closed disposition cites every document its finding named.
Every cited filename and symbol resolves. (Paths are checked by tools/check_schema_citations.py, not here.)
Every citation in the forms this tool checks resolves (its docstring lists them, and what it does not check).
```
