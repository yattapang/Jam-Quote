import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import { AdminGuard } from "../auth/admin.guard.js";
import { AdminController } from "./admin.controller.js";
import { AuditService } from "./audit.service.js";

/**
 * GET /admin/audit — the twin of S4 (REVIEW-FINDINGS.md): AdminController.tenants
 * strips `priceCents` from every row for a caller without VIEW_FINANCIALS/
 * MANAGE_TENANTS, but the audit trail's `details` carries the same negotiated
 * price (`tenant.setPlan`) and amount paid (`subscription.payment.record`),
 * and the route declared no @RequireCapability at all — AdminGuard only
 * enforces a capability when one is declared.
 *
 * This runs the real AdminGuard (with a real Reflector) and the real
 * AuditService end to end, exactly as the finding asked: "run the guard, the
 * controller and the service with a capability-less admin, and assert that
 * the money fields come back" — then fixed, then asserted they don't.
 */

function fakeContext(handler: unknown, req: Request): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => AdminController,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
}

function makeGuard(user: { role: string; isSuperAdmin: boolean; adminCapabilities: string[] }) {
  const jwt = { verify: vi.fn().mockReturnValue({ sub: "admin-1" }) };
  const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new AdminGuard(jwt as any, prisma as any, new Reflector());
}

const FINANCIAL_ROW = {
  id: "log-1",
  actorEmail: "admin@jamquote.jm",
  action: "tenant.setPlan",
  targetType: "Business",
  targetId: "biz-1",
  details: { plan: "pro", interval: "annual", priceCents: 480000, renewsAt: "2027-01-01T00:00:00.000Z" },
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
};

async function runAudit(capabilities: string[]) {
  const guard = makeGuard({ role: "ADMIN", isSuperAdmin: false, adminCapabilities: capabilities });
  const req = { headers: { authorization: "Bearer t" } } as unknown as Request;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auditService = new AuditService({ auditLog: { findMany: vi.fn().mockResolvedValue([FINANCIAL_ROW]) } } as any);
  const controller = new AdminController(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    {} as any,
    auditService,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    {} as any,
  );

  const allowed = await guard.canActivate(fakeContext(controller.audit, req));
  expect(allowed).toBe(true); // the route takes any admin — no @RequireCapability

  return controller.audit(req);
}

describe("GET /admin/audit — financial redaction for a capability-less admin", () => {
  it("a capability-less admin does not get the negotiated price back", async () => {
    const rows = await runAudit([]);
    const dump = JSON.stringify(rows);
    expect(dump).not.toMatch(/priceCents|480000/);
  });

  it("VIEW_FINANCIALS gets the negotiated price", async () => {
    const rows = await runAudit(["VIEW_FINANCIALS"]);
    expect(rows[0]?.details).toEqual(FINANCIAL_ROW.details);
  });

  it("MANAGE_TENANTS (which can already set the price via setTenantPlan) also gets it", async () => {
    const rows = await runAudit(["MANAGE_TENANTS"]);
    expect(rows[0]?.details).toEqual(FINANCIAL_ROW.details);
  });
});
