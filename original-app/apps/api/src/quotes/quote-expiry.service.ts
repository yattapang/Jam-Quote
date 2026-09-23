import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { QuoteStatus } from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Automatic quote expiry. A quote that was SENT/VIEWED but never actioned
 * before its `validUntil` deadline should stop looking live — flip it to
 * EXPIRED (an allowed forward transition, see ALLOWED_TRANSITIONS in
 * quotes.service.ts). DRAFT/ACCEPTED/DECLINED/INVOICED quotes are untouched:
 * a draft has no deadline pressure, and closed/declined quotes are already
 * terminal.
 */
@Injectable()
export class QuoteExpiryService {
  private readonly logger = new Logger(QuoteExpiryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Expire every SENT/VIEWED quote whose validUntil has passed. Returns the count. */
  async expireOverdueQuotes(now: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.quote.updateMany({
      where: {
        status: { in: [QuoteStatus.SENT, QuoteStatus.VIEWED] },
        validUntil: { lt: now },
      },
      data: { status: QuoteStatus.EXPIRED },
    });
    return count;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyExpiry(): Promise<void> {
    const count = await this.expireOverdueQuotes();
    if (count > 0) {
      this.logger.log(`Expired ${count} overdue quote(s)`);
    }
  }
}
