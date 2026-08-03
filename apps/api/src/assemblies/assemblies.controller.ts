import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { AssembliesService, type AssemblyWithCost } from "./assemblies.service.js";
import {
  createAssemblySchema,
  updateAssemblySchema,
  type CreateAssemblyInput,
  type UpdateAssemblyInput,
} from "./assemblies.dto.js";

@Controller("assemblies")
@UseGuards(TenantAuthGuard)
export class AssembliesController {
  constructor(private readonly assemblies: AssembliesService) {}

  @Post()
  create(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(createAssemblySchema)) body: CreateAssemblyInput,
  ): Promise<AssemblyWithCost> {
    return this.assemblies.create(businessId, body);
  }

  @Get()
  findAll(@BusinessId() businessId: string): Promise<AssemblyWithCost[]> {
    return this.assemblies.findAll(businessId);
  }

  @Get(":id")
  findOne(
    @BusinessId() businessId: string,
    @Param("id") id: string,
  ): Promise<AssemblyWithCost> {
    return this.assemblies.findOne(businessId, id);
  }

  @Patch(":id")
  update(
    @BusinessId() businessId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateAssemblySchema)) body: UpdateAssemblyInput,
  ): Promise<AssemblyWithCost> {
    return this.assemblies.update(businessId, id, body);
  }

  @Delete(":id")
  remove(@BusinessId() businessId: string, @Param("id") id: string): Promise<void> {
    return this.assemblies.remove(businessId, id);
  }
}
