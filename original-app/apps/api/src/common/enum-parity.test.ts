import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as coreEnums from "@jamquote/core";

/**
 * The Prisma enums and the core enums must hold the same members.
 *
 * ## Why this is worth a test
 *
 * The public share views are validated against `.strict()` wire contracts that use
 * `z.nativeEnum(...)` over the **core** enums, and they fail CLOSED — a response
 * that does not match the contract becomes a 500 rather than a disclosure.
 *
 * That is the right trade for a disclosure, but it has a cost this test exists to
 * remove: add a seventh `LineCategory` to `schema.prisma`, forget
 * `packages/core/src/types/enums.ts`, and **every share link containing such a
 * line stops working, for every tenant, at once.** Nothing else in the repo would
 * catch it — the migration tests compare the schema to the database, not to core.
 *
 * This repo has already added an enum member on one side and not the other
 * (`ENQUIRY` on the project stage), so it is not a hypothetical.
 *
 * ## Direction matters
 *
 * Prisma is the source of truth: the database can hold only what the schema
 * declares. So a member in Prisma and missing from core is a **failure** (a real
 * row the contract will reject), while the reverse is merely dead weight in core —
 * still reported, because a core member nothing can store is a value some screen
 * may offer and no row will ever have.
 */

const SCHEMA = join(process.cwd(), "prisma", "schema.prisma");

/** Every `enum Name { ... }` in the Prisma schema, with `@@map` names ignored. */
function prismaEnums(src: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const stripped = src.replace(/\/\/[^\n]*/g, "");
  for (const m of stripped.matchAll(/enum\s+(\w+)\s*\{([^}]*)\}/g)) {
    const members = [...m[2]!.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*$/gm)].map((x) => x[1]!);
    out.set(m[1]!, members);
  }
  return out;
}

/**
 * Enums whose members are deliberately NOT mirrored in core, with the reason.
 *
 * Every entry needs a reason a reader can check. "It was failing" is not one.
 */
const NOT_MIRRORED: Record<string, string> = {
  PriceSource: "deliberately withheld from every response — see SupplierPriceView",
  MaterialAttributeKind: "material schema tree, still a hand-written web shape (F50)",
};

describe("Prisma enums and core enums agree", () => {
  const declared = prismaEnums(readFileSync(SCHEMA, "utf8"));

  it("finds the schema's enums, so a restructure cannot empty this guard", () => {
    // Measured at 14. A floor just below it catches a move or a rename without
    // failing every time an enum is legitimately added or retired.
    expect(declared.size).toBeGreaterThanOrEqual(12);
  });

  it("finds their members too", () => {
    const total = [...declared.values()].reduce((n, m) => n + m.length, 0);
    // Measured at 58 across the 14.
    expect(total).toBeGreaterThanOrEqual(50);
  });

  const mirrored = [...declared.entries()].filter(
    ([name]) => !(name in NOT_MIRRORED) && name in coreEnums,
  );

  it("has enums to compare — this list going empty would make the rest vacuous", () => {
    expect(mirrored.length).toBeGreaterThanOrEqual(5);
  });

  it.each(mirrored)("%s holds the same members on both sides", (name, prismaMembers) => {
    // A member Prisma can store and core does not know is the dangerous
    // direction: the public wire contracts use z.nativeEnum over the CORE enum
    // and fail closed, so such a row 500s every share link that contains it.
    const core = Object.keys(coreEnums[name as keyof typeof coreEnums] as object);
    expect([...prismaMembers].sort()).toEqual([...core].sort());
  });

  it("does not let the not-mirrored list rot", () => {
    // A name here that the schema no longer declares means the list has stopped
    // describing anything, and the next reader cannot tell which entries are real.
    const stale = Object.keys(NOT_MIRRORED).filter((n) => !declared.has(n));
    expect(stale).toEqual([]);
  });
});
