import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import type { Business } from "@prisma/client";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { BusinessService } from "./business.service.js";
import {
  createBusinessSchema,
  updateBusinessSchema,
  type CreateBusinessInput,
  type UpdateBusinessInput,
} from "./business.dto.js";

@Controller("business")
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createBusinessSchema)) body: CreateBusinessInput,
  ): Promise<Business> {
    return this.business.create(body);
  }

  /** Convenience lookup for the caller's own business. TODO(auth): replace header trust. */
  @Get("current")
  current(@BusinessId() businessId: string): Promise<Business> {
    return this.business.findById(businessId);
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<Business> {
    return this.business.findById(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateBusinessSchema)) body: UpdateBusinessInput,
  ): Promise<Business> {
    return this.business.update(id, body);
  }
}
