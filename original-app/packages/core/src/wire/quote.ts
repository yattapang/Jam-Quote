import { z } from "zod";
import {
  GctTreatment,
  JobComponentKind,
  LineCategory,
  PriceSource,
  QuoteDetailLevel,
  QuoteStatus,
  RateUnit,
} from "../types/enums.js";

/**
 * A quote as it arrives in the browser. See `wire/README.md`.
 *
 * ## Two shapes, not one with everything optional
 *
 * `GET /quotes` runs a `findMany` with **no include**, so a list row carries the
 * columns and nothing else. `GET /quotes/:id` includes the sections and lines.
 * Same entity, two shapes.
 *
 * The interface this replaces expressed that by marking `lineItems` and
 * `sections` optional, which is accurate but tells a reader nothing about WHY.
 * So there are two exports: `quoteWire` for what any endpoint sends, and
 * `quoteDetailWire` for the read that guarantees the nested items. A caller that
 * needs the lines can say so in its type instead of checking at runtime.
 *
 * ## `jobComponents` is a snapshot, and display-only
 *
 * It is JSON captured when the job was dropped onto the quote — never used in
 * totals math, which is `quantity x unitPriceCents`. Because it is JSON rather
 * than columns, its numbers are whatever the writer put there: a `Decimal`
 * serializes to a string, but an older client may have written a number. Both
 * are accepted, which is the one place in `wire/` where a union is honest rather
 * than lazy.
 */

/** One component of a job-type line, snapshotted for DETAILED rendering. */
export const lineJobComponentWire = z.object({
  kind: z.nativeEnum(JobComponentKind),
  description: z.string(),
  /**
   * From a JSON snapshot, so genuinely either: a serialized Decimal is a string,
   * while an older client may have written a plain number. Read it with
   * `Number()`.
   */
  quantityPerUnit: z.union([z.string(), z.number()]),
  unitLabel: z.string().nullable().optional(),
  unitPriceCents: z.number().int(),
});

export type LineJobComponentWire = z.infer<typeof lineJobComponentWire>;

/** One priced line, as the CONTRACTOR sees it. */
export const quoteLineWire = z.object({
  id: z.string(),
  category: z.nativeEnum(LineCategory),
  description: z.string(),
  /** A serialized Decimal - a string. */
  quantity: z.string(),
  rateUnit: z.nativeEnum(RateUnit),
  /** How the material is SOLD ("bag", "sheet"). Null falls back to the
   * rateUnit's own label — resolve through `lineUnitLabel`, never inline. */
  unitLabel: z.string().nullable(),
  unitPriceCents: z.number().int(),
  priceSource: z.nativeEnum(PriceSource),
  gctTreatment: z.nativeEnum(GctTreatment),

  /**
   * The contractor's margin on this line, as a serialized Decimal or null.
   *
   * **Tenant-only.** It appears here because this is the contractor's own read;
   * it is deliberately absent from `publicQuoteWire`, which is `.strict()` for
   * exactly that reason.
   */
  markupPct: z.string().nullable(),
  /**
   * Where the price came from, and why it was overridden.
   *
   * Added because the builder was found to DROP them on every re-save: the edit
   * page read them, but the wire never carried them, so they were always
   * undefined and the API nulled them. `supplierId` is which merchant the price
   * came from and `overrideNote` is the contractor's own explanation — both are
   * internal provenance on the tenant's own read, and both are correctly absent
   * from the public contracts.
   */
  supplierId: z.string().nullable(),
  overrideNote: z.string().nullable(),

  /** Job provenance — set only on lines built from the job library. */
  jobId: z.string().nullable(),
  jobName: z.string().nullable(),
  jobUnit: z.string().nullable(),
  jobComponents: z.array(lineJobComponentWire).nullable(),
});

export type QuoteLineWire = z.infer<typeof quoteLineWire>;

/**
 * A titled group of lines.
 *
 * **No `id`, deliberately.** The API does send one, but the web keys sections by
 * index and never reads it — and this contract is the set of fields the web
 * RELIES ON, not a mirror of the row (see `wire/README.md`). Adding it would
 * also force every existing fixture to carry a value nothing consumes.
 *
 * A component that genuinely needs the id should add it here, deliberately, and
 * the diff will say so.
 */
export const quoteSectionWire = z.object({
  title: z.string(),
  lineItems: z.array(quoteLineWire),
});

/** What every quote endpoint sends. Nested items only on the detail read. */
export const quoteWire = z.object({
  id: z.string(),
  number: z.string(),
  status: z.nativeEnum(QuoteStatus),

  clientId: z.string().nullable(),
  projectId: z.string().nullable(),

  /** Set when this quote is extra work agreed AFTER another was accepted. Not
   * `parentQuoteId`, which is the revision link — same shape, opposite meaning. */
  variationOfQuoteId: z.string().nullable(),

  /** The CLIENT's own answer through the share link, distinct from the
   * contractor setting the status by hand. Null until they answer. */
  decidedAt: z.string().nullable(),
  decidedByName: z.string().nullable(),
  declineReason: z.string().nullable(),

  /** Serialized Decimals - strings. */
  gctRate: z.string(),
  discountPct: z.string(),

  depositCents: z.number().int(),
  subtotalCents: z.number().int(),
  gctCents: z.number().int(),
  totalCents: z.number().int(),

  validUntil: z.string().nullable(),
  createdAt: z.string(),

  detailLevel: z.nativeEnum(QuoteDetailLevel),

  /** Absent on the LIST read, which runs no include. See the note above. */
  lineItems: z.array(quoteLineWire).optional(),
  sections: z.array(quoteSectionWire).optional(),
});

export type QuoteWire = z.infer<typeof quoteWire>;

/**
 * The detail read, where the nested items are guaranteed.
 *
 * Use this when a caller genuinely needs the lines — it turns a runtime check
 * into a type.
 */
export const quoteDetailWire = quoteWire.extend({
  lineItems: z.array(quoteLineWire),
  sections: z.array(quoteSectionWire),
});

export type QuoteDetailWire = z.infer<typeof quoteDetailWire>;
