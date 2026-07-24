import { getClients, getJobs, getMaterialFavourites } from "@/lib/api-server";
import QuoteBuilder from "./QuoteBuilder";

export const metadata = { title: "New quote · JamQuote" };

export default async function NewQuotePage() {
  const [clients, jobs, favourites] = await Promise.all([getClients(), getJobs(), getMaterialFavourites()]);
  return (
    <QuoteBuilder
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      jobs={jobs.map((j) => ({ id: j.id, name: j.name }))}
      favourites={favourites}
    />
  );
}
