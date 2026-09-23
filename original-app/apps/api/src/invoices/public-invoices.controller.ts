import { Controller, Get, NotFoundException, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { InvoicesService } from "./invoices.service.js";
import { BusinessService } from "../business/business.service.js";

/**
 * The public invoice link, alongside the public quote one.
 *
 * Unauthenticated by design: the client has no account and never will. Every
 * word of `PublicQuotesController`'s reasoning applies here — the token is a
 * capability, there is no businessId, and a DRAFT is indistinguishable from an
 * unknown token so the response cannot be used to probe which tokens are real.
 *
 * This exists because a payment reminder that names a figure but cannot show
 * the document behind it is the first thing a chased client queries.
 */
@Controller("public/invoices")
export class PublicInvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly business: BusinessService,
  ) {}

  /**
   * The business logo for THIS shared invoice, scoped by the share token.
   * Mirrors PublicQuotesController.logo — resolves businessId from the token
   * (same draft/unknown-token collapse), then serves only the logo bytes.
   */
  @Get(":token/logo")
  async logo(@Param("token") token: string, @Res() res: Response): Promise<void> {
    const businessId = await this.invoices.resolveBusinessIdByShareToken(token);
    const row = await this.business.getLogo(businessId);
    // Same message as an unknown/draft token ("Invoice not found" from
    // resolveBusinessIdByShareToken) — a business with no logo must not be
    // distinguishable from a bad token by response wording.
    if (!row) throw new NotFoundException("Invoice not found");
    res.setHeader("Content-Type", row.contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", 'inline; filename="logo"');
    // Private, not public: a shared/CDN cache could otherwise keep serving a
    // revoked link's logo for the cache lifetime after the contractor
    // revokes it. Still cacheable by the one client holding this link.
    res.setHeader("Cache-Control", "private, max-age=300");
    res.end(Buffer.from(row.bytes));
  }

  /** Resolving the link also records the first view — the only evidence a
   * chase actually landed. */
  @Get(":token")
  findByToken(@Param("token") token: string) {
    return this.invoices.findByShareToken(token);
  }
}
