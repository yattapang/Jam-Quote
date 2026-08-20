import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { InvoiceStatus } from "@jamquote/core";
import { TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { InvoicesService } from "./invoices.service.js";
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  releaseRetentionSchema,
  sendReminderSchema,
  type SendReminderInput,
  type ReleaseRetentionInput,
  type CreateInvoiceInput,
  type UpdateInvoiceInput,
} from "./invoices.dto.js";

@Controller("invoices")
@UseGuards(TenantAuthGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  /**
   * Create an invoice from scratch. Distinct from from-quote below: not every
   * invoice starts as an estimate, and a call-out or repeat job has nothing to
   * convert from.
   */
  @Post()
  create(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(createInvoiceSchema)) body: CreateInvoiceInput,
  ) {
    return this.invoices.create(businessId, body);
  }

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

  /** Sign-off: the money held back is now due. Does not record a payment. */
  @Post(":id/retention-release")
  releaseRetention(
    @BusinessId() businessId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(releaseRetentionSchema)) body: ReleaseRetentionInput,
  ) {
    return this.invoices.setRetentionReleased(businessId, id, body.released);
  }

  /** Record a payment reminder and return the words to send. Composing here
   * keeps the WhatsApp text and the email body identical. */
  @Post(":id/reminders")
  sendReminder(
    @BusinessId() businessId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(sendReminderSchema)) body: SendReminderInput,
  ) {
    return this.invoices.recordReminder(businessId, id, body.channel);
  }

  @Delete(":id")
  remove(@BusinessId() businessId: string, @Param("id") id: string) {
    return this.invoices.remove(businessId, id);
  }
}
