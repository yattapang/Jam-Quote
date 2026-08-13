import { describe, expect, it, vi } from "vitest";
import { RegulatoryService } from "./regulatory.service.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const row = {
  id: "reg-1",
  title: "GCT registration threshold increases to JMD 15M",
  category: "GCT",
  summary: "Tax Administration Jamaica raised the mandatory GCT registration threshold.",
  effectiveDate: new Date("2026-08-01T00:00:00.000Z"),
  sourceUrl: "https://www.jamaicatax.gov.jm",
};

function makeService() {
  const prisma = {
    regulatoryUpdate: { findMany: vi.fn().mockResolvedValue([row]) },
  };
  return { svc: new RegulatoryService(prisma as any), prisma };
}

describe("RegulatoryService.list", () => {
  it("returns the published feed, newest guidance first and bounded", async () => {
    const { svc, prisma } = makeService();

    await expect(svc.list()).resolves.toEqual([row]);

    const args = prisma.regulatoryUpdate.findMany.mock.calls[0]?.[0];
    expect(args.orderBy).toEqual({ publishedAt: "desc" });
    expect(args.take).toBe(20);
  });

  it("never selects actionNeeded — that column is a staff operations note", async () => {
    // Seeded rows carry things like "Update seeded LabourRate defaults for new
    // tenants": internal backlog, not something to show a contractor. The
    // select is an allow-list precisely so a future column is opt-in.
    const { svc, prisma } = makeService();

    await svc.list();

    const select = prisma.regulatoryUpdate.findMany.mock.calls[0]?.[0]?.select;
    expect(select).toEqual({
      id: true,
      title: true,
      category: true,
      summary: true,
      effectiveDate: true,
      sourceUrl: true,
    });
    expect(select).not.toHaveProperty("actionNeeded");
  });

  it("queries no business-owned data at all, so no caller can reach another tenant's records", async () => {
    // The cross-tenant check this repo requires on every tenant endpoint (#6,
    // #19, #20) is satisfied structurally here rather than by an ownership
    // filter: RegulatoryUpdate has no businessId column, so the feed holds no
    // tenant-owned rows to leak. This test locks that in — if the query ever
    // grows a `where` (i.e. the model gains a tenant dimension), it fails and
    // forces a real ownership check plus a real isolation test.
    const { svc, prisma } = makeService();

    await svc.list();

    const args = prisma.regulatoryUpdate.findMany.mock.calls[0]?.[0];
    expect(args).not.toHaveProperty("where");
    expect(args).not.toHaveProperty("include");
    // list() takes no businessId, so it cannot be tricked into scoping wrong.
    expect(svc.list).toHaveLength(0);
  });

  it("gives every caller the identical platform-wide feed", async () => {
    const { svc } = makeService();

    // Two arbitrary tenants, same read — the endpoint carries nothing that
    // could differ per business, which is the point.
    await expect(svc.list()).resolves.toEqual(await svc.list());
  });
});
