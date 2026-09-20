# 0001 — npm-workspaces monorepo, TypeScript everywhere

**Status:** Accepted (2026-07, recorded 2026-09-20)

## Context
One product ships as three surfaces — an API, a web app and an Android app — that must agree
to the cent on money, tax and document rules. A quote is computed on a phone offline and
re-computed on the server; a disagreement is a wrong price in a customer's hand.

## Decision
A single repository with npm workspaces and Turborepo: `apps/api` (NestJS), `apps/web`
(Next.js 14 App Router), `apps/mobile` (Expo/React Native), `packages/core` (shared money,
tax and document rules), `packages/ui` (design tokens), `packages/test-ast` (the shared
parser the guards use). TypeScript in every workspace.

## Alternatives considered
- **A repository per surface.** Rejected: the shared rules would be a published package and
  would drift by version. Every drift defect found so far has been a copy of a rule, and
  separate repositories make copies the default.
- **JavaScript in the mobile app** to move faster. Rejected: the types are what keep the
  three surfaces honest about money.

## Consequences
- One `npm test` covers every surface, and a shared rule cannot be changed for one surface
  only.
- Task ordering matters: `apps/*` consume `packages/core`'s built `dist`, so a core change
  needs a rebuild before api/web tests see it.
- The repository is large for a newcomer, which is why the folder conventions in
  `docs/BUILD-RULES.md` exist.
