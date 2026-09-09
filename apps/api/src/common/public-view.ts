import { InternalServerErrorException, Logger } from "@nestjs/common";
import type { ZodType } from "zod";

const logger = new Logger("PublicView");

/**
 * Validates a public share response against its `.strict()` wire contract, on
 * the way out, every time.
 *
 * ## Why this exists
 *
 * The markup-disclosure fix — an explicit `PUBLIC_LINE_SELECT` instead of the
 * tenant's Prisma include — was described in `TESTING.md` as "guarded twice": by
 * the select, and by a `.strict()` contract in `packages/core/src/wire/`. An
 * independent review found the second guard was doing nothing:
 *
 * - `publicQuoteWire.parse` appeared **only inside test files**. The controller
 *   returned the view raw, so the contract never met a live response.
 * - The sample it validated was a hand-written literal. The service assigns
 *   `lineItems: quote.lineItems` and `business: quote.business` from a Prisma
 *   result, and TypeScript's excess-property check applies only to FRESH object
 *   literals — so a wider payload is structurally assignable and compiles.
 *
 * The source-scanning disclosure test does pin `PUBLIC_LINE_SELECT`, and that is
 * what keeps the markup leak closed. But it parses only that one block. Adding
 * `trn: true` to the `client` select, or `phone: true` to the `business` select,
 * compiled and passed every test. This closes that: the contract now sees the
 * real payload, so a widened select fails on the first request instead of
 * disclosing.
 *
 * ## Why it returns the ORIGINAL rather than the parsed value
 *
 * The wire contract describes JSON — `Decimal` as a string, `Date` as an ISO
 * string. The service's declared return type holds the real `Decimal` and `Date`
 * objects, and the controller serializes them. Returning Zod's output would
 * change the response for no benefit and break the type. So this validates a
 * serialized COPY and hands back the original: the check is the point, not the
 * transformation.
 *
 * The cost is one extra serialize per public-share read. These are single-document
 * reads on a page a client opens once or twice, so that is affordable in a way it
 * would not be on a tenant list endpoint.
 *
 * ## Why it fails closed with a 500
 *
 * If the response no longer matches the contract, the safe answer is no response.
 * A 500 on a share link is a visible bug someone fixes in an hour; a silently
 * widened payload is a disclosure nobody notices. The thrown message is generic —
 * the detail goes to the log, because the failure text would name the very field
 * that should not have been sent.
 */
export function assertPublicShape<T>(contract: ZodType, view: T, what: string): T {
  const result = contract.safeParse(JSON.parse(JSON.stringify(view)));
  if (!result.success) {
    // The issues name the offending field, so they belong in the log and not in
    // an anonymous caller's response body.
    logger.error(
      `${what} does not match its public wire contract — refusing to send it. ` +
        `A widened Prisma select is the usual cause. Issues: ${JSON.stringify(result.error.issues)}`,
    );
    throw new InternalServerErrorException("This link is temporarily unavailable");
  }
  return view;
}
