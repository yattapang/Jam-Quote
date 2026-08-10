import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import {
  MaterialSchemaService,
  type CategoryView,
  type MaterialSchemaView,
  type UnitView,
} from "./material-schema.service.js";
import {
  createMaterialCategorySchema,
  createMaterialUnitSchema,
  type CreateMaterialCategoryInput,
  type CreateMaterialUnitInput,
} from "./catalogs.dto.js";

/**
 * GET /catalogs/material-schema — the category/attribute/option/unit tree this
 * business may use (curated rows plus its own additions). Drives the material
 * form's dynamic fields and the spec pickers.
 *
 * POST categories/units let a tenant extend that vocabulary explicitly, rather
 * than only implicitly as a side effect of entering an unknown ENUM value.
 * Each returns the created (or matched — both are idempotent) row in the same
 * shape GET uses, so the client can splice it into its cached schema without
 * a refetch. Editing the CURATED catalog remains an admin-console capability.
 */
@Controller("catalogs/material-schema")
@UseGuards(TenantAuthGuard)
export class MaterialSchemaController {
  constructor(private readonly schema: MaterialSchemaService) {}

  @Get()
  get(@BusinessId() businessId: string): Promise<MaterialSchemaView> {
    return this.schema.getSchema(businessId);
  }

  @Post("categories")
  createCategory(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(createMaterialCategorySchema))
    body: CreateMaterialCategoryInput,
  ): Promise<CategoryView> {
    return this.schema.createCategory(businessId, body);
  }

  @Post("units")
  createUnit(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(createMaterialUnitSchema))
    body: CreateMaterialUnitInput,
  ): Promise<UnitView> {
    return this.schema.createUnit(businessId, body);
  }
}
