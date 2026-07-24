import { Injectable } from "@nestjs/common";
import type { Client, Job } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ClientChange, JobChange, PushInput } from "./sync.dto.js";

export interface PullResult {
  cursor: string;
  changes: {
    clients: Client[];
    jobs: Job[];
  };
}

export type PushOutcome =
  | "applied" // the change was written
  | "server_kept" // server's version was newer (LWW) — client should reconcile
  | "foreign"; // id belongs to another business — ignored

export interface PushRowResult {
  table: "clients" | "jobs";
  id: string;
  outcome: PushOutcome;
}

export interface PushResult {
  cursor: string;
  results: PushRowResult[];
}

/**
 * Offline-first sync engine (v1: clients + jobs — the milestone's proving
 * ground). Pull returns every row (including tombstones) changed since the
 * caller's cursor; push applies device changes with record-level last-write-
 * wins by server-authoritative updatedAt. See docs/SYNC.md.
 *
 * Everything is tenant-scoped by businessId and idempotent (upsert by the
 * client-generated UUID), so re-sending the same change is safe.
 */
@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async pull(businessId: string, since?: string): Promise<PullResult> {
    const cursor = new Date();
    const base = since ? { businessId, updatedAt: { gt: new Date(since) } } : { businessId };
    const [clients, jobs] = await Promise.all([
      this.prisma.client.findMany({ where: base }),
      this.prisma.job.findMany({ where: base }),
    ]);
    return { cursor: cursor.toISOString(), changes: { clients, jobs } };
  }

  async push(businessId: string, input: PushInput): Promise<PushResult> {
    const results: PushRowResult[] = [];
    for (const change of input.clients) {
      results.push({ table: "clients", id: change.id, outcome: await this.applyClient(businessId, change) });
    }
    for (const change of input.jobs) {
      results.push({ table: "jobs", id: change.id, outcome: await this.applyJob(businessId, change) });
    }
    return { cursor: new Date().toISOString(), results };
  }

  private async applyClient(businessId: string, change: ClientChange): Promise<PushOutcome> {
    const existing = await this.prisma.client.findUnique({ where: { id: change.id } });
    if (existing && existing.businessId !== businessId) return "foreign";
    if (existing && existing.updatedAt > new Date(change.updatedAt)) return "server_kept";

    if (change.op === "delete") {
      if (existing) await this.prisma.client.update({ where: { id: change.id }, data: { deletedAt: new Date() } });
      return "applied";
    }

    const d = change.data!;
    const fields = {
      firstName: d.firstName,
      lastName: d.lastName ?? "",
      phone: d.phone ?? null,
      whatsapp: d.whatsapp ?? null,
      email: d.email ?? null,
      addressLine: d.addressLine ?? null,
      parish: d.parish ?? null,
      notes: d.notes ?? null,
      deletedAt: null,
    };
    await this.prisma.client.upsert({
      where: { id: change.id },
      create: { id: change.id, businessId, ...fields },
      update: fields,
    });
    return "applied";
  }

  private async applyJob(businessId: string, change: JobChange): Promise<PushOutcome> {
    const existing = await this.prisma.job.findUnique({ where: { id: change.id } });
    if (existing && existing.businessId !== businessId) return "foreign";
    if (existing && existing.updatedAt > new Date(change.updatedAt)) return "server_kept";

    if (change.op === "delete") {
      if (existing) await this.prisma.job.update({ where: { id: change.id }, data: { deletedAt: new Date() } });
      return "applied";
    }

    const d = change.data!;
    const fields = {
      name: d.name,
      clientId: d.clientId ?? null,
      addressLine: d.addressLine ?? null,
      parish: d.parish ?? null,
      stage: d.stage ?? "Quoted",
      progressPct: d.progressPct ?? 0,
      deletedAt: null,
    };
    await this.prisma.job.upsert({
      where: { id: change.id },
      create: { id: change.id, businessId, ...fields },
      update: fields,
    });
    return "applied";
  }
}
