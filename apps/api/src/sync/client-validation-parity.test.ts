import { describe, expect, it } from "vitest";
import { PARISHES } from "@jamquote/core";
import { createClientSchema } from "../clients/clients.dto.js";
import { pushSchema } from "./sync.dto.js";

/**
 * There are TWO doors into the `Client` table. They must agree about what a
 * valid value is.
 *
 * `POST /clients` is the web app's door. `POST /sync` is the mobile app's. Until
 * 2026-09-08 they disagreed: the REST path required `email` to be a real email
 * and `parish` to be one of the fourteen, while sync accepted **any string** for
 * both. A device could therefore write `"not-an-email"` and a parish that does
 * not exist into the columns the other door guards — and then "Send by email"
 * tries to send to it, the accountant export carries it, and a jurisdiction
 * lookup keyed on parish finds nothing.
 *
 * The value rules now live once, in `clientFieldRules`, and each path adds its
 * own presence rule. That makes divergence structurally impossible; this test
 * states the intent so that the next person to add a field to one door knows the
 * other exists.
 *
 * ## The presence rules differ ON PURPOSE
 *
 * REST uses `.optional()` — absent means "leave this alone".
 * Sync uses `.nullish()` — null means "the device cleared it", which is a change
 * to replicate rather than an omission. So these tests compare what each path
 * accepts as a VALUE, never whether the key may be missing.
 */

/**
 * A push envelope carrying one client upsert, which is what sync validates.
 *
 * The shape matters, and getting it wrong made the first version of this file
 * VACUOUS: `pushSchema` is `{ clients: [], projects: [] }` with both arrays
 * defaulted, so an invented `changes` key was ignored as an unknown property and
 * the envelope parsed clean. The bad email "passed" because nothing had looked
 * at it. Only the assertion that it should be REJECTED exposed that.
 */
function push(data: Record<string, unknown>) {
  return {
    clients: [
      {
        id: "6f1c8a54-3b7e-4a2f-9c11-2d5e8f0a7b31",
        op: "upsert",
        updatedAt: "2026-09-08T00:00:00.000Z",
        data,
      },
    ],
    projects: [],
  };
}

const validClient = {
  firstName: "Marcia",
  lastName: "Brown",
  email: "marcia@example.com",
  parish: "Kingston",
};

describe("both doors into Client accept the same valid record", () => {
  it("REST accepts it", () => {
    expect(createClientSchema.safeParse(validClient).success).toBe(true);
  });

  it("sync accepts it", () => {
    expect(pushSchema.safeParse(push(validClient)).success).toBe(true);
  });
});

describe("both doors reject an invalid email", () => {
  const bad = { ...validClient, email: "not-an-email" };

  it("REST rejects it", () => {
    expect(createClientSchema.safeParse(bad).success).toBe(false);
  });

  it("sync rejects it too — it used to accept it", () => {
    // The defect, as a test. Before the value rules were shared, this passed
    // and planted a non-address in the column the web app guards.
    expect(pushSchema.safeParse(push(bad)).success).toBe(false);
  });
});

describe("both doors reject a parish that does not exist", () => {
  const bad = { ...validClient, parish: "St. Nowhere" };

  it("REST rejects it", () => {
    expect(createClientSchema.safeParse(bad).success).toBe(false);
  });

  it("sync rejects it too — it used to accept it", () => {
    // A parish is not free text: it keys the jurisdiction rule-pack, and an
    // invented one silently matches nothing.
    expect(pushSchema.safeParse(push(bad)).success).toBe(false);
  });
});

describe("both doors agree on every parish that DOES exist", () => {
  it.each(PARISHES)("%s", (parish) => {
    // Derived from the enum rather than a hand-listed sample, so adding a
    // parish cannot leave one door untested.
    expect(createClientSchema.safeParse({ ...validClient, parish }).success).toBe(true);
    expect(pushSchema.safeParse(push({ ...validClient, parish })).success).toBe(true);
  });
});

describe("the presence rules differ, deliberately", () => {
  it("sync accepts an explicit null, because that is a device clearing a field", () => {
    expect(pushSchema.safeParse(push({ ...validClient, notes: null })).success).toBe(true);
  });

  it("REST accepts the field being absent, which means leave it alone", () => {
    const { email: _omitted, ...withoutEmail } = validClient;
    expect(createClientSchema.safeParse(withoutEmail).success).toBe(true);
  });
});
