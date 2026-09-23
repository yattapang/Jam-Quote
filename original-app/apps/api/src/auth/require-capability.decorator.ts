import { SetMetadata } from "@nestjs/common";
import type { AdminCapability } from "@jamquote/core";

/** Metadata key AdminGuard reads via Reflector to find a route's required capability. */
export const ADMIN_CAPABILITY_KEY = "adminCapability";

/**
 * Marks a route as requiring a specific admin capability. AdminGuard checks
 * the caller's isSuperAdmin/adminCapabilities against this before allowing
 * the request through — see apps/api/src/auth/admin.guard.ts.
 *
 * Usage: @RequireCapability(AdminCapability.MANAGE_TENANTS)
 */
export const RequireCapability = (cap: AdminCapability) => SetMetadata(ADMIN_CAPABILITY_KEY, cap);
