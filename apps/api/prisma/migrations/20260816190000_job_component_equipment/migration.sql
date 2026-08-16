-- A job's recipe can include equipment.
--
-- Asked for while auditing the job builder: Material / Labour / Other is too
-- narrow, and a job may need "some form of transport or equipment". Other now
-- carries a unit (20260816170000), which covers freeform cases — but a mixer
-- hired for two days is not freeform. It is a row in the equipment library the
-- contractor already keeps, and a recipe that cannot point at it forces them
-- to retype the name and rate, which then silently diverge from the library.
--
-- Two changes, both additive.
--
-- 1. A new value on the component-kind enum. The physical type is still
--    "AssemblyComponentKind" — the Prisma enum was renamed to JobComponentKind
--    in the 0b vocabulary work with @@map keeping the type name, so this alters
--    the old name deliberately. See PLANNING.md section 1.
--
--    ALTER TYPE ... ADD VALUE is safe to run here: Postgres 12+ permits it
--    inside a transaction provided the new value is not USED in that same
--    transaction, and nothing below writes an EQUIPMENT row. IF NOT EXISTS
--    makes a re-run harmless.
ALTER TYPE "AssemblyComponentKind" ADD VALUE IF NOT EXISTS 'EQUIPMENT';

-- 2. An optional link back to the equipment library row, mirroring how a
--    component already points at a MaterialFavourite or a LabourRate.
--
--    ON DELETE SET NULL, matching those two: deleting a piece of equipment
--    must not delete recipes that referenced it. The component keeps its
--    snapshotted description and price and simply loses the back-reference —
--    which is exactly what a snapshot is for. CASCADE here would let removing
--    one hire item silently rewrite the cost of every job that used it.
ALTER TABLE "AssemblyComponent" ADD COLUMN "equipmentItemId" TEXT;

ALTER TABLE "AssemblyComponent" ADD CONSTRAINT "AssemblyComponent_equipmentItemId_fkey"
    FOREIGN KEY ("equipmentItemId") REFERENCES "EquipmentItem"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AssemblyComponent_equipmentItemId_idx" ON "AssemblyComponent"("equipmentItemId");
