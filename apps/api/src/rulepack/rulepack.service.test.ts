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
