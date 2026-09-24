/**
 * Does default-deny actually happen to a real request?
 *
 * This is F2's other half, and the reason it exists is worth stating plainly: `DefaultDenyGuard`
 * had ten passing tests and protected nothing, because no module registered it. Those tests proved
 * a class behaves correctly when called. Nothing proved anything ever called it.
 *
 * So this boots the real application — the real `AppModule`, the real controllers, the real global
 * guard — and issues real HTTP requests through it. If `APP_GUARD` is removed from the module,
 * every assertion below fails. That is the difference between a guard and a guard that is wired.
 *
 * WHAT IT DOES NOT PROVE
 *
 * - Nothing about a **production** bootstrap. There is no `main.ts`; this composes the application
 *   in-process. "It starts correctly on Render" is untested until transport lands.
 * - Nothing about a guard's behaviour with a **real** session, because nothing can read one yet:
 *   the module binds a session reader that returns null on purpose, so every authenticated route
 *   refuses. The refusal is asserted below rather than worked around.
 * - Nothing about routes served outside a Nest controller — middleware and raw handlers bypass
 *   guards entirely. That is why `app.module.ts` says routes must be controllers, and it is a
 *   convention no test here can enforce.
 */
import { Controller, Get, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { AppModule } from "./app.module.js";

let app: INestApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function boot(module = AppModule): Promise<INestApplication> {
  const fixture = await Test.createTestingModule({ imports: [module] }).compile();
  app = fixture.createNestApplication();
  // Nest logs a banner per boot; silenced so a failure is readable.
  app.useLogger(false);
  await app.init();
  return app;
}

describe("the application as it is actually assembled", () => {
  it("serves a route that declares itself public", async () => {
    // The control case. If this failed, the tests below would prove only that the app is broken.
    const server = (await boot()).getHttpServer();

    await request(server).get("/health").expect(200, { status: "ok" });
  });

  it("refuses an authenticated route when no session can be read", async () => {
    // The module binds a null session reader on purpose (no transport yet), so this must refuse —
    // 401, not 500, and not the handler's own "not implemented".
    const server = (await boot()).getHttpServer();

    const response = await request(server).get("/tenants/me").expect(401);

    expect(response.body.message).toBe("Please sign in again.");
  });

  it("never reaches the handler of an authenticated route", async () => {
    // `TenantsController.me` throws "not implemented". Seeing that message would mean the guard
    // let the request through — the failure this whole design exists to prevent.
    const server = (await boot()).getHttpServer();

    const response = await request(server).get("/tenants/me");

    expect(JSON.stringify(response.body)).not.toMatch(/not implemented/i);
  });
});

describe("a route that declares no protection", () => {
  /**
   * Added to a throwaway module rather than to a real controller, so the application's own routes
   * stay honest while this proves what happens to an undeclared one.
   */
  @Controller()
  class ForgottenController {
    @Get("forgotten")
    handler() {
      return { secret: "this should never be returned" };
    }
  }

  it("is refused at runtime, not served", async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ForgottenController],
    }).compile();
    app = fixture.createNestApplication();
    app.useLogger(false);
    await app.init();

    const response = await request(app.getHttpServer()).get("/forgotten").expect(403);

    // And the handler's body never appears. A guard that returned 403 *after* running the handler
    // would pass a status check and still have leaked.
    expect(JSON.stringify(response.body)).not.toMatch(/should never be returned/);
  });
});

describe("every route the application actually registers", () => {
  /**
   * Asks the running application what routes exist, then requests each one.
   *
   * The first version of this file tested three routes by name, which meant a NEW undeclared route
   * was caught only by the build-time guard — proved by planting one and watching the runtime
   * suite stay green. Testing named routes proves those routes; it does not prove the rule.
   *
   * This enumerates from the router itself, so a route added anywhere is exercised here without
   * anyone remembering to add a test. If enumeration ever stops working it FAILS rather than
   * quietly checking nothing.
   */
  interface ExpressLayer {
    route?: { path?: string; methods?: Record<string, boolean> };
  }

  function registeredGetPaths(instance: unknown): string[] {
    const express = instance as { _router?: { stack?: ExpressLayer[] }; router?: { stack?: ExpressLayer[] } };
    const stack = express._router?.stack ?? express.router?.stack;
    if (!stack) {
      throw new Error(
        "Could not read the Express router. This test cannot enumerate routes, so it is failing " +
          "rather than passing while checking nothing — the enumeration is the whole point.",
      );
    }
    return stack
      .filter((layer) => layer.route?.path && layer.route.methods?.get)
      .map((layer) => layer.route!.path!);
  }

  it("refuses every route that is not declared public", async () => {
    const application = await boot();
    const paths = registeredGetPaths(application.getHttpAdapter().getInstance());

    // Prove the enumeration found subjects. Zero routes would make every assertion below vacuous.
    expect(paths.length, "no GET routes enumerated").toBeGreaterThan(0);

    // The routes this application intends to be open, by path. Anything else must be refused,
    // whatever it is called and whoever added it. Adding a path here is a deliberate act that
    // shows up in review — which is the same property the @PublicRoute reason string has.
    const intendedPublic = new Set(["/health"]);

    const wronglyOpen: string[] = [];
    for (const path of paths) {
      const response = await request(application.getHttpServer()).get(path);
      const isOpen = response.status < 400;

      if (isOpen && !intendedPublic.has(path)) {
        wronglyOpen.push(`GET ${path} answered ${response.status} without a session`);
      }
      if (!isOpen && intendedPublic.has(path)) {
        wronglyOpen.push(`GET ${path} is meant to be public but answered ${response.status}`);
      }
    }

    expect(wronglyOpen, wronglyOpen.join("; ")).toEqual([]);
  });
});
