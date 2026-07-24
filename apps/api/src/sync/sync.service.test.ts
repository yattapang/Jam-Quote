import { describe, expect, it, vi } from "vitest";
import { SyncService } from "./sync.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { PushInput } from "./sync.dto.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_BUSINESS_ID = "99999999-9999-4999-8999-999999999999";

function makePrisma() {
  const prisma = {
    client: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    },
    job: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  return prisma;
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new SyncService(prisma as unknown as PrismaService);
}

const clientData = {
  firstName: "Marcia",
  lastName: "Brown",
  phone: "876-555-0100",
  whatsapp: "876-555-0100",
  email: "marcia@example.com",
  addressLine: "12 Hope Rd",
  parish: "Kingston",
  notes: "Prefers WhatsApp",
};

const jobData = {
  name: "Kitchen renovation",
  clientId: CLIENT_ID,
  addressLine: "12 Hope Rd",
  parish: "Kingston",
  stage: "Quoted",
  progressPct: 0,
};

describe("SyncService.pull", () => {
  it("with no `since`, queries by businessId only and returns cursor + changes", async () => {
    const prisma = makePrisma();
    const rowClient = { id: CLIENT_ID, businessId: BUSINESS_ID, deletedAt: null };
    const rowJob = { id: JOB_ID, businessId: BUSINESS_ID, deletedAt: null };
    prisma.client.findMany.mockResolvedValue([rowClient]);
    prisma.job.findMany.mockResolvedValue([rowJob]);
    const svc = makeService(prisma);

    const result = await svc.pull(BUSINESS_ID);

    expect(prisma.client.findMany).toHaveBeenCalledWith({ where: { businessId: BUSINESS_ID } });
    expect(prisma.job.findMany).toHaveBeenCalledWith({ where: { businessId: BUSINESS_ID } });
    expect(typeof result.cursor).toBe("string");
    expect(new Date(result.cursor).toISOString()).toBe(result.cursor);
    expect(result.changes.clients).toEqual([rowClient]);
    expect(result.changes.jobs).toEqual([rowJob]);
  });

  it("with `since`, the where clause includes updatedAt: { gt: <Date> }", async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);
    const since = "2026-01-01T00:00:00.000Z";

    await svc.pull(BUSINESS_ID, since);

    const expectedWhere = { businessId: BUSINESS_ID, updatedAt: { gt: new Date(since) } };
    expect(prisma.client.findMany).toHaveBeenCalledWith({ where: expectedWhere });
    expect(prisma.job.findMany).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it("passes tombstoned rows (deletedAt set) straight through in the result", async () => {
    const prisma = makePrisma();
    const tombstonedClient = {
      id: CLIENT_ID,
      businessId: BUSINESS_ID,
      deletedAt: new Date("2026-02-01T00:00:00.000Z"),
    };
    const tombstonedJob = {
      id: JOB_ID,
      businessId: BUSINESS_ID,
      deletedAt: new Date("2026-02-01T00:00:00.000Z"),
    };
    prisma.client.findMany.mockResolvedValue([tombstonedClient]);
    prisma.job.findMany.mockResolvedValue([tombstonedJob]);
    const svc = makeService(prisma);

    const result = await svc.pull(BUSINESS_ID);

    expect(result.changes.clients).toEqual([tombstonedClient]);
    expect(result.changes.jobs).toEqual([tombstonedJob]);
  });
});

describe("SyncService.push — clients", () => {
  it("upsert create: findUnique -> null calls upsert with create containing id + businessId; outcome applied", async () => {
    const prisma = makePrisma();
    prisma.client.findUnique.mockResolvedValue(null);
    const svc = makeService(prisma);

    const input: PushInput = {
      clients: [
        {
          id: CLIENT_ID,
          op: "upsert",
          updatedAt: "2026-03-01T00:00:00.000Z",
          data: clientData,
        },
      ],
      jobs: [],
    };

    const result = await svc.push(BUSINESS_ID, input);

    expect(prisma.client.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CLIENT_ID },
        create: expect.objectContaining({ id: CLIENT_ID, businessId: BUSINESS_ID }),
      }),
    );
    expect(result.results).toEqual([{ table: "clients", id: CLIENT_ID, outcome: "applied" }]);
  });

  it("upsert update: existing row, same businessId, existing.updatedAt older than change.updatedAt -> applied, upsert called", async () => {
    const prisma = makePrisma();
    const existing = {
      id: CLIENT_ID,
      businessId: BUSINESS_ID,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    prisma.client.findUnique.mockResolvedValue(existing);
    const svc = makeService(prisma);

    const input: PushInput = {
      clients: [
        {
          id: CLIENT_ID,
          op: "upsert",
          updatedAt: "2026-03-01T00:00:00.000Z",
          data: clientData,
        },
      ],
      jobs: [],
    };

    const result = await svc.push(BUSINESS_ID, input);

    expect(prisma.client.upsert).toHaveBeenCalled();
    expect(result.results).toEqual([{ table: "clients", id: CLIENT_ID, outcome: "applied" }]);
  });

  it("LWW conflict: existing.updatedAt newer than change.updatedAt -> server_kept, upsert NOT called", async () => {
    const prisma = makePrisma();
    const existing = {
      id: CLIENT_ID,
      businessId: BUSINESS_ID,
      updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    };
    prisma.client.findUnique.mockResolvedValue(existing);
    const svc = makeService(prisma);

    const input: PushInput = {
      clients: [
        {
          id: CLIENT_ID,
          op: "upsert",
          updatedAt: "2026-03-01T00:00:00.000Z",
          data: clientData,
        },
      ],
      jobs: [],
    };

    const result = await svc.push(BUSINESS_ID, input);

    expect(prisma.client.upsert).not.toHaveBeenCalled();
    expect(result.results).toEqual([{ table: "clients", id: CLIENT_ID, outcome: "server_kept" }]);
  });

  it("foreign tenant: existing.businessId differs from the acting businessId -> foreign, no write call", async () => {
    const prisma = makePrisma();
    const existing = {
      id: CLIENT_ID,
      businessId: OTHER_BUSINESS_ID,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    prisma.client.findUnique.mockResolvedValue(existing);
    const svc = makeService(prisma);

    const input: PushInput = {
      clients: [
        {
          id: CLIENT_ID,
          op: "upsert",
          updatedAt: "2026-03-01T00:00:00.000Z",
          data: clientData,
        },
      ],
      jobs: [],
    };

    const result = await svc.push(BUSINESS_ID, input);

    expect(prisma.client.upsert).not.toHaveBeenCalled();
    expect(prisma.client.update).not.toHaveBeenCalled();
    expect(result.results).toEqual([{ table: "clients", id: CLIENT_ID, outcome: "foreign" }]);
  });

  it("delete with an existing row: calls update setting deletedAt; outcome applied", async () => {
    const prisma = makePrisma();
    const existing = {
      id: CLIENT_ID,
      businessId: BUSINESS_ID,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    prisma.client.findUnique.mockResolvedValue(existing);
    const svc = makeService(prisma);

    const input: PushInput = {
      clients: [{ id: CLIENT_ID, op: "delete", updatedAt: "2026-03-01T00:00:00.000Z" }],
      jobs: [],
    };

    const result = await svc.push(BUSINESS_ID, input);

    expect(prisma.client.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CLIENT_ID },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(result.results).toEqual([{ table: "clients", id: CLIENT_ID, outcome: "applied" }]);
  });

  it("delete with no existing row: outcome applied, no update call", async () => {
    const prisma = makePrisma();
    prisma.client.findUnique.mockResolvedValue(null);
    const svc = makeService(prisma);

    const input: PushInput = {
      clients: [{ id: CLIENT_ID, op: "delete", updatedAt: "2026-03-01T00:00:00.000Z" }],
      jobs: [],
    };

    const result = await svc.push(BUSINESS_ID, input);

    expect(prisma.client.update).not.toHaveBeenCalled();
    expect(result.results).toEqual([{ table: "clients", id: CLIENT_ID, outcome: "applied" }]);
  });

  it("push returns a cursor and a results array with { table, id, outcome } per change", async () => {
    const prisma = makePrisma();
    prisma.client.findUnique.mockResolvedValue(null);
    const svc = makeService(prisma);

    const input: PushInput = {
      clients: [
        { id: CLIENT_ID, op: "upsert", updatedAt: "2026-03-01T00:00:00.000Z", data: clientData },
      ],
      jobs: [],
    };

    const result = await svc.push(BUSINESS_ID, input);

    expect(typeof result.cursor).toBe("string");
    expect(new Date(result.cursor).toISOString()).toBe(result.cursor);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({ table: "clients", id: CLIENT_ID, outcome: "applied" });
  });
});

describe("SyncService.push — jobs (mirror)", () => {
  it("upsert create: findUnique -> null calls job.upsert with create containing id + businessId; outcome applied", async () => {
    const prisma = makePrisma();
    prisma.job.findUnique.mockResolvedValue(null);
    const svc = makeService(prisma);

    const input: PushInput = {
      clients: [],
      jobs: [{ id: JOB_ID, op: "upsert", updatedAt: "2026-03-01T00:00:00.000Z", data: jobData }],
    };

    const result = await svc.push(BUSINESS_ID, input);

    expect(prisma.job.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: JOB_ID },
        create: expect.objectContaining({ id: JOB_ID, businessId: BUSINESS_ID }),
      }),
    );
    expect(result.results).toEqual([{ table: "jobs", id: JOB_ID, outcome: "applied" }]);
  });

  it("LWW conflict on jobs: existing.updatedAt newer than change.updatedAt -> server_kept, upsert NOT called", async () => {
    const prisma = makePrisma();
    const existing = {
      id: JOB_ID,
      businessId: BUSINESS_ID,
      updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    };
    prisma.job.findUnique.mockResolvedValue(existing);
    const svc = makeService(prisma);

    const input: PushInput = {
      clients: [],
      jobs: [{ id: JOB_ID, op: "upsert", updatedAt: "2026-03-01T00:00:00.000Z", data: jobData }],
    };

    const result = await svc.push(BUSINESS_ID, input);

    expect(prisma.job.upsert).not.toHaveBeenCalled();
    expect(result.results).toEqual([{ table: "jobs", id: JOB_ID, outcome: "server_kept" }]);
  });

  it("foreign tenant on jobs: existing.businessId differs -> foreign, no write call", async () => {
    const prisma = makePrisma();
    const existing = {
      id: JOB_ID,
      businessId: OTHER_BUSINESS_ID,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    prisma.job.findUnique.mockResolvedValue(existing);
    const svc = makeService(prisma);

    const input: PushInput = {
      clients: [],
      jobs: [{ id: JOB_ID, op: "upsert", updatedAt: "2026-03-01T00:00:00.000Z", data: jobData }],
    };

    const result = await svc.push(BUSINESS_ID, input);

    expect(prisma.job.upsert).not.toHaveBeenCalled();
    expect(prisma.job.update).not.toHaveBeenCalled();
    expect(result.results).toEqual([{ table: "jobs", id: JOB_ID, outcome: "foreign" }]);
  });

  it("delete with an existing job row: calls job.update setting deletedAt; outcome applied", async () => {
    const prisma = makePrisma();
    const existing = {
      id: JOB_ID,
      businessId: BUSINESS_ID,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    prisma.job.findUnique.mockResolvedValue(existing);
    const svc = makeService(prisma);

    const input: PushInput = {
      clients: [],
      jobs: [{ id: JOB_ID, op: "delete", updatedAt: "2026-03-01T00:00:00.000Z" }],
    };

    const result = await svc.push(BUSINESS_ID, input);

    expect(prisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: JOB_ID },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(result.results).toEqual([{ table: "jobs", id: JOB_ID, outcome: "applied" }]);
  });

  it("delete with no existing job row: outcome applied, no update call", async () => {
    const prisma = makePrisma();
    prisma.job.findUnique.mockResolvedValue(null);
    const svc = makeService(prisma);

    const input: PushInput = {
      clients: [],
      jobs: [{ id: JOB_ID, op: "delete", updatedAt: "2026-03-01T00:00:00.000Z" }],
    };

    const result = await svc.push(BUSINESS_ID, input);

    expect(prisma.job.update).not.toHaveBeenCalled();
    expect(result.results).toEqual([{ table: "jobs", id: JOB_ID, outcome: "applied" }]);
  });
});
