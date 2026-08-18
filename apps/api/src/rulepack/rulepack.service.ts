import { Injectable, Logger } from "@nestjs/common";
import { Prisma, type RulePackConfig } from "@prisma/client";
import {
  applyRulePackOverride,
  getJurisdiction,
  type JurisdictionProfile,
  type RulePackOverride,
} from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../admin/audit.service.js";
import type { UpdateRulePackInput } from "./rulepack.dto.js";

/** One statutory contribution as the console renders it. */
export interface EffectiveStatutory {
  code: string;
  label: string;
  appliesTo: string;
  employeePct: number | null;
  employerPct: number | null;
  verified: boolean;
  asOf: string | null;
}

/**
 * The fully-resolved rule-pack (static baseline + any stored override) that the
 * admin console renders and the app consumes. Flattened/serialisable — no
 * functions — so it crosses the API boundary cleanly.
 */
export interface EffectiveRulePack {
  countryCode: string;
  countryName: string;
  currencyCode: string;
  taxLabel: string;
  taxLongName: string;
  defaultTaxRatePct: number;
  taxpayerIdLabel: string;
  regionLabel: string;
  regions: string[];
  paymentProviders: { code: string; label: string }[];
  statutory: EffectiveStatutory[];
  verifiedAsOf: string | null;
  sourceUrl: string | null;
  sources: string[];
  rulePackVersion: string;
  /** True when a stored override is layered over the baseline. */
  overridden: boolean;
  updatedAt: string | null;
}

/** ISO date (YYYY-MM-DD) or null from a nullable DateTime column. */
function toIsoDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/**
 * Resolves and persists the editable slice of a jurisdiction rule-pack. The
 * static, verified baseline lives in @jamquote/core (getJurisdiction); this
 * service layers a per-country DB override (RulePackConfig) over it via the
 * pure core merge. Read by the admin console and by registration (to seed a new
 * tenant's default GCT rate); written only via /admin/rulepack (MANAGE_RULEPACK).
 */
@Injectable()
export class RulePackService {
  private readonly logger = new Logger(RulePackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Map a stored row to the core override shape (null row → no override). */
  private toOverride(row: RulePackConfig | null): RulePackOverride | null {
    if (!row) return null;
    const statutoryRates =
      (row.statutoryRates as RulePackOverride["statutoryRates"]) ?? undefined;
    return {
      taxLabel: row.taxLabel ?? undefined,
      defaultTaxRatePct:
        row.defaultTaxRatePct !== null ? Number(row.defaultTaxRatePct) : undefined,
      verifiedAsOf: row.verifiedAsOf !== null ? toIsoDate(row.verifiedAsOf) : undefined,
      // The maintained list when there is one, otherwise the single primary
      // link, otherwise nothing (and the baseline's list stands).
      // `?? []` is not defensive padding for its own sake: a throw anywhere in
      // this mapper is swallowed by resolveProfile's catch and silently serves
      // the in-code baseline, so a row missing a column would drop every stored
      // override without a visible error.
      sources:
        (row.sources ?? []).length > 0
          ? row.sources
          : row.sourceUrl
            ? [row.sourceUrl]
            : undefined,
      statutoryRates,
      // Prisma types a Json column as JsonValue, which overlaps nothing, so
      // the double cast is unavoidable. It asserts exactly what the DTO
      // validated on the way in — the admin INPUT shape, not a full
      // StatutoryContributionDef; the provenance fields are derived by the
      // merge in core, never stored.
      statutoryCustom:
        (row.statutoryCustom as unknown as RulePackOverride["statutoryCustom"]) ?? undefined,
      statutoryRetired:
        (row.statutoryRetired ?? []).length > 0 ? row.statutoryRetired : undefined,
    };
  }

  /** The effective (baseline + override) profile — resilient to a missing table. */
  private async resolveProfile(
    countryCode: string,
  ): Promise<{ profile: JurisdictionProfile; row: RulePackConfig | null }> {
    const base = getJurisdiction(countryCode); // throws for an unsupported country
    try {
      const row = await this.prisma.rulePackConfig.findUnique({
        where: { countryCode: base.countryCode },
      });
      return { profile: applyRulePackOverride(base, this.toOverride(row)), row };
    } catch (err) {
      this.logger.warn(
        `RulePackConfig read failed (table/row missing?) — using in-code baseline for ${base.countryCode}: ${String(err)}`,
      );
      return { profile: base, row: null };
    }
  }

  private toEffective(
    profile: JurisdictionProfile,
    row: RulePackConfig | null,
  ): EffectiveRulePack {
    return {
      countryCode: profile.countryCode,
      countryName: profile.countryName,
      currencyCode: profile.currency.code,
      taxLabel: profile.taxLabel,
      taxLongName: profile.taxLongName,
      defaultTaxRatePct: profile.defaultTaxRatePct,
      taxpayerIdLabel: profile.taxpayerId.label,
      regionLabel: profile.regionLabel,
      regions: [...profile.regions],
      paymentProviders: profile.paymentProviders.map((p) => ({ code: p.code, label: p.label })),
      statutory: profile.statutory.map((s) => ({
        code: s.code,
        label: s.label,
        appliesTo: s.appliesTo,
        employeePct: s.employeePct ?? null,
        employerPct: s.employerPct ?? null,
        verified: s.verified,
        asOf: s.asOf,
      })),
      verifiedAsOf: profile.verifiedAsOf,
      sourceUrl: row?.sourceUrl ?? profile.sources[0] ?? null,
      sources: [...profile.sources],
      rulePackVersion: profile.rulePackVersion,
      overridden: row !== null,
      updatedAt: row ? row.updatedAt.toISOString() : null,
    };
  }

  /** GET /admin/rulepack — the effective pack for a country (default JM). */
  async get(countryCode = "JM"): Promise<EffectiveRulePack> {
    const { profile, row } = await this.resolveProfile(countryCode);
    return this.toEffective(profile, row);
  }

  /**
   * The effective default consumption-tax rate for a country — used at
   * registration to seed a new tenant's Business.defaultGctRate from the pack
   * rather than a hardcoded constant. Falls back to the baseline on any error.
   */
  async defaultTaxRatePct(countryCode = "JM"): Promise<number> {
    try {
      return (await this.resolveProfile(countryCode)).profile.defaultTaxRatePct;
    } catch (err) {
      this.logger.warn(`defaultTaxRatePct fell back to baseline: ${String(err)}`);
      return getJurisdiction(countryCode).defaultTaxRatePct;
    }
  }

  /** PATCH /admin/rulepack — upsert the override, merge over the baseline, audit. */
  async update(
    countryCode: string,
    patch: UpdateRulePackInput,
    actorUserId: string,
  ): Promise<EffectiveRulePack> {
    const base = getJurisdiction(countryCode); // validates the country
    const cc = base.countryCode;

    // Merge submitted statutory rates over any already stored, so a partial
    // edit of one contribution doesn't wipe the others.
    const existing = await this.prisma.rulePackConfig.findUnique({ where: { countryCode: cc } });
    const mergedStatutory = {
      ...((existing?.statutoryRates as Record<string, unknown>) ?? {}),
      ...(patch.statutoryRates ?? {}),
    };

    const data = {
      ...(patch.taxLabel !== undefined ? { taxLabel: patch.taxLabel } : {}),
      ...(patch.defaultTaxRatePct !== undefined
        ? { defaultTaxRatePct: patch.defaultTaxRatePct }
        : {}),
      ...(patch.verifiedAsOf !== undefined
        ? { verifiedAsOf: patch.verifiedAsOf ? new Date(patch.verifiedAsOf) : null }
        : {}),
      ...(patch.sourceUrl !== undefined
        ? { sourceUrl: patch.sourceUrl ? patch.sourceUrl : null }
        : {}),
      ...(patch.statutoryRates !== undefined
        ? { statutoryRates: mergedStatutory as Prisma.InputJsonValue }
        : {}),
      // These three REPLACE rather than merge: each is a list the admin edits
      // as a whole on screen, so a submitted list is the intended final state.
      // Merging would make removing an entry impossible.
      ...(patch.statutoryCustom !== undefined
        ? { statutoryCustom: patch.statutoryCustom as unknown as Prisma.InputJsonValue }
        : {}),
      ...(patch.statutoryRetired !== undefined
        ? { statutoryRetired: patch.statutoryRetired }
        : {}),
      ...(patch.sources !== undefined ? { sources: patch.sources } : {}),
      updatedByUserId: actorUserId,
    };

    const row = await this.prisma.rulePackConfig.upsert({
      where: { countryCode: cc },
      create: { countryCode: cc, ...data },
      update: data,
    });

    await this.audit.record({
      actorUserId,
      action: "rulepack.update",
      targetType: "RulePackConfig",
      targetId: cc,
      details: { ...patch },
    });

    return this.toEffective(applyRulePackOverride(base, this.toOverride(row)), row);
  }
}
