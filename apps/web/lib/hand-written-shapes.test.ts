import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The response shapes still written by hand, and whether anything reads them.
 *
 * Seam 1 - what the API sends and what the web believes it sends - is guarded by
 * the wire contracts in `packages/core/src/wire`. Every shape on a MONEY path
 * now comes from one. What remains here are the flat, low-risk shapes (material
 * schema, job library, suppliers, admin), and the risk they carry is not that
 * they are wrong today. It is drift: a column changes on one side and the
 * declaration on the other side keeps claiming the old thing, with nothing
 * failing.
 *
 * So this pins two properties.
 *
 * **The list only shrinks.** A NEW hand-written shape fails here, and the fix is
 * a wire contract rather than a name added below. Fourteen is the number to work
 * down, not a budget to spend.
 *
 * **None of them is dead.** `ApiInvoiceSection` and `ApiInvoiceLineItem` sat in
 * this file for weeks after `invoiceDetailWire` replaced them, referenced by
 * nothing. That is the worse failure of the two: an unused declaration is not
 * inert, because the next reader takes it for the truth about the response and
 * writes code against a shape the API stopped sending.
 */

const WEB = join(process.cwd());
const CLIENT = join(WEB, "lib", "api-client.ts");

/**
 * Hand-written shapes allowed to remain, with what each is waiting on.
 *
 * None is on a money path - that was the criterion for leaving them. A name
 * leaves this list when its wire contract lands; a name does NOT get added.
 */
const ALLOWED = new Set([
  "ApiErrorBody", // Not a response body - the error envelope itself.
  "ApiMaterialAttributeOption",
  "ApiMaterialAttribute",
  "ApiMaterialCategory",
  "ApiMaterialUnit",
  "ApiMaterialSchema",
  "ApiJobComponent",
  "ApiJob",
  "ApiRegulatoryUpdate",
  "ApiHiddenCatalogEntry",
  "ApiSupplier",
  "ApiSupplierPrice",
  "ApiLogoMeta",
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** `export interface ApiFoo {` - a shape declared by hand, not inferred. */
function handWritten(src: string): string[] {
  return [...src.matchAll(/^export interface (Api\w+)\s*\{/gm)].map((m) => m[1]!);
}

/**
 * Whole-word occurrences of `name` in `src`, counted WITHOUT a regex.
 *
 * Two things went wrong getting here, and both are worth the comment.
 *
 * The first version used `` in a template literal, matched nothing, and
 * reported every shape dead. Scanning by hand is duller and cannot be escaped
 * wrong.
 *
 * The second passed when it should have failed, because a COMMENT naming the
 * shape counted as a use - the same vacuity that let the DTO guard pass twice
 * on prose. Comments come out before anything is counted.
 */
function occurrences(source: string, name: string): number {
  const src = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const word = (c: string | undefined) => c !== undefined && /[\w$]/.test(c);
  let count = 0;
  for (let i = src.indexOf(name); i !== -1; i = src.indexOf(name, i + name.length)) {
    if (!word(src[i - 1]) && !word(src[i + name.length])) count += 1;
  }
  return count;
}

describe("hand-written response shapes", () => {
  const src = readFileSync(CLIENT, "utf8");
  const declared = handWritten(src);

  it("finds them, so a rename cannot empty this guard", () => {
    expect(declared.length).toBeGreaterThan(5);
  });

  it("has not grown - a new response shape needs a wire contract, not a line here", () => {
    expect(declared.filter((n) => !ALLOWED.has(n))).toEqual([]);
  });

  it("does not keep a name whose shape is gone", () => {
    // The allow-list has to describe something. A name here that no longer
    // exists means the list stopped being read.
    const present = new Set(declared);
    expect([...ALLOWED].filter((n) => !present.has(n))).toEqual([]);
  });

  it("has no shape that nothing reads", () => {
    // The ApiInvoiceSection failure: replaced by a wire contract, left in place,
    // referenced by nothing, and still readable as the truth about the response.
    const files = sourceFiles(join(WEB, "lib"))
      .concat(sourceFiles(join(WEB, "app")))
      .concat(sourceFiles(join(WEB, "components")))
      // This file names every shape in its own allow-list; those are not uses.
      .filter((f) => !f.endsWith("hand-written-shapes.test.ts"));

    const dead: string[] = [];
    for (const name of declared) {
      // Minus one for the declaration itself, which is never a use.
      const uses = files.reduce((n, f) => n + occurrences(readFileSync(f, "utf8"), name), 0) - 1;
      if (uses <= 0) dead.push(name);
    }
    expect(dead).toEqual([]);
  });
});
