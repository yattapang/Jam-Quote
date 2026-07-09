import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { QuoteStatus } from "@jamquote/core";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { QuotesService } from "./quotes.service.js";
import {
  createQuoteSchema,
  updateQuoteSchema,
  updateQuoteStatusSchema,
  type CreateQuoteInput,
  type UpdateQuoteInput,
  type UpdateQuoteStatusInput,
} from "./quotes.dto.js";

@Controller("quotes")
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Post()
  create(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(createQuoteSchema)) body: CreateQuoteInput,
  ) {
    return this.quotes.create(businessId, body);
  }

  @Get()
  findAll(
    @BusinessId() businessId: string,
    @Query("status") status?: QuoteStatus,
    @Query("clientId") clientId?: string,
    @Query("jobId") jobId?: string,
  ) {
    return this.quotes.findAll(businessId, { status, clientId, jobId });
  }

  @Get(":id")
  findOne(@BusinessId() businessId: string, @Param("id") id: string) {
    return this.quotes.findOne(businessId, id);
  }

  @Patch(":id")
  update(
    @BusinessId() businessId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateQuoteSchema)) body: UpdateQuoteInput,
  ) {
    return this.quotes.update(businessId, id, body);
  }

  /** Advance the quote's status, e.g. DRAFT -> SENT, SENT -> VIEWED, VIEWED -> ACCEPTED. */
  @Post(":id/status")
  updateStatus(
    @BusinessId() businessId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateQuoteStatusSchema)) body: UpdateQuoteStatusInput,
  ) {
    return this.quotes.updateStatus(businessId, id, body.status);
  }

  /** Create a new revision (version bump, same number, parentQuoteId set). */
  @Post(":id/revise")
  revise(@BusinessId() businessId: string, @Param("id") id: string) {
    return this.quotes.revise(businessId, id);
  }

  @Delete(":id")
  remove(@BusinessId() businessId: string, @Param("id") id: string) {
    return this.quotes.remove(businessId, id);
  }
}
