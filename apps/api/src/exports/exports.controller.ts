import { Controller, Get, Param, Query, Res, UseGuards, BadRequestException } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { ExportsService, type ExportFile } from "./exports.service.js";

/** The period to export. Both ends are calendar dates and both are inclusive. */
export const exportRangeSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD"),
  })
  .refine((v) => v.from <= v.to, { message: "from must not be after to" });
export type ExportRangeQuery = z.infer<typeof exportRangeSchema>;

/** The files on offer. A closed set, so the route cannot be used to reach an
 * arbitrary method on the service. */
const FILES = ["invoices-issued", "invoice-lines", "payments-received", "clients"] as const;
type FileSlug = (typeof FILES)[number];

/**
 * Accountant exports, streamed as CSV.
 *
 * Tenant-scoped like everything else — an export is the single largest
 * disclosure of a business's data the API offers, so it goes through the same
 * guard as every other read and is filtered by `businessId` in the service.
 */
@Controller("exports")
@UseGuards(TenantAuthGuard)
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Get(":file")
  async download(
    @BusinessId() businessId: string,
    @Param("file") file: string,
    @Query(new ZodValidationPipe(exportRangeSchema)) query: ExportRangeQuery,
    @Res() res: Response,
  ): Promise<void> {
    if (!FILES.includes(file as FileSlug)) {
      throw new BadRequestException(`Unknown export "${file}".`);
    }

    // Parsed as UTC midnight so the range means calendar DATES, matching how
    // issueDate and dueDate are stored. See PLANNING.md §6 — the Jamaica
    // offset has produced a date-boundary bug three times in this codebase.
    const range = {
      from: new Date(`${query.from}T00:00:00.000Z`),
      to: new Date(`${query.to}T00:00:00.000Z`),
    };

    const built: Record<FileSlug, () => Promise<ExportFile>> = {
      "invoices-issued": () => this.exports.invoicesIssued(businessId, range),
      "invoice-lines": () => this.exports.invoiceLines(businessId, range),
      "payments-received": () => this.exports.paymentsReceived(businessId, range),
      clients: () => this.exports.clients(businessId, range),
    };

    const { filename, csv } = await built[file as FileSlug]();

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
