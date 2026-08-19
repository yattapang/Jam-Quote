import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { NoticeKind, dueNotices, shouldRevertToFree } from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";
import { PricingService } from "../billing/pricing.service.js";
import { SubscriptionMailerService } from "./subscription-mailer.service.js";

export interface SweepResult {
  noticesSent: number;
  reverted: number;
  failures: number;
}

/**
 * Sends subscription reminders and drops lapsed terms to the free plan.
 *
 * **Idempotent by construction, because it cannot be trusted to run exactly
 * once.** The API sleeps on Render's free tier, so a midnight cron may simply
 * never fire; equally it may run twice if the service restarts. So the sweep
 * is triggered three ways — on boot, on a daily cron, and from an admin button
 * — and every one of them is safe. Nothing here depends on being the only run.
 *
 * The safety comes from the ledger, not from checking first: a notice is
 * INSERTED against a unique (businessId, kind, periodEnd), and a duplicate
 * insert fails and is skipped. Reading "has this been sent?" and then sending
 * would leave a window between the two.
 *
 * Every run is recorded in SubscriptionSweepRun even when nothing was due,
 * because "no reminders sent" and "the sweep has not run in weeks" look
 * identical in a console otherwise.
 */
@Injectable()
export class SubscriptionSweepService implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly mailer: SubscriptionMailerService,
  ) {}

  /**
   * A sweep on boot, because the cron alone is not a scheduler on a host that
   * sleeps: a service woken at 09:00 by its first request never saw midnight.
   * Deliberately not awaited — a slow mail provider must not delay startup,
   * and the health check answering matters more than the sweep finishing.
   */
  onModuleInit(): void {
    void this.run("boot").catch((err) => this.logger.warn(`Boot sweep failed: ${String(err)}`));
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailySweep(): Promise<void> {
    await this.run("cron");
  }

  async run(trigger: "cron" | "boot" | "manual", now: Date = new Date()): Promise<SweepResult> {
    const result: SweepResult = { noticesSent: 0, reverted: 0, failures: 0 };

    const [pricing, businesses] = await Promise.all([
      this.pricing.get(),
      this.prisma.business.findMany({
        // A suspended tenant is a conduct matter and is not chased for money.
        where: { deletedAt: null, subscription: { plan: "pro" } },
        select: {
          id: true,
          name: true,
          billingContactEmail: true,
          subscription: true,
          // Fallback recipients when no billing contact is set.
          //
          // Deliberately NOT filtered to role OWNER. A live tenant was found
          // whose only account holder is an ADMIN, so an OWNER-only fallback
          // returned nobody and its renewal notice would have been counted as
          // a failure — a silent non-delivery caused by a role label rather
          // than by missing data. Any addressable user is better than none;
          // `deliver` prefers an OWNER when there is one.
          users: {
            where: { email: { not: null } },
            select: { email: true, role: true },
          },
        },
      }),
    ]);

    for (const business of businesses) {
      const sub = business.subscription;
      if (!sub || !sub.renewsAt) continue;

      const subLike = {
        plan: sub.plan,
        interval: sub.interval,
        renewsAt: sub.renewsAt.toISOString(),
      };

      try {
        // Notices are decided BEFORE any revert: once the plan reads "free",
        // dueNotices correctly returns nothing, and the REVERTED message would
        // never be sent.
        const sent = await this.prisma.subscriptionNotice.findMany({
          where: { businessId: business.id, periodEnd: sub.renewsAt },
          select: { kind: true },
        });
        const due = dueNotices(subLike, new Set(sent.map((n) => n.kind)), now);

        for (const kind of due) {
          const delivered = await this.deliver({
            kind,
            business,
            renewsAt: sub.renewsAt,
            amountCents: sub.priceCents ?? this.standardPrice(sub.interval, pricing),
            currency: pricing.currency,
            freeQuotesPerMonth: pricing.freeQuotesPerMonth,
          });
          if (delivered === "sent") result.noticesSent += 1;
          // "claimed" means another run already owns this notice — a no-op,
          // not a failure. Counting it as one would make a healthy second
          // sweep look broken.
          else if (delivered === "failed") result.failures += 1;
        }

        if (shouldRevertToFree(subLike, now)) {
          // Sets the plan and NOTHING else. Non-payment is not misconduct:
          // Business.deletedAt (suspension) is untouched, the tenant keeps
          // every record, and invoicing and payment collection keep working.
          await this.prisma.subscription.update({
            where: { businessId: business.id },
            data: { plan: "free" },
          });
          result.reverted += 1;
        }
      } catch (err) {
        result.failures += 1;
        this.logger.warn(`Sweep failed for business ${business.id}: ${String(err)}`);
      }
    }

    await this.prisma.subscriptionSweepRun.create({ data: { trigger, ...result } });

    if (result.noticesSent > 0 || result.reverted > 0 || result.failures > 0) {
      this.logger.log(
        `Sweep (${trigger}): ${result.noticesSent} notice(s), ${result.reverted} reverted, ${result.failures} failure(s)`,
      );
    }
    return result;
  }

  /** The most recent runs — so an admin can see the sweep is alive. */
  async recentRuns(limit = 5) {
    return this.prisma.subscriptionSweepRun.findMany({
      orderBy: { ranAt: "desc" },
      take: limit,
    });
  }

  private standardPrice(
    interval: string,
    pricing: { proMonthlyPriceCents: number; proAnnualPriceCents: number },
  ): number {
    return interval === "annual" ? pricing.proAnnualPriceCents : pricing.proMonthlyPriceCents;
  }

  /**
   * Claim the notice, then send it.
   *
   * The ledger row goes in FIRST, and a unique-constraint violation means
   * another run already has it — so this one silently steps aside. Sending
   * first and recording after would double-send whenever the write failed;
   * checking first and then sending leaves a race between the two.
   *
   * The cost of this ordering is that a send failure still consumes the slot,
   * so a bounced reminder is not retried on the next sweep. That is the right
   * trade for money mail: one missed reminder is recoverable, four identical
   * ones landing in a contractor's inbox is not.
   */
  private async deliver(params: {
    kind: NoticeKind;
    business: {
      id: string;
      name: string;
      billingContactEmail: string | null;
      users: { email: string | null; role: string }[];
    };
    renewsAt: Date;
    amountCents: number;
    currency: string;
    freeQuotesPerMonth: number;
  }): Promise<"sent" | "claimed" | "failed"> {
    const { kind, business, renewsAt } = params;

    // The subscriber's own choice first; then an OWNER; then any user with an
    // address, because a reminder that reaches the wrong colleague still beats
    // one that reaches nobody.
    const owner = business.users.find((u) => u.role === "OWNER" && u.email);
    const anyUser = business.users.find((u) => u.email);
    const to =
      business.billingContactEmail?.trim() || owner?.email?.trim() || anyUser?.email?.trim();
    if (!to) {
      this.logger.warn(`No billing contact or owner email for business ${business.id} — ${kind} not sent`);
      return "failed";
    }

    try {
      await this.prisma.subscriptionNotice.create({
        data: { businessId: business.id, kind, periodEnd: renewsAt },
      });
    } catch {
      // Unique violation: another run already claimed it. A no-op.
      return "claimed";
    }

    const ok = await this.mailer.send({
      kind,
      to,
      businessName: business.name,
      renewsAt,
      amountCents: params.amountCents,
      currency: params.currency,
      freeQuotesPerMonth: params.freeQuotesPerMonth,
    });
    return ok ? "sent" : "failed";
  }
}
