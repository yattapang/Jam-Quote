import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { clients, quotes } from "@/lib/mock-data";
import shared from "../shared.module.css";

export const metadata = { title: "Clients · JamQuote" };

function quoteCount(clientId: string): number {
  return quotes.filter((q) => q.clientId === clientId).length;
}

export default function ClientsPage() {
  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>Contacts</span>
          <h1 className={shared.title}>Clients</h1>
          <span className={shared.subtitle}>{clients.length} clients across your parishes</span>
        </div>
        <div className={shared.headerActions}>
          <Button variant="primary">Add client</Button>
        </div>
      </header>

      <Card>
        <div className={shared.list}>
          {clients.map((c) => {
            const count = quoteCount(c.id);
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
