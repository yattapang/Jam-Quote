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
        parish: input.parish,
        notes: input.notes,
      },
    });
    return withName(client);
  }

  async findAll(businessId: string): Promise<ClientWithName[]> {
    const clients = await this.prisma.client.findMany({
      where: { businessId },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
    return clients.map(withName);
  }

  async findOne(businessId: string, id: string): Promise<ClientWithName> {
    const client = await this.prisma.client.findFirst({ where: { id, businessId } });
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
        parish: input.parish,
        notes: input.notes,
      },
    });
    return withName(client);
  }

  async remove(businessId: string, id: string): Promise<void> {
    await this.findOne(businessId, id);
    await this.prisma.client.delete({ where: { id } });
  }
}
