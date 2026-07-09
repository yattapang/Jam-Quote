import { Injectable, NotFoundException } from "@nestjs/common";
import type { EquipmentItem } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateEquipmentItemInput, UpdateEquipmentItemInput } from "./catalogs.dto.js";

@Injectable()
export class EquipmentService {
  constructor(private readonly prisma: PrismaService) {}

  create(businessId: string, input: CreateEquipmentItemInput): Promise<EquipmentItem> {
    return this.prisma.equipmentItem.create({ data: { ...input, businessId } });
  }

  findAll(businessId: string): Promise<EquipmentItem[]> {
    return this.prisma.equipmentItem.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
    });
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
