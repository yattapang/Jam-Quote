import { describe, expect, it } from "vitest";
import { softLoad } from "./soft-load";

class FakeApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

describe("softLoad", () => {
  it("wraps a resolved value", async () => {
    await expect(softLoad(Promise.resolve([1]))).resolves.toEqual({ ok: true, value: [1] });
  });

  it("turns an ordinary data failure (an ApiError, e.g. a 500) into { ok: false } so a side widget can say it couldn't load", async () => {
    await expect(softLoad(Promise.reject(new FakeApiError("500")))).resolves.toEqual({ ok: false });
  });

  it("never swallows Next's redirect / notFound control flow (auth redirects must still happen)", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login?expired=1;307;" });
    await expect(softLoad(Promise.reject(redirect))).rejects.toBe(redirect);
    const nf = Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
    await expect(softLoad(Promise.reject(nf))).rejects.toBe(nf);
  });

  // The executed defect: softLoad used to catch ANY non-control-flow error,
  // so a real bug in a mapper (a TypeError reading a property off undefined)
  // was silently turned into "couldn't load" forever, with only a
  // console.warn — nobody would ever find out the widget was broken by code,
  // not by the network.
  it("rethrows a programming error (a TypeError from a mapper bug), it does not absorb it", async () => {
    const bug = new TypeError("Cannot read properties of undefined (reading 'label')");
    await expect(softLoad(Promise.reject(bug))).rejects.toBe(bug);
  });

  it("absorbs an ApiError (a non-2xx response from serverRequest)", async () => {
    const apiErr = new FakeApiError("Request failed", 500);
    await expect(softLoad(Promise.reject(apiErr))).resolves.toEqual({ ok: false });
  });

  it("absorbs a network failure the way Node's fetch actually throws it (TypeError: fetch failed)", async () => {
    const networkErr = Object.assign(new TypeError("fetch failed"), {
      cause: new Error("connect ECONNREFUSED 127.0.0.1:3001"),
    });
    await expect(softLoad(Promise.reject(networkErr))).resolves.toEqual({ ok: false });
  });
});
