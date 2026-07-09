import { Injectable, NotFoundException } from "@nestjs/common";
import type { MaterialFavourite } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type {
  CreateMaterialFavouriteInput,
  UpdateMaterialFavouriteInput,
} from "./catalogs.dto.js";

@Injectable()
export class MaterialFavouritesService {
  constructor(private readonly prisma: PrismaService) {}

  create(
    businessId: string,
    input: CreateMaterialFavouriteInput,
  ): Promise<MaterialFavourite> {
    return this.prisma.materialFavourite.create({ data: { ...input, businessId } });
  }

  findAll(businessId: string): Promise<MaterialFavourite[]> {
    return this.prisma.materialFavourite.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
    });
  }

  async findOne(businessId: string, id: string): Promise<MaterialFavourite> {
    const fav = await this.prisma.materialFavourite.findFirst({ where: { id, businessId } });
    if (!fav) throw new NotFoundException("Material favourite not found");
    return fav;
  }

  async update(
    businessId: string,
    id: string,
    input: UpdateMaterialFavouriteInput,
  ): Promise<MaterialFavourite> {
    await this.findOne(businessId, id);
    return this.prisma.materialFavourite.update({ where: { id }, data: input });
  }

  async remove(businessId: string, id: string): Promise<void> {
    await this.findOne(businessId, id);
    await this.prisma.materialFavourite.delete({ where: { id } });
  }
}
