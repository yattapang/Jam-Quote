# Design: the API layer — contract, sessions, errors, idempotency, validation, start-up, jobs and storage

**Status: DRAFT, for the owner's approval.** Build plan step A2 (`docs/BUILD-PLAN.md`). After approval: an
independent read, a closing check, then the owner's sign-off ticks A2. Nothing here is built until step B2 (and
B5 for storage) begins.

Date: 2026-10-02 · **Implements the direction of** ADR 0030 decision 2 (REST, a generated OpenAPI contract with a
contract test, cookie sessions with CSRF, RFC 9457 errors, idempotency, one validation boundary, start-up wiring)
· **Builds on** ADR 0012 (the API's structure and the `@wire` contract), ADR 0013 (default-deny, sessions re-resolved
every request), ADR 0016 (rate limiting), ADR 0011 (money as integer minor units at the boundary), ADR 0026 (the
API always on at launch) and `docs/design/api-bootstrap.md` (the composition root, which today binds a session
reader that reads nothing) · **Answers** `docs/PLANNING-AUDIT.md` §7 item 2, including brief §11's "background
jobs must carry tenant context explicitly" and "scope … file storage paths and signed URLs, cache keys" ·
**Delegation (Rule 16.5):** Opus — security architecture.

---

## 1. The problem, in one paragraph

The API has its guard, its tenancy seam, sign-in, MFA, rate limiting and a least-privilege check, each tested — and
**no way for a request to reach any of it**. `app.module.ts` binds a session reader that reads nothing and a resolver
that refuses everyone, on purpose (`api-bootstrap.md`, "Out, on purpose"). There is no `main.ts`, no cookie, no CSRF
defence, no error format, no request validation, no OpenAPI document (the contract generator says so itself: "there
is no OpenAPI document yet, because there are no routes yet"), no idempotency, and no rule for how a background job
or a stored file carries its tenant. Every workflow from C1 onward needs all of it. This design decides it once, so
each workflow adds routes rather than re-deciding transport.

## 2. The decisions

Each has options and a recommendation, **(rec)**.

### AP1 · Where the API lives, relative to the web app

The web app and the public site are on Vercel at pryvis.com; the API is on Render. A browser treats a cookie from a
different *site* as third-party, and browsers are blocking those.

| Option | For | Against |
|---|---|---|
| **A. (rec) The API at `api.pryvis.com`** — a custom domain on the API host, one DNS record at GoDaddy | Same *site* as pryvis.com, so the session cookie is first-party; the API stays one service in one place; no extra hop | CORS must be configured (exactly one allowed origin, AP8); one owner action (the DNS record, alongside the sending domain already owed) |
| B. Proxy `/api` through the web app (Next.js rewrites) | Same origin, no CORS | Every request takes a second hop through Vercel's functions — their timeouts, their logs holding request bodies, and Vercel becoming a processor of everything the API sees; the share page (served by the API, R1.21a) would still be elsewhere |
| C. The host's default domain (`*.onrender.com`) | Nothing to set up | The cookie is third-party: blocked by Safari now and others progressively. Not viable |

### AP2 · Sessions and CSRF

- **The web session is a cookie** set by the API: name `__Host-pryvis_session`, `HttpOnly`, `Secure`, `Path=/`,
  no `Domain` (the `__Host-` prefix makes the browser enforce all three), **`SameSite=Strict`**. Its value is the
  session secret; the database holds only its hash (privilege model D2, `session-token.ts`). Lifetime and
  revocation are ADR 0013's, unchanged. Strict is safe here because the browser only ever calls the API from
  pryvis.com's own pages, which are same-site; a link in an email opens the web app, never the API.
- **CSRF, two layers (rec)**, because "same-site" includes every subdomain of pryvis.com, and one taken-over
  subdomain would otherwise be inside the fence:
  1. **A CSRF token** on every state-changing request (`POST`, `PUT`, `PATCH`, `DELETE`) that authenticates by the
     cookie, in an `X-CSRF-Token` header. It is an HMAC of the session's hash under a server key, so it needs no
     storage and dies with the session. The web app receives it in the body of the session response and keeps it in
     memory, never in storage.
  2. **An `Origin` check**: such a request must carry `Origin: https://pryvis.com` (the configured web origin)
     exactly. A missing `Origin` on a cookie-authenticated unsafe request is refused.
  Refusals use ADR 0013's one sentence; the reason goes to the log.
- **The mobile app (later, G2)** sends the same secret as `Authorization: Bearer …`. A request that carries a
  bearer header is not cookie-authenticated, needs no CSRF token (a forged cross-site request cannot set that
  header without a CORS preflight we refuse), and a request carrying **both** is refused — two identities in one
  request is a confusion an attacker would use.
- **Share-link routes** (`@ShareTokenRoute`, ADR 0013) carry no ambient credential, so CSRF does not apply; their
  token is a credential and is handled as one in AP9 (never logged).
- **The `SessionReader` binding** in `app.module.ts` is replaced by one that reads the cookie or the bearer header
  as above, and the `CallerResolver` binding by the already-tested `DbCallerResolver`. The test that asserts today's
  refusal is replaced by tests of the real path (§4).

### AP3 · One schema per route — validation, types and the contract from one definition

ADR 0030 asks for a contract "generated from the code" and "validation at one boundary that rejects unknown fields".
Whatever defines a request must also be what checks it, or the two drift — the exact defect ADR 0012 was written
against.

| Option | For | Against |
|---|---|---|
| **A. (rec) Zod schemas per route**, in each module's `.dto.ts`; one Nest pipe validates params, query and body against them; responses are passed through their schema too; the contract package emits OpenAPI 3.1 and the client types from the same schemas | One definition gives validation, the server's types, the client's types and the OpenAPI document; `.strict()` rejects unknown fields; schemas are plain TypeScript values, usable by the web app and the mobile app; no decorators to forget | Two new libraries (`zod`, and `@asteasolutions/zod-to-openapi` to emit the document), recorded in the SBOM with this reason; the `@wire` generator is rewritten to read schemas instead of interfaces |
| B. `class-validator` DTO classes with `@nestjs/swagger` | Nest's documented path | Validation, types and documentation come from decorators on classes; a missing decorator silently drops a field from validation or the document; classes cannot be shared with clients cleanly; `whitelist` behaviour depends on global options being right |
| C. Keep `@wire` interfaces, add a runtime checker generated from types | Keeps today's generator | A build step generating validators from types is a third moving part; still needs a separate OpenAPI emitter |

**Responses go through their schema, always (rec).** In production the response is parsed by its schema with unknown
keys **stripped**, so a field added to a database row (a hash, an internal flag) cannot reach a client because
someone returned the row. In tests the same parse runs in **strict** mode and fails on an extra key, so the strip
never hides a mistake. This is the API's output boundary, matching the input boundary.

### AP4 · The OpenAPI document and its contract test

- The contract package (`packages/contract`) emits **`openapi.json`** (OpenAPI 3.1) and the client types, both checked
  in, from the route schemas of AP3. The existing drift test keeps its job: CI fails if the checked-in output is
  stale.
- **The contract test (CI)** boots the real application (as `app.module.test.ts` does) and:
  1. compares the **route inventory** — every controller route Nest registers, which `route-protection-coverage`
     already enumerates — with the operations in `openapi.json`. A route without an operation, or an operation
     without a route, fails, by name;
  2. checks every operation declares its protection (`Authenticated`, `ShareTokenRoute` or `PublicRoute`, ADR 0013)
     and that the document says the same;
  3. checks every operation declares its error responses as problem details (AP5), and every creating operation
     its `Idempotency-Key` header (AP6);
  4. runs each module's request tests with **strict response validation** on (AP3), so a response that does not
     match its declared schema fails the test that produced it.
- The document is **published nowhere** in R1: it is the clients' contract and a review artefact, not a public API
  (API access is release 3, I4).

### AP5 · Errors — RFC 9457 problem details, leaking nothing

- Every error response is `application/problem+json`: `type` (a stable URI, `https://pryvis.com/problems/<slug>`),
  `title` (a fixed sentence per type), `status`, `detail` (a plain-English sentence written for the person on the
  screen, never an exception message), and `instance` (the request id, AP9). Clients branch on `type`, never on text.
- **Validation errors** add `errors: [{ path, code }]` — the field path and a code from a closed list. **The value
  sent is never echoed**: an echoed value is how a log or a screenshot ends up holding someone's data.
- **The problem types are a closed list** in the shared core, each with its status and title, and each listed in
  `openapi.json`. A new error is a new entry, reviewed like any other contract change.
- **Anything unexpected** is a 500 with the generic type and the request id; the exception goes to the log (without
  personal data, AP9). Database errors, stack traces, SQL, constraint names and table names never reach a response.
  The database's own refusals that a user can cause (the ceiling, the over-credit check, a stale version) are mapped
  to their own problem types by the module that expects them; any other database error is the generic 500.
- **Kept from earlier decisions:** an authentication refusal is ADR 0013's one sentence ("Please sign in again"),
  whatever the reason; being rate-limited is ADR 0016's distinct message, with `Retry-After`.

### AP6 · Idempotency — a creating request is safe to send twice

ADR 0030: "an idempotency key on every request that creates money or a document". A contractor at a gate on mobile
data taps "Send invoice", the screen hangs, they tap again; without this, the client receives two invoices and two
numbers are burned from a gapless series.

- **Which routes:** every route that creates a document, a number, money or a message — seal, number, invoice, credit
  note, variation, payment, allocation, refund, withholding, accept, decline, and send. The list lives with the routes
  (a flag on the route's declaration), and the contract test (AP4) refuses a creating route without it.
- **The header:** `Idempotency-Key`, a UUID the client makes per user action (not per attempt). Required on those
  routes; a request without it is refused with its problem type.
- **The record:** a tenant-scoped table under row-level security, unique on tenant, user and key, holding a
  fingerprint of the request (a hash of the method, the route template and the canonical body), and the response's
  status and body.
- **The record is inserted in the same transaction as the work it guards (rec).** The insert comes first; a
  concurrent duplicate blocks on the unique index until the first commits, then finds the record and **replays its
  response**. If the first rolls back, so does its record, and the retry runs fresh. So there is no "in progress"
  state to expire, and no window where the work committed but the record did not.
- **The same key with a different request** (a different fingerprint) is refused (422), never replayed — a key
  reused for a different invoice must not return the first invoice.
- **Retention:** records are kept **7 days**, then deleted by a job (AP10). Stored response bodies hold tenant data,
  so they are under row-level security like the rest, and they are not kept longer than retries need. The mobile
  outbox (G1) may need longer; its design revisits this, and domain keys such as a variation's `client_reference`
  (R1.22g) already cover replay at the row.

### AP7 · The validation boundary, and what the wire carries

- **Unknown fields are refused** (AP3's strict schemas), in params, query and body. Refusing beats ignoring: an
  ignored field is a client that believes it set something.
- **Bodies are JSON only** (`Content-Type: application/json`), at most **100 KB**; file uploads have their own route
  kind and limits (AP11, B5).
- **Money** is an integer number of minor units, validated against ADR 0011's one ceiling from the shared core, with
  the currency beside it where the route does not fix it. Never a decimal, never a string of digits with a point.
- **Time:** an instant is an ISO 8601 UTC string; a calendar day is `YYYY-MM-DD` (Rule 3 distinguishes them). Never
  a JavaScript `Date` on the wire (the `@wire` generator already refuses it).
- **Identifiers** are UUIDs, validated as such before any query runs.
- **Lists** are cursor-paginated, default 50, at most 100 per page; an unbounded list endpoint is refused by review.
- **Versioning:** every route is under `/v1`. A breaking change is a new version, never a silent change; R1 expects
  none.
- **A tenant id is never accepted from a request** (`tenant-context.ts`, "Never does"): the schemas of tenant-scoped
  routes have no tenant field, and the contract test fails any that does.

### AP8 · Start-up — the application refuses to start unsafe

`main.ts`, in this order; any failure stops the process with a message naming what is missing, never a secret's
value:

1. **Configuration** is read once and validated by a schema: the database URLs, `WEB_ORIGIN`, the CSRF key, the MFA
   keys (ADR 0021), the email and payment keys as each workflow arrives. A missing or malformed value refuses to boot
   (the pattern the old API already had for `JWT_SECRET`).
2. **The least-privilege check** (`least-privilege.ts`, `assertLeastPrivilege`) runs against the database; any
   violation refuses to boot. It is written and tested and not yet wired; this wires it.
3. **The composition root** binds the real session reader (AP2) and `DbCallerResolver`; the global
   `DefaultDenyGuard` stays bound by `APP_GUARD`, unchanged.
4. **Transport:** `trust proxy` set to exactly the host's one proxy hop, so the client IP the rate limiter reads
   (ADR 0016) is the caller's and not forgeable by a header; CORS allowing **exactly** `WEB_ORIGIN`, with
   credentials; security headers on every response (`Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: no-referrer`, a restrictive `Content-Security-Policy` — the share page's own policy is A9's);
   the body-size limit of AP7.
5. **Time limits:** each transaction runs with a `lock_timeout` and a `statement_timeout` (rec: 5 s and 10 s), so a
   stuck request cannot hold a quote's money lock (`new-app/CLAUDE.md`, "Financial writes") for longer than that; a
   lock timeout is answered with a "busy, try again" problem, which is safe because creating routes are idempotent
   (AP6).
6. **Health, both `@PublicRoute` with their reasons:** `/health/live` answers if the process runs; `/health/ready`
   answers only if the database is reachable and the schema is at the version this build expects. Neither says
   anything else — no versions, no hostnames, no counts.
7. **Shutdown** stops accepting, lets in-flight requests finish within the host's grace period, and closes the pool.

### AP9 · Logs and request ids — nothing personal, nothing secret

- Every request gets a **request id** (generated; an incoming one is not trusted), returned in a `Request-Id` header
  and as `instance` in any problem (AP5), so a tenant reporting a problem can quote it (Rule 25's feedback loop).
- **One structured line per request**: the request id, the **route template** (`/v1/share/:token`, never the actual
  path — a share token in a path is a credential), the method, the status, the duration, and the tenant id and user
  id when known (identifiers, not personal data). **Never** a body, a query string, a header value, a cookie, an
  email address, a name, a phone number or an IP address in clear. The IP is needed by the rate limiter, not the log.
- **A test enforces it**: requests carrying planted personal data and secrets through every route kind are made, and
  the captured log output is searched for them. Plant: logging the raw URL — the test fails on the share token.
- Error tracking (a service chosen in A5) receives the same redacted shape and nothing more.

### AP10 · Background jobs carry their tenant

Brief §11: "Background jobs must carry tenant context explicitly." Jobs are coming — sending messages (C1),
reminders (D2), the nightly reconciliation (D4), idempotency clean-up (AP6), lapse handling (D6).

| Option | For | Against |
|---|---|---|
| **A. (rec) A job table in our own PostgreSQL**, claimed with `FOR UPDATE SKIP LOCKED` | No new service (Rule 18); a job is enqueued **in the same transaction** as the change that causes it, so a sent-invoice email can never be queued for an invoice that rolled back, nor lost for one that committed; the table is under row-level security like everything else | We write and test a small worker (claiming, retries with back-off, a dead-letter state) |
| B. A queue library with its own schema (for example pg-boss) | Retries and scheduling built in | Its tables are not under our row-level security or our least-privilege check, and job payloads hold tenant data |
| C. A hosted queue (Redis, SQS) | Scale | A new service and a new processor of tenant data, for volumes Postgres handles easily; a job cannot share the business transaction |

**The rule, whichever option:** a job row carries `tenant_id` as a column (never only inside its payload); the
worker runs every tenant job inside `withTenant(job.tenant_id)` and nowhere else; a job with no tenant is a
**platform job**, allowed only for job kinds declared as platform jobs with a written reason — the same shape as
`@PublicRoute(reason)`. A test enqueues a job for tenant A and proves it cannot read tenant B's rows; a planted job
kind that runs outside `withTenant` fails it. Payloads hold identifiers, not copies of personal data.

### AP11 · Files, signed URLs and caches are tenant-scoped

The storage provider is chosen in A5; these rules hold for any provider:

- **Object keys are made by the server**, never from a file name or any client input:
  `tenants/<tenant_id>/<kind>/<uuid>`. The tenant segment comes from the caller's session.
- **A signed URL is issued only after the row that owns the file is read under row-level security** — so a tenant
  can only ever get a URL for a file their own row points to. It expires in **5 minutes** (rec), is for one object
  and one method, and is never logged (AP9).
- **Uploads** go through the API's own route kind (size and type checked, then the malware scan of B5) — a client
  never chooses where a file lands.
- **Caches:** R1 has no shared cache. If one is added, every key begins with the tenant id, and its design says so;
  a cache is a store and the same isolation rules apply.
- **A cross-tenant test** proves tenant B cannot obtain a signed URL for tenant A's file by its id, by its key, or by
  guessing a key.

## 3. What gets built (step B2, and B5 for AP11)

1. `main.ts` and the start-up order of AP8, with configuration validation and the least-privilege check wired.
2. The session reader for cookie and bearer, the CSRF token and `Origin` check, and the real resolver bound (AP2).
3. The schema pipe and response serialisation (AP3); the contract generator rewritten to read schemas and emit
   `openapi.json`; the contract test (AP4).
4. The problem-details filter and the closed list of problem types (AP5).
5. The idempotency table (a new migration), its interceptor and its clean-up job (AP6).
6. Request ids and the redacting logger, with the log test (AP9).
7. The job table (a new migration), the worker and the platform-job declaration (AP10).
8. In B5: the storage port and its rules (AP11).
9. Documents: `new-app/CLAUDE.md` (how to add a route: schema, protection, idempotency flag), the threat model's rows
   for CSRF, session transport, logging and jobs moved to built with their evidence, and the SBOM's two libraries.

## 4. Tests, each proved with a planted defect

- **Sessions:** a cookie-authenticated request with a valid session reaches a route; without the cookie it is
  refused. Plant: the reader returning a session for a revoked secret — refused by the resolver, as ADR 0013 says.
- **CSRF:** an unsafe cookie request without the token, with a token from another session, or with a wrong
  `Origin`, is refused; with both it succeeds. A request carrying cookie and bearer is refused. Plants: skipping the
  `Origin` check; accepting any token.
- **Validation:** an unknown field is refused, naming its path and not echoing its value; a money value above ADR
  0011's ceiling is refused; a tenant id field is refused. Plant: a non-strict schema.
- **Responses:** a handler returning a database row with an extra field — stripped in production mode, failing in
  test mode. Plant: removing the response parse.
- **Contract:** a route with no operation, and an operation with no route, each fail by name; a creating route
  without the idempotency flag fails. Plant: a route added and not documented.
- **Errors:** a thrown database error returns the generic problem with no SQL, constraint or table name in it.
- **Idempotency:** the same key twice returns the same response and creates one row and burns one number — also
  under concurrency on real PostgreSQL (race suite); the same key with a different body is refused; a rolled-back
  first attempt leaves the key free. Plant: inserting the record after the work, outside the transaction.
- **Start-up:** missing configuration refuses to boot; a planted least-privilege violation refuses to boot;
  `/health/ready` fails with the database down.
- **Time limits:** a transaction holding a quote's lock beyond the lock timeout makes a second request fail fast
  with the busy problem, not hang.
- **Logs:** planted personal data and secrets never appear in captured logs. Plant: logging the raw URL.
- **Jobs:** a tenant job cannot read another tenant's rows; a job enqueued in a rolled-back transaction never runs.
  Plant: a job kind run outside `withTenant`.
- **Storage (B5):** no signed URL for another tenant's file, by id, key or guess.

## 5. What this does not do (Rule 21.4)

- It does not design any workflow's routes; each workflow's design (A6-A13) lists its own, under these rules.
- It does not design the share page (A9) beyond saying it is served by the API and its token is never logged.
- It does not choose the storage, error-tracking or uptime services (A5), or the hosting set-up (A4).
- It does not design the mobile app's offline replay (G1); AP6's retention is revisited there.
- It does not make the API public: API access for tenants is release 3 (I4).
- CSRF defences do not protect against a script running on pryvis.com itself; that is what the site's
  Content-Security-Policy and having no third-party scripts are for (A4, A9).

## 6. Owner actions this design needs

- **One DNS record at GoDaddy** for `api.pryvis.com` (AP1), alongside the sending-domain records already owed.
  Nothing else: every other choice here is code.
