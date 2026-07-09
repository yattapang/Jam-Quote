import { Injectable, NotFoundException } from "@nestjs/common";
import type { Client } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateClientInput, UpdateClientInput } from "./clients.dto.js";

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  create(businessId: string, input: CreateClientInput): Promise<Client> {
    return this.prisma.client.create({ data: { ...input, businessId } });
  }

  findAll(businessId: string): Promise<Client[]> {
    return this.prisma.client.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
    });
  }

  async findOne(businessId: string, id: string): Promise<Client> {
    const client = await this.prisma.client.findFirst({ where: { id, businessId } });
    if (!client) throw new NotFoundException("Client not found");
    return client;
  }

  async update(businessId: string, id: string, input: UpdateClientInput): Promise<Client> {
    await this.findOne(businessId, id);
    return this.prisma.client.update({ where: { id }, data: input });
  }

  async remove(businessId: string, id: string): Promise<void> {
    await this.findOne(businessId, id);
    await this.prisma.client.delete({ where: { id } });
  }
}
