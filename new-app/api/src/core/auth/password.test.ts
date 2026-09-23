/**
 * Does the password module do what ADR 0014 claims?
 *
 * Pure functions over real crypto — no mocks, because a mocked hash proves nothing
 * about a hash. These are slower than typical unit tests (each scrypt call is ~67 MB
 * and 100–200 ms by design); that cost is the feature.
 *
 * WHAT IT DOES NOT PROVE
 *
 * - Nothing about resistance to a real cracking rig. That is a property of the
 *   parameters, argued in ADR 0014, not something a test can demonstrate.
 * - Not that the comparison is immune to timing analysis. It asserts
 *   `timingSafeEqual` is what does the comparing; measuring timing in a test runner
 *   would be flaky theatre.
 * - Nothing about rate limiting, which is what actually bounds guessing. Owed.
 */
import { describe, expect, it } from "vitest";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SCRYPT_PARAMS,
  WeakPasswordError,
  assertPasswordAllowed,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "./password.js";

const GOOD = "correct horse battery staple";

describe("hashing and verifying", () => {
  it("accepts the right password and rejects a wrong one", async () => {
    const stored = await hashPassword(GOOD);

    expect(await verifyPassword(GOOD, stored)).toBe(true);
    expect(await verifyPassword("correct horse battery stapl", stored)).toBe(false);
    expect(await verifyPassword(GOOD.toUpperCase(), stored)).toBe(false);
  });

  it("stores the algorithm and cost parameters in the hash", async () => {
    // This is what makes the upgrade path possible at all (ADR 0014).
    const stored = await hashPassword(GOOD);
    const [algorithm, N, r, p] = stored.split("$");

    expect(algorithm).toBe("scrypt");
    expect(Number(N)).toBe(SCRYPT_PARAMS.N);
    expect(Number(r)).toBe(SCRYPT_PARAMS.r);
    expect(Number(p)).toBe(SCRYPT_PARAMS.p);
  });

  it("gives two identical passwords two different hashes", async () => {
    // A per-password salt: without it, equal passwords share a hash, which tells an
    // attacker with the dump which accounts to attack once.
    const [a, b] = await Promise.all([hashPassword(GOOD), hashPassword(GOOD)]);

    expect(a).not.toBe(b);
    expect(await verifyPassword(GOOD, a)).toBe(true);
    expect(await verifyPassword(GOOD, b)).toBe(true);
  });

  it("stores nothing that looks like the password", async () => {
    const stored = await hashPassword(GOOD);
    for (const word of GOOD.split(" ")) {
      expect(stored.toLowerCase()).not.toContain(word);
    }
  });

  it("does not trim what the user typed", async () => {
    // The defect the previous application's register recorded: trimming means a
    // password is accepted at sign-up and rejected at sign-in.
    const withSpace = `${GOOD} `;
    const stored = await hashPassword(withSpace);

    expect(await verifyPassword(withSpace, stored)).toBe(true);
    expect(await verifyPassword(GOOD, stored)).toBe(false);
  });
});

describe("a corrupt or hostile stored hash", () => {
  it("fails the login instead of throwing", async () => {
    // An error that behaves differently from a wrong password is an oracle. Every one
    // of these must be indistinguishable from "wrong password".
    for (const stored of [
      "",
      "not-a-hash",
      "scrypt$65536$8$1$onlyfiveparts",
      "bcrypt$65536$8$1$c2FsdA==$aGFzaA==",
      "scrypt$notanumber$8$1$c2FsdA==$aGFzaA==",
      "scrypt$0$8$1$c2FsdA==$aGFzaA==",
      // The authentication bypass this test found on its first run: an empty salt and
      // an empty hash derived a zero-length key, and timingSafeEqual(empty, empty) is
      // true, so EVERY password verified. Kept here by name so it cannot come back.
      "scrypt$65536$8$1$$",
      // Same family: a truncated hash, or a salt shorter than we ever write.
      "scrypt$65536$8$1$c2hvcnQ=$aGFzaA==",
      `scrypt$65536$8$1$${Buffer.from("x".repeat(16)).toString("base64")}$YQ==`,
    ]) {
      expect(await verifyPassword(GOOD, stored), `stored: ${stored}`).toBe(false);
    }
  });

  it("refuses a zero-length salt and hash, which once verified every password", async () => {
    // Regression. See the comment in password.ts parse(): this exact string made
    // scrypt derive a zero-length key, and comparing two empty buffers is true.
    const bypass = "scrypt$65536$8$1$$";

    expect(await verifyPassword("anything at all", bypass)).toBe(false);
    expect(await verifyPassword("something else entirely", bypass)).toBe(false);
    expect(needsRehash(bypass)).toBe(true);
  });

  it("refuses a hash demanding more memory than we will allocate", async () => {
    // A row claiming N = 2^24 would ask for ~17 GB. Refusing beats letting an
    // unauthenticated request get the process killed by the kernel.
    const absurd = `scrypt$16777216$8$1$c2FsdA==$aGFzaA==`;

    expect(await verifyPassword(GOOD, absurd)).toBe(false);
  });
});

describe("the password policy", () => {
  it("requires a real length and says so usefully", () => {
    expect(() => assertPasswordAllowed("short")).toThrow(WeakPasswordError);
    expect(() => assertPasswordAllowed("x".repeat(PASSWORD_MIN_LENGTH - 1))).toThrow(
      /at least 12 characters/,
    );
    expect(() => assertPasswordAllowed("x".repeat(PASSWORD_MIN_LENGTH))).not.toThrow();
  });

  it("caps the length, so an unauthenticated caller cannot ask for unbounded work", () => {
    expect(() => assertPasswordAllowed("x".repeat(PASSWORD_MAX_LENGTH))).not.toThrow();
    expect(() => assertPasswordAllowed("x".repeat(PASSWORD_MAX_LENGTH + 1))).toThrow(
      WeakPasswordError,
    );
  });

  it("is applied when hashing, not only when asked", async () => {
    await expect(hashPassword("too short")).rejects.toThrow(WeakPasswordError);
  });
});

describe("needsRehash", () => {
  it("is false for a hash made with today's parameters", async () => {
    expect(needsRehash(await hashPassword(GOOD))).toBe(false);
  });

  it("is true for a hash made with weaker parameters", async () => {
    // Simulates the upgrade case: a row written before the cost was raised. It must
    // still VERIFY (users can sign in) and be flagged for replacement.
    const weak = `scrypt$16384$8$1$c2FsdHlzYWx0eXNhbHQ=$${Buffer.from("x".repeat(32)).toString("base64")}`;

    expect(needsRehash(weak)).toBe(true);
  });

  it("is true for a hash it cannot read, so a bad row gets replaced at the next chance", () => {
    expect(needsRehash("garbage")).toBe(true);
  });
});
