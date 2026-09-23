# 0014 — Password hashing: Node's built-in scrypt, with parameters stored in the hash

**Date:** 2026-09-23
**Status:** Accepted
**Relates to:** ADR 0013 (sessions), Rule 5, Rule 10 (portability, free tiers)

## Context

Sign-in needs a password hash. The choice is load-bearing and awkward to reverse: every stored
hash is in the chosen format, so changing later means either a migration that cannot recompute
hashes (the plaintext is gone) or a rehash-on-next-login path that must be designed in from the
start.

Three constraints shape it:

1. **OWASP's first choice is argon2id**, with scrypt named as an acceptable alternative where
   argon2id is unavailable.
2. **Rule 10 wants standard, portable runtimes.** The API deploys to Render's free tier today
   and must move to any container host without a rebuild. A native module means a compiler in
   the build image and a per-platform binary — on Windows for development and Linux for
   production.
3. **Memory is genuinely scarce.** The free instance has 512 MB for the whole process. A
   memory-hard hash that is correct in theory and OOMs under two concurrent sign-ins is a
   denial of service we built ourselves.

## Decision

**Node's built-in `crypto.scrypt`**, with these parameters:

| Parameter | Value | Why |
|---|---|---|
| `N` (cost) | 65,536 (2^16) | ~67 MB per hash |
| `r` (block size) | 8 | The standard value; memory is `128 · N · r` |
| `p` (parallelism) | 1 | Node's scrypt is synchronous per call; parallelism buys nothing here |
| `maxmem` | 96 MB | **Required.** Node defaults `maxmem` to 32 MB and *throws* above it, so omitting this makes the chosen `N` fail at runtime rather than fall back |
| salt | 16 random bytes, per password | |
| output | 32 bytes | |

**The stored format embeds the parameters:**

```
scrypt$65536$8$1$<base64 salt>$<base64 hash>
```

So a hash carries the recipe that produced it. Raising the cost later is then a
**rehash-on-successful-verify** — the only moment the plaintext exists — rather than a
migration that cannot be written. `needsRehash()` is part of the module's surface, and sign-in
calls it.

**Verification is timing-safe** (`crypto.timingSafeEqual`), and `verify` **returns false rather
than throwing** on a malformed or unknown-algorithm hash, so a corrupt row is a failed login
and not a 500 that tells an attacker something interesting.

**One password policy, in one place:** minimum 12 characters, maximum 128, and **never
trimmed**. Trimming silently changes the password a user typed, so a password ending in a space
would be accepted at sign-up and rejected at sign-in — a defect the previous application's
review register recorded.

## Alternatives considered

**argon2id via `node-argon2`.** OWASP's first choice. Rejected for now: it compiles native code,
which puts a toolchain in the build image, ties the artefact to a platform, and is exactly the
kind of provider-shaped dependency Rule 10 exists to avoid.

**argon2id via `@node-rs/argon2`** (prebuilt binaries, no compiler). The strongest contender.
Rejected for now on dependency risk rather than quality: it resolves a different optional
binary package per platform, and a missing or mismatched one fails at *install* time on whatever
host we move to next. Revisit deliberately — see below.

**argon2id in WebAssembly** (`hash-wasm`). Portable, no native build. Rejected: slower per hash
at equivalent settings, and it puts the credential path on a less-scrutinised implementation
than OpenSSL's.

**bcrypt.** Rejected on a specific, concrete flaw: it silently truncates at 72 bytes, so a long
passphrase is weaker than it looks and two different long passwords can collide. It is also not
memory-hard.

**OWASP's floor of `N` = 2^17 (128 MB).** Rejected *for now*, with the reason stated plainly
rather than hidden: two concurrent sign-ins at 128 MB each on a 512 MB instance is an
out-of-memory risk, and an API that falls over is not more secure. 2^16 is one notch below the
recommendation and far above what an attacker faces with an unsalted or fast hash. The
parameters live in the hash precisely so this can be raised the moment the instance is paid for.

## Consequences

- **This is deliberately not the strongest available option**, and Rule 17 says to state that.
  It is a defensible one, chosen for portability and a 512 MB budget, with the upgrade path
  built in rather than promised.
- **Two triggers for revisiting**, both written down so they are not forgotten: moving to a paid
  instance (raise `N` to 2^17) and the first real user growth (reassess argon2id via prebuilt
  binaries, since by then the deployment target is known and stable).
- A sign-in costs ~67 MB and roughly 100–200 ms of CPU. That is the intended cost, and it makes
  rate limiting on the sign-in route necessary rather than optional — **owed, and not built
  yet**.
- `needsRehash()` must actually be called on successful verify, or the upgrade path exists only
  on paper. Sign-in does call it, and there is a test that fails if it stops.
- No pepper. A pepper only helps if it lives somewhere the database dump does not, and we have
  no key-management story yet; adding one now would be ceremony, not defence. Recorded as a
  possible improvement once secrets management is real.
