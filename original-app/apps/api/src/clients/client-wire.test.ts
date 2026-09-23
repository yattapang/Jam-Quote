import { describe, expect, it } from "vitest";
import { clientWire } from "@jamquote/core";
import type { ClientWithName } from "./clients.service.js";

/**
 * Seam 1 in `CONTRACTS.md`: the API keeps the promise the web is typed against.
 *
 * `apps/web` no longer declares the client shape — its `ApiClientRow` is
 * `z.infer<typeof clientWire>`. So the web cannot read a field the contract
 * does not promise. This test is the other half: the API cannot stop PROVIDING
 * one.
 *
 * ## Coupled twice, on purpose
 *
 * - **TypeScript** checks `sample` against `ClientWithName`, the service's real
 *   return type, which is `Prisma.Client & { name: string }`. Rename or remove a
 *   column in `schema.prisma` and this file stops compiling.
 * - **Zod** checks that same value against the contract. Stop sending a field
 *   the web relies on and the parse fails, naming it.
 *
 * Either alone proves little. A rename would satisfy Zod if the sample were
 * untyped, and would satisfy TypeScript if the contract were not checked. It
 * cannot satisfy both.
 *
 * ## Why a hand-built sample rather than a live call
 *
 * A live call needs a database and proves only that TODAY's row happens to fit.
 * A typed literal is checked by the compiler against the schema Prisma
 * generates, which is the actual source of the shape — and it costs no
 * infrastructure, so it runs on every commit rather than in a nightly job.
 */

/**
 * Every column the service returns, with the values that make the interesting
 * cases real: a client with no contact details at all, which is the common case
 * for a household.
 */
const sample: ClientWithName = {
  id: "cl_1",
  businessId: "biz_1",
  firstName: "Marcia",
  lastName: "Brown",
  name: "Marcia Brown",
  phone: null,
  whatsapp: null,
  email: null,
  addressLine: null,
  town: null,
  parish: null,
  notes: null,
  trn: null,
  createdAt: new Date("2026-01-05T00:00:00.000Z"),
  updatedAt: new Date("2026-01-05T00:00:00.000Z"),
  deletedAt: null,
};

/** What the browser actually receives: Dates become ISO strings, and anything
 * non-serializable would vanish here rather than in production. */
function overTheWire<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

describe("the client wire contract", () => {
  it("is satisfied by what the service returns", () => {
    const parsed = clientWire.parse(overTheWire(sample));
    expect(parsed.id).toBe("cl_1");
    expect(parsed.trn).toBeNull();
  });

  it("is satisfied by a fully populated client too", () => {
    const populated: ClientWithName = {
      ...sample,
      phone: "8765550100",
      whatsapp: "8765550100",
      email: "marcia@example.com",
      addressLine: "12 Hope Road",
      town: "Kingston",
      parish: "Kingston",
      notes: "Gate code 4412",
      trn: "102458963",
    };
    expect(() => clientWire.parse(overTheWire(populated))).not.toThrow();
  });

  it("REJECTS a response that stops sending a promised field", () => {
    // The whole point. Without this assertion the contract could be satisfied
    // by anything and the test would pass while the web rendered `undefined`.
    const { trn: _dropped, ...withoutTrn } = sample;
    expect(() => clientWire.parse(overTheWire(withoutTrn))).toThrow(/trn/);
  });

  it("REJECTS a field whose type changed", () => {
    // The case a hand-written interface was least likely to notice: an id that
    // becomes a number, or a nullable string that starts arriving as 0.
    expect(() => clientWire.parse({ ...overTheWire(sample), id: 7 })).toThrow(/id/);
  });

  it("tolerates fields the web does not read", () => {
    // The contract is a FLOOR, not a mirror. Adding a column must not break the
    // browser, because the browser cannot be broken by data it never reads -
    // and requiring a schema edit for every new column would make the contract
    // something people route around.
    const withExtra = { ...overTheWire(sample), loyaltyPoints: 12 };
    expect(() => clientWire.parse(withExtra)).not.toThrow();
  });
});
