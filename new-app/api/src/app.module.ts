/**
 * The composition root: the one file that decides what this application is.
 *
 * WHY THIS FILE EXISTS (F2, independent review 2026-09-24)
 *
 * It did not, and that was the finding. `DefaultDenyGuard` had ten passing tests proving its logic
 * and **protected nothing**, because nothing had ever asked it a question — there was no module to
 * register it in. A guard that is written but unregistered is worse than an unguarded route: it is
 * an unguarded route with a document claiming otherwise. The threat model said BUILT; it was not.
 *
 * WHAT IS DECIDED HERE, AND NOWHERE ELSE
 *
 * Which implementations the cross-cutting layer uses. Everything in `core/` depends on *ports* —
 * `SessionReader`, `CallerResolver` — so that its own tests need no container and no database. The
 * moment those ports are bound to concrete classes is here, deliberately, in one readable place.
 *
 * ROUTES MUST BE NEST CONTROLLERS
 *
 * A global guard sees controller routes. Anything served by middleware, by a raw Express handler,
 * or by a framework escape hatch **bypasses it entirely** and would be unprotected with nothing
 * failing. So routes are added as controllers listed below, or not at all. This is not a style
 * preference; it is the boundary that makes default-deny true.
 */
import { Module } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";

import {
  CALLER_RESOLVER,
  DefaultDenyGuard,
  SESSION_READER,
  type SessionReader,
} from "./core/auth/default-deny.guard.js";
import type { CallerResolver, CallerResult } from "./core/auth/caller.js";
import { TenantsController } from "./modules/tenants/index.js";

/**
 * Reads a session from the request. Currently reads nothing, because nothing can yet.
 *
 * THIS IS NOT A STUB TO BE TIDIED AWAY LATER — it is the honest binding for an application with no
 * session transport. There are no cookies, no headers parsed, no CSRF, and no IP resolution (see
 * `docs/design/api-bootstrap.md`, "Out, on purpose"). With no session, every authenticated route
 * refuses.
 *
 * That is default-deny failing closed, and it is the correct state. A reader that invented a caller
 * so routes would "work" would be the precise opposite of the rule this guard exists to enforce.
 * It is replaced when the HTTP layer lands, and its test asserts the refusal rather than tolerating
 * it.
 */
const nullSessionReader: SessionReader = {
  read: () => null,
};

/**
 * Resolves a caller from a session. Refuses everything, for the same reason.
 *
 * `DbCallerResolver` is written and tested against a real database, but binding it needs a Prisma
 * client, which needs a connection, which is part of the transport work this change deliberately
 * excludes. Until then the honest answer to "who is asking?" is "nobody".
 */
const noCallerResolver: CallerResolver = {
  resolve: async (): Promise<CallerResult> => ({ ok: false, refusal: "no-session" }),
};

@Module({
  // Every controller in the application. A controller missing from this list is a route that
  // 404s — a visible failure — rather than one that answers unguarded.
  controllers: [TenantsController],
  providers: [
    { provide: SESSION_READER, useValue: nullSessionReader },
    { provide: CALLER_RESOLVER, useValue: noCallerResolver },
    {
      /**
       * The guard, bound globally.
       *
       * `APP_GUARD` is what makes this apply to every route in the application rather than the
       * ones someone remembered to decorate — which is the whole argument of ADR 0013. Removing
       * this one entry is the plant that must break the runtime tests.
       */
      provide: APP_GUARD,
      inject: [Reflector, SESSION_READER, CALLER_RESOLVER],
      useFactory: (reflector: Reflector, sessions: SessionReader, callers: CallerResolver) =>
        new DefaultDenyGuard(reflector, sessions, callers),
    },
  ],
})
export class AppModule {}
