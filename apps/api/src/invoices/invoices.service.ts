import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  computeTotals,
  InvoiceStatus,
  QuoteStatus,
  retentionCents,
  type GctTreatment,
  type TotalsLineInput,
} from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";
import { BusinessService } from "../business/business.service.js";
import type {
  CreateInvoiceInput,
  InvoiceLineItemInput,
  InvoiceSectionInput,
  UpdateInvoiceInput,
} from "./invoices.dto.js";

/** Allowed forward status transitions. Payments (payments.service.ts) drive
 * INVOICED -> PARTIAL/PAID/OVERDUE directly; this only gates `finalize`. */
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  [InvoiceStatus.DRAFT]: [InvoiceStatus.INVOICED],
  [InvoiceStatus.INVOICED]: [InvoiceStatus.PARTIAL, InvoiceStatus.PAID, InvoiceStatus.OVERDUE],
  [InvoiceStatus.PARTIAL]: [InvoiceStatus.PAID, InvoiceStatus.OVERDUE],
  [InvoiceStatus.OVERDUE]: [InvoiceStatus.PARTIAL, InvoiceStatus.PAID],
  [InvoiceStatus.PAID]: [],
};

const INVOICE_DETAIL_INCLUDE = {
  lineItems: { where: { sectionId: null }, orderBy: { sort: "asc" as const } },
  sections: {
    orderBy: { sort: "asc" as const },
    include: { lineItems: { orderBy: { sort: "asc" as const } } },
  },
  // Payment history. Without this the client can show a paidCents TOTAL but
  // not what it is made of, so a contractor could see "$40,000 paid" with no
  // way to check which payments that represents — or to spot a duplicate.
  // Newest first: the question is almost always "did the latest one land?".
  payments: {
    where: { deletedAt: null },
    orderBy: { paidAt: "desc" as const },
  },
} satisfies Prisma.InvoiceInclude;

type InvoiceWithLines = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_DETAIL_INCLUDE }>;

const QUOTE_FOR_CONVERT_INCLUDE = {
  lineItems: { where: { sectionId: null }, orderBy: { sort: "asc" as const } },
  sections: {
    orderBy: { sort: "asc" as const },
    include: { lineItems: { orderBy: { sort: "asc" as const } } },
  },
} satisfies Prisma.QuoteInclude;

type QuoteForConvert = Prisma.QuoteGetPayload<{ include: typeof QUOTE_FOR_CONVERT_INCLUDE }>;

function collectLines(input: {
  sections: InvoiceSectionInput[];
  lineItems: InvoiceLineItemInput[];
}): InvoiceLineItemInput[] {
  return [...input.sections.flatMap((s) => s.lineItems), ...input.lineItems];
}

function toTotalsLine(li: InvoiceLineItemInput): TotalsLineInput {
  return {
    quantity: li.quantity,
    unitPriceCents: li.unitPriceCents,
    markupPct: li.markupPct,
    gctTreatment: li.gctTreatment,
  };
}

function lineItemCreateData(
  invoiceId: string,
  li: InvoiceLineItemInput,
  idx: number,
  sectionId?: string,
): Prisma.InvoiceLineItemUncheckedCreateInput {
  return {
    invoiceId,
    sectionId,
    category: li.category,
    description: li.description,
    quantity: li.quantity,
    rateUnit: li.rateUnit,
    unitLabel: li.unitLabel,
    unitPriceCents: li.unitPriceCents,
    priceSource: li.priceSource,
    supplierId: li.supplierId,
    gctTreatment: li.gctTreatment,
    markupPct: li.markupPct,
    overrideNote: li.overrideNote,
    jobId: li.jobId,
    jobName: li.jobName,
    jobUnit: li.jobUnit,
    jobComponents: li.jobComponents as Prisma.InputJsonValue | undefined,
    sort: li.sort ?? idx,
  };
}

/** Every existing (non-soft-deleted) line item on a loaded quote/invoice, as
 * TotalsLineInput, for recomputing totals when the caller hasn't replaced lines. */
function existingLinesForTotals(entity: {
  lineItems: { quantity: unknown; unitPriceCents: number; markupPct: unknown; gctTreatment: string }[];
  sections: { lineItems: { quantity: unknown; unitPriceCents: number; markupPct: unknown; gctTreatment: string }[] }[];
}): TotalsLineInput[] {
  return [...entity.lineItems, ...entity.sections.flatMap((s) => s.lineItems)].map((li) => ({
    quantity: Number(li.quantity),
    unitPriceCents: li.unitPriceCents,
    markupPct: li.markupPct ? Number(li.markupPct) : undefined,
    gctTreatment: li.gctTreatment as GctTreatment,
  }));
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessService: BusinessService,
  ) {}

  /** Write sections + line items for a (just-created, or just-cleared) invoice. */
  private async persistLines(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    sections: InvoiceSectionInput[],
    lineItems: InvoiceLineItemInput[],
  ): Promise<void> {
    for (const section of sections) {
      const created = await tx.invoiceSection.create({
        data: { invoiceId, title: section.title, sort: section.sort ?? 0 },
      });
      for (const [idx, li] of section.lineItems.entries()) {
        await tx.invoiceLineItem.create({
          data: lineItemCreateData(invoiceId, li, idx, created.id),
        });
      }
    }
    for (const [idx, li] of lineItems.entries()) {
      await tx.invoiceLineItem.create({ data: lineItemCreateData(invoiceId, li, idx) });
    }
  }

  /**
   * Create an invoice from scratch, with no source quote.
   *
   * Not every invoice starts life as an estimate — a contractor doing a
   * call-out, a repeat job, or billing for materials already supplied has
   * nothing to convert from. Before this, the only way to raise an invoice was
   * to first invent a quote for work already agreed.
   *
   * quoteId is left null on purpose: it records that this invoice CAME FROM a
   * quote, and `finalize` uses it to flip that quote to INVOICED. A hand-built
   * invoice has no such quote, and faking the link would flip an unrelated
   * one.
   *
   * The GCT rate falls back to the business's own configured default rather
   * than a hardcoded 15 — the rate is jurisdiction-derived (see the rule-pack)
   * and hardcoding it here would silently diverge from every other document.
   */
  async create(businessId: string, input: CreateInvoiceInput): Promise<InvoiceWithLines> {
    const business = await this.businessService.findById(businessId);

    // Reserved outside the transaction: reserveInvoiceNumber runs its own
    // $transaction, and nesting interactive transactions isn't safe (same
    // reasoning as convertFromQuote).
    const number = await this.businessService.reserveInvoiceNumber(businessId);

    const gctRatePct = input.gctRatePct ?? Number(business.defaultGctRate);
    const allLines = [...input.lineItems, ...input.sections.flatMap((sec) => sec.lineItems)];
    const totals = computeTotals({
      lines: allLines.map((li) => ({
        quantity: li.quantity,
        unitPriceCents: li.unitPriceCents,
        markupPct: li.markupPct,
        gctTreatment: li.gctTreatment,
      })),
      gctRatePct,
      discountPct: input.discountPct,
      depositCents: input.depositCents,
    });

    const invoiceId = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          businessId,
          clientId: input.clientId,
          number,
          status: InvoiceStatus.DRAFT,
          detailLevel: input.detailLevel,
          gctRate: gctRatePct,
          discountPct: input.discountPct,
          depositCents: input.depositCents,
          terms: input.terms,
          dueDate: input.dueDate,
          // Omitted means today, via the column default.
          ...(input.issueDate ? { issueDate: input.issueDate } : {}),
          subtotalCents: totals.subtotalCents,
          gctCents: totals.gctCents,
          totalCents: totals.totalCents,
        },
      });
      await this.persistLines(tx, invoice.id, input.sections, input.lineItems);
      return invoice.id;
    });

    return this.findOne(businessId, invoiceId);
  }

  /**
   * Convert an ACCEPTED quote into a DRAFT invoice: reserves an invoice
   * number, deep-copies sections + line items (preserving sort and
   * section->line mapping), and computes totals fresh via @jamquote/core.
   * The source quote's status is untouched here — it only flips to INVOICED
   * when the resulting invoice is finalized (see `finalize` below).
   */
  async convertFromQuote(businessId: string, quoteId: string): Promise<InvoiceWithLines> {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, businessId, deletedAt: null },
      include: QUOTE_FOR_CONVERT_INCLUDE,
    });
    if (!quote) throw new NotFoundException("Quote not found");

    if (quote.status !== QuoteStatus.ACCEPTED) {
      throw new BadRequestException(
        `Quote must be ACCEPTED before converting to an invoice (current status: ${quote.status})`,
      );
    }

    const existingInvoice = await this.prisma.invoice.findFirst({
      where: { quoteId, businessId, deletedAt: null },
    });
    if (existingInvoice) {
      throw new BadRequestException(
        `Quote has already been converted to invoice ${existingInvoice.number}`,
      );
    }

    // Reserve the number before opening the transaction below: it runs its
    // own $transaction, and nesting a second interactive transaction inside
    // this one isn't safe (mirrors quotes.service.ts revise()).
    const number = await this.businessService.reserveInvoiceNumber(businessId);

    const totals = computeTotals({
      lines: existingLinesForTotals(quote as QuoteForConvert),
      gctRatePct: Number(quote.gctRate),
      discountPct: Number(quote.discountPct),
      depositCents: quote.depositCents,
    });

    const invoiceId = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          businessId,
          clientId: quote.clientId,
          // Carry the job across, or job costing only ever sees invoices that
          // predate this line: the migration backfilled history from the
          // source quote, but without this every NEW conversion would arrive
          // unattached and quietly drop out of "did this job make money?".
          projectId: quote.projectId,
          // Retention defaults FROM the job but is then owned by this invoice,
          // so changing the job's terms later cannot restate a document the
          // client is already holding.
          ...(await this.retentionForProject(tx, quote.projectId, totals.totalCents)),
          quoteId: quote.id,
          number,
          status: InvoiceStatus.DRAFT,
          detailLevel: quote.detailLevel,
          gctRate: quote.gctRate,
          discountPct: quote.discountPct,
          depositCents: quote.depositCents,
          terms: quote.terms,
          subtotalCents: totals.subtotalCents,
          gctCents: totals.gctCents,
          totalCents: totals.totalCents,
        },
      });

      const sectionIdMap = new Map<string, string>();
      for (const section of quote.sections) {
        const newSection = await tx.invoiceSection.create({
          data: { invoiceId: invoice.id, title: section.title, sort: section.sort },
        });
        sectionIdMap.set(section.id, newSection.id);
      }

      const allOriginalLines = [
        ...quote.lineItems,
        ...quote.sections.flatMap((s) => s.lineItems),
      ];
      for (const li of allOriginalLines) {
        await tx.invoiceLineItem.create({
          data: {
            invoiceId: invoice.id,
            sectionId: li.sectionId ? sectionIdMap.get(li.sectionId) : undefined,
            category: li.category,
            description: li.description,
            quantity: li.quantity,
            rateUnit: li.rateUnit,
            unitLabel: li.unitLabel ?? undefined,
            unitPriceCents: li.unitPriceCents,
            priceSource: li.priceSource,
            supplierId: li.supplierId ?? undefined,
            gctTreatment: li.gctTreatment,
            markupPct: li.markupPct ?? undefined,
            overrideNote: li.overrideNote ?? undefined,
            jobId: li.jobId ?? undefined,
            jobName: li.jobName ?? undefined,
            jobUnit: li.jobUnit ?? undefined,
            jobComponents: (li.jobComponents ?? undefined) as
              | Prisma.InputJsonValue
              | undefined,
            sort: li.sort,
          },
        });
      }

      return invoice.id;
    });

    return this.findOne(businessId, invoiceId);
  }

  findAll(businessId: string, filters: { status?: InvoiceStatus; clientId?: string } = {}) {
    return this.prisma.invoice.findMany({
      where: {
        businessId,
        deletedAt: null,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.clientId ? { clientId: filters.clientId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(businessId: string, id: string): Promise<InvoiceWithLines> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, businessId, deletedAt: null },
      include: INVOICE_DETAIL_INCLUDE,
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    return invoice;
  }

  /** Edit an invoice — only while it's still DRAFT (see `finalize` for locking it in). */
  async update(
    businessId: string,
    id: string,
    input: UpdateInvoiceInput,
  ): Promise<InvoiceWithLines> {
    const existing = await this.findOne(businessId, id);
    if (existing.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException("Invoice can only be edited while draft");
    }

    const replacingLines = input.sections !== undefined || input.lineItems !== undefined;
    const gctRatePct = input.gctRatePct ?? Number(existing.gctRate);
    const discountPct = input.discountPct ?? Number(existing.discountPct);
    const depositCents = input.depositCents ?? existing.depositCents;
    const detailLevel = input.detailLevel ?? existing.detailLevel;

    const linesForTotals: TotalsLineInput[] = replacingLines
      ? collectLines({
          sections: input.sections ?? [],
          lineItems: input.lineItems ?? [],
        }).map(toTotalsLine)
      : existingLinesForTotals(existing);

    const totals = computeTotals({
      lines: linesForTotals,
      gctRatePct,
      discountPct,
      depositCents,
    });

    const invoiceId = await this.prisma.$transaction(async (tx) => {
      if (replacingLines) {
        await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
        await tx.invoiceSection.deleteMany({ where: { invoiceId: id } });
        await this.persistLines(tx, id, input.sections ?? [], input.lineItems ?? []);
      }

      await tx.invoice.update({
        where: { id },
        data: {
          // `?? existing` would be wrong here: Invoice.clientId is nullable, so
          // null is a value the caller can legitimately mean ("no client on
          // this invoice yet") and `??` would silently discard it, leaving the
          // old client attached to an invoice the user just detached. Only an
          // ABSENT key means "leave as is".
          clientId: input.clientId === undefined ? existing.clientId : input.clientId,
          dueDate: input.dueDate ?? existing.dueDate,
          issueDate: input.issueDate ?? existing.issueDate,
          terms: input.terms ?? existing.terms,
          detailLevel,
          gctRate: gctRatePct,
          discountPct,
          depositCents,
          subtotalCents: totals.subtotalCents,
          gctCents: totals.gctCents,
          totalCents: totals.totalCents,
        },
      });
      return id;
    });

    return this.findOne(businessId, invoiceId);
  }

  /**
   * Lock the invoice in: DRAFT -> INVOICED, recomputing totals one final
   * time, and flip the source quote (if any) to INVOICED in the same
   * transaction. This is the only place a quote moves to INVOICED.
   */
  async finalize(businessId: string, id: string): Promise<InvoiceWithLines> {
    const invoice = await this.findOne(businessId, id);
    const allowed = ALLOWED_TRANSITIONS[invoice.status as InvoiceStatus] ?? [];
    if (!allowed.includes(InvoiceStatus.INVOICED)) {
      throw new BadRequestException(
        `Cannot finalize invoice from status ${invoice.status} (must be DRAFT)`,
      );
    }

    const totals = computeTotals({
      lines: existingLinesForTotals(invoice),
      gctRatePct: Number(invoice.gctRate),
      discountPct: Number(invoice.discountPct),
      depositCents: invoice.depositCents,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.INVOICED,
          subtotalCents: totals.subtotalCents,
          gctCents: totals.gctCents,
          totalCents: totals.totalCents,
        },
      });
      if (invoice.quoteId) {
        await tx.quote.update({
          where: { id: invoice.quoteId },
          data: { status: QuoteStatus.INVOICED },
        });
      }
    });

    return this.findOne(businessId, id);
  }

  /** Only DRAFT invoices may be deleted outright (soft-delete, for delta-sync). */
  async remove(businessId: string, id: string): Promise<void> {
    const invoice = await this.findOne(businessId, id);
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException("Only DRAFT invoices can be deleted");
    }
    await this.prisma.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /**
   * The retention fields a new invoice inherits from its job.
   *
   * Returns both the percentage AND the resulting amount: the amount is a
   * snapshot so it cannot drift from the printed document if the percentage is
   * ever edited afterwards.
   */
  private async retentionForProject(
    tx: Prisma.TransactionClient,
    projectId: string | null,
    totalCents: number,
  ): Promise<{ retentionPct?: Prisma.Decimal; retentionCents?: number }> {
    if (!projectId) return {};
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { retentionPct: true },
    });
    const pct = project?.retentionPct;
    if (!pct) return {};
    return {
      retentionPct: pct,
      retentionCents: retentionCents(totalCents, Number(pct)),
    };
  }
}
