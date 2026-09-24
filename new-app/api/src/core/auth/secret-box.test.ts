/**
 * Does the sealing hold, and can the key actually be rotated?
 *
 * The rotation tests are the ones worth having. Encryption at rest is easy to get working and easy
 * to get into a state where the key can never change — which is the state most systems are in, and
 * it is indistinguishable from the working one until somebody tries.
 *
 * WHAT IT DOES NOT PROVE
 *
 * - Nothing about where the key lives in production. That it is in configuration and not in the
 *   database is a deployment property; the code cannot enforce it, and the service register names
 *   it as a secret to be set.
 * - Nothing against an attacker holding both the database and the environment. That is stated as
 *   the honest limit in the module, not defended here.
 * - Nothing about AES itself.
 */
import { describe, expect, it } from "vitest";

import {
  KeyRegistry,
  SecretBoxError,
  needsResealing,
  open,
  sameCiphertext,
  seal,
} from "./secret-box.js";

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");
const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

const oneKey = () => KeyRegistry.fromConfig(`k1:${KEY_A}`);
const rotated = () => KeyRegistry.fromConfig(`k2:${KEY_B},k1:${KEY_A}`);

describe("sealing and opening", () => {
  it("round-trips a secret", () => {
    const registry = oneKey();
    expect(open(registry, seal(registry, SECRET))).toBe(SECRET);
  });

  it("records which key sealed it", () => {
    expect(seal(oneKey(), SECRET).keyId).toBe("k1");
  });

  it("produces different ciphertext each time, from a fresh IV", () => {
    // Identical ciphertext for identical plaintext would tell an attacker with the dump which staff
    // members share a secret — and would mean the IV was being reused, which breaks GCM outright.
    const registry = oneKey();
    const first = seal(registry, SECRET);
    const second = seal(registry, SECRET);

    expect(sameCiphertext(first.ciphertext, second.ciphertext)).toBe(false);
    expect(first.iv.equals(second.iv)).toBe(false);
  });

  it("stores nothing resembling the secret", () => {
    const sealed = seal(oneKey(), SECRET);
    expect(sealed.ciphertext.toString("utf8")).not.toContain("GEZD");
    expect(sealed.ciphertext.toString("base64")).not.toContain(SECRET);
  });
});

describe("tampering", () => {
  it("refuses a row whose ciphertext was altered", () => {
    // GCM's tag is the reason this raises instead of returning plausible garbage. Wrong plaintext
    // here would produce wrong codes, which looks exactly like a user typing the wrong code — and
    // sends whoever investigates in the wrong direction.
    const registry = oneKey();
    const sealed = seal(registry, SECRET);
    const altered = { ...sealed, ciphertext: Buffer.from(sealed.ciphertext) };
    altered.ciphertext[0]! ^= 0xff;

    expect(() => open(registry, altered)).toThrow(SecretBoxError);
  });

  it("refuses a row whose tag was altered", () => {
    const registry = oneKey();
    const sealed = seal(registry, SECRET);
    const altered = { ...sealed, tag: Buffer.from(sealed.tag) };
    altered.tag[0]! ^= 0xff;

    expect(() => open(registry, altered)).toThrow(SecretBoxError);
  });

  it("refuses a row sealed with a key this process does not have", () => {
    // And does NOT fall back to the current key. A fallback would decrypt to garbage that fails as
    // "wrong code" and hide the real problem, which is a missing key in configuration.
    const sealed = seal(rotated(), SECRET);
    expect(() => open(oneKey(), sealed)).toThrow(/No key "k2" is configured/);
  });
});

describe("rotation, which is the part that usually cannot be done", () => {
  it("opens an old row with the key it names while sealing new ones with the current key", () => {
    const before = oneKey();
    const old = seal(before, SECRET);

    const after = rotated();
    // The old row still opens — nobody re-enrols.
    expect(open(after, old)).toBe(SECRET);
    // And a new secret uses the new key.
    expect(seal(after, SECRET).keyId).toBe("k2");
  });

  it("says which rows still need re-sealing", () => {
    const old = seal(oneKey(), SECRET);
    const after = rotated();

    expect(needsResealing(after, old)).toBe(true);
    expect(needsResealing(after, seal(after, SECRET))).toBe(false);
  });

  it("re-seals without changing the secret", () => {
    const after = rotated();
    const old = seal(oneKey(), SECRET);

    const resealed = seal(after, open(after, old));

    expect(resealed.keyId).toBe("k2");
    expect(open(after, resealed)).toBe(SECRET);
    expect(sameCiphertext(resealed.ciphertext, old.ciphertext)).toBe(false);
  });

  it("takes the FIRST configured key as current, so a rotation is explicit", () => {
    // A registry that guessed — newest id, longest name, alphabetical — would silently seal with
    // the wrong key halfway through a rotation, and the mistake would only surface when the old key
    // was retired.
    expect(KeyRegistry.fromConfig(`k1:${KEY_A},k2:${KEY_B}`).current.id).toBe("k1");
    expect(KeyRegistry.fromConfig(`k2:${KEY_B},k1:${KEY_A}`).current.id).toBe("k2");
  });
});

describe("configuration that would weaken it", () => {
  it("refuses to start with no keys rather than storing plaintext", () => {
    // A silent fallback is how an at-rest control disappears without anyone deciding to remove it.
    expect(() => KeyRegistry.fromConfig("")).toThrow(/No encryption keys configured/);
    expect(() => KeyRegistry.fromConfig("   ")).toThrow(/No encryption keys configured/);
  });

  it("refuses a key of the wrong length", () => {
    const short = Buffer.alloc(16, 9).toString("base64");
    expect(() => KeyRegistry.fromConfig(`k1:${short}`)).toThrow(/needs 32/);
  });

  it("refuses a malformed entry and a duplicate id", () => {
    expect(() => KeyRegistry.fromConfig(KEY_A)).toThrow(/Malformed key entry/);
    expect(() => KeyRegistry.fromConfig(`k1:${KEY_A},k1:${KEY_B}`)).toThrow(/appears twice/);
  });
});
