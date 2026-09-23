import { Controller, Get, UseGuards } from "@nestjs/common";
import { TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { RegulatoryService, type TenantRegulatoryUpdate } from "./regulatory.service.js";

/**
 * Read-only regulatory feed for signed-in tenants. The dashboard's
 * "Regulatory" card reads this; it previously rendered a bundled fixture.
 *
 * Guarded at the class level so it is never anonymously readable, but note it
 * takes no @BusinessId(): see RegulatoryService.list for why this content has
 * no per-tenant dimension. Writes stay on /admin/regulatory.
 */
@Controller("regulatory")
@UseGuards(TenantAuthGuard)
export class RegulatoryController {
  constructor(private readonly regulatory: RegulatoryService) {}

  @Get()
  list(): Promise<TenantRegulatoryUpdate[]> {
    return this.regulatory.list();
  }
}
