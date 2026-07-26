import { z } from "zod";

export const createTradeSchema = z.object({
  name: z.string().trim().min(1),
});
export type CreateTradeInput = z.infer<typeof createTradeSchema>;
