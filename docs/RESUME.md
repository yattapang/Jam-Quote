# Resume Prompt — continuing the JamQuote build

Paste the block below into a fresh Claude Code session started in `C:\dev\JamQuote`.
A new session at this path gets its own memory store, so this prompt carries the
context forward (the original `jamquote-stack` / `jamquote-agent-workflow` memory
notes were written under the old OneDrive project path and won't auto-load here).

---

```
We're resuming the JamQuote build in this relocated repo (C:\dev\JamQuote).
JamQuote is an Android + Web app for Jamaican contractors to build construction
estimate/quotes and send them as branded PDFs via WhatsApp or email.

READ FIRST to reload context:
- docs/ARCHITECTURE.md  (the build spec/contract every agent follows)
- docs/PRICING.md       (supplier web-scraper spec; H&L True Value first target)
- git log --oneline     (three commits already exist)

CONFIRMED DECISIONS (do not re-litigate):
- Monorepo: Turborepo + npm workspaces, all TypeScript.
  apps/api (NestJS+Prisma), apps/web (Next.js), apps/mobile (Expo/React Native),
  packages/core (shared tax/GCT/quote math — single source of truth for money,
  in JMD cents), packages/ui (design tokens from extracted/JamQuote.dc.html).
- Payments: WiPay hosted checkout + signed webhook (already built in
  apps/api/src/payments). Manual payments: cash/bank/Lynk. NOT Stripe.
- WhatsApp: Phase 1 = click-to-chat share link; full Business Cloud API later.
- Money is always integer JMD cents; GCT-aware; TRN on every document.
- Multi-agent workflow: Opus = architect + payments/security + final review;
  Sonnet = builders (CRUD, web screens, mobile screens); Haiku = docs/config.

CURRENT STATE:
- A0/A4 (Opus) DONE & verified: packages/core (tests passed), Prisma schema,
  WiPay payments module.
- A3 mobile DONE (committed, NOT yet installed/typechecked).
- A1 backend (NestJS CRUD in apps/api/src/{business,clients,jobs,quotes,
  catalogs,invoicing,reports}) and A2 web (apps/web shell) are PARTIAL — the
  agents stopped on a session limit; committed but unverified.
- node_modules does not exist yet (was cleared during a disk-space crisis).

DO THIS NOW, in order:
1. Confirm disk has several GB free, then run: npm install
2. Verify the foundation: npm run -w @jamquote/core test
3. npm run -w @jamquote/api prisma:generate, then typecheck apps/api and apps/web
   and apps/mobile; fix or finish whatever the A1/A2 agents left incomplete.
4. Run an Opus review pass over A1/A2/A3 output: correctness, efficiency,
   GCT/tax accuracy, and web<->mobile consistency; check all CRUD totals go
   through computeTotals from @jamquote/core.
5. Confirm mobile phone-preview works: npm run -w @jamquote/mobile dev (Expo Go).

Also: the old copy at "C:\Users\Kenyatta\OneDrive\Applications\Quoting Tool\
JamQuote" is now redundant (everything is committed here) — delete it to finish
the relocation. And re-save the key decisions above to this session's memory,
since memory didn't carry over from the old project path.
```
