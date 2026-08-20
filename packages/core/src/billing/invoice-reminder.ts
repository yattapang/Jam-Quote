import { JAMAICA_UTC_OFFSET_MS } from "../reports/summary.js";
import { formatJmd } from "../tax/money.js";

/**
 * How late an invoice is, in whole days, on a given day in JAMAICA.
 *
 * `dueDate` is UTC midnight standing for a calendar DATE, so the comparison
 * has to be against the same kind of value — the date it is in Jamaica right
 * now, at UTC midnight. This is the third place that trap has appeared (the
 * invoice builder, the overdue sweep, and now here), which is why it is a
 * shared helper rather than three subtractions.
 *
 * 0 means due today, which is NOT late — a client has until the end of the
 * day. Negative means it is not due yet.
 */
export function daysLate(dueDate: Date, now: Date = new Date()): number {
  const shifted = new Date(now.getTime() + JAMAICA_UTC_OFFSET_MS);
  const today = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  const due = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  return Math.round((today - due) / 86_400_000);
}

export interface ReminderContext {
  businessName: string;
  clientName?: string | null;
  invoiceNumber: string;
  /** What is actually still owed — never the invoice total, which would
   * demand money a client has already partly paid. */
  outstandingCents: number;
  dueDate?: Date | null;
  now?: Date;
}

/**
 * The words a payment reminder uses.
 *
 * Lives in core so the WhatsApp message and the email say the SAME thing. A
 * contractor who sends both must not appear to be quoting two different
 * figures, and the two drift immediately if each screen writes its own copy —
 * the duplicate-cadence-map problem again.
 *
 * Tone is firm but not aggressive, and it NEVER accuses: the client may have
 * paid by bank transfer this morning. It also always names the outstanding
 * amount rather than the total, because chasing the full figure on a partly
 * paid invoice is the fastest way to lose a customer.
 */
export function reminderMessage(ctx: ReminderContext): { subject: string; body: string } {
  const money = formatJmd(ctx.outstandingCents);
  const late = ctx.dueDate ? daysLate(ctx.dueDate, ctx.now ?? new Date()) : null;
  const greeting = `Hi ${ctx.clientName?.trim() || "there"},`;

  // Three registers, because a friendly nudge before the due date and a chase
  // on a two-month-old debt cannot be the same sentence.
  let timing: string;
  let subject: string;
  if (late === null) {
    timing = `is still outstanding`;
    subject = `Payment reminder — invoice ${ctx.invoiceNumber}`;
  } else if (late < 0) {
    const days = Math.abs(late);
    timing = `is due in ${days} day${days === 1 ? "" : "s"}`;
    subject = `Invoice ${ctx.invoiceNumber} — due in ${days} day${days === 1 ? "" : "s"}`;
  } else if (late === 0) {
    timing = `is due today`;
    subject = `Invoice ${ctx.invoiceNumber} — due today`;
  } else {
    timing = `is now ${late} day${late === 1 ? "" : "s"} past due`;
    subject = `Invoice ${ctx.invoiceNumber} — ${late} day${late === 1 ? "" : "s"} past due`;
  }

  const body =
    `${greeting} a friendly reminder that invoice ${ctx.invoiceNumber} ` +
    `for ${money} ${timing}.\n\n` +
    // The out clause is not politeness for its own sake. Without it the
    // message reads as an accusation to someone who paid this morning, and
    // the contractor is the one who looks careless.
    `If you have already sent it across, please ignore this — and thank you.\n\n` +
    `${ctx.businessName}`;

  return { subject, body };
}
