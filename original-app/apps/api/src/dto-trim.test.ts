import { describe, expect, it } from "vitest";
import { quoteLineItemSchema } from "@jamquote/core";
import { updateRulePackSchema } from "./rulepack/rulepack.dto.js";
import { quoteSectionInputSchema, quoteLineJobComponentSchema, quoteLineItemInputSchema, quoteDecisionSchema } from "./quotes/quotes.dto.js";
import { invoiceSectionInputSchema, invoiceLineJobComponentSchema } from "./invoices/invoices.dto.js";
import { assemblyComponentInputSchema, createJobSchema } from "./jobs/jobs.dto.js";
import { createLabourRateSchema, createMaterialFavouriteSchema, createEquipmentItemSchema, createSupplierSchema, createMaterialCategorySchema } from "./catalogs/catalogs.dto.js";
import { hardDeleteTenantSchema, createRegulatoryUpdateSchema } from "./admin/admin.dto.js";
import { createClientSchema, updateClientSchema } from "./clients/clients.dto.js";
import { registerSchema } from "./auth/auth.dto.js";
import { createPurchaseSchema, createLabourEntrySchema } from "./purchases/purchases.dto.js";
import { createProjectSchema } from "./projects/projects.dto.js";
import { createBusinessSchema } from "./business/business.dto.js";

/**
 * A whitespace-only value is not the empty string a bare `.min(1)` catches —
 * it is a truthy, "present" value that still carries no meaning. Each of
 * these fields stores something a person reads back (a name, a label, a
 * description, a title) or matches for a safety confirmation, so a blank
 * masquerading as content must be refused, and any incidental leading/
 * trailing whitespace on real content must not survive to storage.
 */
describe("DTO string fields: whitespace-only is refused, real content is trimmed", () => {
  it("rulepack: taxLabel", () => {
    expect(updateRulePackSchema.safeParse({ taxLabel: "   " }).success).toBe(false);
    expect(updateRulePackSchema.parse({ taxLabel: "  VAT " }).taxLabel).toBe("VAT");
  });

  it("rulepack: statutoryCustom.label and .note", () => {
    const bad = updateRulePackSchema.safeParse({
      statutoryCustom: [{ code: "X", label: "   ", appliesTo: "BOTH" }],
    });
    expect(bad.success).toBe(false);

    const parsed = updateRulePackSchema.parse({
      statutoryCustom: [{ code: "X", label: " Levy ", appliesTo: "BOTH", note: "  from admin  " }],
    });
    expect(parsed.statutoryCustom![0]!.label).toBe("Levy");
    expect(parsed.statutoryCustom![0]!.note).toBe("from admin");
  });

  it("rulepack: statutoryRetired entries", () => {
    expect(updateRulePackSchema.safeParse({ statutoryRetired: ["   "] }).success).toBe(false);
    expect(updateRulePackSchema.parse({ statutoryRetired: [" NIS "] }).statutoryRetired).toEqual([
      "NIS",
    ]);
  });

  it("core: quoteLineItemSchema.description (shared by quotes and invoices)", () => {
    const base = {
      category: "MATERIAL",
      quantity: 1,
      rateUnit: "UNIT",
      unitPriceCents: 100,
    } as const;
    expect(quoteLineItemSchema.safeParse({ ...base, description: "   " }).success).toBe(false);
    expect(quoteLineItemSchema.parse({ ...base, description: " Cement " }).description).toBe(
      "Cement",
    );
  });

  it("quotes: section title", () => {
    expect(
      quoteSectionInputSchema.safeParse({ title: "   ", lineItems: [] }).success,
    ).toBe(false);
    expect(
      quoteSectionInputSchema.parse({ title: " Foundation ", lineItems: [] }).title,
    ).toBe("Foundation");
  });

  it("quotes: job component description/unitLabel", () => {
    const base = { kind: "MATERIAL", quantityPerUnit: 1, unitPriceCents: 100 } as const;
    expect(
      quoteLineJobComponentSchema.safeParse({ ...base, description: "   " }).success,
    ).toBe(false);
    expect(
      quoteLineJobComponentSchema.parse({ ...base, description: " Sand ", unitLabel: " bag " })
        .unitLabel,
    ).toBe("bag");
  });

  it("quotes: decision (accept/decline) name", () => {
    expect(quoteDecisionSchema.safeParse({ decision: "ACCEPT", name: "   " }).success).toBe(false);
    expect(quoteDecisionSchema.parse({ decision: "ACCEPT", name: " Marcia " }).name).toBe("Marcia");
  });

  it("invoices: section title and job component description", () => {
    expect(
      invoiceSectionInputSchema.safeParse({ title: "   ", lineItems: [] }).success,
    ).toBe(false);
    const base = { kind: "MATERIAL", quantityPerUnit: 1, unitPriceCents: 100 } as const;
    expect(
      invoiceLineJobComponentSchema.parse({ ...base, description: " Blockwork " }).description,
    ).toBe("Blockwork");
  });

  it("jobs: description, unitLabel, name, unit", () => {
    expect(createJobSchema.safeParse({ name: "   ", unit: "DAY" }).success).toBe(false);
    expect(createJobSchema.parse({ name: " Roofing ", unit: " sq ft " }).unit).toBe("sq ft");
    expect(
      assemblyComponentInputSchema.safeParse({
        kind: "MATERIAL",
        description: "   ",
        quantityPerUnit: 1,
        unitPriceCents: 100,
      }).success,
    ).toBe(false);
  });

  it("catalogs: labour rate trade/unitLabel, material name, equipment name, supplier name, category label", () => {
    expect(createLabourRateSchema.safeParse({ trade: "   ", rateCents: 100 }).success).toBe(false);
    expect(createLabourRateSchema.parse({ trade: " Mason ", rateCents: 100 }).trade).toBe("Mason");
    expect(
      createMaterialFavouriteSchema.parse({ name: " Cement ", priceCents: 100 }).name,
    ).toBe("Cement");
    expect(createEquipmentItemSchema.safeParse({ name: "  ", rateCents: 100 }).success).toBe(false);
    expect(createSupplierSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createMaterialCategorySchema.safeParse({ label: "   " }).success).toBe(false);
  });

  it("admin: confirmName (destructive delete) and regulatory update fields", () => {
    expect(hardDeleteTenantSchema.safeParse({ confirmName: "   " }).success).toBe(false);
    expect(hardDeleteTenantSchema.parse({ confirmName: " Acme Co " }).confirmName).toBe("Acme Co");
    expect(
      createRegulatoryUpdateSchema.safeParse({ title: "  ", category: "GCT", summary: "x" }).success,
    ).toBe(false);
  });

  it("clients: firstName and legacy name", () => {
    expect(createClientSchema.safeParse({ firstName: "   " }).success).toBe(false);
    expect(updateClientSchema.parse({ firstName: " Kevin " }).firstName).toBe("Kevin");
    expect(updateClientSchema.parse({ name: " Ann Grant " }).name).toBe("Ann Grant");
  });

  it("auth: fullName and businessName", () => {
    expect(
      registerSchema.safeParse({
        email: "a@b.com",
        password: "password123",
        businessName: "   ",
      }).success,
    ).toBe(false);
    expect(
      registerSchema.parse({ email: "a@b.com", password: "password123", businessName: " Acme " })
        .businessName,
    ).toBe("Acme");
  });

  it("purchases: description and labour entry unitLabel", () => {
    expect(
      createPurchaseSchema.safeParse({
        description: "   ",
        amountCents: 100,
        purchasedAt: new Date().toISOString(),
      }).success,
    ).toBe(false);
    expect(
      createLabourEntrySchema.parse({
        description: " Blockwork ",
        quantity: 1,
        rateCents: 100,
        unitLabel: " day ",
        workedOn: new Date().toISOString(),
      }).unitLabel,
    ).toBe("day");
  });

  it("projects: name", () => {
    expect(createProjectSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createProjectSchema.parse({ name: " New Deck " }).name).toBe("New Deck");
  });

  it("business: name and quote/invoice prefixes", () => {
    expect(createBusinessSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createBusinessSchema.parse({ name: " Acme ", quotePrefix: " Q- " }).quotePrefix).toBe(
      "Q-",
    );
  });

  it("id-reference fields are deliberately NOT trimmed: a whitespace id simply fails to match", () => {
    // jobId/clientId/projectId etc. are opaque foreign-key references, never
    // stored or displayed as text — trimming them would not change correctness,
    // it would just let a mangled id look superficially valid.
    expect(quoteLineItemInputSchema.parse({
      category: "MATERIAL", quantity: 1, rateUnit: "UNIT", unitPriceCents: 100,
      description: "x", jobId: " abc ",
    }).jobId).toBe(" abc ");
  });
});
