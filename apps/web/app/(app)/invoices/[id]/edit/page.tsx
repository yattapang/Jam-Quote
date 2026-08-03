import { notFound, redirect } from "next/navigation";
import { InvoiceStatus } from "@jamquote/core";
import { getInvoice } from "@/lib/api-server";
import InvoiceBuilder from "./InvoiceBuilder";

export const metadata = { title: "Edit invoice · JamQuote" };

/** Only reachable while the invoice is DRAFT — once finalized the API
 * rejects any PATCH, so this redirects straight to the read-only detail page
 * rather than showing an editor that can't save. */
export default async function EditInvoicePage({ params }: { params: { id: string } }) {
  const invoice = await getInvoice(params.id);
  if (!invoice) notFound();
  if (invoice.status !== InvoiceStatus.DRAFT) {
    redirect(`/invoices/${invoice.id}`);
  }

  return (
    <InvoiceBuilder
      invoiceId={invoice.id}
      invoiceNumber={invoice.num}
      initial={{
        dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : undefined,
        terms: invoice.terms,
        gctRatePct: invoice.gctRatePct,
        discountPct: invoice.discountPct,
        depositCents: invoice.depositCents,
        detailLevel: invoice.detailLevel,
        // Ungrouped lines only — sectioned lines are carried separately below
        // so editing reconstructs its section titles (mirrors the quote
        // builder's edit-page mapping).
        lines: invoice.lines
          .filter((l) => !invoice.sections?.some((s) => s.lines.some((sl) => sl.id === l.id)))
          .map((l) => ({
            category: l.category,
            description: l.description,
            quantity: l.quantity,
            rateUnit: l.rateUnit,
            unitPriceCents: l.unitPriceCents,
            gctTreatment: l.gctTreatment,
            assemblyId: l.assemblyId,
            assemblyName: l.assemblyName,
            assemblyUnit: l.assemblyUnit,
            assemblyComponents: l.assemblyComponents,
          })),
        sections: invoice.sections?.map((s) => ({
          title: s.title,
          lines: s.lines.map((l) => ({
            category: l.category,
            description: l.description,
            quantity: l.quantity,
            rateUnit: l.rateUnit,
            unitPriceCents: l.unitPriceCents,
            gctTreatment: l.gctTreatment,
            assemblyId: l.assemblyId,
            assemblyName: l.assemblyName,
            assemblyUnit: l.assemblyUnit,
            assemblyComponents: l.assemblyComponents,
          })),
        })),
      }}
    />
  );
}
