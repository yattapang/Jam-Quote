import { readFileSync } from "node:fs";
import { methodBody, relationSelectKeys } from "../common/select-scan.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What an anonymous holder of a share token may read. A security boundary, so
 * it is pinned by name.
 *
 * ## The defect this closes
 *
 * `findByShareToken` reused `QUOTE_DETAIL_INCLUDE` — the TENANT's read — so every
 * public line carried the whole Prisma row. A client following a WhatsApp link
 * received, per line:
 *
 * - **`markupPct`**, the contractor's margin on that line. The most
 *   commercially sensitive number in a quote, handed to the one person who must
 *   not have it.
 * - `supplierId`, so which merchant they buy from
 * - `priceSource` and `overrideNote` — how the price was arrived at, and any
 *   internal note about why it was overridden
 * - `quoteId`, `sectionId`, `updatedAt`, `deletedAt` — plumbing
 *
 * The client page reads none of them. It renders description, quantity, unit and
 * amount.
 *
 * **It had never actually leaked**: `markupPct`, `supplierId` and `overrideNote`
 * are null on all 50 line items in production, and no quote currently holds a
 * live share token. So this was latent, not active — which is the only reason it
 * is being written up calmly rather than as an incident. The column is real and
 * the app supports markup, so the first contractor to use it and share a quote
 * would have shown their client the margin.
 *
 * ## Why this test reads the source
 *
 * The disclosure is decided by a `select`, and a select is a fact about the
 * source rather than about any value a unit test can construct. Asserting on a
 * sample row would pass the moment someone widened the select and the sample
 * happened not to include the new field.
 */

const SERVICE = join(process.cwd(), "src", "quotes", "quotes.service.ts");

/**
 * Exactly what a client may see on a line.
 *
 * **This is now the OUTPUT shape, not the Prisma select.** The select had to widen
 * — the line AMOUNT is `quantity x unitPrice x (1 + markup)`, and the client's page
 * was computing it from the unit price alone, which cannot include the markup and
 * so did not sum to the subtotal printed beneath it. The markup is now read,
 * applied, and dropped inside the service.
 *
 * That moves the allow-list from `PUBLIC_LINE_READ` to the `publicLine` function,
 * and this guard follows it. `unitPriceCents` is deliberately NOT here: the client
 * needs the amount, and sending the answer instead of two of its three inputs is
 * strictly less disclosure than before.
 */
const ALLOWED_LINE_FIELDS = [
  "id",
  "category",
  "description",
  "quantity",
  "rateUnit",
  "unitLabel",
  "amountCents",
  "gctTreatment",
];

/** Fields that must NEVER reach a client, named so the reason survives. */
const FORBIDDEN_LINE_FIELDS: Record<string, string> = {
  markupPct: "the contractor's margin on the line — READ to compute the amount, never sent",
  unitPriceCents: "read to compute the amount; the client is shown the amount itself",
  supplierId: "which merchant the contractor buys from",
  priceSource: "how the price was arrived at",
  overrideNote: "an internal note about a price override",
  quoteId: "internal plumbing",
  sectionId: "internal plumbing",
  deletedAt: "internal plumbing",
};

/**
 * The keys the `publicLine` mapper actually returns.
 *
 * Read from the function body rather than from the select, because the select is
 * no longer the boundary. A field added to `PUBLIC_LINE_READ` and left out of this
 * mapper is fine; a field added HERE is a disclosure.
 */
function publicLineOutputKeys(src: string): string[] {
  const start = src.indexOf("function publicLine(");
  expect(start, "publicLine should exist").toBeGreaterThan(-1);
  const bodyStart = src.indexOf("return {", start);
  expect(bodyStart, "publicLine should return an object literal").toBeGreaterThan(-1);
  let depth = 0;
  let i = src.indexOf("{", bodyStart);
  const open = i;
  for (; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const body = src.slice(open, i + 1);
  // Top-level keys only: nested calls (lineAmountCents({...})) must not leak their
  // argument names into the key set.
  let flat = "";
  depth = 0;
  for (const ch of body.slice(1, -1)) {
    if (ch === "{" || ch === "(") depth += 1;
    else if (ch === "}" || ch === ")") depth -= 1;
    else if (depth === 0) flat += ch;
    if ((ch === "{" || ch === "(") && depth === 1) flat = flat.replace(/[\w]+\s*:\s*$/, "");
  }
  return [...flat.matchAll(/(\w+)\s*:/g)].map((m) => m[1]!);
}

describe("the public quote line", () => {
  const src = readFileSync(SERVICE, "utf8");

  it("sends exactly the fields the client page renders", () => {
    expect(publicLineOutputKeys(src).sort()).toEqual([...ALLOWED_LINE_FIELDS].sort());
  });

  it.each(Object.entries(FORBIDDEN_LINE_FIELDS))(
    "never discloses %s (%s)",
    (field) => {
      expect(publicLineOutputKeys(src)).not.toContain(field);
    },
  );

  it("reads the markup, so the amount it sends is the one on the document", () => {
    // The other half. Dropping markupPct from the READ would make the amount wrong
    // rather than disclosive — quieter, and just as bad for the client.
    expect(src).toContain("markupPct: true");
    expect(src).toContain("lineAmountCents(");
  });

  /**
   * Every OTHER select inside `findByShareToken`, pinned by key set.
   *
   * This guard used to parse `PUBLIC_LINE_SELECT` and nothing else, and
   * `TESTING.md` called the public view "guarded twice" on that basis. An
   * independent review found the rest of the read unpinned: adding
   * `billingContactEmail: true` to the `business` select compiled and passed the
   * whole suite. A fake Prisma cannot catch it either, because a fake returns
   * what the fake says and ignores the select entirely — so reading the source is
   * the only thing that can fail in CI.
   *
   * `assertPublicShape` catches it at runtime and fails closed, which protects
   * production. This is what stops it reaching production.
   */
  describe("the rest of the public read", () => {
    const body = methodBody(src, "findByShareToken");

    it("sends only the letterhead fields the document prints", () => {
      // A business row also holds billingContactEmail, currency, logoUrl and the
      // subscription. The client is shown a letterhead, not an account.
      expect(relationSelectKeys(body, "business").sort()).toEqual(
        ["addressLine", "name", "parish", "town", "trn"].sort(),
      );
    });

    it("reads only the two client name parts, because clientName is derived", () => {
      // Not a disclosure risk today — clientName is built from these and the row
      // never leaves. Pinned anyway: the next person to return `client` whole
      // would be shipping whatever had accumulated here.
      expect(relationSelectKeys(body, "client").sort()).toEqual(["firstName", "lastName"].sort());
    });

    it("sends only a section's own title, never its internal columns", () => {
      // Nested blocks are stripped before the keys are read, so the section's own
      // key set is exactly its own — and a field APPENDED after the nested
      // `lineItems` entry is caught. The first version bounded the scan at
      // `indexOf("lineItems:")` and missed exactly that.
      expect(relationSelectKeys(body, "sections").sort()).toEqual(["id", "title"].sort());
    });
  });

  it("does NOT reuse the tenant's detail include for the public view", () => {
    // The original defect in one line. The tenant read returns whole rows; the
    // public read must not borrow it.
    const start = src.indexOf("async findByShareToken");
    const end = src.indexOf("async ", start + 10);
    const body = src.slice(start, end === -1 ? undefined : end);
    expect(body).not.toContain("...QUOTE_DETAIL_INCLUDE");
    expect(body).toContain("PUBLIC_LINE_SELECT");
  });

  it("declares the public line type explicitly, not as an alias of the tenant row", () => {
    // `lineItems: QuoteWithLines["lineItems"]` is how the boundary widened
    // silently: a type that means "whatever the tenant read returns" cannot be
    // reviewed as a disclosure decision.
    expect(src).toContain("lineItems: PublicQuoteLine[]");
    expect(src).not.toContain('lineItems: QuoteWithLines["lineItems"]');
  });
});
