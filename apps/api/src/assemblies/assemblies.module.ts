import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AssembliesController } from "./assemblies.controller.js";
import { AssembliesService } from "./assemblies.service.js";

@Module({
  // AuthModule exports JwtModule, needed by TenantAuthGuard (applied on
  // AssembliesController) to verify tokens.
  imports: [AuthModule],
  controllers: [AssembliesController],
  providers: [AssembliesService],
  exports: [AssembliesService],
})
export class AssembliesModule {}
