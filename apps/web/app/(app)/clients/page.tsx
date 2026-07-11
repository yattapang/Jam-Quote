import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import { getClients, getQuotes } from "@/lib/api-client";
import AddClientButton from "./AddClientButton";
import shared from "../shared.module.css";

export const metadata = { title: "Clients · JamQuote" };

export default async function ClientsPage() {
  const [clients, quotes] = await Promise.all([getClients(), getQuotes()]);

  const statsFor = (clientId: string) => {
    const theirs = quotes.filter((q) => q.clientId === clientId);
    return {
      count: theirs.length,
      total: theirs.reduce((sum, q) => sum + (q.totalCents ?? 0), 0),
    };
  };

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>Contacts</span>
          <h1 className={shared.title}>Clients</h1>
          <span className={shared.subtitle}>{clients.length} clients across your parishes</span>
        </div>
        <div className={shared.headerActions}>
          <AddClientButton />
        </div>
      </header>

      <Card>
        <div className={shared.list}>
          {clients.map((c) => {
            const { count, total } = statsFor(c.id);
            return (
              <div key={c.id} className={shared.row}>
                <div className={shared.rowWithAvatar}>
                  <span className={shared.avatar}>{c.initials}</span>
                  <div className={shared.rowMain}>
                    <span className={shared.rowTitle}>{c.name}</span>
                    <span className={shared.rowSub}>
                      {c.parish} · {c.phone}
                    </span>
                  </div>
                </div>
                <div className={shared.rowRight}>
                  <MoneyText cents={total} />
                  <span className={shared.rowSub}>
                    {count} {count === 1 ? "quote" : "quotes"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
