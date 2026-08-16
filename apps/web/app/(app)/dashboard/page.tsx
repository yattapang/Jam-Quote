import Link from "next/link";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import StatusPill from "@/components/ui/StatusPill";
import MoneyText from "@/components/ui/MoneyText";
import { quoteStatusPill } from "@/lib/status";
import { getQuotes, getClients, getBusiness, getInvoices, getRegulatoryUpdates } from "@/lib/api-server";
import { sortRegulatoryAlerts } from "@/lib/regulatory";
import { computeDashboardStats, QuoteStatus } from "@jamquote/core";
import shared from "../shared.module.css";

export const metadata = { title: "Dashboard · JamQuote" };

export default async function DashboardPage() {
  const [allQuotes, clients, business, regulatory, allInvoices] = await Promise.all([
    getQuotes(),
    getClients(),
    getBusiness(),
    getRegulatoryUpdates(),
    getInvoices(),
  ]);
  const clientNames = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  // Most recently created first, so a brand-new draft always surfaces here
  // regardless of its quote number (revisions can reuse an older number).
  const recentQuotes = [...allQuotes]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  // Every stat card is derived from data this page actually fetched — no
  // hardcoded numbers. computeDashboardStats is the SSOT, mirroring how
  // computeTotals is the SSOT for money math. The invoices feed the overdue
  // card, which until now read a hardcoded 0 and told every contractor they
  // were owed nothing.
  const stats = computeDashboardStats(
    allQuotes.map((q) => ({
      status: q.status,
      totalCents: q.totalCents ?? 0,
      createdAt: q.createdAt,
    })),
    allInvoices.map((i) => ({
      status: i.status,
      totalCents: i.totalCents ?? 0,
      paidCents: i.paidCents ?? 0,
      createdAt: i.createdAt,
      dueDate: i.dueDate,
    })),
  );

  // Needs follow-up: quotes sitting with the client (SENT/VIEWED), oldest
  // first, so the ones waiting longest surface at the top.
  const needsFollowUp = allQuotes
    .filter((q) => q.status === QuoteStatus.SENT || q.status === QuoteStatus.VIEWED)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, 4);

  // Soonest-to-take-effect first; the card only has room for the few that
  // still leave time to act.
  const alerts = sortRegulatoryAlerts(regulatory, new Date()).slice(0, 3);

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>{business.name}</span>
          {/* The Business model has no owner name (that's on User, not wired
              here) — a generic greeting rather than fabricating one. */}
          <h1 className={shared.title}>Good day</h1>
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
          <MoneyText cents={stats.pipelineValueCents} size={24} tone="accent" />
          <div className={shared.statHint}>Open quotes not yet won or lost</div>
        </Card>
        <Card>
          <div className={shared.statLabel}>Win rate · 90d</div>
          <span className="jq-numeral" style={{ fontSize: 24, fontWeight: 800 }}>
            {stats.winRatePct90d}%
          </span>
          <div className={shared.statHint}>Accepted vs. sent quotes</div>
        </Card>
        <Card>
          <div className={shared.statLabel}>Overdue invoices</div>
          <MoneyText cents={stats.overdueInvoicesCents} size={24} tone="critical" />
          <div className={shared.statHint}>Past due and awaiting payment</div>
        </Card>
        <Card>
          <div className={shared.statLabel}>Quotes this month</div>
          <span className="jq-numeral" style={{ fontSize: 24, fontWeight: 800 }}>
            {stats.quotesThisMonth}
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
              {recentQuotes.length === 0 && (
                <div className={shared.empty}>No quotes yet — create your first one.</div>
              )}
              {recentQuotes.map((q) => {
                const pill = quoteStatusPill(q.status);
                return (
                  <Link key={q.id} href={`/quotes/${q.id}`} className={shared.rowLink}>
                    <div className={shared.row}>
                      <div className={shared.rowMain}>
                        <span className={shared.rowTitle}>
                          {q.num}
                          <StatusPill label={pill.label} kind={pill.kind} variant={pill.variant} />
                        </span>
                        <span className={shared.rowSub}>
                          {clientNames[q.clientId] ?? "Unknown client"} · {q.projectLabel}
                        </span>
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
          <h2 className={shared.sectionTitle}>Needs follow-up</h2>
          <Card>
            <div className={shared.list}>
              {needsFollowUp.length === 0 ? (
                <div className={shared.empty}>Nothing waiting on a reply.</div>
              ) : (
                needsFollowUp.map((q) => (
                  <Link key={q.id} href={`/quotes/${q.id}`} className={shared.rowLink}>
                    <div className={shared.rowMain}>
                      <span className={shared.rowTitle}>
                        {clientNames[q.clientId] ?? "Unknown client"}
                      </span>
                      <span className={shared.rowSub}>
                        {q.projectLabel} · {q.createdLabel} · awaiting response
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </Card>

          <h2 className={shared.sectionTitle} style={{ marginTop: 6 }}>
            Regulatory
          </h2>
          <Card>
            <div className={shared.list}>
              {alerts.length === 0 ? (
                <div className={shared.empty}>No regulatory updates right now.</div>
              ) : (
                alerts.map((a) => {
                  const body = (
                    <div className={shared.rowMain}>
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
                  );
                  // Only the updates that carry the authority's own URL become
                  // links — the rest stay plain text rather than pointing the
                  // contractor at a guessed page. noopener/noreferrer because
                  // the destination is a third-party government site.
                  return a.sourceUrl ? (
                    <a
                      key={a.id}
                      href={a.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={shared.rowLink}
                    >
                      {body}
                    </a>
                  ) : (
                    <div key={a.id}>{body}</div>
                  );
                })
              )}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
