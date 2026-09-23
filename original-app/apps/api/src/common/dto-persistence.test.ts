import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A source-scanning guard, not a behaviour test. Seam 2 in `CONTRACTS.md`.
 *
 * **The failure it exists to prevent:** a Zod DTO validates a field the service
 * never writes. The request succeeds, the contractor sees no error, and the
 * value silently disappears.
 *
 * `Client.town` did exactly this for months — accepted by `clientContactFields`,
 * absent from both `create` and `update`, and found only because the accountant
 * export began reading a column that could never hold anything.
 * `Project.retentionPct` had the same shape before it was wired.
 *
 * **No type can catch it.** Zod's inferred input type and Prisma's write type
 * are deliberately different shapes and nothing requires them to overlap. So
 * the invariant is enforced where it is expressible: over the source text.
 *
 * ## What it checks, precisely
 *
 * A field is covered if EITHER:
 *
 * - a service in the module names it, or
 * - a service spreads the whole input into a write (`data: { ...input }`).
 *
 * **The spread is not a loophole — it is the drift-proof design.**
 * `{ ...input, businessId }` writes every validated field by construction, so
 * there is no field for it to forget. The guard therefore protects the OTHER
 * pattern: services that enumerate fields by hand, which is exactly where
 * `Client.town` was lost.
 *
 * Fields come from the write schemas AND from any shared field group they
 * spread in — see `writableFields`, which explains why the narrower version of
 * this passed vacuously. Nested `z.object` schemas are excluded: they describe
 * values stored inside a JSON column and written whole, so a quote line's
 * `jobComponents` snapshot contributes no columns anybody could forget.
 */

const SRC = join(process.cwd(), "src");

/** Writes that carry every validated field through without naming any. */
const SPREAD = /\.\.\.(input|dto|body|data|rest)\b/;

/**
 * Fields a DTO accepts that a service legitimately never persists under that
 * name. Each needs a reason: an exception with a justification is
 * documentation, a bare name is a hole.
 */
const ALLOWED: Record<string, string> = {
  // Legacy single `name` from apps/mobile, split into firstName/lastName by
  // resolveClientName before the write. Consumed, not stored.
  "clients:name": "split into firstName/lastName by resolveClientName",
  "auth:password": "hashed into passwordHash; never stored as given",
  "auth:token": "compared against a stored hash; never persisted raw",
};

interface Mod {
  module: string;
  dtoPath: string;
  servicePaths: string[];
}

function modules(): Mod[] {
  const out: Mod[] = [];
  for (const dir of readdirSync(SRC)) {
    const modDir = join(SRC, dir);
    const dto = join(modDir, `${dir}.dto.ts`);
    if (!existsSync(dto)) continue;
    // A module's fields may be written by ANY service in it - invoices has
    // three - so all of them count as the persistence side.
    const services = readdirSync(modDir).filter((f) => f.endsWith(".service.ts"));
    out.push({ module: dir, dtoPath: dto, servicePaths: services.map((s) => join(modDir, s)) });
  }
  return out;
}

/**
 * The fields of every write payload in a DTO file.
 *
 * ## Why this is not simply "the create/update schemas"
 *
 * The first version of this guard collected fields only from consts named
 * `create*` / `update*`, and **it passed with the historical `Client.town` bug
 * reintroduced** — vacuous, which is worse than absent.
 *
 * The reason is the pattern that hid the bug in the first place: `town` is
 * declared in `clientContactFields`, a plain object of Zod rules SPREAD into
 * both `createClientSchema` and `updateClientSchema`. The fields that actually
 * broke were the ones a create/update-only parser cannot see.
 *
 * So this collects from two kinds of block:
 *
 * 1. consts named `create*` / `update*` — the write schemas themselves
 * 2. any const that such a schema spreads in (`...clientContactFields`) — the
 *    shared field groups
 *
 * In both cases only DEPTH-1 fields count. A nested `z.object({ ... })` describes
 * a value stored inside a JSON column and written whole — a quote line's
 * `jobComponents` snapshot is one, so its `kind` and `quantityPerUnit` are not
 * columns anybody could forget.
 */
function writableFields(src: string): string[] {
  const lines = src.split("\n");

  // Field groups a write schema spreads in: `...clientContactFields,`
  const spreadIn = new Set<string>();
  for (const line of lines) {
    const m = line.match(/^\s+\.\.\.([A-Za-z_]\w*)\s*,/);
    if (m?.[1]) spreadIn.add(m[1]);
  }

  const fields = new Set<string>();
  let current: string | null = null;
  let collecting = false;
  let depth = 0;

  for (const line of lines) {
    const decl = line.match(/^(?:export\s+)?const\s+(\w+)\s*=/);
    if (decl?.[1]) {
      current = decl[1];
      collecting = /^(create|update)/.test(current) || spreadIn.has(current);
      depth = 0;
    }
    if (!collecting || !current) continue;

    const before = depth;
    // Braces ONLY. Counting parens too double-counted `z.object({`, so depth
    // jumped straight from 0 to 2 and no field was ever seen at depth 1 - the
    // sanity check below is what caught it.
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    const m = line.match(/^\s{2,}([A-Za-z_]\w*)\s*:\s*z\./);
    if (m?.[1] && before === 1) fields.add(m[1]);
    if (before > 0 && depth <= 0) collecting = false;
  }
  return [...fields];
}

describe("every DTO field reaches its service (CONTRACTS.md seam 2)", () => {
  const mods = modules().filter((m) => m.servicePaths.length > 0);

  it("finds the DTOs, so a reorganisation cannot empty this test", () => {
    expect(mods.length).toBeGreaterThanOrEqual(12);
  });

  it("finds writable fields to check, so a parser change cannot empty it either", () => {
    const total = mods.reduce(
      (n, m) => n + writableFields(readFileSync(m.dtoPath, "utf8")).length,
      0,
    );
    expect(total).toBeGreaterThanOrEqual(30);
  });

  it.each(mods.map((m) => [m.module, m] as const))("%s", (module, mod) => {
    const dtoSrc = readFileSync(mod.dtoPath, "utf8");
    // Comments stripped, because comments are not writes. Without this the
    // guard was vacuous a SECOND time: `clients.service.ts` carries a comment
    // explaining that `town` had once been dropped, and the word appearing in
    // that sentence satisfied the search with both writes deleted. A guard
    // whose evidence can be a comment about the bug is not a guard.
    const serviceSrc = mod.servicePaths
      .map((p) => readFileSync(p, "utf8"))
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    const spreads = SPREAD.test(serviceSrc);

    const missing = writableFields(dtoSrc).filter((field) => {
      if (ALLOWED[`${module}:${field}`]) return false;
      if (spreads) return false;
      // Word-boundary match, so `town` is not satisfied by `downstream`.
      return !new RegExp(`\\b${field}\\b`).test(serviceSrc);
    });

    // A field accepted from a contractor and never written is data loss that
    // reports success. Name it here rather than finding it in an empty export
    // column months later.
    expect(missing).toEqual([]);
  });
});
