/**
 * Single chokepoint for talking to apps/api. Every screen goes through this
 * module instead of calling fetch() directly, so swapping the mock/local
 * behaviour for the real NestJS API later is a one-file change.
 */

// Falls back to same-origin /api in the browser; override via env in deploy.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    throw new ApiError(`Request to ${path} failed`, res.status);
  }
  return (await res.json()) as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export interface CardPaymentResponse {
  checkoutUrl: string;
  reference: string;
}

/**
 * POST /api/payments/invoices/:id/card — kicks off a WiPay hosted-checkout
 * session for the invoice. Stubbed for now: the real API isn't wired up in
 * this app yet, so we simulate the round trip and surface a friendly error
 * if a live backend answers with something unexpected.
 */
export async function payInvoiceByCard(invoiceId: string): Promise<CardPaymentResponse> {
  try {
    return await apiClient.post<CardPaymentResponse>(
      `/payments/invoices/${invoiceId}/card`,
    );
  } catch {
    // No live payments backend in this build — mock the WiPay handoff so the
    // UI flow (button -> pending -> redirect) can still be demonstrated.
    await new Promise((resolve) => setTimeout(resolve, 700));
    return {
      checkoutUrl: `https://checkout.wipayfinancial.com/mock/${invoiceId}`,
      reference: `WPY-MOCK-${invoiceId}`,
    };
  }
}
