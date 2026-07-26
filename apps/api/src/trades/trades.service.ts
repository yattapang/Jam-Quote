import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateTradeInput } from "./trades.dto.js";

export interface TradeView {
  id: string;
  name: string;
  custom: boolean;
}

/**
 * In-code mirror of the global master trade list seeded by the
 * 20260725110000_trades migration (same ids, so a business that starts
 * using the fallback below and later gets the real migration applied sees
 * the identical rows rather than duplicates). Used as TradesService.findAll's
 * fallback when the Trade table doesn't exist yet (pre-migration DBs) so
 * GET /trades stays a 200 regardless of migration state — same convention as
 * PricingService.get().
 */
export const MASTER_TRADES: TradeView[] = [
  { id: "fe077806-418c-4776-8132-eb40f2689df8", name: "Mason", custom: false },
  { id: "c60a571e-a4e5-4ec6-bd16-5df2a33cc8f0", name: "Block & Steel", custom: false },
  { id: "bc96b47d-e23a-4218-8682-ec4fb139c795", name: "Carpenter", custom: false },
  { id: "a9d5f296-b0a7-4d1b-810c-3213d7728992", name: "Electrician", custom: false },
  { id: "e1d61545-d086-444b-92b4-e51367330c0c", name: "Plumber", custom: false },
  { id: "d39d2694-1b0c-4ae1-b9f9-a60b6fdfea05", name: "Tiler", custom: false },
  { id: "861288ad-4745-4712-a508-4d1f4ccd199a", name: "Painter", custom: false },
  { id: "7da6c014-1faa-4ca7-bdb7-99c14229bdf0", name: "Roofer", custom: false },
  { id: "60274bcf-881a-4860-b506-4a4a6ce1a7f2", name: "Welder/Steel Fabricator", custom: false },
  { id: "3fa33e31-8bfe-4011-a90c-4ee2a72aab39", name: "Glazier", custom: false },
  { id: "2496d194-1ab2-4fe0-89ca-b6c3a7468dbd", name: "Plasterer", custom: false },
  { id: "4894af60-9878-46de-b630-de7f1345825c", name: "HVAC Technician", custom: false },
  { id: "3e002c75-ded5-4e20-8ab9-f19f9c2509ac", name: "Landscaper", custom: false },
  { id: "10e5a85f-9c90-44f5-a333-450b4ffc373b", name: "General Labourer", custom: false },
];

/**
 * De-dupes trades by name (case-insensitive) and sorts alphabetically.
 * When a global trade and a business-custom trade share a name, the global
 * (non-custom) entry wins — it's the canonical row; POST /trades returns
 * that same global row rather than ever creating a shadowing custom one.
 */
function dedupeAndSort(trades: TradeView[]): TradeView[] {
  const byName = new Map<string, TradeView>();
  for (const trade of trades) {
    const key = trade.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing || (existing.custom && !trade.custom)) {
      byName.set(key, trade);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

@Injectable()
export class TradesService {
  private readonly logger = new Logger(TradesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resilient by design: if the Trade table doesn't exist yet (this
   * migration hasn't been applied against this DB), this falls back to the
   * in-code MASTER_TRADES list rather than throwing — GET /trades must stay
   * a 200 regardless of migration state, same convention as
   * PricingService.get().
   */
  async findAll(businessId: string): Promise<TradeView[]> {
    try {
      const trades = await this.prisma.trade.findMany({
        where: { OR: [{ businessId: null }, { businessId }] },
      });
      return dedupeAndSort(
        trades.map((t) => ({ id: t.id, name: t.name, custom: t.businessId !== null })),
      );
    } catch (err) {
      this.logger.warn(
        `Trade table read failed (migration not applied?) — falling back to in-code master list: ${String(err)}`,
      );
      return dedupeAndSort(MASTER_TRADES);
    }
  }

  /**
   * Idempotent create: if a global trade or one of this business's own
   * custom trades already matches `name` case-insensitively, that existing
   * row is returned as-is (no duplicate created). Otherwise a new
   * business-custom Trade (businessId set) is created and returned.
   */
  async create(businessId: string, input: CreateTradeInput): Promise<TradeView> {
    const name = input.name.trim();
    const existing = await this.prisma.trade.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        OR: [{ businessId: null }, { businessId }],
      },
    });
    if (existing) {
      return { id: existing.id, name: existing.name, custom: existing.businessId !== null };
    }
    const created = await this.prisma.trade.create({ data: { businessId, name } });
    return { id: created.id, name: created.name, custom: true };
  }
}
