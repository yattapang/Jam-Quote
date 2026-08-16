import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { JobsController } from "./jobs.controller.js";
import { JobsService } from "./jobs.service.js";

@Module({
  // AuthModule exports JwtModule, needed by TenantAuthGuard (applied on
  // JobsController) to verify tokens.
  imports: [AuthModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
