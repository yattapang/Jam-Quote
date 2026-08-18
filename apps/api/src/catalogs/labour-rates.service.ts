import { Injectable, NotFoundException } from "@nestjs/common";
import type { LabourRate } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { CatalogHiddenService, CatalogKind } from "./catalog-hidden.service.js";
import type { CreateLabourRateInput, UpdateLabourRateInput } from "./catalogs.dto.js";

@Injectable()
export class LabourRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hiddenCatalog: CatalogHiddenService,
  ) {}

  create(businessId: string, input: CreateLabourRateInput): Promise<LabourRate> {
    return this.prisma.labourRate.create({ data: { ...input, businessId } });
  }

  /**
    * `includeHidden` is for the settings screen only — a rate that vanished the
    * moment it was hidden could never be restored. Everywhere else a hidden
    * rate is gone from the pickers, which is the whole point: hiding the TRADE
    * "Tiler" never removed the saved rate "Tiler — Master", and that read as
    * the hide being ignored.
    */
  async findAll(businessId: string, includeHidden = false): Promise<LabourRate[]> {
    const [rows, hidden] = await Promise.all([
      this.prisma.labourRate.findMany({
        where: { businessId, deletedAt: null },
        orderBy: { trade: "asc" },
      }),
      includeHidden
        ? Promise.resolve(new Set<string>())
        : this.hiddenCatalog.hiddenIds(businessId, CatalogKind.LABOUR_RATE),
    ]);
    return hidden.size === 0 ? rows : rows.filter((r) => !hidden.has(r.id));
  }

  async findOne(businessId: string, id: string): Promise<LabourRate> {
    const rate = await this.prisma.labourRate.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!rate) throw new NotFoundException("Labour rate not found");
    return rate;
  }

  async update(
    businessId: string,
    id: string,
    input: UpdateLabourRateInput,
  ): Promise<LabourRate> {
    await this.findOne(businessId, id);
    return this.prisma.labourRate.update({ where: { id }, data: input });
  }

  /** Soft-delete: sets deletedAt rather than removing the row, so offline
   * clients doing a delta-sync can observe the tombstone. */
  async remove(businessId: string, id: string): Promise<void> {
    await this.findOne(businessId, id);
    await this.prisma.labourRate.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
