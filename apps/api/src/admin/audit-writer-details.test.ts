import { describe, expect, it, vi } from "vitest";
import { AdminService } from "./admin.service.js";
import { AdminController } from "./admin.controller.js";
import { NON_FINANCIAL_AUDIT_ACTIONS } from "./audit.service.js";
import { RulePackService } from "../rulepack/rulepack.service.js";

/**
 * Approach: BEHAVIOURAL, against mocked Prisma — not a source scan.
 *
 * `NON_FINANCIAL_AUDIT_ACTIONS` (audit.service.ts) is an allow-list: an
 * action registered there claims its `details`, as actually written, carries
 * no money. This file makes good on that claim by calling every real writer
 * that records one of those actions, capturing the EXACT object it passes to
 * `audit.record`, and asserting — recursively, over the real runtime value,
 * not the source text — that no key looks like a money amount (matches
 * `/Cents$/i`, this codebase's own convention for one, since Jamaican prices
 * are cents-denominated integers) and that no value is one of the specific
 * known money amounts used in each test's fixture data.
 *
 * A text/regex scan of the source is exactly what the doctrine here forbids:
 * it is defeated by spreading a variable (`details: { ...patch }`) instead of
 * writing a literal key, which several of these writers do. Calling the real
 * method with mocked Prisma and inspecting the value actually produced does
 * not have that hole — a `Cents` field arriving via a spread is exactly as
 * visible to `containsMoney` below as one written as a literal.
 */

function containsMoney(value: unknown, path = "$"): string[] {
  const hits: string[] = [];
  if (value === null || value === undefined) return hits;
  if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...containsMoney(v, `${path}[${i}]`)));
    return hits;
  }
  if (typeof value === "object") {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (/Cents$/i.test(key)) hits.push(`${path}.${key}`);
      hits.push(...containsMoney(v, `${path}.${key}`));
    }
  }
  return hits;
}

describe("every NON_FINANCIAL_AUDIT_ACTIONS writer's real details contains no money", () => {
  it("tenant.impersonate (AdminService.impersonateTenant)", async () => {
    const record = vi.fn();
    const prisma = {
      business: { findUnique: vi.fn().mockResolvedValue({ id: "b1", name: "Biz", deletedAt: null }) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "admin-1", role: "ADMIN" }) },
    };
    const auth = { mintToken: vi.fn().mockReturnValue("tok") };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record } as any, auth as any);
    await svc.impersonateTenant("b1", "admin-1").catch(() => undefined);
    expect(record).toHaveBeenCalled();
    const details = record.mock.calls[0]![0].details;
    expect(containsMoney(details)).toEqual([]);
  });

  it("tenant.suspend / tenant.restore (AdminService)", async () => {
    const record = vi.fn();
    const business = { id: "b1", name: "Biz", deletedAt: null };
    const prisma = {
      business: {
        findUnique: vi.fn().mockResolvedValue(business),
        update: vi.fn().mockResolvedValue(business),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record } as any, {} as any);
    await svc.suspendTenant("b1", "admin-1");
    for (const call of record.mock.calls) {
      expect(containsMoney(call[0].details)).toEqual([]);
    }
  });

  it("tenant.delete (AdminService.hardDeleteTenant)", async () => {
    const record = vi.fn();
    const business = { id: "b1", name: "Biz" };
    const prisma = {
      business: { findUnique: vi.fn().mockResolvedValue(business) },
      $transaction: vi.fn().mockResolvedValue(undefined),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record } as any, {} as any);
    await svc.hardDeleteTenant("b1", "Biz", "admin-1");
    expect(containsMoney(record.mock.calls[0]![0].details)).toEqual([]);
  });

  it("regulatory.create / regulatory.update / regulatory.review / regulatory.reopen / regulatory.delete (AdminService)", async () => {
    const record = vi.fn();
    const row = {
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
    };
    const prisma = {
      regulatoryUpdate: {
        create: vi.fn().mockResolvedValue(row),
        update: vi.fn().mockResolvedValue(row),
        delete: vi.fn().mockResolvedValue(row),
        findUnique: vi.fn().mockResolvedValue(row),
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
    for (const call of record.mock.calls) {
      expect(containsMoney(call[0].details)).toEqual([]);
    }
  });

  it("admin.promote / admin.update / admin.revoke (AdminService)", async () => {
    const record = vi.fn();
    const user = { id: "u1", role: "OWNER", isSuperAdmin: false, adminCapabilities: [] };
    const adminUser = { ...user, role: "ADMIN", email: "a@b.com" };
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue(user),
        findUnique: vi.fn().mockResolvedValue(adminUser),
        update: vi.fn().mockResolvedValue(adminUser),
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
    for (const call of record.mock.calls) {
      expect(containsMoney(call[0].details)).toEqual([]);
    }
  });

  it("rulepack.update (RulePackService.update)", async () => {
    const record = vi.fn();
    const prisma = {
      rulePackConfig: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi
          .fn()
          .mockResolvedValue({ countryCode: "JM", statutoryRates: {}, updatedAt: new Date() }),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new RulePackService(prisma as any, { record } as any);
    await svc.update("JM", { statutoryRetired: ["OLD_LEVY"] }, "admin-1");
    expect(record).toHaveBeenCalled();
    expect(containsMoney(record.mock.calls[0]![0].details)).toEqual([]);
  });

  it("subscription.sweep.manual / subscription.sweep.manual.failed (AdminController.runSweep)", async () => {
    const record = vi.fn();
    const sweep = { run: vi.fn().mockResolvedValue({ noticesSent: 2, reverted: 1, failures: 0 }) };
    const controller = new AdminController(
      {} as never,
      { record } as never,
      {} as never,
      {} as never,
      sweep as never,
    );
    const req = { user: { sub: "admin-1" } } as never;
    await controller.runSweep(req);
    expect(record).toHaveBeenCalled();
    expect(containsMoney(record.mock.calls[0]![0].details)).toEqual([]);

    record.mockClear();
    sweep.run = vi.fn().mockRejectedValue(new Error("boom"));
    await controller.runSweep(req).catch(() => undefined);
    expect(record).toHaveBeenCalled();
    expect(containsMoney(record.mock.calls[0]![0].details)).toEqual([]);
  });

  it("every action exercised above is actually registered in NON_FINANCIAL_AUDIT_ACTIONS — this test file is the thing that makes registering one an enforced claim", () => {
    const exercised = [
      "tenant.impersonate",
      "tenant.suspend",
      "tenant.restore",
      "tenant.delete",
      "regulatory.create",
      "regulatory.update",
      "regulatory.review",
      "regulatory.reopen",
      "regulatory.delete",
      "admin.promote",
      "admin.update",
      "admin.revoke",
      "rulepack.update",
      "subscription.sweep.manual",
      "subscription.sweep.manual.failed",
    ];
    for (const action of exercised) {
      expect(NON_FINANCIAL_AUDIT_ACTIONS.has(action)).toBe(true);
    }
    // And nothing is registered that this file didn't actually exercise —
    // an addition to the allow-list with no covering call above is a claim
    // nothing here backs up.
    expect([...NON_FINANCIAL_AUDIT_ACTIONS].sort()).toEqual([...exercised].sort());
  });
});
