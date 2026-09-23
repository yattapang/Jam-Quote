import { BadRequestException, Body, Controller, Delete, Get, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import {
  CATALOG_KINDS,
  CatalogHiddenService,
  type CatalogKind,
} from "./catalog-hidden.service.js";

const hiddenEntrySchema = z.object({
  kind: z.string().min(1),
  rowId: z.string().min(1),
});
type HiddenEntryInput = z.infer<typeof hiddenEntrySchema>;

/**
 * A tenant's hidden catalog entries — the vocabulary they have chosen to stop
 * being offered.
 *
 * Every route is tenant-scoped through TenantAuthGuard and @BusinessId(), and
 * the businessId is never taken from the body. That matters more here than on
 * a typical resource: these rows decide what a shared, platform-curated
 * catalog looks like, and a caller-supplied businessId would let one
 * contractor edit another's pickers.
 *
 * DELETE takes a body rather than path params because a rowId is an opaque
 * uuid from one of several tables and reads no better in a URL, and because
 * hiding and unhiding should take the identical shape.
 */
@Controller("catalogs/hidden")
@UseGuards(TenantAuthGuard)
export class CatalogHiddenController {
  constructor(private readonly hidden: CatalogHiddenService) {}

  @Get()
  findAll(@BusinessId() businessId: string): Promise<{ kind: string; rowId: string }[]> {
    return this.hidden.findAll(businessId);
  }

  @Post()
  hide(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(hiddenEntrySchema)) body: HiddenEntryInput,
  ): Promise<void> {
    return this.hidden.hide(businessId, this.assertKind(body.kind), body.rowId);
  }

  @Delete()
  unhide(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(hiddenEntrySchema)) body: HiddenEntryInput,
  ): Promise<void> {
    return this.hidden.unhide(businessId, this.assertKind(body.kind), body.rowId);
  }

  /**
   * `kind` is a plain TEXT column so adding a hideable catalog needs no
   * migration, but the API still refuses one it does not know. Storing an
   * arbitrary string would write a row that can never match a read and so
   * would silently do nothing — a hide that appears to work and does not.
   */
  private assertKind(kind: string): CatalogKind {
    if (!(CATALOG_KINDS as string[]).includes(kind)) {
      throw new BadRequestException(`Unknown catalog kind "${kind}"`);
    }
    return kind as CatalogKind;
  }
}
