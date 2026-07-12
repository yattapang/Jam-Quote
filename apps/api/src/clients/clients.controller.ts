import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { ClientsService, type ClientWithName } from "./clients.service.js";
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
  ): Promise<ClientWithName> {
    return this.clients.create(businessId, body);
  }

  @Get()
  findAll(@BusinessId() businessId: string): Promise<ClientWithName[]> {
    return this.clients.findAll(businessId);
  }

  @Get(":id")
  findOne(@BusinessId() businessId: string, @Param("id") id: string): Promise<ClientWithName> {
    return this.clients.findOne(businessId, id);
  }

  @Patch(":id")
  update(
    @BusinessId() businessId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateClientSchema)) body: UpdateClientInput,
  ): Promise<ClientWithName> {
    return this.clients.update(businessId, id, body);
  }

  @Delete(":id")
  remove(@BusinessId() businessId: string, @Param("id") id: string): Promise<void> {
    return this.clients.remove(businessId, id);
  }
}
