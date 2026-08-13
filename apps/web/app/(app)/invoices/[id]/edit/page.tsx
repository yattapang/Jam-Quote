import { notFound, redirect } from "next/navigation";
import { InvoiceStatus } from "@jamquote/core";
import { getAssemblies, getClients, getInvoice, getLabourRates, getMaterialFavourites } from "@/lib/api-server";
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

  // The same catalogs the quote builder's page fetches, since the line editor
  // is now shared, plus the client list for the bill-to picker. No jobs (an
  // invoice is billed to a client, not scheduled against a job) and no
  // business (an invoice carries its own gctRatePct).
  const [favourites, assemblies, labourRates, clients] = await Promise.all([
    getMaterialFavourites(),
    getAssemblies(),
    getLabourRates(),
    getClients(),
  ]);

  return (
    <InvoiceBuilder
      invoiceId={invoice.id}
      invoiceNumber={invoice.num}
      favourites={favourites}
      assemblies={assemblies}
      labourRates={labourRates}
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      initial={{
        clientId: invoice.clientId,
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
            unitLabel: l.unitLabel,
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
            unitLabel: l.unitLabel,
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
