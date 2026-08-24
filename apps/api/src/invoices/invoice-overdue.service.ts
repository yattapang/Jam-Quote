import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Resend } from "resend";
import { InvoiceStatus, JAMAICA_UTC_OFFSET_MS } from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";
import { addressableEmail } from "../common/notify-recipient.js";

export interface OverdueSweepResult {
  markedOverdue: number;
  digestsSent: number;
}

/**
 * Marks invoices overdue, and tells the contractor.
 *
 * `InvoiceStatus.OVERDUE` existed in the transition table from the start and
 * NOTHING ever set it — the same defect as Subscription.status and
 * QuoteStatus.VIEWED. An invoice a month past its due date read exactly like
 * one sent yesterday.
 *
 * **The digest goes to the CONTRACTOR, not to their client.** Chasing a client
 * by email needs a verified sending domain, which does not exist yet (§4i), and
 * mail from an unverified sender would be accepted and never delivered. So the
 * useful half that works today is telling the contractor what is outstanding so
 * they can chase it on WhatsApp, which is how it would happen here anyway.
 * Client-facing reminders become a small addition once the domain lands.
 */
@Injectable()
export class InvoiceOverdueService {
  private readonly logger = new Logger(InvoiceOverdueService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailySweep(): Promise<void> {
    await this.run();
  }

  async run(now: Date = new Date()): Promise<OverdueSweepResult> {
    const markedOverdue = await this.markOverdue(now);
    const digestsSent = await this.sendDigests(now);
    if (markedOverdue > 0 || digestsSent > 0) {
      this.logger.log(`Overdue sweep: ${markedOverdue} marked, ${digestsSent} digest(s) sent`);
    }
    return { markedOverdue, digestsSent };
  }

  /**
   * INVOICED and PARTIAL past their due date become OVERDUE.
   *
   * PAID is untouched for the obvious reason. DRAFT is untouched because it
   * was never sent to anyone, so it cannot be late. And an invoice with NO due
   * date is never overdue — there is no date for it to be past, and inventing
   * one (30 days after issue, say) would put a business's own payment terms
   * into a figure they never agreed to.
   *
   * Compared against the start of today IN JAMAICA, not `now` and not UTC
   * midnight. Two separate corrections:
   *
   * - An invoice due today is not late; the client has until the end of the
   *   day. Comparing to the current instant marked it overdue the moment the
   *   sweep ran on its due date.
   * - UTC midnight is 7pm the previous day in Jamaica, so a UTC day boundary
   *   flips an invoice to overdue while it is still its due date for the
   *   contractor looking at the screen. Caught on live data doing exactly
   *   that — the same offset trap as the invoice date and the reports.
   */
  private async markOverdue(now: Date): Promise<number> {
    const startOfToday = jamaicaTodayAsUtcMidnight(now);
    const { count } = await this.prisma.invoice.updateMany({
      where: {
        deletedAt: null,
        status: { in: [InvoiceStatus.INVOICED, InvoiceStatus.PARTIAL] },
        dueDate: { lt: startOfToday, not: null },
      },
      data: { status: InvoiceStatus.OVERDUE },
    });
    return count;
  }

  /** One digest per business per day, at most — a Jamaica day, so "today"
   * means the same thing here as it does on every other screen. */
  private async sendDigests(now: Date): Promise<number> {
    const today = jamaicaTodayAsUtcMidnight(now);

    const businesses = await this.prisma.business.findMany({
      where: {
        deletedAt: null,
        // Already told today. The API sleeps, so the sweep can run several
        // times in one morning and must not send three identical emails.
        OR: [{ lastOverdueDigestOn: null }, { lastOverdueDigestOn: { lt: today } }],
        invoices: { some: { deletedAt: null, status: InvoiceStatus.OVERDUE } },
      },
      select: {
        id: true,
        name: true,
        billingContactEmail: true,
        users: { where: { email: { not: null } }, select: { email: true, role: true } },
        invoices: {
          where: { deletedAt: null, status: InvoiceStatus.OVERDUE },
          select: { number: true, totalCents: true, paidCents: true, dueDate: true },
          orderBy: { dueDate: "asc" },
        },
      },
    });

    let sent = 0;
    for (const business of businesses) {
      // Same fallback chain as the subscription sweep: the subscriber's own
      // choice, then an OWNER, then any addressable user — a tenant whose only
      // account holder is an ADMIN must still be reachable.
      const to = addressableEmail(business);
      if (!to) continue;

      const outstandingCents = business.invoices.reduce(
        (n, i) => n + (i.totalCents - i.paidCents),
        0,
      );

      const delivered = await this.sendDigest(to, business.name, business.invoices, outstandingCents);
      // The date is stamped whether or not the send succeeded. A bounced
      // digest retried every hour for a week would be worse than one missed
      // day, and the figures are on the dashboard regardless.
      await this.prisma.business.update({
        where: { id: business.id },
        data: { lastOverdueDigestOn: today },
      });
      if (delivered) sent += 1;
    }
    return sent;
  }

  private async sendDigest(
    to: string,
    businessName: string,
    invoices: { number: string; totalCents: number; paidCents: number; dueDate: Date | null }[],
    outstandingCents: number,
  ): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.warn(`RESEND_API_KEY not set — skipping overdue digest for ${businessName}`);
      return false;
    }

    const money = (c: number) =>
      `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const rows = invoices
      .map(
        (i) =>
          `<li>${i.number} — ${money(i.totalCents - i.paidCents)} outstanding${
            i.dueDate ? `, due ${i.dueDate.toISOString().slice(0, 10)}` : ""
          }</li>`,
      )
      .join("");

    try {
      const { error } = await new Resend(apiKey).emails.send({
        from:
          process.env.SUBSCRIPTION_FROM_EMAIL ??
          process.env.EMAIL_FROM ??
          "JamQuote <onboarding@resend.dev>",
        to,
        subject: `${invoices.length} overdue invoice${invoices.length === 1 ? "" : "s"} — ${money(outstandingCents)} outstanding`,
        html: `
          <p>Hi,</p>
          <p>${businessName} has <strong>${invoices.length}</strong> invoice${
            invoices.length === 1 ? "" : "s"
          } past the due date, totalling <strong>${money(outstandingCents)}</strong>:</p>
          <ul>${rows}</ul>
          <p>Open JamQuote to see them, or send the client a reminder on WhatsApp.</p>
        `,
      });
      if (error) {
        this.logger.warn(`Overdue digest to ${to} failed: ${error.message}`);
        return false;
      }
      return true;
    } catch (err) {
      // A thrown transport error must not take the sweep down for everyone
      // behind this business in the list.
      this.logger.warn(`Overdue digest to ${to} failed: ${String(err)}`);
      return false;
    }
  }
}

/**
 * Today's JAMAICA calendar date, expressed as UTC midnight.
 *
 * Two representations meet here and mixing them is the bug this exists to
 * avoid. `dueDate` is stored as UTC midnight standing for a calendar DATE (the
 * invoice builder writes `new Date(d + "T00:00:00.000Z")`), so the cutoff must
 * be the same kind of value — the date it is in Jamaica right now, at UTC
 * midnight. Comparing against a Jamaica-midnight INSTANT (05:00Z) instead
 * would make an invoice due today overdue today, five hours early.
 *
 * Using the plain UTC date is wrong the other way: at 7pm in Jamaica it is
 * already tomorrow in UTC, so an invoice due today would flip to overdue while
 * the contractor still has hours of their due date left.
 */
function jamaicaTodayAsUtcMidnight(now: Date): Date {
  const shifted = new Date(now.getTime() + JAMAICA_UTC_OFFSET_MS);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
  );
}
