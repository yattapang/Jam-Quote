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


/**
 * Every figure a client is SENT is either rendered or deliberately not.
 *
 * `discountPct` was sent to both public pages and rendered on neither, so a
 * discounted document showed a subtotal, a GCT figure and a total that did not add
 * up, with the reduction invisible. It was fixed on the quote page first and the
 * invoice page was missed — in the same commit that edited that very file.
 *
 * So this asserts the pair together. Two pages that must agree are exactly where a
 * per-file fix goes half-done.
 */
describe("the public documents render the discount they are sent", () => {
  const pages = [
    ["quote", join(WEB, "app", "q", "[token]", "page.tsx")],
    ["invoice", join(WEB, "app", "i", "[token]", "page.tsx")],
  ] as const;

  it.each(pages)("the public %s page renders a Discount row", (_which, file) => {
    const src = stripComments(readFileSync(file, "utf8"));
    // The contract sends discountPct; a page that reads it and prints nothing is
    // showing the client arithmetic that does not close.
    expect(src).toMatch(/discountPct/);
    expect(src).toMatch(/Discount/);
  });

  it.each(pages)("the public %s page does not work out line amounts itself", (_which, file) => {
    // The server sends amountCents, computed with the markup it withholds. A page
    // multiplying quantity by a unit price cannot include the markup, so its lines
    // would not sum to the subtotal printed beneath them.
    const src = stripComments(readFileSync(file, "utf8"));
    expect(src).not.toMatch(/quantity\)\s*\*/);
    expect(src).toMatch(/amountCents/);
  });
});
