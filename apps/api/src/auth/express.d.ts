import type { AuthTokenPayload } from "./auth.service.js";

// Augments Express's Request with the fields our guards/middleware attach
// from a verified JWT: req.user (AuthContextMiddleware, JwtAuthGuard,
// TenantAuthGuard, AdminGuard), req.businessId (TenantAuthGuard only — see
// tenant-auth.guard.ts and common/business-id.decorator.ts), req.adminContext
// (AdminGuard only). All optional/undefined until the relevant guard runs;
// there is no header-based fallback anymore.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
      businessId?: string;
      adminContext?: { userId: string; isSuperAdmin: boolean; capabilities: string[] };
    }
  }
}

export {};
