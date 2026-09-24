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
  PASSWORD_MAX_BYTES,
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

/**
 * A hash of a real password at the cost we used before, for the upgrade case.
 *
 * Built rather than hard-coded, so it is genuinely verifiable — the fixture it replaced was a
 * string of "x" that no password could match, which is exactly why F6's test proved nothing.
 */
async function legacyHash(password: string): Promise<string> {
  const { randomBytes, scrypt } = await import("node:crypto");
  const { promisify } = await import("node:util");
  const derive = promisify(scrypt) as (
    p: string,
    s: Buffer,
    k: number,
    o: { N: number; r: number; p: number; maxmem: number },
  ) => Promise<Buffer>;
  const salt = randomBytes(16);
  const params = { N: 16_384, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
  // Normalised the same way hashPassword does, or a legacy hash of an accented password would
  // never verify and this helper would be testing the wrong thing.
  const hash = await derive(password.normalize("NFC"), salt, 32, params);
  return ["scrypt", params.N, params.r, params.p, salt.toString("base64"), hash.toString("base64")].join(
    "$",
  );
}

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

describe("unicode", () => {
  it("accepts the same password typed on a different keyboard (F7)", async () => {
    // "café résumé passphrase" composed (NFC) and decomposed (NFD). A person typing on one
    // device produces one, another device the other, and they believe they typed the same
    // thing — because they did.
    const composed = "caf\u00e9 r\u00e9sum\u00e9 passphrase";
    const decomposed = "cafe\u0301 re\u0301sume\u0301 passphrase";

    expect(composed, "the two forms must differ, or this test proves nothing").not.toBe(
      decomposed,
    );

    const stored = await hashPassword(composed);
    expect(await verifyPassword(decomposed, stored)).toBe(true);

    // And the other way round: hashed decomposed, verified composed.
    const storedFromDecomposed = await hashPassword(decomposed);
    expect(await verifyPassword(composed, storedFromDecomposed)).toBe(true);
  });

  it("does not fold distinct characters together", async () => {
    // NFC, not NFKC. NFKC would turn "ﬁ" into "fi" and full-width into ASCII, silently making
    // different passwords equal and reducing entropy.
    const ligature = "\ufb01nancial statement pass";
    const spelled = "financial statement pass";

    const stored = await hashPassword(ligature);
    expect(await verifyPassword(spelled, stored)).toBe(false);
  });

  it("still does not trim, because a space is a character the user chose", async () => {
    const withSpace = `${GOOD} `;
    const stored = await hashPassword(withSpace);

    expect(await verifyPassword(withSpace, stored)).toBe(true);
    expect(await verifyPassword(GOOD, stored)).toBe(false);
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

  it("counts characters a person would count, not UTF-16 code units (F8)", () => {
    // Six construction-worker emoji are twelve UTF-16 code units and six characters. The old
    // rule counted units, so this satisfied a twelve-character minimum — while the comment
    // claimed it measured "characters as typed".
    const sixEmoji = "\u{1F477}".repeat(6);
    expect(sixEmoji.length, "twelve code units").toBe(12);
    expect([...sixEmoji].length, "six characters").toBe(6);

    expect(() => assertPasswordAllowed(sixEmoji)).toThrow(WeakPasswordError);
    expect(() => assertPasswordAllowed("\u{1F477}".repeat(12))).not.toThrow();
  });

  it("bounds the work in bytes as well as characters (F8)", () => {
    // 128 astral characters are 512 bytes, which is within the byte bound; the byte bound exists
    // for what a script sends, not what a person types.
    expect(() => assertPasswordAllowed("\u{1F477}".repeat(PASSWORD_MAX_LENGTH))).not.toThrow();
    expect(() => assertPasswordAllowed("\u{1F477}".repeat(PASSWORD_MAX_LENGTH + 1))).toThrow(
      WeakPasswordError,
    );

    // And verify refuses an absurd input outright rather than hashing it.
    const absurd = "a".repeat(PASSWORD_MAX_BYTES + 1);
    expect(Buffer.byteLength(absurd, "utf8")).toBeGreaterThan(PASSWORD_MAX_BYTES);
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

  it("is true for a hash made with weaker parameters, which must still verify", async () => {
    // F6 (independent review, 2026-09-24): this test used to assert ONLY that needsRehash was
    // true, while its comment claimed "it must still VERIFY". Those are different claims, and
    // the weaker one passes whether the old hash verifies or is rejected outright. The reviewer
    // planted a parse rejection for old parameters — locking out every pre-upgrade user — and
    // this file stayed 14/14 green.
    //
    // A comment describing a stronger claim than the assertion is worse than no comment: it
    // tells a reader the case is covered. So the hash is now built from a REAL password at the
    // old cost, and both halves are asserted.
    const weak = await legacyHash(GOOD);

    expect(await verifyPassword(GOOD, weak), "a pre-upgrade user can still sign in").toBe(true);
    expect(await verifyPassword("the wrong password entirely", weak)).toBe(false);
    expect(needsRehash(weak), "and the hash is flagged for replacement").toBe(true);
  });

  it("is true for a hash it cannot read, so a bad row gets replaced at the next chance", () => {
    expect(needsRehash("garbage")).toBe(true);
  });
});
