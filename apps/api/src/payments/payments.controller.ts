import { Body, Controller, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { PaymentMethod } from "@jamquote/core";
import { PaymentsService } from "./payments.service.js";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Begin a card payment; client redirects to the returned WiPay URL. */
  @Post("invoices/:invoiceId/card")
  startCard(@Param("invoiceId") invoiceId: string): Promise<{ paymentUrl: string }> {
    return this.payments.startCardPayment(invoiceId);
  }

  /** WiPay server-to-server callback. Body is form-encoded key/value pairs. */
  @Post("wipay/webhook")
  async webhook(@Req() req: Request): Promise<{ received: true }> {
    const payload = req.body as Record<string, string>;
    await this.payments.handleWiPayCallback(payload);
    return { received: true };
  }

  /** Record a manual payment (cash / bank transfer / Lynk). */
  @Post("invoices/:invoiceId/manual")
  recordManual(
    @Param("invoiceId") invoiceId: string,
    @Body() body: { amountCents: number; method: PaymentMethod },
  ): Promise<void> {
    return this.payments.recordManualPayment({
      invoiceId,
      amountCents: body.amountCents,
      method: body.method,
    });
  }
}
