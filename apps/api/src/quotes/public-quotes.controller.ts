import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { QuotesService } from "./quotes.service.js";
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
  constructor(private readonly quotes: QuotesService) {}

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
