import { Injectable } from "@nestjs/common";
import { InvoiceStatus, csvDate, csvMoney, csvText, toCsv } from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";

/** A generated file, ready to stream. */
export interface ExportFile {
  filename: string;
  csv: string;
}

/** The period an export covers. Both ends inclusive, calendar dates. */
export interface ExportRange {
  from: Date;
  to: Date;
}

/**
 * The files a contractor hands their accountant instead of a login.
 *
 * Three rules govern all of them, and each exists because getting it wrong is
 * quiet rather than loud:
 *
 * **Cash and accrual are different files, never one.** What was billed and
 * what arrived are different numbers. An accountant given a single column
 * called "revenue" will read it as whichever basis they normally use and be
 * wrong half the time — so the basis is named in the filename AND stated in
 * the header block inside the file.
 *
 * **DRAFTS ARE EXCLUDED.** A draft is not a claim on anyone. Including one
 * would put money in an accountant's return that the client was never asked
 * for.
 *
 * **A detail file must reconcile with its summary.** `invoice-lines` sums to
 * the `Subtotal` column of `invoices-issued` for the same period, exactly.
 * That is a testable invariant and it is tested, because the money seam is
 * where this project has already been bitten twice.
 *
 * Generated server-side rather than in the browser: three years of history
 * must not be limited by a phone's memory, and the same generator can later
 * back a scheduled email to the accountant.
 */
@Injectable()
export class ExportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Invoices ISSUED in the period — the accrual view, and the receivables
   * listing.
   *
   * Dated by `issueDate`, the date the invoice bears, not `createdAt`. June's
   * work written up in July is June revenue, and that is the entire reason
   * `issueDate` exists as a separate field.
   */
  async invoicesIssued(businessId: string, range: ExportRange): Promise<ExportFile> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        businessId,
        deletedAt: null,
        status: { not: InvoiceStatus.DRAFT },
        issueDate: { gte: range.from, lte: endOfDay(range.to) },
      },
      orderBy: { issueDate: "asc" },
      include: { client: { select: { firstName: true, lastName: true } } },
    });

    const rows = invoices.map((i) => [
      i.number,
      csvDate(i.issueDate),
      csvDate(i.dueDate),
      i.status,
      clientName(i.client),
      csvMoney(i.subtotalCents),
      csvMoney(i.gctCents),
      csvMoney(i.totalCents),
      csvMoney(i.paidCents),
      // What is still owed. Retention is NOT subtracted here: on an accrual
      // file it has been billed and is receivable, just not yet payable.
      csvMoney(i.totalCents - i.paidCents),
      csvMoney(i.retentionCents),
      "JMD",
    ]);

    return this.file("invoices-issued", "Accrual (invoices issued)", range, [
      "Invoice number",
      "Issue date",
      "Due date",
      "Status",
      "Client",
      "Subtotal",
      "GCT",
      "Total",
      "Paid",
      "Outstanding",
      "Retention held",
      "Currency",
    ], rows);
  }

  /**
   * Every priced line on those invoices — the file an accountant needs to
   * split GCT output tax by treatment.
   *
   * `gctTreatment` is the column that earns this file: a single "GCT" total
   * cannot be checked, while STANDARD / ZERO_RATED / EXEMPT lines can.
   */
  async invoiceLines(businessId: string, range: ExportRange): Promise<ExportFile> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        businessId,
        deletedAt: null,
        status: { not: InvoiceStatus.DRAFT },
        issueDate: { gte: range.from, lte: endOfDay(range.to) },
      },
      orderBy: { issueDate: "asc" },
      include: {
        client: { select: { firstName: true, lastName: true } },
        lineItems: { where: { sectionId: null }, orderBy: { sort: "asc" } },
        sections: { orderBy: { sort: "asc" }, include: { lineItems: { orderBy: { sort: "asc" } } } },
      },
    });

    const rows: (string | number)[][] = [];
    for (const invoice of invoices) {
      // Top-level lines first, then each section's, so the file reads in the
      // same order as the document the client received.
      const all = [
        ...invoice.lineItems.map((l) => ({ line: l, heading: "" })),
        ...invoice.sections.flatMap((s) => s.lineItems.map((l) => ({ line: l, heading: s.title }))),
      ];
      for (const { line, heading } of all) {
        const quantity = Number(line.quantity);
        rows.push([
          invoice.number,
          csvDate(invoice.issueDate),
          clientName(invoice.client),
          heading,
          line.category,
          line.description,
          quantity,
          line.unitLabel ?? line.rateUnit,
          csvMoney(line.unitPriceCents),
          // The extended amount, rounded the same way computeTotals rounds it.
          // Any other rounding here and the file stops reconciling with the
          // summary — which is the one thing it must not do.
          csvMoney(Math.round(quantity * line.unitPriceCents)),
          line.gctTreatment,
          "JMD",
        ]);
      }
    }

    return this.file("invoice-lines", "Accrual (invoice lines)", range, [
      "Invoice number",
      "Issue date",
      "Client",
      "Section",
      "Category",
      "Description",
      "Quantity",
      "Unit",
      "Unit price",
      "Line total",
      "GCT treatment",
      "Currency",
    ], rows);
  }

  /**
   * Money that actually ARRIVED in the period — the cash view, and what a bank
   * reconciliation is done against.
   *
   * Voided payments are excluded (they are soft-deleted), because a payment
   * that was reversed never was one.
   */
  async paymentsReceived(businessId: string, range: ExportRange): Promise<ExportFile> {
    const payments = await this.prisma.payment.findMany({
      where: {
        deletedAt: null,
        paidAt: { gte: range.from, lte: endOfDay(range.to) },
        invoice: { businessId, deletedAt: null },
      },
      orderBy: { paidAt: "asc" },
      include: {
        invoice: {
          select: {
            number: true,
            client: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    const rows = payments.map((p) => [
      csvDate(p.paidAt),
      p.invoice.number,
      clientName(p.invoice.client),
      csvMoney(p.amountCents),
      p.method,
      p.providerCode ?? "",
      // Text, not a number: a bank reference with leading zeros must survive.
      csvText(p.providerRef),
      p.status,
      "JMD",
    ]);

    return this.file("payments-received", "Cash (payments received)", range, [
      "Date received",
      "Invoice number",
      "Client",
      "Amount",
      "Method",
      "Provider",
      "Reference",
      "Status",
      "Currency",
    ], rows);
  }

  /**
   * The customer listing an accountant asks for first.
   *
   * NOT filtered by the period: a customer list is a standing record, and one
   * limited to whoever happened to be invoiced in March is not the list anyone
   * asked for.
   */
  async clients(businessId: string, range: ExportRange): Promise<ExportFile> {
    const clients = await this.prisma.client.findMany({
      where: { businessId, deletedAt: null },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const rows = clients.map((c) => [
      clientName(c),
      csvText(c.phone),
      c.email ?? "",
      [c.addressLine, c.town, c.parish].filter(Boolean).join(", "),
      c.parish ?? "",
      csvDate(c.createdAt),
    ]);

    return this.file("clients", "Customer listing (all, not period-limited)", range, [
      "Client",
      "Phone",
      "Email",
      "Address",
      "Parish",
      "First added",
    ], rows);
  }

  /**
   * Wraps rows in the header block every file carries.
   *
   * The basis and the generation timestamp are IN the file, not just in its
   * name, because a file gets renamed, forwarded and printed. Invoices stay
   * editable, so an export is a snapshot — the timestamp is what lets two
   * exports of the same period that differ be explained rather than argued
   * about.
   */
  private file(
    slug: string,
    basis: string,
    range: ExportRange,
    headers: readonly string[],
    rows: readonly (readonly (string | number | null | undefined)[])[],
  ): ExportFile {
    const meta: (readonly (string | number)[])[] = [
      ["Basis", basis],
      ["Period", `${csvDate(range.from)} to ${csvDate(range.to)}`],
      ["Generated", new Date().toISOString()],
      ["Note", "Draft documents are excluded. Amounts are JMD."],
      [],
    ];
    // The meta block is written as leading rows of the same file rather than a
    // second file: an accountant opens one thing, and a basis they have to go
    // and look up somewhere else is a basis they will assume instead.
    const csv = toCsv(headers, rows);
    const withMeta = toCsv(["JamQuote export", ""], meta).replace(/\r\n$/, "\r\n") + csv.slice(1);
    return { filename: `${slug}-${csvDate(range.from)}-to-${csvDate(range.to)}.csv`, csv: withMeta };
  }
}

/** "Marcia Brown" from the two stored halves, without a stray trailing space
 * when there is no surname. */
function clientName(client: { firstName: string; lastName: string } | null): string {
  if (!client) return "";
  return [client.firstName, client.lastName].filter((p) => p.trim()).join(" ");
}

/**
 * The last instant of a calendar day.
 *
 * A range typed as "to 31 August" means through the END of the 31st. Comparing
 * against midnight would silently drop everything issued that day — a whole
 * day of revenue missing from an accountant's file, with nothing to show that
 * it happened.
 */
function endOfDay(date: Date): Date {
  return new Date(date.getTime() + 86_399_999);
}
