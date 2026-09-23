import { describe, expect, it } from "vitest";
import { scrypt as scryptCb, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { SignInService, type SignInLog } from "./sign-in.js";
import { verifyPassword, needsRehash } from "./password.js";
import type { RateLimiter, RateLimitDecision } from "../rate-limit/rate-limiter.js";

const scrypt = promisify(scryptCb) as any;

async function legacyHash(pw: string): Promise<string> {
  const N = 16384, r = 8, p = 1;
  const salt = randomBytes(16);
  const h: Buffer = await scrypt(pw, salt, 32, { N, r, p, maxmem: 96 * 1024 * 1024 });
  return ["scrypt", N, r, p, salt.toString("base64"), h.toString("base64")].join("$");
}

const okLimiter: RateLimiter = {
  async consume(): Promise<RateLimitDecision> { return { allowed: true, tokensLeft: 9 }; },
  async reset() {},
};

describe("PROBE", () => {
  it("F: a legacy hash with a short password blows up the rehash path", async () => {
    const pw = "short8pw";           // 8 chars: legal in the old app, illegal now
    const stored = await legacyHash(pw);
    expect(await verifyPassword(pw, stored)).toBe(true);
    expect(needsRehash(stored)).toBe(true);

    const db = {
      async $transaction(fn: any) { return fn(db); },
      async $queryRawUnsafe(sql: string) {
        if (sql.includes("app_credential")) {
          return [{ user_id: "u1", tenant_id: "11111111-1111-4111-8111-111111111111", password_hash: stored }];
        }
        return [{ session_version: 0, deactivated: false, tenant_suspended: false }];
      },
      async $executeRawUnsafe() { return 1; },
    } as any;
    const log: SignInLog = { failed() {} };
    const svc = new SignInService(db, log, okLimiter);
    let caught: unknown = null;
    try {
      const r = await svc.signIn("a@b.com", pw, { ip: "1.2.3.4" });
      console.info("RESULT", JSON.stringify(r));
    } catch (e) { caught = e; }
    console.info("THREW:", (caught as any)?.name, (caught as any)?.message);
    expect(caught).toBeNull();
  });

  it("G: base64 leniency - two different stored strings accept the same password", async () => {
    const parts = (await legacyHash("averylongpassword")).split("$");
    const mangled = [parts[0], parts[1], parts[2], parts[3], parts[4] + "!!!", parts[5]].join("$");
    console.info("mangled salt accepted:", await verifyPassword("averylongpassword", mangled));
  });

  it("H: unicode normalisation - same typed password, two encodings", async () => {
    const composed = "pässwordlongenough";          // NFC
    const decomposed = composed.normalize("NFD");
    console.info("NFC len", composed.length, "NFD len", decomposed.length);
    const { hashPassword } = await import("./password.js");
    const h = await hashPassword(composed);
    console.info("NFD verifies against NFC hash:", await verifyPassword(decomposed, h));
  });
});
