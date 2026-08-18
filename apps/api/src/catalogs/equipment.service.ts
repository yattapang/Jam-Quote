import { Injectable, NotFoundException } from "@nestjs/common";
import type { EquipmentItem } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { CatalogHiddenService, CatalogKind } from "./catalog-hidden.service.js";
import type { CreateEquipmentItemInput, UpdateEquipmentItemInput } from "./catalogs.dto.js";

@Injectable()
export class EquipmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hiddenCatalog: CatalogHiddenService,
  ) {}

  create(businessId: string, input: CreateEquipmentItemInput): Promise<EquipmentItem> {
    return this.prisma.equipmentItem.create({ data: { ...input, businessId } });
  }

  /** See LabourRatesService.findAll — `includeHidden` is the settings screen's
    * restore path and nothing else. */
  async findAll(businessId: string, includeHidden = false): Promise<EquipmentItem[]> {
    const [rows, hidden] = await Promise.all([
      this.prisma.equipmentItem.findMany({
        where: { businessId },
        orderBy: { name: "asc" },
      }),
      includeHidden
        ? Promise.resolve(new Set<string>())
        : this.hiddenCatalog.hiddenIds(businessId, CatalogKind.EQUIPMENT),
    ]);
    return hidden.size === 0 ? rows : rows.filter((r) => !hidden.has(r.id));
  }

  async findOne(businessId: string, id: string): Promise<EquipmentItem> {
    const item = await this.prisma.equipmentItem.findFirst({ where: { id, businessId } });
    if (!item) throw new NotFoundException("Equipment item not found");
    return item;
  }

  async update(
    businessId: string,
    id: string,
    input: UpdateEquipmentItemInput,
  ): Promise<EquipmentItem> {
    await this.findOne(businessId, id);
    return this.prisma.equipmentItem.update({ where: { id }, data: input });
  }

  async remove(businessId: string, id: string): Promise<void> {
    await this.findOne(businessId, id);
    await this.prisma.equipmentItem.delete({ where: { id } });
  }
}
