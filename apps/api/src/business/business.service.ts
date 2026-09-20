import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Business } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateBusinessInput, UpdateBusinessInput } from "./business.dto.js";

/** Pads a sequence number into e.g. "QT-0142". */
function formatNumber(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

/** Either the top-level Prisma client or an interactive-transaction client —
 * both expose `.business.update`, which is all reserve*Number needs. Letting
 * callers pass their own transaction client here means a caller that already
 * has a `$transaction` open (e.g. invoices.service.ts convertFromQuote) can
 * fold the reservation into it, so a rollback there also gives the number
 * back, instead of the reservation being a separate top-level statement that
 * can never be undone. */
type BusinessSeqClient = Pick<PrismaService, "business"> | Prisma.TransactionClient;

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
    return this.prisma.business.update({
      where: { id },
      data: {
        ...input,
        // "" means the contractor cleared the field, and that has to reach the
        // database as NULL. An empty string is truthy enough to be picked as a
        // recipient, so storing one would send renewal mail to nobody and look
        // like it had been delivered.
        ...(input.billingContactEmail !== undefined
          ? { billingContactEmail: input.billingContactEmail.trim() || null }
          : {}),
        ...(input.billingContactName !== undefined
          ? { billingContactName: input.billingContactName.trim() || null }
          : {}),
      },
    });
  }

  /**
   * Atomically reserve the next quote number for a business, e.g. "QT-0142",
   * and bump the counter. Used by quotes.service on create and on revision.
   *
   * A single `update` with `{ increment: 1 }` compiles to an atomic
   * `UPDATE ... SET "nextQuoteSeq" = "nextQuoteSeq" + 1` — the increment
   * happens in the database, not in this process, so two concurrent callers
   * can never read the same pre-increment value and hand out the same
   * number. The old `findUnique` then `update` shape read a value, then
   * wrote seq + 1 computed in JS: two callers reading before either writes
   * both compute the same seq + 1 and mint the same number.
   *
   * Pass `client` (an interactive-transaction client) to fold the
   * reservation into a caller's own transaction so a rollback there also
   * gives the number back; omitted, it runs against the top-level
   * connection as its own atomic statement.
   */
  async reserveQuoteNumber(
    businessId: string,
    client: BusinessSeqClient = this.prisma,
  ): Promise<string> {
    const business = await this.bumpSeq(client, businessId, "nextQuoteSeq");
    return formatNumber(business.quotePrefix, business.nextQuoteSeq - 1);
  }

  /** Atomically reserve the next invoice number, e.g. "INV-0007". See
   * reserveQuoteNumber's comment — same atomic-increment shape and the same
   * optional-`client` fold-into-a-transaction behaviour. */
  async reserveInvoiceNumber(
    businessId: string,
    client: BusinessSeqClient = this.prisma,
  ): Promise<string> {
    const business = await this.bumpSeq(client, businessId, "nextInvoiceSeq");
    return formatNumber(business.invoicePrefix, business.nextInvoiceSeq - 1);
  }

  /** Atomically increments the named counter and returns the row as it now
   * stands (post-increment) plus both prefixes, so callers can derive the
   * PRE-increment number they just reserved (`value - 1`) without a second
   * round trip. `update`'s WHERE-not-found case (P2025) is translated to the
   * same NotFoundException the old findUnique-first shape threw. */
  private async bumpSeq(
    client: BusinessSeqClient,
    businessId: string,
    field: "nextQuoteSeq" | "nextInvoiceSeq",
  ): Promise<Business> {
    try {
      return await client.business.update({
        where: { id: businessId },
        data: { [field]: { increment: 1 } },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        throw new NotFoundException("Business not found");
      }
      throw e;
    }
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
