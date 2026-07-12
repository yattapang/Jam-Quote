import { notFound } from "next/navigation";
import { getQuote, getClients, getJobs } from "@/lib/api-client";
import QuoteBuilder from "../../new/QuoteBuilder";

export const metadata = { title: "Edit quote · JamQuote" };

export default async function EditQuotePage({ params }: { params: { id: string } }) {
  const quote = await getQuote(params.id);
  if (!quote) notFound();

  const [clients, jobs] = await Promise.all([getClients(), getJobs()]);

  return (
    <QuoteBuilder
      mode="edit"
      quoteId={quote.id}
      initial={{
        clientId: quote.clientId || undefined,
        jobId: quote.jobId,
        discountPct: quote.discountPct,
        depositCents: quote.depositCents,
        lines: quote.lines.map((l) => ({
          category: l.category,
          description: l.description,
          quantity: l.quantity,
          rateUnit: l.rateUnit,
          unitPriceCents: l.unitPriceCents,
          gctTreatment: l.gctTreatment,
        })),
      }}
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      jobs={jobs.map((j) => ({ id: j.id, name: j.name }))}
    />
  );
}
