# Design — the API's composition root, and making default-deny real

**Status: Approved by instruction** — the owner directed "fix F2 next" on 2026-09-24. Recorded
because Rule 1.1 requires a design before code, and because this change touches the one file that
decides what the whole API is. Proportionate: one page for a defect fix.

**Closes:** F2 (independent review). **Brief:** §18 step 1, Foundations — authentication.

---

## The problem

Two halves, and the second is the serious one.

**Half A — the build-time guard has blind spots.** `route-protection-coverage.test.ts` scans only
`*.controller.ts` and matches HTTP decorators by the identifier as written. So a controller in any
other file is invisible, and `import { Get as Fetch }` defeats it. The reviewer proved both: an
undeclared route printed nothing and three tests passed.

**Half B — `DefaultDenyGuard` is registered nowhere.** There is no `app.module.ts`. The guard has
ten passing tests proving its logic and **protects nothing**, because nothing has ever asked it a
question. That is worse than an unguarded route: it is an unguarded route with a document claiming
otherwise, which is why the threat model row was corrected to PARTIAL.

## What this must achieve

1. An undeclared route is **refused by a running application**, not by a test of a class in
   isolation.
2. A controller cannot exist without being wired into the application — the failure mode is a
   route that 404s, not one that answers unguarded.
3. The build-time guard sees every route, whatever the file is called and whatever the decorator is
   renamed to.
4. All of it proved by planting, and what remains unproven stated.

## Scope — and what this deliberately is not

**In:** `app.module.ts` composing the modules and registering the guard globally; a test that boots
the real application and issues real requests; the coverage guard's two blind spots.

**Out, on purpose — this is not the HTTP layer:** no `main.ts`, no listening server in production,
no cookies, no CSRF, no session transport, no IP resolution, no Prisma client. Those need their own
design, and F2's fix does not wait for them.

The consequence is deliberate and must be visible: with no session transport, the `SessionReader`
this module provides returns `null` for every request, so **every authenticated route refuses.**
That is the correct behaviour for an application that cannot yet read a session — default-deny
failing closed — and it is temporary. A reader that invented a caller to make routes work would be
the precise opposite of this rule.

## The shape

- `api/src/app.module.ts` — imports each module, binds `DefaultDenyGuard` with Nest's `APP_GUARD`
  token so it applies to every route in the application.
- Its dependencies are injected by token (`SESSION_READER`, `CALLER_RESOLVER`) rather than
  constructed, so the composition root stays the only place that decides *which* implementation is
  used, and the guard's own tests keep needing no container.
- A **null session reader** as the current binding, with a comment naming what replaces it.
- `app.module.test.ts` — boots the application with `@nestjs/testing` and `platform-express` and
  issues real requests: a public route answers, an authenticated route refuses without a session,
  and a route with no declaration is refused rather than served.
- The coverage guard: scan **every** `.ts` under `src/`, identify a controller by its
  `@Controller` decorator rather than its filename, and resolve decorator aliases through the
  import that renamed them.

## How it will be proved

| Plant | Must fail |
|---|---|
| Remove `APP_GUARD` from the module | the runtime refusal tests |
| Add an undeclared `@Get` to a wired controller | runtime refusal, **and** the coverage guard |
| Put a controller in `admin.ts` instead of `admin.controller.ts` | the coverage guard |
| `import { Get as Fetch }` and declare nothing | the coverage guard |
| Drop a controller from the module's `controllers` list | the wiring test |

## What will still not be proved

- Nothing about a **production** bootstrap: there is no `main.ts`, so "the app starts correctly
  under Render" is untested and will be until transport lands.
- Nothing about the guard's behaviour with a **real** session, because nothing can read one yet.
- Nothing about middleware or any route added outside a Nest controller — those bypass guards
  entirely, which is a reason not to add them, stated in the module's header.

## Dependencies

`@nestjs/testing`, `@nestjs/platform-express` and `supertest`, as **dev** dependencies. They are
test infrastructure, not the transport, and they are what makes half B provable rather than
asserted. Recorded here because adding dependencies to prove something is a trade worth seeing.
