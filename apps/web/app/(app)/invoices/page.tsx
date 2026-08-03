import { getInvoices, getClients } from "@/lib/api-server";
import InvoicesListClient from "./InvoicesListClient";

export const metadata = { title: "Invoices · JamQuote" };

export default async function InvoicesPage() {
  const [invoices, clients] = await Promise.all([getInvoices(), getClients()]);
  const clientNames = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  return <InvoicesListClient invoices={invoices} clientNames={clientNames} />;
}
