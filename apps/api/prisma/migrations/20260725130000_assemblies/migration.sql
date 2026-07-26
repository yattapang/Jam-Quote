-- Assemblies ("job types"): reusable composite units (e.g. "Tiling — per sq
-- ft") built from material/labour/other components, with a unit cost
-- computed from those components (see computeAssemblyUnitCostCents in
-- @jamquote/core). AssemblyComponent snapshots unitPriceCents from its
-- source (MaterialFavourite/LabourRate) at the time it was added, so a
-- saved assembly's cost is stable even if the catalog price later changes;
-- it can be recomputed from the library on demand.

-- CreateEnum
CREATE TYPE "AssemblyComponentKind" AS ENUM ('MATERIAL', 'LABOUR', 'OTHER');

-- CreateTable
CREATE TABLE "Assembly" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "markupPct" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Assembly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyComponent" (
    "id" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "kind" "AssemblyComponentKind" NOT NULL,
    "materialFavouriteId" TEXT,
    "labourRateId" TEXT,
    "description" TEXT NOT NULL,
    "quantityPerUnit" DECIMAL(12,3) NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssemblyComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assembly_businessId_idx" ON "Assembly"("businessId");

-- CreateIndex
CREATE INDEX "AssemblyComponent_assemblyId_idx" ON "AssemblyComponent"("assemblyId");

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyComponent" ADD CONSTRAINT "AssemblyComponent_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyComponent" ADD CONSTRAINT "AssemblyComponent_materialFavouriteId_fkey" FOREIGN KEY ("materialFavouriteId") REFERENCES "MaterialFavourite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyComponent" ADD CONSTRAINT "AssemblyComponent_labourRateId_fkey" FOREIGN KEY ("labourRateId") REFERENCES "LabourRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
