/**
 * CORE: auth — time-based one-time codes (TOTP, RFC 6238).
 *
 * Owns:        the code arithmetic, the drift window, and the provisioning URI.
 * Trusted by:  the MFA service, which owns the secret, the replay check and the attempt limit.
 * Never does:  decide whether someone may sign in. This answers "is this the code for that secret
 *              at that moment", nothing more.
 *
 * WHY WRITTEN RATHER THAN INSTALLED
 *
 * It is about sixty lines of well-specified arithmetic, and the alternative is a dependency in the
 * credential path — read on every staff sign-in, updated by someone we do not know. The published
 * test vectors make "did we implement it correctly" a question with an answer, which is the part
 * that usually justifies a library.
 *
 * THE OTHER HALF OF THIS PROTOCOL IS SOMEBODY ELSE'S CODE
 *
 * The authenticator app on the phone is the other implementation, and it will not be adjusted to
 * match ours. So correctness is measured against RFC 6238's vectors, not against our own
 * generator — a private implementation that agrees with itself would pass its own tests and fail
 * against Google Authenticator, in production, on a staff member's phone, with no way in.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** 30 seconds, as every authenticator app assumes. Not configurable for that reason. */
export const TOTP_STEP_SECONDS = 30;

/**
 * How many steps either side of now are accepted.
 *
 * ±1 tolerates a phone whose clock is up to 30 seconds out, which is common and not the user's
 * fault. It also means a code is valid for at most 90 seconds — so the MFA service records the step
 * a code was used for and refuses it a second time. Widening this trades a real security property
 * for a convenience nobody asked for.
 */
export const TOTP_DRIFT_STEPS = 1;

/** Base32, RFC 4648, no padding — the alphabet every authenticator expects. */
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** A new secret, 20 bytes as the RFC recommends for SHA-1. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/**
 * Decodes base32, tolerating what a human retypes: lower case, spaces, and padding.
 *
 * A person copying a secret by hand is a supported path — an authenticator that cannot scan a QR
 * code offers manual entry — so the decoder accepts what they will actually type. It refuses a
 * character outside the alphabet rather than skipping it, because silently ignoring a typo produces
 * a *different* secret and an enrolment that appears to work until the first code fails.
 */
export function base32Decode(secret: string): Buffer {
  const cleaned = secret.replace(/[\s=]/g, "").toUpperCase();
  if (cleaned.length === 0) throw new Error("An empty secret is not a secret.");

  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const character of cleaned) {
    const index = BASE32.indexOf(character);
    if (index === -1) {
      throw new Error(
        `"${character}" is not valid base32. Refusing rather than skipping it: ignoring a typo ` +
          `produces a different secret and an enrolment that looks fine until the first code fails.`,
      );
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** The step number for a moment — the counter both sides derive independently. */
export function totpStep(atSeconds: number): number {
  return Math.floor(atSeconds / TOTP_STEP_SECONDS);
}

/**
 * The code for one step.
 *
 * HMAC-SHA1 with the step as an 8-byte big-endian counter, then RFC 4226's dynamic truncation: the
 * low nibble of the last byte picks an offset, four bytes are read from there, the top bit is
 * masked off (so the result is positive on platforms that treat it as signed), and the remainder
 * modulo 10^digits is the code.
 *
 * SHA-1 here is not a mistake and not a compromise: RFC 6238's default is HMAC-SHA1, and it is what
 * every authenticator app implements. HMAC-SHA1's security does not rest on SHA-1's collision
 * resistance, which is the property that fell.
 */
export function totpCode(secret: string, step: number, digits = 6): string {
  const counter = Buffer.alloc(8);
  // Written as two 32-bit halves because a step number exceeds 32 bits only in the year 6000-odd,
  // and `writeUInt32BE` avoids needing BigInt for a value that never gets that large.
  counter.writeUInt32BE(Math.floor(step / 2 ** 32), 0);
  counter.writeUInt32BE(step % 2 ** 32, 4);

  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const truncated =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;

  return String(truncated % 10 ** digits).padStart(digits, "0");
}

export interface TotpVerification {
  readonly valid: boolean;
  /**
   * The step the code belonged to, when valid.
   *
   * Returned so the caller can refuse a replay: a code stays valid for its whole step, so "this
   * code is correct" is not the same as "this code has not been used". Only the caller knows what
   * was used before, which is why this function does not pretend to.
   */
  readonly step: number | null;
}

/**
 * Is `code` valid for `secret` at this moment, within the drift window?
 *
 * Compared with `timingSafeEqual`. The timing of a TOTP comparison is a weaker channel than a
 * password's — an attacker learns at most which of a million codes was closer — but the comparison
 * is free to do properly and a reader should not have to wonder why one credential path is careful
 * and another is not.
 */
export function verifyTotp(
  secret: string,
  code: string,
  atSeconds: number,
  digits = 6,
): TotpVerification {
  const cleaned = code.replace(/\s/g, "");
  if (!new RegExp(`^\\d{${digits}}$`).test(cleaned)) return { valid: false, step: null };

  const current = totpStep(atSeconds);
  for (let offset = -TOTP_DRIFT_STEPS; offset <= TOTP_DRIFT_STEPS; offset += 1) {
    const step = current + offset;
    const expected = Buffer.from(totpCode(secret, step, digits));
    const given = Buffer.from(cleaned);
    if (expected.length === given.length && timingSafeEqual(expected, given)) {
      return { valid: true, step };
    }
  }
  return { valid: false, step: null };
}

/**
 * The `otpauth://` URI an authenticator app reads from a QR code.
 *
 * The issuer appears twice — as a prefix on the label and as a parameter — because that is what
 * apps actually expect, and getting it wrong shows up as "Pryvis:Pryvis:name" or a missing issuer
 * in somebody's phone rather than as an error anywhere we would see.
 */
export function totpProvisioningUri(options: {
  readonly issuer: string;
  readonly account: string;
  readonly secret: string;
}): string {
  const label = encodeURIComponent(`${options.issuer}:${options.account}`);
  const parameters = new URLSearchParams({
    secret: options.secret,
    issuer: options.issuer,
    algorithm: "SHA1",
    digits: "6",
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${parameters.toString()}`;
}
