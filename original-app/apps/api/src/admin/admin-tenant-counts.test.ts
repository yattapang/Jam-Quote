import { describe, it, expect, vi } from "vitest";
import { AdminService } from "./admin.service.js";

/**
 * Register item: `admin.service.ts` tenants() `_count: { select: { quotes: true } }`
 * counted every quote row for a tenant, including soft-deleted ones
 * (`Quote.deletedAt` is not null). A tenant who deleted 40 draft quotes still
 * showed "40 quotes" on the admin console.
 *
 * `_count.select.quotes` must carry `where: { deletedAt: null }`, exactly
 * like the `Business.findMany` where-clause above it excludes suspended
 * tenants themselves.
 */
describe("AdminService.tenants — quote _count excludes soft-deleted quotes", () => {
  it("passes where: { deletedAt: null } inside the quotes _count select", async () => {
    const prisma = {
      business: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any, {} as any);

    await svc.tenants();

    const call = prisma.business.findMany.mock.calls[0]?.[0];
    expect(call?.include?._count?.select?.quotes).toEqual({ where: { deletedAt: null } });
  });
});
