import { describe, expect, it } from "vitest";
import { JobComponentKind } from "@jamquote/core";
import { assemblyComponentInputSchema, createJobSchema, updateJobSchema } from "./jobs.dto.js";

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
    // at the database as an unhandled 500. The message now names the field
    // in plain words ("Unit price"), not the raw cents field name — see the
    // dedicated dollar-limit test below.
    const result = assemblyComponentInputSchema.safeParse(
      baseComponent({ unitPriceCents: 3_000_000_000 }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("Unit price");
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

  it("LOW: the overflow message states the dollar limit a contractor actually typed in, not the raw cents field name", () => {
    const result = assemblyComponentInputSchema.safeParse(
      baseComponent({ unitPriceCents: 3_000_000_000 }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Unit price can't be more than $21,474,836.47");
    }
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

describe("createJobSchema / updateJobSchema — job cost fits Int32", () => {
  it("HIGH: refuses a payload whose per-field-legal quantity x price overflows the job's cost, with a plain message", () => {
    // Both individually pass their own field caps (quantity <= 999,999,999,
    // unitPriceCents <= the Postgres Int max) but multiplied together this
    // job's cost is far past Int32 — it used to pass validation, commit, and
    // then throw on every subsequent read (findOne/findAll).
    const result = createJobSchema.safeParse({
      name: "Overflow job",
      unit: "job",
      components: [baseComponent({ quantityPerUnit: 999_999_999, unitPriceCents: 2_147_483_647 })],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("This job's cost is too large");
    }
  });

  it("accepts a job whose cost fits comfortably", () => {
    const result = createJobSchema.safeParse({
      name: "Normal job",
      unit: "job",
      components: [baseComponent({ quantityPerUnit: 10, unitPriceCents: 5000 })],
    });
    expect(result.success).toBe(true);
  });

  it("updateJobSchema refuses the same overflowing payload when components are replaced", () => {
    const result = updateJobSchema.safeParse({
      components: [baseComponent({ quantityPerUnit: 999_999_999, unitPriceCents: 2_147_483_647 })],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("This job's cost is too large");
    }
  });

  it("updateJobSchema without components skips the cost check entirely (a plain rename)", () => {
    const result = updateJobSchema.safeParse({ name: "Renamed" });
    expect(result.success).toBe(true);
  });
});
