import { describe, expect, it } from "vitest";
import { IdentityThrottlerGuard } from "./identity-throttler.guard.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * getTracker is `protected`, so reach it through a narrow cast rather than
 * standing up the whole guard with its storage/reflector dependencies — the
 * key-selection logic is the entire point of this subclass and needs no
 * throttler machinery to exercise.
 */
function track(req: Record<string, unknown>): Promise<string> {
  const guard = Object.create(IdentityThrottlerGuard.prototype) as any;
  return guard.getTracker(req);
}

describe("IdentityThrottlerGuard.getTracker", () => {
  it("keys by authenticated user id when one is present", async () => {
    await expect(track({ user: { sub: "user-1" }, ip: "10.0.0.1" })).resolves.toBe("user:user-1");
  });

  /**
   * The bug this guard exists for. Every request from the web app arrives from
   * Vercel, so two different signed-in contractors share a source address. If
   * they shared a rate-limit bucket too, the global 120/min would be a cap on
   * the platform rather than on a person.
   */
  it("gives two users on the SAME ip separate buckets", async () => {
    const a = await track({ user: { sub: "user-1" }, ip: "76.76.21.21" });
    const b = await track({ user: { sub: "user-2" }, ip: "76.76.21.21" });
    expect(a).not.toBe(b);
  });

  /** And the converse: one user must not escape their bucket by appearing to
   * come from somewhere else. */
  it("gives one user on two ips the SAME bucket", async () => {
    const a = await track({ user: { sub: "user-1" }, ip: "1.1.1.1" });
    const b = await track({ user: { sub: "user-1" }, ip: "2.2.2.2" });
    expect(a).toBe(b);
  });

  it("falls back to the body email when unauthenticated", async () => {
    await expect(track({ body: { email: "owner@blackwood.jm" }, ip: "10.0.0.1" })).resolves.toBe(
      "email:owner@blackwood.jm",
    );
  });

  /**
   * Login attempts against one account must share a bucket however the address
   * is typed, or an attacker alternates capitalization for a fresh allowance
   * each time. Matches AuthService.login's own normalization.
   */
  it("normalizes the email so case and padding cannot buy a second bucket", async () => {
    const plain = await track({ body: { email: "owner@blackwood.jm" } });
    for (const variant of ["  owner@blackwood.jm  ", "Owner@Blackwood.JM", "OWNER@BLACKWOOD.JM"]) {
      await expect(track({ body: { email: variant } })).resolves.toBe(plain);
    }
  });

  it("prefers the authenticated user over an email in the body", async () => {
    // Otherwise a signed-in caller could post someone else's address to a
    // route that takes one and be metered as them.
    await expect(track({ user: { sub: "user-1" }, body: { email: "victim@x.jm" } })).resolves.toBe(
      "user:user-1",
    );
  });

  it("falls back to ip when there is neither a user nor an email", async () => {
    // reset-password is the real case: an opaque token and nothing else.
    await expect(track({ body: { token: "abc" }, ip: "10.0.0.1" })).resolves.toBe("ip:10.0.0.1");
  });

  it("never returns an empty or partial key for odd input", async () => {
    // A blank tracker would merge unrelated callers into one bucket.
    for (const req of [
      {},
      { ip: "10.0.0.1" },
      { user: {}, ip: "10.0.0.1" },
      { user: { sub: "" }, ip: "10.0.0.1" },
      { body: { email: "" }, ip: "10.0.0.1" },
      { body: { email: "   " }, ip: "10.0.0.1" },
      { user: { sub: 42 }, body: { email: 7 }, ip: "10.0.0.1" },
    ]) {
      const key = await track(req);
      expect(key).toMatch(/^(user|email|ip):.+$/);
    }
  });
});
