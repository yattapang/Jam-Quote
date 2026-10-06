# Design: the API layer — contract, sessions, errors, idempotency, validation, start-up, jobs and storage

**Status: APPROVED by the owner, 2026-10-02 — every recommendation, AP1-AP11** ("Approved. I am not an expert on
API and therefore require your expert judgment on this part"). **Amended the same day** to answer its independent
read (findings AL1-AL18, §7), which also gave its own opinion on every recommendation: it agreed with the direction
of all eleven and named where the text did not work. **The owner signed off the step, amendments included, on 2026-10-02** ("A2 agreed"); A2 is ticked in the build plan. One adds
an owner action: the share page gets its own host, `share.pryvis.com` (AL10). Build plan step A2
(`docs/BUILD-PLAN.md`). Nothing here is built until step B2
(and B5 for storage) begins.

Date: 2026-10-02 · **Implements the direction of** ADR 0030 decision 2 (REST, a generated OpenAPI contract with a
contract test, cookie sessions with CSRF, RFC 9457 errors, idempotency, one validation boundary, start-up wiring)
· **Builds on** ADR 0012 (the API's structure and the `@wire` contract), ADR 0013 (default-deny, sessions re-resolved
every request), ADR 0016 (rate limiting), ADR 0011 (money as integer minor units at the boundary), ADR 0026 (the
API always on at launch), `docs/design/api-bootstrap.md` (the composition root, which today binds a session reader
that reads nothing) and `docs/design/privilege-model.md` (door functions; no role bypasses row-level security) ·
**Answers** `docs/PLANNING-AUDIT.md` §7 item 2, including brief §11's "background jobs must carry tenant context
explicitly" and "scope … file storage paths and signed URLs, cache keys" · **Delegation (Rule 16.5):** Opus —
security architecture.

---

## 1. The problem, in one paragraph

The API has its guard, its tenancy seam, sign-in, MFA, rate limiting and a least-privilege check, each tested. But
**no request can reach any of it**. `app.module.ts` binds a session reader that reads nothing and a resolver that
refuses everyone, on purpose (`api-bootstrap.md`, "Out, on purpose"). Nothing yet exists for:

- start-up (`main.ts`), cookies, or a CSRF defence;
- an error format, or request validation;
- an OpenAPI document — the contract generator says so itself: "there is no OpenAPI document yet, because there
  are no routes yet";
- idempotency;
- a rule for how a background job or a stored file carries its tenant.

Every workflow from C1 onward needs all of it. This design decides it once, so that each workflow adds routes
rather than re-deciding how requests travel. Text marked *(ALn)* answers the independent read's finding of that
number (§7).

## 2. The decisions

Each has options and a recommendation, **(rec)**.

### AP1 · Where the API lives, relative to the web app — and where the share page lives

*(Pointer 2026-10-06: the API's host and region are now set by `docs/design/environments-and-operations.md` OP2 — recommended DigitalOcean in Toronto; what follows holds for any host.)* The web app and the public site are on Vercel at pryvis.com; the API is on Render. A browser treats a cookie from a
different *site* as third-party, and browsers are blocking those.

| Option | For | Against |
|---|---|---|
| **A. (rec) The API at `api.pryvis.com`** — a custom domain on the API host, one DNS record at GoDaddy | Same *site* as pryvis.com, so the session cookie is first-party; the API stays one service in one place; no extra hop | CORS must be configured (exactly one allowed origin, AP8); one owner action |
| B. Proxy `/api` through the web app (Next.js rewrites) | Same origin, no CORS | Every request takes a second hop through Vercel's functions — their timeouts, their logs holding request bodies, and Vercel becoming a processor of everything the API sees |
| C. The host's default domain (`*.onrender.com`) | Nothing to set up | The cookie is third-party: blocked by Safari now and others progressively. Not viable |

**The share page gets its own host, `share.pryvis.com`** *(AL10)*. It is still served by the API (R1.21a), the
same service on a second custom domain. The API answers share routes only on that host, and every other route only
on `api.pryvis.com`.

The reason is that the session cookie (AP2) is host-only on `api.pryvis.com`:

- If the share page lived on that host too, any script on it — tenant-supplied content included — would make
  same-origin requests that carry a signed-in visitor's cookie, and could read the responses.
- A client who is also a Pryvis tenant (a subcontractor, say) would then expose their own account to whoever wrote
  the page.

On its own host, the page never sees the API's cookie, and CORS refuses its reads. This is one more DNS record, set
alongside the first.

### AP2 · Sessions and CSRF

**The web session is a cookie** set by the API:

- **Name and attributes.** `__Host-pryvis_session`, `HttpOnly`, `Secure`, `Path=/`, no `Domain`, and
  **`SameSite=Strict`**. The `__Host-` prefix makes the browser enforce the last three.
- **Its value** *(AL14)* is `<secret>.<version>`: the session secret (base64url, so it contains no `.`) and the
  session's version as a decimal. These are exactly the two fields of `SessionRef` (`caller.ts`) that
  `DbCallerResolver` checks. The database holds only the secret's hash (privilege model D2). A malformed value is
  treated as no session.
- **Lifetime and revocation** are ADR 0013's, unchanged.
- **Why Strict is safe here.** The browser calls `api.pryvis.com` only from pryvis.com's own pages, which are
  same-site. A link in an email opens either the web app or the share page (AP1), never `api.pryvis.com`.

**CSRF has three layers (rec)**, because "same-site" includes every subdomain of pryvis.com, and one taken-over
subdomain would otherwise be inside the fence:

1. **An exact `Origin` check on every unsafe request** (`POST`, `PUT`, `PATCH`, `DELETE`) *(AL9)*. That includes
   sign-in and sign-up, which carry no cookie yet: without the check, a page elsewhere could sign a victim in as the
   attacker (login CSRF). The rule is:
   - API routes require `Origin: https://pryvis.com` exactly, and a missing or `null` Origin is refused;
   - share routes require the share host's own origin;
   - the only exemption is signed provider callbacks (AP6), which are authenticated by their signature instead.
2. **A CSRF token** on every unsafe request that authenticates by the cookie, in an `X-CSRF-Token` header.
   - It is an HMAC of the session's hash under a server key, so it needs no storage and dies with the session.
   - The web app receives it in the body of `GET /v1/session` and keeps it in memory, never in storage.
   - For a session still waiting on its second factor, that route answers with only the session's state and the
     token *(AL14)*, through the same door the MFA routes use. So a page reload in the middle of sign-in still
     works.
3. **JSON only.** The urlencoded and multipart body parsers are switched off *(AL9)*: a plain HTML form cannot
   send JSON. This is stated as a CSRF control and tested as one.

**Safe methods change nothing** *(AL18)*. A `GET`, `HEAD` or `OPTIONS` route never changes state. That is why the
CSRF layers can exempt them, and the contract test (AP4) refuses an idempotency flag on a safe method.

**The mobile app (later, G2)** sends the same `<secret>.<version>` as `Authorization: Bearer …`.

- A request that carries a bearer header is not cookie-authenticated and needs no CSRF token: a forged cross-site
  request cannot set that header without a CORS preflight, which we refuse.
- A request carrying **both** cookie and bearer is refused. Two identities in one request is a confusion an
  attacker would use.

**Share-link routes** (`@ShareTokenRoute`, ADR 0013) carry no ambient credential. Their token is a credential, and
is handled as one in AP9 (never logged).

**The composition root.** In `app.module.ts`, the `SessionReader` binding is replaced by one that reads the cookie
or the bearer header as above, and the `CallerResolver` binding by the already-tested `DbCallerResolver`. The test
that asserts today's refusal is replaced by tests of the real path (§4).

Refusals use ADR 0013's one sentence; the reason goes to the log.

### AP3 · One schema per route — validation, types and the contract from one definition

ADR 0030 asks for a contract "generated from the code" and "validation at one boundary that rejects unknown fields".
Whatever defines a request must also be what checks it, or the two drift — the exact defect ADR 0012 was written
against.

| Option | For | Against |
|---|---|---|
| **A. (rec) Zod schemas per route**, in each module's `.dto.ts`. One Nest pipe validates params, query and body against them; responses are passed through their schema too; the contract package emits OpenAPI 3.1 and the client types from the same schemas | One definition gives validation, the server's types, the client's types and the OpenAPI document; schemas are plain TypeScript values, usable by the web and mobile apps; no decorators to forget | Two new libraries (`zod`, and `@asteasolutions/zod-to-openapi` to emit the document), recorded in the SBOM with this reason; the `@wire` generator is rewritten to read schemas instead of interfaces, and must keep its refusals (below) |
| B. `class-validator` DTO classes with `@nestjs/swagger` | Nest's documented path | Validation, types and documentation come from decorators on classes; a missing decorator silently drops a field from validation or the document; classes cannot be shared with clients cleanly |
| C. Keep `@wire` interfaces, add a runtime checker generated from types | Keeps today's generator | A third moving part; still needs a separate OpenAPI emitter |

**Strict at every depth, enforced by a walker, not by habit** *(AL11)*. Zod's `.strict()` applies only to the
object it is called on. The read showed a top-level strict schema silently stripping a `tenantId` nested inside a
`client` object. So:

- every object in a wire schema is a strict object, at every depth;
- a **schema walker** in the contract package walks every route's request and response schemas and fails CI on any
  non-strict object, at any depth.

**A whitelist of wire schema kinds** — the F5 refusal, kept *(AL11)*:

- **Allowed:** strings, numbers, integers, booleans, literals, enums of literals, arrays, strict objects, unions of
  allowed kinds, nullable and optional.
- **Refused, by name, with the reason:** dates (JSON has no date — `generate.ts` refuses `Date` deliberately, F5);
  transforms and coercions (the document would describe the input, not what the client receives); records, `any` and
  `unknown` (they pass any key, including a `password_hash`).

The same walker enforces this list. The generator's other guarantees under ADR 0012 and F4/F5 stay: a declared
type is never silently dropped, and every referenced type is emitted or refused.

**Responses go through their schema, always.** A response is parsed by its strict schema before it is sent, in tests
and in production alike. In production, a parse failure is logged (AP9) and the client receives the generic 500,
never the unparsed body. There is no separate "strip" mode: with strict objects at every depth, an extra field fails
the parse everywhere, so a field added to a database row cannot reach a client because someone returned the row.

### AP4 · The OpenAPI document and its contract test

- The contract package (`packages/contract`) emits **`openapi.json`** (OpenAPI 3.1) and the client types, both checked
  in, from the route schemas of AP3. The existing drift test keeps its job: CI fails if the checked-in output is
  stale.
- **The contract test (CI)** boots the real application, as `app.module.test.ts` does, and:
  1. **Enumerates the routes at run time** from the booted application — every method and full path the router
     holds *(AL12)*. This is not the source-text scan in `route-protection-coverage.test.ts`, which records no method
     or path. It compares that list with the operations in `openapi.json`: a route without an operation, or an
     operation without a route, fails by name.
  2. Checks that every operation declares its protection — `Authenticated`, `ShareTokenRoute`, `PublicRoute`, or the
     signed provider callback of AP6 — and that the document says the same.
  3. **Requires every unsafe route to declare what it is** *(AL12)*: either `Idempotent` (AP6) or `NotCreating(reason)`
     with a written reason, as `@PublicRoute(reason)` does. An unsafe route declaring neither fails, so a creating
     route cannot pass by omission. A safe route declaring `Idempotent` fails (AP2, AL18).
  4. Checks that every operation declares its error responses as problem details (AP5), and every `Idempotent` route
     its `Idempotency-Key` header.
  5. Runs the schema walker of AP3.
- **The document is published nowhere in R1.** It is the clients' contract and a review artefact, not a public API
  (API access is release 3, I4).

### AP5 · Errors — RFC 9457 problem details, leaking nothing

**Every error response is `application/problem+json`**, with:

- `type` — a stable URI, `https://pryvis.com/problems/<slug>`. Clients branch on `type`, never on text;
- `title` — a fixed sentence per type;
- `status`;
- `detail` — a plain-English sentence written for the person on the screen, never an exception message;
- `instance` — the request id (AP9).

**Validation errors** add `errors: [{ path, code }]`: the field path and a code from a closed list. **The value sent
is never echoed** — not in `detail`, not through a validator's own message, which can carry the received value
*(AL8)*. An echoed value is how a log or a screenshot ends up holding someone's data.

**The problem types are a closed list** in the shared core, each with its status and title, and each listed in
`openapi.json`. A new error is a new entry, reviewed like any other contract change.

**One filter catches everything**, Nest's own exceptions included *(AL15)*:

- a malformed JSON body is the "malformed request" problem (400). The parser's message, which quotes part of the
  body, is never sent or logged;
- an oversize body is 413, an unmatched route 404 and a wrong method 405, each its own problem type — never Nest's
  default text, which echoes the path, and never a 500;
- anything unexpected is a 500 with the generic type and the request id.

What reaches the log is in AP9. Database errors, stack traces, SQL, constraint names and table names never reach a
response.

**The database's refusals are mapped by name, not by message** *(AL7)*:

- Today every refusal raised in the migrations uses `check_violation`. So the ceiling, the over-credit check and
  dozens of internal invariants share one code, and could only be told apart by matching their text.
- A new migration (Rule 6: none edited) re-raises **each refusal a user can cause** — the ceiling, the over-credit
  check, a stale version, the per-code ceiling and the T7 invariants of `tax-and-documents.md` — with its own
  `CONSTRAINT` name. The API maps by that name to a problem type, from one table in the shared core.
- Any database error not in that table is the generic 500, and is logged as AP9 says.

**These codes are mapped too** *(AL5)*:

| Code | Meaning | Problem |
|---|---|---|
| `55P03` | lock not available (AP8's lock timeout) | "busy, try again" |
| `57014` | statement timed out | "busy, try again" |
| `40P01` | deadlock (`new-app/CLAUDE.md`, "Financial writes": it must be retried) | "busy, try again" |
| Prisma P2028 | the client gave up on its transaction | "busy, try again" |
| Prisma pool timeout | no connection free in time | "busy, try again" |

Each is safe to answer this way because creating routes are idempotent (AP6).

**Kept from earlier decisions:** an authentication refusal is ADR 0013's one sentence ("Please sign in again"),
whatever the reason. Being rate-limited is ADR 0016's distinct message, with `Retry-After`.

### AP6 · Idempotency — a creating request is safe to send twice

ADR 0030: "an idempotency key on every request that creates money or a document". A contractor at a gate on mobile
data taps "Send invoice", the screen hangs, and they tap again. Without this, the client receives two invoices and
two numbers are burned from a gapless series.

**Which routes.** Every route that creates a document, a number, money or a message:

- seal, number, invoice, credit note and variation;
- payment, allocation, refund and withholding;
- accept, decline and send.

Each declares `Idempotent` on its route; the contract test (AP4) makes every unsafe route declare either that or
`NotCreating(reason)`.

**The header** is `Idempotency-Key`: a UUID the client makes per user action, not per attempt. It is required on
those routes, and a request without it is refused with its problem type.

**The record** is a tenant-scoped table under row-level security, holding the fingerprint and the response's status
and body.

- **It is keyed on a principal that is never null** *(AL1)*:
  - for an authenticated route, the tenant, the user and the key;
  - for a share route, the tenant, the share link's id and the key.

  A plain unique index lets two rows with a null user both in — PostgreSQL treats nulls as distinct — so the share
  routes, where a client double-taps "Accept", would have had no guard. The principal column is `NOT NULL`.
- **The fingerprint** *(AL2)* is a SHA-256 over:
  - the method;
  - the route template;
  - the resolved path parameters;
  - the validated query;
  - the validated body, serialised with keys sorted.

  "Send invoice A" and "send invoice B" share a template and an empty body. With the parameters in the fingerprint,
  the same key reused for B is refused, not answered with A's response.

**One creating request is one transaction** *(AL3)*:

- The idempotency interceptor opens the transaction itself, through `withTenant`, and hands that transaction to the
  handler and to anything it enqueues (AP10).
- Handlers on `Idempotent` routes never open their own. `withTenant` opens a fresh transaction on the client it is
  given, and Prisma cannot nest one, so a handler calling it again would silently make a second, separate
  transaction. A test plants exactly that, and the record and the work must still commit or fail together.
- A flow that must commit in separate steps — such as the wrong-document remedy in `new-app/CLAUDE.md` ("Financial
  writes") — is **several routes, each with its own key**, never one route committing several times.

**How the record is written** *(AL4)*: first in the transaction, under READ COMMITTED, as
`INSERT … ON CONFLICT DO NOTHING`, then a read of the row.

- If this request inserted it, the work runs.
- If the row already existed, the stored response is replayed — or refused, if the fingerprint differs.
- A concurrent duplicate waits on the unique index until the first commits, then finds the row and replays its
  response. If the first rolls back, its row goes with it, and the retry runs fresh.
- So there is no "in progress" state to expire, and no window where the work committed but the record did not.
- A plain `INSERT` would abort the duplicate's transaction on the unique violation, and its error text names every
  key value. It is not used.
- **The idempotency row comes first in the lock order**, before the quote's money lock (`tax-and-documents.md` T9).
  `new-app/CLAUDE.md` records this when it is built. A duplicate waiting on it holds nothing else, so no cycle can
  form.

**The same key with a different request** (a different fingerprint) is refused (422), never replayed: a key reused
for a different invoice must not return the first invoice.

**Signed provider callbacks are a fourth route kind** *(AL13)*. A payment provider's callback (WiPay, D3) creates
money, but it has no `Idempotency-Key`, no user and no session.

- **Its tenant is resolved first**, from an opaque reference we issued with the payment link and stored against it —
  never from a tenant id in the request. A tenant's WiPay callback is signed with that tenant's own key (PRD R1.29),
  so the key to check it with is only known once the reference has named the tenant. An unknown reference is
  refused like a bad signature.
- It is then authenticated by verifying the signature or hash with that key.
- It is de-duplicated by the provider's own event or transaction id: one row per event, ever (the unique
  `(source, external_id)` rule of `docs/design/acceptance-grade.md`).
- **The callback alone is never trusted.** Because the tenant holds the key that signs it, money is recorded only
  after our server confirms the transaction with the provider, server to server (R1.29, R1.20d; ADR 0029 E2).
- It is declared as `ProviderCallback(provider, reason)` and counted by the contract test as a protection kind.

**Retention.** Records are kept **7 days**, then deleted by a platform job through a named door (AP10). Stored
response bodies hold tenant data, so they are under row-level security like the rest, and they are kept no longer
than retries need. A test proves the clean-up actually deletes rows (AL6). The mobile outbox (G1) may need longer;
its design revisits this, and domain keys such as a variation's `client_reference` (R1.22g) already cover replay at
the row.

**Work outside the transaction** — sending an email, calling a payment provider — is never done in the request. It is
**enqueued** in the request's transaction (AP10), and the job passes its own idempotency key to the provider where
the provider supports one.

### AP7 · The validation boundary, and what the wire carries

- **Unknown fields are refused**, in params, query and body, **at every depth** (AP3's walker; *AL11*). Refusing
  beats ignoring: an ignored field is a client that believes it set something.
- **Bodies are JSON only** (`Content-Type: application/json`), at most **100 KB**. The other body parsers are off
  (AP2). File uploads have their own route kind and limits (AP11, B5).
- **Money** is an integer number of minor units. The schema checks it is a safe integer; the boundary then checks it
  against ADR 0011's business ceiling for the tenant's jurisdiction, read from the rule pack through the shared core
  *(AL16)*, with the currency beside it where the route does not fix it. Never a decimal, never a string.
- **Time:** an instant is an ISO 8601 UTC string, and a calendar day is `YYYY-MM-DD` (Rule 3 distinguishes them).
  Both are strings on the wire; never a date object (AP3's whitelist).
- **Identifiers** are UUIDs, validated as such before any query runs.
- **Lists** are cursor-paginated: 50 by default, at most 100 per page. An unbounded list endpoint is refused by
  review.
- **Versioning.** Every contract route is under `/v1`; a breaking change is a new version, never a silent change. The
  existing `/tenants/me` moves to `/v1/tenants/me` *(AL16)*. Health checks are operational, not contract, and sit
  outside `/v1` (AP8).
- **A tenant id is never accepted from a request** (`tenant-context.ts`, "Never does"). The schemas of tenant-scoped
  routes have no tenant field at any depth, and the walker fails any that does.

### AP8 · Start-up — the application refuses to start unsafe

`main.ts` runs these steps in order. Any failure stops the process with a message naming what is missing, never a
secret's value.

1. **Configuration** is read once and validated by a schema: the database URLs, `WEB_ORIGIN`, the share host, the
   CSRF key, the MFA keys (ADR 0021), and the email and payment keys as each workflow arrives. A missing or
   malformed value refuses to boot.
2. **The least-privilege check** (`least-privilege.ts`, `assertLeastPrivilege`) runs against the database, and any
   violation refuses to boot. It is written and tested and not yet wired; this wires it.
3. **The composition root** binds the real session reader (AP2) and `DbCallerResolver`. The global
   `DefaultDenyGuard` stays bound by `APP_GUARD`, unchanged.
4. **Transport:**
   - **`trust proxy`** is set to the number of proxy hops the host puts in front of the API. That number is
     **measured, not assumed** *(AL17)*: a probe deployed to staging (A4) records the `X-Forwarded-For` chain it
     receives, and the setting and its evidence are recorded together. Too few hops and every caller shares one
     rate-limit bucket; too many and a caller can forge their IP, which the rate limiter (ADR 0016) and the
     acceptance evidence (R1.20) both rely on;
   - CORS allows **exactly** `WEB_ORIGIN`, with credentials, on the API host, and nothing on the share host;
   - security headers on every response: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
     `Referrer-Policy: no-referrer`, and a restrictive `Content-Security-Policy` (the share page's own policy is
     A9's);
   - the body-size limit of AP7, and JSON only.
5. **Time limits.** Each transaction runs with these settings *(AL5)*:

   | Setting | Value (rec) | What it bounds |
   |---|---|---|
   | `lock_timeout` | 5 s | waiting for a lock |
   | `statement_timeout` | 10 s | one statement |
   | `idle_in_transaction_session_timeout` | 15 s | a transaction left open while Node waits — the one that actually bounds how long a stuck request can hold a quote's money lock (`new-app/CLAUDE.md`, "Financial writes") |
   | Prisma `timeout` | 20 s | the whole transaction, set explicitly |
   | Prisma `maxWait` | 5 s | waiting for a connection, set explicitly |

   The read showed that `lock_timeout` and `statement_timeout` alone left a transaction idle for over 11 s still
   holding its lock. Prisma's own defaults (5 s, 2 s) are not left implicit: they would have expired first and
   surfaced as an unmapped 500. Every resulting error is mapped (AP5). Nothing is lost by a timeout: a number
   allocated in the transaction rolls back with it, so a gapless series has no gap.
6. **Health, both `@PublicRoute` with their reasons, outside `/v1`:**
   - `/health/live` answers if the process runs;
   - `/health/ready` answers only if the database is reachable and its schema is **at least** the version this build
     needs *(AL16)*, so instances still running during a migrate-then-deploy stay ready.

   Neither says anything else: no versions, no hostnames, no counts. Today's `/health` becomes `/health/live`.
7. **Shutdown** stops accepting, lets in-flight requests finish within the host's grace period, and closes the pool.

### AP9 · Logs and request ids — nothing personal, nothing secret

- **Request ids.** Every request gets one, generated by us; an incoming one is not trusted. It is returned in a
  `Request-Id` header and as `instance` in any problem (AP5), so a tenant reporting a problem can quote it (Rule 25's
  feedback loop).
- **One structured line per request**, holding:
  - the request id;
  - the **route template**, such as `/v1/share/:token` — never the actual path, because a share token in a path is a
    credential. An unmatched request has no template, so it is logged as `(unmatched)` with its method *(AL15)*;
  - the method, the status and the duration;
  - the tenant id and user id when known — identifiers, not personal data.
- **Never logged:** a body, a query string, a header value, a cookie, an email address, a name, a phone number, or an
  IP address in clear. The IP is needed by the rate limiter, not the log.
- **Exceptions are logged by their shape, never their text** *(AL8)*: the exception's class, the SQLSTATE and the
  constraint name when there is one, and the route template. Never `message`, `detail`, a validator's received
  value, or a stack trace's arguments. The read found all three sources carrying data:
  - a JSON parse error quotes the body, which may hold a password;
  - a unique violation's detail holds the key's values, such as an email address;
  - a validator's issue holds the value it received.
- **A test enforces it.** Requests carrying planted personal data and secrets go through every route kind, including:
  - a malformed body;
  - a body that trips a unique violation;
  - an invalid enum value;
  - an unmatched path holding a token.

  The captured log output is then searched for each planted value. Plants: logging the raw URL, and logging
  `error.message` — each fails the test.
- **Error tracking** (a service chosen in A5) receives the same redacted shape and nothing more.

### AP10 · Background jobs carry their tenant

Brief §11: "Background jobs must carry tenant context explicitly." Jobs are coming:

- sending messages (C1);
- reminders (D2);
- the nightly reconciliation (D4);
- idempotency clean-up (AP6);
- lapse handling (D6).

| Option | For | Against |
|---|---|---|
| **A. (rec) A job table in our own PostgreSQL**, claimed through a door function | No new service (Rule 18). A job is enqueued **in the same transaction** as the change that causes it, so a sent-invoice email can never be queued for an invoice that rolled back, nor lost for one that committed. The table is under row-level security like everything else | We write and test a small worker: claiming, leases, retries with back-off, and a dead-letter state |
| B. A queue library with its own schema (for example pg-boss) | Retries and scheduling built in | Its tables are not under our row-level security or our least-privilege check, and job payloads hold tenant data |
| C. A hosted queue (Redis, SQS) | Scale | A new service and a new processor of tenant data, for volumes Postgres handles easily; a job cannot share the business transaction |

**How a job is claimed** *(AL6)*. Row-level security alone would leave the worker stuck: with no tenant set, it sees
no jobs. The read showed a claim returning 0 rows, and a clean-up deleting 0 rows with no error. The worker cannot
know a job's tenant before it has claimed the job, and no deployed role may bypass row-level security (privilege
model D4). So:

- **`job_claim()` is a SECURITY DEFINER door**, following the privilege model's D1 pattern. It claims the next due
  job with `FOR UPDATE SKIP LOCKED`, sets its **lease** (claimed by whom, until when), and returns only
  `(id, tenant_id, kind)` — never the payload.
- **The worker then runs the job inside `withTenant(tenant_id)`**, which reads the payload under row-level security.
  It finishes by marking the job done through a second door, `job_complete()`, in that same transaction. The claim
  and the work are separate transactions (AP6's rule on nesting), so the lease is what makes the claim safe.
- **A lease that expires** — the worker crashed — makes the job claimable again. So every job is **at-least-once**:
  its work must be idempotent, and a job that calls a provider passes the provider an idempotency key derived from
  the job id.
- **After a set number of failed attempts**, a job moves to a dead-letter state. It is shown on the staff console
  (D7) and is never retried silently.

**The rules, whichever option:**

- A job row carries `tenant_id` as a column, never only inside its payload.
- Every tenant job runs inside `withTenant(job.tenant_id)` and nowhere else.
- **A platform job** has no tenant. It is allowed only for job kinds declared as platform jobs with a written reason
  — the same shape as `@PublicRoute(reason)`. It touches tenant rows **only through named door functions**, such as
  the idempotency clean-up's `idempotency_purge_expired()`, or by enqueueing one tenant job per tenant. It never reads
  tenant tables directly.
- Payloads hold identifiers, not copies of personal data.

**Tests:**

- a job enqueued for tenant A cannot read tenant B's rows;
- a planted job kind that runs outside `withTenant` fails;
- the clean-up job deletes the rows it should, counted;
- a job whose lease expires is claimed again exactly once.

### AP11 · Files, signed URLs and caches are tenant-scoped

The storage provider is chosen in A5; these rules hold for any provider:

- **Object keys are made by the server**, never from a file name or any client input:
  `tenants/<tenant_id>/<kind>/<uuid>`. The tenant segment comes from the caller's session — or, on a share route,
  from the share link's row.
- **A signed URL is issued only after the row that owns the file is read under row-level security.** Before signing,
  the key's tenant segment is checked against the tenant in context (the read's note on AP11). So a tenant can only ever get a
  URL for a file their own row points to. The URL expires in **5 minutes** (rec), is for one object and one method,
  and is never logged (AP9). A URL issued just before a revocation or a suspension lives out its 5 minutes: that
  residual is accepted.
- **Uploads** go through the API's own route kind (size and type checked, then the malware scan of B5). A client
  never chooses where a file lands.
- **Caches.** R1 has no shared cache. If one is added, every key begins with the tenant id, and its design says so: a
  cache is a store, and the same isolation rules apply.
- **A cross-tenant test** proves tenant B cannot obtain a signed URL for tenant A's file by its id, by its key, or by
  guessing a key.

## 3. What gets built (step B2, and B5 for AP11)

1. `main.ts` and the start-up order of AP8, with configuration validation, the least-privilege check, the explicit
   time limits and transaction options, and host-based routing for the API and share hosts.
2. The session reader for cookie and bearer, with the `<secret>.<version>` encoding; the CSRF token, the exact-Origin
   check on every unsafe request, and the non-JSON parsers switched off; the real resolver bound (AP2).
3. The schema pipe and response parsing; the schema walker (strict at every depth, the whitelist of wire kinds); the
   contract generator rewritten to read schemas and emit `openapi.json`; the contract test, with the runtime route
   inventory and the `Idempotent` / `NotCreating` declaration (AP3, AP4).
4. The one problem-details filter, the closed list of problem types, and the mapping tables for constraint names and
   database codes. A new migration names each user-causable refusal (AP5).
5. The idempotency table, keyed on a non-null principal; its interceptor, which owns the transaction; and its
   clean-up door (AP6).
6. The signed provider callback route kind (AP6), used first by D3.
7. Request ids and the redacting logger, with the log test (AP9).
8. The job table, the claim and complete doors, leases, the worker and the platform-job declaration (AP10).
9. In B5: the storage port and its rules (AP11).
10. Documents:
    - `new-app/CLAUDE.md` — how to add a route (schema, protection, `Idempotent` or `NotCreating`, never
      `withTenant` inside an idempotent handler), and the idempotency row first in the lock order;
    - the threat model's rows for CSRF (login CSRF included), session transport, the share host, logging and jobs,
      moved to built with their evidence;
    - the SBOM's two libraries.

## 4. Tests, each proved with a planted defect

**Sessions and CSRF**

- **Sessions:**
  - a cookie-authenticated request with a valid session reaches a route; without the cookie it is refused, and a
    malformed `<secret>.<version>` is no session;
  - a session waiting on its second factor gets only its state and token from `GET /v1/session`;
  - plant: the reader returning a session for a revoked secret — refused by the resolver, as ADR 0013 says.
- **CSRF:**
  - an unsafe cookie request without the token, with a token from another session, or with a wrong, missing or
    `null` `Origin`, is refused; with both it succeeds;
  - **a form-encoded sign-in from a foreign Origin is refused** (AL9);
  - a request carrying cookie and bearer is refused;
  - plants: skipping the Origin check on sign-in; accepting any token; re-enabling the urlencoded parser.
- **The share host** (AL10): an API route requested on the share host is 404, and a share route requested on the API
  host is 404. The session cookie is never set for, nor sent to, the share host.

**Validation and the contract**

- **Validation:**
  - an unknown field is refused at the top level **and nested two levels down**, naming its path and not echoing its
    value;
  - a money value above the jurisdiction's ceiling is refused;
  - a tenant id field at any depth is refused;
  - plants: a nested non-strict object; a `z.date()` in a response; a `z.record()` — each fails the walker.
- **Responses:** a handler returning a database row with an extra field, at the top level or nested, fails the
  response parse. Plant: removing the response parse.
- **Contract:**
  - a route with no operation, and an operation with no route, each fail by name;
  - an unsafe route declaring neither `Idempotent` nor `NotCreating` fails;
  - a `GET` declaring `Idempotent` fails;
  - plant: a route added and not documented.

**Errors**

- A thrown database error returns the generic problem, with no SQL, constraint or table name in it.
- Each named refusal maps to its problem type.
- A malformed body is 400, an oversize body 413 and an unmatched path 404, each as problem details with nothing
  echoed.

**Idempotency**

- **Replay:**
  - the same key twice returns the same response, creates one row and burns one number — also under concurrency on
    real PostgreSQL (the race suite);
  - a double-tapped accept on a share route creates one acceptance (AL1).
- **Refusal:**
  - the same key with a different body is refused;
  - the same key on `/invoices/A/send`, then on `/invoices/B/send`, is refused (AL2).
- **Atomicity:** a rolled-back first attempt leaves the key free.
- **Plants:**
  - inserting the record outside the request's transaction;
  - a handler that calls `withTenant` itself (AL3);
  - a plain `INSERT` in place of `ON CONFLICT` (AL4).
- **A provider callback** delivered twice creates one payment.

**Start-up and time limits**

- **Start-up:** missing configuration refuses to boot; a planted least-privilege violation refuses to boot;
  `/health/ready` fails with the database down and passes with a schema newer than the build.
- **Time limits:**
  - a transaction holding a quote's lock **while idle** is ended by `idle_in_transaction_session_timeout`, and the
    lock is released;
  - a second request waiting on that lock fails fast with the busy problem, not a 500 (AL5).

**Logs**

- Planted personal data and secrets never appear in the captured logs, through all four of AP9's routes.
- Plants: logging the raw URL; logging `error.message`.

**Jobs**

- A tenant job cannot read another tenant's rows, and a job enqueued in a rolled-back transaction never runs.
- The clean-up deletes what it should, counted.
- An expired lease is re-claimed once.
- Plant: a job kind run outside `withTenant`.

**Storage (B5)**

- No signed URL for another tenant's file, by id, key or guess.

## 5. What this does not do (Rule 21.4)

- It does not design any workflow's routes. Each workflow's design (A6-A13) lists its own, under these rules.
- It does not design the share page (A9), beyond giving it its own host and saying its token is never logged.
- It does not choose the storage, error-tracking or uptime services (A5), or the hosting set-up (A4) — including
  measuring the proxy hop count (AP8), which needs a deployed environment.
- It does not design the mobile app's offline replay (G1); AP6's retention is revisited there.
- It does not make the API public: API access for tenants is release 3 (I4).
- CSRF defences do not protect against a script running on pryvis.com itself. That is what the site's
  Content-Security-Policy and having no third-party scripts are for (A4, A9).
- Jobs are at-least-once, not exactly-once. Exactly-once is made from idempotent work, not promised by the queue.

## 6. Owner actions this design needs

- **Two DNS records at GoDaddy:** `api.pryvis.com` (AP1) and `share.pryvis.com` (AL10), alongside the sending-domain
  records already owed. Nothing else; every other choice here is code.

## 7. The independent read, and where each finding is answered

Read by Opus from `docs/briefs/2026-10-02-api-layer-read.md` at `3f3254a`. The reader ran a scratch PostgreSQL 16
cluster and a scratch Nest application, outside the repository, and confirmed the most serious findings by running
them.

- **Verdict:** "sound to build from after the named changes (AL1-AL13)".
- **Findings:** 18 — 12 major and 6 minor. Each is answered above.
- **Its own opinion of each recommendation:** agreed with all eleven in direction. It disagreed on the detail of
  AP3, AP6, AP8 and AP10, and each disagreement is adopted.

| Finding | Severity | Answered in |
|---|---|---|
| AL1 · the idempotency key's unique index lets null-user duplicates in (share routes) | major | AP6, the record's principal |
| AL2 · the fingerprint left out path parameters and the query | major | AP6, the fingerprint |
| AL3 · "the same transaction" impossible with today's `withTenant`; multi-transaction flows | major | AP6, one request is one transaction |
| AL4 · the concurrent duplicate's handling unspecified | minor | AP6, `ON CONFLICT DO NOTHING`; first in the lock order |
| AL5 · time limits do not bound an idle transaction; Prisma's defaults; unmapped codes | major | AP8 step 5; AP5's code table |
| AL6 · the worker cannot claim under row-level security; clean-up silently deletes nothing | major | AP10, the claim door, the lease and named doors |
| AL7 · refusals distinguishable only by message text | major | AP5, mapped by constraint name |
| AL8 · exception text in logs and responses carries data | major | AP5; AP9, logged by shape |
| AL9 · login CSRF | major | AP2, the Origin check on every unsafe request; JSON only |
| AL10 · the share page sharing the API's origin | major | AP1, `share.pryvis.com`; §6 |
| AL11 · strictness only at the top level; the `@wire` refusals lost | major | AP3, the walker and the whitelist; AP7 |
| AL12 · the route inventory and the creating-route check cannot work as written | major | AP4, items 1 and 3 |
| AL13 · provider callbacks fit neither AP6 nor AP7 | major | AP6, signed provider callbacks |
| AL14 · the cookie's encoding; the CSRF token mid-sign-in | minor | AP2 |
| AL15 · unmatched routes and oversize bodies | minor | AP5's filter; AP9 |
| AL16 · health readiness; existing routes; the jurisdiction's ceiling | minor | AP8 step 6; AP7 |
| AL17 · the proxy hop count assumed | minor | AP8 step 4; §5 |
| AL18 · GETs with side effects | minor | AP2, safe methods; AP4 item 3 |
