import { describe, expect, it } from "vitest";
import { Prisma, type Business } from "@prisma/client";
import { businessWire } from "@jamquote/core";
import { updateBusinessSchema } from "./business.dto.js";

/**
 * Seam 1 in `CONTRACTS.md`, for the business row. Same double coupling as
 * `client-wire.test.ts`: TypeScript checks the sample against Prisma's own
 * `Business` type, Zod checks it against what the web is typed to read.
 *
 * This one carries an extra job. `apps/web` used to declare
 * `defaultGctRate: number | string` — a union nobody could resolve, so every
 * reader handled both branches forever. The contract now says `string`, and the
 * tests below are the evidence for that claim rather than an assumption about
 * how Prisma serializes.
 */

const sample: Business = {
  id: "biz_1",
  name: "Blackwood Construction",
  countryCode: "JM",
  currency: "JMD",
  trn: "102458963",
  logoUrl: null,
  billingContactName: null,
  billingContactEmail: null,
  addressLine: "12 Hope Road",
  town: "Kingston",
  parish: "Kingston",
  tradeType: "General contractor",
  entityType: "SOLE_TRADER",
  defaultGctRate: new Prisma.Decimal("15.00"),
  jmdPerUsd: new Prisma.Decimal("157.5"),
  quotePrefix: "QT-",
  invoicePrefix: "INV-",
  nextQuoteSeq: 1,
  nextInvoiceSeq: 1,
  lastOverdueDigestOn: null,
  gctRegistered: false,
  createdAt: new Date("2026-01-05T00:00:00.000Z"),
  updatedAt: new Date("2026-01-05T00:00:00.000Z"),
  deletedAt: null,
};

function overTheWire<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

describe("the business wire contract", () => {
  it("is satisfied by what the service returns", () => {
    expect(() => businessWire.parse(overTheWire(sample))).not.toThrow();
  });

  it("proves a Prisma Decimal reaches the browser as a STRING", () => {
    // The claim the contract rests on. If Prisma ever changed this, the union
    // the web used to carry would have been right and the contract wrong - so
    // the assertion lives here rather than in a comment.
    const wire = overTheWire(sample);
    expect(typeof wire.defaultGctRate).toBe("string");
    expect(typeof wire.jmdPerUsd).toBe("string");
  });

  it("proves trailing zeros are DROPPED on the way out", () => {
    // 15.00 arrives as "15". Anything comparing the wire value to a formatted
    // "15.00", or reading its decimal places, is comparing against a string the
    // API does not send.
    expect(overTheWire(sample).defaultGctRate).toBe("15");
  });

  it("is still a usable number after Number()", () => {
    const parsed = businessWire.parse(overTheWire(sample));
    expect(Number(parsed.defaultGctRate)).toBe(15);
  });

  it("REJECTS a rate that arrives as a number", () => {
    // Guards the tightening. If this ever fails, Prisma's serialization has
    // changed and the contract - not the caller - is what needs revisiting.
    expect(() => businessWire.parse({ ...overTheWire(sample), defaultGctRate: 15 })).toThrow(
      /defaultGctRate/,
    );
  });

  it("REJECTS a response missing a promised field", () => {
    const { countryCode: _dropped, ...without } = overTheWire(sample);
    expect(() => businessWire.parse(without)).toThrow(/countryCode/);
  });
});

describe("gctRegistered — the owner's explicit answer, not inferred from the TRN", () => {
  it("is carried on the wire as a real boolean", () => {
    const parsed = businessWire.parse(overTheWire({ ...sample, gctRegistered: true }));
    expect(parsed.gctRegistered).toBe(true);
    // A row without it is a contract break, not a silent `false`.
    const { gctRegistered: _dropped, ...without } = overTheWire({ ...sample, gctRegistered: false });
    expect(() => businessWire.parse(without)).toThrow(/gctRegistered/);
  });

  it("is accepted by the update DTO in both directions, so it can be cleared", () => {
    expect(updateBusinessSchema.parse({ gctRegistered: true })).toEqual({ gctRegistered: true });
    expect(updateBusinessSchema.parse({ gctRegistered: false })).toEqual({ gctRegistered: false });
    // Omitted means "leave it alone" — not a write of false.
    expect(updateBusinessSchema.parse({ name: "B" })).not.toHaveProperty("gctRegistered");
  });

  it("rejects anything that is not a boolean", () => {
    // "false" is truthy; coercing it would register the contractor.
    expect(updateBusinessSchema.safeParse({ gctRegistered: "false" }).success).toBe(false);
    expect(updateBusinessSchema.safeParse({ gctRegistered: 1 }).success).toBe(false);
  });
});
