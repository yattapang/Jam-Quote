/**
 * Does our TOTP agree with RFC 6238, and therefore with the phone?
 *
 * THE VECTORS ARE THE POINT. The other implementation of this protocol is an authenticator app we
 * do not control and cannot adjust. A private implementation that agrees with its own generator
 * would pass any test we invented and fail against Google Authenticator — in production, on a staff
 * member's phone, with no way in. So correctness is measured against the published values in
 * RFC 6238 Appendix B.
 *
 * Those vectors use 8 digits and the ASCII seed "12345678901234567890", which is why `digits` is a
 * parameter: the product uses 6, and the only honest way to check the arithmetic is to check it
 * where somebody else has already written down the answer.
 *
 * WHAT IT DOES NOT PROVE
 *
 * - Nothing about replay. A code is valid for its whole step, so "correct" is not "unused"; the MFA
 *   service records the step and refuses a repeat, and that is its test.
 * - Nothing about attempt limiting. Also the service's.
 * - Nothing about SHA-256 or SHA-512 variants. We issue SHA-1 because that is what apps implement
 *   by default; the vectors for the others are in the RFC if that ever changes.
 * - Not that a real app accepts our provisioning URI. That needs a phone. The URI is built to the
 *   shape apps document, and its shape is asserted here.
 */
import { describe, expect, it } from "vitest";

import {
  TOTP_STEP_SECONDS,
  base32Decode,
  base32Encode,
  newTotpSecret,
  totpCode,
  totpProvisioningUri,
  totpStep,
  verifyTotp,
} from "./totp.js";

/** RFC 6238 Appendix B: the ASCII seed "12345678901234567890", in base32. */
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));

describe("RFC 6238 Appendix B, SHA-1, 8 digits", () => {
  // Time, then the code the RFC says must come out. If any of these disagree, the phone will too.
  const vectors: readonly [number, string][] = [
    [59, "94287082"],
    [1_111_111_109, "07081804"],
    [1_111_111_111, "14050471"],
    [1_234_567_890, "89005924"],
    [2_000_000_000, "69279037"],
    [20_000_000_000, "65353130"],
  ];

  it.each(vectors)("at T=%i produces %s", (atSeconds, expected) => {
    expect(totpCode(RFC_SECRET, totpStep(atSeconds), 8)).toBe(expected);
  });

  it("uses the same seed the RFC does", () => {
    // Guards the fixture itself: if base32Encode were wrong, every vector above would be testing
    // the wrong secret and agreeing with our own mistake.
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(RFC_SECRET).toString("ascii")).toBe("12345678901234567890");
  });
});

describe("verification and the drift window", () => {
  const at = 1_700_000_000;

  it("accepts the current code", () => {
    const code = totpCode(RFC_SECRET, totpStep(at));
    expect(verifyTotp(RFC_SECRET, code, at)).toEqual({ valid: true, step: totpStep(at) });
  });

  it("accepts one step either side, for a phone whose clock is out", () => {
    // A 30-second clock error is common and not the user's fault.
    const previous = totpCode(RFC_SECRET, totpStep(at) - 1);
    const next = totpCode(RFC_SECRET, totpStep(at) + 1);

    expect(verifyTotp(RFC_SECRET, previous, at).valid).toBe(true);
    expect(verifyTotp(RFC_SECRET, next, at).valid).toBe(true);
  });

  it("refuses two steps away", () => {
    // The window is a deliberate 90 seconds, not "whatever is convenient". Widening it trades a
    // real property for a convenience nobody asked for.
    const stale = totpCode(RFC_SECRET, totpStep(at) - 2);
    const future = totpCode(RFC_SECRET, totpStep(at) + 2);

    expect(verifyTotp(RFC_SECRET, stale, at).valid).toBe(false);
    expect(verifyTotp(RFC_SECRET, future, at).valid).toBe(false);
  });

  it("reports which step a code belonged to, so a replay can be refused", () => {
    // "Correct" is not "unused". The caller needs the step to tell the difference.
    const previous = totpCode(RFC_SECRET, totpStep(at) - 1);
    expect(verifyTotp(RFC_SECRET, previous, at).step).toBe(totpStep(at) - 1);
  });

  it("refuses anything that is not six digits", () => {
    for (const bad of ["", "12345", "1234567", "12a456", "  ", "000000000"]) {
      expect(verifyTotp(RFC_SECRET, bad, at).valid, bad).toBe(false);
    }
  });

  it("tolerates a space in a typed code", () => {
    // Authenticator apps display "123 456", and people copy what they see.
    const code = totpCode(RFC_SECRET, totpStep(at));
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect(verifyTotp(RFC_SECRET, spaced, at).valid).toBe(true);
  });
});

describe("secrets", () => {
  it("issues a 20-byte secret, as the RFC recommends for SHA-1", () => {
    expect(base32Decode(newTotpSecret())).toHaveLength(20);
  });

  it("issues a different secret every time", () => {
    const secrets = new Set(Array.from({ length: 200 }, newTotpSecret));
    expect(secrets.size).toBe(200);
  });

  it("round-trips through base32", () => {
    for (let length = 1; length <= 32; length += 1) {
      const bytes = Buffer.from(Array.from({ length }, (_, i) => (i * 37) % 256));
      expect(base32Decode(base32Encode(bytes)).equals(bytes), `length ${length}`).toBe(true);
    }
  });

  it("accepts what a person actually retypes", () => {
    // Manual entry is a supported path: not every phone can scan a QR code.
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    for (const typed of [
      secret.toLowerCase(),
      `${secret.slice(0, 4)} ${secret.slice(4, 8)} ${secret.slice(8)}`,
      `${secret}====`,
    ]) {
      expect(base32Decode(typed).equals(base32Decode(secret)), typed).toBe(true);
    }
  });

  it("refuses a character outside the alphabet rather than skipping it", () => {
    // Skipping a typo produces a DIFFERENT secret and an enrolment that looks fine until the first
    // code fails — at which point nobody connects the two.
    expect(() => base32Decode("GEZDGNBV1Y3TQOJQ")).toThrow(/not valid base32/);
    expect(() => base32Decode("")).toThrow(/empty secret/);
  });
});

describe("the provisioning URI", () => {
  it("carries the issuer in both places apps expect", () => {
    const uri = totpProvisioningUri({
      issuer: "Pryvis",
      account: "delroy@pryvis.com",
      secret: RFC_SECRET,
    });

    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    // The label prefix AND the parameter. Getting this wrong shows up as a missing issuer on
    // somebody's phone, not as an error anywhere we would see.
    expect(uri).toContain(encodeURIComponent("Pryvis:delroy@pryvis.com"));
    expect(uri).toContain("issuer=Pryvis");
    expect(uri).toContain(`period=${TOTP_STEP_SECONDS}`);
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
  });
});
