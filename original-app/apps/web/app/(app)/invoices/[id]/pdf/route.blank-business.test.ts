import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Covers "a PDF or email can go out with no business name" for the invoice
 * PDF download route.
 */

const renderToBuffer = vi.fn().mockResolvedValue(Buffer.from("pdf"));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: (...a: unknown[]) => renderToBuffer(...a) }));
vi.mock("@/lib/pdf/InvoicePdf", () => ({ default: vi.fn() }));

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

import { GET } from "./route";

const INVOICE = { id: "i1", clientId: "c1", num: "I-0001" };
const REAL_BUSINESS = { id: "b1", name: "Bell & Sons" };
const BLANK_BUSINESS = { id: "", name: "" };

afterEach(() => vi.clearAllMocks());

describe("GET /invoices/:id/pdf — blank business guard", () => {
  it("refuses with 503 and renders no PDF when the business name is blank", async () => {
    getInvoice.mockResolvedValue(INVOICE);
    getClients.mockResolvedValue([]);
    getBusiness.mockResolvedValue(BLANK_BUSINESS);
    getLogoBytes.mockResolvedValue(null);

    const res = await GET(new Request("http://x"), { params: { id: "i1" } });
    expect(res.status).toBe(503);
    expect(await res.text()).toMatch(/couldn't load your business profile/i);
    expect(renderToBuffer).not.toHaveBeenCalled();
  });

  it("renders when the business is real", async () => {
    getInvoice.mockResolvedValue(INVOICE);
    getClients.mockResolvedValue([]);
    getBusiness.mockResolvedValue(REAL_BUSINESS);
    getLogoBytes.mockResolvedValue(null);

    const res = await GET(new Request("http://x"), { params: { id: "i1" } });
    expect(res.status).toBe(200);
    expect(renderToBuffer).toHaveBeenCalledTimes(1);
  });
});
