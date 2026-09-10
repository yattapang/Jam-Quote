import { BadRequestException, PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";
import { validationMessage } from "./validation-message.js";

/**
 * Validates (and transforms/coerces) a request payload against a Zod schema.
 * Usage: @Body(new ZodValidationPipe(createClientSchema)) body: CreateClientInput
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        // A sentence naming the field, not the words "Validation failed".
        //
        // The reason was always computed and then discarded into `issues`, which
        // nothing in the web app read. And because `errorMessage()` prefers a
        // non-empty server message over its own fallback — rightly, since a server
        // that says something is more specific than "is the API running?" — that
        // generic string beat every careful message in the client. A contractor
        // typing -10 into Discount got three words and no field named.
        //
        // Fixed here rather than in the client so every form benefits at once:
        // `body.message` is already what gets rendered.
        message: validationMessage(result.error.issues),
        // Kept, so a screen can highlight a specific field later. It is the
        // message above that people read.
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
