# 0016 — Rate limiting: token buckets in Postgres, two dimensions, checked before the hash

**Date:** 2026-09-23
**Status:** Accepted
**Relates to:** ADR 0014 (hashing cost), ADR 0015 (self-service sign-up), Rules 5, 10, 18

## Context

Sign-in deliberately costs about **67 MB and 150 ms** (ADR 0014) and is reachable without
credentials. That makes the defence a lever: a few hundred concurrent attempts would exhaust a
512 MB instance without guessing a single password. The same applies to every unauthenticated
endpoint that does real work — registration, password reset, and anything that sends mail.

The previous application had no rate limiting at all, which the Phase 0 audit recorded.

## Decision

**1. Token buckets, not fixed windows.** A fixed window ("5 per minute") permits ten attempts
across a boundary — five at 11:59:59 and five at 12:00:00 — which is exactly when a script
arrives. A bucket refills continuously, so there is no boundary to aim at, and it tolerates the
small honest burst of a person mistyping twice.

**2. State in Postgres, not in process memory.** In-memory is faster and wrong twice here: the
free instance sleeps and restarts often, so the counter is cleared by an event an attacker can
cause by waiting; and with two instances each enforces its own limit, so the real limit is
whatever we wrote times the instance count. Postgres is already a dependency (Rule 10, Rule 18 —
no new provider-shaped service without a reason) and the volume on these endpoints is tiny.

**3. One atomic SQL statement.** Refill, check and decrement happen in a single
`INSERT … ON CONFLICT … WHERE`, so concurrent callers serialise on the row. Read-then-write would
let two requests both read "one token left" and both spend it.

**4. Two dimensions, and the order matters.** Per **IP** (capacity 30, one token per 10s) is
checked first, because it is the limit protecting the machine — a flooding host is cut off before
any per-account work happens. Per **email** (capacity 10, one token per 30s) is checked second,
because per-IP limits do not bite on a distributed attack against one account.

**5. The email is hashed, never stored.** Otherwise this table becomes a list of every address
ever typed into our login form: personal data we have no reason to keep (Rule 5), and a mailing
list for whoever gets a dump. The hash is unsalted, so it is reversible by guessing a known
address — it defeats casual disclosure, not a determined attacker, and that limit is stated
rather than implied.

**6. Time is injected, not read from `now()`.** Refill is proved in milliseconds by moving a test
clock. A limiter whose refill can only be observed by sleeping is one nobody tests properly.

**7. A success clears the address's bucket, but not the IP's.** Yesterday's fumbling must not
count against today. The IP bucket stays, because one valid account behind an address must not
buy unlimited attempts at every other account behind it.

**8. Being rate-limited is told to the caller in a distinct message.** A person who has mistyped
six times needs to know that waiting helps, or they conclude the product is broken. It leaks
nothing, because the limit is consumed for unknown addresses too — so "please wait" never
confirms an account exists.

## Known weakness, accepted rather than solved

**An attacker can deliberately delay one user's sign-in** by making failed attempts against their
address from anywhere. A test disproved an earlier claim of mine that checking the IP limit first
prevented this; it does not, and no per-account limiter can. The choice is between an account that
can be guessed at indefinitely and an account that can be delayed, and the delay is the better
failure.

It is kept **short** rather than eliminated: one token returns every thirty seconds, so a targeted
user waits seconds, not hours. There is a test that holds that property, and it is the reason there
is no "lock the account after N failures" rule — a hard lockout turns a nuisance into an outage
somebody else controls.

Neither dimension stops a large botnet with many addresses attacking many accounts. That needs
help above the application — a CDN or WAF — and is recorded here rather than pretended away.

## Alternatives considered

**Redis.** The conventional choice, and genuinely better for high-volume paths. Rejected for now:
it is a new service to provision, pay for, secure and record in the service register, for
endpoints that see a handful of requests a minute. **The trigger for revisiting is a limiter on a
high-volume authenticated read path**, where a database write per request would be the wrong
shape.

**A limiter in front of the app** (CDN, WAF, reverse proxy). Complementary rather than
alternative, and the right answer for volumetric attacks. Rejected as the only mechanism: it
cannot see an email address, so it cannot do the per-account dimension, and it is not portable
across hosts (Rule 10).

**Counting only failures, not attempts.** Rejected: it means an attacker who can guess correctly
sometimes is never limited, and it makes the limiter's behaviour depend on the outcome of the
expensive work it is supposed to be protecting.

**Hard account lockout after N failures.** Rejected: it converts a guessing attempt into a
denial-of-service against the account owner, and generates support calls that a thirty-second
delay does not.

## Consequences

- One extra write per sign-in attempt, on a table with a primary-key upsert. Acceptable; it is
  cheaper by orders of magnitude than the hash it protects.
- **`rate_limit_bucket` grows until housekeeping exists.** An absent bucket is a full one, so
  nothing breaks and there is no correctness issue — but the table needs a periodic delete of old
  rows, and that is **owed**.
- The limiter must be given to `SignInService` as a **required** constructor argument. An optional
  one is an argument somebody eventually omits, and the failure would be silent.
- **Registration and password reset are not limited yet**, because neither exists. Both must ship
  with limits, and ADR 0015 already names registration's other defences.
- Retry-After is returned from the service, but **nothing sets the HTTP header yet** — there is no
  HTTP layer. Wiring it is part of the transport step.
- Trusting a client-supplied IP is a hazard once a proxy is in front of the app: `X-Forwarded-For`
  is caller-controlled unless the proxy is known and the header is taken from the right position.
  **The transport layer must resolve the IP, not the service**, and that is where it will be
  tested.
