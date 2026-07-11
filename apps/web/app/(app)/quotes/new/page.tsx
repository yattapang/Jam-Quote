import { getClients, getJobs } from "@/lib/api-client";
import QuoteBuilder from "./QuoteBuilder";

export const metadata = { title: "New quote · JamQuote" };

export default async function NewQuotePage() {
  const [clients, jobs] = await Promise.all([getClients(), getJobs()]);
  return (
    <QuoteBuilder
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      jobs={jobs.map((j) => ({ id: j.id, name: j.name }))}
    />
  );
}
