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
 * `findByShareToken` reused `INVOICE_DETAIL_INCLUDE` — the TENANT's read — so every
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

const SERVICE = join(process.cwd(), "src", "invoices", "invoices.service.ts");

/** Exactly what a client may see. Adding to this list is a disclosure decision
 * and should be argued for in the diff that adds it. */
const ALLOWED_LINE_FIELDS = [
  "id",
  "category",
  "description",
  "quantity",
  "rateUnit",
  "unitLabel",
  "unitPriceCents",
  "gctTreatment",
];

/** Fields that must NEVER reach a client, named so the reason survives. */
const FORBIDDEN_LINE_FIELDS: Record<string, string> = {
  markupPct: "the contractor's margin on the line",
  supplierId: "which merchant the contractor buys from",
  priceSource: "how the price was arrived at",
  overrideNote: "an internal note about a price override",
  invoiceId: "internal plumbing",
  sectionId: "internal plumbing",
  deletedAt: "internal plumbing",
};

function publicLineSelect(src: string): string[] {
  const start = src.indexOf("const PUBLIC_LINE_SELECT = {");
  expect(start, "PUBLIC_LINE_SELECT should exist").toBeGreaterThan(-1);
  const end = src.indexOf("} as const;", start);
  const block = src.slice(start, end);
  return [...block.matchAll(/^\s{2,}(\w+)\s*:\s*true,?\s*$/gm)].map((m) => m[1]!);
}

describe("the public invoice line select", () => {
  const src = readFileSync(SERVICE, "utf8");

  it("names exactly the fields the client page renders", () => {
    expect(publicLineSelect(src).sort()).toEqual([...ALLOWED_LINE_FIELDS].sort());
  });

  it.each(Object.entries(FORBIDDEN_LINE_FIELDS))(
    "never discloses %s (%s)",
    (field) => {
      expect(publicLineSelect(src)).not.toContain(field);
    },
  );

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
    expect(body).not.toContain("...INVOICE_DETAIL_INCLUDE");
    expect(body).toContain("PUBLIC_LINE_SELECT");
  });

  it("declares the public line type explicitly, not as an alias of the tenant row", () => {
    // `lineItems: InvoiceWithLines["lineItems"]` is how the boundary widened
    // silently: a type that means "whatever the tenant read returns" cannot be
    // reviewed as a disclosure decision.
    expect(src).toContain("lineItems: PublicInvoiceLine[]");
    expect(src).not.toContain('lineItems: InvoiceWithLines["lineItems"]');
  });
});
