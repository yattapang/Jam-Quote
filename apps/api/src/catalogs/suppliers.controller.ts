import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import type { Supplier } from "@prisma/client";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { SuppliersService } from "./suppliers.service.js";
import {
  createSupplierSchema,
  updateSupplierSchema,
  type CreateSupplierInput,
  type UpdateSupplierInput,
} from "./catalogs.dto.js";

@Controller("catalogs/suppliers")
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createSupplierSchema)) body: CreateSupplierInput,
  ): Promise<Supplier> {
    return this.suppliers.create(body);
  }

  @Get()
  findAll(): Promise<Supplier[]> {
    return this.suppliers.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<Supplier> {
    return this.suppliers.findOne(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSupplierSchema)) body: UpdateSupplierInput,
  ): Promise<Supplier> {
    return this.suppliers.update(id, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string): Promise<void> {
    return this.suppliers.remove(id);
  }
}
