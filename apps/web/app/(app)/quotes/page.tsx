import { getQuotes, getClients } from "@/lib/api-client";
import QuotesListClient from "./QuotesListClient";

export const metadata = { title: "Quotes · JamQuote" };

export default async function QuotesPage() {
  const [quotes, clients] = await Promise.all([getQuotes(), getClients()]);
  const clientNames = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  return <QuotesListClient quotes={quotes} clientNames={clientNames} />;
}
