import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import type { Client } from "@prisma/client";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { ClientsService } from "./clients.service.js";
import {
  createClientSchema,
  updateClientSchema,
  type CreateClientInput,
  type UpdateClientInput,
} from "./clients.dto.js";

@Controller("clients")
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Post()
  create(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(createClientSchema)) body: CreateClientInput,
  ): Promise<Client> {
    return this.clients.create(businessId, body);
  }

  @Get()
  findAll(@BusinessId() businessId: string): Promise<Client[]> {
    return this.clients.findAll(businessId);
  }

  @Get(":id")
  findOne(@BusinessId() businessId: string, @Param("id") id: string): Promise<Client> {
    return this.clients.findOne(businessId, id);
  }

  @Patch(":id")
  update(
    @BusinessId() businessId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateClientSchema)) body: UpdateClientInput,
  ): Promise<Client> {
    return this.clients.update(businessId, id, body);
  }

  @Delete(":id")
  remove(@BusinessId() businessId: string, @Param("id") id: string): Promise<void> {
    return this.clients.remove(businessId, id);
  }
}
