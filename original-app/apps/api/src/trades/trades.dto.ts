import { z } from "zod";

export const createTradeSchema = z.object({
  name: z.string().max(200).trim().min(1),
});
export type CreateTradeInput = z.infer<typeof createTradeSchema>;
