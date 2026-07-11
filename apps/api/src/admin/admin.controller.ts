import { Controller, Get } from "@nestjs/common";
import {
  AdminService,
  type AdminOverview,
  type AdminRegulatoryUpdate,
  type AdminSupplier,
  type AdminTenant,
} from "./admin.service.js";

/**
 * Platform-level admin API for the internal JamQuote staff console.
 * Deliberately NOT business-scoped: no x-business-id header, no
 * @BusinessId() decorator, no per-tenant filtering. Reads across every
 * tenant in the system. Intended for internal staff use only.
 */
@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("overview")
  overview(): Promise<AdminOverview> {
    return this.admin.overview();
  }

  @Get("tenants")
  tenants(): Promise<AdminTenant[]> {
    return this.admin.tenants();
  }

  @Get("suppliers")
  suppliers(): Promise<AdminSupplier[]> {
    return this.admin.suppliers();
  }

  @Get("regulatory")
  regulatory(): Promise<AdminRegulatoryUpdate[]> {
    return this.admin.regulatory();
  }
}
