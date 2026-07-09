import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import type { MaterialFavourite } from "@prisma/client";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { MaterialFavouritesService } from "./material-favourites.service.js";
import {
  createMaterialFavouriteSchema,
  updateMaterialFavouriteSchema,
  type CreateMaterialFavouriteInput,
  type UpdateMaterialFavouriteInput,
} from "./catalogs.dto.js";

@Controller("catalogs/material-favourites")
export class MaterialFavouritesController {
  constructor(private readonly materialFavourites: MaterialFavouritesService) {}

  @Post()
  create(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(createMaterialFavouriteSchema))
    body: CreateMaterialFavouriteInput,
  ): Promise<MaterialFavourite> {
    return this.materialFavourites.create(businessId, body);
  }

  @Get()
  findAll(@BusinessId() businessId: string): Promise<MaterialFavourite[]> {
    return this.materialFavourites.findAll(businessId);
  }

  @Get(":id")
  findOne(
    @BusinessId() businessId: string,
    @Param("id") id: string,
  ): Promise<MaterialFavourite> {
    return this.materialFavourites.findOne(businessId, id);
  }

  @Patch(":id")
  update(
    @BusinessId() businessId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateMaterialFavouriteSchema))
    body: UpdateMaterialFavouriteInput,
  ): Promise<MaterialFavourite> {
    return this.materialFavourites.update(businessId, id, body);
  }

  @Delete(":id")
  remove(@BusinessId() businessId: string, @Param("id") id: string): Promise<void> {
    return this.materialFavourites.remove(businessId, id);
  }
}
