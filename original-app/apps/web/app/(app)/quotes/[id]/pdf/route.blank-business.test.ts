import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Covers "a PDF or email can go out with no business name" for the quote PDF
 * download route (used directly, and by the email route's attachment).
 */

const renderToBuffer = vi.fn().mockResolvedValue(Buffer.from("pdf"));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: (...a: unknown[]) => renderToBuffer(...a) }));
vi.mock("@/lib/pdf/QuotePdf", () => ({ default: vi.fn() }));

const getQuote = vi.fn();
const getClients = vi.fn();
const getBusiness = vi.fn();
const getLogoBytes = vi.fn();
vi.mock("@/lib/api-server", () => ({
  getQuote: (...a: unknown[]) => getQuote(...a),
  getClients: (...a: unknown[]) => getClients(...a),
  getBusiness: (...a: unknown[]) => getBusiness(...a),
  getLogoBytes: (...a: unknown[]) => getLogoBytes(...a),
}));

import { GET } from "./route";

const QUOTE = { id: "q1", clientId: "c1", num: "Q-0001" };
const REAL_BUSINESS = { id: "b1", name: "Bell & Sons" };
const BLANK_BUSINESS = { id: "", name: "" };

afterEach(() => vi.clearAllMocks());

describe("GET /quotes/:id/pdf — blank business guard", () => {
  it("refuses with 503 and renders no PDF when the business name is blank", async () => {
    getQuote.mockResolvedValue(QUOTE);
    getClients.mockResolvedValue([]);
    getBusiness.mockResolvedValue(BLANK_BUSINESS);
    getLogoBytes.mockResolvedValue(null);

    const res = await GET(new Request("http://x"), { params: { id: "q1" } });
    expect(res.status).toBe(503);
    expect(await res.text()).toMatch(/couldn't load your business profile/i);
    expect(renderToBuffer).not.toHaveBeenCalled();
  });

  it("renders when the business is real", async () => {
    getQuote.mockResolvedValue(QUOTE);
    getClients.mockResolvedValue([]);
    getBusiness.mockResolvedValue(REAL_BUSINESS);
    getLogoBytes.mockResolvedValue(null);

    const res = await GET(new Request("http://x"), { params: { id: "q1" } });
    expect(res.status).toBe(200);
    expect(renderToBuffer).toHaveBeenCalledTimes(1);
  });
});
