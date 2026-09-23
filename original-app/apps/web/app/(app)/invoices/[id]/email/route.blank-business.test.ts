import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Covers "a PDF or email can go out with no business name" for the invoice
 * twin of the quote email route. Same rationale: getBusiness() can still
 * resolve to EMPTY_BUSINESS (blank name) when the API is unreachable, or in
 * the race where it drops between getInvoice() and getBusiness().
 */

vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => send(...args) };
  },
}));

vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: vi.fn().mockResolvedValue(Buffer.from("pdf")) }));
vi.mock("@/lib/pdf/InvoicePdf", () => ({ default: vi.fn() }));

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/email-sending", () => ({
  emailSendingStatus: () => ({ configured: true, reason: undefined }),
}));

const getInvoice = vi.fn();
const getClients = vi.fn();
const getBusiness = vi.fn();
const getLogoBytes = vi.fn();
vi.mock("@/lib/api-server", () => ({
  getInvoice: (...a: unknown[]) => getInvoice(...a),
  getClients: (...a: unknown[]) => getClients(...a),
  getBusiness: (...a: unknown[]) => getBusiness(...a),
  getLogoBytes: (...a: unknown[]) => getLogoBytes(...a),
}));

import { getSession } from "@/lib/session";
import { POST } from "./route";

const INVOICE = {
  id: "i1",
  clientId: "c1",
  num: "I-0001",
  lines: [],
  gctRatePct: 0,
  discountPct: 0,
  depositCents: 0,
  paidCents: 0,
  retentionCents: 0,
  retentionReleasedAt: null,
  dueDateLabel: "Due Jan 1",
};
const CLIENT = { id: "c1", email: "client@example.com", name: "Client" };
const REAL_BUSINESS = { id: "b1", name: "Bell & Sons" };
const BLANK_BUSINESS = { id: "", name: "" };

afterEach(() => vi.clearAllMocks());

describe("POST /invoices/:id/email — blank business guard", () => {
  it("refuses with 503 and sends no mail when the business name is blank", async () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ business: { id: "b1" } });
    getInvoice.mockResolvedValue(INVOICE);
    getClients.mockResolvedValue([CLIENT]);
    getBusiness.mockResolvedValue(BLANK_BUSINESS);
    getLogoBytes.mockResolvedValue(null);

    const res = await POST(new Request("http://x"), { params: { id: "i1" } });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/couldn't load your business profile/i);
    expect(send).not.toHaveBeenCalled();
  });

  it("proceeds and sends when the business is real", async () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ business: { id: "b1" } });
    getInvoice.mockResolvedValue(INVOICE);
    getClients.mockResolvedValue([CLIENT]);
    getBusiness.mockResolvedValue(REAL_BUSINESS);
    getLogoBytes.mockResolvedValue(null);
    send.mockResolvedValue({ error: null });

    const res = await POST(new Request("http://x"), { params: { id: "i1" } });
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
