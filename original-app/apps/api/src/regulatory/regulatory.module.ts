import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RegulatoryController } from "./regulatory.controller.js";
import { RegulatoryService } from "./regulatory.service.js";

@Module({
  // AuthModule exports JwtModule, needed by TenantAuthGuard (applied on
  // RegulatoryController).
  imports: [AuthModule],
  controllers: [RegulatoryController],
  providers: [RegulatoryService],
})
export class RegulatoryModule {}
