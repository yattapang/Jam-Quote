import { Module } from "@nestjs/common";
import { AuditService } from "./audit.service.js";

/**
 * Provides the shared AuditService so every module that performs an auditable
 * platform action (admin tenant/supplier/pricing writes, rule-pack edits) can
 * record to the same immutable trail without depending on AdminModule (which
 * would create an import cycle).
 */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
