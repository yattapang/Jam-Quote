import { Injectable, NotFoundException } from "@nestjs/common";
import type { LabourRate } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateLabourRateInput, UpdateLabourRateInput } from "./catalogs.dto.js";

@Injectable()
export class LabourRatesService {
  constructor(private readonly prisma: PrismaService) {}

  create(businessId: string, input: CreateLabourRateInput): Promise<LabourRate> {
    return this.prisma.labourRate.create({ data: { ...input, businessId } });
  }

  findAll(businessId: string): Promise<LabourRate[]> {
    return this.prisma.labourRate.findMany({ where: { businessId }, orderBy: { trade: "asc" } });
  }

  async findOne(businessId: string, id: string): Promise<LabourRate> {
    const rate = await this.prisma.labourRate.findFirst({ where: { id, businessId } });
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

  async remove(businessId: string, id: string): Promise<void> {
    await this.findOne(businessId, id);
    await this.prisma.labourRate.delete({ where: { id } });
  }
}
