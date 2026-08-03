import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { InvoiceStatus } from "@jamquote/core";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { InvoicesService } from "./invoices.service.js";
import { updateInvoiceSchema, type UpdateInvoiceInput } from "./invoices.dto.js";

@Controller("invoices")
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  /** Convert an ACCEPTED quote into a new DRAFT invoice. */
  @Post("from-quote/:quoteId")
  convertFromQuote(@BusinessId() businessId: string, @Param("quoteId") quoteId: string) {
    return this.invoices.convertFromQuote(businessId, quoteId);
  }

  @Get()
  findAll(
    @BusinessId() businessId: string,
    @Query("status") status?: InvoiceStatus,
    @Query("clientId") clientId?: string,
  ) {
    return this.invoices.findAll(businessId, { status, clientId });
  }

  @Get(":id")
  findOne(@BusinessId() businessId: string, @Param("id") id: string) {
    return this.invoices.findOne(businessId, id);
  }

  @Patch(":id")
  update(
    @BusinessId() businessId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateInvoiceSchema)) body: UpdateInvoiceInput,
  ) {
    return this.invoices.update(businessId, id, body);
  }

  /** DRAFT -> INVOICED. Also flips the source quote (if any) to INVOICED. */
  @Post(":id/finalize")
  finalize(@BusinessId() businessId: string, @Param("id") id: string) {
    return this.invoices.finalize(businessId, id);
  }

  @Delete(":id")
  remove(@BusinessId() businessId: string, @Param("id") id: string) {
    return this.invoices.remove(businessId, id);
  }
}
