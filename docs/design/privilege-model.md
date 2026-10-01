# Design: the database privilege model (R5, J14, and the §4g deployment check)

**Status: APPROVED by the owner 2026-10-01 — every recommendation (option A throughout, D1-D5). BUILT
2026-10-01 (§8); adversarial review and closing check owed (Rule 24.6).**

Date: 2026-10-01 · Answers `docs/THREAT-MODEL.md` §4e (R5), §4f (J14, a launch blocker) and §4g's owed
deployment check · Delegation (Rule 16.5): Opus — the credential path and row-security policy text, two of
its three named exceptions.

---

## 1. The problem, in one paragraph each

- **R5 — the balance can be rewritten.** `issue_balance` (each accepted issue's ceiling and invoiced
  total) may be written only when the transaction-local flag `pryvis.balance_write` is on. The two balance
  functions set it — but so can the application's own SQL, and then a direct `UPDATE` raises the ceiling.
  Executed (R5). It needs a SQL-injection-class defect in our server; none is known. ADR 0025 decision 2's
  original answer — no write grant to the application, the functions `SECURITY DEFINER` — was never built,
  because the application role's grants exist only in the test harness.
- **J14 — credentials are readable by the ordinary role.** `app_credential` (password hashes), `mfa_totp`,
  `mfa_recovery_code` and `registration_claim` have no row security, because sign-in reads them before any
  tenant is known. With an injection defect, one query reads every tenant's credential material. A launch
  blocker.
- **Found while designing: `app_session` is the same exposure, and worse.** It is also outside row security
  for the same reason, and its `id` IS the bearer credential: the session reference a client holds is that
  id (`api/src/core/auth/sign-in.ts`). A dump of `app_session` is a list of live logins. Password hashes need
  offline cracking; session ids need none.
- **§4g — nothing checks the deployed role.** The migrations revoke TEMPORARY, but if the migrating role is
  not the database owner the revoke only warns (Z4); and the production application role is created outside
  the migrations, so no code states or checks what it may do.

## 2. What exists today, and what each table holds

| Table | Row security | Holds | Who must read it | Who must write it |
|---|---|---|---|---|
| `issue_balance` | yes, writes gated by the flag | ceiling inputs and the invoiced total | the application | the two balance functions only |
| `app_credential` | **none** | scrypt password hashes, by email | sign-in, by one email | sign-in (rehash), registration |
| `app_session` | **none** | **live bearer ids**, user, tenant, expiry | every request, by one id | sign-in, MFA step-up, sign-out |
| `mfa_totp` | **none** | TOTP secrets, **encrypted with a key outside the database** | sign-in, step-up | enrolment |
| `mfa_recovery_code` | **none** | hashes of recovery codes | step-up | enrolment, use |
| `registration_claim` | **none** | an email and a hashed single-use token | the registration path | the registration path |
| `rate_limit_bucket` | none | counters keyed by action and IP or hashed email; no secrets | the limiter | the limiter |
| `platform_capability` | none | what our own staff may do | authentication | an audited grant (staff console, not built) |

Every read of a credential table is **by one key** — one email, one session id, one user. Nothing
legitimate ever needs "all rows". That is the fact the recommended design rests on.

## 3. Facts that narrow the choices

1. **Tenants never hold a database session.** Every exposure here needs a defect in our own server code
   (injection, a confused deputy). The design limits what such a defect can reach; it does not replace
   parameterised SQL.
2. **Row security cannot protect a table read before the tenant is known.** So the protection for the
   credential tables must be *which role can reach them, and how*, not a tenant policy.
3. **A setting the application can set is not a control** (R5). Anything that gates on a session variable
   the application role may write is decoration — which rules out a "flag" fix for J14.
4. **scrypt is not available inside PostgreSQL**, so password verification stays in Node: the database
   can hand the application one hash for one email, not answer "is this the password" itself.
5. **Every function is already pinned to `pg_catalog, public, pg_temp`** (§4g), the precondition for any
   `SECURITY DEFINER` function to be safe.

## 4. The decisions

Each has a recommendation, marked **(rec)**, and the reason.

### D1 · How the credential tables are reached

| Option | For | Against |
|---|---|---|
| **A. Functions as the only door (rec):** the ordinary role has NO privilege on the credential tables; it may only EXECUTE narrow `SECURITY DEFINER` functions — `credential_for_email(email)`, `session_resolve(id)`, `session_create(…)`, `mfa_*`, `registration_*` — each reading or writing ONE row by its key | An injection can no longer dump a table: at worst it looks up one email it already knows. One connection pool, one secret. The door list is short and reviewable | About ten small functions to write and test; the auth code changes from SQL to function calls |
| B. A separate login role for authentication, with its own connection pool | Simple: the auth code keeps its SQL | A second secret and pool. The auth role can still read every row, so an injection in the auth code dumps everything — the exposure moves, it does not shrink |
| C. Both | Defence in depth | Both costs, for little over A |

### D2 · Session ids at rest

| Option | For | Against |
|---|---|---|
| **A. Store only a hash of the session secret (rec):** the client keeps the secret; the database keeps SHA-256 of it and is looked up by the hash | A leaked `app_session` table is no longer a list of logins — the standard practice, and cheap: one hash per request | Sessions issued before the change stop resolving. There are no real users yet, so the cost is nil |
| B. Keep raw ids, rely on D1's door | Nothing changes | A backup, a log of a query, or a future defect with read access exposes live logins |

### D3 · Where roles and grants live

| Option | For | Against |
|---|---|---|
| **A. In the migrations (rec):** the migrations create NOLOGIN group roles — `pryvis_app` (ordinary), `pryvis_balance` (owns the balance functions), `pryvis_auth` (owns the credential functions) — and every grant. A deployment's login role is made a member of `pryvis_app` and nothing else | The privilege model is code: reviewed, tested, and the same everywhere. The test harness stops inventing its own grants, which is how R5 hid | The migrating role needs CREATEROLE once; role names are per cluster (fine on one managed database) |
| B. In a deployment script outside the migrations | No CREATEROLE needed by migrations | The model lives outside review and testing again — today's gap |

### D4 · How the deployed role is checked (§4g, Z4)

| Option | For | Against |
|---|---|---|
| **A. The API checks its own role at start-up and refuses to start if over-privileged (rec)**, plus the same check in CI against the race database | Cannot be skipped: an over-privileged deployment never serves a request. Catches Z4 (a revoke that only warned) and a hand-granted TEMPORARY. One function, `assert_least_privilege()`, used by both | A misconfigured deployment fails to start — which is the intent, but is an outage until fixed |
| B. A deploy-time script only | No start-up cost | Optional by nature; a deploy that skips it ships unchecked |

What it asserts: not superuser, no BYPASSRLS, no CREATEROLE, no TEMPORARY on the database; member of
`pryvis_app` only; no privilege at all on the credential tables or `issue_balance` beyond SELECT on the
latter; EXECUTE on the door functions.

### D5 · The two tables that are not secret

| Option | For | Against |
|---|---|---|
| **A. `rate_limit_bucket` stays writable by the ordinary role; `platform_capability` becomes read-only to it (rec)** — granting a capability waits for the staff console, through an audited function | The limiter has nothing to steal and must be fast; a capability grant is privilege escalation for our own staff and should never be one UPDATE away | One more door function when the staff console is built |
| B. Both behind functions now | Uniform | Cost with no secret to protect, for the limiter |

## 5. Not a decision — R5's fix, already decided by the owner on 2026-10-01

The owner decided R5's shape when it was recorded: no write grant on `issue_balance` to the application,
and `SECURITY DEFINER` balance functions. Concretely:

- `issue_balance_open()` and `issue_balance_apply()` are owned by `pryvis_balance` and run as it;
- `pryvis_balance` holds INSERT and UPDATE on `issue_balance`; `pryvis_app` holds SELECT only;
- the write policies stop reading `pryvis.balance_write` and require `current_user = 'pryvis_balance'`
  (still with the tenant match) — a condition the application cannot set, because inside a `SECURITY
  DEFINER` function `current_user` is the owner, and outside one it is the caller;
- the flag is removed, with the guard that asserted it, and ADR 0025 decision 2 is amended to say the
  original decision is now built.

The ceiling trigger already calls `issue_balance_apply()`, so invoices, voids, credit notes and variations
keep working unchanged.

## 6. What gets built once D1-D5 are answered (option A throughout)

1. **One migration:** the three group roles; ownership of the balance and door functions; grants and
   revokes; the `issue_balance` policies keyed on the owning role; the door functions (each pinned, each
   touching one row by its key); `app_session` storing a hash; `assert_least_privilege()`.
2. **The test harness** uses the migrations' roles instead of granting its own — every test then runs
   against the real privilege model. The six API test files that set up the role change with it.
3. **The API's auth code** (`sign-in.ts`, `db-caller-resolver.ts`, `mfa.ts`) calls the door functions; it
   holds the session secret and sends its hash.
4. **A start-up check** in the API that calls `assert_least_privilege()` and refuses to start.
5. **Tests, each proved with a planted defect:**
   - the ordinary role cannot SELECT any credential table, or write `issue_balance`, even with the old flag set
     (R5's exact attack, now refused);
   - each door function returns one row for its key and nothing for another tenant's;
   - a dumped `app_session` row does not resolve a session;
   - an over-privileged role fails `assert_least_privilege()` (granted TEMPORARY, BYPASSRLS, a direct grant).
6. **Documents:** THREAT-MODEL §4e and §4f marked fixed with their tests; ADR 0025 decision 2 amended;
   `new-app/CLAUDE.md`'s tenancy section; and the instructions for creating the deployment's login role.

Then an adversarial review (Opus) and a mechanical closing check (Sonnet), each from a committed brief run
through `tools/run_brief.py` (Rule 16.7).

## 7. What this does not do (Rule 21.4)

- It does not make an injection defect harmless. A defect in the ordinary path still reads and writes the
  calling tenant's business rows under row security, and can look up one credential by a known email.
- It does not cover the staff console's own privileges or staff MFA (still a launch blocker), only the
  table that records capabilities.
- It does not protect against the database owner or a superuser, which bypass every policy.
- It does not rotate or encrypt password hashes: scrypt's cost is the protection for a hash that leaks.

## 8. As built, and how a deployment must be set up

**Built 2026-10-01** as §6 describes, in migration `new-app/db/migrations/20260927220000_privilege_model`
(policy text in `new-app/db/policies/006-privilege-model.sql`). Three differences from §6, each a detail
the design left open:

- `assert_least_privilege()` is built as `least_privilege_violations()`, returning the list rather than
  raising, so a test can see each line and the API can print all of them;
  `new-app/api/src/core/auth/least-privilege.ts` is the part that refuses. Migration
  `20260927230000_least_privilege_creates` adds two lines D4 did not list: CREATE on schema public, and
  owning any table or function in it (the API connected as the migrating role).
- `registration_claim` has no doors: registration is not built, so the application simply cannot reach it.
  Its doors come with sign-up.
- The parser-based guard of ADR 0025 decision 2 is withdrawn: the database refuses the write whatever
  module sends it.

Tests: `new-app/db/test/privilege-model.test.ts`, `new-app/db/test/documents-core.test.ts` block 2,
`new-app/db/test/policy-parity.test.ts`, `new-app/db/test/concurrency.pg.test.ts` ("§4g") and
`new-app/api/src/core/auth/least-privilege.test.ts`, each control proved with a planted defect.

**Setting up a deployment.** The migrations create the three group roles and every grant; they do not
create the login role the API connects as, because that holds a password and belongs to the deployment.

1. **The migrating role** must be able to create roles once (CREATEROLE, or the roles created beforehand
   with the same names), must own the database or be a superuser so the TEMPORARY revoke takes effect
   (Z4), and must be able to make `pryvis_balance` and `pryvis_auth` own functions — on PostgreSQL 16
   a non-superuser needs `GRANT pryvis_balance, pryvis_auth TO <migrator> WITH SET TRUE`. Without it the
   migration fails loudly at `ALTER FUNCTION … OWNER TO`, rather than leaving the functions owned by the
   migrator.
2. **The API's login role** is created as `CREATE ROLE <name> LOGIN PASSWORD '…' NOSUPERUSER NOBYPASSRLS
   NOCREATEROLE NOCREATEDB IN ROLE pryvis_app` — a member of `pryvis_app` and of nothing else, owning
   nothing. It is never the migrating role.
3. **Check it before the first start:** connected as that role, `SELECT least_privilege_violations()`
   must return `{}`. The API refuses to start otherwise, once its bootstrap calls
   `assertLeastPrivilege` — **owed**: there is no bootstrap yet.
4. On a managed database whose provider grants TEMPORARY to PUBLIC on every new database, the revoke in
   `20260927210000_pin_search_path` must have run as the database owner; step 3 is what shows it did.
