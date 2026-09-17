import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve as resolvePath, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  collect,
  declaredTypeImport,
  declaredTypeText,
  enclosingFunctionKey,
  parseFile,
  staticStrings,
  unwrap,
} from "@jamquote/test-ast";
import { AdminService } from "./admin.service.js";
import { AdminController } from "./admin.controller.js";
import { NON_FINANCIAL_AUDIT_ACTIONS } from "./audit.service.js";
import { RulePackService } from "../rulepack/rulepack.service.js";

/**
 * `NON_FINANCIAL_AUDIT_ACTIONS` (audit.service.ts) is an allow-list: registering an action
 * claims its `details`, as actually written, carries no money. This file makes good on it.
 *
 * ## Why not a type (rung 1 of the guard doctrine)
 *
 * The compiler cannot hold "no money" here without changes this file cannot make.
 * `Cents` is `type Cents = number` (packages/core/src/tax/money.ts), unbranded, so a money
 * amount and a count (`noticesSent`) are the same type and no `AuditDetails` can exclude
 * one but not the other; branding it touches every money producer across core, api and
 * web. A `financial`-field split of `RecordAuditInput` would have to rewrite the call
 * sites in admin.service.ts, which another agent owns. Until one lands, it is enforced here.
 *
 * ## What is enforced, and how
 *
 * 1. DISCOVERY, not a list. Every `x.record(...)` in apps/api/src whose receiver's
 *    DECLARED type resolves (through `@jamquote/test-ast`) to the `AuditService` import of
 *    `admin/audit.service.ts` is an audit call site. Its `action` must be a closed set of
 *    strings (`staticStrings`) or the guard fails: an action it cannot read is an action it
 *    cannot check. Every registered action must have a call site, and the behavioural tests
 *    below must exercise every registered action. The set exercised is captured from the
 *    mocked `record`; the registered set is the export. Neither is typed out here.
 * 2. MONEY BY VALUE, not by key spelling. Every Prisma row a writer reads is a `row()`
 *    proxy: a field the fixture did not define reads as a unique SENTINEL number. A
 *    `details` carrying any sentinel, under any key, through any spread or rename, copied a
 *    column this test never vouched for, and fails. The old check matched `/Cents$/` on
 *    keys, which `{ amount: payment.amountCents }` walked straight past.
 * 3. DISCOVERY does not stop at a resolved import. A receiver named `record` on something
 *    typed `AuditService` from a same-file class, or one a reviewer widened to `any` (an
 *    `AuditService` field cast away, or a constructor parameter left untyped) has no
 *    import for `declaredTypeImport` to resolve to and used to slip past silently. A site
 *    is now also discovered when the receiver is a bare `audit` (`this.audit.record(...)`,
 *    `audit.record(...)`) or its declared type TEXT reads `AuditService` even when that
 *    text does not resolve to an import — `declaredTypeText`, which returns a name (or
 *    `"any"`) without needing one.
 *
 * ## What it does not prove
 *
 * An amount taken from the request DTO rather than a row is not a sentinel. A writer path
 * these fixtures do not reach is not inspected. A receiver named something other than
 * `audit` AND typed neither `AuditService` nor `any`-with-that-name (a renamed field
 * inferred from something else entirely) is not discovered; the per-file assertion fails
 * if one of today's recording files stops resolving.
 */

// ─────────────────────────────────────────────────────────── money by value

const SENTINELS = new Set<number>();
let nextSentinel = 7_310_000_001;

/** A Prisma row whose undefined fields read as sentinels. */
function row<T extends object>(fields: T): T {
  return new Proxy(fields, {
    get(target, key, receiver) {
      if (typeof key === "symbol" || key in target || key === "then" || key === "toJSON") {
        return Reflect.get(target, key, receiver);
      }
      const v = nextSentinel++;
      SENTINELS.add(v);
      Reflect.set(target, key, v);
      return v;
    },
  });
}

function sentinelsIn(value: unknown, path = "$"): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "number" || typeof value === "bigint") {
    return SENTINELS.has(Number(value)) ? [path] : [];
  }
  if (typeof value === "string") {
    return [...SENTINELS].some((s) => value.includes(String(s))) ? [path] : [];
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => sentinelsIn(v, `${path}[${i}]`));
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => sentinelsIn(v, `${path}.${k}`));
  }
  return [];
}

/** Actions every mocked `record` below actually received, across the whole file. */
const exercised = new Set<string>();
function recorder() {
  return vi.fn(async (input: { action: string; details?: unknown }) => {
    exercised.add(input.action);
  });
}
function expectNoMoney(record: ReturnType<typeof recorder>) {
  expect(record.mock.calls.length).toBeGreaterThan(0);
  for (const [input] of record.mock.calls) {
    expect(sentinelsIn(input.details), input.action).toEqual([]);
  }
}

// ───────────────────────────────────────────────────────────── discovery

const API_SRC = join(process.cwd(), "src");
const AUDIT_SERVICE = join(API_SRC, "admin", "audit.service.ts");

function sourceFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

interface Site {
  file: string;
  where: string;
  actions: string[] | undefined;
}

/**
 * Does this `record`'s receiver look like the audit service even when
 * `declaredTypeImport` cannot resolve it to the real import — a receiver named `audit`
 * (`this.audit`, a bare local `audit`), or one whose declared type TEXT is `AuditService`
 * (a same-file class, or something the guard cannot otherwise place)? Catches a second
 * writer whose field was typed or cast to `any`: `declaredTypeImport` sees no import at
 * all for `any`, but a receiver still named `audit` is exactly the shape a reviewer would
 * recognise as the audit service, so it must not be able to opt out by widening its type.
 */
function looksLikeAuditReceiver(expr: ts.Expression): boolean {
  const e = unwrap(expr);
  const name = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : undefined;
  if (name === "audit") return true;
  return declaredTypeText(e) === "AuditService";
}

function auditSites(file: string): Site[] {
  const sf = parseFile(file);
  if (!sf.text.includes("record")) return [];
  const rel = file.slice(API_SRC.length + 1).split(sep).join("/");
  const sites: Site[] = [];
  for (const call of collect(sf, ts.isCallExpression)) {
    const callee = unwrap(call.expression);
    if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "record") continue;
    const type = declaredTypeImport(callee.expression);
    const resolvedToAuditService =
      !!type &&
      type.exportedName === "AuditService" &&
      resolvePath(dirname(file), type.moduleSpecifier.replace(/\.js$/, ".ts")) === AUDIT_SERVICE;
    if (!resolvedToAuditService && !looksLikeAuditReceiver(callee.expression)) continue;
    const arg = call.arguments[0] && unwrap(call.arguments[0]);
    let actions: string[] | undefined;
    if (arg && ts.isObjectLiteralExpression(arg)) {
      const prop = arg.properties.find((p) => p.name && ts.isIdentifier(p.name) && p.name.text === "action");
      if (prop && ts.isPropertyAssignment(prop)) actions = staticStrings(prop.initializer);
      else if (prop && ts.isShorthandPropertyAssignment(prop)) actions = staticStrings(prop.name);
    }
    // Keyed by the ENCLOSING FUNCTION, not a line number. A line-keyed baseline broke
    // on any edit above a call site: adding six lines to `nextRenewal` shifted eleven
    // pinned entries at once, and that diff is indistinguishable from a real new
    // writer — the safe edit and the dangerous one look identical, so the guard would
    // be re-baselined by reflex. A function key moves only when the writer really moves.
    sites.push({ file: rel, where: `${rel}#${enclosingFunctionKey(call)}`, actions });
  }
  return sites;
}

const sites = sourceFiles(API_SRC).flatMap(auditSites);
const discovered = new Set(sites.flatMap((s) => s.actions ?? []));

/**
 * Call sites per REGISTERED action, keyed `file#function`, so a second writer of an already-covered
 * action cannot ship unexamined. Keying the guard by action alone (as this file used to)
 * meant a NEW call site writing `details` under an EXISTING action — e.g. a second place
 * that writes `tenant.suspend` with `details: { negotiatedPrice: dto.amountCents }` —
 * changed nothing the guard looked at, because the first call site for that action was
 * already exercised above. Pinning the exact site SET means a new site changes the set
 * and fails here until a behavioural test (in the describe block below) exercises it too.
 */
function sitesByAction(): Map<string, string[]> {
  const byAction = new Map<string, string[]>();
  for (const s of sites) {
    for (const a of s.actions ?? []) {
      if (!NON_FINANCIAL_AUDIT_ACTIONS.has(a)) continue;
      byAction.set(a, [...(byAction.get(a) ?? []), s.where]);
    }
  }
  for (const list of byAction.values()) list.sort();
  return byAction;
}

/** Baseline captured when this guard was written — the call sites per registered action,
 * keyed `file#function`. Duplicates are significant: two writers of one action inside one
 * function appear twice, so a second one still changes this list.
 * each covered by a behavioural test below. Update this ONLY alongside a new behavioural
 * test that exercises the added or moved site. */
const KNOWN_AUDIT_SITES: Record<string, string[]> = {
  "admin.promote": ["admin/admin.service.ts#promoteAdmin"],
  "admin.revoke": ["admin/admin.service.ts#revokeAdmin"],
  "admin.update": ["admin/admin.service.ts#updateAdmin"],
  "regulatory.create": ["admin/admin.service.ts#createRegulatory"],
  "regulatory.delete": ["admin/admin.service.ts#deleteRegulatory"],
  "regulatory.reopen": ["admin/admin.service.ts#reviewRegulatory"],
  "regulatory.review": ["admin/admin.service.ts#reviewRegulatory"],
  "regulatory.update": ["admin/admin.service.ts#updateRegulatory"],
  "rulepack.update": ["rulepack/rulepack.service.ts#update"],
  "subscription.sweep.manual": ["admin/admin.controller.ts#runSweep"],
  "subscription.sweep.manual.failed": ["admin/admin.controller.ts#runSweep"],
  "tenant.delete": ["admin/admin.service.ts#hardDeleteTenant"],
  "tenant.impersonate": ["admin/admin.service.ts#impersonateTenant"],
  "tenant.restore": ["admin/admin.service.ts#restoreTenant"],
  "tenant.suspend": ["admin/admin.service.ts#suspendTenant"],
};

describe("audit call sites are discovered, not listed", () => {
  it("finds call sites in every file that records today, so a rename cannot empty the guard", () => {
    const files = new Set(sites.map((s) => s.file));
    for (const f of [
      "admin/admin.service.ts",
      "admin/admin.controller.ts",
      "admin/subscription-payments.service.ts",
      "rulepack/rulepack.service.ts",
    ]) {
      expect(files.has(f), `no audit call site discovered in ${f}`).toBe(true);
    }
    expect(sites.length).toBeGreaterThanOrEqual(NON_FINANCIAL_AUDIT_ACTIONS.size);
  });

  it("every call site's action is a closed set of strings the guard can read", () => {
    expect(sites.filter((s) => !s.actions).map((s) => s.where)).toEqual([]);
  });

  it("every registered action has a real call site (no stale registration)", () => {
    expect([...NON_FINANCIAL_AUDIT_ACTIONS].filter((a) => !discovered.has(a))).toEqual([]);
  });

  it("discovery also sees the REDACTED actions, so it is not merely echoing the allow-list", () => {
    expect([...discovered].filter((a) => !NON_FINANCIAL_AUDIT_ACTIONS.has(a)).length).toBeGreaterThan(0);
  });

  it("every registered action's call-site SET matches the pinned baseline — a new or moved site fails until a behavioural test covers it", () => {
    const actual = sitesByAction();
    const actualObj = Object.fromEntries([...actual].map(([a, ws]) => [a, [...ws].sort()]));
    const knownObj = Object.fromEntries(
      Object.entries(KNOWN_AUDIT_SITES).map(([a, ws]) => [a, [...ws].sort()]),
    );
    expect(actualObj).toEqual(knownObj);
  });

  it("the sentinel detector fires on a copied column under any key, and not on a fixtured value", () => {
    const r = row({ id: "b1", name: "Biz" }) as { id: string; name: string } & Record<string, unknown>;
    expect(sentinelsIn({ anything: r.proMonthlyPriceCents })).toEqual(["$.anything"]);
    expect(sentinelsIn({ nested: [{ v: `${r.amount}` }] })).toEqual(["$.nested[0].v"]);
    expect(sentinelsIn({ id: r.id, name: r.name, noticesSent: 2 })).toEqual([]);
  });
});

describe("every NON_FINANCIAL_AUDIT_ACTIONS writer's real details contains no money", () => {
  it("tenant.impersonate (AdminService.impersonateTenant)", async () => {
    const record = recorder();
    const prisma = {
      business: { findUnique: vi.fn().mockResolvedValue(row({ id: "b1", name: "Biz", deletedAt: null })) },
      user: { findUnique: vi.fn().mockResolvedValue(row({ id: "admin-1", role: "ADMIN" })) },
    };
    const auth = { mintToken: vi.fn().mockReturnValue("tok") };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record } as any, auth as any);
    await svc.impersonateTenant("b1", "admin-1").catch(() => undefined);
    expectNoMoney(record);
  });

  it("tenant.suspend / tenant.restore (AdminService)", async () => {
    const record = recorder();
    const prisma = {
      business: {
        findUnique: vi.fn().mockResolvedValue(row({ id: "b1", name: "Biz", deletedAt: null as Date | null })),
        update: vi.fn().mockResolvedValue(row({ id: "b1", name: "Biz", deletedAt: new Date() as Date | null })),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record } as any, {} as any);
    await svc.suspendTenant("b1", "admin-1");
    prisma.business.findUnique.mockResolvedValue(row({ id: "b1", name: "Biz", deletedAt: new Date() }));
    prisma.business.update.mockResolvedValue(row({ id: "b1", name: "Biz", deletedAt: null }));
    await svc.restoreTenant("b1", "admin-1");
    expectNoMoney(record);
  });

  it("tenant.delete (AdminService.hardDeleteTenant)", async () => {
    const record = recorder();
    const prisma = {
      business: { findUnique: vi.fn().mockResolvedValue(row({ id: "b1", name: "Biz" })) },
      $transaction: vi.fn().mockResolvedValue(undefined),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record } as any, {} as any);
    await svc.hardDeleteTenant("b1", "Biz", "admin-1");
    expectNoMoney(record);
  });

  it("regulatory.create / regulatory.update / regulatory.review / regulatory.reopen / regulatory.delete (AdminService)", async () => {
    const record = recorder();
    const fields = () => ({
      id: "r1",
      title: "New GCT threshold",
      category: "TAX",
      summary: "s",
      effectiveDate: null,
      actionNeeded: null,
      sourceUrl: null,
      publishedAt: null,
      reviewedAt: null,
      reviewedByUserId: null,
    });
    const prisma = {
      regulatoryUpdate: {
        create: vi.fn().mockResolvedValue(row(fields())),
        update: vi.fn().mockResolvedValue(row(fields())),
        delete: vi.fn().mockResolvedValue(row(fields())),
        findUnique: vi.fn().mockResolvedValue(row(fields())),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record } as any, {} as any);

    await svc.createRegulatory({ title: "t", category: "TAX", summary: "s" } as never, "admin-1");
    await svc.updateRegulatory("r1", { title: "t2" } as never, "admin-1");
    await svc.reviewRegulatory("r1", true, "admin-1");
    await svc.reviewRegulatory("r1", false, "admin-1");
    await svc.deleteRegulatory("r1", "admin-1");

    expect(record.mock.calls.length).toBeGreaterThanOrEqual(5);
    expectNoMoney(record);
  });

  it("admin.promote / admin.update / admin.revoke (AdminService)", async () => {
    const record = recorder();
    const user = () => ({ id: "u1", role: "OWNER", isSuperAdmin: false, adminCapabilities: [] as string[] });
    const adminUser = () => ({ ...user(), role: "ADMIN", email: "a@b.com" });
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue(row(user())),
        findUnique: vi.fn().mockResolvedValue(row(adminUser())),
        update: vi.fn().mockResolvedValue(row(adminUser())),
        count: vi.fn().mockResolvedValue(2),
      },
    };
    const actor = { userId: "admin-1", isSuperAdmin: true };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record } as any, {} as any);

    await svc.promoteAdmin({ email: "a@b.com", capabilities: [] } as never, actor as never);
    await svc.updateAdmin("u1", { capabilities: ["VIEW_FINANCIALS"] } as never, actor as never);
    await svc.revokeAdmin("u1", { ...actor, userId: "other-admin" } as never);

    expect(record.mock.calls.length).toBeGreaterThanOrEqual(3);
    expectNoMoney(record);
  });

  it("rulepack.update (RulePackService.update)", async () => {
    const record = recorder();
    const prisma = {
      rulePackConfig: {
        findUnique: vi.fn().mockResolvedValue(null),
        // Every column toOverride/toEffective reads is fixtured: an unfixtured nullable
        // Date would otherwise read as a sentinel NUMBER and break the path under test.
        upsert: vi.fn().mockResolvedValue(
          row({
            countryCode: "JM",
            statutoryRates: {},
            statutoryCustom: null,
            statutoryRetired: [],
            taxLabel: null,
            defaultTaxRatePct: null,
            verifiedAsOf: null,
            sources: null,
            sourceUrl: null,
            updatedAt: new Date(),
          }),
        ),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new RulePackService(prisma as any, { record } as any);
    await svc.update("JM", { statutoryRetired: ["OLD_LEVY"] }, "admin-1");
    expectNoMoney(record);
  });

  it("subscription.sweep.manual / subscription.sweep.manual.failed (AdminController.runSweep)", async () => {
    const record = recorder();
    const sweep = { run: vi.fn().mockResolvedValue({ noticesSent: 2, reverted: 1, failures: 0 }) };
    const controller = new AdminController({} as never, { record } as never, {} as never, {} as never, sweep as never);
    const req = { user: { sub: "admin-1" } } as never;
    await controller.runSweep(req);
    sweep.run = vi.fn().mockRejectedValue(new Error("boom"));
    await controller.runSweep(req).catch(() => undefined);
    expectNoMoney(record);
  });

  // Last in the file (vitest runs a file's tests in order): what was exercised is
  // captured from the mocks above, what is registered is the export.
  it("every registered action was exercised above, and nothing exercised is unregistered or undiscovered", () => {
    expect([...NON_FINANCIAL_AUDIT_ACTIONS].filter((a) => !exercised.has(a))).toEqual([]);
    expect([...exercised].filter((a) => !NON_FINANCIAL_AUDIT_ACTIONS.has(a))).toEqual([]);
    expect([...exercised].filter((a) => !discovered.has(a))).toEqual([]);
  });
});
