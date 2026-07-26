import { Injectable, NotFoundException } from "@nestjs/common";
import type { Assembly, AssemblyComponent, Prisma } from "@prisma/client";
import { computeAssemblyUnitCostCents } from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";
import type {
  AssemblyComponentInput,
  CreateAssemblyInput,
  UpdateAssemblyInput,
} from "./assemblies.dto.js";

const ASSEMBLY_DETAIL_INCLUDE = {
  components: { orderBy: { sort: "asc" as const } },
} satisfies Prisma.AssemblyInclude;

type AssemblyWithComponents = Prisma.AssemblyGetPayload<{
  include: typeof ASSEMBLY_DETAIL_INCLUDE;
}>;

export type AssemblyWithCost = AssemblyWithComponents & { unitCostCents: number };

/** Attach the computed unit cost (via @jamquote/core) to an assembly + its components. */
function withUnitCost(assembly: AssemblyWithComponents): AssemblyWithCost {
  const unitCostCents = computeAssemblyUnitCostCents({
    components: assembly.components.map((c) => ({
      quantityPerUnit: Number(c.quantityPerUnit),
      unitPriceCents: c.unitPriceCents,
    })),
    markupPct: Number(assembly.markupPct),
  });
  return { ...assembly, unitCostCents };
}

function componentCreateData(
  assemblyId: string,
  c: AssemblyComponentInput,
  idx: number,
): Prisma.AssemblyComponentUncheckedCreateInput {
  return {
    assemblyId,
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
export class AssembliesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(businessId: string, input: CreateAssemblyInput): Promise<AssemblyWithCost> {
    const assemblyId = await this.prisma.$transaction(async (tx) => {
      const assembly = await tx.assembly.create({
        data: {
          businessId,
          name: input.name,
          unit: input.unit,
          markupPct: input.markupPct ?? 0,
        },
      });
      for (const [idx, c] of input.components.entries()) {
        await tx.assemblyComponent.create({
          data: componentCreateData(assembly.id, c, idx),
        });
      }
      return assembly.id;
    });

    return this.findOne(businessId, assemblyId);
  }

  async findAll(businessId: string): Promise<AssemblyWithCost[]> {
    const assemblies = await this.prisma.assembly.findMany({
      where: { businessId, deletedAt: null },
      include: ASSEMBLY_DETAIL_INCLUDE,
      orderBy: { name: "asc" },
    });
    return assemblies.map(withUnitCost);
  }

  async findOne(businessId: string, id: string): Promise<AssemblyWithCost> {
    const assembly = await this.prisma.assembly.findFirst({
      where: { id, businessId, deletedAt: null },
      include: ASSEMBLY_DETAIL_INCLUDE,
    });
    if (!assembly) throw new NotFoundException("Assembly not found");
    return withUnitCost(assembly);
  }

  /** Throws NotFoundException via findOne if the assembly doesn't exist (or isn't this business's). */
  private async assertExists(businessId: string, id: string): Promise<Assembly> {
    const assembly = await this.prisma.assembly.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!assembly) throw new NotFoundException("Assembly not found");
    return assembly;
  }

  async update(
    businessId: string,
    id: string,
    input: UpdateAssemblyInput,
  ): Promise<AssemblyWithCost> {
    const existing = await this.assertExists(businessId, id);
    const replacingComponents = input.components !== undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.assembly.update({
        where: { id },
        data: {
          name: input.name ?? existing.name,
          unit: input.unit ?? existing.unit,
          markupPct: input.markupPct ?? existing.markupPct,
        },
      });

      if (replacingComponents) {
        await tx.assemblyComponent.deleteMany({ where: { assemblyId: id } });
        for (const [idx, c] of (input.components ?? []).entries()) {
          await tx.assemblyComponent.create({ data: componentCreateData(id, c, idx) });
        }
      }
    });

    return this.findOne(businessId, id);
  }

  /** Soft-delete: sets deletedAt rather than removing the row, so offline
   * clients doing a delta-sync can observe the tombstone. */
  async remove(businessId: string, id: string): Promise<void> {
    await this.assertExists(businessId, id);
    await this.prisma.assembly.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
