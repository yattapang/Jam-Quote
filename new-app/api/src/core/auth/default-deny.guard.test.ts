/**
 * Does the guard actually deny by default, and does it refuse without saying why?
 *
 * No Nest container here: the guard takes its three collaborators as constructor
 * arguments precisely so this can drive it directly. What is NOT faked is the
 * decision path — the real `routeProtectionOf` precedence, the real exception types,
 * the real message.
 *
 * WHAT IT DOES NOT PROVE
 *
 * - Not that the guard is registered globally. That is a wiring fact about the
 *   application module, and it belongs to the test that stands the app up. Until
 *   that exists, global registration is asserted by review — stated here rather
 *   than implied, because an unregistered global guard would make every test in
 *   this file meaningless in production.
 * - Not that a share-token route validates its token. The guard deliberately does
 *   not; the owning module does, and answers an unknown token exactly as a
 *   malformed one.
 */
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { type CallerResolver, REFUSAL_MESSAGE, type SessionRef } from "./caller.js";
import { DefaultDenyGuard, type SessionReader } from "./default-deny.guard.js";
import { Authenticated, PublicRoute, ShareTokenRoute } from "./route-protection.js";

const A_TENANT = "11111111-1111-4111-8111-111111111111";
const A_USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/**
 * Applies a real protection decorator to a throwaway method and returns a
 * Reflector-shaped reader over it.
 *
 * Using the real decorators rather than hand-written metadata is the point: if the
 * decorator's key or shape changed, a hand-written fixture would keep passing while
 * production broke.
 */
function protectionFor(decorate: MethodDecorator | null) {
  class Fixture {
    handler() {}
  }
  if (decorate) {
    const descriptor = Object.getOwnPropertyDescriptor(Fixture.prototype, "handler")!;
    decorate(Fixture.prototype, "handler", descriptor);
  }
  const handler = Fixture.prototype.handler;

  // Nest's Reflector.getAllAndOverride semantics: first target that has the key wins.
  const reader = {
    getAllAndOverride<T>(key: unknown, targets: unknown[]): T | undefined {
      for (const target of targets) {
        const value = Reflect.getMetadata?.(key as string, target as object);
        if (value !== undefined) return value as T;
      }
      return undefined;
    },
  };
  return { handler, controller: Fixture, reader };
}

function contextFor(handler: unknown, controller: unknown, request: Record<string, unknown> = {}) {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

const resolverThat = (result: Awaited<ReturnType<CallerResolver["resolve"]>>): CallerResolver => ({
  resolve: vi.fn(async () => result),
});

const sessionReader = (ref: SessionRef | null): SessionReader => ({ read: () => ref });

describe("an undeclared route", () => {
  it("is refused, not allowed", async () => {
    // The whole point. In the previous application this route would have been open.
    const { handler, controller, reader } = protectionFor(null);
    const guard = new DefaultDenyGuard(
      reader,
      sessionReader(null),
      resolverThat({ ok: true, caller: { userId: A_USER, tenantId: A_TENANT, role: "owner" } }),
    );

    await expect(guard.canActivate(contextFor(handler, controller))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("never resolves a caller for it", async () => {
    // A handler on an undeclared route must not receive a half-trusted identity.
    const { handler, controller, reader } = protectionFor(null);
    const resolver = resolverThat({ ok: false, refusal: "no-session" });
    const guard = new DefaultDenyGuard(reader, sessionReader(null), resolver);

    await expect(guard.canActivate(contextFor(handler, controller))).rejects.toThrow();
    expect(resolver.resolve).not.toHaveBeenCalled();
  });
});

describe("an authenticated route", () => {
  it("passes a live caller through and attaches them to the request", async () => {
    const { handler, controller, reader } = protectionFor(Authenticated());
    const request: Record<string, unknown> = {};
    const guard = new DefaultDenyGuard(
      reader,
      sessionReader({ sessionId: "s", version: 3 }),
      resolverThat({ ok: true, caller: { userId: A_USER, tenantId: A_TENANT, role: "owner" } }),
    );

    await expect(guard.canActivate(contextFor(handler, controller, request))).resolves.toBe(true);
    // Downstream reads the caller from here, and this is the ONLY way a tenant id
    // legitimately enters a request.
    expect(request.caller).toEqual({ userId: A_USER, tenantId: A_TENANT, role: "owner" });
  });

  it("refuses when there is no session at all", async () => {
    const { handler, controller, reader } = protectionFor(Authenticated());
    const guard = new DefaultDenyGuard(
      reader,
      sessionReader(null),
      resolverThat({ ok: false, refusal: "no-session" }),
    );

    await expect(guard.canActivate(contextFor(handler, controller))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("tells every refused caller the same thing, whatever the reason", async () => {
    // Distinguishing "unknown session" from "your tenant is suspended" hands anyone
    // with a discarded token a fact about an account they no longer have access to.
    const messages = new Set<string>();

    for (const refusal of [
      "no-session",
      "unknown-session",
      "session-superseded",
      "user-deactivated",
      "tenant-suspended",
    ] as const) {
      const { handler, controller, reader } = protectionFor(Authenticated());
      const guard = new DefaultDenyGuard(
        reader,
        sessionReader({ sessionId: "s", version: 1 }),
        resolverThat({ ok: false, refusal }),
      );
      await guard.canActivate(contextFor(handler, controller)).catch((error: Error) => {
        messages.add(error.message);
      });
    }

    expect([...messages]).toEqual([REFUSAL_MESSAGE]);
  });

  it("does not leave a caller on the request when it refuses", async () => {
    const { handler, controller, reader } = protectionFor(Authenticated());
    const request: Record<string, unknown> = {};
    const guard = new DefaultDenyGuard(
      reader,
      sessionReader({ sessionId: "s", version: 1 }),
      resolverThat({ ok: false, refusal: "tenant-suspended" }),
    );

    await guard.canActivate(contextFor(handler, controller, request)).catch(() => undefined);
    expect(request.caller).toBeUndefined();
  });
});

describe("a public route", () => {
  it("is allowed without resolving anyone", async () => {
    const { handler, controller, reader } = protectionFor(
      PublicRoute("Liveness probe for the load balancer; returns no tenant data"),
    );
    const resolver = resolverThat({ ok: false, refusal: "no-session" });
    const guard = new DefaultDenyGuard(reader, sessionReader(null), resolver);

    await expect(guard.canActivate(contextFor(handler, controller))).resolves.toBe(true);
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it("cannot be declared without a real reason", () => {
    // Thrown at class-definition time, so a rubber-stamp reason fails on import
    // rather than on the first request.
    expect(() => PublicRoute("")).toThrow(/real reason/);
    expect(() => PublicRoute("temp")).toThrow(/real reason/);
  });
});

describe("a share-token route", () => {
  it("is allowed through without a session, because the token is the credential", async () => {
    const { handler, controller, reader } = protectionFor(ShareTokenRoute());
    const resolver = resolverThat({ ok: false, refusal: "no-session" });
    const guard = new DefaultDenyGuard(reader, sessionReader(null), resolver);

    await expect(guard.canActivate(contextFor(handler, controller))).resolves.toBe(true);
    // And no session is minted for it: a share link must never become a login.
    expect(resolver.resolve).not.toHaveBeenCalled();
  });
});

describe("precedence", () => {
  it("lets a handler's declaration override its controller's", async () => {
    // The shape that stops someone removing a controller-level declaration in order
    // to make one route public.
    @Authenticated()
    class Fixture {
      @PublicRoute("Payment gateway callback; authenticity is proved by the signature, not a session")
      handler() {}
    }
    const reader = {
      getAllAndOverride<T>(key: unknown, targets: unknown[]): T | undefined {
        for (const target of targets) {
          const value = Reflect.getMetadata?.(key as string, target as object);
          if (value !== undefined) return value as T;
        }
        return undefined;
      },
    };
    const resolver = resolverThat({ ok: false, refusal: "no-session" });
    const guard = new DefaultDenyGuard(reader, sessionReader(null), resolver);

    await expect(
      guard.canActivate(contextFor(Fixture.prototype.handler, Fixture)),
    ).resolves.toBe(true);
    expect(resolver.resolve).not.toHaveBeenCalled();
  });
});
