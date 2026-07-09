import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  computeTotals,
  QuoteStatus,
  type GctTreatment,
  type TotalsLineInput,
} from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";
import { BusinessService } from "../business/business.service.js";
import type {
  CreateQuoteInput,
  QuoteLineItemInput,
  QuoteSectionInput,
  UpdateQuoteInput,
} from "./quotes.dto.js";

/** Allowed forward status transitions. See docs/ARCHITECTURE.md. */
const ALLOWED_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  [QuoteStatus.DRAFT]: [QuoteStatus.SENT],
  [QuoteStatus.SENT]: [QuoteStatus.VIEWED, QuoteStatus.DECLINED, QuoteStatus.EXPIRED],
  [QuoteStatus.VIEWED]: [QuoteStatus.ACCEPTED, QuoteStatus.DECLINED, QuoteStatus.EXPIRED],
  [QuoteStatus.ACCEPTED]: [QuoteStatus.INVOICED],
  [QuoteStatus.DECLINED]: [],
  [QuoteStatus.EXPIRED]: [],
  [QuoteStatus.INVOICED]: [],
};

const QUOTE_DETAIL_INCLUDE = {
  lineItems: { where: { sectionId: null }, orderBy: { sort: "asc" as const } },
  sections: {
    orderBy: { sort: "asc" as const },
    include: { lineItems: { orderBy: { sort: "asc" as const } } },
  },
} satisfies Prisma.QuoteInclude;

type QuoteWithLines = Prisma.QuoteGetPayload<{ include: typeof QUOTE_DETAIL_INCLUDE }>;

function collectLines(input: {
  sections: QuoteSectionInput[];
  lineItems: QuoteLineItemInput[];
}): QuoteLineItemInput[] {
  return [...input.sections.flatMap((s) => s.lineItems), ...input.lineItems];
}

function toTotalsLine(li: QuoteLineItemInput): TotalsLineInput {
  return {
    quantity: li.quantity,
    unitPriceCents: li.unitPriceCents,
    markupPct: li.markupPct,
    gctTreatment: li.gctTreatment,
  };
}

function lineItemCreateData(
  quoteId: string,
  li: QuoteLineItemInput,
  idx: number,
  sectionId?: string,
): Prisma.QuoteLineItemUncheckedCreateInput {
  return {
    quoteId,
    sectionId,
    category: li.category,
    description: li.description,
    quantity: li.quantity,
    rateUnit: li.rateUnit,
    unitPriceCents: li.unitPriceCents,
    priceSource: li.priceSource,
    supplierId: li.supplierId,
    gctTreatment: li.gctTreatment,
    markupPct: li.markupPct,
    overrideNote: li.overrideNote,
    sort: li.sort ?? idx,
  };
}

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessService: BusinessService,
  ) {}

  /** Write sections + line items for a (just-created, or just-cleared) quote. */
  private async persistLines(
    tx: Prisma.TransactionClient,
    quoteId: string,
    sections: QuoteSectionInput[],
    lineItems: QuoteLineItemInput[],
  ): Promise<void> {
    for (const section of sections) {
      const created = await tx.quoteSection.create({
        data: { quoteId, title: section.title, sort: section.sort ?? 0 },
      });
      for (const [idx, li] of section.lineItems.entries()) {
        await tx.quoteLineItem.create({
          data: lineItemCreateData(quoteId, li, idx, created.id),
        });
      }
    }
    for (const [idx, li] of lineItems.entries()) {
      await tx.quoteLineItem.create({ data: lineItemCreateData(quoteId, li, idx) });
    }
  }

  async create(businessId: string, input: CreateQuoteInput): Promise<QuoteWithLines> {
    const business = await this.businessService.findById(businessId);
    const gctRatePct = input.gctRatePct ?? Number(business.defaultGctRate);
    const discountPct = input.discountPct ?? 0;
    const depositCents = input.depositCents ?? 0;

    const totals = computeTotals({
      lines: collectLines(input).map(toTotalsLine),
      gctRatePct,
      discountPct,
      depositCents,
    });

    const number = await this.businessService.reserveQuoteNumber(businessId);

    const quoteId = await this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.create({
        data: {
          businessId,
          clientId: input.clientId,
          jobId: input.jobId,
          number,
          status: QuoteStatus.DRAFT,
          version: 1,
          gctRate: gctRatePct,
          discountPct,
          depositCents,
          validUntil: input.validUntil,
          terms: input.terms,
          subtotalCents: totals.subtotalCents,
          gctCents: totals.gctCents,
          totalCents: totals.totalCents,
        },
      });
      await this.persistLines(tx, quote.id, input.sections, input.lineItems);
      return quote.id;
    });

    return this.findOne(businessId, quoteId);
  }

  findAll(
    businessId: string,
    filters: { status?: QuoteStatus; clientId?: string; jobId?: string } = {},
  ) {
    return this.prisma.quote.findMany({
      where: {
        businessId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.clientId ? { clientId: filters.clientId } : {}),
        ...(filters.jobId ? { jobId: filters.jobId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(businessId: string, id: string): Promise<QuoteWithLines> {
    const quote = await this.prisma.quote.findFirst({
      where: { id, businessId },
      include: QUOTE_DETAIL_INCLUDE,
    });
    if (!quote) throw new NotFoundException("Quote not found");
    return quote;
  }

  async update(businessId: string, id: string, input: UpdateQuoteInput): Promise<QuoteWithLines> {
    const existing = await this.findOne(businessId, id);

    const replacingLines = input.sections !== undefined || input.lineItems !== undefined;
    const gctRatePct = input.gctRatePct ?? Number(existing.gctRate);
    const discountPct = input.discountPct ?? Number(existing.discountPct);
    const depositCents = input.depositCents ?? existing.depositCents;

    const linesForTotals: TotalsLineInput[] = replacingLines
      ? collectLines({
          sections: input.sections ?? [],
          lineItems: input.lineItems ?? [],
        }).map(toTotalsLine)
      : [...existing.lineItems, ...existing.sections.flatMap((s) => s.lineItems)].map((li) => ({
          quantity: Number(li.quantity),
          unitPriceCents: li.unitPriceCents,
          markupPct: li.markupPct ? Number(li.markupPct) : undefined,
          gctTreatment: li.gctTreatment as GctTreatment,
        }));

    const totals = computeTotals({
      lines: linesForTotals,
      gctRatePct,
      discountPct,
      depositCents,
    });

    const quoteId = await this.prisma.$transaction(async (tx) => {
      if (replacingLines) {
        await tx.quoteLineItem.deleteMany({ where: { quoteId: id } });
        await tx.quoteSection.deleteMany({ where: { quoteId: id } });
        await this.persistLines(tx, id, input.sections ?? [], input.lineItems ?? []);
      }

      await tx.quote.update({
        where: { id },
        data: {
          clientId: input.clientId ?? existing.clientId,
          jobId: input.jobId ?? existing.jobId,
          gctRate: gctRatePct,
          discountPct,
          depositCents,
          validUntil: input.validUntil ?? existing.validUntil,
          terms: input.terms ?? existing.terms,
          subtotalCents: totals.subtotalCents,
          gctCents: totals.gctCents,
          totalCents: totals.totalCents,
        },
      });
      return id;
    });

    return this.findOne(businessId, quoteId);
  }

  /** Validate and apply a quote status transition (DRAFT -> SENT -> ... ). */
  async updateStatus(
    businessId: string,
    id: string,
    status: QuoteStatus,
  ): Promise<QuoteWithLines> {
    const quote = await this.findOne(businessId, id);
    const allowed = ALLOWED_TRANSITIONS[quote.status as QuoteStatus] ?? [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot transition quote from ${quote.status} to ${status}`,
      );
    }
    await this.prisma.quote.update({ where: { id }, data: { status } });
    return this.findOne(businessId, id);
  }

  /**
   * Create a new revision of a quote: same number, version + 1, linked via
   * parentQuoteId, starting fresh as DRAFT with a copy of the line items.
   */
  async revise(businessId: string, id: string): Promise<QuoteWithLines> {
    const original = await this.findOne(businessId, id);

    const newQuoteId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.quote.create({
        data: {
          businessId,
          clientId: original.clientId,
          jobId: original.jobId,
          number: original.number,
          status: QuoteStatus.DRAFT,
          version: original.version + 1,
          parentQuoteId: original.id,
          gctRate: original.gctRate,
          discountPct: original.discountPct,
          depositCents: original.depositCents,
          validUntil: original.validUntil,
          terms: original.terms,
          subtotalCents: original.subtotalCents,
          gctCents: original.gctCents,
          totalCents: original.totalCents,
        },
      });

      const sectionIdMap = new Map<string, string>();
      for (const section of original.sections) {
        const newSection = await tx.quoteSection.create({
          data: { quoteId: created.id, title: section.title, sort: section.sort },
        });
        sectionIdMap.set(section.id, newSection.id);
      }

      const allOriginalLines = [
        ...original.lineItems,
        ...original.sections.flatMap((s) => s.lineItems),
      ];
      for (const li of allOriginalLines) {
        await tx.quoteLineItem.create({
          data: {
            quoteId: created.id,
            sectionId: li.sectionId ? sectionIdMap.get(li.sectionId) : undefined,
            category: li.category,
            description: li.description,
            quantity: li.quantity,
            rateUnit: li.rateUnit,
            unitPriceCents: li.unitPriceCents,
            priceSource: li.priceSource,
            supplierId: li.supplierId ?? undefined,
            gctTreatment: li.gctTreatment,
            markupPct: li.markupPct ?? undefined,
            overrideNote: li.overrideNote ?? undefined,
            sort: li.sort,
          },
        });
      }

      return created.id;
    });

    return this.findOne(businessId, newQuoteId);
  }

  /** Only DRAFT quotes may be deleted outright; sent quotes should be declined/expired instead. */
  async remove(businessId: string, id: string): Promise<void> {
    const quote = await this.findOne(businessId, id);
    if (quote.status !== QuoteStatus.DRAFT) {
      throw new BadRequestException("Only DRAFT quotes can be deleted");
    }
    await this.prisma.$transaction([
      this.prisma.quoteLineItem.deleteMany({ where: { quoteId: id } }),
      this.prisma.quoteSection.deleteMany({ where: { quoteId: id } }),
      this.prisma.quote.delete({ where: { id } }),
    ]);
  }
}
