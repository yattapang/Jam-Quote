import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PaymentMethod, InvoiceStatus } from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";
import { WiPayService } from "./wipay.service.js";

/**
 * The invoice status implied by how much has been paid.
 *
 * Voiding never returns an invoice to DRAFT: a draft has not been issued, so
 * it could not have had a payment in the first place, and sending one back
 * there would make an already-sent invoice editable again.
 */
function statusForPaid(paidCents: number, totalCents: number): InvoiceStatus {
  if (paidCents >= totalCents) return InvoiceStatus.PAID;
  if (paidCents > 0) return InvoiceStatus.PARTIAL;
  return InvoiceStatus.INVOICED;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wipay: WiPayService,
  ) {}

  /**
   * Start a WiPay card payment for an invoice; returns the hosted checkout
   * URL. Scoped to businessId — findFirst (not findUnique by id alone) so a
   * caller can never start (and thus fund a pending Payment row against) a
   * payment on another tenant's invoice, even knowing its id.
   */
  async startCardPayment(businessId: string, invoiceId: string): Promise<{ paymentUrl: string }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
      include: { client: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");

    const balance = invoice.totalCents - invoice.paidCents;
    const { paymentUrl, providerRef } = await this.wipay.createPaymentRequest({
      // The invoice UUID, NOT invoice.number. Numbers are unique per tenant
      // (@@unique([businessId, number])) and every business starts from
      // INV-0001, so a number round-tripped through the provider comes back
      // ambiguous — the callback could reconcile a real payment against a
      // different tenant's invoice. handleWiPayCallback resolves this by id.
      orderId: invoice.id,
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
    // order_id is the invoice's UUID (see startCardPayment). It must be
    // resolved by id and never by number: invoice numbers are only unique
    // within a business, so a number lookup here could match — and credit —
    // another tenant's invoice entirely.
    const orderId = payload.order_id;
    const invoice = orderId
      ? await this.prisma.invoice.findUnique({ where: { id: orderId } })
      : null;
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

  /**
   * Record a manual (non-card) payment: cash, bank transfer, Lynk. Scoped to
   * businessId for the same reason as startCardPayment above — otherwise
   * any caller could mark ANY tenant's invoice as paid by amountCents of
   * their choosing.
   */
  async recordManualPayment(input: {
    businessId: string;
    invoiceId: string;
    amountCents: number;
    method: PaymentMethod;
    reference?: string;
    paidAt?: Date;
  }): Promise<void> {
    // Ownership check before anything else — see the IDOR note on the
    // controller. Only the id is needed here; paidCents is deliberately NOT
    // read outside the transaction (see below).
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: input.invoiceId, businessId: input.businessId },
      select: { id: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amountCents: input.amountCents,
          method: input.method,
          providerRef: input.reference,
          paidAt: input.paidAt,
          status: "completed",
        },
      });

      // Atomic increment, then re-read INSIDE the transaction.
      //
      // This previously computed `invoice.paidCents + amount` from a row read
      // before the transaction opened — a read-modify-write race. Two payments
      // recorded at once (the contractor on a phone and the office on a
      // laptop, or a WiPay callback landing mid-entry) would each start from
      // the same stale figure and the second write would erase the first. On
      // an invoice that is real money owed by a real customer.
      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: { paidCents: { increment: input.amountCents } },
        select: { paidCents: true, totalCents: true },
      });

      // Status is derived from the post-increment truth rather than a
      // prediction made before it.
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: statusForPaid(updated.paidCents, updated.totalCents) },
      });
    });
  }

  /**
   * Void a recorded payment and take its amount back off the invoice.
   *
   * This exists because there was no correction path at all: a contractor who
   * typed $500,000 instead of $50,000 could not undo it, and since paidCents
   * is incremented atomically it cannot be edited back by hand either. A wrong
   * payment with no undo is worse than no payment feature.
   *
   * SOFT delete, not hard. The row survives with deletedAt set, so what was
   * voided and when stays answerable — this IS the audit trail for the action.
   * (The AuditLog in src/admin is keyed on an admin actorUserId and records
   * platform-staff actions; a tenant correcting their own book does not belong
   * in it.) It also gives offline clients a tombstone to observe, which is why
   * Payment carries deletedAt and an updatedAt sync cursor.
   *
   * Voiding a CARD payment does not refund anybody — it only corrects this
   * ledger. The UI says so; the service deliberately does not refuse, because
   * refusing would leave a mis-recorded card payment permanently wrong.
   */
  async voidPayment(businessId: string, paymentId: string): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      // The tenant check goes through the invoice — Payment has no businessId
      // of its own, and an id is not a capability.
      where: { id: paymentId, deletedAt: null, invoice: { businessId } },
      select: { id: true, amountCents: true, invoiceId: true },
    });
    // Also covers an already-voided payment: re-voiding must not decrement a
    // second time, which would understate what the customer has paid.
    if (!payment) throw new NotFoundException("Payment not found");

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { deletedAt: new Date() },
      });

      // Mirror of recordManualPayment: atomic, then re-read inside the
      // transaction rather than predicting the result.
      const updated = await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: { paidCents: { decrement: payment.amountCents } },
        select: { paidCents: true, totalCents: true },
      });

      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: statusForPaid(updated.paidCents, updated.totalCents) },
      });
    });
  }

}
