import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type SubscriptionPayment } from "@prisma/client";
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
          interval,
          recordedByUserId: actorUserId,
          note: input.note ?? null,
        },
      });

      // Paid-through comes from the LEDGER, not from this one payment. Same
      // call on record and on void, so the two can never disagree about how
      // far a tenant is paid up.
      const paidThrough = await this.reallocateTerms(tx, businessId, coversUntil);

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
          renewsAt: paidThrough,
        },
        update: { plan: "pro", interval, renewsAt: paidThrough },
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
   * The term is then RECOMPUTED from whatever payments remain, rather than
   * rolled back by this payment's own dates. The difference matters as soon as
   * there is more than one payment: voiding the FIRST of two used to leave the
   * subscription paid through the second one's end date, so a month that had
   * been paid for twice, then un-paid once, still read as fully covered. Now
   * the ledger is the single source of paid-through and voiding any payment —
   * first, middle or last — reduces it by exactly that payment's term.
   */
  async void(paymentId: string, actorUserId: string): Promise<SubscriptionPayment> {
    const payment = await this.prisma.subscriptionPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException("Subscription payment not found");
    if (payment.voidedAt) throw new BadRequestException("Payment is already voided");

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscriptionPayment.update({
        where: { id: paymentId },
        data: { voidedAt: new Date() },
      });

      // Falls back to this payment's own start when nothing is left: that is
      // where the subscription stood before any of these payments existed.
      const paidThrough = await this.reallocateTerms(tx, payment.businessId, payment.coversFrom);
      await tx.subscription.updateMany({
        where: { businessId: payment.businessId },
        data: { renewsAt: paidThrough },
      });

      return { updated, paidThrough };
    });

    await this.audit.record({
      actorUserId,
      action: "subscription.payment.void",
      targetType: "Business",
      targetId: payment.businessId,
      details: {
        paymentId,
        amountCents: payment.amountCents,
        // What the term became, not merely that it moved — someone will need
        // to explain this against a bank statement later.
        renewsAt: result.paidThrough.toISOString(),
      },
    });

    return result.updated;
  }

  /**
   * Re-allocate every surviving payment to a contiguous run of terms, and
   * return where that run now ends.
   *
   * The amount, date, method and reference of a payment are immutable facts.
   * The PERIOD it covers is not a fact — it is an allocation, a decision about
   * which term the money was applied to. Voiding an earlier payment changes
   * that decision, exactly as it would on paper: the money that is still there
   * moves up to cover the earliest outstanding period.
   *
   * Without this the ledger contradicts itself. Two consecutive months are
   * paid, the first is voided, and the subscription correctly says paid
   * through the earlier date — while the surviving row still claims to cover
   * the LATER month, which nothing paid for any more. The tenant has paid for
   * one month and both facts should say the same month.
   *
   * Allocation runs in the order the money arrived (`paidAt`), anchored at
   * where the paid run began — the earliest coversFrom across ALL payments,
   * voided ones included, since a later start date was only ever valid because
   * an earlier payment existed.
   *
   * Terms are chained with calendar arithmetic rather than summed durations:
   * Aug->Sep is 31 days and Sep->Oct is 30, so adding milliseconds drifts a
   * day per month and lands the renewal on the wrong date. That is what
   * `interval` on the payment is for.
   */
  private async reallocateTerms(
    tx: Prisma.TransactionClient,
    businessId: string,
    fallback: Date,
  ): Promise<Date> {
    const all = await tx.subscriptionPayment.findMany({
      where: { businessId },
      orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
      // paidAt is part of the question: money cannot buy a period that was already
      // over when it arrived. See the `from` calculation below.
      select: {
        id: true,
        paidAt: true,
        coversFrom: true,
        coversUntil: true,
        interval: true,
        voidedAt: true,
      },
    });
    if (all.length === 0) return fallback;

    const anchor = all.reduce(
      (earliest, p) => (p.coversFrom < earliest ? p.coversFrom : earliest),
      all[0]!.coversFrom,
    );

    // Periods a VOIDED payment used to cover. These are the only periods a
    // surviving payment may be pulled backwards into.
    //
    // The first fix here used a date proxy — "a term may start before the payment
    // date but not END before it" — which held for the monthly lapse it was written
    // against and failed for the class. A review broke it three ways: an annual
    // tenant who lapsed and paid in December got ONE month for a year's fee (the
    // chained annual term ended after the payment date, so the guard never fired);
    // a monthly tenant who paid 20 days late got 12 days; and in the shipping
    // timezone the old month arithmetic made the guard fire on the void case it
    // existed to protect.
    //
    // The proxy was standing in for a question the loop can answer outright: WHY is
    // the run's end behind this payment? A period vacated by a void should be
    // refilled — that is the money moving onto cover the tenant is now entitled to.
    // A gap where nobody paid should not be, because the tenant was on the free tier
    // through it and those months are not owed. `voidedAt` distinguishes them, and
    // it was being discarded one line after it was read.
    /**
     * THE RULE, in one sentence: a surviving payment continues the chain consecutively
     * while the term it would occupy lies inside a RUN of ground the tenant's money
     * ever covered — voided money included — and the payment itself was made inside
     * that same run; otherwise it starts at its own `paidAt`.
     *
     * This is "money buys the earliest unpaid month" (the policy PLANNING records),
     * narrowed to the months the tenant was actually paying through. A void removes
     * money, not entitlement, so later money slides back over the hole. A lapse is
     * months nobody paid for, and those are not owed.
     *
     * ## Why it is runs, and not the two previous attempts
     *
     * This rule has now been wrong three times, each time because it reasoned about a
     * single window instead of the whole ledger:
     *
     * 1. Vacated-only stranded a paid-up tenant: void Jan, lapse Feb–Jun, pay Jul gave
     *    `renewsAt` Feb 1, five months in the past, so correcting one bounced cheque
     *    knocked a paying tenant offline.
     * 2. Date-only absorbed any gap shorter than one interval, so an annual tenant who
     *    lapsed and paid in December got one month for a year's fee.
     * 3. The conjunction of the two — what shipped — held for TWO payments and broke
     *    at three. `vacated` was computed once from the voided rows' ORIGINAL windows,
     *    so the first survivor refilled that window and every later payment chained
     *    into ground that had been covered by a survivor rather than by the void.
     *    `termFitsVacated` returned false, the date test fired, and the payment was
     *    pushed forward to its own `paidAt` — reopening the gap it had just closed.
     *    The cascade could not propagate past the first refill.
     *
     *    Measured, monthly payments on each 1st: void the first of three and
     *    `renewsAt` was Apr 1 instead of Mar 1; of four, May 1 instead of Apr 1; void
     *    the middle of four and `Mar1..Apr1` was covered by no surviving payment while
     *    `renewsAt` claimed May 1. Three annuals, void the first, gave a free YEAR.
     *    And in every one of those the void took nothing away at all — `renewsAt` was
     *    identical before and after, which is the original symptom of the finding this
     *    rule exists for.
     *
     * Merging every window the money ever held into runs is what makes the cascade
     * work: the ground stays covered as the survivors shift back over it, so the test
     * still answers "was this ground paid for" after the first refill. Requiring the
     * payment to be in the SAME run is what keeps the lapse case out — asking merely
     * "is `paidAt` inside some run" pulls a lapsed-then-paid tenant back onto the run
     * their voided payment had held, which is regression 1 again.
     *
     * Ten ledgers were simulated against this before it was written, including both
     * regressions above and the annual/monthly mixes. Simulation caught attempts 1 and
     * 2; attempt 3 was the one that skipped it.
     */
    const runs: { from: number; until: number }[] = [];
    for (const span of all
      .map((p) => ({ from: p.coversFrom.getTime(), until: p.coversUntil.getTime() }))
      .sort((a, b) => a.from - b.from)) {
      const last = runs[runs.length - 1];
      if (last && span.from <= last.until) last.until = Math.max(last.until, span.until);
      else runs.push({ ...span });
    }
    const sameRun = (from: Date, until: Date, paidAt: Date): boolean =>
      runs.some(
        (r) =>
          from.getTime() >= r.from &&
          until.getTime() <= r.until &&
          paidAt.getTime() >= r.from &&
          paidAt.getTime() <= r.until,
      );

    let end = anchor;
    for (const p of all) {
      if (p.voidedAt !== null) continue; // voided money buys no period

      let from = end;
      let until = nextTermEnd(p.interval, from.toISOString(), from);
      // Already at or past the payment date means the chain is stacked ahead of it —
      // a prepayment — and there is nothing to pull back.
      const consecutive = from.getTime() >= p.paidAt.getTime() || sameRun(from, until, p.paidAt);
      if (!consecutive) {
        from = p.paidAt;
        until = nextTermEnd(p.interval, from.toISOString(), from);
      }
      // Only write when the allocation actually moved, so an ordinary payment
      // does not rewrite every earlier row it did not affect.
      if (p.coversFrom.getTime() !== from.getTime() || p.coversUntil.getTime() !== until.getTime()) {
        await tx.subscriptionPayment.update({
          where: { id: p.id },
          data: { coversFrom: from, coversUntil: until },
        });
      }
      end = until;
    }
    return end;
  }
}
