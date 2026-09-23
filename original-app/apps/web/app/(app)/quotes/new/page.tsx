import { getClients, getProjects, getMaterialFavourites, getJobs, getLabourRates,
  getEquipment, getBusiness, getTrades } from "@/lib/api-server";
import { newDocumentGctPrefill } from "@/lib/gct-prefill";
import QuoteBuilder from "./QuoteBuilder";

export const metadata = { title: "New quote · Pryvis" };

export default async function NewQuotePage() {
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
  // Never hardcode GCT — use the business's own default rate, falling back
  // to 15% only if it's unavailable/unreadable (e.g. the API is unreachable
  // and getBusiness() returned its empty fallback). An unregistered business
  // prefills 0%, matching what quotes.service.create() actually saves when no
  // rate is supplied — what the contractor sees must match what gets billed.
  const gctRatePct = newDocumentGctPrefill(business);
  return (
    <QuoteBuilder
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      favourites={favourites}
      jobs={jobs}
      labourRates={labourRates}
      equipment={equipment}
      trades={trades}
      gctRatePct={gctRatePct}
      gctRegistered={business.gctRegistered}
    />
  );
}
