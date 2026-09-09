import { expect } from "vitest";

/**
 * Reading a Prisma `select` out of source, without the holes the first attempt had.
 *
 * ## Why source-scanning at all
 *
 * A fake Prisma returns whatever the fake says and ignores the `select` entirely,
 * so no service-level test can notice that a select grew. The runtime contract
 * check (`assertPublicShape`) catches a widening on the first real request and
 * fails closed — but that is production finding out. Reading the source is the
 * only thing that can fail in CI.
 *
 * ## The holes this exists to close
 *
 * The first version of the public-view scan was reviewed and broken twice:
 *
 * - It bounded the sections select with `indexOf("lineItems:")`, so it read only
 *   the keys written BEFORE that entry. Appending `quoteId: true` after it passed
 *   — and appending is exactly where a person adds a field.
 * - It matched `(\w+)\s*:\s*true`, so anything that was not literally `true` was
 *   invisible: a trailing `...SPREAD`, a `phone: Boolean(true)`, a select built by
 *   a helper.
 *
 * Both made it a guard that would pass while the select was wider — the fifth such
 * guard in this repo. So this version matches braces properly and **fails on
 * anything it cannot understand**, rather than ignoring it.
 */

/** The balanced `{ ... }` starting at `open`, which must be the index of the `{`. */
function balancedBlock(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error("unbalanced braces while scanning a select");
}

/**
 * The field names in a `select: { ... }`, refusing anything ambiguous.
 *
 * Nested blocks (a relation's own select, e.g. `lineItems: { ... }`) are removed
 * before the keys are read, so an outer select's key set is exactly its own —
 * the fix for the `indexOf("lineItems:")` boundary bug.
 */
export function selectKeys(block: string): string[] {
  const inner = block.slice(block.indexOf("{") + 1, block.lastIndexOf("}"));

  // Strip nested blocks so their keys do not leak into this level's key set.
  let flat = "";
  let depth = 0;
  for (const ch of inner) {
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (depth === 0) flat += ch;
    if (ch === "{" && depth === 1) flat = flat.replace(/[\w]+\s*:\s*$/, "");
  }

  // A spread could bring in anything. Refuse rather than ignore.
  expect(flat, "a select in a public view must not spread — list the fields").not.toMatch(
    /\.\.\./,
  );

  const keys: string[] = [];
  for (const part of flat.split(",")) {
    const entry = part.trim();
    if (!entry) continue;
    const m = entry.match(/^(\w+)\s*:\s*(.+)$/s);
    // Anything that is not `name: true` is something this scan cannot reason
    // about, and silence would be the bug. Fail and make someone look.
    expect(m, `could not parse select entry: ${entry}`).not.toBeNull();
    expect(m![2]!.trim(), `select entry ${m![1]} must be a literal true`).toBe("true");
    keys.push(m![1]!);
  }
  return keys;
}

/**
 * The `select: { ... }` belonging to a named relation inside `body`.
 *
 * Finds the relation, then the first `select:` inside ITS block rather than
 * anywhere after it — so reordering the include cannot make one relation's scan
 * read another's select.
 */
export function relationSelectKeys(body: string, relation: string): string[] {
  const at = body.indexOf(`${relation}: {`);
  expect(at, `${relation} should be selected explicitly`).toBeGreaterThan(-1);
  const relationBlock = balancedBlock(body, body.indexOf("{", at));
  const selectAt = relationBlock.indexOf("select:");
  expect(selectAt, `${relation} should use an explicit select`).toBeGreaterThan(-1);
  return selectKeys(balancedBlock(relationBlock, relationBlock.indexOf("{", selectAt)));
}

/**
 * The body of a method, bounded by the next member at the same indentation.
 *
 * The first version ended the window at the next `async `, which a `private async`
 * inserted immediately afterwards would extend past — at which point a select
 * elsewhere in the file could satisfy the pin.
 */
export function methodBody(src: string, name: string): string {
  const start = src.indexOf(`async ${name}`);
  expect(start, `${name} should exist`).toBeGreaterThan(-1);
  const rest = src.slice(start);
  // The next line that starts a new class member at two-space indentation.
  const nextMember = rest.slice(1).search(/\n {2}(?:public |private |protected )?(?:async )?\w+\(/);
  return nextMember === -1 ? rest : rest.slice(0, nextMember + 1);
}
