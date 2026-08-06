import type {
  AssemblyComponentKind,
  InvoiceStatus,
  PaymentMethod,
  Parish,
  QuoteDetailLevel,
  QuoteLineItemInput,
  QuoteStatus,
  RateUnit,
} from "@jamquote/core";

/** Display-only snapshot of one assembly component, captured on the quote
 * line at the moment a job type was dropped onto the quote. Never used for
 * totals math — only to expand a line in DETAILED view. Mirrors the API's
 * `quoteLineAssemblyComponentSchema` (quotes.dto.ts). */
export interface QuoteLineAssemblyComponent {
  kind: AssemblyComponentKind;
  description: string;
  quantityPerUnit: number;
  unitPriceCents: number;
}

export interface QuoteLine extends QuoteLineItemInput {
  id: string;
  /** Set only on lines created from an assembly ("job type"). assemblyId is a
   * plain reference back to the source Assembly (not an FK — the snapshot
   * fields keep historical quotes stable even if the assembly later changes). */
  assemblyId?: string;
  assemblyName?: string;
  assemblyUnit?: string;
  assemblyComponents?: QuoteLineAssemblyComponent[];
}

export interface Quote {
  id: string;
  num: string;
  clientId: string;
  jobId?: string;
  jobLabel: string;
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
  /** Per-quote presentation setting: SUMMARY renders each assembly line as a
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
  /** Structured catalog fields (see apps/web/lib/material-categories.ts).
   * Both optional — older/unclassified materials simply omit them and
   * display/behave exactly as before. */
  category?: string;
  specs?: Record<string, string>;
  /** Optional free-text notes (supplier, finish, etc.) — also searched by
   * the API's GET /catalogs/material-favourites `q` param alongside name and
   * specs values. */
  description?: string;
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
}

/** One recipe line inside an assembly — either a snapshot of a saved
 * material/labour rate (materialFavouriteId/labourRateId set) or a freeform
 * "OTHER" line (mirrors the Prisma `AssemblyComponent` model). */
export interface AssemblyComponent {
  id: string;
  kind: AssemblyComponentKind;
  materialFavouriteId?: string;
  labourRateId?: string;
  description: string;
  quantityPerUnit: number;
  unitPriceCents: number;
  sort: number;
}

/** A reusable "job type" (e.g. "Tiling — per sq ft") built from material/
 * labour/other components, with a server-computed unit cost (mirrors the
 * Prisma `Assembly` model + AssembliesService.withUnitCost). */
export interface Assembly {
  id: string;
  name: string;
  unit: string;
  markupPct: number;
  unitCostCents: number;
  components: AssemblyComponent[];
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

export interface RegulatoryAlert {
  id: string;
  title: string;
  detail: string;
  effectiveLabel: string;
  severity: "warn" | "info" | "critical";
}

export interface BusinessProfile {
  name: string;
  ownerFirstName: string;
  trn: string;
  parish: Parish;
  tradeType: string;
  defaultGctRatePct: number;
  phone: string;
  email: string;
  whatsapp: { connected: boolean; label: string };
  emailChannel: { connected: boolean; label: string };
  plan: {
    name: string;
    priceCents: number;
    renewsLabel: string;
    features: string;
  };
}

/** The real, API-backed business profile (mirrors the Prisma `Business`
 * model's editable identity fields — see business.dto's updateBusinessSchema).
 * Distinct from `BusinessProfile` above, which still backs the
 * not-yet-persisted WhatsApp/email-connection and subscription-plan fixture
 * data shown on the settings page. */
export interface Business {
  id: string;
  name: string;
  trn: string;
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
}
