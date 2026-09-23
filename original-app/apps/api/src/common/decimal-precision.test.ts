import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { computeTotals, GctTreatment, LineCategory, RateUnit } from "@jamquote/core";
import { createQuoteSchema } from "../quotes/quotes.dto";
import { createInvoiceSchema } from "../invoices/invoices.dto";
import { createJobSchema, updateJobSchema } from "../jobs/jobs.dto";
import { createBusinessSchema } from "../business/business.dto";
import { createMaterialFavouriteSchema } from "../catalogs/catalogs.dto";
import { createProjectSchema } from "../projects/projects.dto";
import { createLabourEntrySchema } from "../purchases/purchases.dto";

/**
 * S9: a DTO must not accept a number its Decimal column would round.
 *
 * The stored `subtotalCents` is computed from the SUBMITTED values; every reader
 * (public page, detail page, PDF) recomputes from the PERSISTED ones. Postgres
 * rounds `numeric(p,s)` half away from zero on write, modelled here with
 * `Prisma.Decimal` ROUND_HALF_UP. If the DTO refuses anything beyond the scale,
 * submitted and persisted are the same number and the totals cannot diverge.
 *
 * Limit: this asserts the DTOs; it does not run a real Postgres write.
 */

const persist = (v: number, scale: number) =>
  Number(new Prisma.Decimal(v).toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_UP));

const line = (over: Record<string, unknown> = {}) => ({
  category: LineCategory.MATERIAL,
  description: "Tile",
  quantity: 1,
  rateUnit: RateUnit.UNIT,
  unitPriceCents: 1_000_000, // $10,000
  ...over,
});

const quote = (l: Record<string, unknown>, head: Record<string, unknown> = {}) =>
  createQuoteSchema.safeParse({ lineItems: [line(l)], ...head });

describe("S9 — validated precision matches persisted precision", () => {
  it("the executed defect: quantity 1.0005 at $10,000 would have stored a subtotal $5 off", () => {
    const at = (q: number) =>
      computeTotals({ lines: [{ quantity: q, unitPriceCents: 1_000_000, gctTreatment: GctTreatment.STANDARD }], gctRatePct: 15 });
    expect(at(1.0005).subtotalCents - at(persist(1.0005, 3)).subtotalCents).toBe(-500);
  });

  it("refuses quantity 1.0005 on a quote and an invoice line, naming the field", () => {
    const q = quote({ quantity: 1.0005 });
    expect(q.success).toBe(false);
    if (!q.success) {
      const issue = q.error.issues.find((i) => i.path.includes("quantity"));
      expect(issue?.message).toBe("Use at most 3 decimal places");
    }
    expect(createInvoiceSchema.safeParse({ lineItems: [line({ quantity: 1.0005 })] }).success).toBe(false);
  });

  it("accepts values at the column scale, and their stored totals equal a recomputation from persisted values", () => {
    const r = quote({ quantity: 1.005, markupPct: 12.35 }, { gctRatePct: 16.5, discountPct: 2.25 });
    expect(r.success).toBe(true);
    if (!r.success) return;
    const l = r.data.lineItems![0]!;
    const stored = computeTotals({
      lines: [{ quantity: l.quantity, unitPriceCents: l.unitPriceCents, markupPct: l.markupPct, gctTreatment: l.gctTreatment }],
      gctRatePct: r.data.gctRatePct!,
      discountPct: r.data.discountPct,
    });
    const reread = computeTotals({
      lines: [{ quantity: persist(l.quantity, 3), unitPriceCents: l.unitPriceCents, markupPct: persist(l.markupPct!, 2), gctTreatment: l.gctTreatment }],
      gctRatePct: persist(r.data.gctRatePct!, 2),
      discountPct: persist(r.data.discountPct!, 2),
    });
    expect(stored).toEqual(reread);
  });

  it("refuses a line or job markupPct above the column range, and at more than 2 places", () => {
    expect(quote({ markupPct: 1000 }).success).toBe(true);
    expect(quote({ markupPct: 1000.01 }).success).toBe(false);
    expect(quote({ markupPct: 12.345 }).success).toBe(false);
    // Job markup was unbounded against Decimal(6,2): 10000 cannot be stored at all.
    expect(createJobSchema.safeParse({ name: "J", unit: "m", markupPct: 10_000 }).success).toBe(false);
    expect(updateJobSchema.safeParse({ markupPct: 1000.01 }).success).toBe(false);
    expect(updateJobSchema.safeParse({ markupPct: 12.345 }).success).toBe(false);
    expect(updateJobSchema.safeParse({ markupPct: 1000 }).success).toBe(true);
  });

  it("refuses header percentages beyond 2 places, on quotes and invoices", () => {
    expect(quote({}, { gctRatePct: 16.667 }).success).toBe(false);
    expect(quote({}, { discountPct: 3.333 }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ discountPct: 3.333 }).success).toBe(false);
  });

  it("refuses every other over-scale Decimal field", () => {
    const comp = { kind: "MATERIAL", description: "c", unitPriceCents: 1, quantityPerUnit: 0.0005 };
    expect(createJobSchema.safeParse({ name: "J", unit: "m", components: [comp] }).success).toBe(false);
    expect(createJobSchema.safeParse({ name: "J", unit: "m", components: [{ ...comp, quantityPerUnit: 0.005 }] }).success).toBe(true);
    expect(createBusinessSchema.safeParse({ name: "B", jmdPerUsd: 157.12345 }).success).toBe(false);
    expect(createBusinessSchema.safeParse({ name: "B", jmdPerUsd: 1_000_000 }).success).toBe(false);
    expect(createBusinessSchema.safeParse({ name: "B", jmdPerUsd: 157.1234 }).success).toBe(true);
    expect(createBusinessSchema.safeParse({ name: "B", defaultGctRate: 15.001 }).success).toBe(false);
    expect(createMaterialFavouriteSchema.safeParse({ priceCents: 1, coveragePerSellUnit: 1.00001 }).success).toBe(false);
    expect(createMaterialFavouriteSchema.safeParse({ priceCents: 1, wastePct: 5.555 }).success).toBe(false);
    expect(createProjectSchema.shape.retentionPct.safeParse(5.555).success).toBe(false);
    expect(createLabourEntrySchema.shape.quantity.safeParse(1.0005).success).toBe(false);
    expect(createLabourEntrySchema.shape.quantity.safeParse(7.5).success).toBe(true);
  });
});
