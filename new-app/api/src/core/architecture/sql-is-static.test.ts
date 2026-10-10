/**
 * Guard: every SQL statement the API sends is a fixed string; values travel only as parameters.
 *
 * WHY THIS EXISTS (finding AA of the privilege-model review, 2026-10-02)
 *
 * The privilege model (`docs/design/privilege-model.md`) limits what a SQL-injection defect in our server
 * can reach, and the review proved where that limit stops: the door functions that WRITE — creating a
 * session, marking it verified, adding a recovery code — must be callable by the server, so an injection
 * that knows a user id can impersonate that user, second factor included. The database cannot stop that:
 * the TOTP key is never in it, so "this session passed its factor" is a write it has to take on trust.
 * The owner accepted that limit (2026-10-02) on condition of the control that actually prevents
 * injection: no SQL built from strings. This is that control.
 *
 * WHAT IT CHECKS
 *
 * In every non-test `.ts` file under `src/`, every call to a method named `$queryRawUnsafe`,
 * `$executeRawUnsafe`, `$queryRaw`, `$executeRaw`, `query` or `exec` passes, as its FIRST argument, a
 * string literal or a template literal with no `${…}` — the SQL text itself, visible at the call site.
 * Anything else (a variable, a concatenation, an interpolated template, a function call) fails, by file
 * and line. The SQL may still take any number of `$n` parameters.
 *
 * WHAT IT DOES NOT PROVE (Rule 21.4)
 *
 * - That a fixed statement is safe: SQL that builds SQL inside the database (`EXECUTE format(…)` in a
 *   function) is outside this guard. None of the door functions does.
 * - Calls through another method name, or through `Reflect`/computed access: the guard reads names.
 * - Anything in test files, which run against throwaway databases and plant defects on purpose.
 * - Prisma's tagged-template `$queryRaw\`…\`` form: it parameterises by construction, and no code uses it.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SQL_METHODS = new Set(["$queryRawUnsafe", "$executeRawUnsafe", "$queryRaw", "$executeRaw", "query", "exec"]);

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(path)));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) {
      out.push(path);
    }
  }
  return out;
}

/** Every SQL call whose statement is not a fixed string, as "file:line — what was passed". */
export function dynamicSqlCalls(fileName: string, text: string): { calls: number; dynamic: string[] } {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  let calls = 0;
  const dynamic: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      SQL_METHODS.has(node.expression.name.text)
    ) {
      calls += 1;
      const first = node.arguments[0];
      const fixed = first !== undefined && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first));
      if (!fixed) {
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        dynamic.push(`${fileName}:${line} — ${first ? first.getText().slice(0, 60) : "(no argument)"}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { calls, dynamic };
}

describe("every SQL statement is a fixed string (injection guard)", () => {
  it("finds no SQL call whose statement is built at run time", async () => {
    let calls = 0;
    const dynamic: string[] = [];
    for (const file of await sourceFiles(SRC)) {
      const found = dynamicSqlCalls(relative(SRC, file), await readFile(file, "utf8"));
      calls += found.calls;
      dynamic.push(...found.dynamic);
    }
    // 24 on 2026-10-02; a floor, so a guard that stopped finding the calls cannot pass.
    expect(calls).toBeGreaterThanOrEqual(20);
    expect(dynamic, `SQL built at run time:\n${dynamic.join("\n")}`).toEqual([]);
  });

  it("refuses each way a statement can be built, and accepts the fixed forms", () => {
    const sample = [
      "db.$queryRawUnsafe(`SELECT 1 WHERE a = $1`, x);",
      "db.$executeRawUnsafe('SELECT 1');",
      "db.$queryRawUnsafe(`SELECT * FROM t WHERE e = '${email}'`);",
      "db.$queryRawUnsafe('SELECT * FROM t WHERE e = ' + email);",
      "db.$executeRawUnsafe(statement, x);",
      "db.query(build(x));",
      "db.exec();",
    ].join("\n");
    const { calls, dynamic } = dynamicSqlCalls("sample.ts", sample);
    expect(calls).toBe(7);
    expect(dynamic.map((d) => d.split(" — ")[0])).toEqual([
      "sample.ts:3",
      "sample.ts:4",
      "sample.ts:5",
      "sample.ts:6",
      "sample.ts:7",
    ]);
  });
});
