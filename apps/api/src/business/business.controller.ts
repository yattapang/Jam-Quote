import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { Business } from "@prisma/client";
import { TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { BusinessService } from "./business.service.js";
import {
  createBusinessSchema,
  updateBusinessSchema,
  uploadLogoSchema,
  type CreateBusinessInput,
  type UpdateBusinessInput,
  type UploadLogoInput,
} from "./business.dto.js";
import { normalizeLogo } from "./logo-image.js";

/**
 * Every route here is tenant-scoped and behind TenantAuthGuard.
 *
 * POST / (create) is included in that: registration does NOT call this
 * endpoint — AuthService.register (../auth/auth.service.ts) creates the
 * Business directly inside its own transaction, seeded from the rule-pack,
 * and issues the token itself. No caller in apps/web or apps/mobile hits
 * POST /business either. It previously took an unauthenticated raw body and
 * created an orphan Business row for anyone who called it; now that the
 * class-level guard covers it too, it just requires an existing tenant
 * session, which no real flow needs. Left in place (rather than deleted) in
 * case it's genuinely dead and safe to remove later — flagging that instead
 * of unilaterally deleting a route during a security pass.
 */
@Controller("business")
@UseGuards(TenantAuthGuard)
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createBusinessSchema)) body: CreateBusinessInput,
  ): Promise<Business> {
    return this.business.create(body);
  }

  /** Convenience lookup for the caller's own business. */
  @Get("current")
  current(@BusinessId() businessId: string): Promise<Business> {
    return this.business.findById(businessId);
  }


  // --- Logo (#27) ----------------------------------------------------------
  // Routes are declared BEFORE @Get(":id") on purpose: Nest matches in
  // declaration order, so "logo" would otherwise be swallowed as an :id.

  /**
   * Metadata only — no bytes. Lets the settings screen show "you have a logo,
   * 800x240" without pulling the image down twice.
   */
  @Get("logo/meta")
  logoMeta(@BusinessId() businessId: string) {
    return this.business.getLogoMeta(businessId);
  }

  /**
   * Serves the raw image for the caller's own business.
   *
   * The response headers are the real defence, and each is load-bearing:
   *  - Content-Type is the SNIFFED type, never anything the uploader claimed.
   *  - nosniff stops a browser second-guessing that type and executing the
   *    bytes as HTML, which is the whole polyglot-file attack.
   *  - inline + a fixed filename keeps a crafted name out of the download UI.
   *  - private caching because this is one tenant's asset, not shared content.
   */
  @Get("logo")
  async logo(@BusinessId() businessId: string, @Res() res: Response): Promise<void> {
    const row = await this.business.getLogo(businessId);
    if (!row) throw new NotFoundException("No logo set");
    res.setHeader("Content-Type", row.contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", 'inline; filename="logo"');
    res.setHeader("Cache-Control", "private, max-age=300");
    res.end(Buffer.from(row.bytes));
  }

  /**
   * Upload or replace. The bytes go through normalizeLogo before they are
   * stored: format sniffed from the file itself, size and dimensions bounded,
   * and Exif/text metadata stripped — a phone photo of a shop sign otherwise
   * carries GPS coordinates into every quote PDF the contractor sends.
   */
  @Post("logo")
  async uploadLogo(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(uploadLogoSchema)) body: UploadLogoInput,
  ) {
    const normalized = normalizeLogo(Buffer.from(body.base64, "base64"));
    return this.business.setLogo(businessId, normalized);
  }

  @Delete("logo")
  async removeLogo(@BusinessId() businessId: string): Promise<void> {
    await this.business.removeLogo(businessId);
  }

  /**
   * :id must match the caller's own business — this is not a general
   * lookup. Without this check any authenticated tenant user could read (or,
   * on PATCH below, overwrite) any OTHER business by id, which is exactly
   * the cross-tenant hole this pass closes.
   */
  @Get(":id")
  findOne(@Param("id") id: string, @BusinessId() businessId: string): Promise<Business> {
    this.assertOwnBusiness(id, businessId);
    return this.business.findById(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(updateBusinessSchema)) body: UpdateBusinessInput,
  ): Promise<Business> {
    this.assertOwnBusiness(id, businessId);
    return this.business.update(id, body);
  }

  private assertOwnBusiness(paramId: string, callerBusinessId: string): void {
    if (paramId !== callerBusinessId) {
      throw new ForbiddenException("You may only access your own business");
    }
  }
}
