import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SubscriptionPayment } from "@prisma/client";
import { SubscriptionInterval, nextTermEnd } from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";
import { PricingService } from "../billing/pricing.service.js";
import { AuditService } from "./audit.service.js";
import type { RecordSubscriptionPaymentInput } from "./admin.dto.js";

/**
 * Money a tenant has paid JamQuote for their subscription.
 *
 * NOT `PaymentsService`, which records a contractor's client paying the
 * contractor's invoice. Two separate books of account — platform revenue here,
 * tenant revenue there — and they must never be summed. The class names are
 * deliberately distinct so the wrong one cannot be injected by muscle memory.
 *
 * Recording a payment IS the state transition. Before this existed an admin
 * had to set the plan, then the renewal date, and could not set the status at
 * all (nothing ever wrote it). Now one action advances everything, which is
 * what makes "apply the funding and the account follows" true.
 */
@Injectable()
export class SubscriptionPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
  ) {}

  /** Newest first. Voided rows are included — they are history, and hiding
   * them would make a ledger that cannot be reconciled against a bank
   * statement. */
  async findAll(businessId: string): Promise<SubscriptionPayment[]> {
    return this.prisma.subscriptionPayment.findMany({
      where: { businessId },
      orderBy: { paidAt: "desc" },
    });
  }

  /**
   * Record a payment and advance the term.
   *
   * The term bought runs from the current renewal date (or today, if the
   * subscription has lapsed or never had one) to one interval later — see
   * `nextTermEnd` in core, which deliberately advances from the LATER of the
   * two so paying early keeps the days already bought.
   *
   * Whole terms only, by decision: partial credit would need proration nobody
   * has asked for, and it keeps the ledger trivially reconcilable with
   * `Subscription.renewsAt`.
   */
  async record(
    businessId: string,
    input: RecordSubscriptionPaymentInput,
    actorUserId: string,
  ): Promise<SubscriptionPayment> {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException("Business not found");

    const existing = await this.prisma.subscription.findUnique({ where: { businessId } });
    const interval = input.interval ?? existing?.interval ?? SubscriptionInterval.MONTHLY;
    const pricing = await this.pricing.get();

    // What they agreed to pay wins over the list price; otherwise the standard
    // price for the term. Never guessed from the amount handed in — a short
    // payment should be visible as a short payment, not silently redefine the
    // agreed rate.
    const standard =
      interval === SubscriptionInterval.ANNUAL
        ? pricing.proAnnualPriceCents
        : pricing.proMonthlyPriceCents;
    const amountCents = input.amountCents ?? existing?.priceCents ?? standard;
    if (amountCents <= 0) throw new BadRequestException("Payment amount must be positive");

    const now = new Date();
    const coversFrom =
      existing?.renewsAt && existing.renewsAt.getTime() > now.getTime() ? existing.renewsAt : now;
    const coversUntil = nextTermEnd(
      interval,
      existing?.renewsAt ? existing.renewsAt.toISOString() : null,
      now,
    );

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.subscriptionPayment.create({
        data: {
          businessId,
          amountCents,
          currency: pricing.currency,
          method: input.method,
          reference: input.reference ?? null,
          paidAt: input.paidAt ? new Date(input.paidAt) : now,
          coversFrom,
          coversUntil,
          recordedByUserId: actorUserId,
          note: input.note ?? null,
        },
      });

      // The payment IS the upgrade. A tenant who has paid is on pro, whatever
      // they were a moment ago — including one who had reverted to free.
      await tx.subscription.upsert({
        where: { businessId },
        create: {
          businessId,
          plan: "pro",
          status: "active",
          interval,
          priceCents: existing?.priceCents ?? null,
          renewsAt: coversUntil,
        },
        update: { plan: "pro", interval, renewsAt: coversUntil },
      });

      return created;
    });

    await this.audit.record({
      actorUserId,
      action: "subscription.payment.record",
      targetType: "Business",
      targetId: businessId,
      details: {
        amountCents,
        method: input.method,
        interval,
        coversUntil: coversUntil.toISOString(),
      },
    });

    return payment;
  }

  /**
   * Void a payment — never delete one.
   *
   * Retracting the term is conditional on purpose. If the subscription still
   * ends exactly where this payment left it, nothing has happened since and
   * the term is rolled back to where it started; that is what makes "void and
   * re-record" safe for a mis-keyed amount, which would otherwise extend the
   * term twice.
   *
   * If the dates have moved on — a later payment, or a staff edit — the term
   * is left alone. Silently rewinding someone else's change would be worse
   * than leaving a correction for a human to make deliberately.
   */
  async void(paymentId: string, actorUserId: string): Promise<SubscriptionPayment> {
    const payment = await this.prisma.subscriptionPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException("Subscription payment not found");
    if (payment.voidedAt) throw new BadRequestException("Payment is already voided");

    const subscription = await this.prisma.subscription.findUnique({
      where: { businessId: payment.businessId },
    });
    const termRetractable =
      subscription?.renewsAt != null &&
      subscription.renewsAt.getTime() === payment.coversUntil.getTime();

    const voided = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscriptionPayment.update({
        where: { id: paymentId },
        data: { voidedAt: new Date() },
      });
      if (termRetractable) {
        await tx.subscription.update({
          where: { businessId: payment.businessId },
          data: { renewsAt: payment.coversFrom },
        });
      }
      return updated;
    });

    await this.audit.record({
      actorUserId,
      action: "subscription.payment.void",
      targetType: "Business",
      targetId: payment.businessId,
      details: {
        paymentId,
        amountCents: payment.amountCents,
        // Recorded either way: "we voided but left the term" is exactly the
        // kind of thing someone will need to explain later.
        termRetracted: termRetractable,
      },
    });

    return voided;
  }
}
