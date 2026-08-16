import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { TradesController } from "./trades.controller.js";
import { TradesService } from "./trades.service.js";
import { CatalogHiddenService } from "../catalogs/catalog-hidden.service.js";

@Module({
  // AuthModule exports JwtModule, needed by TenantAuthGuard (applied on
  // TradesController) to verify tokens.
  imports: [AuthModule],
  controllers: [TradesController],
  // CatalogHiddenService is provided directly rather than importing
  // CatalogsModule, which would be a cycle: catalogs already depends on
  // trades. It is a thin Prisma wrapper with no state of its own.
  providers: [TradesService, CatalogHiddenService],
  exports: [TradesService],
})
export class TradesModule {}
