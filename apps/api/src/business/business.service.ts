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

  /**
   * Stores (or replaces) this business's logo. One row per business keyed by
   * businessId, so an upsert cannot accumulate orphans and there is no old
   * file to clean up.
   *
   * The bytes handed in here have already been through normalizeLogo — the
   * caller must not pass raw upload data.
   */
  async setLogo(
    businessId: string,
    logo: { bytes: Buffer; contentType: string; width: number; height: number },
  ): Promise<{ width: number; height: number; updatedAt: Date }> {
    // Prisma's Bytes maps to Uint8Array with a concrete ArrayBuffer, which a
    // Node Buffer does not guarantee (it can be a view into a shared pool).
    // The copy is the point, not a workaround.
    const data = { ...logo, bytes: new Uint8Array(logo.bytes) };
    return this.prisma.businessLogo.upsert({
      where: { businessId },
      create: { businessId, ...data },
      update: data,
      select: { width: true, height: true, updatedAt: true },
    });
  }

  /** Raw bytes for serving. Returns null when the business has no logo. */
  getLogo(businessId: string) {
    return this.prisma.businessLogo.findUnique({ where: { businessId } });
  }

  /** Metadata only — deliberately excludes `bytes` so the settings screen can
   * ask "is there a logo?" without transferring it. */
  getLogoMeta(businessId: string) {
    return this.prisma.businessLogo.findUnique({
      where: { businessId },
      select: { contentType: true, width: true, height: true, updatedAt: true },
    });
  }

  /** Hard delete: a removed logo must actually stop appearing on documents,
   * and there is no offline-sync tombstone to preserve for it. */
  async removeLogo(businessId: string): Promise<void> {
    await this.prisma.businessLogo.deleteMany({ where: { businessId } });
  }

}
