# JamQuote — Offline-First Sync Architecture

> Decision (2026-07-24): the Android app must be **fully usable offline** and sync when
> connectivity returns. This doc is the contract for how sync works. It sits under the
> "offline-first layer" seam referenced in ARCHITECTURE.md.

## 1. Confirmed decisions

- **Offline behavior:** mobile works fully offline — create/edit quotes, clients, jobs
  with zero signal; changes queue locally and sync automatically on reconnect.
- **Concurrency tier:** *small team, rarely collide.* The model must be **safe** under
  occasional concurrent edits (owner on-site + assistant at desk) but does NOT implement
  real-time collaborative editing (no CRDT/OT). Cost-appropriate for the target user.
- **Freshness:** sync triggers are app-open, app-foreground, network-regained, and
  pull-to-refresh. **No live push (WebSockets) in v1** — a clean seam is left to add it.
- **Source of truth:** the server is authoritative for (a) derived money totals — always
  recomputed via `@jamquote/core`, never trusted from a client — and (b) the sync cursor
  (server clock). Clients are authoritative for user intent (field edits).

## 2. Local replica & IDs

- **Mobile local store:** `expo-sqlite` + Drizzle ORM. First-party to Expo, no extra
  native config, shares TS types with `@jamquote/core`. (WatermelonDB was considered and
  rejected as heavier/more opinionated than our simple conflict rules need.)
- **Web:** online-first against the API in v1, but uses the *same* sync client library so
  it degrades gracefully. Full web offline replica (IndexedDB) is a later enhancement.
- **IDs are client-generated UUID v7** (time-ordered). The API accepts a client-supplied
  `id` on create (upsert semantics), so records made offline never collide and preserve
  creation order. No server-only `uuid()` default is relied on for syncable rows.

## 3. Required schema deltas (apply in Milestone 2)

Every **syncable** table must carry all three of:

| Column | Purpose |
|---|---|
| `updatedAt DateTime @updatedAt` | delta-sync cursor — "give me rows changed since X" |
| `deletedAt DateTime?` | tombstone — soft-delete, never hard-delete a synced row |
| (implicit) client-supplied `id` | offline-safe creation |

`deletedAt` is already present on the tenant tables. **`updatedAt` is currently MISSING and
must be added to:** `QuoteLineItem`, `QuoteSection`, `Supplier`, `LabourRate`,
`MaterialFavourite`, `EquipmentItem`, `Payment`. (`MaterialPriceEntry` is server-owned and
pull-only, so it is exempt.) Parent tables (Business, Client, Job, Quote, Invoice) already
have `updatedAt`.

## 4. Sync protocol (`apps/api/src/sync`)

Two endpoints, both tenant-scoped by `businessId` from the JWT, both idempotent.

- `POST /sync/pull { since, tables? }` → `{ changes: {table: rows[]}, cursor }`
  Returns every row (incl. tombstoned) with `updatedAt > since`, plus the new server cursor.
- `POST /sync/push { changes: [{ table, id, op, data, baseUpdatedAt }] }` →
  `{ results: [{ id, outcome, row }] }`
  Applies upserts/deletes with the conflict rule below, **recomputes derived totals via
  core**, and returns the authoritative rows so the client can reconcile.

The client keeps an **outbox** of unsynced local mutations; on a successful push it clears
them, then runs a pull with its stored cursor. Pushing the same change twice is safe.

## 5. Conflict resolution

**Record-level Last-Write-Wins by server-authoritative `updatedAt`**, refined so money is
never lost:

- **Quotes are merged at the line-item level, not overwritten wholesale.** Each
  `QuoteLineItem` is an independent LWW row keyed by its client UUID; adds and deletes merge
  naturally via tombstones. Quote *header* fields (discountPct, terms, validUntil) are LWW.
  **Totals are never synced as authoritative** — the server recomputes `subtotal/gct/total`
  from the merged line set via `computeTotals`. This kills the "two edits clobber the whole
  quote" data-loss case.
- **Payments are append-only** — you add a payment, never edit one — so they cannot
  conflict. `Invoice.paidCents` is derived server-side from the payment set.
- **Delete wins** over a concurrent edit (tombstone) in v1. Acceptable and simple.

This is near-zero data loss for the realistic case (one owner, phone + web) and stays far
cheaper than CRDTs while remaining safe for a small team.

## 6. Explicitly deferred (seams left open)

- Live push / WebSockets for near-instant multi-device updates.
- Full web offline replica (IndexedDB).
- Field-level 3-way merge and CRDTs (only if true concurrent collaboration is ever needed).
