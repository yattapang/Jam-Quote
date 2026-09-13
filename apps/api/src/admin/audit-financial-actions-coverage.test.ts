import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "../common/select-scan.js";
import { FINANCIAL_AUDIT_ACTIONS } from "./audit.service.js";

/**
 * `GET /admin/audit` redacts `details` for actions in `FINANCIAL_AUDIT_ACTIONS`
 * (see audit.service.ts) for a caller without VIEW_FINANCIALS/MANAGE_TENANTS.
 * That set is a hand-kept list of action names, which is exactly the shape the
 * project's guard doctrine distrusts — so this guard does not trust it either.
 * It re-derives, from source, every `audit.record`/`this.audit.record` call
 * whose `details` object mentions a money-shaped key (anything ending in
 * `Cents`, the project's own convention for a money field — see
 * `priceCents`/`amountCents`), and asserts each such call's `action` is
 * registered in the set. A new financial write that forgets to register
 * itself fails this test instead of leaking through `/admin/audit` silently.
 *
 * What this does NOT prove: a money field that does not end in `Cents`
 * (there is none in this codebase's audit writers today) would not be
 * detected. It also does not prove `FINANCIAL_AUDIT_ACTIONS` has no STALE
 * entries — only that it has no missing ones.
 */

// rulepack.service.ts lives at apps/api/src/rulepack/rulepack.service.ts, a
// sibling of admin/, and also calls audit.record — scanned for completeness
// even though its call carries no money field today.
const RULEPACK_FILE = join(__dirname, "..", "rulepack", "rulepack.service.ts");

const SOURCE_FILES = [
  join(__dirname, "admin.service.ts"),
  join(__dirname, "subscription-payments.service.ts"),
  RULEPACK_FILE,
];

/** Every `<expr>.record({ ... })` call's full argument object, brace-matched. */
function recordCallArgs(src: string): string[] {
  const calls: string[] = [];
  const marker = ".record({";
  for (let i = src.indexOf(marker); i >= 0; i = src.indexOf(marker, i + 1)) {
    const openBrace = src.indexOf("{", i + marker.length - 1);
    let depth = 0;
    for (let j = openBrace; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") {
        depth--;
        if (depth === 0) {
          calls.push(src.slice(openBrace, j + 1));
          break;
        }
      }
    }
  }
  return calls;
}

// Matches both `priceCents: value` and the shorthand `priceCents,` this
// codebase actually uses in several of these calls (e.g. admin.service.ts's
// tenant.setPlan writes `details: { plan: input.plan, interval, priceCents,
// renewsAt: ... }` — a bare identifier, no colon).
const MONEY_KEY = /\b\w*Cents\b/;
const ACTION = /action:\s*"([^"]+)"/;

describe("every financial audit write is registered in FINANCIAL_AUDIT_ACTIONS", () => {
  const allCalls = SOURCE_FILES.flatMap((file) => recordCallArgs(stripComments(readFileSync(file, "utf8"))));

  it("found record() calls, so a rename or move cannot empty this guard", () => {
    expect(allCalls.length).toBeGreaterThanOrEqual(5);
  });

  it("the money-key pattern matches a known financial call and not a plain one", () => {
    expect(MONEY_KEY.test('{ action: "x", details: { priceCents: 1 } }')).toBe(true);
    expect(MONEY_KEY.test('{ action: "x", details: { amountCents: 1 } }')).toBe(true);
    expect(MONEY_KEY.test('{ action: "x", details: { name: "Co" } }')).toBe(false);
  });

  it("every call whose details carries a *Cents field names a registered action", () => {
    const unregistered = allCalls
      .filter((call) => MONEY_KEY.test(call))
      .map((call) => ACTION.exec(call)?.[1] ?? "(action not found)")
      .filter((action) => !FINANCIAL_AUDIT_ACTIONS.has(action));

    expect(unregistered, "a money-carrying audit action must be in FINANCIAL_AUDIT_ACTIONS").toEqual(
      [],
    );
  });

  it("at least the three known financial actions were found carrying a *Cents field", () => {
    const found = new Set(
      allCalls
        .filter((call) => MONEY_KEY.test(call))
        .map((call) => ACTION.exec(call)?.[1])
        .filter((a): a is string => !!a),
    );
    expect(found.has("tenant.setPlan")).toBe(true);
    expect(found.has("subscription.payment.record")).toBe(true);
    expect(found.has("subscription.payment.void")).toBe(true);
  });
});
