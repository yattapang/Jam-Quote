import { Body, Controller, Post } from "@nestjs/common";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { SyncService, type PullResult, type PushResult } from "./sync.service.js";
import { pullSchema, pushSchema, type PullInput, type PushInput } from "./sync.dto.js";

@Controller("sync")
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /** Delta pull: rows (incl. tombstones) changed since `since`, plus a new cursor. */
  @Post("pull")
  pull(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(pullSchema)) body: PullInput,
  ): Promise<PullResult> {
    return this.sync.pull(businessId, body.since);
  }

  /** Push device changes; applied with last-write-wins, idempotent by client UUID. */
  @Post("push")
  push(
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(pushSchema)) body: PushInput,
  ): Promise<PushResult> {
    return this.sync.push(businessId, body);
  }
}
