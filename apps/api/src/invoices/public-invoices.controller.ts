import { Controller, Get, Param } from "@nestjs/common";
import { InvoicesService } from "./invoices.service.js";

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
  constructor(private readonly invoices: InvoicesService) {}

  /** Resolving the link also records the first view — the only evidence a
   * chase actually landed. */
  @Get(":token")
  findByToken(@Param("token") token: string) {
    return this.invoices.findByShareToken(token);
  }
}
