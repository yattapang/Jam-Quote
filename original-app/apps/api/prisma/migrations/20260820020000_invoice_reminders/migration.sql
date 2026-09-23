-- Payment reminders sent to a client about an invoice.
-- A ledger rather than a lastRemindedAt column: "how many times have I chased
-- this, and when" is the question a contractor actually has.
CREATE TABLE "InvoiceReminder" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sentTo" TEXT,
    "outstandingCents" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceReminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvoiceReminder_invoiceId_sentAt_idx" ON "InvoiceReminder"("invoiceId", "sentAt");
CREATE INDEX "InvoiceReminder_businessId_sentAt_idx" ON "InvoiceReminder"("businessId", "sentAt");

ALTER TABLE "InvoiceReminder" ADD CONSTRAINT "InvoiceReminder_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
