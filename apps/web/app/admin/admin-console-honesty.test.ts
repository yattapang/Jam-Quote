import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A source guard over the staff console.
 *
 * The console was largely a design mock with a few real values threaded in. It
 * fell back to invented tenant rows whenever a section failed to load, showed
 * a hardcoded MRR that was never real, a 12-month revenue series with no data
 * source, five fictional signups and four fabricated system alerts. In a
 * console used to decide who to suspend and what to bill, invented figures are
 * worse than an outage: they are actionable and they look authoritative.
 *
 * This cannot be caught by a behaviour test — the fake values were valid
 * TypeScript and rendered perfectly. So the invariant is enforced over source
 * text: the specific fabrications must not come back, and if a new mock is
 * added it should trip the "recognisable placeholder" check.
 */
const SOURCE = readFileSync(join(__dirname, "AdminConsole.tsx"), "utf8");

/** Comments explain what was removed and why — strip them before scanning. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the staff console shows no invented data", () => {
  it("has no hardcoded platform figures", () => {
    // Each of these was rendered to staff as though it were measured.
    for (const fabricated of ["2418540", "1,284", "108,420", '"892"', "1.9%"]) {
      expect(CODE).not.toContain(fabricated);
    }
  });

  it("invents nothing in the tenant drawer", () => {
    // The drawer is where staff decide whether to suspend or bill a business,
    // so invented figures here are the most expensive kind. It used to carry
    // seat counts and quota caps derived from a plan-name lookup, storage
    // usage, "invoices sent" as quotes x 0.6, a hardcoded per-plan price
    // table, and fixed started/renews dates with a payment rail.
    for (const fabricated of [
      '"2.1 / 10 GB"',
      "2024-08-19",
      "2025-05-19",
      '"Lynk"',
      "q * 0.6",
      "Starter: 4900",
    ]) {
      expect(CODE).not.toContain(fabricated);
    }
  });

  it("has no platform supplier directory left", () => {
    // Suppliers became tenant-owned in #31. What remained was a dead
    // /admin/suppliers fetch that 404'd on every admin page load, and a
    // "Suppliers added" tile implying the platform maintains them.
    expect(CODE).not.toContain("Suppliers added");
  });

  it("has no fictional tenant names", () => {
    for (const name of [
      "Blue Mountain Builders",
      "Reef & Rock Masonry",
      "Portmore Concrete",
      "Yallahs Roofing",
      "Spanish Town Steelworks",
      "Ocho Rios Renovations",
    ]) {
      expect(CODE).not.toContain(name);
    }
  });

  it("keeps no *Mock fallback arrays", () => {
    // The fallback is what made a failed fetch indistinguishable from real
    // data. Empty must be allowed to render as empty.
    expect(CODE).not.toMatch(/const \w*Mock\w*\s*[:=]/);
  });

  it("tells the viewer when a section failed to load", () => {
    // With the mocks gone, silence would make "could not reach the API" look
    // identical to "this platform has no tenants".
    expect(CODE).toContain("data.failed");
  });
});
