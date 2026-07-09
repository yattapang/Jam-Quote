import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import type { EquipmentItem } from "@prisma/client";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { EquipmentService } from "./equipment.service.js";
import {
  createEquipmentItemSchema,
  updateEquipmentItemSchema,
  type CreateEquipmentItemInput,
  type UpdateEquipmentItemInput,
} from "./catalogs.dto.js";

@Controller("catalogs/equipment")
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  @Post()
  create(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(createEquipmentItemSchema)) body: CreateEquipmentItemInput,
  ): Promise<EquipmentItem> {
    return this.equipment.create(businessId, body);
  }

  @Get()
  findAll(@BusinessId() businessId: string): Promise<EquipmentItem[]> {
    return this.equipment.findAll(businessId);
  }

  @Get(":id")
  findOne(@BusinessId() businessId: string, @Param("id") id: string): Promise<EquipmentItem> {
    return this.equipment.findOne(businessId, id);
  }

  @Patch(":id")
  update(
    @BusinessId() businessId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateEquipmentItemSchema)) body: UpdateEquipmentItemInput,
  ): Promise<EquipmentItem> {
    return this.equipment.update(businessId, id, body);
  }

  @Delete(":id")
  remove(@BusinessId() businessId: string, @Param("id") id: string): Promise<void> {
    return this.equipment.remove(businessId, id);
  }
}
