# JamQuote — Roadmap & Resume State

Updated 2026-07-30. Single source of truth for picking work back up cheaply
after a usage-limit pause. Read this first on resume.

> PROGRESS: admin-ops console (backend + UI) DONE & deployed. **Estimating
> catalog epic COMPLETE & deployed** — Trades, Labour library, Material library
> (categories+specs), Assemblies (backend + library UI), and Assembly QUOTE
> INTEGRATION (quote builder "+ Add job type" picker, per-quote
> Summary/Detailed toggle, DETAILED breakdown on the quote detail page + PDF —
> commit ad1deb7). Verified live: the deployed API returns `detailLevel` and
> the assembly line fields.
> RESUME HERE → next locked item is **Admin RBAC #13** (super-admin +
> granular per-admin capabilities). Then rule-pack #11 (lighter),
> invoicing/edit #18, mobile M3.

## Live now (deployed)
- **API**: Render (free) + Neon Postgres. Migrations apply on boot via the
  startCommand (`prisma migrate deploy && node dist/main.js`) — Render's free
  tier ignores `preDeployCommand`, so migrate lives in start.
- **Web**: Vercel. **Mobile**: Expo (not deployed; APK later via EAS).
- **Shipped**: email/password auth + JWT (httpOnly cookie + `/api/proxy` on
  web); password reset (Resend); rate limiting + helmet; admin API/console
  (AdminGuard, role read fresh from DB); dedicated staff login at
  **`/admin-login`**; subscription tiers (free = 5 quotes/mo, Pro **JMD
  2,000/mo · 20,000/yr**) with admin-editable pricing; admin-ops **backend**
  (audit log, tenant suspend/restore/hard-delete, supplier CRUD, financials).
- **Admin**: `yattapang@gmail.com` is the sole ADMIN (business "Jamquote").
  Promote more: `ADMIN_EMAIL=x npm run -w @jamquote/api db:promote-admin`.
- **Seed/demo data still present** (Blackwood + biz-2..8). Cleanup ready but
  NOT run (user testing): `CONFIRM_CLEANUP=yes npm run -w @jamquote/api db:clean-seed`.

> RBAC #13 SHIPPED & DEPLOYED (2026-07-31, verified live: /admin/me + /admin/admins
> return 401 unauth'd — routes exist & guarded; the x-business-id header is not
> accepted as admin auth; migration applied on boot): super-admin
> + granular per-admin capabilities. Core `AdminCapability` set, `User.isSuperAdmin`
> + `adminCapabilities`, migration backfills the existing admin (yattapang) to
> super-admin. `AdminGuard` enforces `@RequireCapability` per route; admin-management
> endpoints (GET /admin/me, GET/POST /admin/admins, PATCH/DELETE /admin/admins/:id)
> with self-lockout + last-super-admin guards, all audited. Console gets a
> super-admin-only Admins screen + capability gating of tenants/suppliers/pricing/
> financials. Local api+web builds green, 101 api tests pass. NEXT → rule-pack #11
> (lighter), then invoicing/edit #18, then mobile M3.

## LOCKED build order (next up)
1. **Admin-ops console UI** — backend done + deployed; rebuild the UI fresh (a
   partial attempt is stashed): tenant actions + type-to-confirm delete,
   supplier CRUD, Financials screen, Activity/audit screen.
2. **Estimating catalog** (core contractor value) — ✅ DONE & deployed:
   a. Trades — master JA list + custom + type-ahead picker (#15) ✅
   b. Labour library (#16) ✅
   c. Material library — categories + specs/variants (#14) ✅
   d. Assemblies / job types — calculated+editable unit cost, per-quote
      summary/detail toggle, PDF rendering (#17) ✅
3. **Admin RBAC** — super-admin + granular per-admin capabilities (#13) ✅ SHIPPED
4. **Rule-pack** — lighter editable-JM-values step (#11) ← NEXT
5. **Quote→invoice editing** / invoicing M5 (#18)
6. **M3** — mobile offline-first (local replica + outbox + sync engine)

## Decisions locked
- Assemblies: unit price = sum of parts + markup, EDITABLE/overridable per
  quote; re-prices with library prices (snapshot on quote).
- Quote presentation: per-quote summary/detailed toggle → drives PDF.
- Trades: JamQuote master list + per-business custom.
- Admin permissions: granular capabilities (tenants/suppliers/pricing/
  financials/rulepack/manage-admins); yattapang = super-admin.
- Subscription billing: manual (admin flips to Pro) until Phase-2 WiPay.

## Blocked on the user (external)
- **WiPay MERCHANT account** → unblocks Phase-2 automated subscription billing +
  real payment/financial ledger.
- **Resend verified sending DOMAIN** + `PASSWORD_RESET_FROM_EMAIL` /
  `QUOTE_FROM_EMAIL` on Render → real email delivery (today only reaches the
  Resend account owner).

## Deferred (logged)
- Remove `x-business-id` fallback (after login mandatory) (#6)
- Auth throttle-by-email — avoid Vercel-egress-IP collisions (#7)
- Suspend cutting off already-issued tokens (today only blocks new logins)

## How we build
Sonnet subagents, one branch per feature; Opus reviews + boot-verifies against
the real DB + merges. Hand-author migrations (never run migrate against Neon
directly — the deploy's startCommand applies them). Weekly usage limit near —
pause and resume on reset.
