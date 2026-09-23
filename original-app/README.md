# `original-app/` — the existing application

This is the application exactly as it stood when the Phase 0 audit was written
(`docs/PHASE-0-AUDIT.md`). It moved here unchanged, by tracked `git mv`, so its history is
intact — GitHub shows renames, not a delete and re-add.

**It is read-only.** Rule 1.2 of `docs/RULES.md`: the audit has begun, so no change lands here
except one the owner asks for by name. It stays in place until the rebuilt layers fully replace
it in production, because it is the reference for comparison and data migration. It is deleted
only when the owner explicitly confirms, as its own commit.

Automated Claude-proposed changes never target this folder (Rule 15).

## Layout

| Path | What it is |
|---|---|
| `apps/api` | NestJS + Prisma REST API, one folder per domain module |
| `apps/web` | Next.js 14 App Router web client |
| `apps/mobile` | Expo / React Native client with a local replica |
| `packages/core` | The shared rules: money, tax, totals, settlement, job cost, renewal, jurisdiction rule packs |
| `packages/ui` | Design tokens |
| `packages/test-ast` | The one TypeScript parser every guard test uses |

This folder is **its own npm-workspace root** — it owns `package.json`, `package-lock.json`,
`turbo.json` and `tsconfig.base.json`. `new-app/` will own its own, so the two never share a
lockfile or fight over dependency versions.

## Commands

All of these run from this directory, not the repository root:

```bash
npm install          # also recreates the workspace links
npm run typecheck
npm run lint
npm test             # add --concurrency=1 via turbo if results look flaky
npm run test:integration
```

`packages/core` resolves at runtime through its built `dist`, so after changing core run
`npm run build -w @jamquote/core` before trusting an api or web result.

## Notes for whoever reads this next

- Deployment configuration lives at the repository root: `render.yaml` (which sets
  `rootDir: original-app`) and the CI workflow in `.github/workflows/`, which runs every step
  from this directory.
- The Vercel project's **Root Directory** setting must point inside this folder
  (`original-app/apps/web`). That is a dashboard setting, not a file in the repository.
- On Windows, npm creates `node_modules` workspace links as absolute junctions. Moving this
  folder breaks them; `npm install` recreates them.
