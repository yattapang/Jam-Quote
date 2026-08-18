import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { LabourRate } from "@prisma/client";
import { TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { LabourRatesService } from "./labour-rates.service.js";
import {
  createLabourRateSchema,
  updateLabourRateSchema,
  type CreateLabourRateInput,
  type UpdateLabourRateInput,
} from "./catalogs.dto.js";

@Controller("catalogs/labour-rates")
@UseGuards(TenantAuthGuard)
export class LabourRatesController {
  constructor(private readonly labourRates: LabourRatesService) {}

  @Post()
  create(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(createLabourRateSchema)) body: CreateLabourRateInput,
  ): Promise<LabourRate> {
    return this.labourRates.create(businessId, body);
  }

  /** `?includeHidden=true` for the settings screen — see TradesController. */
  @Get()
  findAll(
    @BusinessId() businessId: string,
    @Query("includeHidden") includeHidden?: string,
  ): Promise<LabourRate[]> {
    return this.labourRates.findAll(businessId, includeHidden === "true");
  }

  @Get(":id")
  findOne(@BusinessId() businessId: string, @Param("id") id: string): Promise<LabourRate> {
    return this.labourRates.findOne(businessId, id);
  }

  @Patch(":id")
  update(
    @BusinessId() businessId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateLabourRateSchema)) body: UpdateLabourRateInput,
  ): Promise<LabourRate> {
    return this.labourRates.update(businessId, id, body);
  }

  @Delete(":id")
  remove(@BusinessId() businessId: string, @Param("id") id: string): Promise<void> {
    return this.labourRates.remove(businessId, id);
  }
}
