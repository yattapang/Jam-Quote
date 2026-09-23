import { Body, Controller, Delete, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { PaymentsService } from "./payments.service.js";
import { recordManualPaymentSchema, type RecordManualPaymentInput } from "./payments.dto.js";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * Begin a card payment; client redirects to the returned WiPay URL. Guarded
   * (unlike the webhook below) — the service verifies invoiceId belongs to
   * the caller's business before doing anything, closing what was an IDOR:
   * any caller who knew/guessed an invoiceId could previously start (and on
   * the manual route below, directly record) a payment against ANY tenant's
   * invoice.
   */
  @Post("invoices/:invoiceId/card")
  @UseGuards(TenantAuthGuard)
  startCard(
    @Param("invoiceId") invoiceId: string,
    @BusinessId() businessId: string,
  ): Promise<{ paymentUrl: string }> {
    return this.payments.startCardPayment(businessId, invoiceId);
  }

  /**
   * WiPay server-to-server callback. Must stay public — WiPay cannot present
   * a JWT — but is still verified: handleWiPayCallback checks the payload's
   * hash (wipay.service.ts verifyCallback) before trusting anything in it.
   */
  @Post("wipay/webhook")
  async webhook(@Req() req: Request): Promise<{ received: true }> {
    const payload = req.body as Record<string, string>;
    await this.payments.handleWiPayCallback(payload);
    return { received: true };
  }

  /** Record a manual payment (cash / bank transfer / Lynk). */
  @Post("invoices/:invoiceId/manual")
  @UseGuards(TenantAuthGuard)
  recordManual(
    @Param("invoiceId") invoiceId: string,
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(recordManualPaymentSchema)) body: RecordManualPaymentInput,
  ): Promise<void> {
    return this.payments.recordManualPayment({ businessId, invoiceId, ...body });
  }

  /**
   * Void a recorded payment. Soft-delete — the row survives so what was
   * corrected stays answerable.
   */
  @Delete(":paymentId")
  @UseGuards(TenantAuthGuard)
  voidPayment(
    @Param("paymentId") paymentId: string,
    @BusinessId() businessId: string,
  ): Promise<void> {
    return this.payments.voidPayment(businessId, paymentId);
  }

}
