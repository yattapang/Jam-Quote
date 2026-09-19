/**
 * Guards the backfill in 20260918120000_business_gct_registered against a REAL
 * Postgres (PGlite, in-process, offline) — same approach as
 * material-migration.test.ts. Every migration before the target is replayed,
 * legacy-shaped rows are inserted, then the target runs.
 *
 * The rule under test: an existing business is registered iff it has a
 * non-blank TRN, which is exactly what the app inferred before the flag
 * existed — so no tenant's margins change on deploy. A business created AFTER
 * the migration defaults to NOT registered.
 */
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "../../prisma/migrations");
const TARGET = "20260918120000_business_gct_registered";

const dirs = () => readdirSync(MIGRATIONS_DIR).filter((d) => !d.includes(".")).sort();
const sql = (dir: string) => readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8");

const insert = (id: string, trn: string | null) =>
  `INSERT INTO "Business" (id,name,"updatedAt",trn) VALUES ('${id}','${id}',CURRENT_TIMESTAMP,${
    trn === null ? "NULL" : `'${trn}'`
  });`;

describe("the gctRegistered migration", () => {
  it("sorts after every migration that existed when it was written", () => {
    // Pinned to the then-latest name rather than "is last", so a later
    // migration does not fail this test for doing nothing wrong.
    const all = dirs();
    expect(all).toContain(TARGET);
    expect(all.indexOf(TARGET)).toBeGreaterThan(all.indexOf("20260913090000_free_tier_three_quotes"));
    expect(all.indexOf("20260913090000_free_tier_three_quotes")).toBeGreaterThan(-1);
  });

  it("backfills from the TRN for existing rows and defaults new rows to false", async () => {
    const db = new PGlite();
    await db.waitReady;
    for (const dir of dirs()) {
      if (dir === TARGET) break;
      await db.exec(sql(dir));
    }
    await db.exec(
      [insert("with_trn", "102458963"), insert("no_trn", null), insert("blank", ""), insert("spaces", "   ")].join("\n"),
    );

    await db.exec(sql(TARGET));
    await db.exec(insert("created_after", "102458963"));

    const { rows } = await db.query<{ id: string; gctRegistered: boolean }>(
      `SELECT id, "gctRegistered" FROM "Business" ORDER BY id`,
    );
    expect(Object.fromEntries(rows.map((r) => [r.id, r.gctRegistered]))).toEqual({
      with_trn: true,
      no_trn: false,
      blank: false,
      spaces: false,
      // A TRN typed in after the migration does NOT register anyone: that is
      // the whole point of the flag.
      created_after: false,
    });

    // NOT NULL: a missing answer must not be representable.
    await expect(db.exec(`UPDATE "Business" SET "gctRegistered" = NULL`)).rejects.toThrow();
    await db.close();
  }, 120_000);
});
