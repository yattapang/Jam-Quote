import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { ClientsService } from "./clients.service.js";

const OWN = {
  id: "cli-1",
  businessId: "biz-1",
  firstName: "Errol",
  lastName: "Brown",
  phone: null,
  whatsapp: null,
  email: null,
  addressLine: null,
  town: null,
  parish: null,
  trn: null,
  notes: null,
  deletedAt: null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function harness(client: Record<string, any> = {}) {
  const prisma = {
    client: {
      findFirst: vi.fn().mockResolvedValue(OWN),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(OWN),
      update: vi.fn().mockResolvedValue(OWN),
      delete: vi.fn(),
      ...client,
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { svc: new ClientsService(prisma as any), prisma };
}

describe("ClientsService.remove", () => {
  it("soft-deletes: stamps deletedAt and never calls prisma.client.delete", async () => {
    const { svc, prisma } = harness();
    await svc.remove("biz-1", "cli-1");

    expect(prisma.client.delete).not.toHaveBeenCalled();
    expect(prisma.client.update).toHaveBeenCalledWith({
      where: { id: "cli-1" },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("leaves clientId on quotes/invoices intact (FKs are ON DELETE SET NULL only for a hard delete)", async () => {
    // Simulate the real DB constraint: a row referencing this client via a
    // foreign key would have its clientId nulled out ONLY if the client row
    // were actually deleted. Since remove() must call `update`, not
    // `delete`, no such cascade is ever triggered — assert that directly.
    const { svc, prisma } = harness();
    await svc.remove("biz-1", "cli-1");
    expect(prisma.client.delete).not.toHaveBeenCalled();
  });
});

describe("ClientsService.findAll", () => {
  it("excludes soft-deleted (tombstoned) clients", async () => {
    const { svc, prisma } = harness({ findMany: vi.fn().mockResolvedValue([OWN]) });
    await svc.findAll("biz-1");
    expect(prisma.client.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz-1", deletedAt: null },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
  });
});

describe("ClientsService.findOne", () => {
  it("404s for a tombstoned client rather than returning it", async () => {
    const { svc, prisma } = harness({ findFirst: vi.fn().mockResolvedValue(null) });
    await expect(svc.findOne("biz-1", "cli-1")).rejects.toThrow(NotFoundException);
    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: "cli-1", businessId: "biz-1", deletedAt: null },
    });
  });
});
