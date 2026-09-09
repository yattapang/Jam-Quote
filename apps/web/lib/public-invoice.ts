import { API_BASE_URL } from "@/lib/api-client";
import type { PublicInvoiceWire } from "@jamquote/core";
import type { PublicQuoteLine } from "@/lib/public-quote";

/**
 * Fetching an invoice by its public share token.
 *
 * Same reasoning as `public-quote.ts`: deliberately NOT `serverRequest`, which
 * attaches the signed-in tenant's bearer token. This runs for a client who has
 * no account, and the share token is the authorisation.
 */

/**
 * NOT declared here. The shape comes from `@jamquote/core`'s wire contract - see
 * `packages/core/src/wire/public-invoice.ts`.
 *
 * That contract is `.strict()` because this is the unauthenticated surface: an
 * unexpected field is a disclosure, not a shrug. It refuses the payment and
 * reminder ledgers explicitly - a client is entitled to the total they have
 * paid, not to which method, which date, or how many times they have been
 * chased.
 */
export type PublicInvoice = Omit<PublicInvoiceWire, "lineItems" | "sections"> & {
  lineItems: PublicQuoteLine[];
  sections: { id: string; title: string; lineItems: PublicQuoteLine[] }[];
};

/** Undefined for an unknown, revoked or still-draft token — the API returns
 * the same 404 for all three so the response cannot be used to probe which
 * tokens are real. */
export async function getSharedInvoice(token: string): Promise<PublicInvoice | undefined> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/invoices/${token}`, { cache: "no-store" });
    if (!res.ok) return undefined;
    return (await res.json()) as PublicInvoice;
  } catch {
    return undefined;
  }
}
