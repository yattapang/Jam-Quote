import { Controller, Get, UseGuards } from "@nestjs/common";
import { TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { BusinessId } from "../common/business-id.decorator.js";
import { MaterialSchemaService, type MaterialSchemaView } from "./material-schema.service.js";

/**
 * GET /catalogs/material-schema — the category/attribute/option/unit tree this
 * business may use (curated rows plus its own additions). Drives the material
 * form's dynamic fields and the spec pickers.
 *
 * Read-only in Phase 2a. Editing the curated catalog is an admin-console
 * capability in Phase 3; tenant additions currently happen implicitly, as a
 * side effect of entering a value the vocabulary does not yet have.
 */
@Controller("catalogs/material-schema")
@UseGuards(TenantAuthGuard)
export class MaterialSchemaController {
  constructor(private readonly schema: MaterialSchemaService) {}

  @Get()
  get(@BusinessId() businessId: string): Promise<MaterialSchemaView> {
    return this.schema.getSchema(businessId);
  }
}
