/**
 * The public surface of the tenants module.
 *
 * Another module imports from HERE and nowhere else inside this folder. That rule
 * is held by core/architecture/import-boundaries.test.ts, not by good intentions:
 * the Phase 0 audit found the previous application's boundaries eroded precisely
 * because nothing failed when one was crossed.
 *
 * Keep this list short. Everything named here is a promise to other modules, and
 * a promise is harder to withdraw than to make.
 */
export { TenantsController } from "./tenants.controller.js";
export { TenantsService } from "./tenants.service.js";
export type { TenantSummary } from "./tenants.service.js";
