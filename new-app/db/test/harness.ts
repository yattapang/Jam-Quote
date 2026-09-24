/**
 * Re-export of the shared test support, kept so existing imports keep working.
 *
 * The implementation moved to `db/test-support/` (F12) so the api can use the same one instead of
 * rebuilding it by hand in four files. This file used to BE the implementation while claiming to
 * be "the one place tests get a real database from" — which it was not, and the divergence it
 * allowed was real: one api suite created no unprivileged role at all, so its subject was never
 * exercised as the identity the policies are written for.
 */
export {
  APP_ROLE,
  MIGRATIONS_DIR,
  applyMigrations,
  asSuperuser,
  createTestDatabase,
  migrationNames,
  migrationSql,
} from "../test-support/index.js";
