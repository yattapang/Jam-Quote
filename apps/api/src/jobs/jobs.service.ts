import { Injectable, NotFoundException } from "@nestjs/common";
import type { Job, JobComponent, Prisma } from "@prisma/client";
import { computeJobUnitCostCents } from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";
import type {
  JobComponentInput,
  CreateJobInput,
  UpdateJobInput,
} from "./jobs.dto.js";

const ASSEMBLY_DETAIL_INCLUDE = {
  components: { orderBy: { sort: "asc" as const } },
} satisfies Prisma.JobInclude;

type AssemblyWithComponents = Prisma.JobGetPayload<{
  include: typeof ASSEMBLY_DETAIL_INCLUDE;
}>;

export type JobWithCost = AssemblyWithComponents & { unitCostCents: number };

/** Attach the computed unit cost (via @jamquote/core) to an job + its components. */
function withUnitCost(job: AssemblyWithComponents): JobWithCost {
  const unitCostCents = computeJobUnitCostCents({
    components: job.components.map((c) => ({
      quantityPerUnit: Number(c.quantityPerUnit),
      unitPriceCents: c.unitPriceCents,
    })),
    markupPct: Number(job.markupPct),
  });
  return { ...job, unitCostCents };
}

function componentCreateData(
  jobId: string,
  c: JobComponentInput,
  idx: number,
): Prisma.JobComponentUncheckedCreateInput {
  return {
    jobId,
    kind: c.kind,
    materialFavouriteId: c.materialFavouriteId,
    labourRateId: c.labourRateId,
    description: c.description,
    quantityPerUnit: c.quantityPerUnit,
    unitPriceCents: c.unitPriceCents,
    sort: c.sort ?? idx,
  };
}

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(businessId: string, input: CreateJobInput): Promise<JobWithCost> {
    const jobId = await this.prisma.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          businessId,
          name: input.name,
          unit: input.unit,
          markupPct: input.markupPct ?? 0,
        },
      });
      for (const [idx, c] of input.components.entries()) {
        await tx.jobComponent.create({
          data: componentCreateData(job.id, c, idx),
        });
      }
      return job.id;
    });

    return this.findOne(businessId, jobId);
  }

  async findAll(businessId: string): Promise<JobWithCost[]> {
    const jobs = await this.prisma.job.findMany({
      where: { businessId, deletedAt: null },
      include: ASSEMBLY_DETAIL_INCLUDE,
      orderBy: { name: "asc" },
    });
    return jobs.map(withUnitCost);
  }

  async findOne(businessId: string, id: string): Promise<JobWithCost> {
    const job = await this.prisma.job.findFirst({
      where: { id, businessId, deletedAt: null },
      include: ASSEMBLY_DETAIL_INCLUDE,
    });
    if (!job) throw new NotFoundException("Job not found");
    return withUnitCost(job);
  }

  /** Throws NotFoundException via findOne if the job doesn't exist (or isn't this business's). */
  private async assertExists(businessId: string, id: string): Promise<Job> {
    const job = await this.prisma.job.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!job) throw new NotFoundException("Job not found");
    return job;
  }

  async update(
    businessId: string,
    id: string,
    input: UpdateJobInput,
  ): Promise<JobWithCost> {
    const existing = await this.assertExists(businessId, id);
    const replacingComponents = input.components !== undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id },
        data: {
          name: input.name ?? existing.name,
          unit: input.unit ?? existing.unit,
          markupPct: input.markupPct ?? existing.markupPct,
        },
      });

      if (replacingComponents) {
        await tx.jobComponent.deleteMany({ where: { jobId: id } });
        for (const [idx, c] of (input.components ?? []).entries()) {
          await tx.jobComponent.create({ data: componentCreateData(id, c, idx) });
        }
      }
    });

    return this.findOne(businessId, id);
  }

  /** Soft-delete: sets deletedAt rather than removing the row, so offline
   * clients doing a delta-sync can observe the tombstone. */
  async remove(businessId: string, id: string): Promise<void> {
    await this.assertExists(businessId, id);
    await this.prisma.job.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
