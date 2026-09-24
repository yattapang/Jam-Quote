# Design — multi-factor authentication for our own staff

**Status: Built** (2026-09-24). Approved by the owner, then built against this document; the
decisions and their reasoning are recorded in [ADR 0021](../adr/0021-staff-second-factor.md),
and what remains owed is listed there rather than left implied.

**Brief:** §18 step 1, Foundations — the last of the three gaps.
**Rules:** 1.2 (design from the product, not from what exists), 5, **5.1** (the staff baseline, which
calls this a launch blocker), 4, 8, 16.
**Threat model:** §4.4 — "one stolen staff password yields every tenant's data", the largest single
risk in the product.

---

## 1. The problem

Our admin console will be able to suspend a tenant, change pricing, read audit detail and
**impersonate a tenant**. One password stands between an attacker and every tenant's data, and
tenants cannot opt out of that risk — they did not choose our staff's password hygiene.

The asymmetry is the argument: a tenant losing their password loses their own data; a staff member
losing theirs loses *everybody's*. So staff are held to a different standard (Rule 5.1), and this
is the part of it that cannot be argued away with training.

## 2. Designing from the product, not from what exists (Rule 1.2)

The paused work left four tables — `mfa_totp`, `mfa_recovery_code`, `platform_capability`, and
`app_session.mfa_pending`. **Three of them are insufficient for what the product needs**, and this
design says so rather than working around them:

| What the product needs | What exists | Correction |
|---|---|---|
| A key that can be **rotated** without re-enrolling every staff member | `secret_ciphertext/iv/tag` with no key identifier — a rotation would make every secret undecryptable | Add a key id to the row. A new migration (Rule 6), not an edit |
| **Re-authentication** before impersonation or a price change (Rule 5.1) | `mfa_pending` only says "has this session ever passed a factor" | Add `mfa_verified_at`, so "recently" is answerable |
| A bounded number of guesses at a 6-digit code | nothing | Reuse the rate limiter, keyed per session and per user |
| Enrolment **before** first use, with no window of password-only access | nothing — a staff account today would simply work with a password | Enrolment state on the factor, and a resolver that refuses a capable user with no confirmed factor |

That is four corrections to work I wrote a day ago. Per Rule 1.2 that is the expected cost, not a
setback.

## 3. What this must achieve

1. **A user holding any platform capability cannot reach a protected route with a password alone** —
   not "should not". Refused by the same resolver that refuses a stale session.
2. **Enrolment happens before access**, so there is no window in which a staff account works with
   one factor.
3. **A code cannot be replayed** inside its own 30-second window.
4. **Guessing is bounded**: a 6-digit code is a million possibilities, which is nothing without a
   limit and plenty with one.
5. **A lost device is recoverable** without us disabling MFA over a phone call — which is how MFA
   is usually defeated in practice.
6. **Re-authentication is required** before impersonating a tenant or changing money.
7. **Every step is audited**: enrolment, verification failure, recovery-code use, reset.
8. **Secrets survive a database dump.** Encrypted at rest with the key outside the database.

## 4. The shape

### 4.1 TOTP, and why not the alternatives

**TOTP (RFC 6238)**: HMAC-SHA1, 30-second step, 6 digits, ±1 step accepted for clock drift.

- **Not SMS.** Sim-swap defeats it, it costs money per message, and it depends on a carrier — in
  Jamaica that is a real availability question as well as a security one.
- **Not email codes.** The email account is usually the thing an attacker already has.
- **Not WebAuthn/passkeys yet**, though they are strictly better: phishing-resistant, no shared
  secret. The reason is honest rather than principled — it needs a registration ceremony, an
  attestation policy and a fallback story, and it is worth doing *after* the console exists so the
  flow can be designed once. **Recorded as the intended direction**, with TOTP as the floor.
- **Hardware key preferred for impersonators** (Rule 5.1) — which is WebAuthn, so this design's job
  is to not stand in its way: the factor table is per-factor, so a second kind is a new row type
  rather than a rewrite.

Step and drift are conservative: ±1 step means a code is valid for at most 90 seconds, and
`last_used_step` makes it usable exactly once inside that.

### 4.2 The secret, and key rotation

AES-256-GCM, key from configuration, **never in the database** — so a dump alone yields nothing.
The honest limit, as before: an attacker holding both the database *and* the environment has the
secrets, and there is no KMS to fix that. It is a meaningfully harder bar than one dump.

**A key id is stored beside the ciphertext.** Without it, rotating the key means every enrolled
secret becomes undecryptable and every staff member re-enrols — which in practice means the key
never gets rotated, which is how "encrypted at rest" quietly becomes "encrypted with a key we can
never change". Two keys may be live at once: new secrets use the current key, old rows decrypt with
the key they name, and a background re-encryption is possible later without downtime.

### 4.3 Enrolment, before access

1. A staff account is created and granted capabilities (audited).
2. The account is **unusable** until a factor is confirmed: the resolver refuses a user holding any
   capability with no confirmed `mfa_totp`.
3. Enrolment issues a secret, returns a provisioning URI for an authenticator app, and **requires a
   valid code to confirm**. An unconfirmed secret grants nothing — it means a secret was issued and
   may never have reached a phone.
4. Confirmation generates **ten recovery codes, shown once**, and records an audit entry.

**There is no self-service "disable MFA".** Losing a factor is handled by recovery codes, and if
those are gone too it is a re-enrolment performed by another staff member holding a specific
capability, audited, with the user's sessions revoked. A support process that can remove MFA over a
phone call is the standard way MFA is defeated.

### 4.4 Sign-in, in two steps

Password → **a session with `mfa_pending = true`**, which the resolver refuses for every protected
route → verify a code → `mfa_pending` cleared and `mfa_verified_at` stamped.

The pending session is deliberate rather than holding state elsewhere: it means the second step
cannot be skipped by a client that simply does not call it, and an abandoned half-login expires like
any other session.

**Attempts are limited** by the existing token-bucket limiter: per user (a handful of codes) and per
IP, checked *before* the HMAC. After the user's bucket empties, the pending session is **revoked**
rather than merely refused, so a guessing run has to start over from the password.

### 4.5 Re-authentication for dangerous actions

`mfa_verified_at` on the session, and actions that require it within a short window (proposed: **15
minutes**): starting an impersonation, changing a plan or price, changing another person's access,
reading unredacted money detail.

Not a blanket timeout — a blanket one either interrupts ordinary work or is too long to matter. The
point is that a walked-away-from laptop cannot start an impersonation.

### 4.6 Tenants

MFA is **available** to tenants and **not** mandatory (Rule 5). The same factor table serves them;
only the enforcement differs — capability-holders are required, tenant users are offered. Building
it for both now costs nothing extra and avoids a second implementation later; the tenant-facing
*flow* is a UI concern for when the app has screens.

### 4.7 Audit

Every one of these writes an entry (ADR 0020), all of them `platform_staff` acting on a tenant where
one is implicated: enrolment confirmed, factor reset by another person, recovery code used,
verification failed repeatedly, session revoked for guessing, impersonation started with the
re-authentication that permitted it.

**A verification failure entry must not record the code.** Obvious, and worth writing down because
the payload is exactly where a helpful debug field would put it.

## 5. How it will be proved

| Plant | Must fail |
|---|---|
| The resolver stops refusing a capability-holder with no confirmed factor | the enforcement test |
| The resolver stops refusing `mfa_pending` sessions | the two-step test |
| `last_used_step` is not written | the replay test (same code twice) |
| The drift window widens beyond ±1 step | the drift test |
| The attempt limit is removed | the guessing test (bucket empties, session revoked) |
| A recovery code is accepted twice | the single-use test |
| Recovery codes stored unhashed | the storage test |
| The secret is stored without encryption, or with no key id | the at-rest test |
| `mfa_verified_at` is ignored by a sensitive action | the re-authentication test |
| A TOTP implementation that disagrees with RFC 6238 | the **published test vectors** |

That last one matters: an authenticator app is the other half of this protocol, and a private
implementation that "works" against its own code generator would fail against Google Authenticator.
RFC 6238's vectors are the only honest check.

## 6. Trade-offs

- **TOTP over WebAuthn** — weaker (phishable), available now, and does not block the better answer.
- **A shared secret** means we hold something that grants access; encryption at rest and a key
  outside the database is the mitigation, and its limit is stated.
- **±1 step (90 seconds)** accepts a wider replay window than ±0 in exchange for tolerating clock
  drift on a phone. `last_used_step` closes the replay inside it.
- **Recovery codes are a weaker factor by design** — ten long-lived strings. They are the price of
  not having a phone-call reset path, which is worse.
- **Mandatory for staff means a staff account can be locked out.** Accepted deliberately: the
  alternative is a reset path an attacker can use, and there is more than one of us.

## 7. Scope

**In:** the TOTP implementation with RFC vectors; encryption with a key id; enrolment, confirmation
and recovery codes; the two-step sign-in; resolver enforcement; attempt limiting; `mfa_verified_at`
and a re-authentication check; audit entries; three corrective migrations; tests and plants; an ADR.

**Out, and owed:** WebAuthn; the admin console and any UI; the tenant-facing enrolment screen; a
second-staff-member reset flow (it needs a capability system with more than one staff account to be
meaningful); and key rotation *operations* — the schema and code will support two live keys, but
the runbook is an ops artefact for when there is an ops process.
