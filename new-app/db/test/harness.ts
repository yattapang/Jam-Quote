/**
 * The one place tests get a real database from.
 *
 * Every db test replays the actual migration files against PGlite — real
 * Postgres, in process. Nothing here builds a schema by hand: a test that runs
 * against a hand-written schema proves something about that hand-written schema,
 * not about what production runs. The Phase 0 audit's most expensive findings all
 * lived where a mock could not disagree with the database.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { PGlite } from "@electric-sql/pglite";

const HERE = dirname(fileURLToPath(import.meta.url));

/** `db/migrations`, resolved from this file so the cwd does not matter. */
export const MIGRATIONS_DIR = join(HERE, "..", "migrations");

/**
 * The unprivileged role the application connects as in production.
 *
 * It exists in tests because PGlite connects as a superuser, and a superuser
 * bypasses row-level security completely. Without `SET ROLE`, every isolation
 * test would pass with the policies deleted.
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
 * The role is granted ordinary table privileges and nothing else: no BYPASSRLS,
 * no ownership, no superuser. That is the whole point — it is the least-privileged
 * identity the policies are written for.
 */
export async function applyMigrations(db: PGlite): Promise<void> {
  for (const name of await migrationNames()) {
    await db.exec(await migrationSql(name));
  }

  await db.exec(`
    CREATE ROLE ${APP_ROLE} NOLOGIN;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE};
    GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
  `);
}
