import { z } from "zod";
import { PARISHES, trnSchema } from "@jamquote/core";

export const createBusinessSchema = z.object({
  name: z.string().min(1),
  trn: trnSchema.optional(),
  logoUrl: z.string().url().optional(),
  addressLine: z.string().optional(),
  // Free text: no authoritative town list exists to validate against.
  town: z.string().max(80).optional(),
  parish: z.enum(PARISHES).optional(),
  tradeType: z.string().optional(),
  defaultGctRate: z.number().min(0).max(100).optional(),
  quotePrefix: z.string().min(1).optional(),
  invoicePrefix: z.string().min(1).optional(),
  jmdPerUsd: z.number().positive().optional(),
  /**
   * Where subscription renewal and receipt mail goes.
   *
   * Maintained by the SUBSCRIBER, not by JamQuote staff — whoever owns the
   * login is often not whoever pays the bills. Empty string clears it, and the
   * API falls back to the owner's address while unset, so a renewal reminder
   * is never silently undeliverable.
   */
  billingContactName: z.string().max(120).optional(),
  billingContactEmail: z.union([z.string().email(), z.literal("")]).optional(),
});
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

export const updateBusinessSchema = createBusinessSchema.partial();
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;

/**
 * Logo upload (#27). The image arrives base64-encoded in JSON rather than as
 * multipart: the API validates everything else with Zod through
 * ZodValidationPipe, and one multipart route would mean wiring an upload
 * middleware for a single endpoint.
 *
 * There is deliberately NO contentType field. The format is sniffed from the
 * file's own magic bytes (see logo-image.ts) — a client-declared type is
 * attacker-controlled and is exactly how an SVG or a polyglot gets waved
 * through as "image/png".
 */
export const uploadLogoSchema = z.object({
  // Base64 of the raw file. The decoded-size cap lives in normalizeLogo, which
  // sees the real bytes; capping the encoded string here only bounds the
  // request body (base64 inflates by ~4/3).
  base64: z.string().min(1).max(4 * 1024 * 1024),
});
export type UploadLogoInput = z.infer<typeof uploadLogoSchema>;
