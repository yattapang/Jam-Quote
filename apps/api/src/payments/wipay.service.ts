import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";

/**
 * WiPay hosted-checkout integration.
 *
 * Flow (keeps us out of heavy PCI scope — we never see raw card data):
 *   1. createPaymentRequest() posts the transaction to WiPay and gets back a
 *      hosted payment URL.
 *   2. We redirect the client's browser to that URL; they enter card details on
 *      WiPay's PCI-compliant page.
 *   3. WiPay redirects/callbacks to WIPAY_CALLBACK_URL with the result.
 *   4. verifyCallback() validates the returned hash before we trust it.
 *
 * NOTE: exact field names and the hash recipe must be confirmed against the
 * current WiPay JM API docs for the account's region before going live. The
 * structure below matches WiPay's "Request A Payment" plugin shape.
 */
@Injectable()
export class WiPayService {
  private readonly logger = new Logger(WiPayService.name);

  constructor(private readonly config: ConfigService) {
    // Fail fast rather than run a live payment integration that cannot verify
    // its own callbacks (see verifyCallback). Mirrors auth.module.ts, which
    // refuses to boot in production without a JWT secret. Sandbox is left
    // permissive so local/dev boots without WiPay credentials.
    if (this.env.environment === "live" && !this.env.apiKey) {
      throw new Error(
        "WIPAY_ENVIRONMENT=live requires WIPAY_API_KEY — callback hashes cannot be verified without it.",
      );
    }
  }

  private get env() {
    return {
      accountNumber: this.config.get<string>("WIPAY_ACCOUNT_NUMBER") ?? "",
      apiKey: this.config.get<string>("WIPAY_API_KEY") ?? "",
      environment: this.config.get<string>("WIPAY_ENVIRONMENT") ?? "sandbox",
      countryCode: this.config.get<string>("WIPAY_COUNTRY_CODE") ?? "JM",
      currency: this.config.get<string>("WIPAY_CURRENCY") ?? "JMD",
      callbackUrl: this.config.get<string>("WIPAY_CALLBACK_URL") ?? "",
      baseUrl:
        this.config.get<string>("WIPAY_ENVIRONMENT") === "live"
          ? "https://jm.wipayfinancial.com"
          : "https://jm.wipaycaribbean.com",
    };
  }

  /**
   * Create a hosted payment request. Amount is JMD cents; WiPay expects a
   * decimal string in major units.
   */
  async createPaymentRequest(params: {
    // Our invoice UUID — must be globally unique, since the callback resolves
    // the invoice from whatever is sent here. Never pass invoice.number.
    orderId: string;
    amountCents: number;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
  }): Promise<{ paymentUrl: string; providerRef?: string }> {
    const e = this.env;
    const total = (params.amountCents / 100).toFixed(2);

    const body = new URLSearchParams({
      account_number: e.accountNumber,
      country_code: e.countryCode,
      currency: e.currency,
      environment: e.environment,
      total,
      order_id: params.orderId,
      method: "credit_card",
      fee_structure: "customer_pay",
      response_url: e.callbackUrl,
      // Optional customer context WiPay echoes back:
      ...(params.customerName ? { name: params.customerName } : {}),
      ...(params.customerEmail ? { email: params.customerEmail } : {}),
    });

    const res = await fetch(`${e.baseUrl}/plugins/payments/request`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${e.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      this.logger.error(`WiPay request failed: ${res.status} ${text}`);
      throw new Error("Unable to start card payment. Please try again.");
    }

    const data = (await res.json()) as {
      url?: string;
      transaction_id?: string;
      message?: string;
    };
    if (!data.url) {
      this.logger.error(`WiPay response missing url: ${JSON.stringify(data)}`);
      throw new Error("Payment provider did not return a checkout link.");
    }
    return { paymentUrl: data.url, providerRef: data.transaction_id };
  }

  /**
   * Validate a WiPay callback. WiPay returns a `hash` computed from
   * transaction_id + total + API key. We recompute and compare in constant
   * time. Reject anything that doesn't match — never mark an invoice paid on an
   * unverified callback.
   *
   * The API key is the ONLY secret in that recipe, so an unset WIPAY_API_KEY
   * would make the expected hash md5(transaction_id + total) — a value anyone
   * can compute, letting a forged callback mark invoices paid. Missing config
   * must therefore fail CLOSED, not fall back to hashing with an empty key.
   */
  verifyCallback(payload: Record<string, string>): boolean {
    if (!this.env.apiKey) {
      this.logger.error(
        "WIPAY_API_KEY is not configured — rejecting callback. Without it the " +
          "expected hash is publicly computable and cannot authenticate anything.",
      );
      return false;
    }
    const { transaction_id, total, hash } = payload;
    if (!transaction_id || !total || !hash) return false;
    const expected = createHash("md5")
      .update(`${transaction_id}${total}${this.env.apiKey}`)
      .digest("hex");
    return timingSafeEqualHex(expected, hash);
  }

  isSuccessful(payload: Record<string, string>): boolean {
    return (payload.status ?? "").toLowerCase() === "success";
  }
}

/** Constant-time compare of two hex strings. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
