import { describe, expect, it } from "vitest";
import { JobComponentKind } from "@jamquote/core";
import { assemblyComponentInputSchema, createJobSchema } from "./jobs.dto.js";

function baseComponent(over: Partial<Record<string, unknown>> = {}) {
  return {
    kind: JobComponentKind.OTHER,
    description: "Transport",
    quantityPerUnit: 1,
    unitPriceCents: 1000,
    ...over,
  };
}

describe("assemblyComponentInputSchema — unitPriceCents", () => {
  it("P1: rejects a value beyond the Postgres Int column's range with a field-named message", () => {
    // JobComponent.unitPriceCents is `Int` in schema.prisma — a value like
    // 3,000,000,000 used to pass `.int().nonnegative()` here and only fail
    // at the database as an unhandled 500.
    const result = assemblyComponentInputSchema.safeParse(
      baseComponent({ unitPriceCents: 3_000_000_000 }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("unitPriceCents");
    }
  });

  it("accepts the Postgres Int max itself", () => {
    const result = assemblyComponentInputSchema.safeParse(
      baseComponent({ unitPriceCents: 2_147_483_647 }),
    );
    expect(result.success).toBe(true);
  });

  it("still rejects a negative price", () => {
    expect(assemblyComponentInputSchema.safeParse(baseComponent({ unitPriceCents: -1 })).success).toBe(
      false,
    );
  });
});

describe("createJobSchema — components cap", () => {
  it("P2: rejects more than 200 components with a clear message", () => {
    const components = Array.from({ length: 201 }, (_, i) => baseComponent({ description: `Row ${i}` }));
    const result = createJobSchema.safeParse({ name: "Big job", unit: "job", components });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("200");
    }
  });

  it("accepts exactly 200 components", () => {
    const components = Array.from({ length: 200 }, (_, i) => baseComponent({ description: `Row ${i}` }));
    const result = createJobSchema.safeParse({ name: "Big job", unit: "job", components });
    expect(result.success).toBe(true);
  });
});
