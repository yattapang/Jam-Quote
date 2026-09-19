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

  it("returns 404 for a draft invoice's token, same as an unknown token — even when the business DOES have a logo", async () => {
    // The business here HAS a logo (unlike the fixture below), so this proves
    // the DRAFT check itself refuses the token — not the controller's
    // separate "no logo" branch, which would 404 anyway and let a deleted
    // DRAFT guard pass unnoticed.
    const { controller, res } = build(
      { businessId: "biz_1", status: InvoiceStatus.DRAFT },
      { bytes: Buffer.from("PNGDATA"), contentType: "image/png" },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(controller.logo("tok_draft", res as any)).rejects.toThrow(NotFoundException);
  });

  it("returns 404 when the token is valid but the business has no logo", async () => {
    const { controller, res } = build({ businessId: "biz_1", status: InvoiceStatus.INVOICED }, null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(controller.logo("tok_valid", res as any)).rejects.toThrow(NotFoundException);
  });

  it("uses the identical not-found message for an unknown token, a draft invoice's token, and a valid token with no logo (item 6)", async () => {
    const unknown = build(null, null);
    // Given a logo, same reasoning as the test above: without it, this case
    // would pass on the controller's "no logo" 404 alone even if the DRAFT
    // check in resolveBusinessIdByShareToken were deleted.
    const draft = build({ businessId: "biz_1", status: InvoiceStatus.DRAFT }, { bytes: Buffer.from("PNGDATA"), contentType: "image/png" });
    const noLogo = build({ businessId: "biz_1", status: InvoiceStatus.INVOICED }, null);

    async function messageOf(target: ReturnType<typeof build>, token: string): Promise<string> {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await target.controller.logo(token, target.res as any);
      } catch (e) {
        return (e as NotFoundException).message;
      }
      throw new Error("expected logo() to throw");
    }

    const unknownMessage = await messageOf(unknown, "tok_wrong");
    const draftMessage = await messageOf(draft, "tok_draft");
    const noLogoMessage = await messageOf(noLogo, "tok_valid");

    expect(unknownMessage).not.toBe("");
    expect(draftMessage).toBe(unknownMessage);
    expect(noLogoMessage).toBe(unknownMessage);
  });
});
