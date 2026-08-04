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
> RESUME HERE → next locked item is **mobile M3 (offline-first)**, with a small
> detour for **#19 Trade FK drift** (security-adjacent) first. (Admin RBAC #13,
> rule-pack #11 and invoicing #18 all SHIPPED — see below.)

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

> RULE-PACK #11 SHIPPED (2026-07-31, the "lighter" editable-JM-values step):
> a super-admin / MANAGE_RULEPACK holder can now edit the consumption-tax rate +
> label, its provenance (verified date + source), and the statutory payroll rates
> — DB-backed (RulePackConfig, one nullable-column row per country) and merged over
> the static @jamquote/core baseline via the pure applyRulePackOverride. GET/PATCH
> /admin/rulepack (view = any admin, edit = MANAGE_RULEPACK, audited). Registration
> seeds a new tenant's default GCT rate from the effective pack. Console rule-pack
> screen shows real values + a gated edit form (removing the old fake reviewer/diff
> placeholders). Code-owned values (taxpayer id, regions, payment rails) stay in
> core. DEFERRED (heavy engine): versioned history, regulatory-monitoring feed,
> multi-country packs. All 5 workspaces green (core 57 / api 107 / web 48 / mobile
> 19). NEXT → invoicing/edit #18.

> INVOICING #18 SHIPPED (2026-07-31, pushed — full slice: models + API + web).
> Invoice went from header-only to a real editable document: new
> InvoiceSection/InvoiceLineItem mirroring the Quote models, so the shared
> computeTotals engine prices both identically. Invoice.status now defaults to
> DRAFT. POST /invoices/from-quote/:quoteId snapshots an ACCEPTED quote (deep-copy
> of sections + lines, number via reserveInvoiceNumber, blocks double-conversion);
> PATCH edits while DRAFT; POST /:id/finalize flips invoice + source quote to
> INVOICED atomically; DELETE soft-deletes DRAFT only. Payments untouched, so a
> new invoice is WiPay-payable immediately. Web: real invoices list/detail/draft
> editor replacing the placeholder, + "Convert to invoice" on ACCEPTED quotes.
> Draft-only editing enforced at actions, route redirect, AND API. 232 tests green
> (api 118 / web 57 / core 57); both builds pass.
> FOLLOW-UP #19: Trade.businessId FK drift (DB CASCADE vs schema SET NULL) —
> deliberately excluded from the invoice migration; SET NULL would leak a deleted
> tenant's custom trades into the global master list.
> NEXT → mobile M3 (offline-first), or #19 first (small, security-adjacent).

> #6 TENANT AUTH SHIPPED & VERIFIED LIVE (2026-08-03). The tenant API accepted a
> raw `x-business-id` header as identity — GET /api/invoices with any business id
> and no token returned 200 with that tenant's data. New TenantAuthGuard now
> protects every @BusinessId() controller, re-reading the user from the DB rather
> than trusting token claims (so deletion/suspension bite immediately, not after
> a 30-day token expires). Header alone -> 401; admin (no businessId) -> 403;
> suspended business -> 403. Verified post-deploy: /invoices /quotes /clients
> /jobs /trades /business/current /billing/status /catalogs/material-favourites
> all 401 with the header; /health + /billing/plans still 200; web /quotes
> /invoices /settings now 307 to /login instead of rendering empty.
> Same pass closed PATCH /business/:id (was an unauthenticated cross-tenant
> write) and the payments invoice IDOR. Web: forced login + 401/403 surfaced.
> Mobile: signed-out users no longer shown fixture data as if real.
> Also fixed #20/#21 (WiPay: cross-tenant credit via non-unique invoice number;
> callback verification failing OPEN when WIPAY_API_KEY unset).
> 283 tests green (145 api / 64 web / 57 core / 27 mobile).
> NEXT → materials Option B Phase 1 (#26), then #24 password reset, #3 seed cleanup.

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
4. **Rule-pack** — lighter editable-JM-values step (#11) ✅ SHIPPED
5. **Quote→invoice editing** / invoicing M5 (#18) ✅ SHIPPED
6. **M3** — mobile offline-first (local replica + outbox + sync engine) ← NEXT
   (small detour first: #19 Trade FK drift — security-adjacent)

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
