import { Body, Controller, Get, Post } from "@nestjs/common";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { TradesService, type TradeView } from "./trades.service.js";
import { createTradeSchema, type CreateTradeInput } from "./trades.dto.js";

@Controller("trades")
export class TradesController {
  constructor(private readonly trades: TradesService) {}

  @Get()
  findAll(@BusinessId() businessId: string): Promise<TradeView[]> {
    return this.trades.findAll(businessId);
  }

  @Post()
  create(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(createTradeSchema)) body: CreateTradeInput,
  ): Promise<TradeView> {
    return this.trades.create(businessId, body);
  }
}
