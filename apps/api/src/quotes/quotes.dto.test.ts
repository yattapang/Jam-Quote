import { describe, it, expect } from "vitest";
import { GctTreatment, LineCategory, RateUnit } from "@jamquote/core";
import { createQuoteSchema, updateQuoteSchema } from "./quotes.dto.js";

function bigLine(over: Partial<Record<string, unknown>> = {}) {
  return {
    category: LineCategory.OTHER,
    description: "Bulk material",
    quantity: 999_999_999,
    rateUnit: RateUnit.UNIT,
    unitPriceCents: 2_147_483_647,
    gctTreatment: GctTreatment.STANDARD,
    ...over,
  };
}

/**
 * Register item: the web builder refuses `validDays < BOUNDS.validDays.min`,
 * but the API DTO took `z.coerce.date()` with no lower bound at all, so a
 * client could bypass the form and save a quote that is already expired.
 *
 * Chosen rule: `validUntil`, when present in the payload on CREATE, must not
 * be a date before the start of today in Jamaica time.
 *
 * `update` does NOT carry this refine at the DTO level (option (b) from the
 * review item): the DTO alone has no access to the quote's stored
 * `validUntil`, so it cannot tell "unchanged, already-expired date carried
 * over" from "a genuinely new past date" — and the former must stay
 * editable, or an old draft becomes permanently stuck once its date passes.
 * `quotes.service.ts#update` enforces "not in the past" itself, comparing
 * the incoming value against what is already stored, and only refuses when
 * the value being SAVED actually changes. See quotes.service.test.ts for
 * that behaviour.
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

  it("accepts a validUntil already in the past at the DTO level on update (the service enforces it, not the DTO)", () => {
    const result = updateQuoteSchema.safeParse({ validUntil: "2020-01-01" });
    expect(result.success).toBe(true);
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

  /**
   * `new Date("2026-09-17")` parses a bare date as UTC MIDNIGHT — 7pm the
   * previous evening in Jamaica (UTC-5, no DST). A date-only "today" string
   * must be read as Jamaica-local midnight instead, or a contractor sending
   * today's date on the day of gets refused for a "past" date 5 hours early.
   */
  describe("date-only (YYYY-MM-DD) strings are read as Jamaica calendar dates", () => {
    function jamaicaDateOnlyString(offsetDays: number): string {
      const jamaicaOffsetMs = 5 * 60 * 60 * 1000;
      const jamaicaNowMs = Date.now() - jamaicaOffsetMs;
      const jamaicaMs = jamaicaNowMs + offsetDays * 86_400_000;
      return new Date(jamaicaMs).toISOString().slice(0, 10);
    }

    it("accepts today's date-only string", () => {
      const result = createQuoteSchema.safeParse({ validUntil: jamaicaDateOnlyString(0) });
      expect(result.success).toBe(true);
    });

    it("refuses yesterday's date-only string", () => {
      const result = createQuoteSchema.safeParse({ validUntil: jamaicaDateOnlyString(-1) });
      expect(result.success).toBe(false);
    });

    it("accepts tomorrow's date-only string", () => {
      const result = createQuoteSchema.safeParse({ validUntil: jamaicaDateOnlyString(1) });
      expect(result.success).toBe(true);
    });

    it("accepts a full ISO timestamp just before Jamaica midnight for TODAY (still yesterday's calendar date, but a real moment already in the past is refused; this pins the boundary is evaluated in real time, not by string)", () => {
      // Jamaica midnight today, expressed in UTC, minus 1ms: this instant is
      // definitely already in the past relative to itself, so it must refuse.
      const jamaicaOffsetMs = 5 * 60 * 60 * 1000;
      const nowUtc = Date.now();
      const jamaicaMidnightUtcMs =
        Math.floor((nowUtc - jamaicaOffsetMs) / 86_400_000) * 86_400_000 + jamaicaOffsetMs;
      const justBefore = new Date(jamaicaMidnightUtcMs - 86_400_000).toISOString();
      const result = createQuoteSchema.safeParse({ validUntil: justBefore });
      expect(result.success).toBe(false);
    });

    it("accepts a full ISO timestamp just after Jamaica midnight today", () => {
      const jamaicaOffsetMs = 5 * 60 * 60 * 1000;
      const nowUtc = Date.now();
      const jamaicaMidnightUtcMs =
        Math.floor((nowUtc - jamaicaOffsetMs) / 86_400_000) * 86_400_000 + jamaicaOffsetMs;
      const justAfter = new Date(jamaicaMidnightUtcMs + 1).toISOString();
      const result = createQuoteSchema.safeParse({ validUntil: justAfter });
      expect(result.success).toBe(true);
    });
  });
});

describe("createQuoteSchema / updateQuoteSchema — quote total fits Int32", () => {
  it("LOW/item 6: refuses a payload whose per-line-legal quantity x price overflows the quote total, with a plain message", () => {
    // Each line's own quantity and unitPriceCents individually pass their
    // field caps, but summed across lines the subtotal/total blow past the
    // Postgres Int column (subtotalCents/totalCents) — previously an
    // unhandled 500 instead of a named 400.
    const result = createQuoteSchema.safeParse({ lineItems: [bigLine(), bigLine()] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("This quote's total is too large");
    }
  });

  it("accepts a normal quote total", () => {
    const result = createQuoteSchema.safeParse({
      lineItems: [
        {
          category: LineCategory.MATERIAL,
          description: "Cement",
          quantity: 10,
          rateUnit: RateUnit.UNIT,
          unitPriceCents: 5000,
          gctTreatment: GctTreatment.STANDARD,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("checks lines nested inside sections too", () => {
    const result = createQuoteSchema.safeParse({
      sections: [{ title: "Materials", lineItems: [bigLine(), bigLine()] }],
    });
    expect(result.success).toBe(false);
  });

  it("updateQuoteSchema refuses the same overflowing payload", () => {
    const result = updateQuoteSchema.safeParse({ lineItems: [bigLine(), bigLine()] });
    expect(result.success).toBe(false);
  });

  it("updateQuoteSchema with no line items skips the check (a header-only edit)", () => {
    const result = updateQuoteSchema.safeParse({ terms: "Net 30" });
    expect(result.success).toBe(true);
  });
});
