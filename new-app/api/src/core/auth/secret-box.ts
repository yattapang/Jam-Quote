/**
 * CORE: auth — sealing a secret we must be able to read back.
 *
 * Owns:        encryption at rest for TOTP secrets, and the key registry that makes rotation
 *              possible.
 * Trusted by:  the MFA service.
 * Never does:  hold a key in the database; log a key or a plaintext; decrypt with a key the caller
 *              chose rather than the one the row names.
 *
 * WHY ENCRYPT AT ALL
 *
 * A TOTP secret is a credential equal to a password: anyone holding it generates valid codes
 * forever. Passwords are stored as slow hashes precisely so that a database dump is not a list of
 * credentials — and storing the second factor in plaintext beside them would hand an attacker with
 * that dump both factors, making the second one worth nothing.
 *
 * Unlike a password, this must be recoverable: verifying a code requires the secret itself, so a
 * hash is not an option. That is the whole reason this file exists rather than reusing
 * `password.ts`.
 *
 * THE HONEST LIMIT
 *
 * The key lives in configuration, never in the database, so a dump alone is useless. An attacker
 * holding **both** the database and the environment has the secrets, and there is no
 * key-management service to prevent that. It is a meaningfully harder bar than one dump, and it is
 * the best available without a KMS — stated plainly rather than described as "encrypted at rest"
 * and left to sound complete.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/** AES-256-GCM: authenticated, so tampering is detected rather than producing wrong plaintext. */
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12; // 96 bits, the size GCM is specified for

export interface SealedSecret {
  readonly keyId: string;
  readonly ciphertext: Buffer;
  readonly iv: Buffer;
  readonly tag: Buffer;
}

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretBoxError";
  }
}

/**
 * The keys this process can use, newest first by convention.
 *
 * MORE THAN ONE ON PURPOSE. A single key cannot be rotated: changing it makes every existing row
 * undecryptable and forces every staff member to re-enrol, so in practice the key is never changed
 * and "encrypted at rest" means "encrypted with a key we can never change". With a registry, new
 * secrets are sealed with `current` and old rows open with the key they name, so rotation becomes
 * a background re-encryption instead of an outage.
 *
 * Keys come from configuration as `<id>:<base64>` entries. The id is stored in the row; the key
 * never is.
 */
export class KeyRegistry {
  private readonly keys: Map<string, Buffer>;
  private readonly currentId: string;

  private constructor(keys: Map<string, Buffer>, currentId: string) {
    this.keys = keys;
    this.currentId = currentId;
  }

  /**
   * Builds a registry from configuration.
   *
   * @param spec `k2:<base64>,k1:<base64>` — the FIRST entry is the current key, because "which one
   *   do new secrets use" must be explicit. A registry that guessed (the newest id, the longest
   *   name) would silently seal with the wrong key during a rotation.
   */
  static fromConfig(spec: string): KeyRegistry {
    const entries = spec
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (entries.length === 0) {
      throw new SecretBoxError(
        "No encryption keys configured. Refusing to start rather than falling back to storing " +
          "second-factor secrets in plaintext — a silent fallback is how an at-rest control " +
          "disappears without anyone deciding to remove it.",
      );
    }

    const keys = new Map<string, Buffer>();
    let currentId: string | null = null;
    for (const entry of entries) {
      const separator = entry.indexOf(":");
      if (separator <= 0) {
        throw new SecretBoxError(`Malformed key entry: expected "<id>:<base64>", got "${entry}".`);
      }
      const id = entry.slice(0, separator);
      const key = Buffer.from(entry.slice(separator + 1), "base64");
      if (key.length !== KEY_BYTES) {
        throw new SecretBoxError(
          `Key "${id}" is ${key.length} bytes; AES-256 needs ${KEY_BYTES}. A short key would be ` +
            `padded or rejected somewhere less obvious than here.`,
        );
      }
      if (keys.has(id)) throw new SecretBoxError(`Key id "${id}" appears twice.`);
      keys.set(id, key);
      currentId ??= id;
    }
    return new KeyRegistry(keys, currentId!);
  }

  get current(): { id: string; key: Buffer } {
    return { id: this.currentId, key: this.keys.get(this.currentId)! };
  }

  /** The key a row names, or a refusal — never a fallback to the current key. */
  byId(id: string): Buffer {
    const key = this.keys.get(id);
    if (!key) {
      throw new SecretBoxError(
        `No key "${id}" is configured, so this secret cannot be read. Falling back to another key ` +
          `would produce garbage that fails as "wrong code" and send somebody hunting the wrong ` +
          `problem.`,
      );
    }
    return key;
  }

  /** For tests and for a rotation runbook: which ids can be opened. */
  get knownIds(): readonly string[] {
    return [...this.keys.keys()];
  }
}

/** Seals a secret with the current key, recording which key that was. */
export function seal(registry: KeyRegistry, plaintext: string): SealedSecret {
  const { id, key } = registry.current;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { keyId: id, ciphertext, iv, tag: cipher.getAuthTag() };
}

/**
 * Opens a sealed secret with the key it names.
 *
 * GCM verifies the tag, so a tampered row raises rather than returning plausible-looking
 * plaintext — which matters here because the plaintext is a TOTP secret, and wrong plaintext
 * produces wrong codes that look exactly like a user entering the wrong code.
 */
export function open(registry: KeyRegistry, sealed: SealedSecret): string {
  const key = registry.byId(sealed.keyId);
  const decipher = createDecipheriv(ALGORITHM, key, sealed.iv);
  decipher.setAuthTag(sealed.tag);
  try {
    return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretBoxError(
      "This secret failed its authentication tag: it was encrypted with a different key, or the " +
        "row has been altered. Refusing rather than returning what decrypted, because wrong " +
        "plaintext here looks identical to a user typing the wrong code.",
    );
  }
}

/** Does this sealed secret need re-sealing with the current key? */
export function needsResealing(registry: KeyRegistry, sealed: SealedSecret): boolean {
  return sealed.keyId !== registry.current.id;
}

/**
 * Constant-time comparison of two sealed secrets' ciphertext.
 *
 * Used only by tests asserting that re-sealing actually changed the row; exported so no test has to
 * reach for `Buffer.equals` on credential material and normalise that habit.
 */
export function sameCiphertext(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
