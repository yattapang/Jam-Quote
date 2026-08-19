import { Injectable, Logger } from "@nestjs/common";
import { Resend } from "resend";
import { NoticeKind } from "@jamquote/core";

/**
 * The subscription emails: renewal reminders, and the notice that a term
 * lapsed and the plan dropped to free.
 *
 * All the copy lives here so the sweep decides WHEN to write and this decides
 * WHAT it says. Splitting them keeps the cadence unit-testable without a
 * mailbox — see `dueNotices` in core.
 *
 * Send failures are logged and reported, never thrown. A tenant whose mail
 * bounces must not abort the sweep for everyone behind them in the list.
 */
@Injectable()
export class SubscriptionMailerService {
  private readonly logger = new Logger(SubscriptionMailerService.name);

  /** True when the send succeeded (or was deliberately skipped in dev). */
  async send(params: {
    kind: NoticeKind;
    to: string;
    businessName: string;
    /** Cutoff for a reminder; the date it lapsed for REVERTED. */
    renewsAt: Date;
    amountCents: number;
    currency: string;
    freeQuotesPerMonth: number;
  }): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // Matches sendResetEmail: an error in production, where this is a silent
      // failure of the whole renewal flow, and a warning locally where having
      // no key is the normal state.
      const message = `RESEND_API_KEY is not set — skipping ${params.kind} email to ${params.to}.`;
      if (process.env.NODE_ENV === "production") this.logger.error(message);
      else this.logger.warn(message);
      return false;
    }

    const { subject, html } = this.compose(params);
    const from =
      process.env.SUBSCRIPTION_FROM_EMAIL ??
      process.env.EMAIL_FROM ??
      "JamQuote <onboarding@resend.dev>";

    try {
      const { error } = await new Resend(apiKey).emails.send({
        from,
        to: params.to,
        subject,
        html,
      });
      if (error) {
        this.logger.warn(`Failed to send ${params.kind} to ${params.to}: ${error.message}`);
        return false;
      }
      return true;
    } catch (err) {
      // A thrown transport error must not take the sweep down with it.
      this.logger.warn(`Failed to send ${params.kind} to ${params.to}: ${String(err)}`);
      return false;
    }
  }

  private compose(params: {
    kind: NoticeKind;
    businessName: string;
    renewsAt: Date;
    amountCents: number;
    currency: string;
    freeQuotesPerMonth: number;
  }): { subject: string; html: string } {
    const { kind, businessName, renewsAt, amountCents, currency, freeQuotesPerMonth } = params;
    const when = renewsAt.toLocaleDateString("en-JM", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const amount = `${currency} $${(amountCents / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

    // Deliberately plain. These go to a contractor or their bookkeeper, not to
    // a marketing list, and the one thing each must communicate is a date and
    // an amount.
    if (kind === NoticeKind.REVERTED) {
      return {
        subject: `${businessName} is now on the JamQuote Free plan`,
        html: `
          <p>Hi,</p>
          <p>The JamQuote subscription for <strong>${businessName}</strong> ended on ${when}, so the
             account has moved to the Free plan.</p>
          <p><strong>Nothing has been lost.</strong> Every quote, invoice, client and price list is
             exactly where it was, you can still send invoices, and you can still receive payments.
             The Free plan allows ${freeQuotesPerMonth} new quotes a month.</p>
          <p>To go back to Pro, send your payment of ${amount} and we will restore the account the
             same day.</p>
        `,
      };
    }

    const urgency =
      kind === NoticeKind.RENEWAL_0
        ? `Your JamQuote subscription for <strong>${businessName}</strong> is due today (${when}).`
        : `Your JamQuote subscription for <strong>${businessName}</strong> renews on ${when}.`;

    return {
      subject:
        kind === NoticeKind.RENEWAL_0
          ? `${businessName}: JamQuote subscription due today`
          : `${businessName}: JamQuote subscription renews ${when}`,
      html: `
        <p>Hi,</p>
        <p>${urgency}</p>
        <p>Amount due: <strong>${amount}</strong></p>
        <p>If payment is not received by ${when}, the account moves to the Free plan
           (${freeQuotesPerMonth} new quotes a month). Your data stays, and invoicing and payments
           keep working — you would simply be limited on new quotes until payment is made.</p>
      `,
    };
  }
}
