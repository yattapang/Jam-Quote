import { BadRequestException, Injectable } from "@nestjs/common";
import {
  computeReportsSummary,
  JAMAICA_UTC_OFFSET_MS,
  type ReportInvoice,
  type ReportProject,
  type ReportPayment,
  type ReportQuote,
  type ReportsRange,
  type ReportsSummary,
} from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Payment.status values that represent cash the contractor actually has.
 * "completed" is what recordPayment writes for a manual entry and what the
 * verified WiPay webhook upgrades a card payment to; "recorded" is the
 * schema's column default, kept here so any row written without an explicit
 * status still counts. "pending" and "failed" are deliberately absent.
 */
const COLLECTED_PAYMENT_STATUSES = ["completed", "recorded"];

/** Jamaica-local midnight (00:00) on the given Jamaica calendar date,
 * expressed as the real UTC instant it corresponds to. */
function jamaicaLocalMidnightUtc(year: number, monthIndex0: number, day: number): Date {
  // Mirrors core's jamaicaMonthKey in reverse: that function goes
  // UTC-instant -> (+OFFSET) -> Jamaica-local fields. Going the other way,
  // Jamaica-local fields -> (-OFFSET) -> UTC instant.
  return new Date(Date.UTC(year, monthIndex0, day, 0, 0, 0, 0) - JAMAICA_UTC_OFFSET_MS);
}

/** The current Jamaica-local calendar month as a [fromIso, toIso) range —
 * the Reports page's default when the caller doesn't specify from/to. */
export function currentJamaicaMonthRange(now: Date = new Date()): ReportsRange {
  const shifted = new Date(now.getTime() + JAMAICA_UTC_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth(); // 0-11, Jamaica-local

  const from = jamaicaLocalMidnightUtc(year, month, 1);
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const to = jamaicaLocalMidnightUtc(nextYear, nextMonth, 1);

  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the requested (or defaulted) range and validate it. Split out
   * from getSummary so the controller can also use it if it ever needs the
   * resolved range independently of fetching data.
   */
  resolveRange(from?: Date, to?: Date, now: Date = new Date()): ReportsRange {
    if (from && Number.isNaN(from.getTime())) {
      throw new BadRequestException("`from` is not a valid date");
    }
    if (to && Number.isNaN(to.getTime())) {
      throw new BadRequestException("`to` is not a valid date");
    }

    const defaults = currentJamaicaMonthRange(now);
    const range: ReportsRange = {
      fromIso: from ? from.toISOString() : defaults.fromIso,
      toIso: to ? to.toISOString() : defaults.toIso,
    };

    if (new Date(range.toIso).getTime() <= new Date(range.fromIso).getTime()) {
      throw new BadRequestException("`to` must be after `from`");
    }

    return range;
  }

  async getSummary(businessId: string, from?: Date, to?: Date, now: Date = new Date()): Promise<ReportsSummary> {
    const range = this.resolveRange(from, to, now);

    const [quoteRows, invoiceRows, projectRows, paymentRows] = await Promise.all([
      this.prisma.quote.findMany({
        where: { businessId, deletedAt: null },
        select: { status: true, totalCents: true, createdAt: true },
      }),
      // Deliberately NOT date-filtered here beyond businessId/deletedAt.
      // computeReportsSummary uses this same invoice list both for
      // in-range revenue AND for receivables, which are intentionally
      // all-time (a debt raised outside the window is still owed). Adding
      // a createdAt filter here to "optimize" the query would silently
      // break receivables for every range shorter than all-time.
      this.prisma.invoice.findMany({
        where: { businessId, deletedAt: null },
        select: {
          status: true,
          totalCents: true,
          paidCents: true,
          issueDate: true,
          dueDate: true,
          clientId: true,
          client: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.project.findMany({
        where: { businessId, deletedAt: null },
        select: {
          stage: true,
          createdAt: true,
          clientId: true,
          client: { select: { firstName: true, lastName: true } },
        },
      }),
      // Payment has NO businessId column of its own, so it can only be
      // scoped to this tenant through its invoice relation — dropping that
      // join would let every tenant's payments leak into this tenant's
      // "collected" figures. `deletedAt: null` matters just as much:
      // voidPayment (payments.service.ts) soft-deletes a payment when a
      // contractor corrects a mis-entered amount, and a voided payment is
      // not real cash collected — counting it here would overstate revenue
      // by money that was never actually received (or was reversed).
      // Not date-filtered beyond that: computeReportsSummary filters by
      // paidAt itself, same reasoning as the invoice query above.
      // Only statuses that mean money actually in hand. startCardPayment
      // writes a "pending" row for the FULL invoice balance the moment a
      // checkout is opened, and increments paidCents only later, from the
      // verified webhook. Counting "pending" would therefore report the whole
      // balance as collected for a card checkout the customer merely opened
      // and abandoned — and would disagree with receivables, which derive
      // from paidCents and would still show the invoice as unpaid.
      //
      // An allow-list rather than notIn: ["pending", "failed"], because this
      // is a cash figure. A status added later (a chargeback or dispute
      // state, say) should have to be opted IN to being counted as revenue
      // rather than silently inflating it the day it is introduced.
      this.prisma.payment.findMany({
        where: {
          invoice: { businessId },
          deletedAt: null,
          status: { in: COLLECTED_PAYMENT_STATUSES },
        },
        select: { amountCents: true, paidAt: true },
      }),
    ]);

    const quotes: ReportQuote[] = quoteRows.map((q) => ({
      status: q.status,
      totalCents: q.totalCents,
      createdAt: q.createdAt.toISOString(),
    }));

    const invoices: ReportInvoice[] = invoiceRows.map((inv) => ({
      status: inv.status,
      totalCents: inv.totalCents,
      paidCents: inv.paidCents,
      issueDate: inv.issueDate.toISOString(),
      dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
      clientId: inv.clientId,
      clientName: inv.client ? `${inv.client.firstName} ${inv.client.lastName}`.trim() : null,
    }));

    const projects: ReportProject[] = projectRows.map((j) => ({
      stage: j.stage,
      createdAt: j.createdAt.toISOString(),
      clientId: j.clientId,
      clientName: j.client ? `${j.client.firstName} ${j.client.lastName}`.trim() : null,
    }));

    const payments: ReportPayment[] = paymentRows.map((p) => ({
      amountCents: p.amountCents,
      paidAt: p.paidAt.toISOString(),
    }));

    return computeReportsSummary({ quotes, invoices, payments, projects }, range, now);
  }
}
