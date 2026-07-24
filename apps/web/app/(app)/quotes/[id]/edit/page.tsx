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
  // Never hardcode GCT — use the business's own default rate, falling back
  // to 15% only if it's unavailable/unreadable.
  const gctRatePct = Number.isFinite(business.defaultGctRatePct) ? business.defaultGctRatePct : 15;

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
