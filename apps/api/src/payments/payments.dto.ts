import { z } from "zod";
import { PaymentMethod } from "@jamquote/core";

/**
 * Recording a payment the contractor took outside the app — cash, bank
 * transfer, a mobile wallet.
 *
 * This was previously an untyped `@Body() body: { amountCents, method }` with
 * no validation at all, which mattered because recordManualPayment ADDS the
 * amount to invoice.paidCents: a negative amountCents would have silently
 * reduced how much a customer had paid, and an unrecognized method string
 * would have reached Prisma as an invalid enum.
 */
export const recordManualPaymentSchema = z.object({
  // .positive(), not .nonnegative(): a zero-value payment is not a payment,
  // and recording one would add a meaningless row to the customer's history.
  amountCents: z.number().int().positive(),
  method: z.nativeEnum(PaymentMethod),
  /** Cheque number, bank reference, wallet transaction id — whatever the
   * contractor needs to reconcile this against their own records later. */
  reference: z.string().max(120).optional(),
  /** Defaults to now. Accepted so a payment taken on site last week can be
   * recorded with the date it actually happened, which is what the customer's
   * statement has to agree with. */
  paidAt: z.coerce.date().optional(),
});
export type RecordManualPaymentInput = z.infer<typeof recordManualPaymentSchema>;
