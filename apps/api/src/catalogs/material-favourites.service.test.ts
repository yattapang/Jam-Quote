import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { MaterialFavouritesService } from "./material-favourites.service.js";

function withPrisma(
  materialFavourite: Partial<Record<string, unknown>> = {},
  extra: { $queryRaw?: ReturnType<typeof vi.fn> } = {},
) {
  const prisma = {
    materialFavourite: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      ...materialFavourite,
    },
    $queryRaw: extra.$queryRaw ?? vi.fn().mockResolvedValue([]),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { svc: new MaterialFavouritesService(prisma as any), prisma };
}

describe("MaterialFavouritesService.create", () => {
  it("passes the optional category + specs straight through to prisma", async () => {
    const { svc, prisma } = withPrisma({ create: vi.fn().mockResolvedValue({}) });
    await svc.create("biz-1", {
      name: "Rebar 1/2in",
      priceCents: 25000,
      category: "Steel / Rebar",
      specs: { Diameter: "1/2in", Length: "20ft" },
    });
    expect(prisma.materialFavourite.create).toHaveBeenCalledWith({
      data: {
        name: "Rebar 1/2in",
        priceCents: 25000,
        category: "Steel / Rebar",
        specs: { Diameter: "1/2in", Length: "20ft" },
        businessId: "biz-1",
      },
    });
  });

  it("still works with no category/specs (backward compatible)", async () => {
    const { svc, prisma } = withPrisma({ create: vi.fn().mockResolvedValue({}) });
    await svc.create("biz-1", { name: "Cement", priceCents: 1200 });
    expect(prisma.materialFavourite.create).toHaveBeenCalledWith({
      data: { name: "Cement", priceCents: 1200, businessId: "biz-1" },
    });
  });

  it("passes description straight through to prisma", async () => {
    const { svc, prisma } = withPrisma({ create: vi.fn().mockResolvedValue({}) });
    await svc.create("biz-1", {
      name: "Cedar 2x4x8",
      priceCents: 1500,
      description: "Leftover from the Palisadoes job, slightly weathered",
    });
    expect(prisma.materialFavourite.create).toHaveBeenCalledWith({
      data: {
        name: "Cedar 2x4x8",
        priceCents: 1500,
        description: "Leftover from the Palisadoes job, slightly weathered",
        businessId: "biz-1",
      },
    });
  });
});

describe("MaterialFavouritesService.update", () => {
  it("passes category + specs through on update", async () => {
    const { svc, prisma } = withPrisma({
      findFirst: vi.fn().mockResolvedValue({ id: "mat-1", businessId: "biz-1" }),
      update: vi.fn().mockResolvedValue({}),
    });
    await svc.update("biz-1", "mat-1", { category: "Blocks", specs: { Size: "6in", Type: "Solid" } });
    expect(prisma.materialFavourite.update).toHaveBeenCalledWith({
      where: { id: "mat-1" },
      data: { category: "Blocks", specs: { Size: "6in", Type: "Solid" } },
    });
  });

  it("allows clearing description with an empty string", async () => {
    const { svc, prisma } = withPrisma({
      findFirst: vi.fn().mockResolvedValue({ id: "mat-1", businessId: "biz-1" }),
      update: vi.fn().mockResolvedValue({}),
    });
    await svc.update("biz-1", "mat-1", { description: "" });
    expect(prisma.materialFavourite.update).toHaveBeenCalledWith({
      where: { id: "mat-1" },
      data: { description: "" },
    });
  });
});

describe("MaterialFavouritesService.findOne", () => {
  it("throws NotFoundException when no matching row exists", async () => {
    const { svc, prisma } = withPrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    await expect(svc.findOne("biz-1", "missing")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.materialFavourite.findFirst).toHaveBeenCalledWith({
      where: { id: "missing", businessId: "biz-1", deletedAt: null },
    });
  });
});

describe("MaterialFavouritesService.findAll", () => {
  it("returns everything (backward compatible) when no params are given", async () => {
    const { svc, prisma } = withPrisma({ findMany: vi.fn().mockResolvedValue([]) });
    await svc.findAll("biz-1");
    expect(prisma.materialFavourite.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz-1", deletedAt: null },
      orderBy: { name: "asc" },
    });
    // No `q` given, so the JSON/description search path never runs.
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("excludes soft-deleted rows (deletedAt: null in the where clause)", async () => {
    const { svc, prisma } = withPrisma({ findMany: vi.fn().mockResolvedValue([]) });
    await svc.findAll("biz-1");
    expect(prisma.materialFavourite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
  });

  it("filters by category with an exact match", async () => {
    const { svc, prisma } = withPrisma({ findMany: vi.fn().mockResolvedValue([]) });
    await svc.findAll("biz-1", { category: "Steel / Rebar" });
    expect(prisma.materialFavourite.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz-1", deletedAt: null, category: "Steel / Rebar" },
      orderBy: { name: "asc" },
    });
  });

  it("applies and caps `limit` via Prisma `take`", async () => {
    const { svc, prisma } = withPrisma({ findMany: vi.fn().mockResolvedValue([]) });
    await svc.findAll("biz-1", { limit: 5 });
    expect(prisma.materialFavourite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });

  it("resolves `q` matches via the raw search query, then re-fetches full rows by id", async () => {
    const $queryRaw = vi.fn().mockResolvedValue([{ id: "mat-1" }, { id: "mat-2" }]);
    const { svc, prisma } = withPrisma({ findMany: vi.fn().mockResolvedValue([]) }, { $queryRaw });
    await svc.findAll("biz-1", { q: "cedar" });

    expect($queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.materialFavourite.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz-1", deletedAt: null, id: { in: ["mat-1", "mat-2"] } },
      orderBy: { name: "asc" },
    });
  });

  // The service's Prisma layer is mocked in every test in this file (no live
  // Postgres), so we can't execute the raw query and observe real ILIKE
  // matching against name/description/specs. What we *can* verify at this
  // level is that the raw query we hand to $queryRaw actually contains the
  // clauses that would perform each of those matches (and, via ILIKE, that
  // matching is case-insensitive) — Postgres's ILIKE semantics themselves
  // are exercised by the migration + real DB, not by this unit suite.
  it("the raw query matches on name via a case-insensitive ILIKE", async () => {
    const $queryRaw = vi.fn().mockResolvedValue([]);
    const { svc } = withPrisma({}, { $queryRaw });
    await svc.findAll("biz-1", { q: "Cedar" });
    const sqlArg = $queryRaw.mock.calls[0]![0];
    expect(sqlArg.sql).toMatch(/"name"\s+ILIKE/);
    expect(sqlArg.values).toContain("%Cedar%");
  });

  it("the raw query matches on description via a case-insensitive ILIKE", async () => {
    const $queryRaw = vi.fn().mockResolvedValue([]);
    const { svc } = withPrisma({}, { $queryRaw });
    await svc.findAll("biz-1", { q: "weathered" });
    const sqlArg = $queryRaw.mock.calls[0]![0];
    expect(sqlArg.sql).toMatch(/"description"\s+ILIKE/);
  });

  it("the raw query matches on values inside the specs JSON via jsonb_each_text + ILIKE", async () => {
    const $queryRaw = vi.fn().mockResolvedValue([]);
    const { svc } = withPrisma({}, { $queryRaw });
    await svc.findAll("biz-1", { q: "2x4" });
    const sqlArg = $queryRaw.mock.calls[0]![0];
    expect(sqlArg.sql).toMatch(/jsonb_each_text/);
    expect(sqlArg.sql).toMatch(/spec\.value\s+ILIKE/);
    expect(sqlArg.values).toContain("%2x4%");
  });

  it("a `q` containing SQL metacharacters is bound as a parameter, not concatenated into the query text", async () => {
    const $queryRaw = vi.fn().mockResolvedValue([]);
    const { svc } = withPrisma({}, { $queryRaw });
    const malicious = "' OR 1=1 --";
    await svc.findAll("biz-1", { q: malicious });

    expect($queryRaw).toHaveBeenCalledTimes(1);
    const sqlArg = $queryRaw.mock.calls[0]![0];
    // The malicious string must appear only as a bound value...
    expect(sqlArg.values).toContain(`%${malicious}%`);
    // ...and never spliced into the parameterised SQL text itself, which
    // would be the injection.
    expect(sqlArg.sql).not.toContain(malicious);
  });
});

describe("MaterialFavouritesService.remove", () => {
  it("soft-deletes by setting deletedAt instead of removing the row", async () => {
    const { svc, prisma } = withPrisma({
      findFirst: vi.fn().mockResolvedValue({ id: "mat-1", businessId: "biz-1" }),
    });
    await svc.remove("biz-1", "mat-1");
    expect(prisma.materialFavourite.update).toHaveBeenCalledWith({
      where: { id: "mat-1" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prisma.materialFavourite.delete).not.toHaveBeenCalled();
  });

  it("throws NotFoundException instead of deleting when the row is already gone", async () => {
    const { svc, prisma } = withPrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    await expect(svc.remove("biz-1", "missing")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.materialFavourite.update).not.toHaveBeenCalled();
    expect(prisma.materialFavourite.delete).not.toHaveBeenCalled();
  });
});
