/**
 * The one place a row id comes from.
 *
 * WHY THE CLIENT CHOOSES THE ID (design: row-identity-and-versioning.md)
 *
 * A contractor prices a job on a phone with no signal. The quote exists, has lines, and is
 * referenced by other rows — all before the server has ever seen it. If the server assigned the
 * id on arrival, the phone would have to rewrite every local reference afterwards, and a retried
 * upload that the server already processed would create a SECOND quote. A client-chosen id makes
 * the upload idempotent: the same id arriving twice is the same row.
 *
 * WHY THIS LIVES IN packages/core
 *
 * api, web and mobile all create rows, and they must create ids the same way. This is the first
 * inhabitant of `@pryvis/core`; the money, tax and settlement rules arrive here later as their
 * own reviewed port from `original-app/` (ADR 0010).
 *
 * ── A ROW ID IS NOT A SECRET ─────────────────────────────────────────────────────────────────
 *
 * UUIDv7 embeds the creation time in its leading bits. That is the point — see below — and it
 * means anyone holding an id knows when the row was made. Harmless for a quote whose own customer
 * reads the date off the document. **Not harmless in a public URL.** A share link uses a separate
 * random secret, never a row id, and nobody should later "simplify" that by reusing this. If you
 * need an unguessable value, this is not the function.
 */
import { randomBytes } from "node:crypto";

/**
 * UUIDv7, not v4.
 *
 * v7's leading 48 bits are a millisecond timestamp, so ids sort roughly by creation time. Two
 * things follow, both free: inserts land at the END of the primary-key index instead of
 * scattering across it, and "most recent first" needs no extra column. v4's randomness fragments
 * the index on every insert — which does not matter at ten rows and does at ten million.
 *
 * Layout (RFC 9562):
 *
 *   0                   1                   2                   3
 *   |     unix_ts_ms (48 bits)      | ver |  rand_a   | var |  rand_b (62 bits)  |
 *
 * `ver` is 0b0111 and `var` is 0b10, both fixed by the spec. `rand_a` here is not random: it is
 * a counter, so that ids created inside the same millisecond still order correctly. Without it,
 * a burst of rows written in one millisecond would sort arbitrarily among themselves, and the
 * ordering this whole choice exists for would be missing exactly where rows are created fastest.
 */
let lastTimestamp = 0;
let sequence = 0;

/** 12 bits of counter, so 4096 ids inside one millisecond keep their order. */
const MAX_SEQUENCE = 0x0fff;

export function newRowId(now: () => number = Date.now): string {
  let timestamp = now();

  if (timestamp === lastTimestamp) {
    sequence += 1;
    if (sequence > MAX_SEQUENCE) {
      // More than 4096 ids in one millisecond. Rather than reuse a counter value — which would
      // break the ordering guarantee this function advertises — borrow from the next
      // millisecond. The clock catches up within a millisecond and the ids stay monotonic.
      timestamp = lastTimestamp + 1;
      sequence = 0;
    }
  } else if (timestamp > lastTimestamp) {
    sequence = 0;
  } else {
    // The clock moved backwards (an NTP correction, a host migration). Going with it would emit
    // ids that sort before rows created earlier, so the previous millisecond is held instead.
    // Monotonicity matters more here than the timestamp being exact to the millisecond.
    timestamp = lastTimestamp;
    sequence += 1;
    if (sequence > MAX_SEQUENCE) {
      timestamp = lastTimestamp + 1;
      sequence = 0;
    }
  }
  lastTimestamp = timestamp;

  const bytes = randomBytes(16);

  // 48-bit timestamp, big-endian.
  bytes[0] = (timestamp / 2 ** 40) & 0xff;
  bytes[1] = (timestamp / 2 ** 32) & 0xff;
  bytes[2] = (timestamp / 2 ** 24) & 0xff;
  bytes[3] = (timestamp / 2 ** 16) & 0xff;
  bytes[4] = (timestamp / 2 ** 8) & 0xff;
  bytes[5] = timestamp & 0xff;

  // Version 7 in the high nibble of byte 6, then the counter's top 4 bits.
  bytes[6] = 0x70 | ((sequence >> 8) & 0x0f);
  bytes[7] = sequence & 0xff;

  // Variant 0b10 in the top two bits of byte 8; the remaining 62 bits stay random.
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * The millisecond a v7 id was created.
 *
 * For diagnostics and for tests, not for business logic: a row's real timestamps are its
 * `created_at` and `updated_at` columns, which a migration or a correction can set honestly.
 * Reading time out of a primary key would make the id load-bearing for something it only
 * happens to carry.
 */
export function rowIdTimestamp(id: string): number {
  const hex = id.replace(/-/g, "").slice(0, 12);
  return Number.parseInt(hex, 16);
}

/** The shape this system issues. Strict: a v4 here means the row was made outside the app. */
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRowId(value: string): boolean {
  return UUID_V7.test(value);
}
