import { describe, expect, it } from "vitest";
import { Prisma, type Project } from "@prisma/client";
import { projectWire } from "@jamquote/core";

/**
 * Seam 1 in `CONTRACTS.md`, for the project row. Same double coupling as
 * `client-wire.test.ts` — TypeScript against Prisma's generated `Project`, Zod
 * against what the web is typed to read.
 *
 * The interesting case here is `retentionPct`, a nullable `Decimal`. The
 * interface this replaces hedged it three ways at once
 * (`?: number | string | null`), so these tests pin down what actually arrives.
 */

const sample: Project = {
  id: "pr_1",
  businessId: "biz_1",
  clientId: "cl_1",
  name: "Retaining wall, Hope Road",
  addressLine: null,
  town: null,
  parish: null,
  stage: "QUOTED",
  progressPct: 0,
  retentionPct: null,
  createdAt: new Date("2026-01-05T00:00:00.000Z"),
  updatedAt: new Date("2026-01-05T00:00:00.000Z"),
  deletedAt: null,
};

function overTheWire<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

describe("the project wire contract", () => {
  it("is satisfied by a project with no retention agreed", () => {
    const parsed = projectWire.parse(overTheWire(sample));
    expect(parsed.retentionPct).toBeNull();
  });

  it("is satisfied by one with retention, as a STRING", () => {
    const withRetention: Project = { ...sample, retentionPct: new Prisma.Decimal("10.00") };
    const parsed = projectWire.parse(overTheWire(withRetention));
    // "10", not "10.00" and not 10 - trailing zeros go, and a Decimal is never
    // a number on the wire.
    expect(parsed.retentionPct).toBe("10");
  });

  it("keeps null and zero DISTINCT", () => {
    // A contractor who typed 0 and one who typed nothing are saying different
    // things: "no retention on this contract" versus "not agreed". The form
    // keeps them apart deliberately, so the contract must not collapse them.
    const zero: Project = { ...sample, retentionPct: new Prisma.Decimal("0") };
    expect(projectWire.parse(overTheWire(zero)).retentionPct).toBe("0");
    expect(projectWire.parse(overTheWire(sample)).retentionPct).toBeNull();
  });

  it("accepts every stage the enum defines, including ENQUIRY", () => {
    // ENQUIRY was added after this shape was first written. A hand-maintained
    // union would have needed remembering; deriving from the enum does not.
    for (const stage of ["ENQUIRY", "QUOTED", "WON", "IN_PROGRESS", "COMPLETE", "CANCELLED"] as const) {
      expect(() => projectWire.parse(overTheWire({ ...sample, stage }))).not.toThrow();
    }
  });

  it("REJECTS a stage that is not in the enum", () => {
    expect(() => projectWire.parse({ ...overTheWire(sample), stage: "PENDING" })).toThrow(/stage/);
  });

  it("REJECTS progressPct arriving as a string", () => {
    // An Int column, so a real number. If this ever fails, something has
    // started routing it through a Decimal and every progress bar is affected.
    expect(() => projectWire.parse({ ...overTheWire(sample), progressPct: "40" })).toThrow(
      /progressPct/,
    );
  });

  it("REJECTS a response missing a promised field", () => {
    const { name: _dropped, ...without } = overTheWire(sample);
    expect(() => projectWire.parse(without)).toThrow(/name/);
  });
});
