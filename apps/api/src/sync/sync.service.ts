import { Injectable } from "@nestjs/common";
import type { Client, Project } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ClientChange, ProjectChange, PushInput } from "./sync.dto.js";

export interface PullResult {
  cursor: string;
  changes: {
    clients: Client[];
    projects: Project[];
  };
}

export type PushOutcome =
  | "applied" // the change was written
  | "server_kept" // server's version was newer (LWW) — client should reconcile
  | "foreign"; // id belongs to another business — ignored

export interface PushRowResult {
  table: "clients" | "projects";
  id: string;
  outcome: PushOutcome;
}

export interface PushResult {
  cursor: string;
  results: PushRowResult[];
}

/**
 * Offline-first sync engine (v1: clients + projects — the milestone's proving
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
    const [clients, projects] = await Promise.all([
      this.prisma.client.findMany({ where: base }),
      this.prisma.project.findMany({ where: base }),
    ]);
    return { cursor: cursor.toISOString(), changes: { clients, projects } };
  }

  async push(businessId: string, input: PushInput): Promise<PushResult> {
    const results: PushRowResult[] = [];
    for (const change of input.clients) {
      results.push({ table: "clients", id: change.id, outcome: await this.applyClient(businessId, change) });
    }
    for (const change of input.projects) {
      results.push({ table: "projects", id: change.id, outcome: await this.applyProject(businessId, change) });
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
      // #30 added `town` to the DTO but not here, so an offline client's town
      // edit was accepted with outcome "applied" and silently thrown away.
      town: d.town ?? null,
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

  private async applyProject(businessId: string, change: ProjectChange): Promise<PushOutcome> {
    const existing = await this.prisma.project.findUnique({ where: { id: change.id } });
    if (existing && existing.businessId !== businessId) return "foreign";
    if (existing && existing.updatedAt > new Date(change.updatedAt)) return "server_kept";

    if (change.op === "delete") {
      if (existing) await this.prisma.project.update({ where: { id: change.id }, data: { deletedAt: new Date() } });
      return "applied";
    }

    const d = change.data!;
    const fields = {
      name: d.name,
      clientId: d.clientId ?? null,
      addressLine: d.addressLine ?? null,
      // #30 added `town` to the DTO but not here, so an offline client's town
      // edit was accepted with outcome "applied" and silently thrown away.
      town: d.town ?? null,
      parish: d.parish ?? null,
      deletedAt: null,
    };
    // stage/progressPct are optional, not nullish, and are written separately:
    // an omitted one means the device had nothing to say about it, NOT that
    // the job reverted to QUOTED/0. Folding them into `fields` would let a
    // client on an older build wipe a stage the contractor set on the web
    // every time it pushed that job (#36). On create, Prisma's own column
    // defaults supply QUOTED/0.
    const workflow = {
      ...(d.stage !== undefined ? { stage: d.stage } : {}),
      ...(d.progressPct !== undefined ? { progressPct: d.progressPct } : {}),
    };
    await this.prisma.project.upsert({
      where: { id: change.id },
      create: { id: change.id, businessId, ...fields, ...workflow },
      update: { ...fields, ...workflow },
    });
    return "applied";
  }
}
