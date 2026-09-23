import { Module } from "@nestjs/common";
import { RulePackService } from "./rulepack.service.js";
import { AuditModule } from "../admin/audit.module.js";

/**
 * Provides RulePackService — the effective jurisdiction rule-pack (static core
 * baseline + editable DB override). Imported by AdminModule (GET/PATCH
 * /admin/rulepack) and AuthModule (seed a new tenant's default GCT rate at
 * registration). Depends only on AuditModule + the global PrismaModule, so it
 * introduces no import cycle.
 */
@Module({
  imports: [AuditModule],
  providers: [RulePackService],
  exports: [RulePackService],
})
export class RulePackModule {}
