import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { Supplier } from "@prisma/client";
import { TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { SuppliersService } from "./suppliers.service.js";
import {
  createSupplierSchema,
  updateSupplierSchema,
  type CreateSupplierInput,
  type UpdateSupplierInput,
} from "./catalogs.dto.js";

/**
 * A contractor's own supplier list. Every route is tenant-scoped: until #28
 * this controller carried NO guard at all, so POST/PATCH/DELETE were reachable
 * unauthenticated by anyone who could guess a supplier id.
 */
@Controller("catalogs/suppliers")
@UseGuards(TenantAuthGuard)
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Post()
  create(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(createSupplierSchema)) body: CreateSupplierInput,
  ): Promise<Supplier> {
    return this.suppliers.create(businessId, body);
  }

  @Get()
  findAll(@BusinessId() businessId: string): Promise<Supplier[]> {
    return this.suppliers.findAll(businessId);
  }

  @Get(":id")
  findOne(@BusinessId() businessId: string, @Param("id") id: string): Promise<Supplier> {
    return this.suppliers.findOne(businessId, id);
  }

  @Patch(":id")
  update(
    @BusinessId() businessId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSupplierSchema)) body: UpdateSupplierInput,
  ): Promise<Supplier> {
    return this.suppliers.update(businessId, id, body);
  }

  @Delete(":id")
  remove(@BusinessId() businessId: string, @Param("id") id: string): Promise<void> {
    return this.suppliers.remove(businessId, id);
  }
}
