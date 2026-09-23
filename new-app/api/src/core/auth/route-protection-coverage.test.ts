/**
 * Guard: every route declares what protects it.
 *
 * DefaultDenyGuard already refuses an undeclared route at runtime. This refuses it
 * at build time, which is better: a developer learns before the code ships, and a
 * reviewer gets a list of every public surface for free.
 *
 * The Phase 0 audit's finding was that authorisation was opt-in per controller, so a
 * route with no guard was simply unguarded and nothing failed. An absence is what
 * review misses; this turns the absence into a named failure.
 *
 * HOW IT READS THE CODE
 *
 * Through the TypeScript parser. A regex would match `@Get` in a comment, and could
 * not tell a method's decorators from its class's.
 *
 * WHAT IT DOES NOT PROVE
 *
 * - Not that the declaration is CORRECT. A route marked `@PublicRoute("health
 *   check")` that returns customer data is a review failure, not a parse failure.
 *   That is why the reason string is mandatory and printed below: the point is to
 *   make every public surface easy to look at, not to judge it.
 * - Not that the guard is actually registered globally. That is its own test, in
 *   default-deny.guard.test.ts.
 * - Nothing about routes defined outside a controller class — a middleware or a raw
 *   handler would be invisible here, and would also be invisible to Nest's guard, so
 *   it must not be how routes are added.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { PROTECTION_DECORATORS } from "./route-protection.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");

/** Nest's HTTP method decorators. A method carrying one of these IS a route. */
const HTTP_METHODS = new Set(["Get", "Post", "Put", "Patch", "Delete", "Head", "Options", "All"]);

interface Route {
  readonly where: string;
  readonly declared: string | null;
  /** Present only for @PublicRoute, so the failure output can list open surfaces. */
  readonly publicReason: string | null;
}

async function controllerFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await controllerFiles(full)));
    else if (entry.name.endsWith(".controller.ts")) out.push(full);
  }
  return out;
}

/** The decorator names on a node, e.g. `["Get", "Authenticated"]`. */
function decoratorNames(node: ts.Node): { name: string; firstStringArg: string | null }[] {
  const decorators = ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
  return decorators.map((decorator) => {
    const expression = decorator.expression;
    if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) {
      const arg = expression.arguments[0];
      return {
        name: expression.expression.text,
        firstStringArg: arg && ts.isStringLiteral(arg) ? arg.text : null,
      };
    }
    if (ts.isIdentifier(expression)) return { name: expression.text, firstStringArg: null };
    return { name: "<computed>", firstStringArg: null };
  });
}

async function routesIn(file: string): Promise<Route[]> {
  const text = await readFile(file, "utf8");
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const parseErrors = (sourceFile as unknown as { parseDiagnostics?: ts.Diagnostic[] })
    .parseDiagnostics;
  if (parseErrors?.length) {
    throw new Error(
      `${file} does not parse: ${ts.flattenDiagnosticMessageText(parseErrors[0]!.messageText, " ")}`,
    );
  }

  const rel = relative(SRC, file).split(sep).join("/");
  const found: Route[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement)) continue;
    const classDecorators = decoratorNames(statement);
    const classDeclared =
      classDecorators.find((d) => PROTECTION_DECORATORS.includes(d.name as never)) ?? null;

    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member) || !ts.isIdentifier(member.name)) continue;
      const decorators = decoratorNames(member);
      if (!decorators.some((d) => HTTP_METHODS.has(d.name))) continue;

      // Handler wins over controller, matching routeProtectionOf's precedence. A
      // guard that resolved this differently from the runtime would be worse than
      // none: it would disagree with the thing it claims to check.
      const own = decorators.find((d) => PROTECTION_DECORATORS.includes(d.name as never)) ?? null;
      const effective = own ?? classDeclared;

      found.push({
        where: `${rel} → ${statement.name?.text ?? "<anonymous>"}.${member.name.text}`,
        declared: effective?.name ?? null,
        publicReason: effective?.name === "PublicRoute" ? effective.firstStringArg : null,
      });
    }
  }
  return found;
}

describe("route protection coverage", () => {
  it("lists every route and what protects it, so the scope is visible", async () => {
    const routes = (
      await Promise.all((await controllerFiles(SRC)).map((f) => routesIn(f)))
    ).flat();

    // While the skeleton is being built there may be very few routes. That is
    // allowed — but it is PRINTED, so "zero routes checked" can never masquerade as
    // "all routes are protected" (Rule 8).
    // eslint-disable-next-line no-console -- the visibility is the point
    console.info(
      `route-protection: ${routes.length} route(s)\n` +
        routes.map((r) => `  ${r.declared ?? "UNDECLARED"}  ${r.where}`).join("\n"),
    );
    expect(routes.length).toBeGreaterThanOrEqual(0);
  });

  it("finds no route without a declaration", async () => {
    const routes = (
      await Promise.all((await controllerFiles(SRC)).map((f) => routesIn(f)))
    ).flat();

    const undeclared = routes
      .filter((r) => r.declared === null)
      .map(
        (r) =>
          `${r.where} declares no protection. Add @Authenticated(), @ShareTokenRoute() or ` +
          `@PublicRoute("why it is open") — on the method, or on the controller for the common case.`,
      );

    expect(undeclared, undeclared.join("\n")).toEqual([]);
  });

  it("gives every public route a real reason", async () => {
    // PublicRoute throws on a short reason at class-definition time, so this is the
    // belt to that brace: it catches the case where the file is never imported by a
    // test and therefore never evaluated.
    const routes = (
      await Promise.all((await controllerFiles(SRC)).map((f) => routesIn(f)))
    ).flat();

    const weak = routes
      .filter((r) => r.declared === "PublicRoute")
      .filter((r) => (r.publicReason ?? "").trim().length < 10)
      .map(
        (r) =>
          `${r.where} is public with no usable reason. The reason is what makes a review of ` +
          `every open surface a grep instead of an audit.`,
      );

    expect(weak, weak.join("\n")).toEqual([]);
  });
});
