import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/**
 * Rate limiting keyed by WHO is asking rather than by the IP the request
 * arrived from.
 *
 * The stock ThrottlerGuard keys on req.ip, which is correct for a service
 * browsers call directly and wrong for this one. Every request from the web
 * app reaches the API from Vercel: server components fetch the API directly
 * (lib/api-server.ts), and browser-side calls go through the same-origin
 * proxy (app/api/proxy) so the httpOnly cookie can be attached server-side.
 * Neither forwards the original client address, and it would be a mistake if
 * they did — a caller-supplied IP header is trivially spoofed, so an attacker
 * could sidestep the limit entirely by varying one header per request. A
 * tracker that an attacker chooses is worse than no tracker, because it
 * reports as protection.
 *
 * So from the API's side, the entire web tier looks like one busy client on
 * one address, and IP keying produces both halves of the wrong outcome: the
 * global 120/min becomes a cap on the whole platform's traffic rather than
 * per user, while the 8/min on login becomes eight attempts per minute shared
 * by everyone signing in. One person fat-fingering their password would lock
 * out every other contractor for the rest of the minute — and a credential
 * stuffer would take the whole product offline as a side effect of being
 * throttled.
 *
 * The tracker therefore prefers the most specific identity available:
 *
 *  1. The authenticated user id. AuthContextMiddleware runs before guards on
 *     every route and sets req.user only after cryptographically verifying
 *     the JWT, so this is unforgeable — a caller cannot claim to be someone
 *     else to get a fresh bucket, and cannot dodge their own bucket either.
 *  2. The email in the body, for the unauthenticated auth routes. This is the
 *     account under attack, which is the thing worth protecting on a login
 *     endpoint: brute force against one account is limited no matter how many
 *     addresses it comes from. It is attacker-supplied, but varying it means
 *     attacking a different account, which is precisely the case the limit is
 *     not trying to catch.
 *  3. IP, for anything else.
 *
 * KNOWN RESIDUAL: routes with neither an authenticated user nor an email —
 * reset-password, which carries only an opaque token — still fall to case 3
 * and so still share one bucket across the web tier. That is deliberate.
 * Keying by the token would give every guess its own bucket and defeat the
 * limit outright, and reset tokens are high-entropy anyway. Sharing a bucket
 * on a rarely-used endpoint is the better trade.
 */
@Injectable()
export class IdentityThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { sub?: unknown } | undefined;
    if (typeof user?.sub === "string" && user.sub.length > 0) {
      return `user:${user.sub}`;
    }

    const body = req.body as { email?: unknown } | undefined;
    if (typeof body?.email === "string") {
      // Normalized the same way AuthService.login normalizes it, so
      // "Owner@X.com" and "owner@x.com" cannot be alternated for two buckets
      // against a single account.
      const email = body.email.trim().toLowerCase();
      if (email.length > 0) return `email:${email}`;
    }

    return `ip:${typeof req.ip === "string" ? req.ip : "unknown"}`;
  }
}
