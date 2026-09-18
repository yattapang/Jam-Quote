import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Covers "a PDF or email can go out with no business name": getBusiness()
 * can still resolve to EMPTY_BUSINESS (blank name) when the API is
 * unreachable, or in the race where it drops between getQuote() and
 * getBusiness(). Before the fix, the route sent anyway — the client would
 * receive a quote from nobody, with "Quote Q-1 from " as the subject line.
 */

vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => send(...args) };
  },
}));

vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: vi.fn().mockResolvedValue(Buffer.from("pdf")) }));
vi.mock("@/lib/pdf/QuotePdf", () => ({ default: vi.fn() }));

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/email-sending", () => ({
  emailSendingStatus: () => ({ configured: true, reason: undefined }),
}));

const getQuote = vi.fn();
const getClients = vi.fn();
const getBusiness = vi.fn();
vi.mock("@/lib/api-server", () => ({
  getQuote: (...a: unknown[]) => getQuote(...a),
  getClients: (...a: unknown[]) => getClients(...a),
  getBusiness: (...a: unknown[]) => getBusiness(...a),
}));

import { getSession } from "@/lib/session";
import { POST } from "./route";

const QUOTE = { id: "q1", clientId: "c1", num: "Q-0001", lines: [], gctRatePct: 0, discountPct: 0, depositCents: 0 };
const CLIENT = { id: "c1", email: "client@example.com", name: "Client" };
const REAL_BUSINESS = { id: "b1", name: "Bell & Sons" };
const BLANK_BUSINESS = { id: "", name: "" };

afterEach(() => vi.clearAllMocks());

describe("POST /quotes/:id/email — blank business guard", () => {
  it("refuses with 503 and sends no mail when the business name is blank", async () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ business: { id: "b1" } });
    getQuote.mockResolvedValue(QUOTE);
    getClients.mockResolvedValue([CLIENT]);
    getBusiness.mockResolvedValue(BLANK_BUSINESS);

    const res = await POST(new Request("http://x"), { params: { id: "q1" } });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/couldn't load your business profile/i);
    expect(send).not.toHaveBeenCalled();
  });

  it("proceeds and sends when the business is real", async () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ business: { id: "b1" } });
    getQuote.mockResolvedValue(QUOTE);
    getClients.mockResolvedValue([CLIENT]);
    getBusiness.mockResolvedValue(REAL_BUSINESS);
    send.mockResolvedValue({ error: null });

    const res = await POST(new Request("http://x"), { params: { id: "q1" } });
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
