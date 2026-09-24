/**
 * Does the id generator actually do what the design claims?
 *
 * Three claims, and each one is the reason for a choice that would otherwise look arbitrary:
 * the ids are valid UUIDv7, they sort by creation time, and they keep sorting correctly when
 * created faster than the clock ticks. The third is the one that would quietly not be true.
 *
 * WHAT IT DOES NOT PROVE
 *
 * - Nothing about collision probability. 62 random bits per millisecond is an argument, not a
 *   test; a test that generated enough ids to observe a collision would run for years.
 * - Nothing about behaviour across processes. Two servers generating ids in the same millisecond
 *   order arbitrarily between themselves — the counter is per-process. That is acceptable because
 *   the ordering claim is "roughly by creation time", used for index locality and default sort
 *   order, never for deciding which of two writes came first. That decision belongs to `version`.
 * - Nothing about the database. That an id survives a round trip is the schema's test.
 */
import { describe, expect, it } from "vitest";

import { isRowId, newRowId, rowIdTimestamp } from "./row-id.js";

describe("the shape of a row id", () => {
  it("is a valid UUIDv7", () => {
    for (let i = 0; i < 50; i += 1) {
      const id = newRowId();
      // Version nibble 7 and variant bits 0b10 are what make it a v7 rather than a
      // random-looking string; a consumer checking the version would reject anything else.
      expect(id, id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(isRowId(id)).toBe(true);
    }
  });

  it("rejects the v4 ids the database still generates by default", () => {
    // The mismatch is deliberate: Postgres keeps gen_random_uuid() as a safety net for rows made
    // by a migration or a script, so a v4 in the data is a SIGNAL that something wrote outside
    // the application. This check is what makes that signal readable.
    expect(isRowId("11111111-1111-4111-8111-111111111111")).toBe(false);
    expect(isRowId("not-a-uuid")).toBe(false);
    expect(isRowId("")).toBe(false);
  });

  it("never repeats", () => {
    const ids = new Set(Array.from({ length: 5_000 }, () => newRowId()));
    expect(ids.size).toBe(5_000);
  });
});

describe("ordering, which is the entire reason for v7 over v4", () => {
  it("sorts by creation time as a plain string", () => {
    // String-sortable matters: it means ORDER BY id is chronological, and the primary-key index
    // receives inserts at its end rather than scattered through it.
    let clock = 1_700_000_000_000;
    const ids = Array.from({ length: 200 }, () => {
      clock += 7;
      return newRowId(() => clock);
    });

    expect([...ids].sort()).toEqual(ids);
  });

  it("still sorts correctly for ids created inside the same millisecond", () => {
    // THE CLAIM THAT WOULD QUIETLY NOT BE TRUE. With random bits where the counter is, a burst
    // written in one millisecond would sort arbitrarily among itself — precisely where rows are
    // created fastest, which is exactly when ordering is being relied on.
    const frozen = 1_700_000_000_000;
    const ids = Array.from({ length: 500 }, () => newRowId(() => frozen));

    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(500);
  });

  it("survives more ids in one millisecond than the counter can hold", () => {
    // 4096 is the counter's ceiling. Beyond it the generator borrows the next millisecond rather
    // than reusing a counter value, because reuse would break the ordering it advertises.
    const frozen = 1_700_000_000_000;
    const ids = Array.from({ length: 4_200 }, () => newRowId(() => frozen));

    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(4_200);
  });

  it("does not go backwards when the clock does", () => {
    // Clocks do move backwards: an NTP correction, a host migration. Following the clock would
    // emit ids that sort before rows created earlier.
    const first = newRowId(() => 1_700_000_100_000);
    const afterCorrection = Array.from({ length: 20 }, () => newRowId(() => 1_700_000_000_000));

    for (const id of afterCorrection) {
      expect(id > first, `${id} sorted before an earlier row`).toBe(true);
    }
    expect([...afterCorrection].sort()).toEqual(afterCorrection);
  });

  it("carries the creation time, for diagnostics only", () => {
    // The timestamp has to be LATER than anything used earlier in this file, and that is the
    // generator being correct rather than the test being awkward: its monotonic counter is
    // process-wide, so asking for a time in the past gets the held value instead. The first
    // version of this test asked for 2023 after earlier tests had reached 2026, and got the
    // held value — which is exactly what should happen when a clock goes backwards.
    const at = 4_000_000_123_456;
    expect(rowIdTimestamp(newRowId(() => at))).toBe(at);
  });

  it("is stateful across calls, which callers should know", () => {
    // Worth asserting rather than leaving implicit: monotonicity is bought with process-wide
    // state. Two servers do not coordinate, so ids from different processes inside the same
    // millisecond order arbitrarily between themselves. That is fine for index locality and a
    // default sort, and it is why `version` — not the id — decides which of two writes won.
    const first = newRowId(() => 4_000_000_999_999);
    const second = newRowId(() => 1_000_000_000_000);

    expect(second > first).toBe(true);
  });
});
