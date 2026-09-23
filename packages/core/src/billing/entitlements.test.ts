import { describe, expect, it } from "vitest";
import {
  Entitlement,
  EntitlementLimit,
  PlanTier,
  TIER_ORDER,
  allEntitlements,
  allLimits,
  can,
  isEntitlement,
  isEntitlementLimit,
  limitFor,
  planTier,
  refusalMessage,
  tierEntitlements,
  tierIncluding,
  tierLabel,
  tierRank,
} from "./entitlements.js";

/**
 * The tier matrix, transcribed from `docs/TIERS.md` INDEPENDENTLY of the source — the
 * expected value is written here as the table reads, not derived from `FEATURE_MIN_TIER`,
 * so an edit to the ladder has to be an edit to this table too.
 *
 * Every entitlement appears. The loop below asserts the count, so adding a name to core
 * and not to this table fails rather than going unchecked (a test over a subset is a test
 * that stops covering the thing you just added).
 */
const MATRIX: Record<Entitlement, { free: boolean; pro: boolean; business: boolean }> = {
  "quote.create": { free: true, pro: true, business: true },
  "recipe.view": { free: true, pro: true, business: true },
  "recipe.edit": { free: false, pro: true, business: true },
  "invoice.manage": { free: false, pro: true, business: true },
  "payment.record": { free: false, pro: true, business: true },
  "payment.reminders": { free: false, pro: true, business: true },
  "payment.cardLink": { free: false, pro: true, business: true },
  "project.costing": { free: false, pro: true, business: true },
  "retention.track": { free: false, pro: true, business: true },
  "export.csv": { free: false, pro: true, business: true },
  "offline.sync": { free: false, pro: true, business: true },
  "priceIndex.read": { free: false, pro: true, business: true },
  "priceIndex.alerts": { free: false, pro: false, business: true },
  "role.approvals": { free: false, pro: false, business: true },
  "crew.manage": { free: false, pro: false, business: true },
  "report.consolidated": { free: false, pro: false, business: true },
  "branding.colours": { free: false, pro: true, business: true },
  "branding.perClientTerms": { free: false, pro: false, business: true },
  "whatsapp.businessSend": { free: false, pro: false, business: true },
  "api.access": { free: false, pro: false, business: true },
};

describe("the tier ladder", () => {
  it("is cheapest-first, with a rank per tier and -1 for anything else", () => {
    expect(TIER_ORDER).toEqual(["free", "pro", "business"]);
    expect(tierRank("free")).toBe(0);
    expect(tierRank("pro")).toBe(1);
    expect(tierRank("business")).toBe(2);
    expect(tierRank("enterprise")).toBe(-1);
  });

  it("names each tier for a contractor", () => {
    expect(TIER_ORDER.map(tierLabel)).toEqual(["Free", "Pro", "Business"]);
  });

  it("resolves a stored plan down to free when it is not a tier", () => {
    expect(planTier("pro")).toBe(PlanTier.PRO);
    expect(planTier("  PRO ")).toBe(PlanTier.PRO);
    expect(planTier("business")).toBe(PlanTier.BUSINESS);
    expect(planTier("free")).toBe(PlanTier.FREE);
    // A plan column written by hand, or a tier that has been retired: the tenant keeps
    // working at the floor rather than being locked out or crashing a request.
    expect(planTier("platinum")).toBe(PlanTier.FREE);
    expect(planTier(null)).toBe(PlanTier.FREE);
    expect(planTier(undefined)).toBe(PlanTier.FREE);
    expect(planTier("")).toBe(PlanTier.FREE);
  });
});

describe("can(tier, feature) across all three tiers", () => {
  it("covers every entitlement", () => {
    expect(Object.keys(MATRIX).sort()).toEqual(allEntitlements().sort());
    expect(allEntitlements()).toHaveLength(20);
  });

  for (const tier of TIER_ORDER) {
    it(`matches the published matrix on ${tier}`, () => {
      const actual = Object.fromEntries(allEntitlements().map((f) => [f, can(tier, f)]));
      const expected = Object.fromEntries(
        allEntitlements().map((f) => [f, MATRIX[f][tier]]),
      );
      expect(actual).toEqual(expected);
    });
  }

  it("is cumulative: a higher tier never loses what a lower one has", () => {
    for (const f of allEntitlements()) {
      for (let i = 1; i < TIER_ORDER.length; i++) {
        if (can(TIER_ORDER[i - 1]!, f)) expect(can(TIER_ORDER[i]!, f)).toBe(true);
      }
    }
  });

  it("names the cheapest tier that includes a feature, so a refusal can say it", () => {
    expect(tierIncluding(Entitlement.PAYMENT_RECORD)).toBe(PlanTier.PRO);
    expect(tierIncluding(Entitlement.API_ACCESS)).toBe(PlanTier.BUSINESS);
    expect(tierIncluding(Entitlement.RECIPE_VIEW)).toBe(PlanTier.FREE);
    // The cheapest tier that includes a feature must itself include it, and the tier
    // below it must not — otherwise the sentence a refusal builds is wrong.
    for (const f of allEntitlements()) {
      const min = tierIncluding(f);
      expect(can(min, f)).toBe(true);
      const below = TIER_ORDER[tierRank(min) - 1];
      if (below) expect(can(below, f)).toBe(false);
    }
  });

  it("lists a tier's entitlements", () => {
    expect(tierEntitlements(PlanTier.FREE)).toEqual(["quote.create", "recipe.view"]);
    expect(tierEntitlements(PlanTier.BUSINESS)).toEqual(allEntitlements());
    expect(tierEntitlements(PlanTier.PRO)).toContain("invoice.manage");
    expect(tierEntitlements(PlanTier.PRO)).not.toContain("api.access");
  });

  it("recognises only real entitlement names", () => {
    expect(isEntitlement("payment.record")).toBe(true);
    expect(isEntitlement("payment.recrd")).toBe(false);
    expect(isEntitlement("toString")).toBe(false); // not a prototype hit
  });
});

describe("refusal wording", () => {
  it("is a plain sentence naming the feature and the tier", () => {
    expect(refusalMessage(Entitlement.PAYMENT_RECORD)).toBe("Recording payments is on Pro.");
    expect(refusalMessage(Entitlement.API_ACCESS)).toBe("API access is on Business.");
  });

  it("is written for a contractor: no code names, no developer wording", () => {
    for (const f of allEntitlements()) {
      const msg = refusalMessage(f);
      expect(msg.endsWith(".")).toBe(true);
      expect(msg).not.toContain(f); // never leaks the dotted machine name
      expect(msg).not.toMatch(/entitlement|tier|plan code|undefined|null/i);
    }
  });
});

describe("limitFor(tier, limit)", () => {
  it("carries today's Free quote allowance, and unlimited above it", () => {
    // 3 is the live value in PricingConfig / DEFAULT_PRICING. Changing this number
    // changes what every Free tenant may do on deploy.
    expect(limitFor(PlanTier.FREE, EntitlementLimit.QUOTES_PER_MONTH)).toBe(3);
    expect(limitFor(PlanTier.PRO, EntitlementLimit.QUOTES_PER_MONTH)).toBeNull();
    expect(limitFor(PlanTier.BUSINESS, EntitlementLimit.QUOTES_PER_MONTH)).toBeNull();
  });

  it("gives seats per the matrix", () => {
    expect(limitFor(PlanTier.FREE, EntitlementLimit.USERS_ALLOWED)).toBe(1);
    expect(limitFor(PlanTier.PRO, EntitlementLimit.USERS_ALLOWED)).toBe(1);
    expect(limitFor(PlanTier.BUSINESS, EntitlementLimit.USERS_ALLOWED)).toBe(10);
  });

  it("has a value for every limit on every tier, and never a negative sentinel", () => {
    expect(allLimits()).toEqual(["quote.monthlyAllowance", "user.seats"]);
    for (const limit of allLimits()) {
      for (const tier of TIER_ORDER) {
        const value = limitFor(tier, limit);
        expect(value === null || (Number.isInteger(value) && value > 0)).toBe(true);
      }
    }
  });

  it("never loosens going down the ladder", () => {
    for (const limit of allLimits()) {
      for (let i = 1; i < TIER_ORDER.length; i++) {
        const lower = limitFor(TIER_ORDER[i - 1]!, limit);
        const higher = limitFor(TIER_ORDER[i]!, limit);
        if (lower === null) expect(higher).toBeNull();
        else if (higher !== null) expect(higher).toBeGreaterThanOrEqual(lower);
      }
    }
  });

  it("recognises only real limit names", () => {
    expect(isEntitlementLimit("quote.monthlyAllowance")).toBe(true);
    expect(isEntitlementLimit("quote.create")).toBe(false); // an entitlement, not a limit
  });
});
