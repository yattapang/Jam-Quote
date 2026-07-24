import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { AuthModule } from "../auth/auth.module.js";
import { AdminGuard } from "../auth/admin.guard.js";

@Module({
  // AuthModule exports JwtModule, which AdminGuard needs (JwtService) to
  // verify the bearer token before checking the caller's role.
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
  exports: [AdminService],
})
export class AdminModule {}
