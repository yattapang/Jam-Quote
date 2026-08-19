import { Module } from "@nestjs/common";
import { PurchasesController } from "./purchases.controller.js";
import { PurchasesService } from "./purchases.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AuthModule } from "../auth/auth.module.js";

// AuthModule exports JwtModule, which TenantAuthGuard needs to verify the
// bearer token before any businessId is trusted.
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
