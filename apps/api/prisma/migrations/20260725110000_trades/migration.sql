-- Curated master trade list (businessId NULL) + per-business custom trades
-- (businessId set). No DB-level unique constraint spans the null-businessId
-- group — de-duping by name (case-insensitive) is handled in TradesService,
-- shared with the per-business uniqueness check.

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trade_businessId_idx" ON "Trade"("businessId");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the global master trade list (businessId NULL). Ids are fixed literals
-- (not gen_random_uuid()) so this migration is deterministic and reproducible
-- across environments; TradesService.MASTER_TRADES mirrors these same ids as
-- its in-code fallback for when this table/migration hasn't landed yet.
INSERT INTO "Trade" ("id", "businessId", "name", "createdAt") VALUES
    ('fe077806-418c-4776-8132-eb40f2689df8', NULL, 'Mason', CURRENT_TIMESTAMP),
    ('c60a571e-a4e5-4ec6-bd16-5df2a33cc8f0', NULL, 'Block & Steel', CURRENT_TIMESTAMP),
    ('bc96b47d-e23a-4218-8682-ec4fb139c795', NULL, 'Carpenter', CURRENT_TIMESTAMP),
    ('a9d5f296-b0a7-4d1b-810c-3213d7728992', NULL, 'Electrician', CURRENT_TIMESTAMP),
    ('e1d61545-d086-444b-92b4-e51367330c0c', NULL, 'Plumber', CURRENT_TIMESTAMP),
    ('d39d2694-1b0c-4ae1-b9f9-a60b6fdfea05', NULL, 'Tiler', CURRENT_TIMESTAMP),
    ('861288ad-4745-4712-a508-4d1f4ccd199a', NULL, 'Painter', CURRENT_TIMESTAMP),
    ('7da6c014-1faa-4ca7-bdb7-99c14229bdf0', NULL, 'Roofer', CURRENT_TIMESTAMP),
    ('60274bcf-881a-4860-b506-4a4a6ce1a7f2', NULL, 'Welder/Steel Fabricator', CURRENT_TIMESTAMP),
    ('3fa33e31-8bfe-4011-a90c-4ee2a72aab39', NULL, 'Glazier', CURRENT_TIMESTAMP),
    ('2496d194-1ab2-4fe0-89ca-b6c3a7468dbd', NULL, 'Plasterer', CURRENT_TIMESTAMP),
    ('4894af60-9878-46de-b630-de7f1345825c', NULL, 'HVAC Technician', CURRENT_TIMESTAMP),
    ('3e002c75-ded5-4e20-8ab9-f19f9c2509ac', NULL, 'Landscaper', CURRENT_TIMESTAMP),
    ('10e5a85f-9c90-44f5-a333-450b4ffc373b', NULL, 'General Labourer', CURRENT_TIMESTAMP);
