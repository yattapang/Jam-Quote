import { notFound } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import StatusPill from "@/components/ui/StatusPill";
import DeleteRowButton from "@/components/ui/DeleteRowButton";
import { quoteStatusPill } from "@/lib/status";
import { getClient, getQuotes } from "@/lib/api-client";
import EditClientButton from "./EditClientButton";
import shared from "../../shared.module.css";

export const metadata = { title: "Client · JamQuote" };

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const client = await getClient(params.id);
  if (!client) notFound();

  const quotes = (await getQuotes()).filter((q) => q.clientId === client.id);
  const totalCents = quotes.reduce((sum, q) => sum + (q.totalCents ?? 0), 0);

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>
            <Link href="/clients" style={{ color: "inherit" }}>
              ← Clients
            </Link>
          </span>
          <h1 className={shared.title}>{client.name}</h1>
          <span className={shared.subtitle}>
            {client.parish || "No parish set"} · {client.phone || "No phone"}
          </span>
        </div>
        <div className={shared.headerActions}>
          <EditClientButton client={client} />
          <DeleteRowButton
            kind="client"
            id={client.id}
            confirmMessage={`Delete ${client.name}? This can't be undone.`}
            redirectTo="/clients"
          />
        </div>
      </header>

      <div className={shared.grid2}>
        <section className={shared.section}>
          <div className={shared.sectionHead}>
            <h2 className={shared.sectionTitle}>Quotes</h2>
          </div>
          <Card>
            <div className={shared.list}>
              {quotes.length === 0 && <div className={shared.empty}>No quotes for this client yet.</div>}
              {quotes.map((q) => {
                const pill = quoteStatusPill(q.status);
                return (
                  <Link key={q.id} href={`/quotes/${q.id}`} className={shared.rowLink}>
                    <div className={shared.row}>
                      <div className={shared.rowMain}>
                        <span className={shared.rowTitle}>
                          {q.num}
                          <StatusPill label={pill.label} kind={pill.kind} variant={pill.variant} />
                        </span>
                        <span className={shared.rowSub}>{q.jobLabel}</span>
                      </div>
                      <div className={shared.rowRight}>
                        <MoneyText cents={q.totalCents ?? 0} />
                        <span className={shared.rowSub}>{q.createdLabel}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        </section>

        <section className={shared.section}>
          <Card>
            <div className={shared.statLabel}>Details</div>
            <div className={shared.list}>
              <div className={shared.totalRowMuted}>
                <span>Address</span>
                <span>{client.address || "—"}</span>
              </div>
              <div className={shared.totalRowMuted}>
                <span>Parish</span>
                <span>{client.parish || "—"}</span>
              </div>
              <div className={shared.totalRowMuted}>
                <span>Phone</span>
                <span>{client.phone || "—"}</span>
              </div>
              <div className={shared.totalRowMuted}>
                <span>Email</span>
                <span>{client.email || "—"}</span>
              </div>
              <div className={shared.totalRowGrand}>
                <span>Total quoted</span>
                <MoneyText cents={totalCents} tone="accent" />
              </div>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
