import { describe, expect, it, vi } from "vitest";
import { RulePackService } from "./rulepack.service.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

function make(prismaOverrides: Record<string, unknown> = {}, audit = { record: vi.fn() }) {
  const prisma = {
    rulePackConfig: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
      ...prismaOverrides,
    },
  };
  const svc = new RulePackService(prisma as any, audit as any);
  return { svc, prisma, audit };
}

describe("RulePackService.get", () => {
  it("returns the static JM baseline when there is no override", async () => {
    const { svc } = make();
    const pack = await svc.get("JM");

    expect(pack.countryCode).toBe("JM");
    expect(pack.taxLabel).toBe("GCT");
    expect(pack.defaultTaxRatePct).toBe(15);
    expect(pack.currencyCode).toBe("JMD");
    expect(pack.overridden).toBe(false);
    // statutory ships unverified with no split rates until sourced
    const nis = pack.statutory.find((s) => s.code === "NIS")!;
    expect(nis.employeePct).toBeNull();
    expect(nis.verified).toBe(false);
  });

  it("merges a stored override over the baseline", async () => {
    const { svc } = make({
      findUnique: vi.fn().mockResolvedValue({
        countryCode: "JM",
        taxLabel: "GCT",
        defaultTaxRatePct: "12.50",
        verifiedAsOf: new Date("2026-07-31T00:00:00.000Z"),
        sourceUrl: "https://taj.gov.jm/gct",
        statutoryRates: { NIS: { employeePct: 3, employerPct: 3 } },
        updatedByUserId: "u1",
        updatedAt: new Date("2026-07-31T10:00:00.000Z"),
      }),
    });

    const pack = await svc.get("JM");
    expect(pack.defaultTaxRatePct).toBe(12.5);
    expect(pack.verifiedAsOf).toBe("2026-07-31");
    expect(pack.sourceUrl).toBe("https://taj.gov.jm/gct");
    expect(pack.overridden).toBe(true);
    const nis = pack.statutory.find((s) => s.code === "NIS")!;
    expect(nis.employeePct).toBe(3);
    expect(nis.employerPct).toBe(3);
    expect(nis.verified).toBe(true);
  });

  it("is resilient: falls back to the baseline if the table read throws", async () => {
    const { svc } = make({ findUnique: vi.fn().mockRejectedValue(new Error("no such table")) });
    const pack = await svc.get("JM");
    expect(pack.defaultTaxRatePct).toBe(15);
    expect(pack.overridden).toBe(false);
  });
});

describe("RulePackService.update — a custom entry takes over its rate", () => {
  /**
   * Two stores could hold a rate for one code, and the stale one used to win.
   *
   * `statutoryRates[code]` is a rate for a contribution the baseline defines;
   * `statutoryCustom` with the same code is a full definition. Core now lets the
   * definition win, and this prunes the store it displaced — otherwise the rate is
   * invisible junk that reappears when the custom entry is removed, and "merge"
   * means a client that stops sending it can never clear it.
   */
  function upsertData(prisma: { rulePackConfig: { upsert: ReturnType<typeof vi.fn> } }) {
    return prisma.rulePackConfig.upsert.mock.calls[0]![0]!.update as Record<string, unknown>;
  }

  it("prunes a stored rate when a custom entry claims the code", async () => {
    const { svc, prisma } = make({
      findUnique: vi.fn().mockResolvedValue({
        countryCode: "JM",
        statutoryRates: { NIS: { employeePct: 3, employerPct: 3 }, NHT: { employeePct: 2 } },
        statutoryCustom: null,
        statutoryRetired: [],
        sources: [],
      }),
      upsert: vi.fn().mockResolvedValue({
        countryCode: "JM",
        taxLabel: null,
        defaultTaxRatePct: null,
        verifiedAsOf: null,
        sourceUrl: null,
        statutoryRates: {},
        statutoryCustom: [],
        statutoryRetired: [],
        sources: [],
        updatedByUserId: "u1",
        updatedAt: new Date("2026-09-11T00:00:00.000Z"),
      }),
    });

    await svc.update(
      "JM",
      {
        statutoryCustom: [
          { code: "NIS", label: "NIS (revised)", appliesTo: "BOTH", employeePct: 7, employerPct: 7 },
        ],
      },
      "u1",
    );

    const rates = upsertData(prisma).statutoryRates as Record<string, unknown>;
    expect(rates, "the displaced rate is gone").not.toHaveProperty("NIS");
    // And the contribution nobody replaced keeps its rate.
    expect(rates).toHaveProperty("NHT");
  });

  it("writes statutoryRates even when the save carried none, so the prune lands", async () => {
    // The subtle half: a save that only adds a custom entry sends no rates at all.
    // Gating the write on `patch.statutoryRates !== undefined` would skip the prune
    // and leave the stale rate in charge — which is exactly how the console fix
    // failed before this.
    const { svc, prisma } = make({
      findUnique: vi.fn().mockResolvedValue({
        countryCode: "JM",
        statutoryRates: { NIS: { employeePct: 3 } },
        statutoryCustom: null,
        statutoryRetired: [],
        sources: [],
      }),
      upsert: vi.fn().mockResolvedValue({
        countryCode: "JM",
        taxLabel: null,
        defaultTaxRatePct: null,
        verifiedAsOf: null,
        sourceUrl: null,
        statutoryRates: {},
        statutoryCustom: [],
        statutoryRetired: [],
        sources: [],
        updatedByUserId: "u1",
        updatedAt: new Date("2026-09-11T00:00:00.000Z"),
      }),
    });

    await svc.update(
      "JM",
      { statutoryCustom: [{ code: "NIS", label: "NIS", appliesTo: "BOTH" }] },
      "u1",
    );
    expect(upsertData(prisma)).toHaveProperty("statutoryRates");
  });

  it("leaves rates alone when neither side changed", async () => {
    const { svc, prisma } = make({
      findUnique: vi.fn().mockResolvedValue({
        countryCode: "JM",
        statutoryRates: { NIS: { employeePct: 3 } },
        statutoryCustom: null,
        statutoryRetired: [],
        sources: [],
      }),
      upsert: vi.fn().mockResolvedValue({
        countryCode: "JM",
        taxLabel: "GCT",
        defaultTaxRatePct: null,
        verifiedAsOf: null,
        sourceUrl: null,
        statutoryRates: { NIS: { employeePct: 3 } },
        statutoryCustom: null,
        statutoryRetired: [],
        sources: [],
        updatedByUserId: "u1",
        updatedAt: new Date("2026-09-11T00:00:00.000Z"),
      }),
    });

    await svc.update("JM", { taxLabel: "GCT" }, "u1");
    expect(upsertData(prisma)).not.toHaveProperty("statutoryRates");
  });
});

describe("RulePackService.get — a failed read is not an absence", () => {
  /**
   * The distinction this asserts, and why it is worth a test.
   *
   * `resolveProfile` deliberately swallows a `rulePackConfig` read failure and serves
   * the in-code baseline, so quoting keeps working when that table is unreachable.
   * That is right for the app and was silently wrong for the staff console: the
   * response said `overridden: false` with empty override lists, which is
   * indistinguishable from "no override exists".
   *
   * A staffer then saw "Core baseline", no override pill — a positive claim that
   * there was nothing stored to lose — retired one contribution, and saved. Both
   * lists are complete lists, so that write replaced every stored retirement and
   * every admin-added levy with a one-element array. `overrideReadFailed` is what
   * lets the console refuse.
   */
  it("reports overrideReadFailed and still serves the baseline", async () => {
    const { svc } = make({
      findUnique: vi.fn().mockRejectedValue(new Error("relation does not exist")),
    });
    const pack = await svc.get("JM");

    expect(pack.overrideReadFailed).toBe(true);
    // Still usable: the app must keep quoting.
    expect(pack.taxLabel).toBe("GCT");
    expect(pack.defaultTaxRatePct).toBe(15);
    // And the lists it reports are empty BECAUSE it does not know, which is exactly
    // why the flag has to travel with them.
    expect(pack.statutoryRetired).toEqual([]);
    expect(pack.statutoryCustom).toEqual([]);
  });

  it("does not set the flag when there is genuinely no override", async () => {
    // The case that must stay distinguishable: a successful read of nothing.
    const { svc } = make();
    const pack = await svc.get("JM");
    expect(pack.overrideReadFailed).toBe(false);
    expect(pack.overridden).toBe(false);
  });

  it("does not set the flag on a successful read of a real override", async () => {
    const { svc } = make({
      findUnique: vi.fn().mockResolvedValue({
        countryCode: "JM",
        taxLabel: "GCT",
        defaultTaxRatePct: "15",
        verifiedAsOf: null,
        sourceUrl: null,
        statutoryRates: {},
        statutoryCustom: null,
        statutoryRetired: ["NIS"],
        sources: [],
        updatedByUserId: "u1",
        updatedAt: new Date("2026-07-31T10:00:00.000Z"),
      }),
    });
    const pack = await svc.get("JM");
    expect(pack.overrideReadFailed).toBe(false);
    expect(pack.overridden).toBe(true);
    // Reported back so the console can seed its editor — without this the editor
    // starts empty and cannot show what is already retired.
    expect(pack.statutoryRetired).toEqual(["NIS"]);
  });
});

describe("RulePackService.defaultTaxRatePct", () => {
  it("returns the effective rate for seeding a new tenant", async () => {
    const { svc } = make({
      findUnique: vi.fn().mockResolvedValue({
        countryCode: "JM",
        taxLabel: null,
        defaultTaxRatePct: "10.00",
        verifiedAsOf: null,
        sourceUrl: null,
        statutoryRates: null,
        updatedByUserId: null,
        updatedAt: new Date(),
      }),
    });
    expect(await svc.defaultTaxRatePct("JM")).toBe(10);
  });
});

describe("RulePackService.update", () => {
  it("upserts the override, merges statutory over what's stored, and audits", async () => {
    const upsert = vi.fn().mockImplementation(({ create }) => ({
      countryCode: "JM",
      taxLabel: create.taxLabel ?? null,
      defaultTaxRatePct: create.defaultTaxRatePct ?? null,
      verifiedAsOf: create.verifiedAsOf ?? null,
      sourceUrl: create.sourceUrl ?? null,
      statutoryRates: create.statutoryRates ?? null,
      updatedByUserId: create.updatedByUserId,
      updatedAt: new Date("2026-07-31T10:00:00.000Z"),
    }));
    const { svc, prisma, audit } = make({
      // one statutory rate already stored — a partial edit must not wipe it
      findUnique: vi.fn().mockResolvedValue({ statutoryRates: { NHT: { employerPct: 3 } } }),
      upsert,
    });

    const pack = await svc.update(
      "JM",
      { defaultTaxRatePct: 12.5, verifiedAsOf: "2026-07-31", statutoryRates: { NIS: { employeePct: 3 } } },
      "actor-1",
    );

    const data = upsert.mock.calls[0]![0].create;
    expect(data.defaultTaxRatePct).toBe(12.5);
    expect(data.verifiedAsOf).toEqual(new Date("2026-07-31"));
    // merged: both the pre-existing NHT and the new NIS
    expect(data.statutoryRates).toEqual({ NHT: { employerPct: 3 }, NIS: { employeePct: 3 } });
    expect(data.updatedByUserId).toBe("actor-1");

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: "actor-1", action: "rulepack.update", targetType: "RulePackConfig", targetId: "JM" }),
    );
    expect(pack.defaultTaxRatePct).toBe(12.5);
    expect(prisma.rulePackConfig.upsert).toHaveBeenCalledOnce();
  });

  it("clears the verified date when sent null", async () => {
    const upsert = vi.fn().mockResolvedValue({
      countryCode: "JM", taxLabel: null, defaultTaxRatePct: null,
      verifiedAsOf: null, sourceUrl: null, statutoryRates: null,
      updatedByUserId: "actor-1", updatedAt: new Date(),
    });
    const { svc } = make({ findUnique: vi.fn().mockResolvedValue(null), upsert });
    await svc.update("JM", { verifiedAsOf: null }, "actor-1");
    expect(upsert.mock.calls[0]![0].create.verifiedAsOf).toBeNull();
  });
});
