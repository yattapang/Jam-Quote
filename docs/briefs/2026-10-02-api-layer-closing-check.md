# Brief: closing check of the API layer design after its read (AL1-AL18)

**Agent:** general-purpose, **Sonnet** (Rule 16.9: mechanical — every item names the text to read, and the
expectations below are executed; the adversarial work was the Opus read, whose report is reproduced at the end of
this brief). **Under check:** `docs/design/api-layer.md` as amended, at the commit that adds this brief.

## What to do

1. From the repository root, run `python3 tools/run_brief.py docs/briefs/2026-10-02-api-layer-closing-check.md`
   and report its full output. Every check must PASS, and the tree must be clean afterwards.
2. For each of AL1-AL18 (in the report reproduced below), read the finding's recommendation, then the design's §7
   row for it and the section that row names. Report **answered** or **not answered**, quoting the sentence that
   answers it. A finding is answered when the design states a rule a builder can follow for every part of the
   recommendation, or states plainly why a part is not taken. Check in particular:
   - AL1: the idempotency record's principal column is stated as never null, for both authenticated and share
     routes;
   - AL2: the fingerprint lists the path parameters and the query;
   - AL3: the design says handlers on idempotent routes never call `withTenant` themselves, and a multi-step flow
     is several routes;
   - AL5: the design names `idle_in_transaction_session_timeout` and sets Prisma's timeout above the lock timeout,
     and maps `55P03`, `57014`, `40P01` and P2028;
   - AL6: `job_claim()` is a SECURITY DEFINER door returning no payload, and platform jobs touch tenant rows only
     through named doors;
   - AL9: the Origin check covers sign-in, and the urlencoded parser is off;
   - AL10: the share page is on its own host, and §6 lists both DNS records;
   - AL13: the provider callback resolves its tenant before checking the signature, and is never trusted alone
     (compare `docs/PRD.md` R1.29).
   Also report, for the reader's AP1-AP11 opinion table: does the design adopt each "disagree" or "amended" line,
   and where?
3. Do not edit, commit, stash, `git checkout --` or `git restore` anything. This is a reading check: there is no
   code, so there are no plants.

## Report

The runner's output; AL1-AL18, each answered / not answered, with its quoted sentence; the AP1-AP11 adoption lines;
and a last line, **closable** or **not closable**, for AL1-AL18 as a set. Nothing else.

## Expectations

Eighteen findings in the design's answer table:

```check
$ grep -c "^| AL[0-9]* ·" docs/design/api-layer.md
18
```

Every finding is cited in the body as well as the table:

```check
$ for n in $(seq 1 18); do c=$(grep -oE "\bAL$n\b" docs/design/api-layer.md | wc -l); [ "$c" -ge 2 ] || echo "AL$n only $c"; done; echo checked
checked
```

The amendment is declared, both hosts are named as owner actions, and the plain-INSERT and strip-mode wording is
gone:

```check
$ grep -c "Amended the same day" docs/design/api-layer.md; grep -c "share.pryvis.com" docs/design/api-layer.md; grep -c "unknown keys \*\*stripped\*\*" docs/design/api-layer.md
1
4
0
```

The repository's checkers are clean:

```check
$ for t in check_rules check_dispositions check_citations check_schema_citations check_build_plan; do python3 tools/$t.py 2>&1 | tail -1; done
All citations resolve, and no rule has changed unreviewed.
Every Closed disposition cites every document its finding named.
Every cited filename and symbol resolves. (Paths are checked by tools/check_schema_citations.py, not here.)
Every citation in the forms this tool checks resolves (its docstring lists them, and what it does not check).
Every ticked step carries its evidence.
```

```check
$ git status --short
```

## The read's report, as given

Reproduced from the read's reply (brief `docs/briefs/2026-10-02-api-layer-read.md`), unedited except that its
headings are one level lower. Every value in it is synthetic.

### Independent read: `docs/design/api-layer.md` (AP1–AP11), HEAD 3f3254a

**Brief runner, last line:** `Brief docs/briefs/2026-10-02-api-layer-read.md at HEAD 3f3254a: 3 of 3 expectations hold.`

**Overall:** the overall direction is right, and I'd build these designs again myself. But six parts of the text don't work as written:
- the idempotency mechanism (AP6),
- the job worker under row-level security (AP10),
- the time limits (AP8),
- the claim that strict validation catches nested fields (AP3/AP7),
- how database refusals get mapped to errors (AP5),
- where the share page lives (AP1/AP2).

Two of these I ran and watched fail: the uniqueness that doesn't hold, and the worker that silently does nothing.

**How I tested:**
- A scratch PostgreSQL 16.13 cluster in the scratchpad (synthetic rows, a non-BYPASSRLS role, the same RLS policy shape as `db/policies/001-tenant-isolation.sql`).
- A scratch Nest 10.4.15 app built from the repo's own `node_modules`.
- zod 3 and @asteasolutions/zod-to-openapi 7, installed in the scratchpad only.

Nothing in the repo was edited. The scratch cluster is stopped.

**Labels:** CONFIRMED means I ran it and saw the result. REASONED means the code doesn't exist yet.

**One correction to my own method:** my first grep for `ERRCODE` was case-sensitive and found none. Checked case-insensitively there are 51 `check_violation` uses. AL7 uses the corrected count.

---

### Findings

#### AL1 · major · CONFIRMED · AP6 "unique on tenant, user and key" doesn't hold on share-token routes
- **Where:** AP6 says accept and decline are idempotent. Both are `@ShareTokenRoute`, which has no user (`default-deny.guard.ts` resolves no caller for share-token routes).
- **Evidence:** I created `UNIQUE (tenant_id, user_id, key)` and inserted the same tenant and key twice with `user_id NULL`. Both rows went in (count = 2), because PostgreSQL treats NULLs as distinct in a unique index.
- **Result:** for the client-facing creating routes the duplicate guard doesn't exist. A double-tapped "Accept" runs twice.
- **Recommendation:** key the record on a non-null principal (the user id, or the share link's id), or use `NULLS NOT DISTINCT`. Add a share-token double-submit to the §4 idempotency test.

#### AL2 · major · REASONED (follows directly from the text) · the fingerprint leaves out path parameters and the query
- **Where:** AP6 defines the fingerprint as "a hash of the method, the route template and the canonical body".
- **Failure:** take `POST /v1/invoices/:id/send` with an empty body.
  - The same key is sent for invoice A, then invoice B.
  - The fingerprints are identical, so B's request **replays A's response** and B is never sent.
  - That is exactly what the next bullet promises can't happen ("a key reused for a different invoice must not return the first invoice").
- "Canonical body" is also undefined: raw bytes or the parsed value, and in what key order.
- **Recommendation:** fingerprint the method, the template, the resolved params and query, and the validated body serialised with sorted keys.

#### AL3 · major · CONFIRMED in code · "the same transaction as the work" can't be done with today's `withTenant`
- **Where:**
  - AP6, "inserted in the same transaction".
  - `api/src/core/tenancy/tenant-context.ts:96-106`: `withTenant` always calls `prisma.$transaction(...)` on the client it is given.
  - Prisma 6.19.3 (`node_modules/prisma/prisma-client/runtime/client.d.mts:725`) lists `$transaction` in the interactive-transaction deny list, so it can't be nested.
- **Result:**
  - An interceptor that inserts the record, followed by a handler that does what every module is told to do (`withTenant(prisma, …)`), gives **two transactions**.
  - So the §4 plant ("inserting the record … outside the transaction") becomes the default build.
  - The same applies to AP10's "enqueued in the same transaction".
- **Second conflict:** `new-app/CLAUDE.md` "Financial writes" requires some flows to run as *separate* transactions (the wrong-document remedy: void/credit, withdraw, seal). One idempotency record can't cover a request that commits several times, so "there is no in-progress state" is false for any such route.
- **Recommendation:** state that one creating request is one transaction. The interceptor opens it via `withTenant` and passes `tx` to the handler and to the enqueue. A multi-transaction flow is several routes, each with its own key.

#### AL4 · minor · CONFIRMED · how the concurrent duplicate is handled isn't specified
- **Plain `INSERT`:** the second request blocked until the first committed. It then got `23505` and its transaction was aborted (`25P02`), so it can't "find the record and replay" in that transaction. The DETAIL line carried the constraint name and all key values.
- **`INSERT … ON CONFLICT DO NOTHING`, then `SELECT`, under READ COMMITTED:** the second waited, inserted 0 rows, then read the first's body. This works.
- **First request holding longer than 5 s:** the duplicate got `55P03` ("while inserting index tuple"), which is the busy path. That's fine.
- **Recommendation:** specify `ON CONFLICT DO NOTHING` under READ COMMITTED. Record the idempotency row as the first item in the lock order in `new-app/CLAUDE.md`.

#### AL5 · major · CONFIRMED (PG) / CONFIRMED defaults, PLAUSIBLE interaction (Prisma) · AP8's time limits don't bound how long a lock is held
- **The claim:** "a stuck request cannot hold a quote's money lock for longer than that." It is false.
  - I ran `SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='10s'; SELECT … FOR UPDATE`, then left the transaction idle.
  - At 11.5 s `pg_stat_activity` showed `idle in transaction`, held for 00:00:11.50, still holding the lock.
  - `statement_timeout` limits one statement, not the transaction, and not the time Node spends awaiting (for example an HTTP call).
- **Prisma's defaults:** the shipped Prisma 6.19.3 runtime defaults interactive transactions to `timeout ?? 5e3` and `maxWait ?? 2e3`, and `withTenant` passes no options. So in practice:
  - Prisma's own client-side 5 s limit will usually expire at about the same time as the 5 s `lock_timeout`. The caller then gets P2028 instead of `55P03`, and gets a generic 500, not "busy".
  - The 10 s `statement_timeout` can't be reached inside `withTenant`.
  - Under pool pressure, a 2 s `maxWait` failure is another error nothing maps.
- **Unmapped deadlocks:** `40P01`, which `new-app/CLAUDE.md` says "must be retried", isn't mapped anywhere either.
- **Recommendation:**
  - Add `idle_in_transaction_session_timeout` (or `transaction_timeout` on PostgreSQL 17).
  - Set Prisma `transactionOptions` explicitly, above `lock_timeout`.
  - Map `55P03`, `57014`, `40P01` and P2028 to their problem types.
  - Make the §4 time-limit test hold a lock while *idle*, not only inside a statement.
- **Nothing found:** a lock timeout after a gapless number was allocated is safe. The series row update rolls back with the transaction, so no number is burned.

#### AL6 · major · CONFIRMED · AP10's worker can't claim jobs, and platform clean-up silently does nothing
- **Evidence:** a job table under RLS (FORCE, same policy shape as `001`), accessed as a NOLOGIN-style `NOBYPASSRLS` role with no tenant set:
  - `SELECT … FOR UPDATE SKIP LOCKED` returned **0 rows**.
  - `DELETE FROM job` deleted **0 rows**, with no error.
- **Why it matters:** the deployed role is required to lack BYPASSRLS (`privilege-model.md` D4, `least-privilege.ts`). A worker can't know `job.tenant_id` before it claims the job. So:
  - no tenant job ever runs;
  - the AP6 clean-up and the D4/D6 sweeps silently do nothing;
  - stored response bodies are kept forever, contradicting "kept 7 days".
- **Also unspecified:**
  - Holding the claim lock across `withTenant` needs a second connection (see AL3). That means a lease or visibility timeout, which the design doesn't mention.
  - Side effects such as email are at-least-once, so they need the provider's idempotency key.
- **Recommendation:**
  - Add a `SECURITY DEFINER` door `job_claim()` returning only `(id, tenant_id, kind)`, following the D1 pattern.
  - Platform jobs touch tenant rows only through named doors, or by fanning out one per-tenant job each.
  - Add a lease column.
  - Add a §4 test that the clean-up actually deletes rows.

#### AL7 · major · CONFIRMED · the database refusals AP5 wants mapped can only be told apart by message text
- **Evidence:** the migrations contain 51 `USING ERRCODE = 'check_violation'` uses and 0 that set `CONSTRAINT`, `HINT` or `DETAIL`. The ceiling refusal (`20260926200000_scope_reduction/migration.sql:141`) and the over-credit refusal (`…:94`, and `20260927110000_one_lock_per_quote:225`) are both 23514. So are dozens of internal-invariant refusals.
- **Result:** "mapped … by the module that expects them" can only mean string-matching the message. That breaks the next time the wording changes, which `scope_reduction` already did once.
- **Recommendation:** a new migration (Rule 6, no edits to old ones) giving each refusal a user can cause its own SQLSTATE or a `CONSTRAINT =` name. Map by that name.

#### AL8 · major · CONFIRMED · "the exception goes to the log" (AP5) contradicts AP9
I measured three exception sources, using synthetic values:
- **Malformed JSON** on Node 22 / Nest 10.4.15: the parser's message is `Unexpected token 's', ..."assword": synthetic-"... is not valid JSON`. That is a fragment of the body, here a password. Without a global filter Nest also returns it in the 400 response.
- **A `23505` error:** its DETAIL contains the key values, which would be an email on an email unique index.
- **A zod issue:** for an invalid enum value it carries `received: "jane.synthetic@example.test"`, and the `message` echoes it.

**Recommendation:** log the exception's class, SQLSTATE and constraint name only, never `message`, `detail` or `received`. Add a malformed body and a unique violation to the AP9 log test.

#### AL9 · major · CONFIRMED (server) / PLAUSIBLE (browser) · login CSRF
- **The gap:** AP2 applies the `Origin` check only to *cookie-authenticated* unsafe requests, and sign-in has no cookie yet.
- **What I ran:** Nest 10.4.15's default body parsers delivered `application/x-www-form-urlencoded` `email=…&password=…` to `@Body()` as `{email, password}` (201). That object would pass a zod `{email, password}` schema. AP7's "JSON only" is the only barrier left. It isn't stated as a CSRF control and isn't tested.
- **Not executed:** a cross-site top-level form POST to `/v1/sign-in` signing the victim in as the attacker. That depends on browsers accepting `Set-Cookie` on a top-level navigation, which I believe they do.
- **Recommendation:**
  - Apply the exact-`Origin` check to every unsafe request except share-token routes and signature-verified webhooks.
  - Disable the urlencoded parser.
  - Add a §4 test: a form-encoded sign-in from a foreign Origin is refused.

#### AL10 · major · REASONED · the share page shares an origin with the API
- **The setup:** the share page is served by the API (R1.21a), so it lives on `api.pryvis.com`. The `__Host-` cookie is host-only on that host with `Path=/`.
- **The attack:** any script running on the share page (tenant-supplied content, the page A9 hasn't designed yet) makes same-origin `fetch`es that carry the visitor's Strict cookie and can read the responses.
  - The Origin check stops writes, but every cookie-authenticated GET is readable, including the CSRF-token endpoint.
  - Cross-tenant case: tenant A sends a crafted link to someone who is also a signed-in tenant-B user (a subcontractor), and the script reads B's data.
- **A false sentence:** AP2's "a link in an email opens the web app, never the API" is false under R1.21a.
- **Recommendation:** serve the share page from its own host (for example `share.pryvis.com`), so the API's cookie isn't in scope there and CORS blocks reads.

#### AL11 · major · CONFIRMED (zod 3 / zod-to-openapi 7) · strictness is shallow, and the `@wire` refusals are lost
1. **Nested unknown fields:** a top-level `.strict()` with a nested `client: z.object({id})` silently **stripped** a nested `tenantId`. AP7 says unknown fields are refused, and that the contract test fails any schema with a tenant field. Neither holds for nested objects, and the §4 plant ("a non-strict schema") only tests the top level.
2. **Test-mode strictness:** zod has no strict/strip mode switch. `.strict()` on the response caught a top-level extra key but **not** a nested one, so "the strip never hides a mistake" is false for nested objects. `z.record(z.unknown())` passed `password_hash` even under `.strict()`.
3. **Dates and transforms:**
   - `z.date()` accepted a `Date` in a response and was emitted to OpenAPI as plain `{"type":"string"}`.
   - A `.transform()` field was emitted as its *input* type.
   - `z.coerce.number()` was emitted as `["number","null"]`.
   - This regresses F5 (`generate.ts`: `Date` "rejected deliberately") and ADR 0012's guarantee that the client type matches.

**Recommendation:**
- Strict objects at every depth (`z.strictObject`, or a schema walker that fails CI).
- A whitelist of allowed wire schema kinds that excludes date, transform, coerce, record, any and unknown — the F5 equivalent.
- Test-mode strictness applied deeply.

#### AL12 · major · CONFIRMED (inventory) / REASONED (flag) · two AP4 guards can't work as written
- **The route inventory:** AP4 says to compare the route inventory "which `route-protection-coverage` already enumerates" with `openapi.json`. That test's `Route` type is `{where, declared, publicReason}`: no method and no path. It also parses source text, so a path held in a `const` would be invisible to it. It doesn't enumerate "every controller route Nest registers".
- **The creating-route check:** "refuses a creating route without [the flag]" is circular. The only marker of "creating" is the flag itself, so an unflagged creating route passes.
- **Recommendation:**
  - Enumerate routes at runtime from the booted app (method plus full path).
  - Every POST/PUT/PATCH/DELETE must declare either the idempotency flag or `@NotCreating(reason)`.

#### AL13 · major · REASONED · provider callbacks (WiPay) fit neither AP6 nor AP7
- A WiPay callback is a `@PublicRoute` that creates money. It has no `Idempotency-Key`, no user, and no session to supply the tenant.
- AP6 would refuse it. AP7 forbids taking the tenant from the request.
- PRD R1.20h/J7 instead keys provider events by the provider's event id. Whoever builds B2 would have to make this up.
- **Recommendation:** add a fourth route kind, "signed provider callback". It is deduplicated by the provider event id, and the tenant is resolved from an opaque per-link reference we issued.

#### AL14 · minor · CONFIRMED in code · how the session cookie is encoded is unspecified
- AP2 says the cookie value is "the session secret". But `SessionRef` is `{sessionId, version}`, and `DbCallerResolver` refuses when `session.version !== sessionRef.version` (ADR 0013: "the token carries a session id and a version").
- A builder must invent the encoding, for the cookie and the bearer header alike.
- The design also doesn't say how a half-authenticated (MFA-pending) session gets a CSRF token back after a page reload, since the resolver refuses it.

#### AL15 · minor · CONFIRMED · unmatched routes and oversize bodies
- **Unmatched routes:**
  - Nest's default 404 for `GET /v1/share/<token>/extra` was `"Cannot GET /v1/share/SHARETOKENsyntheticXYZ/extra"`, echoing the token.
  - AP9 logs "the route template", and an unmatched request has none. The design doesn't say what is logged instead; falling back to the raw URL leaks the token.
- **Oversize bodies:** a catch-all filter of the kind AP5 describes turned the body-size refusal (413) into a **500**.

#### AL16 · minor · REASONED / CONFIRMED · consistency
- `/health/ready` requiring the schema to be exactly this build's version will fail old instances during a migrate-then-deploy. "At least" would avoid that.
- The existing routes are `/health` and `/tenants/me` (`tenants.controller.ts`). That's neither `/health/live` nor under `/v1`, and the design doesn't say health is exempt from `/v1`.
- ADR 0011 makes the ceiling per-jurisdiction rule-pack data. AP7 says "one ceiling from the shared core" in a static schema, and no ceiling exists in `packages/core` yet.

#### AL17 · minor · REASONED · `trust proxy` "one hop" isn't verified
- AP8 states Render has one proxy hop without evidence.
- One hop too few: everyone shares one IP bucket, and THREAT-MODEL's CGNAT row already says IP limits are fragile.
- One hop too many: the IP can be forged. R1.20's acceptance evidence records this same IP.
- **Recommendation:** a deployed probe test.

#### AL18 · minor · REASONED · GETs with side effects
CSRF and Origin protection exempt safe methods, but the design never says GETs must not change state. Add the rule, and have the contract test refuse an idempotency flag on a GET.

#### Checked and found nothing wrong
- A sibling subdomain tossing the cookie: `__Host-` prevents it.
- A `null` or missing Origin: refused by the exact match.
- The rule refusing a request with both cookie and bearer.
- Bearer without CSRF: a preflight is needed to set the header.
- Key reuse across users or tenants: the key is in the unique tuple.
- A stale replay: standard semantics.
- Lock order quote → client → series against the idempotency row: the duplicate holds nothing else, so no cycle forms.
- A lock timeout after a number is allocated: rolls back, no gap.
- Signed URLs lasting 5 minutes after a revocation or suspension: a small accepted residual. The resolver refuses suspended tenants before a URL is issued.
- Job payloads holding identifiers only.
- Cache keys: no cache in R1.

---

### AP1–AP11: my own opinion

| AP | Verdict | Where I differ (one line) |
|---|---|---|
| AP1 | **agree** | `api.pryvis.com` is right; but put the share page on its own host (AL10). |
| AP2 | **agree, amended** | Apply the Origin check to *all* unsafe requests, not only cookie ones (AL9); specify the cookie encoding including the version (AL14). |
| AP3 | **agree (zod), disagree on the strict/strip split** | Strict objects at every depth plus a whitelist of wire schema kinds; keep the production strip only as a backstop (AL11). |
| AP4 | **agree, amended** | Enumerate routes at runtime; every unsafe route declares either idempotent or `@NotCreating(reason)` (AL12). |
| AP5 | **agree, amended** | Give each user-causable refusal its own SQLSTATE or constraint name; never log exception messages (AL7, AL8). |
| AP6 | **agree on the in-transaction mechanism, disagree on key and fingerprint** | Non-null principal; fingerprint includes params and query; one request = one transaction; provider events keyed by event id (AL1–AL4, AL13). |
| AP7 | **agree** | "Unknown fields refused" must apply at every depth (AL11). |
| AP8 | **disagree on the time limits as written** | Add `idle_in_transaction_session_timeout`, set Prisma `transactionOptions` above `lock_timeout`, map `55P03`/`57014`/`40P01`/P2028; verify the proxy hop count when deployed (AL5, AL17). |
| AP9 | **agree, amended** | A logging rule for unmatched routes, and exception text redacted (AL8, AL15). |
| AP10 | **agree (option A), disagree that RLS alone suffices** | A `SECURITY DEFINER` claim door, a lease, and named doors for platform jobs (AL6). |
| AP11 | **agree** | Also assert the key's tenant prefix at signing; share-token routes take the tenant from the token row. |

**Verdict: the design is sound to build from after the named changes (AL1–AL13).**

`git status --short` (run at HEAD 3f3254a, after stopping the scratch cluster):
```
```
(empty)
