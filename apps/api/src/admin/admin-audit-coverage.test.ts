import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "../common/select-scan.js";

/**
 * Every mutating admin route knows who acted.
 *
 * ## The defect
 *
 * `POST /admin/subscriptions/sweep` was the one mutating admin route with no audit
 * entry, and it is the route with the widest blast radius: a run reverts lapsed
 * tenants to the free plan and emails them. `subscription_sweep_run` recorded THAT a
 * manual run happened, with no actor — so "who dropped this tenant to free on the
 * 3rd?" had no answer.
 *
 * ## Why a guard and not just a test for that route
 *
 * Because the shape of the defect is "one route out of seventeen was missed", and a
 * test for the route that was missed does not stop the eighteenth. This asserts the
 * class: a handler that mutates must obtain an actor and either record the audit
 * entry itself or hand the actor to the service that does.
 *
 * ## What it does NOT prove
 *
 * That the delegate actually writes the entry. It checks that the actor reaches the
 * call, which is the part that was structurally absent. Whether a given service
 * records is asserted in that service's own tests — `admin.service.test.ts` covers
 * suspend/restore/promote/revoke, and the sweep's entry is asserted below.
 */

const CONTROLLER = join(__dirname, "admin.controller.ts");
const SOURCE = stripComments(readFileSync(CONTROLLER, "utf8"));

/** The two ways this controller learns who is acting. */
const ACTOR = /req\.user!?\.sub|req\.adminContext!?\.userId/;

/**
 * The body of a class member, brace-matched from its signature.
 *
 * `select-scan`'s `methodBody` only finds `async name` and asserts on absence; most
 * handlers here return the promise directly, so it found nothing and the whole file
 * failed to collect. Local, and tolerant of both forms.
 */
function memberBody(src: string, name: string): string | null {
  // Literal search, not a RegExp built from a string: the first attempt wrote
  // `new RegExp("\s..." + name)`, and `"\s"` inside a JS string literal is just the
  // letter `s`. It matched nothing, every route body fell back to its decorator
  // region, and the class assertion passed on text it had not meant to read. Caught
  // by the "the sweep records its own entry" case failing on an empty body.
  const sig = `${name}(`;
  let at = -1;
  for (let i = src.indexOf(sig); i >= 0; i = src.indexOf(sig, i + 1)) {
    // A member declaration, not a call site: preceded only by indentation (and
    // possibly `async`) back to the start of the line.
    const lineStart = src.lastIndexOf("\n", i) + 1;
    if (/^\s*(?:async\s+)?$/.test(src.slice(lineStart, i))) {
      at = lineStart;
      break;
    }
  }
  if (at < 0) return null;

  // The body's opening brace is the first one that ENDS its line. Taking the first
  // `{` outright reads into the return type: `impersonateTenant` declares
  // `Promise<{ token: string; ... }>`, so brace-matching closed on the type and the
  // body was truncated above the `req.user!.sub` line — which made the class
  // assertion report three routes as actor-less when all three were fine. A guard's
  // false positive costs as much as its false negative: it would have had me
  // "fixing" three correct routes.
  let open = -1;
  for (let i = src.indexOf("{", at); i >= 0; i = src.indexOf("{", i + 1)) {
    const eol = src.indexOf("\n", i);
    if (eol < 0 || src.slice(i + 1, eol).trim() === "") {
      open = i;
      break;
    }
  }
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(at, i + 1);
    }
  }
  return null;
}

interface Route {
  verb: string;
  path: string;
  handler: string;
  body: string;
}

/** Every `@Post`/`@Patch`/`@Delete`/`@Put` handler in the controller. */
function mutatingRoutes(src: string): Route[] {
  const decorators = [...src.matchAll(/@(Post|Patch|Delete|Put)\(\s*"([^"]*)"\s*\)/g)];
  return decorators.map((m, i) => {
    const end = i + 1 < decorators.length ? decorators[i + 1]!.index! : src.length;
    const region = src.slice(m.index!, end);
    // The handler name is the first identifier followed by `(` that is not a
    // decorator — decorators between the route and the method are skipped.
    const name = region
      .split("\n")
      .map((line) => /^\s+(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/.exec(line)?.[1])
      .find((n): n is string => !!n && n !== "constructor");
    return {
      verb: m[1]!,
      path: m[2]!,
      handler: name ?? "(unnamed)",
      body: name ? (memberBody(src, name) ?? region) : region,
    };
  });
}

describe("every mutating admin route knows who acted", () => {
  const routes = mutatingRoutes(SOURCE);

  it("found the routes, so a rename cannot empty this guard", () => {
    // Seventeen at the time of writing. A floor rather than an equality, so adding
    // a route does not fail this, but deleting the decorator pattern does.
    expect(routes.length, "no mutating routes parsed").toBeGreaterThanOrEqual(15);
    expect(routes.map((r) => r.handler)).toContain("runSweep");
    expect(routes.map((r) => r.handler)).toContain("promoteAdmin");
    // And every handler body was actually located, so none is passing on "".
    for (const r of routes) {
      expect(r.body.length, `${r.verb} ${r.path} — no body found`).toBeGreaterThan(20);
    }
  });

  it("takes an actor and does something with it", () => {
    const anonymous = routes
      .filter((r) => !ACTOR.test(r.body))
      .map((r) => `${r.verb} ${r.path} (${r.handler})`);
    // A mutating route with no actor cannot be audited by anything downstream,
    // however careful the service is.
    expect(anonymous, "a mutating admin route must know who is acting").toEqual([]);
  });

  it("the sweep records its own entry, with the outcome", () => {
    // It delegates to a service that does not audit, so the controller must — and
    // the entry is worth having only if it says what the run did.
    const body = memberBody(SOURCE, "runSweep") ?? "";
    expect(body).toContain("auditService.record");
    expect(body).toMatch(/action:\s*"subscription\.sweep\.manual"/);
    expect(body, "the entry should carry the result, not just the fact").toMatch(
      /details:\s*\{\s*\.\.\.result/,
    );
    // A sweep that throws half-way has still sent some of those emails, so the
    // attempt is recorded too.
    expect(body, "a failed sweep leaves no other trace of who ran it").toMatch(
      /sweep\.manual\.failed/,
    );
  });

  it("the pattern it looks for actually matches, so a pass means something", () => {
    expect(ACTOR.test("this.admin.suspendTenant(id, req.user!.sub)")).toBe(true);
    expect(ACTOR.test("userId: req.adminContext!.userId,")).toBe(true);
    expect(ACTOR.test("return this.sweep.run('manual');")).toBe(false);
  });
});
