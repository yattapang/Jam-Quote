import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WiPayService } from "./wipay.service.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Minimal ConfigService stand-in backed by a plain record. */
function makeConfig(values: Record<string, string> = {}) {
  return { get: (key: string) => values[key] } as any;
}

/** The hash WiPay sends: md5(transaction_id + total + apiKey). */
function signature(transactionId: string, total: string, apiKey: string): string {
  return createHash("md5").update(`${transactionId}${total}${apiKey}`).digest("hex");
}

describe("WiPayService.verifyCallback", () => {
  const tx = "wipay-tx-1";
  const total = "1000.00";

  it("accepts a callback hashed with the configured API key", () => {
    const svc = new WiPayService(makeConfig({ WIPAY_API_KEY: "secret-key" }));

    expect(
      svc.verifyCallback({
        transaction_id: tx,
        total,
        hash: signature(tx, total, "secret-key"),
      }),
    ).toBe(true);
  });

  it("rejects a callback whose hash was computed with a different key", () => {
    const svc = new WiPayService(makeConfig({ WIPAY_API_KEY: "secret-key" }));

    expect(
      svc.verifyCallback({
        transaction_id: tx,
        total,
        hash: signature(tx, total, "attacker-guess"),
      }),
    ).toBe(false);
  });

  // The important one. The API key is the only secret in the recipe, so an
  // unset key made the expected hash md5(transaction_id + total) — something
  // anyone can compute. Verification has to fail CLOSED when unconfigured,
  // otherwise a forged callback could mark invoices paid.
  it("rejects everything when WIPAY_API_KEY is unset, including a correctly-empty-key hash", () => {
    const svc = new WiPayService(makeConfig({}));

    expect(
      svc.verifyCallback({
        transaction_id: tx,
        total,
        hash: signature(tx, total, ""),
      }),
    ).toBe(false);
  });

  it("rejects a payload missing transaction_id, total or hash", () => {
    const svc = new WiPayService(makeConfig({ WIPAY_API_KEY: "secret-key" }));

    expect(svc.verifyCallback({ total, hash: "x" })).toBe(false);
    expect(svc.verifyCallback({ transaction_id: tx, hash: "x" })).toBe(false);
    expect(svc.verifyCallback({ transaction_id: tx, total })).toBe(false);
  });
});

describe("WiPayService construction", () => {
  it("refuses to boot in the live environment without an API key", () => {
    expect(() => new WiPayService(makeConfig({ WIPAY_ENVIRONMENT: "live" }))).toThrow(
      /WIPAY_API_KEY/,
    );
  });

  it("boots in the live environment once the key is present", () => {
    expect(
      () => new WiPayService(makeConfig({ WIPAY_ENVIRONMENT: "live", WIPAY_API_KEY: "k" })),
    ).not.toThrow();
  });

  it("boots without credentials in sandbox so local dev needs no WiPay setup", () => {
    expect(() => new WiPayService(makeConfig({}))).not.toThrow();
  });
});
