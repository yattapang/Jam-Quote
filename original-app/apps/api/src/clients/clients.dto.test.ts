import { describe, expect, it } from "vitest";
import { resolveClientName, updateClientSchema } from "./clients.dto.js";

/**
 * `resolveClientName` decides what a PATCH writes to firstName/lastName, and
 * `ClientsService.update` spreads its result with `!== undefined` guards — so a
 * key this function omits is a field the update does not touch, silently, with a
 * 200 back to the caller. Anything the DTO ACCEPTS must therefore come out of
 * here as a decision, not as an omission.
 */
describe("resolveClientName — every lastName the DTO accepts is honoured", () => {
  it("returns an empty object only when the name is not mentioned at all", () => {
    expect(resolveClientName({})).toEqual({});
    expect(resolveClientName({ phone: "876" } as never)).toEqual({});
  });

  it("MEDIUM: a surname-only rename stores the surname", () => {
    // `api-client.ts`'s UpdateClientInput sends exactly `{ lastName }` for an edit
    // that touches only the surname. It used to fall through every branch to `{}`,
    // so the rename was discarded and answered 200.
    expect(updateClientSchema.safeParse({ lastName: "Brown" }).success).toBe(true);
    expect(resolveClientName({ lastName: "Brown" })).toEqual({ lastName: "Brown" });
  });

  it("MEDIUM: an empty or whitespace-only surname clears it, as null does", () => {
    expect(updateClientSchema.safeParse({ lastName: "" }).success).toBe(true);
    expect(updateClientSchema.safeParse({ lastName: "   " }).success).toBe(true);
    expect(resolveClientName({ lastName: "" })).toEqual({ lastName: "" });
    expect(resolveClientName({ lastName: "   " })).toEqual({ lastName: "" });
  });

  it("an explicit null clears the surname without touching firstName", () => {
    expect(resolveClientName({ lastName: null })).toEqual({ lastName: "" });
  });

  it("a firstName present sets both, clearing an unmentioned surname", () => {
    expect(resolveClientName({ firstName: "Errol" })).toEqual({ firstName: "Errol", lastName: "" });
    expect(resolveClientName({ firstName: "Errol", lastName: "Brown" })).toEqual({
      firstName: "Errol",
      lastName: "Brown",
    });
    expect(resolveClientName({ firstName: "Errol", lastName: "  " })).toEqual({
      firstName: "Errol",
      lastName: "",
    });
  });

  it("the legacy single `name` splits on the first space and wins over lastName", () => {
    expect(resolveClientName({ name: "Errol Brown" })).toEqual({
      firstName: "Errol",
      lastName: "Brown",
    });
    expect(resolveClientName({ name: "  Errol   Da  Silva " })).toEqual({
      firstName: "Errol",
      lastName: "Da Silva",
    });
    expect(resolveClientName({ name: "Errol" })).toEqual({ firstName: "Errol", lastName: "" });
  });
});
