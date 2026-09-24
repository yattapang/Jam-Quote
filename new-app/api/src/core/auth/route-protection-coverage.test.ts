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
 * TWO BLIND SPOTS IT USED TO HAVE (F2, independent review 2026-09-24)
 *
 * It scanned only `*.controller.ts`, and it matched HTTP decorators by the identifier as written.
 * So a controller in any other file was invisible, and `import { Get as Fetch }` walked straight
 * past it — both proved by the reviewer, with the printed inventory cheerfully reporting
 * "2 route(s)". A guard that examines the wrong SET is the same failure as one that examines the
 * wrong property, and this project has now shipped both.
 *
 * So: every `.ts` under `src/` is read, a controller is identified by its `@Controller` decorator
 * rather than its filename, and decorator identifiers are resolved back through the import that
 * renamed them.
 *
 * WHAT IT DOES NOT PROVE
 *
 * - Not that the declaration is CORRECT. A route marked `@PublicRoute("health
 *   check")` that returns customer data is a review failure, not a parse failure.
 *   That is why the reason string is mandatory and printed below: the point is to
 *   make every public surface easy to look at, not to judge it.
 * - Not that the guard is actually registered globally. That is `app.module.test.ts`, which boots
 *   the real application and issues real requests — added with this fix, because until then the
 *   guard was registered nowhere and this file was the only thing standing behind it.
 * - Nothing about routes defined outside a controller class — a middleware or a raw handler is
 *   invisible here AND bypasses Nest's global guard, so it would be genuinely unprotected. That
 *   is why `app.module.ts` states routes must be controllers; no test can enforce it.
 * - Not that a decorator imported from somewhere other than `@nestjs/common` is what it claims.
 *   A local `Get` re-exported from a wrapper module is treated as the real one, which errs
 *   towards checking too much rather than too little.
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

/**
 * Every TypeScript file under `src/`, tests excluded.
 *
 * Not `*.controller.ts`: that was the blind spot. A controller is whatever carries `@Controller`,
 * wherever somebody put it.
 */
async function sourceFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(full)));
    else if (
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".d.ts") &&
      !entry.name.endsWith(".test.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Maps each locally-visible name back to the name it was imported under.
 *
 * `import { Get as Fetch } from "@nestjs/common"` makes `Fetch` mean `Get`, and matching on the
 * written identifier missed it entirely — the reviewer declared a route with `@Fetch` and three
 * tests passed. Renaming an import is ordinary TypeScript, not an exotic attack; a guard that can
 * be defeated by it is checking spelling rather than meaning (Rule 8: detect the class, not the
 * spelling).
 */
function importAliases(sourceFile: ts.SourceFile): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const clause = statement.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    for (const element of clause.namedBindings.elements) {
      // `propertyName` is present only when the import was renamed: { Get as Fetch }.
      aliases.set(element.name.text, (element.propertyName ?? element.name).text);
    }
  }
  return aliases;
}

/** The decorator names on a node, resolved through any import alias. */
function decoratorNames(
  node: ts.Node,
  aliases: Map<string, string>,
): { name: string; firstStringArg: string | null }[] {
  const decorators = ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
  return decorators.map((decorator) => {
    const expression = decorator.expression;
    const resolve = (local: string) => aliases.get(local) ?? local;

    if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) {
      const arg = expression.arguments[0];
      return {
        name: resolve(expression.expression.text),
        firstStringArg: arg && ts.isStringLiteral(arg) ? arg.text : null,
      };
    }
    if (ts.isIdentifier(expression)) {
      return { name: resolve(expression.text), firstStringArg: null };
    }
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

  const aliases = importAliases(sourceFile);

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement)) continue;

    const classDecorators = decoratorNames(statement, aliases);

    // A controller is a class carrying @Controller, wherever it lives and whatever the file is
    // called. Classes without it have no routes to check.
    if (!classDecorators.some((d) => d.name === "Controller")) continue;

    const classDeclared =
      classDecorators.find((d) => PROTECTION_DECORATORS.includes(d.name as never)) ?? null;

    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member) || !ts.isIdentifier(member.name)) continue;
      const decorators = decoratorNames(member, aliases);
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
      await Promise.all((await sourceFiles(SRC)).map((f) => routesIn(f)))
    ).flat();

    // While the skeleton is being built there may be very few routes. That is
    // allowed — but it is PRINTED, so "zero routes checked" can never masquerade as
    // "all routes are protected" (Rule 8).
    // eslint-disable-next-line no-console -- the visibility is the point
    console.info(
      `route-protection: ${routes.length} route(s)\n` +
        routes.map((r) => `  ${r.declared ?? "UNDECLARED"}  ${r.where}`).join("\n"),
    );

    // The printed count is what made F2 invisible: the inventory said "2 route(s)" while an
    // undeclared third existed. It cannot say zero and be believed — the application has routes.
    expect(routes.length, "no routes found at all, so this guard is checking nothing").toBeGreaterThan(
      0,
    );
  });

  it("finds no route without a declaration", async () => {
    const routes = (
      await Promise.all((await sourceFiles(SRC)).map((f) => routesIn(f)))
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
      await Promise.all((await sourceFiles(SRC)).map((f) => routesIn(f)))
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
