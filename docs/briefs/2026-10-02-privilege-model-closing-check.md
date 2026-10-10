# Brief: closing check of the privilege model (R5, J14, §4g) after AA1-AA7

**Agent:** general-purpose, **Sonnet** (Rule 16.9: mechanical — every step and expected output is written
below; the adversarial work was done at Opus and its findings fixed). **Scope:** `b9d5d1b` (the AA fixes)
on top of `4f385fa` and `6ac5cd2`. **Findings:** `docs/PRD-REVIEW-4.md`, the section "Adversarial review of
the privilege model" at the end of the file.

## What to do

1. From the repository root, run `python3 tools/run_brief.py docs/briefs/2026-10-02-privilege-model-closing-check.md`
   and report its full output. Every check below must PASS, and the tree must be clean afterwards.
2. Then read, and report for each item **holds** or **does not hold** with the line you read:
   - `docs/THREAT-MODEL.md` §4f states the write-door limit as accepted by the owner on 2026-10-02 and names
     `new-app/api/src/core/architecture/sql-is-static.test.ts` as its control.
   - `docs/THREAT-MODEL.md` §4g's list includes column privileges, REPLICATION, predefined `pg_*` roles,
     SET-only membership, schemas, views outside row security, TRUNCATE/TRIGGER, and definer functions.
   - Review 4's J14 row begins "**Fixed, re-review owed.**" and cites migration
     `20260928000000_least_privilege_complete`.
   - `new-app/CLAUDE.md` says a new view must be `security_invoker` and that SQL is always a fixed string.
   - For each of AA1-AA7 in the findings section, name the test (file and test title) or the corrected
     sentence that answers it. A finding with nothing to name does not hold.
3. Do not edit, commit, stash, `git checkout --` or `git restore` anything. The plants below copy a file to
   a backup, edit it, run one test file, copy the backup back and prove it with `diff -q` — that is the only
   way a file changes, and the runner fails if one is left changed.

## Report

The runner's output; the five read items, each holds / does not hold with its line; a final line
**closable** or **not closable** for R5, J14 and the §4g check. Nothing else.

## Expectations

The migrations end with the three privilege-model migrations:

```check
$ ls new-app/db/migrations | grep -v toml | tail -3
20260927220000_privilege_model
20260927230000_least_privilege_creates
20260928000000_least_privilege_complete
```

Every bypass the review executed is a named test, and they pass (the tests whose titles name an AA finding):

```check
$ cd new-app/db && npx vitest run test/privilege-model.test.ts -t "AA" 2>&1 | grep -oE "Tests +[0-9]+ passed \| [0-9]+ skipped \([0-9]+\)"
Tests  14 passed | 30 skipped (44)
```

```check
$ cd new-app/api && npx vitest run src/core/auth/least-privilege.test.ts src/core/architecture/sql-is-static.test.ts 2>&1 | grep -oE "Tests +[0-9]+ passed \([0-9]+\)"
Tests  8 passed (8)
```

The whole suites, with real PostgreSQL required:

```check
$ cd new-app/db && PRYVIS_PG_URL=postgres://postgres@127.0.0.1:55440/postgres PRYVIS_REQUIRE_PG=1 npx vitest run 2>&1 | grep -oE "Tests +[0-9]+ passed \([0-9]+\)"
Tests  267 passed (267)
```

```check
$ cd new-app/api && npx vitest run 2>&1 | grep -oE "Tests +[0-9]+ passed \([0-9]+\)"
Tests  191 passed (191)
```

**Plant 1 (AA1):** remove the column-privilege test from the check; two tests must fail; restored.

```check
$ f=new-app/db/migrations/20260928000000_least_privilege_complete/migration.sql; b=$(mktemp); cp $f $b; python3 -c "import sys;p=sys.argv[1];s=open(p).read();a=\"       OR has_any_column_privilege(current_user, 'public.' || v_table, 'SELECT, INSERT, UPDATE, REFERENCES') THEN\";assert s.count(a)==1;open(p,'w').write(s.replace(a,' THEN'))" $f; (cd new-app/db && npx vitest run test/privilege-model.test.ts 2>&1 | grep -oE "Tests +[0-9]+ failed"); cp $b $f; diff -q $b $f && echo restored
Tests  2 failed
restored
```

**Plant 2 (AA2):** a view over a credential table created in a migration; the guards must fail; restored.

```check
$ f=new-app/db/migrations/20260928000000_least_privilege_complete/migration.sql; b=$(mktemp); cp $f $b; echo "CREATE VIEW credential_directory AS SELECT email, password_hash FROM app_credential;" >> $f; (cd new-app/db && npx vitest run test/privilege-model.test.ts -t "nothing outside row security" 2>&1 | grep -oE "Tests +[0-9]+ failed"); cp $b $f; diff -q $b $f && echo restored
Tests  1 failed
restored
```

**Plant 3 (AA6):** a write policy widened to let the application in; policy parity must fail; restored.

```check
$ f=new-app/db/migrations/20260928000000_least_privilege_complete/migration.sql; b=$(mktemp); cp $f $b; echo "DROP POLICY issue_balance_amend ON issue_balance; CREATE POLICY issue_balance_amend ON issue_balance FOR UPDATE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid AND (current_user = 'pryvis_balance' OR current_user = 'pryvis_app')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid AND (current_user = 'pryvis_balance' OR current_user = 'pryvis_app'));" >> $f; (cd new-app/db && npx vitest run test/policy-parity.test.ts 2>&1 | grep -oE "Tests +[0-9]+ failed"); cp $b $f; diff -q $b $f && echo restored
Tests  1 failed
restored
```

**Plant 4 (AA5):** the API's call made unqualified again; the shadowing test must fail; restored.

```check
$ f=new-app/api/src/core/auth/least-privilege.ts; b=$(mktemp); cp $f $b; sed -i 's/SELECT public.least_privilege_violations()/SELECT least_privilege_violations()/' $f; (cd new-app/api && npx vitest run src/core/auth/least-privilege.test.ts 2>&1 | grep -oE "Tests +[0-9]+ failed"); cp $b $f; diff -q $b $f && echo restored
Tests  1 failed
restored
```

**Plant 5 (the injection guard):** a statement built by interpolation; the guard must fail; restored.

```check
$ f=new-app/api/src/core/rate-limit/rate-limiter.ts; b=$(mktemp); cp $f $b; sed -i "s/WHERE key = \$1\`, key);/WHERE key = '\${key}'\`);/" $f; grep -c "'\${key}'" $f; (cd new-app/api && npx vitest run src/core/architecture/sql-is-static.test.ts 2>&1 | grep -oE "Tests +[0-9]+ failed"); cp $b $f; diff -q $b $f && echo restored
1
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
