import { HttpException, Injectable } from "@nestjs/common";
import {
  Entitlement,
  EntitlementLimit,
  PlanTier,
  isEntitlement,
  limitFor,
  planTier,
  refusalMessage,
  tierEntitlements,
  tierIncluding,
  tierLabel,
  type LimitValue,
} from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * The ONE place a tenant's entitlements are resolved and enforced (ADR 0007 §3).
 *
 * Effective set = **tier ∪ grants**. The tier comes from `Subscription.plan`, what the tier
 * includes comes from `@jamquote/core` (the floor), and `BusinessEntitlementGrant` adds what
 * a particular tenant was grandfathered or sold separately. Numeric limits come from core
 * too, with a per-country override in `PlanTierConfig`.
 *
 * ## Why the API and not the web app
 *
 * The API is the product's only real boundary: the mobile app and any future integration
 * never load the web app at all, so a limit enforced in a screen is not a limit (ADR 0007,
 * alternatives). The web app reads the same resolved set to decide what to SHOW; that is an
 * additional surface, never the check.
 *
 * ## Why 402 and not 403
 *
 * Every refusal here is `402 Payment Required`, chosen once and used for all of them.
 *
 * - The two statuses mean different things to a client. `403` says "you are not allowed to
 *   do this", and the honest response to it is to stop asking. `402` says "this costs
 *   money" — the request is legitimate, the account simply has not bought it. That is
 *   exactly an entitlement refusal, and it is what makes a refusal a sales conversation
 *   (ADR 0007 §6) instead of an error.
 * - `403` already means something else in this API: the tenancy and role guards return it
 *   when a caller reaches for something that is not theirs. Reusing it for "not on your
 *   plan" would make the two indistinguishable in logs and in the web client's error
 *   handling — and one of them is a possible break-in while the other is an upsell.
 * - The free-tier quote gate has returned 402 since it was written, and the web client
 *   already branches on a 402 body's `code`. Choosing 403 would have changed a live
 *   contract for no gain.
 *
 * The body carries `{ message, code, feature, requiredTier }`: the plain sentence for the
 * contractor, a machine code for the client, and the feature and tier so a screen can say
 * what an upgrade unlocks without re-deriving it.
 */

/** Resolved once per request that needs it. Cheap: two indexed reads. */
export interface ResolvedEntitlements {
  businessId: string;
  tier: PlanTier;
  /** For the per-country limit override. */
  countryCode: string;
  /** tier ∪ grants — what this tenant may actually do. */
  features: ReadonlySet<Entitlement>;
  /** Only the grants, so the admin console can show what is held beyond the tier. */
  granted: ReadonlySet<Entitlement>;
}

/**
 * Which `PlanTierConfig` column overrides which limit. A map, so adding a limit to core
 * without giving it a column is visible here rather than silently un-overridable.
 */
const LIMIT_COLUMN: Record<EntitlementLimit, "quoteMonthlyAllowance" | "usersAllowed"> = {
  "quote.monthlyAllowance": "quoteMonthlyAllowance",
  "user.seats": "usersAllowed",
};

/**
 * What a limit refusal says. The CODE is an API contract, which is why it lives here and
 * not in core's wording table.
 *
 * `FREE_LIMIT_REACHED` and its sentence are the EXISTING quote-gate refusal, word for word:
 * the web quote builder switches on that code to show its upgrade panel
 * (apps/web/app/(app)/quotes/new/QuoteBuilder.tsx) and re-wording or re-coding it here
 * would break a live screen this task may not touch. A new limit gets a new code.
 */
const LIMIT_REFUSAL: Record<EntitlementLimit, (limit: number) => { code: string; message: string }> =
  {
    "quote.monthlyAllowance": (limit) => ({
      code: "FREE_LIMIT_REACHED",
      message: `You've reached your free plan limit of ${limit} quotes this month. Upgrade to Pro for unlimited quotes.`,
    }),
    "user.seats": (limit) => ({
      code: "SEAT_LIMIT_REACHED",
      message: `Your plan covers ${limit} ${limit === 1 ? "user" : "users"} on the account. Upgrade to add more.`,
    }),
  };

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A tenant's effective entitlements.
   *
   * A business row that does not exist resolves to the FREE tier with no grants rather
   * than throwing: this is called from inside other services' boundary checks, and a
   * missing business is their 404 to raise, with their wording, not a 500 from here.
   *
   * A grant naming a feature core no longer knows is IGNORED — a retired feature name left
   * in the table must not silently widen anything. It is dropped, not an error, because a
   * rename in core must not make every request for that tenant fail.
   */
  async resolve(businessId: string): Promise<ResolvedEntitlements> {
    const [business, subscription, grants] = await Promise.all([
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: { countryCode: true },
      }),
      this.prisma.subscription.findUnique({
        where: { businessId },
        select: { plan: true },
      }),
      this.prisma.businessEntitlementGrant.findMany({
        where: { businessId },
        select: { feature: true },
      }),
    ]);

    const tier = planTier(subscription?.plan);
    const granted = new Set<Entitlement>();
    for (const row of grants) {
      if (isEntitlement(row.feature)) granted.add(row.feature);
    }
    const features = new Set<Entitlement>([...tierEntitlements(tier), ...granted]);

    return {
      businessId,
      tier,
      countryCode: business?.countryCode ?? "JM",
      features,
      granted,
    };
  }

  /** Does this tenant have `feature`? tier ∪ grants. */
  async can(businessId: string, feature: Entitlement): Promise<boolean> {
    const resolved = await this.resolve(businessId);
    return resolved.features.has(feature);
  }

  /**
   * Refuse unless this tenant has `feature`. Call it at the BOUNDARY of the operation —
   * the service method the controller calls — before anything is read or written, so a
   * refusal cannot have had a side effect.
   */
  async assertFeature(businessId: string, feature: Entitlement): Promise<void> {
    const resolved = await this.resolve(businessId);
    if (resolved.features.has(feature)) return;
    throw this.refusal(feature);
  }

  /** The exception a feature refusal raises, so a caller can build one without throwing. */
  refusal(feature: Entitlement): HttpException {
    const requiredTier = tierIncluding(feature);
    return new HttpException(
      {
        // Plain contractor English, from core, so the same feature is named the same way
        // wherever it is refused.
        message: refusalMessage(feature),
        code: "ENTITLEMENT_REQUIRED",
        feature,
        requiredTier,
        requiredTierName: tierLabel(requiredTier),
      },
      402,
    );
  }

  /**
   * The live value of a numeric limit: the `PlanTierConfig` override for this tenant's
   * country and tier if there is one, else core's baseline. `null` is unlimited.
   *
   * The override is read per (country, tier) and not per tenant on purpose — a single
   * tenant's negotiated allowance would be a grant-shaped fact, and the grant table is
   * feature-keyed. When that is wanted it gets its own column with its own audit, rather
   * than a second meaning for this one.
   */
  async limit(businessId: string, limit: EntitlementLimit): Promise<LimitValue> {
    const resolved = await this.resolve(businessId);
    return this.limitForResolved(resolved, limit);
  }

  async limitForResolved(
    resolved: ResolvedEntitlements,
    limit: EntitlementLimit,
  ): Promise<LimitValue> {
    const row = await this.prisma.planTierConfig.findUnique({
      where: { countryCode_tierCode: { countryCode: resolved.countryCode, tierCode: resolved.tier } },
      select: { quoteMonthlyAllowance: true, usersAllowed: true },
    });
    const override = row?.[LIMIT_COLUMN[limit]];
    // `?? baseline`, not `|| baseline`: 0 is a real limit (a tier that may not do the thing
    // at all), and `||` would read it as unset and hand the tenant the baseline instead.
    return override ?? limitFor(resolved.tier, limit);
  }

  /**
   * Refuse when `used` has already reached the limit.
   *
   * `used` is passed in rather than counted here because what counts differs per limit —
   * the quote allowance counts one lineage chain per job in the tenant's month, seats count
   * live users — and ADR 0007 §4 requires both to be derived from the data at the moment of
   * the check, never from a stored counter. A single `count()` in here would have to guess.
   */
  async assertWithinLimit(
    businessId: string,
    limit: EntitlementLimit,
    used: number,
  ): Promise<void> {
    const value = await this.limit(businessId, limit);
    if (value === null || used < value) return;
    const { code, message } = LIMIT_REFUSAL[limit](value);
    throw new HttpException({ message, code, limit, limitValue: value }, 402);
  }
}
