import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { Job } from "@prisma/client";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { JobsService } from "./jobs.service.js";
import {
  createJobSchema,
  updateJobSchema,
  type CreateJobInput,
  type UpdateJobInput,
} from "./jobs.dto.js";

@Controller("jobs")
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  create(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(createJobSchema)) body: CreateJobInput,
  ): Promise<Job> {
    return this.jobs.create(businessId, body);
  }

  @Get()
  findAll(
    @BusinessId() businessId: string,
    @Query("clientId") clientId?: string,
  ): Promise<Job[]> {
    return this.jobs.findAll(businessId, clientId);
  }

  @Get(":id")
  findOne(@BusinessId() businessId: string, @Param("id") id: string): Promise<Job> {
    return this.jobs.findOne(businessId, id);
  }

  @Patch(":id")
  update(
    @BusinessId() businessId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateJobSchema)) body: UpdateJobInput,
  ): Promise<Job> {
    return this.jobs.update(businessId, id, body);
  }

  @Delete(":id")
  remove(@BusinessId() businessId: string, @Param("id") id: string): Promise<void> {
    return this.jobs.remove(businessId, id);
  }
}
