import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { MaterialPricesService } from "./material-prices.service.js";
import {
  createMaterialPriceEntrySchema,
  materialPriceEntryQuerySchema,
  type CreateMaterialPriceEntryInput,
  type MaterialPriceEntryQuery,
} from "./catalogs.dto.js";

/**
 * Per-supplier prices for a business's own materials (#26 Phase 2b).
 *
 * A SEPARATE controller from SuppliersController on purpose: that one is the
 * global supplier directory and is deliberately unauthenticated (see the note
 * in catalogs.module.ts). Hanging tenant price data off it would create an
 * unauthenticated read/write surface over what contractors pay their
 * suppliers. Everything here is behind TenantAuthGuard and scoped by
 * businessId.
 */
@Controller("catalogs/material-prices")
@UseGuards(TenantAuthGuard)
export class MaterialPricesController {
  constructor(private readonly materialPrices: MaterialPricesService) {}

  @Get()
  findForMaterial(
    @BusinessId() businessId: string,
    @Query(new ZodValidationPipe(materialPriceEntryQuerySchema)) query: MaterialPriceEntryQuery,
  ) {
    return this.materialPrices.findForMaterial(businessId, query.materialFavouriteId);
  }

  @Post()
  create(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(createMaterialPriceEntrySchema)) body: CreateMaterialPriceEntryInput,
  ) {
    return this.materialPrices.create(businessId, body);
  }

  @Delete(":id")
  remove(@BusinessId() businessId: string, @Param("id") id: string) {
    return this.materialPrices.remove(businessId, id);
  }
}
