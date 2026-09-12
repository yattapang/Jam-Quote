import { Injectable, NotFoundException } from "@nestjs/common";
import type { Client } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { resolveClientName, type CreateClientInput, type UpdateClientInput } from "./clients.dto.js";

// apps/mobile still reads a computed `name` field, so every Client the API
// returns carries firstName + lastName AND this derived `name`.
export type ClientWithName = Client & { name: string };

function withName(client: Client): ClientWithName {
  return { ...client, name: `${client.firstName} ${client.lastName}`.trim() };
}

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(businessId: string, input: CreateClientInput): Promise<ClientWithName> {
    // createClientSchema's refine() guarantees firstName is resolvable here.
    const { firstName, lastName } = resolveClientName(input);
    const client = await this.prisma.client.create({
      data: {
        businessId,
        firstName: firstName!,
        lastName: lastName ?? "",
        phone: input.phone,
        whatsapp: input.whatsapp,
        email: input.email,
        addressLine: input.addressLine,
        // `town` was accepted by the DTO and never written here, so anything a
        // contractor typed was silently discarded — the same shape as the
        // email gate that was declared and dropped.
        town: input.town,
        parish: input.parish,
        trn: normalizeTrn(input.trn),
        notes: input.notes,
      },
    });
    return withName(client);
  }

  async findAll(businessId: string): Promise<ClientWithName[]> {
    const clients = await this.prisma.client.findMany({
      where: { businessId, deletedAt: null },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
    return clients.map(withName);
  }

  async findOne(businessId: string, id: string): Promise<ClientWithName> {
    const client = await this.prisma.client.findFirst({ where: { id, businessId, deletedAt: null } });
    if (!client) throw new NotFoundException("Client not found");
    return withName(client);
  }

  async update(businessId: string, id: string, input: UpdateClientInput): Promise<ClientWithName> {
    await this.findOne(businessId, id);
    const { firstName, lastName } = resolveClientName(input);
    const client = await this.prisma.client.update({
      where: { id },
      data: {
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {}),
        phone: input.phone,
        whatsapp: input.whatsapp,
        email: input.email,
        addressLine: input.addressLine,
        town: input.town,
        parish: input.parish,
        // Only when the caller mentioned it: an update that omits `trn`
        // entirely must not wipe one that is already stored.
        ...(input.trn !== undefined ? { trn: normalizeTrn(input.trn) } : {}),
        notes: input.notes,
      },
    });
    return withName(client);
  }

  /**
   * Soft delete, for the same reason `ProjectsService.remove` and
   * `QuotesService.remove` were moved off a hard delete: `Client.deletedAt`
   * has always been declared "soft-delete for offline sync", but this used
   * `prisma.client.delete`. The FKs on `Job`/`Quote`/`Invoice` are `ON DELETE
   * SET NULL`, so a hard delete rewrote every document already in a
   * customer's hands to `clientName: null` and left no tombstone for a phone
   * to later recreate the client from a stale `op: "upsert"`.
   */
  async remove(businessId: string, id: string): Promise<void> {
    await this.findOne(businessId, id);
    await this.prisma.client.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}

/** Empty means "no TRN", stored as null rather than as an empty string — a
 * blank cell and a stored blank are the same fact, and only one of them should
 * exist in the column. */
function normalizeTrn(trn: string | undefined): string | null | undefined {
  if (trn === undefined) return undefined;
  return trn.trim() ? trn.trim() : null;
}
