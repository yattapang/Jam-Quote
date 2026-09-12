import { describe, expect, it } from "vitest";
import { recordSubscriptionPaymentSchema } from "./admin.dto.js";

/**
 * Bounds on the admin payment form, which is load-bearing for what a tenant gets.
 *
 * `paidAt` was `z.string().datetime()` with no range. `reallocateTerms` uses it as the
 * start of a term, and `record()` reallocates AFTER inserting the row — so the new row
 * sorts last by `paidAt` and anchors everything after it. A review keyed
 * `paidAt: "2126-01-15T00:00:00.000Z"` and got `renewsAt = 2126-02-15` from a single
 * request: a century of Pro, no second payment, no confirmation step.
 *
 * PLANNING.md listed this as an owner question described as "a typo'd year grants a
 * year of Pro, and poisons every later payment's allocation". It was worse on both
 * counts.
 */

const base = { amountCents: 250_000, method: "CASH" as const };

describe("recordSubscriptionPaymentSchema.paidAt", () => {
  it("accepts a back-dated payment, because taking cash on site last week is normal", () => {
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(recordSubscriptionPaymentSchema.safeParse({ ...base, paidAt: lastWeek }).success).toBe(
      true,
    );
  });

  it("accepts an omitted date, which means now", () => {
    expect(recordSubscriptionPaymentSchema.safeParse(base).success).toBe(true);
  });

  it("refuses a typo'd century", () => {
    const result = recordSubscriptionPaymentSchema.safeParse({
      ...base,
      paidAt: "2126-01-15T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
    // Named in words a staffer can act on, not as a path into a schema.
    expect(result.success ? "" : result.error.issues[0]!.message).toMatch(
      /cannot be in the future/i,
    );
  });

  it("refuses next month, not just an absurd year", () => {
    // The bound has to catch the plausible typo too — a fat-fingered month grants a
    // month of Pro just as quietly as a fat-fingered century grants a century.
    const nextMonth = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      recordSubscriptionPaymentSchema.safeParse({ ...base, paidAt: nextMonth }).success,
    ).toBe(false);
  });

  it("tolerates a day of clock skew, so a browser running fast is not refused", () => {
    const slightlyAhead = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(
      recordSubscriptionPaymentSchema.safeParse({ ...base, paidAt: slightlyAhead }).success,
    ).toBe(true);
  });
});
