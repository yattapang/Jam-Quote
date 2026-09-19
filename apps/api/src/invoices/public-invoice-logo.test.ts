import { NotFoundException } from "@nestjs/common";
import { InvoiceStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoicesService } from "./invoices.service.js";
import { PublicInvoicesController } from "./public-invoices.controller.js";

/**
 * The public invoice logo route — the twin of public-quote-logo.test.ts.
 * Reachable only with a valid, non-draft invoice share token.
 */

function build(invoiceRow: unknown, logoRow: unknown) {
  const prisma = { invoice: { findFirst: vi.fn().mockResolvedValue(invoiceRow) } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices = new InvoicesService(prisma as any, {} as any);
  const business = { getLogo: vi.fn().mockResolvedValue(logoRow) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controller = new PublicInvoicesController(invoices, business as any);
  const res = {
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    ended: undefined as Buffer | undefined,
    end(buf: Buffer) {
      this.ended = buf;
    },
  };
  return { controller, res, business };
}

describe("PublicInvoicesController.logo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves the businessId behind a valid share token and serves that business's logo", async () => {
    const { controller, res, business } = build(
      { businessId: "biz_1", status: InvoiceStatus.INVOICED },
      { bytes: Buffer.from("PNGDATA"), contentType: "image/png" },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await controller.logo("tok_valid", res as any);
    expect(business.getLogo).toHaveBeenCalledWith("biz_1");
    expect(res.headers["Content-Type"]).toBe("image/png");
    expect(res.headers["X-Content-Type-Options"]).toBe("nosniff");
    // private, not public: a shared/CDN cache must not keep serving a
    // revoked link's logo after the contractor revokes it (item 5).
    expect(res.headers["Cache-Control"]).toBe("private, max-age=300");
    expect(res.ended?.toString()).toBe("PNGDATA");
  });

  it("returns 404 for an unknown token", async () => {
    const { controller, res } = build(null, null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(controller.logo("tok_wrong", res as any)).rejects.toThrow(NotFoundException);
  });

  it("returns 404 for a draft invoice's token, same as an unknown token", async () => {
    const { controller, res } = build({ businessId: "biz_1", status: InvoiceStatus.DRAFT }, null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(controller.logo("tok_draft", res as any)).rejects.toThrow(NotFoundException);
  });

  it("returns 404 when the token is valid but the business has no logo", async () => {
    const { controller, res } = build({ businessId: "biz_1", status: InvoiceStatus.INVOICED }, null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(controller.logo("tok_valid", res as any)).rejects.toThrow(NotFoundException);
  });

  it("uses the identical not-found message for an unknown token and a valid token with no logo (item 6)", async () => {
    const unknown = build(null, null);
    const noLogo = build({ businessId: "biz_1", status: InvoiceStatus.INVOICED }, null);
    let unknownMessage = "";
    let noLogoMessage = "";
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await unknown.controller.logo("tok_wrong", unknown.res as any);
    } catch (e) {
      unknownMessage = (e as NotFoundException).message;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await noLogo.controller.logo("tok_valid", noLogo.res as any);
    } catch (e) {
      noLogoMessage = (e as NotFoundException).message;
    }
    expect(unknownMessage).not.toBe("");
    expect(noLogoMessage).toBe(unknownMessage);
  });
});
