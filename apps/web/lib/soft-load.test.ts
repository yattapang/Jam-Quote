import { describe, expect, it } from "vitest";
import { softLoad } from "./soft-load";

describe("softLoad", () => {
  it("wraps a resolved value", async () => {
    await expect(softLoad(Promise.resolve([1]))).resolves.toEqual({ ok: true, value: [1] });
  });

  it("turns an ordinary failure into { ok: false } so a side widget can say it couldn't load", async () => {
    await expect(softLoad(Promise.reject(new Error("500")))).resolves.toEqual({ ok: false });
  });

  it("never swallows Next's redirect / notFound control flow (auth redirects must still happen)", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login?expired=1;307;" });
    await expect(softLoad(Promise.reject(redirect))).rejects.toBe(redirect);
    const nf = Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
    await expect(softLoad(Promise.reject(nf))).rejects.toBe(nf);
  });
});
