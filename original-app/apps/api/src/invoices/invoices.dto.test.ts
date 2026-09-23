import { describe, it, expect } from "vitest";
import { GctTreatment, LineCategory, RateUnit } from "@jamquote/core";
import { createInvoiceSchema, updateInvoiceSchema } from "./invoices.dto.js";

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
 * Same overflow risk as a quote (see quotes.dto.test.ts): a line's own
 * quantity/price are each capped, but the summed subtotalCents/totalCents —
 * both a Postgres `Int` column — are not, so enough large-but-legal lines
 * used to overflow into an unhandled 500 instead of a named 400.
 */
describe("createInvoiceSchema / updateInvoiceSchema — invoice total fits Int32", () => {
  it("LOW/item 6: refuses a payload whose per-line-legal quantity x price overflows the invoice total", () => {
    const result = createInvoiceSchema.safeParse({ lineItems: [bigLine(), bigLine()] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("This invoice's total is too large");
    }
  });

  it("accepts a normal invoice total", () => {
    const result = createInvoiceSchema.safeParse({
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
    const result = createInvoiceSchema.safeParse({
      sections: [{ title: "Materials", lineItems: [bigLine(), bigLine()] }],
    });
    expect(result.success).toBe(false);
  });

  it("updateInvoiceSchema refuses the same overflowing payload", () => {
    const result = updateInvoiceSchema.safeParse({ lineItems: [bigLine(), bigLine()] });
    expect(result.success).toBe(false);
  });

  it("updateInvoiceSchema with no line items skips the check (a header-only edit)", () => {
    const result = updateInvoiceSchema.safeParse({ terms: "Net 30" });
    expect(result.success).toBe(true);
  });
});
