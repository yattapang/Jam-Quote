/**
 * Guards the Phase 2a material-catalog migration
 * (20260806120000_material_attribute_schema) against a REAL Postgres, not a
 * mock: PGlite runs an actual Postgres in-process, so the plpgsql backfill,
 * the jsonb rewriting and the FK/constraint behaviour are all exercised for
 * real.
 *
 * Why this test exists rather than a one-off rehearsal script: the backfill
 * rewrites every existing MaterialFavourite's specs from label-keyed to
 * attribute-keyed, remaps its category and unit onto FK'd vocabulary rows, and
 * must do so WITHOUT SILENTLY LOSING ANYTHING. That invariant is easy to break
 * with a later edit and impossible to notice by reading the SQL.
 *
 * These tests are slow-ish (each boots a fresh Postgres and replays every
 * migration) but they run entirely offline — no DATABASE_URL, no Neon, no
 * shadow database.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "../../prisma/migrations");
const SCHEMA_PATH = join(__dirname, "../../prisma/schema.prisma");
const TARGET = "20260806120000_material_attribute_schema";

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
 * Legacy-shaped fixtures: one row per way pre-2a data can be awkward. Written
 * against the OLD shape (free-text category, label-keyed specs, free-string
 * unit) exactly as production holds it today.
 */
const LEGACY_FIXTURES = `
INSERT INTO "Business" (id,name,"countryCode",currency,"entityType","defaultGctRate","quotePrefix","invoicePrefix","nextQuoteSeq","nextInvoiceSeq","createdAt","updatedAt")
VALUES ('biz-1','Blackwood Construction','JM','JMD','SOLE_TRADER',15.0,'QT-','INV-',1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
       ('biz-2','Second Tenant','JM','JMD','SOLE_TRADER',15.0,'QT-','INV-',1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "MaterialFavourite" (id,"businessId",name,unit,"priceCents",category,specs,description,"updatedAt") VALUES
  ('m1','biz-1','Lumber','length',185000,'Lumber','{"Dimension":"2x4","Length":"16ft","Grade":"Select"}','from the Palisadoes job',CURRENT_TIMESTAMP),
  ('m2','biz-1','Hardwood post','ea',450000,'Lumber','{"Dimension":"4x4","Length":"8ft","Species":"Ironwood"}',NULL,CURRENT_TIMESTAMP),
  ('m3','biz-1','Cedar board','ea',95000,'Lumber','{"Species":"cedar"}',NULL,CURRENT_TIMESTAMP),
  ('m4','biz-1','Rebar bundle','bundle',720000,'Steel / Rebar','{"Diameter":"1/2in","Moisture":"dry"}',NULL,CURRENT_TIMESTAMP),
  ('m5','biz-1','Scaffold clamp','ea',35000,'Scaffolding','{"Type":"Swivel"}',NULL,CURRENT_TIMESTAMP),
  ('m6','biz-1','Sand','truckload',2500000,'Aggregate / Sand','{"Type":"Sharp Sand"}',NULL,CURRENT_TIMESTAMP),
  ('m7','biz-1','Mystery item',NULL,1000,NULL,'{"Colour":"red"}',NULL,CURRENT_TIMESTAMP),
  ('m8','biz-1','Bare minimum',NULL,500,NULL,NULL,NULL,CURRENT_TIMESTAMP),
  ('m9','biz-1','Deleted block','ea',9000,'Blocks','{"Size":"6in","Type":"Hollow"}',NULL,CURRENT_TIMESTAMP),
  ('m10','biz-2','Other hardwood','ea',400000,'Lumber','{"Species":"Ironwood"}',NULL,CURRENT_TIMESTAMP);

UPDATE "MaterialFavourite" SET "deletedAt" = CURRENT_TIMESTAMP WHERE id = 'm9';
`;

interface MaterialRow {
  id: string;
  name: string;
  nameCustom: boolean;
  category: string | null;
  unit: string | null;
  specs: Record<string, string> | null;
  searchText: string | null;
  cat_key: string | null;
  cat_biz: string | null;
  unit_key: string | null;
  unit_biz: string | null;
}

describe("material catalog Phase 2a migration", () => {
  let db: PGlite;
  let byId: Record<string, MaterialRow>;

  /** Fixture row by id — throws rather than returning undefined, so a row the
   * migration dropped fails loudly here instead of as a confusing null check. */
  const mat = (id: string): MaterialRow => {
    const row = byId[id];
    if (!row) throw new Error(`fixture ${id} is missing after the migration`);
    return row;
  };

  beforeAll(async () => {
    db = await freshDb(TARGET);
    await db.exec(LEGACY_FIXTURES);
    await db.exec(readMigration(TARGET));
    const rows = (
      await db.query<MaterialRow>(`
        SELECT f.id, f.name, f."nameCustom", f.category, f.unit, f.specs, f."searchText",
               c.key AS cat_key, c."businessId" AS cat_biz,
               u.key AS unit_key, u."businessId" AS unit_biz
          FROM "MaterialFavourite" f
          LEFT JOIN "MaterialCategoryDef" c ON c.id = f."categoryDefId"
          LEFT JOIN "MaterialUnit" u ON u.id = f."unitId"`)
    ).rows;
    byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  }, 120_000);

  describe("category and unit mapping", () => {
    it("maps the legacy category strings onto the curated rows", () => {
      expect(mat("m1").cat_key).toBe("lumber");
      expect(mat("m1").cat_biz).toBeNull(); // curated, not a per-tenant copy
      expect(mat("m9").cat_key).toBe("blocks");
    });

    it("maps a legacy unit string onto the curated unit", () => {
      expect(mat("m1").unit_key).toBe("length");
      expect(mat("m1").unit_biz).toBeNull();
    });

    it("turns an unrecognized category into a TENANT category rather than dropping it", () => {
      expect(mat("m5").cat_key).toBe("scaffolding");
      expect(mat("m5").cat_biz).toBe("biz-1");
    });

    it("turns an unrecognized unit into a TENANT unit rather than dropping it", () => {
      expect(mat("m6").unit_key).toBe("truckload");
      expect(mat("m6").unit_biz).toBe("biz-1");
    });

    it("parks specs that have no category on curated 'other' instead of losing them", () => {
      expect(mat("m7").cat_key).toBe("other");
      expect(mat("m7").specs?.colour).toBe("red");
    });

    it("leaves a row with no category/unit/specs untouched", () => {
      expect(mat("m8").cat_key).toBeNull();
      expect(mat("m8").unit_key).toBeNull();
      expect(mat("m8").specs).toBeNull();
    });

    it("migrates soft-deleted rows too (AssemblyComponent can still reference them)", () => {
      expect(mat("m9").cat_key).toBe("blocks");
      expect(mat("m9").specs).toEqual({ size: "6in", type: "Hollow" });
    });
  });

  describe("spec keys move from display label to attribute key", () => {
    it("rewrites curated labels to their attribute keys", () => {
      expect(mat("m1").specs).toEqual({ dimension: "2x4", length: "16ft", grade: "Select" });
    });

    it("keeps a spec whose key matches no curated attribute", () => {
      // "Moisture" is not an attribute of Steel / Rebar — it must survive as a
      // tenant-defined TEXT attribute, not be discarded.
      expect(mat("m4").specs).toEqual({ diameter: "1/2in", moisture: "dry" });
    });

    it("creates the unknown key as a tenant-scoped TEXT attribute", async () => {
      const rows = (
        await db.query<{ key: string; kind: string; businessId: string | null }>(
          `SELECT key, kind, "businessId" FROM "MaterialAttributeDef" WHERE key = 'moisture'`,
        )
      ).rows;
      expect(rows).toHaveLength(1);
      // TEXT, not ENUM: one observed value is not a vocabulary, and guessing
      // one would wrongly constrain what the contractor can type later.
      expect(rows[0]?.kind).toBe("TEXT");
      expect(rows[0]?.businessId).toBe("biz-1");
    });
  });

  describe("controlled vocabulary", () => {
    it("records an off-vocabulary value as a tenant option", async () => {
      const rows = (
        await db.query<{ businessId: string; label: string }>(
          `SELECT o."businessId", o.label FROM "MaterialAttributeOption" o
             JOIN "MaterialAttributeDef" a ON a.id = o."attributeId"
            WHERE o.value = 'ironwood' AND a.key = 'species'`,
        )
      ).rows;
      // One per tenant: biz-2's Ironwood must NOT reuse biz-1's private option,
      // or one tenant's vocabulary would leak into another's picker.
      expect(rows.map((r) => r.businessId).sort()).toEqual(["biz-1", "biz-2"]);
    });

    it("folds a differently-cased value onto the existing curated option", async () => {
      const dupes = (
        await db.query(`SELECT id FROM "MaterialAttributeOption" WHERE value = 'cedar' AND "businessId" IS NOT NULL`)
      ).rows;
      expect(dupes).toHaveLength(0); // 'cedar' matched curated 'Cedar'
    });

    it("preserves the contractor's original casing in the material's specs", () => {
      // Normalization is for matching only — what they typed is what they see.
      expect(mat("m3").specs?.species).toBe("cedar");
    });
  });

  describe("non-destructiveness", () => {
    it("does not rename existing materials", () => {
      expect(mat("m1").name).toBe("Lumber");
      expect(mat("m5").name).toBe("Scaffold clamp");
    });

    it("marks every pre-existing row nameCustom so composition never rewrites it", () => {
      // Their names were hand-typed and already shown to customers; composing
      // over them on the next save would silently change quote documents.
      expect(Object.values(byId).every((r) => r.nameCustom === true)).toBe(true);
    });

    it("retains the legacy category/unit columns as a recovery path", () => {
      expect(mat("m5").category).toBe("Scaffolding");
      expect(mat("m6").unit).toBe("truckload");
    });

    it("builds searchText from name, description and spec values", () => {
      const s = mat("m1").searchText ?? "";
      for (const term of ["lumber", "palisadoes", "2x4", "16ft", "select"]) {
        expect(s).toContain(term);
      }
    });
  });

  describe("curated seed", () => {
    it("seeds the curated catalog with businessId NULL", async () => {
      const counts = (
        await db.query<Record<string, number>>(`
          SELECT (SELECT count(*) FROM "MaterialCategoryDef" WHERE "businessId" IS NULL)::int AS cats,
                 (SELECT count(*) FROM "MaterialAttributeDef" WHERE "businessId" IS NULL)::int AS attrs,
                 (SELECT count(*) FROM "MaterialAttributeOption" WHERE "businessId" IS NULL)::int AS opts,
                 (SELECT count(*) FROM "MaterialUnit" WHERE "businessId" IS NULL)::int AS units`)
      ).rows[0];
      expect(counts).toEqual({ cats: 13, attrs: 36, opts: 185, units: 17 });
    });

    it("covers every material kind, not just lumber", async () => {
      const keys = (
        await db.query<{ key: string }>(`SELECT key FROM "MaterialCategoryDef" WHERE "businessId" IS NULL ORDER BY key`)
      ).rows.map((r) => r.key);
      expect(keys).toEqual([
        "aggregate-sand", "blocks", "cement", "doors-windows", "electrical",
        "fixings", "lumber", "other", "paint", "plumbing", "roofing",
        "steel-rebar", "tiles",
      ]);
    });
  });

  describe("tenant isolation", () => {
    it("cascades a tenant's private vocabulary away with the tenant", async () => {
      // The #19 failure mode: with ON DELETE SET NULL these rows would survive
      // with businessId NULL — i.e. one tenant's private categories, options
      // and units silently promoted into the curated list every tenant sees.
      const fresh = await freshDb();
      await fresh.exec(LEGACY_FIXTURES.replace(/INSERT INTO "MaterialFavourite"[\s\S]*$/, ""));
      await fresh.exec(`
        INSERT INTO "MaterialCategoryDef" (id,"businessId",key,label,sort,"createdAt")
          VALUES ('c-priv','biz-1','private','Private',0,CURRENT_TIMESTAMP);
        INSERT INTO "MaterialUnit" (id,"businessId",key,label,sort,"createdAt")
          VALUES ('u-priv','biz-1','drum','Drum',0,CURRENT_TIMESTAMP);
        DELETE FROM "MaterialFavourite" WHERE "businessId" = 'biz-1';
        DELETE FROM "Business" WHERE id = 'biz-1';
      `);
      const orphans = (
        await fresh.query(`
          SELECT id FROM "MaterialCategoryDef" WHERE id = 'c-priv'
          UNION ALL SELECT id FROM "MaterialUnit" WHERE id = 'u-priv'`)
      ).rows;
      expect(orphans).toHaveLength(0);
      await fresh.close();
    }, 120_000);
  });

  describe("migration/schema consistency", () => {
    it("creates exactly the columns schema.prisma declares", async () => {
      const schema = readFileSync(SCHEMA_PATH, "utf8");
      const SCALAR =
        /^(String|Int|Boolean|DateTime|Decimal|Json|Float|BigInt|Bytes|MaterialAttributeKind)$/;
      const tables = [
        "MaterialCategoryDef", "MaterialAttributeDef",
        "MaterialAttributeOption", "MaterialUnit", "MaterialFavourite",
      ];
      for (const table of tables) {
        const model = schema.match(new RegExp(`^model ${table} \\{([\\s\\S]*?)^\\}`, "m"));
        if (!model) throw new Error(`${table} missing from schema.prisma`);
        const expected = new Set<string>();
        for (const raw of (model[1] ?? "").split("\n")) {
          const line = raw.replace(/\/\/.*$/, "").trim();
          if (!line || line.startsWith("@@")) continue;
          const [name, type] = line.split(/\s+/);
          if (!name || !type) continue;
          if (!SCALAR.test(type.replace(/[?[\]]/g, ""))) continue; // relation field
          expected.add(name);
        }
        const actual = new Set(
          (
            await db.query<{ column_name: string }>(
              `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
              [table],
            )
          ).rows.map((r) => r.column_name),
        );
        expect([...expected].filter((c) => !actual.has(c)), `${table}: in schema.prisma but not migrated`).toEqual([]);
        expect([...actual].filter((c) => !expected.has(c)), `${table}: migrated but not in schema.prisma`).toEqual([]);
      }
    });
  });
});
