import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Job, Prisma } from "@prisma/client";
import { computeJobUnitCostCents, normalizeUnitLabel } from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";
import { assertJobComponentRefsOwned } from "../common/assert-owned.js";
import { MAX_COMPONENTS, componentsMaxMessage } from "./jobs.dto.js";
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

export type JobWithCost = AssemblyWithComponents & { unitCostCents: number; costInvalid: boolean };

/**
 * Attach the computed unit cost (via @jamquote/core) to a job + its
 * components — for a READ path, so it must never throw.
 *
 * jobs.dto.ts now refuses any new save whose cost would not fit a Postgres
 * `Int`, but a row written before that check existed (or planted directly)
 * can still be sitting in the database. computeJobUnitCostCents itself
 * throws RangeError past Number.MAX_SAFE_INTEGER rather than silently
 * losing precision — correct for a WRITE, where a wrong-but-plausible price
 * is worse than a hard error, but fatal for a LIST: one such row inside
 * `findAll` would 500 every future load of this business's whole jobs list,
 * and inside `findOne` would make that one job permanently unopenable.
 *
 * Degrades instead: the row is returned with `costInvalid: true` and a
 * `unitCostCents` of 0, so the list still loads and the job can be opened and
 * fixed. It must NOT carry a placeholder price: an earlier version returned
 * the Int32 ceiling as a "visibly wrong" number, but the quote builder copies
 * `unitCostCents` straight into a line's price, so picking such a job would
 * have quoted $21,474,836.47. The web marks the job as needing a fix and keeps
 * it out of the quote picker instead.
 */
function withUnitCost(job: AssemblyWithComponents): JobWithCost {
  try {
    const unitCostCents = computeJobUnitCostCents({
      components: job.components.map((c) => ({
        quantityPerUnit: Number(c.quantityPerUnit),
        unitPriceCents: c.unitPriceCents,
      })),
      markupPct: Number(job.markupPct),
    });
    return { ...job, unitCostCents, costInvalid: false };
  } catch {
    return { ...job, unitCostCents: 0, costInvalid: true };
  }
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
    equipmentItemId: c.equipmentItemId,
    description: c.description,
    quantityPerUnit: c.quantityPerUnit,
    // `m2` -> `m²` etc., same normalisation as material units
    // (material-schema.service.ts) — applied here so every recipe row gets
    // it regardless of which client wrote it.
    unitLabel: c.unitLabel ? normalizeUnitLabel(c.unitLabel) : c.unitLabel,
    unitPriceCents: c.unitPriceCents,
    sort: c.sort ?? idx,
  };
}

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(businessId: string, input: CreateJobInput): Promise<JobWithCost> {
    // Ids are not capabilities: without this a tenant could recipe a job
    // component off another tenant's private material/labour-rate/equipment
    // row by guessing its id, and a made-up id would otherwise fail the FK
    // constraint instead of this check — telling the caller whether that id
    // exists at all.
    await assertJobComponentRefsOwned(this.prisma, businessId, input.components);

    const jobId = await this.prisma.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          businessId,
          name: input.name,
          unit: normalizeUnitLabel(input.unit),
          markupPct: input.markupPct ?? 0,
        },
      });
      // createMany over one insert per row: with the 200-row cap (jobs.dto.ts)
      // this is at most one round trip instead of up to 200, and nothing
      // afterwards needs the created rows' ids — findOne below re-fetches the
      // job with its components afresh.
      if (input.components.length > 0) {
        await tx.jobComponent.createMany({
          data: input.components.map((c, idx) => componentCreateData(job.id, c, idx)),
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
    if (replacingComponents) {
      // The 200-component cap (jobs.dto.ts) applies unconditionally on
      // create, but a job saved before that cap existed can already be
      // stored over it — production cannot be queried to know how many
      // exist. Blocking every save of such a job would lock it: even
      // renaming it would fail. So update only refuses when this edit would
      // GROW the count past the cap; shrinking, or resaving the same count
      // (e.g. a plain rename with `components` echoed back unchanged), is
      // always allowed regardless of how large the stored recipe already is.
      const existingCount = await this.prisma.jobComponent.count({ where: { jobId: id } });
      const newCount = (input.components ?? []).length;
      if (newCount > MAX_COMPONENTS && newCount > existingCount) {
        throw new BadRequestException(componentsMaxMessage);
      }
      // Ids already persisted on this job stay allowed even if the catalog
      // row they name has since been soft-deleted — renaming a job must not
      // 404 because a material it already used was deleted afterwards. A
      // NEWLY introduced id must still be live. See assert-owned.ts.
      const currentComponents = await this.prisma.jobComponent.findMany({
        where: { jobId: id },
        select: { materialFavouriteId: true, labourRateId: true, equipmentItemId: true },
      });
      await assertJobComponentRefsOwned(this.prisma, businessId, input.components ?? [], {
        materialFavouriteIds: new Set(
          currentComponents.map((c) => c.materialFavouriteId).filter((v): v is string => Boolean(v)),
        ),
        labourRateIds: new Set(
          currentComponents.map((c) => c.labourRateId).filter((v): v is string => Boolean(v)),
        ),
        equipmentItemIds: new Set(
          currentComponents.map((c) => c.equipmentItemId).filter((v): v is string => Boolean(v)),
        ),
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id },
        data: {
          name: input.name ?? existing.name,
          unit: input.unit !== undefined ? normalizeUnitLabel(input.unit) : existing.unit,
          markupPct: input.markupPct ?? existing.markupPct,
        },
      });

      if (replacingComponents) {
        await tx.jobComponent.deleteMany({ where: { jobId: id } });
        const components = input.components ?? [];
        if (components.length > 0) {
          await tx.jobComponent.createMany({
            data: components.map((c, idx) => componentCreateData(id, c, idx)),
          });
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
