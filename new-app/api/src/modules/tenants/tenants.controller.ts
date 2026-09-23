/**
 * HTTP surface of the tenants module.
 *
 * Every route here declares what protects it. That is not a convention — an
 * undeclared route is refused by DefaultDenyGuard at runtime and by
 * route-protection-coverage.test.ts at build time.
 */
import { Controller, Get } from "@nestjs/common";

import { Authenticated, PublicRoute } from "../../core/auth/route-protection.js";
import type { TenantSummary } from "./tenants.service.js";

@Controller()
export class TenantsController {
  /**
   * The signed-in caller's own business.
   *
   * Note what is absent: no tenant id parameter. The tenant comes from the session,
   * resolved server-side (core/auth), so there is no id here for a caller to change.
   */
  @Get("tenants/me")
  @Authenticated()
  me(): TenantSummary {
    // Placeholder until the service and persistence land; the route exists now so
    // the protection guards have a real subject.
    throw new Error("not implemented");
  }

  /**
   * Liveness. Public because a load balancer and an uptime pinger must be able to
   * reach it without credentials, and it returns nothing about anybody.
   */
  @Get("health")
  @PublicRoute("Liveness probe for the load balancer and uptime pinger; returns no tenant data")
  health(): { status: "ok" } {
    return { status: "ok" };
  }
}
