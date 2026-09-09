import { notFound, redirect } from "next/navigation";
import { getQuote, getClients, getProjects, getMaterialFavourites, getJobs, getLabourRates, getEquipment, getBusiness, getTrades } from "@/lib/api-server";
import QuoteBuilder from "../../new/QuoteBuilder";

export const metadata = { title: "Edit quote · JamQuote" };

export default async function EditQuotePage({ params }: { params: { id: string } }) {
  const quote = await getQuote(params.id);
  if (!quote) notFound();

  // Not editable once sent, and this page refuses rather than relying on the Edit
  // button being hidden. The API refuses too — a hidden button is a suggestion,
  // and `/quotes/<accepted-id>/edit` was reachable by typing it. Redirecting to
  // the quote itself is kinder than a 404: the quote exists, and Revise is there.
  if (quote.status !== "DRAFT") redirect(`/quotes/${params.id}`);

  const [clients, projects, favourites, jobs, labourRates, equipment, business, trades] = await Promise.all([
    getClients(),
    getProjects(),
    getMaterialFavourites(),
    getJobs(),
    getLabourRates(),
    getEquipment(),
    getBusiness(),
    getTrades(),
  ]);
  // Never hardcode GCT. On EDIT, preserve the rate the quote was originally
  // saved at (don't silently re-tax an existing quote if the business default
  // has since changed); fall back to the business default, then 15%.
  const businessRate = Number.isFinite(business.defaultGctRatePct) ? business.defaultGctRatePct : 15;
  const gctRatePct =
    Number.isFinite(quote.gctRatePct) && quote.gctRatePct > 0 ? quote.gctRatePct : businessRate;

  return (
    <QuoteBuilder
      mode="edit"
      quoteId={quote.id}
      initial={{
        clientId: quote.clientId || undefined,
        projectId: quote.projectId,
        discountPct: quote.discountPct,
        depositCents: quote.depositCents,
        detailLevel: quote.detailLevel,
        validUntil: quote.validUntil,
        createdAt: quote.createdAt,
        // Ungrouped lines only — sectioned lines are carried separately below
        // so editing a sectioned quote reconstructs its section titles.
        lines: quote.lines
          .filter((l) => !quote.sections?.some((s) => s.lines.some((sl) => sl.id === l.id)))
          .map((l) => ({
            category: l.category,
            description: l.description,
            quantity: l.quantity,
            rateUnit: l.rateUnit,
            // Without this, opening a saved quote and re-saving strips the
            // sold-by label off every line and the PDF reverts to "unit".
            unitLabel: l.unitLabel,
            unitPriceCents: l.unitPriceCents,
            gctTreatment: l.gctTreatment,
            jobId: l.jobId,
            jobName: l.jobName,
            jobUnit: l.jobUnit,
            jobComponents: l.jobComponents,
            // markupPct is part of the subtotal. Without it here, opening a saved
            // quote and pressing Save lowered its total by every line's markup —
            // the same shape of bug the unitLabel comment above records.
            markupPct: l.markupPct,
            priceSource: l.priceSource,
            supplierId: l.supplierId,
            overrideNote: l.overrideNote,
          })),
        sections: quote.sections?.map((s) => ({
          title: s.title,
          lines: s.lines.map((l) => ({
            category: l.category,
            description: l.description,
            quantity: l.quantity,
            rateUnit: l.rateUnit,
            // Without this, opening a saved quote and re-saving strips the
            // sold-by label off every line and the PDF reverts to "unit".
            unitLabel: l.unitLabel,
            unitPriceCents: l.unitPriceCents,
            gctTreatment: l.gctTreatment,
            jobId: l.jobId,
            jobName: l.jobName,
            jobUnit: l.jobUnit,
            jobComponents: l.jobComponents,
            // markupPct is part of the subtotal. Without it here, opening a saved
            // quote and pressing Save lowered its total by every line's markup —
            // the same shape of bug the unitLabel comment above records.
            markupPct: l.markupPct,
            priceSource: l.priceSource,
            supplierId: l.supplierId,
            overrideNote: l.overrideNote,
          })),
        })),
      }}
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      favourites={favourites}
      jobs={jobs}
      labourRates={labourRates}
      equipment={equipment}
      trades={trades}
      gctRatePct={gctRatePct}
    />
  );
}
