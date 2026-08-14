import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { ReportsSummary } from "@jamquote/core";
import { TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { ReportsService } from "./reports.service.js";
import { reportsQuerySchema, type ReportsQueryInput } from "./reports.dto.js";

/**
 * GET /reports?from=<iso>&to=<iso> — the contractor Reports page's single
 * data source. `from`/`to` are optional; when either is omitted the current
 * Jamaica-local calendar month is used (see ReportsService.resolveRange).
 * A range where `to` is not after `from` is rejected with 400 rather than
 * silently swapped or clamped.
 */
@Controller("reports")
@UseGuards(TenantAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  getSummary(
    @BusinessId() businessId: string,
    @Query(new ZodValidationPipe(reportsQuerySchema)) query: ReportsQueryInput,
  ): Promise<ReportsSummary> {
    return this.reports.getSummary(businessId, query.from, query.to);
  }
}
