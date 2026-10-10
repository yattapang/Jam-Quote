# Brief: adversarial review of the privilege model (R5, J14, §4g)

**Agent:** commit-reviewer, **Opus** (Rule 16.5: the credential path and row-security policy text are two of
its three named exceptions). **Scope:** commits `4f385fa` and `6ac5cd2`, against their parent `38a6481`.
**Design:** `docs/design/privilege-model.md` (approved D1-D5; §8 says what was built and how it differs).

## What is claimed

1. **R5 fixed.** The application role (`pryvis_app`) cannot write `issue_balance` at all, even with the old
   flag set; only `issue_balance_open()` and `issue_balance_apply()` can, running as `pryvis_balance`; the
   flag is gone from every live function. (`docs/THREAT-MODEL.md` §4e; ADR 0025 decision 2, second amendment.)
2. **J14 fixed.** The application role holds no privilege on `app_credential`, `app_session`, `mfa_totp`,
   `mfa_recovery_code` or `registration_claim`; it reaches them only through fifteen `SECURITY DEFINER`
   door functions owned by `pryvis_auth`, each reading or writing one row by its key, executable by
   `pryvis_app` and not by PUBLIC. `app_session` stores only the SHA-256 of the secret the client holds.
   `platform_capability` is read-only to the application. (`docs/THREAT-MODEL.md` §4f; review 4's J14 row.)
3. **§4g's deployment check built, not wired.** `least_privilege_violations()` names every excess listed in
   the migrations' headers; `new-app/api/src/core/auth/least-privilege.ts` refuses on any, or on no answer.
   Nothing calls it yet — stated, not hidden.
4. **Every control proved by a planted defect**, sixteen in all (`docs/BRIEF-STATUS.md`, "Built 2026-10-01:
   the privilege model").

## What to attack — execute every bypass, do not reason about it

- **Bulk reads through a door.** Can any door return more than one row, another user's row, or a row by a
  key the caller should not have: `credential_for_email` with case, whitespace, NULL or a pattern;
  `session_resolve` with a raw secret, a row id, a hash of the empty string, NULL; the `mfa_*` doors with
  another tenant's user id. Say which of these are inherent to a door (design §7) and which are defects.
- **Definer-function hijack.** Inside the seventeen definer functions: the search path, `pg_temp`, operator
  and function resolution, overloads the application could create, anything callable as the owner. Does
  `pryvis_app` hold any privilege — on a schema, a sequence, a type, a large object, a function — that lets
  it change what a definer function does?
- **The balance.** R5's exact attack, then every other route to a changed `issue_balance` row or ceiling:
  a trigger the application could add, a direct call of `issue_balance_apply()` for another tenant's issue,
  the policies with `app.tenant_id` set to another tenant.
- **The guards themselves.** Does `db/test/privilege-model.test.ts` pass on a database where the property is
  false? Find a schema change that keeps every test green and reopens J14 or R5 — a new table, a new
  definer function in another schema, a default privilege, a column-level grant, a view over a credential
  table. A column-level grant is the first one to try: `has_table_privilege` does not see it.
- **`least_privilege_violations()`.** Find an over-privileged role it calls clean. Membership via a chain;
  `SET ROLE` without inherit; a role that owns a schema; ownership of the database; `pg_read_all_data` or
  another predefined role; `pg_write_server_files`.
- **The API code.** `sign-in.ts`, `db-caller-resolver.ts`, `mfa.ts`, `session-token.ts`: does any path still
  send a raw secret to the database, log it, or compare it in a way that leaks timing? Does any test file
  bypass the model in a way that would hide a production failure?
- **Documents.** Every sentence the two commits changed (THREAT-MODEL §4e, §4f, §4g; ADR 0025; PRD R1.24b,
  R1.15c; domain model §6.2a, §6.3; `new-app/CLAUDE.md`; the design's §8; review 4's J14 row) — is each
  true by execution, and did any older sentence elsewhere become false?

## How to work

- Real PostgreSQL 16 is running: `PRYVIS_PG_URL=postgres://postgres@127.0.0.1:55440/postgres` (superuser).
  Create your own throwaway databases on it; drop them after.
- **Leave the tree exactly as you found it.** To plant a defect: copy the file to a backup outside the
  repository, edit, run, copy the backup back, and prove it with `diff -q`. Never `git checkout --` or
  `git restore`. Do not commit.
- No real personal data and no secrets in anything you write or run; synthetic values only.

## What to report

Findings numbered **AA1, AA2, …**, each with: severity (blocker / major / minor), where, the exact commands
and output that executed it, and what would fix it. Then a verdict per claim above: **closable**, **not
closable** (with the finding that blocks it), or **closable with a stated limit** (the limit in one sentence
the owner can accept or refuse). Say what you did not check.

## Expectations, run on the HEAD this brief is launched at

The tree is clean and the two migrations are the last two:

```check
$ ls new-app/db/migrations | grep -v toml | tail -2
20260927220000_privilege_model
20260927230000_least_privilege_creates
```

Sixteen functions created by the privilege-model migration (fifteen doors and the check); the balance
functions are replaced, not created:

```check
$ grep -c "^CREATE FUNCTION" new-app/db/migrations/20260927220000_privilege_model/migration.sql
16
```

No live migration after the privilege model sets the old flag:

```check
$ grep -l "pryvis.balance_write', 'on'" new-app/db/migrations/2026092722*/migration.sql new-app/db/migrations/2026092723*/migration.sql; echo "exit $?"
exit 1
```

The suites the claims rest on pass on this HEAD:

```check
$ cd new-app/db && npx vitest run test/privilege-model.test.ts 2>&1 | grep -oE "Tests +[0-9]+ passed \([0-9]+\)"
Tests  29 passed (29)
```

```check
$ cd new-app/db && npx vitest run test/documents-core.test.ts -t "only the balance functions" 2>&1 | grep -oE "Tests +[0-9]+ passed \| [0-9]+ skipped \([0-9]+\)"
Tests  6 passed | 131 skipped (137)
```

```check
$ cd new-app/db && PRYVIS_PG_URL=postgres://postgres@127.0.0.1:55440/postgres npx vitest run test/concurrency.pg.test.ts 2>&1 | grep -oE "Tests +[0-9]+ passed \([0-9]+\)"
Tests  22 passed (22)
```

```check
$ cd new-app/api && npx vitest run src/core/auth/least-privilege.test.ts 2>&1 | grep -oE "Tests +[0-9]+ passed \([0-9]+\)"
Tests  5 passed (5)
```

The four checkers are clean:

```check
$ for t in check_rules check_dispositions check_citations check_schema_citations; do python3 tools/$t.py 2>&1 | tail -1; done
All citations resolve, and no rule has changed unreviewed.
Every Closed disposition cites every document its finding named.
Every cited filename and symbol resolves. (Paths are checked by tools/check_schema_citations.py, not here.)
Every citation in the forms this tool checks resolves (its docstring lists them, and what it does not check).
```
