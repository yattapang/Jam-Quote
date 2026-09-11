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

/**
 * The classes of dishonesty, not the historical strings.
 *
 * A review showed the assertions above are five denylists of figures already deleted
 * plus a naming-convention check — they can only re-detect the exact past defect. They
 * passed green alongside a lifetime quote count labelled "This month", a status pill
 * that could only ever say "Active", an unconditional "Verified ✓", and a fake search
 * box. Every original fabrication was written as a literal inlined at its render site,
 * which matches no pattern here and declares no `const`.
 *
 * So these assert the SHAPE of each defect. Each one fails on the version of this file
 * from before the fix, which is the only test of a guard worth having.
 */
describe("the console cannot claim a figure it does not have", () => {
  // Comments stripped first. The badge assertion matched its own explanatory
  // comment — the text it was written to police appears in the note describing the
  // defect, which is a false positive a guard should not have.
  const src = readFileSync(join(process.cwd(), "app", "admin", "AdminConsole.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "");

  it("no metric is labelled with a time window the API does not send", () => {
    // "This month" was rendered from a lifetime count, because there is no monthly
    // figure in the payload. A window in a label is a claim about the query behind it.
    for (const label of ["This month", "this month", "Today", "This week"]) {
      expect(src, `"${label}" implies a windowed query — say (all time) or add the query`).not.toContain(
        `label: "${label}"`,
      );
    }
  });

  it("every Verified badge sits inside a condition", () => {
    // It read `<span style={verified}>Verified ✓</span>` unconditionally, beneath a
    // banner saying nobody had confirmed the figures.
    const badges = [...src.matchAll(/Verified ✓/g)];
    for (const m of badges) {
      const before = src.slice(Math.max(0, m.index! - 200), m.index!);
      expect(before, "a Verified badge must be conditional").toMatch(/\?|&&/);
    }
  });

  it("does not read Subscription.status, which is only ever written 'active'", () => {
    // Three of the four branches of the old statusMap were unreachable, and its
    // fallback asserted a healthy green account for anything it did not recognise.
    expect(src).not.toMatch(/statusMap\s*[:=]/);
    expect(src).not.toContain('past_due: [');
  });

  it("nothing that looks clickable lacks a handler", () => {
    // The tenant filter pills carried `cursor: "pointer"` and no onClick, so "Past
    // due (3)" looked like a filter and did nothing.
    const pointers = [...src.matchAll(/cursor:\s*"pointer"/g)];
    for (const m of pointers) {
      const before = src.slice(Math.max(0, m.index! - 400), m.index!);
      // A style FACTORY (`(id): CSSProperties => ({ ... })`) is applied at call
      // sites far away, so no window can see their handlers. Those are fine — the
      // defect was a pointer cursor in an INLINE style on an element with none.
      if (before.includes("CSSProperties")) continue;
      // A generous window and `disabled=` as evidence: these inline styles run to
      // several hundred characters, so a handler on the same element can be a long
      // way from the cursor declaration.
      const around = src.slice(Math.max(0, m.index! - 1400), m.index! + 1400);
      expect(around, "a pointer cursor promises a click").toMatch(
        /onClick|disabled=|<a |<button|<Link/,
      );
    }
  });
});
