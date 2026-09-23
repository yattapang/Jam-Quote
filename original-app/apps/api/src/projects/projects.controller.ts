import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { Project } from "@prisma/client";
import { TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { ProjectsService } from "./projects.service.js";
import {
  createProjectSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
} from "./projects.dto.js";

@Controller("projects")
@UseGuards(TenantAuthGuard)
export class ProjectsController {
  constructor(private readonly jobs: ProjectsService) {}

  @Post()
  create(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectInput,
  ): Promise<Project> {
    return this.jobs.create(businessId, body);
  }

  @Get()
  findAll(
    @BusinessId() businessId: string,
    @Query("clientId") clientId?: string,
  ): Promise<Project[]> {
    return this.jobs.findAll(businessId, clientId);
  }

  @Get(":id")
  findOne(@BusinessId() businessId: string, @Param("id") id: string): Promise<Project> {
    return this.jobs.findOne(businessId, id);
  }

  @Patch(":id")
  update(
    @BusinessId() businessId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) body: UpdateProjectInput,
  ): Promise<Project> {
    return this.jobs.update(businessId, id, body);
  }

  @Delete(":id")
  remove(@BusinessId() businessId: string, @Param("id") id: string): Promise<void> {
    return this.jobs.remove(businessId, id);
  }
}
