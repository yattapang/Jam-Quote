import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { JobStage } from "@jamquote/core";
import { JobsService } from "./jobs.service.js";
import { createJobSchema, updateJobSchema } from "./jobs.dto.js";

function withPrisma(job: Partial<Record<string, unknown>> = {}) {
  const prisma = {
    job: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ id: "job-1", businessId: "biz-1" }),
      create: vi.fn().mockResolvedValue({ id: "job-1" }),
      update: vi.fn().mockResolvedValue({ id: "job-1" }),
      delete: vi.fn().mockResolvedValue({ id: "job-1" }),
      ...job,
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { svc: new JobsService(prisma as any), prisma };
}

describe("job DTOs accept the workflow fields", () => {
  it("takes a JobStage and a 0–100 progress on create", () => {
    const parsed = createJobSchema.parse({
      name: "Retaining wall",
      stage: JobStage.IN_PROGRESS,
      progressPct: 62,
    });
    expect(parsed.stage).toBe(JobStage.IN_PROGRESS);
    expect(parsed.progressPct).toBe(62);
  });

  it("rejects the legacy free-text stages the column used to hold", () => {
    // The whole point of #36: 'In progress' and 'Invoiced' are no longer
    // things a client may invent — the enum is the vocabulary.
    expect(() => createJobSchema.parse({ name: "x", stage: "In progress" })).toThrow();
    expect(() => createJobSchema.parse({ name: "x", stage: "Invoiced" })).toThrow();
  });

  it("rejects an out-of-range or fractional progress", () => {
    expect(() => createJobSchema.parse({ name: "x", progressPct: 101 })).toThrow();
    expect(() => createJobSchema.parse({ name: "x", progressPct: -1 })).toThrow();
    expect(() => createJobSchema.parse({ name: "x", progressPct: 62.5 })).toThrow();
  });

  it("allows a stage-only update — stage is settable on its own", () => {
    const parsed = updateJobSchema.parse({ stage: JobStage.COMPLETE });
    expect(parsed).toEqual({ stage: JobStage.COMPLETE });
  });
});

describe("JobsService tenant scoping", () => {
  it("writes the stage and progress straight through on create, under the caller's businessId", () => {
    const { svc, prisma } = withPrisma();
    void svc.create("biz-1", { name: "Retaining wall", stage: JobStage.WON, progressPct: 10 });
    expect(prisma.job.create).toHaveBeenCalledWith({
      data: { name: "Retaining wall", stage: JobStage.WON, progressPct: 10, businessId: "biz-1" },
    });
  });

  it("scopes every read to the businessId", async () => {
    const { svc, prisma } = withPrisma();
    await svc.findAll("biz-1");
    expect(prisma.job.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz-1" },
      orderBy: { createdAt: "desc" },
    });
    await svc.findOne("biz-1", "job-1");
    expect(prisma.job.findFirst).toHaveBeenCalledWith({ where: { id: "job-1", businessId: "biz-1" } });
  });

  it("refuses to stage-change another tenant's job", async () => {
    // update() re-reads through findOne first, so a job that does not belong
    // to this business is a 404 rather than a cross-tenant write.
    const { svc, prisma } = withPrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    await expect(svc.update("biz-1", "job-other", { stage: JobStage.COMPLETE })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.job.update).not.toHaveBeenCalled();
  });
});
