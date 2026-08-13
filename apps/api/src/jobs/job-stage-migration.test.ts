/**
 * Guards the Job.stage enum migration (20260813120000_job_stage_enum) against
 * a REAL Postgres: PGlite runs an actual server in-process, so the enum
 * creation, the in-place column cast and the default swap are all exercised
 * for real rather than eyeballed.
 *
 * Why it matters: this one runs against live tenant rows and rewrites a column
 * in place. Every legacy free-text stage either lands on the right enum member
 * or is silently flattened to QUOTED, and nothing but a replay against real
 * Postgres will tell you which. Follows the same pattern as
 * catalogs/material-migration.test.ts — offline, no DATABASE_URL, no Neon.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "../../prisma/migrations");
const SCHEMA_PATH = join(__dirname, "../../prisma/schema.prisma");
const TARGET = "20260813120000_job_stage_enum";

function migrationDirs(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((d) => !d.includes("."))
    .sort();
}

const readMigration = (dir: string) => readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8");

/** Fresh Postgres with every migration up to (but excluding) `stopBefore`. */
async function freshDb(stopBefore?: string): Promise<PGlite> {
  const db = new PGlite();
  await db.waitReady;
  for (const dir of migrationDirs()) {
    if (stopBefore && dir === stopBefore) break;
    await db.exec(readMigration(dir));
  }
  return db;
}

/**
 * Legacy stages exactly as production can hold them: the column default, the
 * five values prisma/seed.ts wrote from the core demo fixtures, plus the
 * casing/separator/garbage variants an offline client could have pushed
 * through POST /sync back when its DTO took a bare string.
 */
const LEGACY_FIXTURES = `
INSERT INTO "Business" (id,name,"countryCode",currency,"entityType","defaultGctRate","quotePrefix","invoicePrefix","nextQuoteSeq","nextInvoiceSeq","createdAt","updatedAt")
VALUES ('biz-1','Blackwood Construction','JM','JMD','SOLE_TRADER',15.0,'QT-','INV-',1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "Job" (id,"businessId",name,stage,"progressPct","updatedAt") VALUES
  ('j-quoted','biz-1','Retaining wall','Quoted',0,CURRENT_TIMESTAMP),
  ('j-awaiting','biz-1','Fence & gate','Awaiting approval',40,CURRENT_TIMESTAMP),
  ('j-progress','biz-1','Bathroom remodel','In progress',62,CURRENT_TIMESTAMP),
  ('j-complete','biz-1','Kitchen tiling','Complete',100,CURRENT_TIMESTAMP),
  ('j-invoiced','biz-1','Carport extension','Invoiced',90,CURRENT_TIMESTAMP),
  ('j-cased','biz-1','Roof repair','  IN-PROGRESS  ',25,CURRENT_TIMESTAMP),
  ('j-underscore','biz-1','Soffit repair','in_progress',30,CURRENT_TIMESTAMP),
  ('j-cancelled','biz-1','Driveway','canceled',10,CURRENT_TIMESTAMP),
  ('j-garbage','biz-1','Perimeter wall','waiting on Basil',55,CURRENT_TIMESTAMP),
  ('j-empty','biz-1','Store room','',0,CURRENT_TIMESTAMP);
`;

interface JobRow {
  id: string;
  stage: string;
  progressPct: number;
}

describe("Job.stage enum migration", () => {
  let db: PGlite;
  let byId: Record<string, JobRow>;

  /** Throws rather than returning undefined, so a row the migration dropped
   * fails loudly here instead of as a confusing null check. */
  const job = (id: string): JobRow => {
    const row = byId[id];
    if (!row) throw new Error(`fixture ${id} is missing after the migration`);
    return row;
  };

  beforeAll(async () => {
    db = await freshDb(TARGET);
    await db.exec(LEGACY_FIXTURES);
    await db.exec(readMigration(TARGET));
    const rows = (await db.query<JobRow>(`SELECT id, stage, "progressPct" FROM "Job"`)).rows;
    byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  }, 120_000);

  describe("legacy value mapping", () => {
    it("maps the stages the demo seed actually wrote", () => {
      expect(job("j-quoted").stage).toBe("QUOTED");
      expect(job("j-progress").stage).toBe("IN_PROGRESS");
      expect(job("j-complete").stage).toBe("COMPLETE");
    });

    it("keeps 'Awaiting approval' at QUOTED — the job is not won yet", () => {
      expect(job("j-awaiting").stage).toBe("QUOTED");
    });

    it("maps 'Invoiced' to WON, not COMPLETE", () => {
      // An invoice proves the job was won; nothing in this database knows
      // whether the physical work is finished. Inventing COMPLETE here would
      // put a claim on the screen the system cannot support.
      expect(job("j-invoiced").stage).toBe("WON");
    });

    it("matches case-insensitively and treats -, _ and stray spaces as separators", () => {
      expect(job("j-cased").stage).toBe("IN_PROGRESS");
      expect(job("j-underscore").stage).toBe("IN_PROGRESS");
      expect(job("j-cancelled").stage).toBe("CANCELLED");
    });

    it("defaults unrecognized and empty stages to QUOTED rather than failing the deploy", () => {
      expect(job("j-garbage").stage).toBe("QUOTED");
      expect(job("j-empty").stage).toBe("QUOTED");
    });
  });

  describe("non-destructiveness", () => {
    it("migrates every row — no job is dropped", () => {
      expect(Object.keys(byId).sort()).toEqual([
        "j-awaiting", "j-cancelled", "j-cased", "j-complete", "j-empty",
        "j-garbage", "j-invoiced", "j-progress", "j-quoted", "j-underscore",
      ]);
    });

    it("leaves progressPct exactly as it was", () => {
      // The percentage is a separate hand-set fact. A stage remap must not
      // "tidy" it — a CANCELLED job keeps whatever it had reached, the read
      // side just stops rendering it (jobStageTracksProgress).
      expect(job("j-cancelled").progressPct).toBe(10);
      expect(job("j-invoiced").progressPct).toBe(90);
      expect(job("j-garbage").progressPct).toBe(55);
    });
  });

  describe("post-migration column shape", () => {
    it("stores stage as the JobStage enum with exactly the schema's members", async () => {
      const type = (
        await db.query<{ udt_name: string }>(
          `SELECT udt_name FROM information_schema.columns
            WHERE table_name = 'Job' AND column_name = 'stage'`,
        )
      ).rows[0]?.udt_name;
      expect(type).toBe("JobStage");

      const members = (
        await db.query<{ enumlabel: string }>(
          `SELECT e.enumlabel FROM pg_enum e
             JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'JobStage' ORDER BY e.enumsortorder`,
        )
      ).rows.map((r) => r.enumlabel);
      const schema = readFileSync(SCHEMA_PATH, "utf8");
      const declared = (schema.match(/^enum JobStage \{([\s\S]*?)^\}/m)?.[1] ?? "")
        .split("\n")
        .map((l) => l.replace(/\/\/.*$/, "").trim())
        .filter(Boolean);
      expect(members).toEqual(declared);
      // Guards the decision, not just the sync: no INVOICED/PAID member —
      // that is Invoice.status, and duplicating it invites the two to drift.
      expect(members).not.toContain("INVOICED");
      expect(members).not.toContain("PAID");
    });

    it("re-attaches a QUOTED default so inserts that omit stage still work", async () => {
      await db.exec(`INSERT INTO "Job" (id,"businessId",name,"updatedAt")
                     VALUES ('j-new','biz-1','New job',CURRENT_TIMESTAMP)`);
      const row = (await db.query<JobRow>(`SELECT id, stage, "progressPct" FROM "Job" WHERE id = 'j-new'`)).rows[0];
      expect(row?.stage).toBe("QUOTED");
      expect(row?.progressPct).toBe(0);
    });

    it("rejects a stage outside the enum", async () => {
      await expect(
        db.exec(`UPDATE "Job" SET stage = 'Invoiced' WHERE id = 'j-quoted'`),
      ).rejects.toThrow();
    });
  });
});
