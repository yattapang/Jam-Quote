import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The two CLIENT-FACING documents state retention rather than hiding it.
 *
 * The general rule — nothing outside core decides an invoice balance — moved to
 * `packages/core/src/costing/retention-usage.test.ts`, which scans every
 * workspace and covers comparisons as well as subtractions. This one keeps only
 * what is specific to the documents a client actually reads, because those are
 * the surfaces where a wrong figure reaches someone outside the business.
 *
 * On a $100,000 invoice with 10% held and $90,000 paid, the app's own screens said
 * "fully paid apart from retention" while the PDF in the client's hand asked for
 * $10,000. The word "retention" appeared nowhere in that file.
 */

const WEB = process.cwd();

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("the client-facing document states retention rather than hiding it", () => {
  const pdf = readFileSync(join(WEB, "lib", "pdf", "InvoicePdf.tsx"), "utf8");

  it("the invoice PDF mentions retention at all", () => {
    // It did not. A client seeing a smaller "amount due" with no explanation
    // reads it as an error in their favour and queries it — or worse, does not.
    expect(pdf).toMatch(/[Rr]etention/);
  });

  it("the invoice PDF resolves its balance through core", () => {
    expect(stripComments(pdf)).toContain("settlementOf(");
  });

  it("the covering email resolves it the same way", () => {
    // These two must never disagree: the client reads the email and opens the
    // attachment, and two figures for one debt is two invoices.
    const route = join(WEB, "app", "(app)", "invoices", "[id]", "email", "route.ts");
    expect(existsSync(route), `expected ${basename(route)} to exist`).toBe(true);
    expect(stripComments(readFileSync(route, "utf8"))).toContain("settlementOf(");
  });
});
