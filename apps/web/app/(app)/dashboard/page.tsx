import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import StatusPill from "@/components/ui/StatusPill";
import MoneyText from "@/components/ui/MoneyText";
import { quoteStatusPill } from "@/lib/status";
import { businessProfile, dashboardStats, followUps, regulatoryAlerts } from "@/lib/mock-data";
import { getQuotes, getClients } from "@/lib/api-client";
import shared from "../shared.module.css";

export const metadata = { title: "Dashboard · JamQuote" };

export default async function DashboardPage() {
  const [allQuotes, clients] = await Promise.all([getQuotes(), getClients()]);
  const clientNames = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const recentQuotes = allQuotes.slice(0, 5);
  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>{businessProfile.name}</span>
          <h1 className={shared.title}>Good day, {businessProfile.ownerFirstName}</h1>
          <span className={shared.subtitle}>
            Here&apos;s where your estimating stands today.
          </span>
        </div>
        <div className={shared.headerActions}>
          <Button href="/quotes/new" variant="primary">
            New quote
          </Button>
        </div>
      </header>

      <section className={shared.statGrid}>
        <Card>
          <div className={shared.statLabel}>Pipeline value</div>
          <MoneyText cents={dashboardStats.pipelineValueCents} size={24} tone="accent" />
          <div className={shared.statHint}>Open quotes not yet won or lost</div>
        </Card>
        <Card>
          <div className={shared.statLabel}>Win rate · 90d</div>
          <span className="jq-numeral" style={{ fontSize: 24, fontWeight: 800 }}>
            {dashboardStats.winRatePct90d}%
          </span>
          <div className={shared.statHint}>Accepted vs. sent quotes</div>
        </Card>
        <Card>
          <div className={shared.statLabel}>Overdue invoices</div>
          <MoneyText cents={dashboardStats.overdueInvoicesCents} size={24} tone="critical" />
          <div className={shared.statHint}>Past due and awaiting payment</div>
        </Card>
        <Card>
          <div className={shared.statLabel}>Quotes this month</div>
          <span className="jq-numeral" style={{ fontSize: 24, fontWeight: 800 }}>
            {dashboardStats.quotesThisMonth}
          </span>
          <div className={shared.statHint}>Created since the 1st</div>
        </Card>
      </section>

      <div className={shared.grid2}>
        <section className={shared.section}>
          <div className={shared.sectionHead}>
            <h2 className={shared.sectionTitle}>Recent quotes</h2>
            <Button href="/quotes" variant="ghost" size="sm">
              View all
            </Button>
          </div>
          <Card>
            <div className={shared.list}>
              {recentQuotes.map((q) => {
                const pill = quoteStatusPill(q.status);
                return (
                  <div key={q.id} className={shared.row}>
                    <div className={shared.rowMain}>
                      <span className={shared.rowTitle}>
                        {q.num}
                        <StatusPill label={pill.label} kind={pill.kind} variant={pill.variant} />
                      </span>
                      <span className={shared.rowSub}>
                        {clientNames[q.clientId] ?? "Unknown client"} · {q.jobLabel}
                      </span>
                    </div>
                    <div className={shared.rowRight}>
                      <MoneyText cents={q.totalCents ?? 0} />
                      <span className={shared.rowSub}>{q.createdLabel}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </section>

        <section className={shared.section}>
          <h2 className={shared.sectionTitle}>Needs follow-up</h2>
          <Card>
            <div className={shared.list}>
              {followUps.map((f) => (
                <div key={f.id} className={shared.row}>
                  <div className={shared.rowMain}>
                    <span className={shared.rowTitle}>{f.clientName}</span>
                    <span className={shared.rowSub}>
                      {f.jobLabel} · {f.note}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <h2 className={shared.sectionTitle} style={{ marginTop: 6 }}>
            Regulatory
          </h2>
          <Card>
            <div className={shared.list}>
              {regulatoryAlerts.map((a) => (
                <div key={a.id} className={shared.rowMain}>
                  <span className={shared.rowTitle}>
                    <StatusPill
                      label={a.effectiveLabel}
                      kind={a.severity === "critical" ? "critical" : a.severity === "warn" ? "warn" : "info"}
                    />
                  </span>
                  <span className={shared.rowSub} style={{ whiteSpace: "normal" }}>
                    {a.title}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
