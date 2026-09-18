import { describe, it, expect } from "vitest";
import { createQuoteSchema, updateQuoteSchema } from "./quotes.dto.js";

/**
 * Register item: the web builder refuses `validDays < BOUNDS.validDays.min`,
 * but the API DTO took `z.coerce.date()` with no lower bound at all, so a
 * client could bypass the form and save a quote that is already expired.
 *
 * Chosen rule: `validUntil`, when present in the payload, must not be a date
 * before the start of today in Jamaica time. `update` is a `.partial()` of
 * `create`, so the same bound applies to both — but only when the field is
 * actually supplied. An update that omits `validUntil` falls back to
 * `existing.validUntil` in `quotes.service.ts`, so editing an old quote whose
 * date has already passed (without touching that field) never becomes
 * impossible.
 */
describe("createQuoteSchema / updateQuoteSchema validUntil bound", () => {
  it("refuses a validUntil already in the past on create", () => {
    const result = createQuoteSchema.safeParse({ validUntil: "2020-01-01" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes("validUntil"));
      expect(issue).toBeDefined();
      expect(issue?.message).toMatch(/validUntil/);
    }
  });

  it("refuses a validUntil already in the past on update", () => {
    const result = updateQuoteSchema.safeParse({ validUntil: "2020-01-01" });
    expect(result.success).toBe(false);
  });

  it("accepts a future validUntil on create", () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = createQuoteSchema.safeParse({ validUntil: future });
    expect(result.success).toBe(true);
  });

  it("accepts an update that omits validUntil entirely, regardless of the field's other bounds", () => {
    const result = updateQuoteSchema.safeParse({ terms: "Net 30" });
    expect(result.success).toBe(true);
  });

  it("accepts today (start of day, Jamaica time) as valid, not just strictly future dates", () => {
    // Jamaica is UTC-5 with no DST: "today" starts at 05:00 UTC.
    const nowUtc = Date.now();
    const jamaicaOffsetMs = 5 * 60 * 60 * 1000;
    const jamaicaMidnightUtcMs =
      Math.floor((nowUtc - jamaicaOffsetMs) / 86_400_000) * 86_400_000 + jamaicaOffsetMs;
    const result = createQuoteSchema.safeParse({
      validUntil: new Date(jamaicaMidnightUtcMs).toISOString(),
    });
    expect(result.success).toBe(true);
  });
});
