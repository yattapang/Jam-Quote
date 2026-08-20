import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { Purchase } from "@prisma/client";
import type { JobProfit } from "@jamquote/core";
import { TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { PurchasesService } from "./purchases.service.js";
import {
  createLabourEntrySchema,
  createPurchaseSchema,
  labourEntryQuerySchema,
  purchaseQuerySchema,
  updatePurchaseSchema,
  type CreateLabourEntryInput,
  type CreatePurchaseInput,
  type LabourEntryQuery,
  type PurchaseQuery,
  type UpdatePurchaseInput,
} from "./purchases.dto.js";

@Controller("purchases")
@UseGuards(TenantAuthGuard)
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get()
  findAll(
    @BusinessId() businessId: string,
    @Query(new ZodValidationPipe(purchaseQuerySchema)) query: PurchaseQuery,
  ): Promise<Purchase[]> {
    return this.purchases.findAll(businessId, query);
  }

  /** Did this job make money? Revenue from its INVOICES (not quotes), less
   * what was spent against it. */
  @Get("project/:projectId/profit")
  projectProfit(
    @BusinessId() businessId: string,
    @Param("projectId") projectId: string,
  ): Promise<JobProfit> {
    return this.purchases.projectProfit(businessId, projectId);
  }

  // --- Labour: time worked on a job ---------------------------------------

  @Get("labour")
  findAllLabour(
    @BusinessId() businessId: string,
    @Query(new ZodValidationPipe(labourEntryQuerySchema)) query: LabourEntryQuery,
  ) {
    return this.purchases.findAllLabour(businessId, query);
  }

  @Post("labour")
  createLabour(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(createLabourEntrySchema)) body: CreateLabourEntryInput,
  ) {
    return this.purchases.createLabour(businessId, body);
  }

  @Delete("labour/:id")
  removeLabour(@BusinessId() businessId: string, @Param("id") id: string): Promise<void> {
    return this.purchases.removeLabour(businessId, id);
  }

  /** Categories this business has already used, for the purchase form's
   * dropdown. MUST stay above `@Get(":id")` or "categories" is read as an id. */
  @Get("categories")
  categories(@BusinessId() businessId: string): Promise<string[]> {
    return this.purchases.distinctCategories(businessId);
  }

  @Get(":id")
  findOne(@BusinessId() businessId: string, @Param("id") id: string): Promise<Purchase> {
    return this.purchases.findOne(businessId, id);
  }

  @Post()
  create(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(createPurchaseSchema)) body: CreatePurchaseInput,
  ): Promise<Purchase> {
    return this.purchases.create(businessId, body);
  }

  @Patch(":id")
  update(
    @BusinessId() businessId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePurchaseSchema)) body: UpdatePurchaseInput,
  ): Promise<Purchase> {
    return this.purchases.update(businessId, id, body);
  }

  @Delete(":id")
  remove(@BusinessId() businessId: string, @Param("id") id: string): Promise<void> {
    return this.purchases.remove(businessId, id);
  }
}
