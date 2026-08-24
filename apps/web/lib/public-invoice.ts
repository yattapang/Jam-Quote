import { API_BASE_URL } from "@/lib/api-client";
import type { PublicQuoteLine } from "@/lib/public-quote";

/**
 * Fetching an invoice by its public share token.
 *
 * Same reasoning as `public-quote.ts`: deliberately NOT `serverRequest`, which
 * attaches the signed-in tenant's bearer token. This runs for a client who has
 * no account, and the share token is the authorisation.
 */

export interface PublicInvoice {
  number: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  terms: string | null;
  detailLevel: string;
  gctRate: string | number;
  discountPct: string | number;
  depositCents: number;
  subtotalCents: number;
  gctCents: number;
  totalCents: number;
  paidCents: number;
  retentionCents: number;
  retentionReleased: boolean;
  lineItems: PublicQuoteLine[];
  sections: { id: string; title: string; lineItems: PublicQuoteLine[] }[];
  clientName: string | null;
  business: {
    name: string;
    addressLine: string | null;
    town: string | null;
    parish: string | null;
    trn: string | null;
  };
}

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
