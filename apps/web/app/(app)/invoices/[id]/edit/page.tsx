import { notFound, redirect } from "next/navigation";
import { InvoiceStatus } from "@jamquote/core";
import { getJobs, getClients, getInvoice, getLabourRates,
  getEquipment, getMaterialFavourites, getTrades } from "@/lib/api-server";
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
  const [favourites, jobs, labourRates, equipment, clients, trades] = await Promise.all([
    getMaterialFavourites(),
    getJobs(),
    getLabourRates(),
    getEquipment(),
    getClients(),
    getTrades(),
  ]);

  return (
    <InvoiceBuilder
      invoiceId={invoice.id}
      invoiceNumber={invoice.num}
      favourites={favourites}
      jobs={jobs}
      labourRates={labourRates}
      equipment={equipment}
      trades={trades}
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
            jobId: l.jobId,
            jobName: l.jobName,
            jobUnit: l.jobUnit,
            jobComponents: l.jobComponents,
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
            jobId: l.jobId,
            jobName: l.jobName,
            jobUnit: l.jobUnit,
            jobComponents: l.jobComponents,
          })),
        })),
      }}
    />
  );
}
