import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PaymentMethod, InvoiceStatus } from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";
import { WiPayService } from "./wipay.service.js";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wipay: WiPayService,
  ) {}

  /** Start a WiPay card payment for an invoice; returns the hosted checkout URL. */
  async startCardPayment(invoiceId: string): Promise<{ paymentUrl: string }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { client: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");

    const balance = invoice.totalCents - invoice.paidCents;
    const { paymentUrl, providerRef } = await this.wipay.createPaymentRequest({
      orderId: invoice.number,
      amountCents: balance,
      customerName: invoice.client
        ? `${invoice.client.firstName} ${invoice.client.lastName}`.trim()
        : undefined,
      customerEmail: invoice.client?.email ?? undefined,
      customerPhone: invoice.client?.phone ?? undefined,
    });

    // Record a pending payment so the webhook can reconcile it.
    await this.prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amountCents: balance,
        method: PaymentMethod.CARD,
        providerRef,
        status: "pending",
      },
    });

    return { paymentUrl };
  }

  /** Handle a verified WiPay webhook/callback. */
  async handleWiPayCallback(payload: Record<string, string>): Promise<void> {
    if (!this.wipay.verifyCallback(payload)) {
      this.logger.warn("Rejected WiPay callback: hash mismatch");
      return; // never trust an unverified callback
    }
    const orderId = payload.order_id;
    const invoice = await this.prisma.invoice.findFirst({
      where: { number: orderId },
    });
    if (!invoice) {
      this.logger.warn(`WiPay callback for unknown invoice ${orderId}`);
      return;
    }

    const succeeded = this.wipay.isSuccessful(payload);
    const amountCents = Math.round(parseFloat(payload.total ?? "0") * 100);

    await this.prisma.$transaction(async (tx) => {
      // Only a still-"pending" CARD payment gets transitioned. On a replayed
      // callback the row is already "completed", so `count` is 0 — that gates
      // the balance update below and keeps the webhook idempotent.
      const { count } = await tx.payment.updateMany({
        where: { invoiceId: invoice.id, status: "pending", method: "CARD" },
        data: {
          status: succeeded ? "completed" : "failed",
          providerRef: payload.transaction_id,
          providerRaw: payload,
        },
      });

      // No pending payment was transitioned (duplicate/replayed callback, or
      // one already reconciled) — never re-apply the amount to the invoice.
      if (count === 0) {
        this.logger.warn(
          `WiPay callback for invoice ${orderId} matched no pending payment; skipping balance update`,
        );
        return;
      }

      if (succeeded) {
        const paidCents = invoice.paidCents + amountCents;
        const status =
          paidCents >= invoice.totalCents
            ? InvoiceStatus.PAID
            : InvoiceStatus.PARTIAL;
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { paidCents, status },
        });
      }
    });
  }

  /** Record a manual (non-card) payment: cash, bank transfer, Lynk. */
  async recordManualPayment(input: {
    invoiceId: string;
    amountCents: number;
    method: PaymentMethod;
  }): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: input.invoiceId },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amountCents: input.amountCents,
          method: input.method,
          status: "completed",
        },
      });
      const paidCents = invoice.paidCents + input.amountCents;
      const status =
        paidCents >= invoice.totalCents
          ? InvoiceStatus.PAID
          : InvoiceStatus.PARTIAL;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { paidCents, status },
      });
    });
  }
}
