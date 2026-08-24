import type {
  JobComponentKind,
  InvoiceStatus,
  PaymentMethod,
  Parish,
  QuoteDetailLevel,
  QuoteLineItemInput,
  QuoteStatus,
  RateUnit,
} from "@jamquote/core";

/** Display-only snapshot of one job component, captured on the quote
 * line at the moment a job type was dropped onto the quote. Never used for
 * totals math — only to expand a line in DETAILED view. Mirrors the API's
 * `quoteLineJobComponentSchema` (quotes.dto.ts). */
export interface QuoteLineJobComponent {
  kind: JobComponentKind;
  description: string;
  quantityPerUnit: number;
  /** What the quantity counts — "trip", "day". Absent prints bare. */
  unitLabel?: string;
  unitPriceCents: number;
}

export interface QuoteLine extends QuoteLineItemInput {
  id: string;
  // NOTE: `unitLabel` (the sold-by display snapshot, e.g. "bag") is inherited
  // from QuoteLineItemInput rather than redeclared — see the core validator.
  /** Set only on lines created from an job ("job type"). jobId is a
   * plain reference back to the source Job (not an FK — the snapshot
   * fields keep historical quotes stable even if the job later changes). */
  jobId?: string;
  jobName?: string;
  jobUnit?: string;
  jobComponents?: QuoteLineJobComponent[];
}

export interface Quote {
  id: string;
  num: string;
  /** Set when this quote is extra work agreed after another was accepted —
   * a variation, not a revision. */
  variationOfQuoteId?: string;
  /** The client's own answer through the share link. Present only when THEY
   * decided — a contractor setting the status by hand leaves it empty, and
   * that difference is what makes it worth showing. */
  decidedByName?: string;
  decidedAtLabel?: string;
  declineReason?: string;
  clientId: string;
  projectId?: string;
  projectLabel: string;
  status: QuoteStatus;
  lines: QuoteLine[];
  gctRatePct: number;
  discountPct: number;
  depositCents: number;
  createdAt: string; // ISO — raw creation date, for date math (dashboard stats, sorting)
  createdLabel: string;
  validUntilLabel: string;
  /** Raw ISO validity deadline (undated quotes omit it). Used by the quote
   * builder to derive its "valid for N days" field when editing. */
  validUntil?: string;
  /** Section groupings, title preserved — populated only for detail rows
   * (list rows may omit `lines`/`sections` entirely). `lines` above already
   * includes every section's lines flattened in for totals/category display;
   * this is additional grouping data for round-tripping the quote builder. */
  sections?: { title: string; lines: QuoteLine[] }[];
  /** Denormalized total from the API (computed via computeTotals). Set on list
   * rows where `lines` may be omitted; detail rows carry both. */
  totalCents?: number;
  /** Per-quote presentation setting: SUMMARY renders each job line as a
   * single priced row; DETAILED expands it into its component snapshot beneath
   * the line. Display only — never affects totals. Defaults to SUMMARY. */
  detailLevel?: QuoteDetailLevel;
}

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  /** Computed `firstName + " " + lastName` — kept for existing display usages. */
  name: string;
  initials: string;
  /** Town/city. Free text and separate from `parish`, which is the
   * jurisdiction region the rule-pack keys off — a parish is not a town. */
  town: string;
  parish: Parish;
  phone: string;
  address: string;
  /** Optional — present once the client has an email on file. Powers "Send by email". */
  email?: string;
}

/** A saved material a contractor reuses across quotes, with its last known
 * unit price (mirrors the Prisma `MaterialFavourite` model). */
export interface MaterialFavourite {
  id: string;
  name: string;
  unit?: string;
  priceCents: number;
  /** Convenience for display/inputs — priceCents / 100. */
  priceDollars: number;
  supplierId?: string;
  /** Set once the material has been entered against the #26 Phase 2a attribute
   * schema. Its presence means `name` was COMPOSED server-side and therefore
   * already contains the spec values — see materialVariantName, which would
   * otherwise render them a second time on the customer's quote line. */
  categoryDefId?: string;
  /** True when the contractor pinned the name by hand rather than letting it
   * compose. A pinned name may say nothing about the variant, so specs are
   * still appended for display. */
  nameCustom?: boolean;
  /** Controlled-vocabulary unit (MaterialUnit id), superseding free-text `unit`. */
  unitId?: string;
  /** LEGACY free-text category. Retained so pre-2a materials keep rendering;
   * new writes set categoryDefId instead. */
  category?: string;
  /** Keyed by MaterialAttributeDef.key as of 2a (pre-2a rows were keyed by
   * display label; the migration rewrote them). */
  specs?: Record<string, string>;
  /** Optional free-text notes (supplier, finish, etc.) — also searched by
   * the API's GET /catalogs/material-favourites `q` param alongside name and
   * specs values. */
  description?: string;
  /** The unit the contractor MEASURES the job in (e.g. "m²", "sq ft") — distinct
   * from `unit`/`unitId`, which is how the material is SOLD (e.g. "box"). Only
   * meaningful alongside coveragePerSellUnit; see packages/core's coverage.ts. */
  measureUnit?: string;
  /** How much of measureUnit one sell unit covers (e.g. 1.5 m² per box). Null/
   * undefined means this material has no coverage configured — the normal case —
   * and quote lines use the measured quantity as-is. */
  coveragePerSellUnit?: number;
  /** Waste allowance percentage applied before rounding up to whole sell units
   * (e.g. 10 for 10%). Only meaningful alongside coveragePerSellUnit. */
  wastePct?: number;
}

/** A reusable labour rate a contractor keeps on hand for quoting (mirrors the
 * Prisma `LabourRate` model). rateCents is always integer JMD cents. */
export interface LabourRate {
  id: string;
  trade: string;
  skillTier?: string;
  rateCents: number;
  /** Convenience for display/inputs — rateCents / 100. */
  rateDollars: number;
  rateUnit: RateUnit;
  /** Free-text override for what prints ("sq ft", "window"). RateUnit is a
   * closed platform enum of cadences; this is the contractor's own wording.
   * Undefined = print the rateUnit. */
  unitLabel?: string;
}

/** A saved piece of equipment — owned plant or a hire item from a vendor
 * (mirrors the Prisma `EquipmentItem` model). rateCents is always integer JMD
 * cents. `owned` matters commercially: kit you own has no vendor to chase and
 * its rate is what you charge for it, not what you were charged. */
export interface EquipmentItem {
  id: string;
  name: string;
  owned: boolean;
  vendor?: string;
  vendorPhone?: string;
  rateCents: number;
  /** Convenience for display/inputs — rateCents / 100. */
  rateDollars: number;
  rateUnit: RateUnit;
  /** Free-text override for what prints ("sq ft", "window"). RateUnit is a
   * closed platform enum of cadences; this is the contractor's own wording.
   * Undefined = print the rateUnit. */
  unitLabel?: string;
}

/** One recipe line inside an job — either a snapshot of a saved
 * material/labour rate (materialFavouriteId/labourRateId set) or a freeform
 * "OTHER" line (mirrors the Prisma `JobComponent` model). */
export interface JobComponent {
  id: string;
  kind: JobComponentKind;
  materialFavouriteId?: string;
  labourRateId?: string;
  equipmentItemId?: string;
  description: string;
  quantityPerUnit: number;
  /** What the quantity counts — "trip", "day". Absent prints bare. */
  unitLabel?: string;
  unitPriceCents: number;
  sort: number;
}

/** A reusable "job type" (e.g. "Tiling — per sq ft") built from material/
 * labour/other components, with a server-computed unit cost (mirrors the
 * Prisma `Job` model + JobsService.withUnitCost). */
export interface Job {
  id: string;
  name: string;
  unit: string;
  markupPct: number;
  unitCostCents: number;
  components: JobComponent[];
}

export interface Payment {
  id: string;
  amountCents: number;
  method: PaymentMethod;
  dateLabel: string;
}

export interface Invoice {
  id: string;
  num: string;
  quoteId: string;
  clientId: string;
  status: InvoiceStatus;
  dueLabel: string;
  dueDate: string;
  overdueDays?: number;
  payments: Payment[];
}

/** A regulatory feed row as the dashboard card renders it. `severity` and
 * `effectiveLabel` are DERIVED from the API's effectiveDate at render time
 * (lib/regulatory.ts) — the API sends neither. */
export interface RegulatoryAlert {
  id: string;
  title: string;
  detail: string;
  effectiveLabel: string;
  severity: "warn" | "info" | "critical";
  /** The authority's own page, when the update carries one. Never fabricated —
   * null means the card renders as plain text with nothing to click. */
  sourceUrl: string | null;
}

/** Identity fields for the demo business, used only to seed `fixtureBusiness`
 * in lib/mock-data.ts. Every screen reads the live business via getBusiness(). */
export interface BusinessProfile {
  name: string;
  ownerFirstName: string;
  trn: string;
  parish: Parish;
  tradeType: string;
  defaultGctRatePct: number;
  phone: string;
  email: string;
}

/** The real, API-backed business profile (mirrors the Prisma `Business`
 * model's editable identity fields — see business.dto's updateBusinessSchema). */
export interface Business {
  id: string;
  name: string;
  trn: string;
  town: string;
  parish: Parish;
  tradeType: string;
  addressLine: string;
  /** Business.defaultGctRate is a Decimal already stored as a PERCENTAGE
   * (e.g. 15 means 15%) — not a 0–1 fraction. See schema.prisma's comment on
   * `Business.defaultGctRate` and quotes.service's `Number(business.defaultGctRate)`
   * used directly as `gctRatePct`. */
  defaultGctRatePct: number;
  countryCode: string;
  currency: string;
  /** Where subscription renewal and receipt mail goes. Empty means unset, and
   * the API falls back to the owner's address. */
  billingContactName: string;
  billingContactEmail: string;
}
