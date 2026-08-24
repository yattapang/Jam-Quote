import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  Logger,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  computeTotals,
  ProjectStage,
  QuoteDetailLevel,
  QuoteStatus,
  type GctTreatment,
  type TotalsLineInput,
} from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";
import { BusinessService } from "../business/business.service.js";
import { PricingService } from "../billing/pricing.service.js";
import { startOfCurrentMonth } from "../common/month.util.js";
import type {
  CreateQuoteInput,
  QuoteLineItemInput,
  QuoteSectionInput,
  UpdateQuoteInput,
} from "./quotes.dto.js";

/** Allowed forward status transitions. See docs/ARCHITECTURE.md. */
const ALLOWED_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  [QuoteStatus.DRAFT]: [QuoteStatus.SENT],
  // ACCEPTED is reachable straight from SENT on purpose. VIEWED is a tracking
  // artifact — an email open or portal view — and nothing in this app can
  // detect either, so requiring it first would force a contractor whose client
  // phoned to say yes to record a "view" that never happened. Keeping VIEWED
  // available for when read-tracking exists, but not as a gate.
  [QuoteStatus.SENT]: [
    QuoteStatus.VIEWED,
    QuoteStatus.ACCEPTED,
    QuoteStatus.DECLINED,
    QuoteStatus.EXPIRED,
  ],
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

/**
 * What an anonymous holder of a share token may read.
 *
 * Deliberately a hand-written allow-list rather than the Prisma row: this is
 * the only unauthenticated response in the API, so adding a column to Quote
 * must not silently widen it. Everything here already appears on the PDF the
 * client is being sent.
 */
export interface PublicQuoteView {
  number: string;
  status: string;
  validUntil: Date | null;
  terms: string | null;
  detailLevel: string;
  gctRate: Prisma.Decimal;
  discountPct: Prisma.Decimal;
  depositCents: number;
  subtotalCents: number;
  gctCents: number;
  totalCents: number;
  lineItems: QuoteWithLines["lineItems"];
  sections: QuoteWithLines["sections"];
  clientName: string | null;
  business: {
    name: string;
    addressLine: string | null;
    town: string | null;
    parish: string | null;
    trn: string | null;
  };
}

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
    unitLabel: li.unitLabel,
    unitPriceCents: li.unitPriceCents,
    priceSource: li.priceSource,
    supplierId: li.supplierId,
    gctTreatment: li.gctTreatment,
    markupPct: li.markupPct,
    overrideNote: li.overrideNote,
    // Job ("job type") snapshot — all optional/undefined on a normal
    // line. Priced like any line (quantity x unitPriceCents above, unchanged);
    // these are display-only, never read by computeTotals.
    jobId: li.jobId,
    jobName: li.jobName,
    jobUnit: li.jobUnit,
    jobComponents: li.jobComponents as Prisma.InputJsonValue | undefined,
    sort: li.sort ?? idx,
  };
}

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly businessService: BusinessService,
    private readonly pricingService: PricingService,
  ) {}

  /**
   * Free-tier gate: Pro businesses are never limited. Free businesses are
   * blocked once they've hit their monthly quote allowance (the "month" is
   * the current calendar month, server time). Throws HTTP 402 with a
   * machine-readable code so the frontend can show an upgrade prompt.
   */
  private async assertCanCreateQuote(businessId: string): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({ where: { businessId } });
    const plan = subscription?.plan === "pro" ? "pro" : "free";
    if (plan === "pro") return;

    const { freeQuotesPerMonth } = await this.pricingService.get();
    const quotesThisMonth = await this.prisma.quote.count({
      where: { businessId, createdAt: { gte: startOfCurrentMonth() } },
    });

    if (quotesThisMonth >= freeQuotesPerMonth) {
      throw new HttpException(
        {
          message: `You've reached your free plan limit of ${freeQuotesPerMonth} quotes this month. Upgrade to Pro for unlimited quotes.`,
          code: "FREE_LIMIT_REACHED",
        },
        402,
      );
    }
  }

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
    await this.assertCanCreateQuote(businessId);

    const business = await this.businessService.findById(businessId);
    const gctRatePct = input.gctRatePct ?? Number(business.defaultGctRate);
    const discountPct = input.discountPct ?? 0;
    const depositCents = input.depositCents ?? 0;
    const detailLevel = input.detailLevel ?? QuoteDetailLevel.SUMMARY;

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
          projectId: input.projectId,
          number,
          status: QuoteStatus.DRAFT,
          version: 1,
          detailLevel,
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
    filters: { status?: QuoteStatus; clientId?: string; projectId?: string } = {},
  ) {
    return this.prisma.quote.findMany({
      where: {
        businessId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.clientId ? { clientId: filters.clientId } : {}),
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
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

  /**
   * Mint (or reuse) the public share token for a quote.
   *
   * Reused rather than rotated on every share, so a link already sent on
   * WhatsApp keeps working when the contractor shares again — re-sending is
   * the most likely reason they press it a second time, and silently breaking
   * the first link would be worse than not having one.
   *
   * 32 random bytes, base64url. Not derived from the quote id: ids appear in
   * staff URLs and are guessable relative to one another, while this is handed
   * to an outside party and must be a capability on its own.
   */
  async share(businessId: string, id: string): Promise<{ shareToken: string }> {
    const quote = await this.findOne(businessId, id);
    if (quote.shareToken) return { shareToken: quote.shareToken };

    const shareToken = randomBytes(32).toString("base64url");
    await this.prisma.quote.update({
      where: { id },
      data: { shareToken, sharedAt: new Date() },
    });
    return { shareToken };
  }

  /** Stop a shared link working. The quote is untouched; only the capability
   * is withdrawn, so it can be re-shared later with a fresh token. */
  async unshare(businessId: string, id: string): Promise<void> {
    await this.findOne(businessId, id);
    await this.prisma.quote.update({
      where: { id },
      data: { shareToken: null, sharedAt: null },
    });
  }

  /**
   * Resolve a public share token — NO businessId, because the token IS the
   * authorisation. Deliberately the only unscoped read in this service.
   *
   * Also records the first view, which is what finally makes
   * `QuoteStatus.VIEWED` reachable: the enum, its allowed transitions and the
   * expiry sweep all referenced it, but nothing in the app could ever set it.
   *
   * Only DRAFT is refused. A draft has not been sent to anyone, so a link to
   * one would expose a figure the contractor is still working on.
   */
  async findByShareToken(token: string): Promise<PublicQuoteView> {
    const quote = await this.prisma.quote.findFirst({
      where: { shareToken: token, deletedAt: null },
      include: {
        ...QUOTE_DETAIL_INCLUDE,
        client: { select: { firstName: true, lastName: true } },
        business: {
          select: { name: true, addressLine: true, town: true, parish: true, trn: true },
        },
      },
    });
    if (!quote || quote.status === QuoteStatus.DRAFT) {
      // Same response either way: a wrong token and a draft must be
      // indistinguishable, or the difference confirms which tokens are real.
      throw new NotFoundException("Quote not found");
    }

    if (!quote.firstViewedAt) {
      // SENT -> VIEWED only. Never drag ACCEPTED or DECLINED backwards
      // because the client happened to reopen the link.
      const advances = quote.status === QuoteStatus.SENT;
      await this.prisma.quote.update({
        where: { id: quote.id },
        data: {
          firstViewedAt: new Date(),
          ...(advances ? { status: QuoteStatus.VIEWED } : {}),
        },
      });
    }

    // An explicit allow-list, not the row. This is the only response in the
    // API an anonymous caller can read, so what it contains is a security
    // decision rather than a serialization detail: everything here is already
    // printed on the PDF the client is being sent, and nothing else — no ids,
    // no timestamps, no internal status beyond what the document shows.
    return {
      number: quote.number,
      status: quote.status,
      validUntil: quote.validUntil,
      terms: quote.terms,
      detailLevel: quote.detailLevel,
      gctRate: quote.gctRate,
      discountPct: quote.discountPct,
      depositCents: quote.depositCents,
      subtotalCents: quote.subtotalCents,
      gctCents: quote.gctCents,
      totalCents: quote.totalCents,
      lineItems: quote.lineItems,
      sections: quote.sections,
      clientName: quote.client ? `${quote.client.firstName} ${quote.client.lastName}`.trim() : null,
      business: quote.business,
    };
  }

  async update(businessId: string, id: string, input: UpdateQuoteInput): Promise<QuoteWithLines> {
    const existing = await this.findOne(businessId, id);

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
          projectId: input.projectId ?? existing.projectId,
          detailLevel,
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

    // Accepting a quote is the moment work becomes real, so it is the moment
    // a job should exist to track it against.
    //
    // Projects are optional and nothing else ever creates one, which meant job
    // costing only paid off for contractors disciplined enough to make one by
    // hand — and a costing feature that depends on remembering a separate step
    // reports on an empty set. Creating it here makes tracking the default.
    if (status === QuoteStatus.ACCEPTED && !quote.projectId) {
      await this.createProjectForAcceptedQuote(businessId, id);
    }

    return this.findOne(businessId, id);
  }

  /**
   * The CLIENT accepts or declines, through the public share link.
   *
   * No authentication: the token IS the credential, exactly as it is for
   * viewing. That is a deliberate trade — a client who has to make an account
   * to say yes will phone instead, and the loop stays open, which is the very
   * problem this closes.
   *
   * What makes it safe to expose is how narrow it is. Only a quote the client
   * has actually been sent can be decided (SENT or VIEWED), the decision can
   * only be made once, and nothing about the quote itself can be changed
   * through this path — no amounts, no lines, no dates.
   *
   * A decision is FINAL here. A client who changes their mind rings the
   * contractor, who can move the status themselves; letting the public link
   * flip an accepted quote back and forth would destroy the one thing this
   * record is for.
   */
  async decideByShareToken(
    token: string,
    decision: "ACCEPT" | "DECLINE",
    name: string,
    reason?: string,
  ): Promise<{ status: QuoteStatus }> {
    const quote = await this.prisma.quote.findFirst({
      where: { shareToken: token, deletedAt: null },
      select: { id: true, businessId: true, status: true, projectId: true },
    });
    // Same 404 as a bad token, and same as a DRAFT — see findByShareToken.
    // Anything else lets the response confirm which tokens are real.
    if (!quote || quote.status === QuoteStatus.DRAFT) {
      throw new NotFoundException("Quote not found");
    }

    const decidable = quote.status === QuoteStatus.SENT || quote.status === QuoteStatus.VIEWED;
    if (!decidable) {
      // Says WHAT it is now, because the commonest cause is two people opening
      // the same link and the second one deserves an explanation rather than a
      // blank refusal.
      throw new BadRequestException(
        quote.status === QuoteStatus.ACCEPTED || quote.status === QuoteStatus.DECLINED
          ? "This quote has already been answered. Contact the contractor to change it."
          : `This quote is no longer open for a decision (${quote.status.toLowerCase()}).`,
      );
    }

    const status = decision === "ACCEPT" ? QuoteStatus.ACCEPTED : QuoteStatus.DECLINED;
    await this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        status,
        decidedAt: new Date(),
        decidedByName: name.trim(),
        declineReason: decision === "DECLINE" ? reason?.trim() || null : null,
      },
    });

    // Same consequence as the contractor accepting it — a job to track the
    // work against. Without this, a quote accepted by the client would be the
    // one acceptance route that silently skips job costing.
    if (status === QuoteStatus.ACCEPTED && !quote.projectId) {
      await this.createProjectForAcceptedQuote(quote.businessId, quote.id);
    }

    return { status };
  }

  /**
   * The job a newly-accepted quote is now tracked against.
   *
   * Named from the quote so the contractor recognises it, and attached back to
   * the quote so revenue and costs meet on the same record. Best-effort by
   * design: if this fails the acceptance still stands, because refusing to
   * accept a quote over a bookkeeping convenience would be the wrong trade.
   */
  private async createProjectForAcceptedQuote(businessId: string, quoteId: string): Promise<void> {
    try {
      const quote = await this.prisma.quote.findFirst({
        where: { id: quoteId, businessId },
        select: { id: true, number: true, clientId: true },
      });
      if (!quote) return;

      const project = await this.prisma.project.create({
        data: {
          businessId,
          clientId: quote.clientId,
          name: `Quote ${quote.number}`,
          // WON, not QUOTED: the client has agreed. QUOTED would be the state
          // it was in a moment ago, and the stage picker is hand-set from here
          // on, so starting it wrong makes a contractor correct it every time.
          stage: ProjectStage.WON,
        },
      });

      await this.prisma.quote.update({
        where: { id: quoteId },
        data: { projectId: project.id },
      });
    } catch (err) {
      this.logger.warn(
        `Accepted quote ${quoteId} but could not create its project: ${String(err)}`,
      );
    }
  }

  /**
   * Create a VARIATION of an accepted quote — extra work agreed after the fact.
   *
   * The commonest source of unpaid work in construction: the job grows, nobody
   * writes it down, the contractor eats it.
   *
   * Deliberately NOT a revision. `revise` replaces a quote that has not been
   * agreed; this ADDS to one that has, and the original is never touched —
   * rewriting it would destroy the record of what the client actually agreed
   * to, which is the only thing that settles a dispute later.
   *
   * Starts empty and DRAFT: a variation is the new work, not a copy of the
   * old. Inherits the client and the job so revenue lands on the same project
   * as the original, which is what makes job costing add up.
   */
  async createVariation(businessId: string, quoteId: string): Promise<QuoteWithLines> {
    const original = await this.findOne(businessId, quoteId);

    // Only something the client has actually agreed to can be varied. Varying
    // a DRAFT or a SENT quote is just editing it, and `revise` already does
    // that properly.
    const agreed =
      original.status === QuoteStatus.ACCEPTED || original.status === QuoteStatus.INVOICED;
    if (!agreed) {
      throw new BadRequestException(
        "Only an accepted quote can be varied. Revise it instead while it is still open.",
      );
    }

    const number = await this.businessService.reserveQuoteNumber(businessId);
    const created = await this.prisma.quote.create({
      data: {
        businessId,
        number,
        status: QuoteStatus.DRAFT,
        clientId: original.clientId,
        // Same job as the original, so the extra work counts against it.
        projectId: original.projectId,
        variationOfQuoteId: original.id,
        gctRate: original.gctRate,
        discountPct: 0,
        depositCents: 0,
        detailLevel: original.detailLevel,
        terms: original.terms,
      },
    });
    return this.findOne(businessId, created.id);
  }

  /**
   * Create a new revision of a quote, linked via parentQuoteId, starting
   * fresh as DRAFT with a copy of the line items.
   *
   * - If the original is ACCEPTED or INVOICED, the deal is closed and its
   *   number is locked: the revision gets a brand-new number at version 1.
   * - Otherwise (SENT/VIEWED/DECLINED/EXPIRED/...), the revision keeps the
   *   original's number but takes the next free version for that number, so
   *   revising an already-revised quote doesn't collide on
   *   @@unique([businessId, number, version]).
   */
  async revise(businessId: string, id: string): Promise<QuoteWithLines> {
    const original = await this.findOne(businessId, id);
    const isClosed =
      original.status === QuoteStatus.ACCEPTED || original.status === QuoteStatus.INVOICED;

    // Reserve the new number (when needed) before opening the transaction
    // below: reserveQuoteNumber runs its own $transaction, and nesting a
    // second interactive transaction inside this one isn't safe.
    const number = isClosed
      ? await this.businessService.reserveQuoteNumber(businessId)
      : original.number;

    const newQuoteId = await this.prisma.$transaction(async (tx) => {
      let version = 1;
      if (!isClosed) {
        const latest = await tx.quote.aggregate({
          where: { businessId, number },
          _max: { version: true },
        });
        version = (latest._max.version ?? original.version) + 1;
      }

      const created = await tx.quote.create({
        data: {
          businessId,
          clientId: original.clientId,
          projectId: original.projectId,
          number,
          status: QuoteStatus.DRAFT,
          version,
          parentQuoteId: original.id,
          detailLevel: original.detailLevel,
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
