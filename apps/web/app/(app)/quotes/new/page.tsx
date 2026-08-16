import { getClients, getProjects, getMaterialFavourites, getJobs, getBusiness } from "@/lib/api-server";
import QuoteBuilder from "./QuoteBuilder";

export const metadata = { title: "New quote · JamQuote" };

export default async function NewQuotePage() {
  const [clients, projects, favourites, jobs, business] = await Promise.all([
    getClients(),
    getProjects(),
    getMaterialFavourites(),
    getJobs(),
    getBusiness(),
  ]);
  // Never hardcode GCT — use the business's own default rate, falling back
  // to 15% only if it's unavailable/unreadable (e.g. the API is unreachable
  // and getBusiness() returned its empty fallback).
  const gctRatePct = Number.isFinite(business.defaultGctRatePct) ? business.defaultGctRatePct : 15;
  return (
    <QuoteBuilder
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      favourites={favourites}
      jobs={jobs}
      gctRatePct={gctRatePct}
    />
  );
}
