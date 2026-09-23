-- Quote → invoice (#18): make Invoice a full editable document.
--
-- Invoice was previously header-only (number + totalCents + paidCents) and no
-- code path ever created one, so the table is empty and these additions are
-- safe. Converting a quote now snapshots its lines into InvoiceLineItem /
-- InvoiceSection, which mirror the Quote equivalents so the shared
-- computeTotals engine in @jamquote/core can price both identically.
--
-- status default flips INVOICED -> DRAFT: a converted invoice starts editable
-- and only becomes INVOICED when explicitly finalized.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "depositCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "detailLevel" "QuoteDetailLevel" NOT NULL DEFAULT 'SUMMARY',
ADD COLUMN     "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "gctCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gctRate" DECIMAL(5,2) NOT NULL DEFAULT 15.0,
ADD COLUMN     "subtotalCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "terms" TEXT,
ALTER COLUMN "status" SET DEFAULT 'DRAFT',
ALTER COLUMN "totalCents" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "InvoiceSection" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "InvoiceSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "sectionId" TEXT,
    "category" "LineCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "rateUnit" "RateUnit" NOT NULL DEFAULT 'UNIT',
    "unitPriceCents" INTEGER NOT NULL,
    "priceSource" "PriceSource" NOT NULL DEFAULT 'MANUAL',
    "supplierId" TEXT,
    "gctTreatment" "GctTreatment" NOT NULL DEFAULT 'STANDARD',
    "markupPct" DECIMAL(6,2),
    "overrideNote" TEXT,
    "assemblyId" TEXT,
    "assemblyName" TEXT,
    "assemblyUnit" TEXT,
    "assemblyComponents" JSONB,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoiceId_idx" ON "InvoiceLineItem"("invoiceId");

-- CreateIndex
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");

-- AddForeignKey
ALTER TABLE "InvoiceSection" ADD CONSTRAINT "InvoiceSection_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "InvoiceSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
