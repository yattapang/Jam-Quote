-- Material catalog Phase 2a (#26): typed attributes with controlled
-- vocabularies, composed display names, sold-by units.
--
-- Replaces the UI-only convention where MaterialFavourite.category was a free
-- string and .specs an untyped JSON blob. The shape of a material becomes DATA
-- (curated rows with businessId NULL + per-tenant additions), following the
-- same pattern as Trade.
--
-- The legacy "category" and "unit" text columns are deliberately NOT dropped.
-- They are the recovery path if the backfill below mis-maps anything, and
-- keeping them makes this migration reversible. A later migration can drop
-- them once the new columns have been observed correct in production.

-- CreateEnum
CREATE TYPE "MaterialAttributeKind" AS ENUM ('ENUM', 'TEXT', 'NUMBER');

-- CreateTable
CREATE TABLE "MaterialCategoryDef" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MaterialCategoryDef_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaterialAttributeDef" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "businessId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "MaterialAttributeKind" NOT NULL DEFAULT 'ENUM',
    "unit" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "includeInName" BOOLEAN NOT NULL DEFAULT false,
    "nameOrder" INTEGER,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MaterialAttributeDef_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaterialAttributeOption" (
    "id" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "businessId" TEXT,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MaterialAttributeOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaterialUnit" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MaterialUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialCategoryDef_businessId_idx" ON "MaterialCategoryDef"("businessId");
CREATE INDEX "MaterialCategoryDef_key_idx" ON "MaterialCategoryDef"("key");
CREATE INDEX "MaterialAttributeDef_categoryId_idx" ON "MaterialAttributeDef"("categoryId");
CREATE INDEX "MaterialAttributeDef_businessId_idx" ON "MaterialAttributeDef"("businessId");
CREATE INDEX "MaterialAttributeOption_attributeId_idx" ON "MaterialAttributeOption"("attributeId");
CREATE INDEX "MaterialAttributeOption_businessId_idx" ON "MaterialAttributeOption"("businessId");
CREATE INDEX "MaterialUnit_businessId_idx" ON "MaterialUnit"("businessId");
CREATE INDEX "MaterialUnit_key_idx" ON "MaterialUnit"("key");

-- AddForeignKey
-- ON DELETE CASCADE on every businessId is REQUIRED, not cosmetic: with SET
-- NULL, deleting a tenant would promote that tenant's private categories,
-- attributes, options and units into curated rows visible to EVERY tenant.
-- Same class of bug as #19.
ALTER TABLE "MaterialCategoryDef" ADD CONSTRAINT "MaterialCategoryDef_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialAttributeDef" ADD CONSTRAINT "MaterialAttributeDef_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MaterialCategoryDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialAttributeDef" ADD CONSTRAINT "MaterialAttributeDef_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialAttributeOption" ADD CONSTRAINT "MaterialAttributeOption_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "MaterialAttributeDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialAttributeOption" ADD CONSTRAINT "MaterialAttributeOption_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialUnit" ADD CONSTRAINT "MaterialUnit_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "MaterialFavourite" ADD COLUMN "nameCustom" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MaterialFavourite" ADD COLUMN "unitId" TEXT;
ALTER TABLE "MaterialFavourite" ADD COLUMN "categoryDefId" TEXT;
ALTER TABLE "MaterialFavourite" ADD COLUMN "searchText" TEXT;
ALTER TABLE "MaterialFavourite" ADD COLUMN "measureUnit" TEXT;
ALTER TABLE "MaterialFavourite" ADD COLUMN "coveragePerSellUnit" DECIMAL(12,4);
ALTER TABLE "MaterialFavourite" ADD COLUMN "wastePct" DECIMAL(5,2);

CREATE INDEX "MaterialFavourite_categoryDefId_idx" ON "MaterialFavourite"("categoryDefId");
CREATE INDEX "MaterialFavourite_unitId_idx" ON "MaterialFavourite"("unitId");
CREATE INDEX "MaterialFavourite_searchText_idx" ON "MaterialFavourite"("searchText");

-- ON DELETE RESTRICT (Prisma's default for an optional relation without an
-- explicit rule is SET NULL; here we want neither silent data loss nor
-- promotion, so a category/unit still in use simply cannot be hard-deleted —
-- both are soft-deleted via deletedAt in normal operation).
ALTER TABLE "MaterialFavourite" ADD CONSTRAINT "MaterialFavourite_categoryDefId_fkey" FOREIGN KEY ("categoryDefId") REFERENCES "MaterialCategoryDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialFavourite" ADD CONSTRAINT "MaterialFavourite_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "MaterialUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Curated catalog (businessId NULL). Ids are fixed literals, not
-- gen_random_uuid(), so this migration is deterministic across environments;
-- material-schema.catalog.ts mirrors these same ids as its in-code fallback.

INSERT INTO "MaterialCategoryDef" ("id","businessId","key","label","sort","createdAt") VALUES
  ('82c49c82-0bc9-487c-a323-2ca4752f9d25', NULL, 'lumber', 'Lumber', 0, CURRENT_TIMESTAMP),
  ('ef8a349b-a4ba-40fb-a972-8a25ac85a25d', NULL, 'steel-rebar', 'Steel / Rebar', 1, CURRENT_TIMESTAMP),
  ('89ddc7df-9228-44be-9042-046ae4ec78d8', NULL, 'blocks', 'Blocks', 2, CURRENT_TIMESTAMP),
  ('ddb28da1-ef04-42c1-a803-3c285a7203fd', NULL, 'cement', 'Cement', 3, CURRENT_TIMESTAMP),
  ('9e0f125d-0e35-42f8-979b-b53980aec1b3', NULL, 'aggregate-sand', 'Aggregate / Sand', 4, CURRENT_TIMESTAMP),
  ('df093ecf-997a-4a62-900d-040f1f381ea8', NULL, 'roofing', 'Roofing', 5, CURRENT_TIMESTAMP),
  ('92b02734-6827-401c-8b72-d52d4cf68765', NULL, 'tiles', 'Tiles', 6, CURRENT_TIMESTAMP),
  ('9a8e1291-b734-4c6d-8d3f-ba2abed3823f', NULL, 'plumbing', 'Plumbing', 7, CURRENT_TIMESTAMP),
  ('83e33a11-0a70-4b30-ba25-ca74c5192d1a', NULL, 'electrical', 'Electrical', 8, CURRENT_TIMESTAMP),
  ('ade150a0-e400-443c-841d-686483c84d9b', NULL, 'paint', 'Paint', 9, CURRENT_TIMESTAMP),
  ('51c183db-b252-48cc-ab69-f903c575c94e', NULL, 'doors-windows', 'Doors & Windows', 10, CURRENT_TIMESTAMP),
  ('e220add5-ca98-43d6-a78c-47f0f31c490e', NULL, 'fixings', 'Fixings', 11, CURRENT_TIMESTAMP),
  ('276bdd6c-5e54-4d60-a7bd-e6d2cac7da23', NULL, 'other', 'Other', 12, CURRENT_TIMESTAMP);

INSERT INTO "MaterialAttributeDef" ("id","categoryId","businessId","key","label","kind","required","includeInName","nameOrder","sort","createdAt") VALUES
  ('0851fc31-68e1-49c0-846c-d23881b8b00e', '82c49c82-0bc9-487c-a323-2ca4752f9d25', NULL, 'dimension', 'Dimension', 'ENUM', false, true, 1, 0, CURRENT_TIMESTAMP),
  ('714633d7-47a1-4891-8909-4a51422e1deb', '82c49c82-0bc9-487c-a323-2ca4752f9d25', NULL, 'length', 'Length', 'ENUM', false, true, 2, 1, CURRENT_TIMESTAMP),
  ('e27f74c3-5ca6-4b90-a09e-21523c03f46c', '82c49c82-0bc9-487c-a323-2ca4752f9d25', NULL, 'species', 'Species', 'ENUM', false, true, 3, 2, CURRENT_TIMESTAMP),
  ('02707915-d53b-49bf-8c1b-9ebc3ee9961d', '82c49c82-0bc9-487c-a323-2ca4752f9d25', NULL, 'grade', 'Grade', 'ENUM', false, true, 4, 3, CURRENT_TIMESTAMP),
  ('b6c4dc41-6df9-403f-87a9-9021907358f3', 'ef8a349b-a4ba-40fb-a972-8a25ac85a25d', NULL, 'diameter', 'Diameter', 'ENUM', false, true, 1, 0, CURRENT_TIMESTAMP),
  ('821bf229-ff61-485e-8b51-8ca16074ce74', 'ef8a349b-a4ba-40fb-a972-8a25ac85a25d', NULL, 'length', 'Length', 'ENUM', false, true, 2, 1, CURRENT_TIMESTAMP),
  ('8359e9a7-d133-42d5-aa54-98187f38057c', 'ef8a349b-a4ba-40fb-a972-8a25ac85a25d', NULL, 'grade', 'Grade', 'ENUM', false, true, 3, 2, CURRENT_TIMESTAMP),
  ('6dda4ec2-78f3-4626-a436-b23f6b30385e', '89ddc7df-9228-44be-9042-046ae4ec78d8', NULL, 'size', 'Size', 'ENUM', false, true, 1, 0, CURRENT_TIMESTAMP),
  ('83f6ea73-2f4c-4cb6-9f57-0849a0adfa7e', '89ddc7df-9228-44be-9042-046ae4ec78d8', NULL, 'type', 'Type', 'ENUM', false, true, 2, 1, CURRENT_TIMESTAMP),
  ('5701ed77-1523-4d90-8454-0d7012117163', 'ddb28da1-ef04-42c1-a803-3c285a7203fd', NULL, 'type', 'Type', 'ENUM', false, true, 1, 0, CURRENT_TIMESTAMP),
  ('2553c128-733c-4738-b775-efe9c912b90a', 'ddb28da1-ef04-42c1-a803-3c285a7203fd', NULL, 'bagSize', 'Bag size', 'ENUM', false, true, 2, 1, CURRENT_TIMESTAMP),
  ('e54f21fa-5736-4075-844a-3ef2fd821033', '9e0f125d-0e35-42f8-979b-b53980aec1b3', NULL, 'type', 'Type', 'ENUM', false, true, 1, 0, CURRENT_TIMESTAMP),
  ('f9456a2a-07d9-4aff-9b5b-0cda0b808026', '9e0f125d-0e35-42f8-979b-b53980aec1b3', NULL, 'grade', 'Grade', 'ENUM', false, true, 2, 1, CURRENT_TIMESTAMP),
  ('9f5d6828-1a16-4c0f-a368-08ec32eac986', 'df093ecf-997a-4a62-900d-040f1f381ea8', NULL, 'type', 'Type', 'ENUM', false, true, 1, 0, CURRENT_TIMESTAMP),
  ('4701cbee-81e8-4c0d-a324-3e4b185c9c8f', 'df093ecf-997a-4a62-900d-040f1f381ea8', NULL, 'profile', 'Profile', 'ENUM', false, true, 2, 1, CURRENT_TIMESTAMP),
  ('cdeef3fd-8153-4143-a9e1-2527107f6048', 'df093ecf-997a-4a62-900d-040f1f381ea8', NULL, 'gauge', 'Gauge', 'ENUM', false, true, 3, 2, CURRENT_TIMESTAMP),
  ('17f859ed-0c55-4277-a724-423f3638a7a2', 'df093ecf-997a-4a62-900d-040f1f381ea8', NULL, 'length', 'Length', 'ENUM', false, true, 4, 3, CURRENT_TIMESTAMP),
  ('9a381a2f-9c07-4f08-87a5-fde5afe2a73a', '92b02734-6827-401c-8b72-d52d4cf68765', NULL, 'size', 'Size', 'ENUM', false, true, 1, 0, CURRENT_TIMESTAMP),
  ('b13a53e5-3360-4546-a66d-34f0f06f4165', '92b02734-6827-401c-8b72-d52d4cf68765', NULL, 'material', 'Material', 'ENUM', false, true, 2, 1, CURRENT_TIMESTAMP),
  ('1d0e39c4-84a2-4586-9573-0fca5d4ffcb1', '92b02734-6827-401c-8b72-d52d4cf68765', NULL, 'finish', 'Finish', 'ENUM', false, true, 3, 2, CURRENT_TIMESTAMP),
  ('107c1b15-a521-48c5-bb67-09beff2a45da', '9a8e1291-b734-4c6d-8d3f-ba2abed3823f', NULL, 'diameter', 'Diameter', 'ENUM', false, true, 1, 0, CURRENT_TIMESTAMP),
  ('396a6d6f-4d9b-4f81-a4b8-560dafcc2133', '9a8e1291-b734-4c6d-8d3f-ba2abed3823f', NULL, 'material', 'Material', 'ENUM', false, true, 2, 1, CURRENT_TIMESTAMP),
  ('cf4eae7f-c4bc-4314-b05d-fd02062743b7', '9a8e1291-b734-4c6d-8d3f-ba2abed3823f', NULL, 'schedule', 'Schedule', 'ENUM', false, true, 3, 2, CURRENT_TIMESTAMP),
  ('cfd15874-5bd9-4c73-9868-1c0632f6e982', '83e33a11-0a70-4b30-ba25-ca74c5192d1a', NULL, 'gauge', 'Gauge', 'ENUM', false, true, 1, 0, CURRENT_TIMESTAMP),
  ('e869dcf1-6398-4eec-983c-1576c4567956', '83e33a11-0a70-4b30-ba25-ca74c5192d1a', NULL, 'type', 'Type', 'ENUM', false, true, 2, 1, CURRENT_TIMESTAMP),
  ('d9d66b6e-4e3c-45be-8233-b6179a7ed78d', '83e33a11-0a70-4b30-ba25-ca74c5192d1a', NULL, 'conductor', 'Conductor', 'ENUM', false, true, 3, 2, CURRENT_TIMESTAMP),
  ('90d39848-e9f1-413c-8455-f36b26c254a7', 'ade150a0-e400-443c-841d-686483c84d9b', NULL, 'type', 'Type', 'ENUM', false, true, 1, 0, CURRENT_TIMESTAMP),
  ('244f7fab-70af-4241-a407-c03829f562ba', 'ade150a0-e400-443c-841d-686483c84d9b', NULL, 'finish', 'Finish', 'ENUM', false, true, 2, 1, CURRENT_TIMESTAMP),
  ('f9bb0679-f192-45db-af0f-8cea98f50330', 'ade150a0-e400-443c-841d-686483c84d9b', NULL, 'base', 'Base', 'ENUM', false, true, 3, 2, CURRENT_TIMESTAMP),
  ('a0497069-f0d3-454d-96a3-b9e531892cb1', 'ade150a0-e400-443c-841d-686483c84d9b', NULL, 'size', 'Size', 'ENUM', false, true, 4, 3, CURRENT_TIMESTAMP),
  ('2386da74-122d-417d-973c-2fb51536a3a6', '51c183db-b252-48cc-ab69-f903c575c94e', NULL, 'type', 'Type', 'ENUM', false, true, 1, 0, CURRENT_TIMESTAMP),
  ('5e4c6361-724c-4b76-9207-3dc59e1e061a', '51c183db-b252-48cc-ab69-f903c575c94e', NULL, 'material', 'Material', 'ENUM', false, true, 2, 1, CURRENT_TIMESTAMP),
  ('835beb48-d9d7-4cc6-8c4b-6ae290877fa7', '51c183db-b252-48cc-ab69-f903c575c94e', NULL, 'size', 'Size', 'TEXT', false, true, 3, 2, CURRENT_TIMESTAMP),
  ('9858d516-5f04-4805-b251-d675943660cb', 'e220add5-ca98-43d6-a78c-47f0f31c490e', NULL, 'type', 'Type', 'ENUM', false, true, 1, 0, CURRENT_TIMESTAMP),
  ('6f75df35-3f6d-4865-aa02-c26e1f6c5e3c', 'e220add5-ca98-43d6-a78c-47f0f31c490e', NULL, 'size', 'Size', 'TEXT', false, true, 2, 1, CURRENT_TIMESTAMP),
  ('ef4907d2-90a6-4a86-b26e-4b4a37fa120c', 'e220add5-ca98-43d6-a78c-47f0f31c490e', NULL, 'finish', 'Finish', 'ENUM', false, true, 3, 2, CURRENT_TIMESTAMP);

INSERT INTO "MaterialAttributeOption" ("id","attributeId","businessId","value","label","sort","createdAt") VALUES
  ('bd37c49d-be14-489d-b218-8f8d9796f0cc', '0851fc31-68e1-49c0-846c-d23881b8b00e', NULL, '1x2', '1x2', 0, CURRENT_TIMESTAMP),
  ('52bb83bc-9641-4112-83fc-8ca8d3c46fb7', '0851fc31-68e1-49c0-846c-d23881b8b00e', NULL, '1x3', '1x3', 1, CURRENT_TIMESTAMP),
  ('3332aafb-3b20-46ac-be6a-1e23fcc835d0', '0851fc31-68e1-49c0-846c-d23881b8b00e', NULL, '1x4', '1x4', 2, CURRENT_TIMESTAMP),
  ('a6b1bc67-3f10-42a3-a33c-3dc4e3ab6c7a', '0851fc31-68e1-49c0-846c-d23881b8b00e', NULL, '1x6', '1x6', 3, CURRENT_TIMESTAMP),
  ('36c45982-73fe-4c1a-bc1c-da70f2fafc70', '0851fc31-68e1-49c0-846c-d23881b8b00e', NULL, '1x8', '1x8', 4, CURRENT_TIMESTAMP),
  ('2939987e-b40c-446d-9ac8-061b06053bec', '0851fc31-68e1-49c0-846c-d23881b8b00e', NULL, '2x2', '2x2', 5, CURRENT_TIMESTAMP),
  ('534209cf-6704-465e-93c4-058a83b3e325', '0851fc31-68e1-49c0-846c-d23881b8b00e', NULL, '2x3', '2x3', 6, CURRENT_TIMESTAMP),
  ('582dc8e9-6951-4358-a49d-066e6af09818', '0851fc31-68e1-49c0-846c-d23881b8b00e', NULL, '2x4', '2x4', 7, CURRENT_TIMESTAMP),
  ('9bcc5cee-1cd9-462e-a4a6-70993f1cc0b5', '0851fc31-68e1-49c0-846c-d23881b8b00e', NULL, '2x6', '2x6', 8, CURRENT_TIMESTAMP),
  ('5b0ef616-c879-4e0b-a11e-6862633b63ba', '0851fc31-68e1-49c0-846c-d23881b8b00e', NULL, '2x8', '2x8', 9, CURRENT_TIMESTAMP),
  ('6a0060a8-5d53-47b9-b605-edd8ebf779d4', '0851fc31-68e1-49c0-846c-d23881b8b00e', NULL, '2x10', '2x10', 10, CURRENT_TIMESTAMP),
  ('e1687116-9479-4a97-b7cf-3d9dbe71ac64', '0851fc31-68e1-49c0-846c-d23881b8b00e', NULL, '2x12', '2x12', 11, CURRENT_TIMESTAMP),
  ('d0d858f1-8c43-480c-ba50-d6ed5f7da2af', '0851fc31-68e1-49c0-846c-d23881b8b00e', NULL, '4x4', '4x4', 12, CURRENT_TIMESTAMP),
  ('dcd699ee-31b0-485a-bb76-ba488b48831b', '0851fc31-68e1-49c0-846c-d23881b8b00e', NULL, '6x6', '6x6', 13, CURRENT_TIMESTAMP),
  ('d229b352-e95a-4ae5-90e8-50a2a80d3400', '714633d7-47a1-4891-8909-4a51422e1deb', NULL, '8ft', '8ft', 0, CURRENT_TIMESTAMP),
  ('90ba2893-7ee5-4e70-82d5-611ae8a461dc', '714633d7-47a1-4891-8909-4a51422e1deb', NULL, '10ft', '10ft', 1, CURRENT_TIMESTAMP),
  ('30507110-3536-4336-9102-82b94e25ae77', '714633d7-47a1-4891-8909-4a51422e1deb', NULL, '12ft', '12ft', 2, CURRENT_TIMESTAMP),
  ('a672e6f1-e6e1-4e98-a9d8-9cc3be15574d', '714633d7-47a1-4891-8909-4a51422e1deb', NULL, '14ft', '14ft', 3, CURRENT_TIMESTAMP),
  ('22b96888-8d5e-401b-a45c-2b086fbf8e2c', '714633d7-47a1-4891-8909-4a51422e1deb', NULL, '16ft', '16ft', 4, CURRENT_TIMESTAMP),
  ('552d3c99-102b-4a84-9f9c-c6d8a1e5443d', '714633d7-47a1-4891-8909-4a51422e1deb', NULL, '18ft', '18ft', 5, CURRENT_TIMESTAMP),
  ('ad4e857b-e997-41a8-9a4c-1259e5aa2b69', '714633d7-47a1-4891-8909-4a51422e1deb', NULL, '20ft', '20ft', 6, CURRENT_TIMESTAMP),
  ('827c2f07-8a64-429c-90a3-dc0b5552e5f2', 'e27f74c3-5ca6-4b90-a09e-21523c03f46c', NULL, 'pine', 'Pine', 0, CURRENT_TIMESTAMP),
  ('3a9d36b8-e2f4-4061-b10d-c538267aca4f', 'e27f74c3-5ca6-4b90-a09e-21523c03f46c', NULL, 'treated pine', 'Treated Pine', 1, CURRENT_TIMESTAMP),
  ('87234754-9b11-47bf-87a6-08298d0cc805', 'e27f74c3-5ca6-4b90-a09e-21523c03f46c', NULL, 'cedar', 'Cedar', 2, CURRENT_TIMESTAMP),
  ('a5d2b6bb-54e8-4e8a-b0a6-4fd281827ebe', 'e27f74c3-5ca6-4b90-a09e-21523c03f46c', NULL, 'mahogany', 'Mahogany', 3, CURRENT_TIMESTAMP),
  ('62e6930c-4bab-4f42-9509-a4d590efcd4c', 'e27f74c3-5ca6-4b90-a09e-21523c03f46c', NULL, 'blue mahoe', 'Blue Mahoe', 4, CURRENT_TIMESTAMP),
  ('4d5b11a5-6f9c-4ef0-971a-99f81155d4a5', 'e27f74c3-5ca6-4b90-a09e-21523c03f46c', NULL, 'greenheart', 'Greenheart', 5, CURRENT_TIMESTAMP),
  ('b3c4b4c8-e85c-41ec-8c92-901ef7638a26', 'e27f74c3-5ca6-4b90-a09e-21523c03f46c', NULL, 'teak', 'Teak', 6, CURRENT_TIMESTAMP),
  ('39cf984d-2bc1-4b03-acd9-def2f54fb1a2', '02707915-d53b-49bf-8c1b-9ebc3ee9961d', NULL, 'select', 'Select', 0, CURRENT_TIMESTAMP),
  ('ebe0fd8e-efc3-4186-87bd-458d482e020a', '02707915-d53b-49bf-8c1b-9ebc3ee9961d', NULL, 'no.1', 'No.1', 1, CURRENT_TIMESTAMP),
  ('fb544946-2d3a-434a-956d-37141be27529', '02707915-d53b-49bf-8c1b-9ebc3ee9961d', NULL, 'no.2', 'No.2', 2, CURRENT_TIMESTAMP),
  ('5362e312-74fa-4e3f-bfef-32f25607e315', '02707915-d53b-49bf-8c1b-9ebc3ee9961d', NULL, 'construction', 'Construction', 3, CURRENT_TIMESTAMP),
  ('bce71b79-a872-4045-afc4-f52f46232d34', '02707915-d53b-49bf-8c1b-9ebc3ee9961d', NULL, 'utility', 'Utility', 4, CURRENT_TIMESTAMP),
  ('97324264-6ffa-47dd-a6a5-cbcd780d28d2', '02707915-d53b-49bf-8c1b-9ebc3ee9961d', NULL, 'rough', 'Rough', 5, CURRENT_TIMESTAMP),
  ('6ca6e823-5546-4dd5-b9b8-ea094c0a05aa', 'b6c4dc41-6df9-403f-87a9-9021907358f3', NULL, '1/4in', '1/4in', 0, CURRENT_TIMESTAMP),
  ('8b23a575-2181-4c38-8bf3-45243d27f3dc', 'b6c4dc41-6df9-403f-87a9-9021907358f3', NULL, '3/8in', '3/8in', 1, CURRENT_TIMESTAMP),
  ('2172d1d6-8c7f-42db-9baa-0519ef26c8a3', 'b6c4dc41-6df9-403f-87a9-9021907358f3', NULL, '1/2in', '1/2in', 2, CURRENT_TIMESTAMP),
  ('9e17c109-3499-4b89-a4d7-5c0d95e2bb1c', 'b6c4dc41-6df9-403f-87a9-9021907358f3', NULL, '5/8in', '5/8in', 3, CURRENT_TIMESTAMP),
  ('647152a3-b880-4e69-8a3e-c655f6a108cc', 'b6c4dc41-6df9-403f-87a9-9021907358f3', NULL, '3/4in', '3/4in', 4, CURRENT_TIMESTAMP),
  ('accfc2a7-652d-44e1-95a5-63f6760d44d9', 'b6c4dc41-6df9-403f-87a9-9021907358f3', NULL, '1in', '1in', 5, CURRENT_TIMESTAMP),
  ('ffadd4a2-d7bd-4d07-b8e5-daa2c3e43347', '821bf229-ff61-485e-8b51-8ca16074ce74', NULL, '20ft', '20ft', 0, CURRENT_TIMESTAMP),
  ('6f9513a5-5cd1-426d-9bdf-412210dea4f0', '821bf229-ff61-485e-8b51-8ca16074ce74', NULL, '30ft', '30ft', 1, CURRENT_TIMESTAMP),
  ('5c56509f-6445-482d-8b9a-9d21fbfe9045', '821bf229-ff61-485e-8b51-8ca16074ce74', NULL, '40ft', '40ft', 2, CURRENT_TIMESTAMP),
  ('97823833-e3ea-4cce-823f-a19aba8c8e45', '8359e9a7-d133-42d5-aa54-98187f38057c', NULL, 'grade 40', 'Grade 40', 0, CURRENT_TIMESTAMP),
  ('2e3cdec2-8678-49aa-860d-12c4c3c8ed25', '8359e9a7-d133-42d5-aa54-98187f38057c', NULL, 'grade 60', 'Grade 60', 1, CURRENT_TIMESTAMP),
  ('c58587f4-c940-49a4-9992-d1da31830d1d', '6dda4ec2-78f3-4626-a436-b23f6b30385e', NULL, '4in', '4in', 0, CURRENT_TIMESTAMP),
  ('288dc756-09f5-46e6-8127-c44aca4ed06c', '6dda4ec2-78f3-4626-a436-b23f6b30385e', NULL, '6in', '6in', 1, CURRENT_TIMESTAMP),
  ('6924ce9f-3802-4ab4-a90e-9e020d460e49', '6dda4ec2-78f3-4626-a436-b23f6b30385e', NULL, '8in', '8in', 2, CURRENT_TIMESTAMP),
  ('e2f89706-82af-48ca-9098-436f28faef8f', '6dda4ec2-78f3-4626-a436-b23f6b30385e', NULL, '10in', '10in', 3, CURRENT_TIMESTAMP),
  ('ecf702d3-c5c3-4c50-bce3-1df7389df170', '6dda4ec2-78f3-4626-a436-b23f6b30385e', NULL, '12in', '12in', 4, CURRENT_TIMESTAMP),
  ('acb0d85b-f069-4e8d-b4f1-97bcf0d6761e', '83f6ea73-2f4c-4cb6-9f57-0849a0adfa7e', NULL, 'hollow', 'Hollow', 0, CURRENT_TIMESTAMP),
  ('ef177715-f8d0-458a-bac8-dfc055483ce2', '83f6ea73-2f4c-4cb6-9f57-0849a0adfa7e', NULL, 'solid', 'Solid', 1, CURRENT_TIMESTAMP),
  ('e3bec6d3-db80-4387-a0ee-d5414b234859', '83f6ea73-2f4c-4cb6-9f57-0849a0adfa7e', NULL, 'decorative', 'Decorative', 2, CURRENT_TIMESTAMP),
  ('dc1392d9-18f5-4733-ae4f-40bdeba4d603', '83f6ea73-2f4c-4cb6-9f57-0849a0adfa7e', NULL, 'partition', 'Partition', 3, CURRENT_TIMESTAMP),
  ('6cba70ed-6af0-4888-944e-2c11b24f899a', '5701ed77-1523-4d90-8454-0d7012117163', NULL, 'portland type i', 'Portland Type I', 0, CURRENT_TIMESTAMP),
  ('88abab43-267f-4f03-ba20-cf3e8b478d55', '5701ed77-1523-4d90-8454-0d7012117163', NULL, 'portland type ii', 'Portland Type II', 1, CURRENT_TIMESTAMP),
  ('63545649-c0cc-4579-a595-e61362b67e78', '5701ed77-1523-4d90-8454-0d7012117163', NULL, 'white', 'White', 2, CURRENT_TIMESTAMP),
  ('6c38bebe-21c9-4e14-b84e-235710ed88c8', '5701ed77-1523-4d90-8454-0d7012117163', NULL, 'masonry', 'Masonry', 3, CURRENT_TIMESTAMP),
  ('0004ccc1-6431-46b4-89ac-f83c573106f6', '5701ed77-1523-4d90-8454-0d7012117163', NULL, 'rapid set', 'Rapid Set', 4, CURRENT_TIMESTAMP),
  ('79b2d07a-d42d-4938-9bfe-5d4b2f25aeba', '2553c128-733c-4738-b775-efe9c912b90a', NULL, '25kg', '25kg', 0, CURRENT_TIMESTAMP),
  ('50b9293d-cfe7-41c9-a236-a5834fe62e8a', '2553c128-733c-4738-b775-efe9c912b90a', NULL, '42.5kg', '42.5kg', 1, CURRENT_TIMESTAMP),
  ('33e5762f-58df-4d45-a686-ddd0def8b2a6', '2553c128-733c-4738-b775-efe9c912b90a', NULL, '50kg', '50kg', 2, CURRENT_TIMESTAMP),
  ('dd67cde0-eae1-4990-9590-f28e9ea4f77c', 'e54f21fa-5736-4075-844a-3ef2fd821033', NULL, 'sharp sand', 'Sharp Sand', 0, CURRENT_TIMESTAMP),
  ('253185ca-f08f-4ebc-abf0-1bd8fbf4da66', 'e54f21fa-5736-4075-844a-3ef2fd821033', NULL, 'building sand', 'Building Sand', 1, CURRENT_TIMESTAMP),
  ('326117d2-26c4-4999-9c52-37f5ebb31616', 'e54f21fa-5736-4075-844a-3ef2fd821033', NULL, 'fill sand', 'Fill Sand', 2, CURRENT_TIMESTAMP),
  ('94da841f-7166-4084-9c82-8d3f89583ff5', 'e54f21fa-5736-4075-844a-3ef2fd821033', NULL, 'crusher run', 'Crusher Run', 3, CURRENT_TIMESTAMP),
  ('44511ce4-29d3-4dda-8f7e-2a4873ad6d5a', 'e54f21fa-5736-4075-844a-3ef2fd821033', NULL, '3/4 stone', '3/4 Stone', 4, CURRENT_TIMESTAMP),
  ('ffce8104-a4c9-4476-8215-ea56f97eb5c1', 'e54f21fa-5736-4075-844a-3ef2fd821033', NULL, '1/2 stone', '1/2 Stone', 5, CURRENT_TIMESTAMP),
  ('f717ae37-94cc-4a08-8a5f-c3f2a912b1c2', 'e54f21fa-5736-4075-844a-3ef2fd821033', NULL, 'marl', 'Marl', 6, CURRENT_TIMESTAMP),
  ('9ae7b7d3-9b2f-40ed-80fd-d44be912ebce', 'e54f21fa-5736-4075-844a-3ef2fd821033', NULL, 'gravel', 'Gravel', 7, CURRENT_TIMESTAMP),
  ('f3a2cb46-3d15-4ad3-9750-89cb272a9b3a', 'f9456a2a-07d9-4aff-9b5b-0cda0b808026', NULL, 'washed', 'Washed', 0, CURRENT_TIMESTAMP),
  ('2d6be186-c4dd-4baf-a873-9edf93a39aed', 'f9456a2a-07d9-4aff-9b5b-0cda0b808026', NULL, 'unwashed', 'Unwashed', 1, CURRENT_TIMESTAMP),
  ('623964a0-4704-4cdc-b3dd-519997f3c860', '9f5d6828-1a16-4c0f-a368-08ec32eac986', NULL, 'zinc', 'Zinc', 0, CURRENT_TIMESTAMP),
  ('96b8ed20-d35d-4a46-bacd-8323fbd6a817', '9f5d6828-1a16-4c0f-a368-08ec32eac986', NULL, 'aluminium', 'Aluminium', 1, CURRENT_TIMESTAMP),
  ('a2941221-2e6f-4e17-9e16-4918dee641ee', '9f5d6828-1a16-4c0f-a368-08ec32eac986', NULL, 'decking', 'Decking', 2, CURRENT_TIMESTAMP),
  ('1500df31-34bf-4a9c-8a63-020361782c60', '9f5d6828-1a16-4c0f-a368-08ec32eac986', NULL, 'shingle', 'Shingle', 3, CURRENT_TIMESTAMP),
  ('aa890223-7f2b-4a24-b7a2-27d85d742e03', '9f5d6828-1a16-4c0f-a368-08ec32eac986', NULL, 'clay tile', 'Clay Tile', 4, CURRENT_TIMESTAMP),
  ('c4754256-7b65-4425-a469-8b43efc2cc4d', '9f5d6828-1a16-4c0f-a368-08ec32eac986', NULL, 'concrete tile', 'Concrete Tile', 5, CURRENT_TIMESTAMP),
  ('42859fa8-04bd-4003-aac6-9b1249419f9d', '4701cbee-81e8-4c0d-a324-3e4b185c9c8f', NULL, 'corrugated', 'Corrugated', 0, CURRENT_TIMESTAMP),
  ('4edfc117-abfb-41a8-810c-f262f2814a5d', '4701cbee-81e8-4c0d-a324-3e4b185c9c8f', NULL, 'trapezoidal', 'Trapezoidal', 1, CURRENT_TIMESTAMP),
  ('909e11ab-16e6-4cb9-92e7-7f6a47f409a0', '4701cbee-81e8-4c0d-a324-3e4b185c9c8f', NULL, 'standing seam', 'Standing Seam', 2, CURRENT_TIMESTAMP),
  ('35ed0463-db34-4438-8858-ed98724cebbf', '4701cbee-81e8-4c0d-a324-3e4b185c9c8f', NULL, 'flat', 'Flat', 3, CURRENT_TIMESTAMP),
  ('8b482fe8-3d28-4b81-9c87-41b594f79016', 'cdeef3fd-8153-4143-a9e1-2527107f6048', NULL, '26', '26', 0, CURRENT_TIMESTAMP),
  ('24977a36-833b-4bb2-bbbf-097a8096c708', 'cdeef3fd-8153-4143-a9e1-2527107f6048', NULL, '28', '28', 1, CURRENT_TIMESTAMP),
  ('f72faf63-5f1b-462b-8269-cac5731f53d6', 'cdeef3fd-8153-4143-a9e1-2527107f6048', NULL, '30', '30', 2, CURRENT_TIMESTAMP),
  ('fa38d6fc-68c0-4bfd-a319-1bac39ebb3b3', 'cdeef3fd-8153-4143-a9e1-2527107f6048', NULL, '32', '32', 3, CURRENT_TIMESTAMP),
  ('a90b745c-5470-46c8-bf36-7e920cad6674', '17f859ed-0c55-4277-a724-423f3638a7a2', NULL, '8ft', '8ft', 0, CURRENT_TIMESTAMP),
  ('05b04cfc-2a97-485d-893b-3d0de0dcdcb7', '17f859ed-0c55-4277-a724-423f3638a7a2', NULL, '10ft', '10ft', 1, CURRENT_TIMESTAMP),
  ('afe491a5-bd26-429b-846e-4a5ff69ad532', '17f859ed-0c55-4277-a724-423f3638a7a2', NULL, '12ft', '12ft', 2, CURRENT_TIMESTAMP),
  ('0fd9e40e-3e9a-491b-b6be-76849812ca8a', '17f859ed-0c55-4277-a724-423f3638a7a2', NULL, '14ft', '14ft', 3, CURRENT_TIMESTAMP),
  ('4e5a884b-9f89-4ab9-b1ef-5d20b2a73b81', '17f859ed-0c55-4277-a724-423f3638a7a2', NULL, '16ft', '16ft', 4, CURRENT_TIMESTAMP),
  ('1a1d2e6c-48ae-4af6-9d5d-c49a9ab227e8', '17f859ed-0c55-4277-a724-423f3638a7a2', NULL, '18ft', '18ft', 5, CURRENT_TIMESTAMP),
  ('26f1de4c-82f8-49e4-afab-a8b1037306d8', '17f859ed-0c55-4277-a724-423f3638a7a2', NULL, '20ft', '20ft', 6, CURRENT_TIMESTAMP),
  ('82861c42-b937-4461-b331-ae2a852294fd', '9a381a2f-9c07-4f08-87a5-fde5afe2a73a', NULL, '12x12', '12x12', 0, CURRENT_TIMESTAMP),
  ('f3a34db2-32bc-44b0-a257-8eadee63e4b0', '9a381a2f-9c07-4f08-87a5-fde5afe2a73a', NULL, '12x24', '12x24', 1, CURRENT_TIMESTAMP),
  ('95f532fd-0269-4366-a460-e29f3d5d6cb4', '9a381a2f-9c07-4f08-87a5-fde5afe2a73a', NULL, '16x16', '16x16', 2, CURRENT_TIMESTAMP),
  ('ad59b5e2-c1e2-43d5-b551-7f6efc62c8ea', '9a381a2f-9c07-4f08-87a5-fde5afe2a73a', NULL, '18x18', '18x18', 3, CURRENT_TIMESTAMP),
  ('496cde34-7c51-48e4-bb9c-3dba9439d05e', '9a381a2f-9c07-4f08-87a5-fde5afe2a73a', NULL, '24x24', '24x24', 4, CURRENT_TIMESTAMP),
  ('78676c51-acc5-41d0-a7b1-a196ca256aef', '9a381a2f-9c07-4f08-87a5-fde5afe2a73a', NULL, '300x600', '300x600', 5, CURRENT_TIMESTAMP),
  ('0f4c8657-b966-4aed-a03d-089cc2e7b999', '9a381a2f-9c07-4f08-87a5-fde5afe2a73a', NULL, '600x600', '600x600', 6, CURRENT_TIMESTAMP),
  ('c99a2c70-4f18-4290-8bd0-56da5b435f6c', 'b13a53e5-3360-4546-a66d-34f0f06f4165', NULL, 'ceramic', 'Ceramic', 0, CURRENT_TIMESTAMP),
  ('37e687a5-4925-4a0d-b71c-a05591f4bc5f', 'b13a53e5-3360-4546-a66d-34f0f06f4165', NULL, 'porcelain', 'Porcelain', 1, CURRENT_TIMESTAMP),
  ('345888ff-7194-4fa6-8cd5-ff62eb282c37', 'b13a53e5-3360-4546-a66d-34f0f06f4165', NULL, 'marble', 'Marble', 2, CURRENT_TIMESTAMP),
  ('b7d867b1-771e-481c-9bdb-4c017dc323d5', 'b13a53e5-3360-4546-a66d-34f0f06f4165', NULL, 'granite', 'Granite', 3, CURRENT_TIMESTAMP),
  ('a7895b3a-886f-4ee5-bd0c-7161e1cbbdc4', 'b13a53e5-3360-4546-a66d-34f0f06f4165', NULL, 'vinyl', 'Vinyl', 4, CURRENT_TIMESTAMP),
  ('96e6356d-8e38-4aae-8a06-56b8e8a44be0', 'b13a53e5-3360-4546-a66d-34f0f06f4165', NULL, 'terrazzo', 'Terrazzo', 5, CURRENT_TIMESTAMP),
  ('334f8717-6c20-4113-b067-9a1b31c52410', '1d0e39c4-84a2-4586-9573-0fca5d4ffcb1', NULL, 'matte', 'Matte', 0, CURRENT_TIMESTAMP),
  ('a26a67d6-ddd5-4fc8-9ae5-7d93c665fe4a', '1d0e39c4-84a2-4586-9573-0fca5d4ffcb1', NULL, 'gloss', 'Gloss', 1, CURRENT_TIMESTAMP),
  ('a7f940c6-a44f-41f0-8235-b8989096ebc1', '1d0e39c4-84a2-4586-9573-0fca5d4ffcb1', NULL, 'polished', 'Polished', 2, CURRENT_TIMESTAMP),
  ('27e3199a-5ef4-408c-8d52-6b57d41741ef', '1d0e39c4-84a2-4586-9573-0fca5d4ffcb1', NULL, 'textured', 'Textured', 3, CURRENT_TIMESTAMP),
  ('73ba188b-9ec9-4a98-97ff-caaf60547e38', '1d0e39c4-84a2-4586-9573-0fca5d4ffcb1', NULL, 'anti-slip', 'Anti-Slip', 4, CURRENT_TIMESTAMP),
  ('3a1a39ac-1a15-44c5-bb06-2a56dd66a785', '107c1b15-a521-48c5-bb67-09beff2a45da', NULL, '1/2in', '1/2in', 0, CURRENT_TIMESTAMP),
  ('fdefb3c5-04c2-4c60-adac-7ba159b6f6ca', '107c1b15-a521-48c5-bb67-09beff2a45da', NULL, '3/4in', '3/4in', 1, CURRENT_TIMESTAMP),
  ('bc3ba012-f536-4f10-b057-33f7bb0910d7', '107c1b15-a521-48c5-bb67-09beff2a45da', NULL, '1in', '1in', 2, CURRENT_TIMESTAMP),
  ('3571ae0e-ade6-4787-a879-3fde1065b864', '107c1b15-a521-48c5-bb67-09beff2a45da', NULL, '1.5in', '1.5in', 3, CURRENT_TIMESTAMP),
  ('fae4b1a1-97be-450d-b3f6-05ccc03e956f', '107c1b15-a521-48c5-bb67-09beff2a45da', NULL, '2in', '2in', 4, CURRENT_TIMESTAMP),
  ('e7f8c648-3492-4906-8944-6f49b49f0582', '107c1b15-a521-48c5-bb67-09beff2a45da', NULL, '3in', '3in', 5, CURRENT_TIMESTAMP),
  ('fc2b0112-2c57-4869-9e84-794b95344995', '107c1b15-a521-48c5-bb67-09beff2a45da', NULL, '4in', '4in', 6, CURRENT_TIMESTAMP),
  ('b3980a5a-301d-4da0-b4c0-e54163187259', '107c1b15-a521-48c5-bb67-09beff2a45da', NULL, '6in', '6in', 7, CURRENT_TIMESTAMP),
  ('7e1a8bee-1292-4254-828a-19ae79f49790', '396a6d6f-4d9b-4f81-a4b8-560dafcc2133', NULL, 'pvc', 'PVC', 0, CURRENT_TIMESTAMP),
  ('62f8c99f-7754-432f-86f4-bea9ced345b4', '396a6d6f-4d9b-4f81-a4b8-560dafcc2133', NULL, 'cpvc', 'CPVC', 1, CURRENT_TIMESTAMP),
  ('76fbb402-57dd-468c-8f57-b25b90dd88e9', '396a6d6f-4d9b-4f81-a4b8-560dafcc2133', NULL, 'ppr', 'PPR', 2, CURRENT_TIMESTAMP),
  ('2c4cc52a-e0a1-4811-b7fe-f95089507f64', '396a6d6f-4d9b-4f81-a4b8-560dafcc2133', NULL, 'copper', 'Copper', 3, CURRENT_TIMESTAMP),
  ('63d29249-da50-431d-a05f-622fa7019015', '396a6d6f-4d9b-4f81-a4b8-560dafcc2133', NULL, 'galvanized', 'Galvanized', 4, CURRENT_TIMESTAMP),
  ('32b2b8e2-28f7-42ce-afe3-c26405ef479a', '396a6d6f-4d9b-4f81-a4b8-560dafcc2133', NULL, 'pex', 'PEX', 5, CURRENT_TIMESTAMP),
  ('227864ad-3229-4887-b3dd-4e51e4336b43', 'cf4eae7f-c4bc-4314-b05d-fd02062743b7', NULL, 'sdr 26', 'SDR 26', 0, CURRENT_TIMESTAMP),
  ('8e50b814-f78e-4604-8618-255e019549e3', 'cf4eae7f-c4bc-4314-b05d-fd02062743b7', NULL, 'sdr 41', 'SDR 41', 1, CURRENT_TIMESTAMP),
  ('6b45e390-3f31-4bbf-bab9-c0d1e5cb6d90', 'cf4eae7f-c4bc-4314-b05d-fd02062743b7', NULL, 'schedule 40', 'Schedule 40', 2, CURRENT_TIMESTAMP),
  ('2c302707-fa52-4acc-9ae3-59d8e2185475', 'cf4eae7f-c4bc-4314-b05d-fd02062743b7', NULL, 'schedule 80', 'Schedule 80', 3, CURRENT_TIMESTAMP),
  ('cdf84e66-ebd8-49af-9190-609aa3578516', 'cfd15874-5bd9-4c73-9868-1c0632f6e982', NULL, '14 awg', '14 AWG', 0, CURRENT_TIMESTAMP),
  ('3f16fac7-4941-46c3-b2ff-5b97e3f6a76a', 'cfd15874-5bd9-4c73-9868-1c0632f6e982', NULL, '12 awg', '12 AWG', 1, CURRENT_TIMESTAMP),
  ('d77db163-8521-4242-835d-a40fc8ce8b51', 'cfd15874-5bd9-4c73-9868-1c0632f6e982', NULL, '10 awg', '10 AWG', 2, CURRENT_TIMESTAMP),
  ('1411012b-0151-41a0-a7d3-cc7bd2705c77', 'cfd15874-5bd9-4c73-9868-1c0632f6e982', NULL, '8 awg', '8 AWG', 3, CURRENT_TIMESTAMP),
  ('2489ac9c-2612-43ac-8ef0-fbf632898938', 'cfd15874-5bd9-4c73-9868-1c0632f6e982', NULL, '6 awg', '6 AWG', 4, CURRENT_TIMESTAMP),
  ('dc23150a-c820-4bdf-8f67-ab3d3d117a18', 'cfd15874-5bd9-4c73-9868-1c0632f6e982', NULL, '4 awg', '4 AWG', 5, CURRENT_TIMESTAMP),
  ('4d60f2c4-5035-42d5-886e-b64a7849045a', 'cfd15874-5bd9-4c73-9868-1c0632f6e982', NULL, '2 awg', '2 AWG', 6, CURRENT_TIMESTAMP),
  ('8c0448b9-15dd-45fa-8f70-d3e5f9cdd64d', 'e869dcf1-6398-4eec-983c-1576c4567956', NULL, 'thhn', 'THHN', 0, CURRENT_TIMESTAMP),
  ('2786549e-b94a-492a-9e01-413e01dd4686', 'e869dcf1-6398-4eec-983c-1576c4567956', NULL, 'nm-b', 'NM-B', 1, CURRENT_TIMESTAMP),
  ('0247a7f5-0a04-411c-b65c-1189d31c9600', 'e869dcf1-6398-4eec-983c-1576c4567956', NULL, 'armoured', 'Armoured', 2, CURRENT_TIMESTAMP),
  ('a2f6d4b7-984e-4464-9230-b76d083c1b17', 'e869dcf1-6398-4eec-983c-1576c4567956', NULL, 'flex', 'Flex', 3, CURRENT_TIMESTAMP),
  ('3aa61083-bf33-468a-9d9a-dc19db70353c', 'e869dcf1-6398-4eec-983c-1576c4567956', NULL, 'coaxial', 'Coaxial', 4, CURRENT_TIMESTAMP),
  ('064d537a-6216-4cd4-b636-7b7fa399814d', 'e869dcf1-6398-4eec-983c-1576c4567956', NULL, 'cat6', 'Cat6', 5, CURRENT_TIMESTAMP),
  ('a18b8404-38f9-4556-b600-fceeba37bc09', 'd9d66b6e-4e3c-45be-8233-b6179a7ed78d', NULL, 'copper', 'Copper', 0, CURRENT_TIMESTAMP),
  ('da227850-d091-4990-823b-79e340532d0e', 'd9d66b6e-4e3c-45be-8233-b6179a7ed78d', NULL, 'aluminium', 'Aluminium', 1, CURRENT_TIMESTAMP),
  ('71dde526-fc14-4a51-8f61-de0bd7cd8631', '90d39848-e9f1-413c-8455-f36b26c254a7', NULL, 'emulsion', 'Emulsion', 0, CURRENT_TIMESTAMP),
  ('7dc039aa-5b4c-4e71-aeb7-d1c5523ae79c', '90d39848-e9f1-413c-8455-f36b26c254a7', NULL, 'oil', 'Oil', 1, CURRENT_TIMESTAMP),
  ('160f9add-b588-4477-83e8-e2619bc47a25', '90d39848-e9f1-413c-8455-f36b26c254a7', NULL, 'acrylic', 'Acrylic', 2, CURRENT_TIMESTAMP),
  ('7567f574-32de-452c-bd72-937f6e809539', '90d39848-e9f1-413c-8455-f36b26c254a7', NULL, 'enamel', 'Enamel', 3, CURRENT_TIMESTAMP),
  ('348a3f12-89c7-4d1b-a8d8-e54c69326dac', '90d39848-e9f1-413c-8455-f36b26c254a7', NULL, 'primer', 'Primer', 4, CURRENT_TIMESTAMP),
  ('bfa9ca6a-09be-4004-a6b5-f384151234d3', '90d39848-e9f1-413c-8455-f36b26c254a7', NULL, 'sealer', 'Sealer', 5, CURRENT_TIMESTAMP),
  ('7d711c11-8803-4e2d-9596-df21393de368', '90d39848-e9f1-413c-8455-f36b26c254a7', NULL, 'waterproofing', 'Waterproofing', 6, CURRENT_TIMESTAMP),
  ('460f3677-7185-4175-9708-a0d246865fe5', '244f7fab-70af-4241-a407-c03829f562ba', NULL, 'matte', 'Matte', 0, CURRENT_TIMESTAMP),
  ('bb891896-3395-41dc-94a0-be77c56f3f4e', '244f7fab-70af-4241-a407-c03829f562ba', NULL, 'eggshell', 'Eggshell', 1, CURRENT_TIMESTAMP),
  ('7ced53f0-f8f6-4c0e-95c3-72388c65115e', '244f7fab-70af-4241-a407-c03829f562ba', NULL, 'satin', 'Satin', 2, CURRENT_TIMESTAMP),
  ('b797212d-3530-4d20-a508-fd3da0ec235e', '244f7fab-70af-4241-a407-c03829f562ba', NULL, 'semi-gloss', 'Semi-Gloss', 3, CURRENT_TIMESTAMP),
  ('d804473d-3ac3-4323-9be4-8df1a9bfd68f', '244f7fab-70af-4241-a407-c03829f562ba', NULL, 'gloss', 'Gloss', 4, CURRENT_TIMESTAMP),
  ('9ba8cc04-d814-41a5-8199-f19c90355288', 'f9bb0679-f192-45db-af0f-8cea98f50330', NULL, 'white', 'White', 0, CURRENT_TIMESTAMP),
  ('dbc40e47-802b-4a33-bb16-8062d8f194db', 'f9bb0679-f192-45db-af0f-8cea98f50330', NULL, 'pastel', 'Pastel', 1, CURRENT_TIMESTAMP),
  ('371ebb83-3d21-4afa-8ed8-4a62b2043eae', 'f9bb0679-f192-45db-af0f-8cea98f50330', NULL, 'deep', 'Deep', 2, CURRENT_TIMESTAMP),
  ('744b8e54-e2f7-4b19-b156-a465d9ef0bf4', 'f9bb0679-f192-45db-af0f-8cea98f50330', NULL, 'accent', 'Accent', 3, CURRENT_TIMESTAMP),
  ('d2f2c6a2-edc9-4fbd-92a4-d912db28f34c', 'a0497069-f0d3-454d-96a3-b9e531892cb1', NULL, '1qt', '1qt', 0, CURRENT_TIMESTAMP),
  ('a4e177fd-476e-482d-9350-b1da964765d3', 'a0497069-f0d3-454d-96a3-b9e531892cb1', NULL, '1gal', '1gal', 1, CURRENT_TIMESTAMP),
  ('2f893a06-1087-4558-ae1b-2d6d8a065dc4', 'a0497069-f0d3-454d-96a3-b9e531892cb1', NULL, '5gal', '5gal', 2, CURRENT_TIMESTAMP),
  ('a9e1fa8b-697a-4f4c-976b-9d6219967122', 'a0497069-f0d3-454d-96a3-b9e531892cb1', NULL, '55gal', '55gal', 3, CURRENT_TIMESTAMP),
  ('fab82525-a04e-4465-b5d0-f997f28670dd', '2386da74-122d-417d-973c-2fb51536a3a6', NULL, 'door', 'Door', 0, CURRENT_TIMESTAMP),
  ('7fb5aa26-59c5-47ca-a555-4d6efc43759e', '2386da74-122d-417d-973c-2fb51536a3a6', NULL, 'window', 'Window', 1, CURRENT_TIMESTAMP),
  ('3d1cfca0-258c-4d4b-8cd6-8ccd90173402', '2386da74-122d-417d-973c-2fb51536a3a6', NULL, 'door frame', 'Door Frame', 2, CURRENT_TIMESTAMP),
  ('6407280b-a504-4477-a75f-544ee52e0498', '2386da74-122d-417d-973c-2fb51536a3a6', NULL, 'window frame', 'Window Frame', 3, CURRENT_TIMESTAMP),
  ('069bea06-499e-45b6-b446-ded0dee8e277', '2386da74-122d-417d-973c-2fb51536a3a6', NULL, 'louvre', 'Louvre', 4, CURRENT_TIMESTAMP),
  ('14d4841e-437f-4945-b5fb-f4bc1d405e8c', '5e4c6361-724c-4b76-9207-3dc59e1e061a', NULL, 'wood', 'Wood', 0, CURRENT_TIMESTAMP),
  ('ff0d695b-8c3e-492a-9b8b-104de15305e2', '5e4c6361-724c-4b76-9207-3dc59e1e061a', NULL, 'steel', 'Steel', 1, CURRENT_TIMESTAMP),
  ('62484b5d-7afa-4baf-a299-544abd64acd9', '5e4c6361-724c-4b76-9207-3dc59e1e061a', NULL, 'aluminium', 'Aluminium', 2, CURRENT_TIMESTAMP),
  ('ff152596-bd0d-4937-b8c4-a9b1052bd414', '5e4c6361-724c-4b76-9207-3dc59e1e061a', NULL, 'pvc', 'PVC', 3, CURRENT_TIMESTAMP),
  ('6ddd4e10-8e5a-4b5f-af68-36d212d2d859', '5e4c6361-724c-4b76-9207-3dc59e1e061a', NULL, 'glass', 'Glass', 4, CURRENT_TIMESTAMP),
  ('2eee12f1-925d-4ab1-ae68-0a6b0aed293e', '9858d516-5f04-4805-b251-d675943660cb', NULL, 'nail', 'Nail', 0, CURRENT_TIMESTAMP),
  ('559bdd32-2e73-4ee3-8cad-1fd2ceb1ef62', '9858d516-5f04-4805-b251-d675943660cb', NULL, 'screw', 'Screw', 1, CURRENT_TIMESTAMP),
  ('9ba0115f-654f-43ba-8c74-a41b61fdd65d', '9858d516-5f04-4805-b251-d675943660cb', NULL, 'bolt', 'Bolt', 2, CURRENT_TIMESTAMP),
  ('de91aca6-2f31-40bc-aba7-ca78da985c85', '9858d516-5f04-4805-b251-d675943660cb', NULL, 'anchor', 'Anchor', 3, CURRENT_TIMESTAMP),
  ('a9a77469-33be-4efd-8da9-68679a56fcd5', '9858d516-5f04-4805-b251-d675943660cb', NULL, 'washer', 'Washer', 4, CURRENT_TIMESTAMP),
  ('170d1e10-a28f-41e4-93db-0be7e71bed83', '9858d516-5f04-4805-b251-d675943660cb', NULL, 'nut', 'Nut', 5, CURRENT_TIMESTAMP),
  ('34387f61-88a6-4a98-953d-92cb0815adc3', '9858d516-5f04-4805-b251-d675943660cb', NULL, 'tie wire', 'Tie Wire', 6, CURRENT_TIMESTAMP),
  ('e9c06528-369a-46ee-a0dc-6ce268c6a91c', 'ef4907d2-90a6-4a86-b26e-4b4a37fa120c', NULL, 'galvanized', 'Galvanized', 0, CURRENT_TIMESTAMP),
  ('eed13019-a655-4826-9d54-7caae004b1e3', 'ef4907d2-90a6-4a86-b26e-4b4a37fa120c', NULL, 'stainless', 'Stainless', 1, CURRENT_TIMESTAMP),
  ('c91ccf14-3a1e-4468-ab50-e08800b738df', 'ef4907d2-90a6-4a86-b26e-4b4a37fa120c', NULL, 'zinc-plated', 'Zinc-Plated', 2, CURRENT_TIMESTAMP),
  ('a632b310-40a2-4a97-8785-6bb03c80e6fa', 'ef4907d2-90a6-4a86-b26e-4b4a37fa120c', NULL, 'black', 'Black', 3, CURRENT_TIMESTAMP);

INSERT INTO "MaterialUnit" ("id","businessId","key","label","sort","createdAt") VALUES
  ('553a0fa5-1d73-484a-be1f-4f0f075a9090', NULL, 'ea', 'Each', 0, CURRENT_TIMESTAMP),
  ('6f64eea9-3afc-4d67-a1c3-f6d4b65ba906', NULL, 'bag', 'Bag', 1, CURRENT_TIMESTAMP),
  ('e077a190-e1b8-46e7-b0b9-259284be8768', NULL, 'sheet', 'Sheet', 2, CURRENT_TIMESTAMP),
  ('eeea25c8-c203-4f24-8de9-00db28726df2', NULL, 'length', 'Length', 3, CURRENT_TIMESTAMP),
  ('2169ec8d-f3c0-42f9-a5c7-0dfc14a2f38b', NULL, 'box', 'Box', 4, CURRENT_TIMESTAMP),
  ('ac08e71e-1de7-4998-9f2b-d2a700bfd6bb', NULL, 'roll', 'Roll', 5, CURRENT_TIMESTAMP),
  ('95090bde-b493-42ba-887e-fac45be37773', NULL, 'bundle', 'Bundle', 6, CURRENT_TIMESTAMP),
  ('928e812f-d19e-4446-93d0-bea7bdb8476a', NULL, 'gal', 'Gallon', 7, CURRENT_TIMESTAMP),
  ('2b99943f-8115-472f-bcd5-af2d7ee74c25', NULL, 'litre', 'Litre', 8, CURRENT_TIMESTAMP),
  ('72973ab7-031c-4326-a48a-756ed4be868a', NULL, 'sqft', 'Square Foot', 9, CURRENT_TIMESTAMP),
  ('1ad61fce-1bc5-4e77-b10e-b894767acf3c', NULL, 'linft', 'Linear Foot', 10, CURRENT_TIMESTAMP),
  ('5fb7e128-4ffb-4a54-b97b-2322430747c6', NULL, 'boardft', 'Board Foot', 11, CURRENT_TIMESTAMP),
  ('17471bd0-d424-4f03-81fa-bbeaaa33bf1f', NULL, 'cuyd', 'Cubic Yard', 12, CURRENT_TIMESTAMP),
  ('cceba620-33a2-47a6-b226-431838b19244', NULL, 'tonne', 'Tonne', 13, CURRENT_TIMESTAMP),
  ('85139e49-e829-41a8-a8dd-101a0fd3c5f7', NULL, 'kg', 'Kilogram', 14, CURRENT_TIMESTAMP),
  ('2f75505e-4fe2-46f9-ba08-aefc442f213d', NULL, 'm', 'Metre', 15, CURRENT_TIMESTAMP),
  ('8d8c48cf-a8bb-4450-9103-1395c0ddb088', NULL, 'sqm', 'Square Metre', 16, CURRENT_TIMESTAMP);

-- ---------------------------------------------------------------------------
-- Backfill existing MaterialFavourite rows onto the new schema.
--
-- Invariant: NOTHING IS SILENTLY DISCARDED. Every legacy category, spec key
-- and spec value that does not match a curated row becomes a TENANT-SCOPED
-- row (businessId set) rather than being dropped. The pre-Phase-1 material
-- form used to discard specs on category change; that must not be repeated
-- here at migration scale.
--
-- Soft-deleted rows (deletedAt IS NOT NULL) are migrated too — they can still
-- be referenced by AssemblyComponent and must not be left on the old shape.
--
-- Existing names are marked nameCustom = true. Their names were hand-typed;
-- recomposing them from attributes on the next save would silently rewrite
-- what the contractor already shows customers. Composition applies to new
-- entry going forward, not retroactively.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  m           RECORD;
  v_spec      RECORD;
  v_cat_id    TEXT;
  v_attr_id   TEXT;
  v_attr_key  TEXT;
  v_attr_kind "MaterialAttributeKind";
  v_opt_id    TEXT;
  v_unit_id   TEXT;
  v_new_specs JSONB;
  v_search    TEXT;
  v_slug      TEXT;
  v_norm      TEXT;
  v_label     TEXT;
  v_migrated  INTEGER := 0;
BEGIN
  FOR m IN SELECT * FROM "MaterialFavourite" LOOP
    -- Reset every per-row variable. plpgsql variables persist across loop
    -- iterations, so without this a row with no unit would inherit the
    -- PREVIOUS row's unitId — a silent cross-material data corruption.
    v_cat_id    := NULL;
    v_unit_id   := NULL;
    v_attr_id   := NULL;
    v_attr_key  := NULL;
    v_attr_kind := NULL;
    v_opt_id    := NULL;
    v_new_specs := '{}'::jsonb;
    v_search    := lower(coalesce(m.name, '') || ' ' || coalesce(m.description, ''));

    ---------------------------------------------------------------- category
    IF m.category IS NOT NULL AND btrim(m.category) <> '' THEN
      v_label := btrim(m.category);
      -- Curated first (the 11 pre-2a category strings are exactly the curated
      -- labels), then this tenant's own, then create.
      SELECT id INTO v_cat_id FROM "MaterialCategoryDef"
        WHERE "businessId" IS NULL AND lower(label) = lower(v_label) LIMIT 1;
      IF v_cat_id IS NULL THEN
        SELECT id INTO v_cat_id FROM "MaterialCategoryDef"
          WHERE "businessId" = m."businessId" AND lower(label) = lower(v_label) LIMIT 1;
      END IF;
      IF v_cat_id IS NULL THEN
        v_slug   := btrim(regexp_replace(lower(v_label), '[^a-z0-9]+', '-', 'g'), '-');
        v_cat_id := gen_random_uuid()::text;
        INSERT INTO "MaterialCategoryDef" (id, "businessId", key, label, sort, "createdAt")
          VALUES (v_cat_id, m."businessId", v_slug, v_label, 900, CURRENT_TIMESTAMP);
      END IF;
    END IF;

    ------------------------------------------------------------------- specs
    IF m.specs IS NOT NULL AND jsonb_typeof(m.specs) = 'object' AND m.specs <> '{}'::jsonb THEN
      -- Specs with no category still need somewhere to live; park them on
      -- curated "other" rather than dropping them.
      IF v_cat_id IS NULL THEN
        SELECT id INTO v_cat_id FROM "MaterialCategoryDef"
          WHERE "businessId" IS NULL AND key = 'other' LIMIT 1;
      END IF;

      FOR v_spec IN SELECT key, value FROM jsonb_each_text(m.specs) LOOP
        CONTINUE WHEN v_spec.value IS NULL OR btrim(v_spec.value) = '';
        v_label   := btrim(v_spec.key);
        v_attr_id := NULL;

        -- Pre-2a specs were keyed by display LABEL ("Bag size"); 2a keys them
        -- by attribute key ("bagSize"). Match on either so this is safe to
        -- re-run and tolerant of partially-migrated data.
        SELECT id, key, kind INTO v_attr_id, v_attr_key, v_attr_kind
          FROM "MaterialAttributeDef"
         WHERE "categoryId" = v_cat_id
           AND ("businessId" IS NULL OR "businessId" = m."businessId")
           AND (lower(label) = lower(v_label) OR lower(key) = lower(v_label))
         ORDER BY "businessId" NULLS FIRST
         LIMIT 1;

        -- Unknown spec key -> a tenant attribute on this category. TEXT, not
        -- ENUM: we have no vocabulary for it, and inventing one from a single
        -- observed value would wrongly constrain future input.
        IF v_attr_id IS NULL THEN
          v_slug      := btrim(regexp_replace(lower(v_label), '[^a-z0-9]+', '-', 'g'), '-');
          v_attr_id   := gen_random_uuid()::text;
          v_attr_key  := v_slug;
          v_attr_kind := 'TEXT';
          INSERT INTO "MaterialAttributeDef"
            (id, "categoryId", "businessId", key, label, kind, required, "includeInName", "nameOrder", sort, "createdAt")
            VALUES (v_attr_id, v_cat_id, m."businessId", v_slug, v_label, 'TEXT', false, false, NULL, 900, CURRENT_TIMESTAMP);
        END IF;

        -- ENUM value not in the curated vocabulary -> tenant-scoped option,
        -- so "cedar"/"Cedar"/"CEDAR" converge on one normalized value while
        -- the contractor's own capitalization survives as the label.
        IF v_attr_kind = 'ENUM' THEN
          v_norm   := lower(btrim(v_spec.value));
          v_opt_id := NULL;
          SELECT id INTO v_opt_id FROM "MaterialAttributeOption"
            WHERE "attributeId" = v_attr_id
              AND ("businessId" IS NULL OR "businessId" = m."businessId")
              AND value = v_norm
            LIMIT 1;
          IF v_opt_id IS NULL THEN
            INSERT INTO "MaterialAttributeOption"
              (id, "attributeId", "businessId", value, label, sort, "createdAt")
              VALUES (gen_random_uuid()::text, v_attr_id, m."businessId", v_norm, btrim(v_spec.value), 900, CURRENT_TIMESTAMP);
          END IF;
        END IF;

        v_new_specs := v_new_specs || jsonb_build_object(v_attr_key, btrim(v_spec.value));
        v_search    := v_search || ' ' || lower(btrim(v_spec.value));
      END LOOP;
    END IF;

    -------------------------------------------------------------------- unit
    IF m.unit IS NOT NULL AND btrim(m.unit) <> '' THEN
      v_label := btrim(m.unit);
      SELECT id INTO v_unit_id FROM "MaterialUnit"
        WHERE ("businessId" IS NULL OR "businessId" = m."businessId")
          AND (lower(label) = lower(v_label) OR lower(key) = lower(v_label))
        ORDER BY "businessId" NULLS FIRST
        LIMIT 1;
      IF v_unit_id IS NULL THEN
        v_slug    := btrim(regexp_replace(lower(v_label), '[^a-z0-9]+', '-', 'g'), '-');
        v_unit_id := gen_random_uuid()::text;
        INSERT INTO "MaterialUnit" (id, "businessId", key, label, sort, "createdAt")
          VALUES (v_unit_id, m."businessId", v_slug, v_label, 900, CURRENT_TIMESTAMP);
      END IF;
    END IF;

    ------------------------------------------------------------------ update
    -- updatedAt IS bumped deliberately: specs keys changed shape (label ->
    -- key), so offline clients must re-pull these rows rather than keep
    -- serving the old shape from their delta-sync cache.
    UPDATE "MaterialFavourite"
       SET "categoryDefId" = v_cat_id,
           "unitId"        = v_unit_id,
           specs           = CASE WHEN v_new_specs = '{}'::jsonb THEN specs ELSE v_new_specs END,
           "searchText"    = btrim(v_search),
           "nameCustom"    = true,
           "updatedAt"     = CURRENT_TIMESTAMP
     WHERE id = m.id;

    v_migrated := v_migrated + 1;
  END LOOP;

  RAISE NOTICE 'material 2a backfill: % MaterialFavourite rows migrated', v_migrated;
END $$;
