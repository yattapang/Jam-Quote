import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ClientsController } from "./clients.controller.js";
import { ClientsService } from "./clients.service.js";

@Module({
  // AuthModule exports JwtModule, needed by TenantAuthGuard (applied on
  // ClientsController) to verify tokens.
  imports: [AuthModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
