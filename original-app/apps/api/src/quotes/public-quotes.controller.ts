import { Body, Controller, Get, NotFoundException, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { QuotesService } from "./quotes.service.js";
import { BusinessService } from "../business/business.service.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { quoteDecisionSchema, type QuoteDecisionInput } from "./quotes.dto.js";

/**
 * The one deliberately UNAUTHENTICATED surface in the API.
 *
 * A contractor sends their client a quote link over WhatsApp. The client has
 * no account and never will, so the link cannot sit behind TenantAuthGuard —
 * which is exactly the bug this replaces: the share link pointed at the
 * tenant-only route and the client hit a login wall, while the contractor saw
 * the message send successfully and assumed it had arrived.
 *
 * Security rests entirely on the token being a capability: 32 random bytes,
 * unique-indexed, never derived from the quote id, revocable by the
 * contractor, and minted only when a quote is actually shared. There is no
 * businessId here BY DESIGN — the token is the authorisation. Every other read
 * in this API is tenant-scoped, so this file is the one place to check when
 * asking "what can an anonymous caller see?".
 *
 * A DRAFT is never resolvable, and an unknown token and a draft return the
 * same 404, so the response cannot be used to confirm which tokens are real.
 */
@Controller("public/quotes")
export class PublicQuotesController {
  constructor(
    private readonly quotes: QuotesService,
    private readonly business: BusinessService,
  ) {}

  /**
   * The business logo for THIS shared quote, scoped by the share token — not
   * the tenant's authenticated `/business/logo`, which needs a session this
   * caller does not have. Resolves the businessId from the token first (same
   * draft/unknown-token collapse as the rest of this controller) and serves
   * only the logo bytes: nothing else about the quote or business.
   *
   * Declared BEFORE `:token` for the same reason `logo/meta` precedes `:id`
   * on BusinessController — Nest matches routes in declaration order.
   */
  @Get(":token/logo")
  async logo(@Param("token") token: string, @Res() res: Response): Promise<void> {
    const businessId = await this.quotes.resolveBusinessIdByShareToken(token);
    const row = await this.business.getLogo(businessId);
    // Same message as an unknown/draft token ("Quote not found" from
    // resolveBusinessIdByShareToken) — a business with no logo must not be
    // distinguishable from a bad token by response wording.
    if (!row) throw new NotFoundException("Quote not found");
    res.setHeader("Content-Type", row.contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", 'inline; filename="logo"');
    // Private, not public: a shared/CDN cache could otherwise keep serving a
    // revoked link's logo for the cache lifetime after the contractor
    // revokes it. Still cacheable by the one client holding this link.
    res.setHeader("Cache-Control", "private, max-age=300");
    res.end(Buffer.from(row.bytes));
  }

  /** Resolving the link also records the first view, which is what makes
   * QuoteStatus.VIEWED reachable at all. */
  /**
   * The client's own answer. Public by design — the token is the credential,
   * because a client made to create an account will phone instead and the
   * loop this closes stays open.
   */
  // Tighter than the global 120/min. This is an unauthenticated route that
  // WRITES, so the limit is really about how fast tokens could be guessed;
  // a real client answers a quote once.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post(":token/decision")
  decide(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(quoteDecisionSchema)) body: QuoteDecisionInput,
  ) {
    return this.quotes.decideByShareToken(token, body.decision, body.name, body.reason);
  }

  @Get(":token")
  findByToken(@Param("token") token: string) {
    return this.quotes.findByShareToken(token);
  }
}
