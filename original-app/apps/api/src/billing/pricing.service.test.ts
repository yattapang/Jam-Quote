import { describe, expect, it } from "vitest";
import { DEFAULT_PRICING } from "./pricing.service.js";

/**
 * PLANNING.md's owner decision (2026-08-18, "Trial | None. Free tier is 3 quotes/month").
 * The in-code default read 5.
 *
 * The LIVE row is moved by migration `20260913090000_free_tier_three_quotes`, which
 * changes it only while it still holds the original seeded 5, so an admin's later
 * choice stands. The original seed migration is deliberately left at 5: it has been
 * applied, and editing it would break Prisma's checksum on every deployed database.
 *
 * What this does not prove: the value in any particular database. That row is
 * admin-editable by design; only the code default is pinned here.
 */
describe("PricingConfig default", () => {
  it("is the decided free tier (PLANNING.md: 3 quotes/month)", () => {
    expect(DEFAULT_PRICING.freeQuotesPerMonth).toBe(3);
  });
});
