/**
 * The tier ladder and what each tier includes — the BASELINE for every entitlement
 * question in the product (ADR 0007).
 *
 * ## Why this is in core, and why it is the floor
 *
 * Prices differ per country and are commercial, so they live in `PlanTierConfig` in the
 * database, admin-editable. What a tier *includes* is a product decision that must never
 * depend on a database row being present: an empty or half-migrated table would silently
 * entitle everyone or no one. Same shape as the jurisdiction rule pack (ADR 0005): a
 * static baseline in core, with a narrow, explicitly-listed set of database overrides.
 *
 * ## Why a min-tier map rather than a set per tier
 *
 * The ladder in `docs/TIERS.md` is cumulative: Business includes everything Pro includes,
 * and Pro everything Free includes. Storing a set per tier would let the three sets drift
 * out of that shape (a feature on Free and Business but not Pro is not a product anyone
 * decided on), and it would restate two-thirds of the data. One tier per feature —
 * "the cheapest tier that includes it" — cannot express the inconsistent case, and it is
 * exactly the fact a refusal needs to name ("Recording payments is on Pro").
 *
 * ## Why the names are a union, not strings
 *
 * `can(tier, "payment.recrd")` is a typo that would otherwise read as "not entitled" and
 * lock a paying tenant out of a feature they bought, silently and forever. As a union it
 * is a compile error. `FEATURE_MIN_TIER` is an exhaustive `Record`, so adding a name
 * without placing it on the ladder is also a compile error.
 *
 * ## What this file does NOT decide
 *
 * - Whether a given tenant has a feature: that is tier ∪ grants, resolved per tenant by
 *   the API's `EntitlementsService`. A grant can add a feature the tier does not include;
 *   nothing here knows about grants.
 * - The live numeric limit: `PlanTierConfig` may override a limit per country. The values
 *   here are the fallback when no row exists.
 * - Anything about price, currency or billing term.
 */

// ───────────────────────────────────────────────────────────────── the ladder

export const PlanTier = {
  FREE: "free",
  PRO: "pro",
  BUSINESS: "business",
} as const;
export type PlanTier = (typeof PlanTier)[keyof typeof PlanTier];

/**
 * CHEAPEST FIRST. This array is the order — `can` compares positions in it, so moving an
 * entry re-orders the ladder and nothing else needs touching. It is also the only place
 * the ladder's shape is written down, which is why `tierRank` derives from it rather than
 * carrying its own numbers (two hand-kept orderings is the drift ADR 0004 is about).
 */
export const TIER_ORDER: readonly PlanTier[] = [PlanTier.FREE, PlanTier.PRO, PlanTier.BUSINESS];

/** Position on the ladder; -1 for a string that is not a tier. */
export function tierRank(tier: string): number {
  return TIER_ORDER.indexOf(tier as PlanTier);
}

/**
 * The tier a stored `Subscription.plan` means.
 *
 * `plan` is plain text (a database enum would need a migration per country, BUILD-RULES
 * rule 1), so an unrecognised value is possible and must resolve DOWN to free rather than
 * throwing: a tenant whose plan column holds something unexpected still needs to be able
 * to log in and quote. Trimmed and lowercased because the column has been written by
 * hand through the admin console.
 */
export function planTier(plan: string | null | undefined): PlanTier {
  const normalised = (plan ?? "").trim().toLowerCase();
  return tierRank(normalised) >= 0 ? (normalised as PlanTier) : PlanTier.FREE;
}

/** How a tier is named to a contractor. Never build this by hand at a call site. */
const TIER_LABEL: Record<PlanTier, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

export function tierLabel(tier: PlanTier): string {
  return TIER_LABEL[tier];
}

// ─────────────────────────────────────────────────────────── the entitlements

/**
 * Every gated capability, one name each, taken from the tier matrix in `docs/TIERS.md`.
 *
 * Names are `area.capability`. A capability that exists at two depths is two names
 * (`priceIndex.read` / `priceIndex.alerts`, `recipe.view` / `recipe.edit`,
 * `branding.colours` / `branding.perClientTerms`) rather than one name with a level,
 * because a grant is per name: grandfathering a tenant into colours must not also hand
 * them per-client terms.
 *
 * Capabilities every tier has — a branded PDF, the share link, the client list, the
 * catalog, a logo — are deliberately NOT here. An entitlement nothing can refuse is a
 * call site that can only ever say yes, and it would rot into one that says no the day
 * someone edits the ladder by mistake.
 */
export const Entitlement = {
  /** Create a new job quote. Limited on Free by `quote.monthlyAllowance`, not refused. */
  QUOTE_CREATE: "quote.create",
  /** Job recipes: price a job once and reuse it. Free may look, not change. */
  RECIPE_VIEW: "recipe.view",
  RECIPE_EDIT: "recipe.edit",
  /** Raise and issue invoices. */
  INVOICE_MANAGE: "invoice.manage",
  /** Record money received against an invoice (cash, transfer, Lynk, card). */
  PAYMENT_RECORD: "payment.record",
  /** Payment reminders and the overdue digest. */
  PAYMENT_REMINDERS: "payment.reminders",
  /** Card payment links (WiPay hosted checkout). */
  PAYMENT_CARD_LINK: "payment.cardLink",
  /** Project costing and job profit. */
  PROJECT_COSTING: "project.costing",
  /** Retention held and released. */
  RETENTION_TRACK: "retention.track",
  /** Accountant exports (CSV). */
  EXPORT_CSV: "export.csv",
  /** Offline use of the mobile app, and its sync endpoints. */
  OFFLINE_SYNC: "offline.sync",
  /** Roles and approvals: who may send or discount. */
  ROLE_APPROVALS: "role.approvals",
  /** Multi-crew assignment and crew cost rates. */
  CREW_MANAGE: "crew.manage",
  /** Consolidated reporting across projects. */
  REPORT_CONSOLIDATED: "report.consolidated",
  /** Material price index and supplier comparison. */
  PRICE_INDEX_READ: "priceIndex.read",
  PRICE_INDEX_ALERTS: "priceIndex.alerts",
  /** Document branding beyond a logo. */
  BRANDING_COLOURS: "branding.colours",
  BRANDING_PER_CLIENT_TERMS: "branding.perClientTerms",
  /** WhatsApp Business templated sending and receipts (per-message cost, Meta review). */
  WHATSAPP_BUSINESS_SEND: "whatsapp.businessSend",
  /** API access and integrations. */
  API_ACCESS: "api.access",
} as const;
export type Entitlement = (typeof Entitlement)[keyof typeof Entitlement];

/**
 * The cheapest tier that includes each entitlement — the tier matrix, as data.
 *
 * Exhaustive by type: a new `Entitlement` member without an entry here does not compile.
 * Read straight off `docs/TIERS.md`; if the two disagree, this file is wrong, because the
 * table is the owner's decision and this is its transcription.
 */
const FEATURE_MIN_TIER: Record<Entitlement, PlanTier> = {
  // Free, but metered — see the note on QUOTE_CREATE.
  "quote.create": PlanTier.FREE,
  "recipe.view": PlanTier.FREE,
  "recipe.edit": PlanTier.PRO,
  "invoice.manage": PlanTier.PRO,
  "payment.record": PlanTier.PRO,
  "payment.reminders": PlanTier.PRO,
  "payment.cardLink": PlanTier.PRO,
  "project.costing": PlanTier.PRO,
  "retention.track": PlanTier.PRO,
  "export.csv": PlanTier.PRO,
  "offline.sync": PlanTier.PRO,
  "priceIndex.read": PlanTier.PRO,
  "role.approvals": PlanTier.BUSINESS,
  "crew.manage": PlanTier.BUSINESS,
  "report.consolidated": PlanTier.BUSINESS,
  "priceIndex.alerts": PlanTier.BUSINESS,
  "branding.colours": PlanTier.PRO,
  "branding.perClientTerms": PlanTier.BUSINESS,
  "whatsapp.businessSend": PlanTier.BUSINESS,
  "api.access": PlanTier.BUSINESS,
};

/**
 * How each entitlement is named to a contractor, as the SUBJECT of a sentence, so
 * `refusalMessage` reads as English: "Recording payments is on Pro."
 *
 * Wording lives here and not at the call sites because BUILD-RULES rule 6 requires
 * user-facing text to be plain contractor English reviewed as such, and because a refusal
 * is a sales conversation (ADR 0007 §6) — the same feature must be named the same way
 * wherever it is refused.
 */
const FEATURE_LABEL: Record<Entitlement, string> = {
  "quote.create": "Quoting a new job",
  "recipe.view": "Looking at job recipes",
  "recipe.edit": "Saving and changing job recipes",
  "invoice.manage": "Invoicing",
  "payment.record": "Recording payments",
  "payment.reminders": "Payment reminders",
  "payment.cardLink": "Card payment links",
  "project.costing": "Job costing and profit",
  "retention.track": "Retention tracking",
  "export.csv": "Accountant exports",
  "offline.sync": "Working offline on your phone",
  "priceIndex.read": "The material price index",
  "priceIndex.alerts": "Price change alerts",
  "role.approvals": "Roles and approvals",
  "crew.manage": "Crews and crew rates",
  "report.consolidated": "Reporting across all your projects",
  "branding.colours": "Your own colours on documents",
  "branding.perClientTerms": "Per-client terms on documents",
  "whatsapp.businessSend": "Sending on WhatsApp Business",
  "api.access": "API access",
};

/** Whether `name` is a known entitlement. Needed because grant rows hold plain text. */
export function isEntitlement(name: string): name is Entitlement {
  return Object.prototype.hasOwnProperty.call(FEATURE_MIN_TIER, name);
}

/** Every entitlement name, for tests and for the admin grants screen. */
export function allEntitlements(): Entitlement[] {
  return Object.keys(FEATURE_MIN_TIER) as Entitlement[];
}

/** The cheapest tier that includes `feature` — what a refusal names. */
export function tierIncluding(feature: Entitlement): PlanTier {
  return FEATURE_MIN_TIER[feature];
}

/**
 * Does `tier` include `feature`?
 *
 * PURE, and knows nothing about a tenant. A tenant may also hold a per-tenant grant
 * (`BusinessEntitlementGrant`), which only `EntitlementsService` can see — so a `false`
 * here means "the tier does not include it", NOT "this tenant may not". Product code
 * asks the service, never this function directly.
 */
export function can(tier: PlanTier, feature: Entitlement): boolean {
  return tierRank(tier) >= tierRank(FEATURE_MIN_TIER[feature]);
}

/** Every entitlement a tier includes, in declaration order. */
export function tierEntitlements(tier: PlanTier): Entitlement[] {
  return allEntitlements().filter((f) => can(tier, f));
}

/** "Recording payments is on Pro." — the whole refusal, in one sentence. */
export function refusalMessage(feature: Entitlement): string {
  return `${FEATURE_LABEL[feature]} is on ${tierLabel(FEATURE_MIN_TIER[feature])}.`;
}

export function featureLabel(feature: Entitlement): string {
  return FEATURE_LABEL[feature];
}

// ──────────────────────────────────────────────────────────── numeric limits

/**
 * Limits are named separately from entitlements because they answer a different question:
 * an entitlement is yes/no, a limit is "how many", and a tenant who has the entitlement
 * can still be over the limit. Keeping them in one union would make `can()` able to
 * return a number's truthiness, which is the sort of thing that reads as working.
 */
export const EntitlementLimit = {
  /** New jobs quoted per calendar month. COUNTED from the quotes themselves (ADR 0007
   * §4), never from a stored counter. */
  QUOTES_PER_MONTH: "quote.monthlyAllowance",
  /** Users on the account, counted at the moment of the write. */
  USERS_ALLOWED: "user.seats",
} as const;
export type EntitlementLimit = (typeof EntitlementLimit)[keyof typeof EntitlementLimit];

/**
 * `null` means UNLIMITED, and that is a deliberate choice over a sentinel like -1 or
 * Number.MAX_SAFE_INTEGER: a sentinel compares as a number, so a forgotten `null` check
 * still "works" until the day someone renders it and a contractor reads "0 of -1".
 */
export type LimitValue = number | null;

/**
 * The baseline limits per tier.
 *
 * The Free quote allowance is 3 — TODAY's live value, carried forward from
 * `PricingConfig.freeQuotesPerMonth` / `DEFAULT_PRICING` in the API so that introducing
 * this file changes no tenant's behaviour (ADR 0007, consequences). If the owner moves
 * the allowance, it moves in `PlanTierConfig`, per country; this stays the floor for a
 * country with no row.
 *
 * Seats: 1 on Free and Pro, 10 on Business ("up to 10, then per seat" — the per-seat
 * extension is a commercial override in `PlanTierConfig`, not a second rule here).
 */
const LIMIT_BASELINE: Record<EntitlementLimit, Record<PlanTier, LimitValue>> = {
  "quote.monthlyAllowance": { free: 3, pro: null, business: null },
  "user.seats": { free: 1, pro: 1, business: 10 },
};

export function limitFor(tier: PlanTier, limit: EntitlementLimit): LimitValue {
  return LIMIT_BASELINE[limit][tier];
}

/** Every limit name, for the admin screen and for tests. */
export function allLimits(): EntitlementLimit[] {
  return Object.keys(LIMIT_BASELINE) as EntitlementLimit[];
}

/** Whether `name` is a known limit. `PlanTierConfig` columns are read against this. */
export function isEntitlementLimit(name: string): name is EntitlementLimit {
  return Object.prototype.hasOwnProperty.call(LIMIT_BASELINE, name);
}
