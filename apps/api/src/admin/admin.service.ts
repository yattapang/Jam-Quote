import { Injectable } from "@nestjs/common";
import { supportedJurisdictions } from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";

export interface AdminOverview {
  businesses: number;
  activeSubscriptions: number;
  suppliersTracked: number;
  jurisdictionsLive: number;
}

export interface AdminTenant {
  id: string;
  name: string;
  parish: string | null;
  plan: string;
  trn: string | null;
  status: string;
  createdAt: Date;
  quoteCount: number;
}

export interface AdminSupplier {
  id: string;
  name: string;
  parish: string | null;
  isPartner: boolean;
  skuCount: number;
  lastFetch: string | null;
}

export interface AdminRegulatoryUpdate {
  id: string;
  title: string;
  category: string;
  summary: string;
  effectiveDate: Date | null;
  sourceUrl: string | null;
  actionNeeded: string | null;
}

/**
 * Platform-level admin service for the internal JamQuote staff console.
 * Deliberately NOT business-scoped — no businessId filtering. Reads across
 * every tenant. Only reachable via the internal /admin routes.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<AdminOverview> {
    const [businesses, activeSubscriptions, suppliersTracked] = await Promise.all([
      this.prisma.business.count({ where: { deletedAt: null } }),
      this.prisma.subscription.count({ where: { status: "active" } }),
      this.prisma.supplier.count(),
    ]);

    return {
      businesses,
      activeSubscriptions,
      suppliersTracked,
      jurisdictionsLive: supportedJurisdictions().length,
    };
  }

  async tenants(): Promise<AdminTenant[]> {
    const businesses = await this.prisma.business.findMany({
      where: { deletedAt: null },
      include: {
        subscription: true,
        _count: { select: { quotes: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return businesses.map((b) => ({
      id: b.id,
      name: b.name,
      parish: b.parish,
      plan: b.subscription?.plan ?? "Free",
      trn: b.trn,
      status: b.subscription?.status ?? "active",
      createdAt: b.createdAt,
      quoteCount: b._count.quotes,
    }));
  }

  async suppliers(): Promise<AdminSupplier[]> {
    const suppliers = await this.prisma.supplier.findMany({
      where: { deletedAt: null },
      include: {
        _count: { select: { priceEntries: true } },
      },
      orderBy: { name: "asc" },
    });

    return Promise.all(
      suppliers.map(async (s) => {
        const latest = await this.prisma.materialPriceEntry.findFirst({
          where: { supplierId: s.id },
          orderBy: { fetchedAt: "desc" },
          select: { fetchedAt: true },
        });

        return {
          id: s.id,
          name: s.name,
          parish: s.parish,
          isPartner: s.isPartner,
          skuCount: s._count.priceEntries,
          lastFetch: latest ? latest.fetchedAt.toISOString() : null,
        };
      }),
    );
  }

  regulatory(): Promise<AdminRegulatoryUpdate[]> {
    return this.prisma.regulatoryUpdate.findMany({
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        title: true,
        category: true,
        summary: true,
        effectiveDate: true,
        sourceUrl: true,
        actionNeeded: true,
      },
    });
  }
}
