/**
 * CORE: auth — hashing and verifying passwords.
 *
 * Owns:        the stored hash format, the cost parameters, the comparison, and the
 *              one password-length rule the whole system uses.
 * Trusted by:  sign-in, sign-up, password reset, and the admin console.
 * Never does:  log or return a password, a hash, or anything derived from either;
 *              trim or otherwise "tidy" what the user typed.
 *
 * ALGORITHM: Node's built-in scrypt. ADR 0014 records why, including the two things
 * it is NOT: not argon2id (native build, per-platform binary, against Rule 10), and
 * not OWASP's recommended N = 2^17, because 128 MB per hash on a 512 MB instance is
 * an out-of-memory risk of our own making. 2^16 is one notch below the
 * recommendation and vastly above an attacker's position against a fast hash.
 *
 * THE PARAMETERS LIVE IN THE HASH. That is what makes raising them possible: the
 * plaintext exists only during a successful verify, so `needsRehash` plus a rehash at
 * that moment is the only upgrade path that can ever work. Sign-in calls it.
 */
import {
  randomBytes,
  scrypt as scryptCallback,
  type ScryptOptions,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

/**
 * Typed explicitly because `promisify` collapses scrypt's overloads and loses the
 * one that takes options — which is the only one we use, since `maxmem` is
 * mandatory here. Without this annotation the call compiles as three arguments and
 * the options object is dropped.
 */
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Current cost. See ADR 0014 for the memory arithmetic (128 · N · r ≈ 67 MB).
 *
 * `maxmem` is not optional: Node defaults it to 32 MB and THROWS above it, so
 * omitting it would make this N fail at runtime rather than quietly weaken.
 */
export const SCRYPT_PARAMS = { N: 65_536, r: 8, p: 1, maxmem: 96 * 1024 * 1024 } as const;

const SALT_BYTES = 16;
const HASH_BYTES = 32;
const ALGORITHM = "scrypt";

/**
 * The one password-length rule, used by every path that sets or checks a password.
 *
 * The maximum is not security theatre: it bounds the work an unauthenticated caller
 * can make us do, since hashing cost rises with input size. The minimum is length
 * rather than a character-class rule, because "at least one symbol" reliably produces
 * `Password1!` and nothing better.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export class WeakPasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeakPasswordError";
  }
}

/**
 * Checks a password against the policy. Throws with a message a user can act on.
 *
 * NOT trimmed, deliberately. Trimming silently changes what someone typed, so a
 * password ending in a space is accepted at sign-up and rejected at sign-in — a
 * defect the previous application's review register recorded. The length is measured
 * in characters as typed.
 */
export function assertPasswordAllowed(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new WeakPasswordError(
      `Please use at least ${PASSWORD_MIN_LENGTH} characters. A short phrase you will remember is stronger than a short word with symbols in it.`,
    );
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new WeakPasswordError(`Please use ${PASSWORD_MAX_LENGTH} characters or fewer.`);
  }
}

/**
 * Hashes a password into the storable, self-describing form:
 *
 *   scrypt$N$r$p$<base64 salt>$<base64 hash>
 *
 * A fresh random salt per password, so two users with the same password do not share
 * a hash and a precomputed table is useless.
 */
export async function hashPassword(password: string): Promise<string> {
  assertPasswordAllowed(password);

  const salt = randomBytes(SALT_BYTES);
  const { N, r, p, maxmem } = SCRYPT_PARAMS;
  const hash = await scrypt(password, salt, HASH_BYTES, { N, r, p, maxmem });

  return [
    ALGORITHM,
    N,
    r,
    p,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

interface ParsedHash {
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly salt: Buffer;
  readonly hash: Buffer;
}

/** Parses a stored hash, or returns null. Never throws: see `verifyPassword`. */
function parse(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6) return null;
  const [algorithm, rawN, rawR, rawP, rawSalt, rawHash] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (algorithm !== ALGORITHM) return null;

  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  if (N < 1024 || r < 1 || p < 1) return null;

  // A hash from the future could ask for more memory than we will allocate. Refusing
  // is the honest outcome — better a failed login than a process killed by the
  // kernel on an unauthenticated request.
  if (128 * N * r > SCRYPT_PARAMS.maxmem) return null;

  let salt: Buffer;
  let hash: Buffer;
  try {
    salt = Buffer.from(rawSalt, "base64");
    hash = Buffer.from(rawHash, "base64");
  } catch {
    return null;
  }

  // AN AUTHENTICATION BYPASS LIVED HERE, found by password.test.ts on its first run.
  //
  // `scrypt$65536$8$1$$` parses: base64 of "" is an empty buffer, so salt and hash
  // were both zero-length. scrypt then derived a ZERO-LENGTH key, and
  // timingSafeEqual(empty, empty) is true — so ANY password verified against that
  // row. A partially written row, a truncating migration, or anyone with write access
  // to one column would have had a universal password.
  //
  // Lengths are therefore checked, not assumed. A future format with different
  // lengths must come with a new algorithm label, so old rows keep being read by the
  // rules they were written under.
  if (salt.length < SALT_BYTES || hash.length !== HASH_BYTES) return null;

  return { N, r, p, salt, hash };
}

/**
 * Is `password` the one behind `stored`?
 *
 * Returns false rather than throwing for a malformed, unknown-algorithm or corrupt
 * hash. A corrupt row must be a failed login, not a 500 — an error that behaves
 * differently from a wrong password is an oracle telling an attacker which accounts
 * are interesting.
 *
 * The comparison is timing-safe. The lengths are compared first, which is not itself
 * secret: both are fixed by our own format.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  if (password.length === 0 || password.length > PASSWORD_MAX_LENGTH) return false;

  const { N, r, p, salt, hash } = parsed;
  let candidate: Buffer;
  try {
    candidate = await scrypt(password, salt, hash.length, {
      N,
      r,
      p,
      maxmem: SCRYPT_PARAMS.maxmem,
    });
  } catch {
    return false;
  }

  return candidate.length === hash.length && timingSafeEqual(candidate, hash);
}

/**
 * Was `stored` produced with weaker parameters than we use now?
 *
 * Call this on SUCCESSFUL verify and rehash if true — that is the only moment the
 * plaintext exists, so it is the only place the cost can ever be raised. Without
 * this call the upgrade path in ADR 0014 exists on paper and nowhere else.
 */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  if (!parsed) return true; // unreadable: replace it at the next opportunity
  return (
    parsed.N < SCRYPT_PARAMS.N || parsed.r < SCRYPT_PARAMS.r || parsed.p < SCRYPT_PARAMS.p
  );
}
