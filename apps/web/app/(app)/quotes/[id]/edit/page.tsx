import { notFound } from "next/navigation";
import { getQuote, getClients, getJobs, getMaterialFavourites, getBusiness } from "@/lib/api-server";
import QuoteBuilder from "../../new/QuoteBuilder";

export const metadata = { title: "Edit quote · JamQuote" };

export default async function EditQuotePage({ params }: { params: { id: string } }) {
  const quote = await getQuote(params.id);
  if (!quote) notFound();

  const [clients, jobs, favourites, business] = await Promise.all([
    getClients(),
    getJobs(),
    getMaterialFavourites(),
    getBusiness(),
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
        jobId: quote.jobId,
        discountPct: quote.discountPct,
        depositCents: quote.depositCents,
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
            unitPriceCents: l.unitPriceCents,
            gctTreatment: l.gctTreatment,
          })),
        sections: quote.sections?.map((s) => ({
          title: s.title,
          lines: s.lines.map((l) => ({
            category: l.category,
            description: l.description,
            quantity: l.quantity,
            rateUnit: l.rateUnit,
            unitPriceCents: l.unitPriceCents,
            gctTreatment: l.gctTreatment,
          })),
        })),
      }}
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      jobs={jobs.map((j) => ({ id: j.id, name: j.name }))}
      favourites={favourites}
      gctRatePct={gctRatePct}
    />
  );
}
