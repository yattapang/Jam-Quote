import { Injectable, NotFoundException } from "@nestjs/common";
import type { Business } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateBusinessInput, UpdateBusinessInput } from "./business.dto.js";

/** Pads a sequence number into e.g. "QT-0142". */
function formatNumber(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateBusinessInput): Promise<Business> {
    return this.prisma.business.create({ data: input });
  }

  async findById(id: string): Promise<Business> {
    const business = await this.prisma.business.findUnique({ where: { id } });
    if (!business) throw new NotFoundException("Business not found");
    return business;
  }

  async update(id: string, input: UpdateBusinessInput): Promise<Business> {
    await this.findById(id);
    return this.prisma.business.update({ where: { id }, data: input });
  }

  /**
   * Atomically reserve the next quote number for a business, e.g. "QT-0142",
   * and bump the counter. Used by quotes.service on create and on revision.
   */
  async reserveQuoteNumber(businessId: string): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const business = await tx.business.findUnique({ where: { id: businessId } });
      if (!business) throw new NotFoundException("Business not found");
      const seq = business.nextQuoteSeq;
      await tx.business.update({
        where: { id: businessId },
        data: { nextQuoteSeq: seq + 1 },
      });
      return formatNumber(business.quotePrefix, seq);
    });
  }

  /** Atomically reserve the next invoice number, e.g. "INV-0007". */
  async reserveInvoiceNumber(businessId: string): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const business = await tx.business.findUnique({ where: { id: businessId } });
      if (!business) throw new NotFoundException("Business not found");
      const seq = business.nextInvoiceSeq;
      await tx.business.update({
        where: { id: businessId },
        data: { nextInvoiceSeq: seq + 1 },
      });
      return formatNumber(business.invoicePrefix, seq);
    });
  }
}
