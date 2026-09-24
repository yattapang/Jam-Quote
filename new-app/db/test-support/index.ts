/**
 * The one place a test gets a real database from.
 *
 * WHY THIS IS A PACKAGE EXPORT AND NOT A FILE PER SUITE (F12, independent review 2026-09-24)
 *
 * It was a file per suite. `db/test/harness.ts` said it was "the one place tests get a real
 * database from" while four api test files each rebuilt the same thing by hand: read the
 * migrations directory, sort it, replay each `migration.sql`, create the unprivileged role, grant
 * on all tables. Rule 7 exists for exactly this — one rule, one place — and the harness that
 * enforces the rule was the thing breaking it.
 *
 * It was not harmless duplication. `rate-limiter.test.ts` created **no role at all**, so the
 * limiter was never exercised as the unprivileged identity the policies are written for; every
 * other suite was. Nobody noticed, because each file looked correct on its own. That is the
 * signature of a copied rule: the copies diverge where it matters least visibly.
 *
 * Exported from `@pryvis/db` under `./test-support` so the api can import it without reaching
 * into another workspace's internals — the same boundary rule the import guard enforces for
 * modules.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** `db/migrations`, resolved from this file so no caller's working directory matters. */
export const MIGRATIONS_DIR = join(HERE, "..", "migrations");

/**
 * The unprivileged role the application connects as in production.
 *
 * Every suite must `SET ROLE` to it before attacking a policy. PGlite connects as a superuser,
 * and a superuser bypasses row-level security completely — so a test that skips this step would
 * pass with every policy deleted.
 */
export const APP_ROLE = "pryvis_app";

/** Migration directory names in lexical order, which is their apply order. */
export async function migrationNames(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** The SQL of one migration, exactly as Prisma would apply it. */
export async function migrationSql(name: string): Promise<string> {
  return readFile(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
}

/**
 * Applies every migration in order, then creates the application role.
 *
 * The role is granted ordinary table privileges and nothing else: no BYPASSRLS, no ownership, no
 * superuser. That is the point — it is the least-privileged identity the policies are written for.
 */
export async function applyMigrations(db: PGlite): Promise<void> {
  const names = await migrationNames();
  if (names.length === 0) {
    // A database with no migrations would make every test that uses it vacuous rather than failing.
    throw new Error(`No migrations found in ${MIGRATIONS_DIR}; a test using this would prove nothing.`);
  }
  for (const name of names) {
    await db.exec(await migrationSql(name));
  }

  await db.exec(`
    CREATE ROLE ${APP_ROLE} NOLOGIN;
    GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE};
  `);
}

/**
 * A fresh migrated database, already set to the application role.
 *
 * The common case, in one call. Seeding happens before `SET ROLE` in most suites — a superuser
 * bypasses RLS, which is what lets a test plant another tenant's row and then prove it is
 * unreachable — so `seed` runs with full privileges and the role is set afterwards.
 */
export async function createTestDatabase(
  seed?: (db: PGlite) => Promise<void>,
): Promise<PGlite> {
  const db = new PGlite();
  await applyMigrations(db);
  if (seed) await seed(db);
  await db.exec(`SET ROLE ${APP_ROLE};`);
  return db;
}

/**
 * Runs `work` with full privileges, then returns to the application role.
 *
 * For test setup that must bypass row-level security — creating another tenant's data, or
 * changing a row the app role is not allowed to touch. Named so that stepping outside the
 * unprivileged identity is visible in the test, rather than a bare `RESET ROLE` that a reader has
 * to notice.
 */
export async function asSuperuser<T>(db: PGlite, work: () => Promise<T>): Promise<T> {
  await db.exec("RESET ROLE");
  try {
    return await work();
  } finally {
    await db.exec(`SET ROLE ${APP_ROLE};`);
  }
}
