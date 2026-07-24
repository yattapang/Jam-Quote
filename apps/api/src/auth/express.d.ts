import type { AuthTokenPayload } from "./auth.service.js";

// Augments Express's Request with the fields auth-context.middleware and
// JwtAuthGuard attach from a verified JWT. Both are optional/undefined for
// any request that only carries the legacy x-business-id header.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
      businessId?: string;
    }
  }
}

export {};
