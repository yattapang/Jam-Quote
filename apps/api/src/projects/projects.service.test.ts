import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { ProjectStage } from "@jamquote/core";
import { ProjectsService } from "./projects.service.js";
import { createProjectSchema, updateProjectSchema } from "./projects.dto.js";

function withPrisma(job: Partial<Record<string, unknown>> = {}) {
  const prisma = {
    // A client the caller owns. `create`/`update` now prove a caller-supplied
    // clientId belongs to this business before writing it (see
    // common/assert-owned.ts) — an id in the body is not a capability.
    client: {
      findFirst: vi.fn(({ where }: { where: { id?: string; businessId?: string } }) =>
        // Honours `where`. A fake resolving regardless would also pass for a
        // service that transposed the arguments — both are strings, so TypeScript
        // cannot object. Echoes the id back so it works whatever the test names it.
        Promise.resolve(
          where.businessId === "biz-1" && where.id ? { id: where.id, businessId: where.businessId } : null,
        ),
      ),
    },
    project: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ id: "job-1", businessId: "biz-1" }),
      create: vi.fn().mockResolvedValue({ id: "job-1" }),
      update: vi.fn().mockResolvedValue({ id: "job-1" }),
      delete: vi.fn().mockResolvedValue({ id: "job-1" }),
      ...job,
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { svc: new ProjectsService(prisma as any), prisma };
}

describe("job DTOs accept the workflow fields", () => {
  it("takes a ProjectStage and a 0–100 progress on create", () => {
    const parsed = createProjectSchema.parse({
      name: "Retaining wall",
      stage: ProjectStage.IN_PROGRESS,
      progressPct: 62,
    });
    expect(parsed.stage).toBe(ProjectStage.IN_PROGRESS);
    expect(parsed.progressPct).toBe(62);
  });

  it("rejects the legacy free-text stages the column used to hold", () => {
    // The whole point of #36: 'In progress' and 'Invoiced' are no longer
    // things a client may invent — the enum is the vocabulary.
    expect(() => createProjectSchema.parse({ name: "x", stage: "In progress" })).toThrow();
    expect(() => createProjectSchema.parse({ name: "x", stage: "Invoiced" })).toThrow();
  });

  it("rejects an out-of-range or fractional progress", () => {
    expect(() => createProjectSchema.parse({ name: "x", progressPct: 101 })).toThrow();
    expect(() => createProjectSchema.parse({ name: "x", progressPct: -1 })).toThrow();
    expect(() => createProjectSchema.parse({ name: "x", progressPct: 62.5 })).toThrow();
  });

  it("allows a stage-only update — stage is settable on its own", () => {
    const parsed = updateProjectSchema.parse({ stage: ProjectStage.COMPLETE });
    expect(parsed).toEqual({ stage: ProjectStage.COMPLETE });
  });
});

describe("ProjectsService tenant scoping", () => {
  it("writes the stage and progress straight through on create, under the caller's businessId", async () => {
    const { svc, prisma } = withPrisma();
    // Awaited, because `create` now proves the caller-supplied clientId is this
    // business's before it writes. It used to return the Prisma promise directly,
    // so a synchronous assertion happened to see the call.
    await svc.create("biz-1", { name: "Retaining wall", stage: ProjectStage.WON, progressPct: 10 });
    expect(prisma.project.create).toHaveBeenCalledWith({
      data: { name: "Retaining wall", stage: ProjectStage.WON, progressPct: 10, businessId: "biz-1" },
    });
  });

  it("scopes every read to the businessId and excludes tombstoned projects", async () => {
    const { svc, prisma } = withPrisma();
    await svc.findAll("biz-1");
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz-1", deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    await svc.findOne("biz-1", "job-1");
    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: "job-1", businessId: "biz-1", deletedAt: null },
    });
  });

  it("findAll never returns a soft-deleted project", async () => {
    // A fake that actually honours `deletedAt: null`, unlike the plain
    // `mockResolvedValue([])` default — this is the assertion that fails if
    // the tombstone filter is ever dropped from the where clause.
    const rows = [
      { id: "job-1", businessId: "biz-1", deletedAt: null },
      { id: "job-2", businessId: "biz-1", deletedAt: new Date() },
    ];
    const { svc } = withPrisma({
      findMany: vi.fn(({ where }: { where: { deletedAt?: null } }) =>
        Promise.resolve(where.deletedAt === null ? rows.filter((r) => r.deletedAt === null) : rows),
      ),
    });
    const result = await svc.findAll("biz-1");
    expect(result.map((r) => r.id)).toEqual(["job-1"]);
  });

  it("findOne 404s on a soft-deleted project rather than returning it", async () => {
    const { svc } = withPrisma({
      findFirst: vi.fn(({ where }: { where: { deletedAt?: null } }) =>
        Promise.resolve(where.deletedAt === null ? null : { id: "job-1", businessId: "biz-1" }),
      ),
    });
    await expect(svc.findOne("biz-1", "job-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("remove soft-deletes: the row survives with deletedAt set, and is not hard-deleted", async () => {
    const { svc, prisma } = withPrisma();
    await svc.remove("biz-1", "job-1");
    expect(prisma.project.delete).not.toHaveBeenCalled();
    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("refuses to stage-change another tenant's job", async () => {
    // update() re-reads through findOne first, so a job that does not belong
    // to this business is a 404 rather than a cross-tenant write.
    const { svc, prisma } = withPrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    await expect(svc.update("biz-1", "job-other", { stage: ProjectStage.COMPLETE })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.project.update).not.toHaveBeenCalled();
  });
});
