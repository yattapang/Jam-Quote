/**
 * CORE: auth — the session secret, and the only form of it the database ever sees.
 * Owns:        making a session secret, and turning one into the hash the database stores.
 * Trusted by:  sign-in (which issues the secret), the resolver and MFA (which look a session up by it).
 * Never does:  send the secret itself to the database, or log it.
 *
 * WHY A HASH (privilege model, decision D2 — `docs/design/privilege-model.md`)
 *
 * The session reference a client holds IS its login. Until 2026-10-01 `app_session.id` was that reference,
 * so a copy of the table — a backup, a logged query, a defect with read access — was a list of live logins.
 * Now the client holds a random secret and the database holds only its SHA-256. A 256-bit random secret
 * needs no salt or slow hash: nobody can guess one to test against the hash, which is what a slow hash
 * defends against for passwords.
 */
import { createHash, randomBytes } from "node:crypto";

/** A new session secret: 256 random bits, URL-safe. Handed to the client and never stored. */
export function newSessionSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** The hex SHA-256 the database stores and looks a session up by. */
export function sessionTokenHash(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}
