import Link from "next/link";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import StatusPill from "@/components/ui/StatusPill";
import { getReports } from "@/lib/api-server";
import { REPORT_PERIODS, isReportPeriod, periodRange, type ReportPeriod } from "@/lib/report-periods";
import { projectStagePill } from "@/lib/status";
import { PROJECT_STAGES } from "@jamquote/core";
import shared from "../shared.module.css";
import styles from "./reports.module.css";

export const metadata = { title: "Reports · JamQuote" };

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "YYYY-MM" -> "Aug '26". Parsed directly from the string rather than
 * through `new Date` — monthIso is a Jamaica-local calendar label (see
 * MonthlySalesBucket in packages/core), and round-tripping it through a
 * UTC-based Date could shift it into the wrong month. */
function formatMonthLabel(monthIso: string): string {
  const [yearStr = "", monthStr = ""] = monthIso.split("-");
  const monthIdx = Number(monthStr) - 1;
  const label = MONTH_LABELS[monthIdx] ?? monthStr;
  return `${label} '${yearStr.slice(2)}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const period: ReportPeriod = isReportPeriod(searchParams.period) ? searchParams.period : "month";
  const { from, to } = periodRange(period);
  const reports = await getReports(from, to);

  // Scales both series against one shared maximum so invoiced/collected bars
  // stay comparable month to month. Floored at 1 (not 0) so an all-zero
  // period renders every bar flush to the baseline instead of dividing by
  // zero.
  const maxMonthCents = Math.max(
    1,
    ...reports.salesByMonth.flatMap((m) => [m.invoicedCents, m.collectedCents]),
  );

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>Insights</span>
          <h1 className={shared.title}>Reports</h1>
          <span className={shared.subtitle}>Pipeline, win rate &amp; revenue reporting</span>
        </div>
      </header>

      <div className={shared.filters}>
        {REPORT_PERIODS.map((p) => (
          <Link
            key={p.value}
            href={`/reports?period=${p.value}`}
            className={p.value === period ? shared.chipActive : shared.chip}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <section className={shared.statGrid}>
        <Card>
          <div className={shared.statLabel}>Quotes sent</div>
          <MoneyText cents={reports.quotes.sentValueCents} size={24} tone="accent" />
          <div className={shared.statHint}>
            {reports.quotes.sentCount} quote{reports.quotes.sentCount === 1 ? "" : "s"} sent
          </div>
        </Card>
        <Card>
          <div className={shared.statLabel}>Win rate</div>
          <span className="jq-numeral" style={{ fontSize: 24, fontWeight: 800 }}>
            {reports.quotes.winRatePct}%
          </span>
          <div className={shared.statHint}>
            {reports.quotes.acceptedCount} accepted &middot;{" "}
            <MoneyText cents={reports.quotes.acceptedValueCents} size={12.5} tone="muted" weight={600} />
          </div>
        </Card>
        <Card>
          <div className={shared.statLabel}>Invoiced</div>
          <MoneyText cents={reports.revenue.invoicedCents} size={24} />
          <div className={shared.statHint}>Total invoiced this period</div>
        </Card>
        <Card>
          <div className={shared.statLabel}>Collected</div>
          <MoneyText cents={reports.revenue.collectedCents} size={24} tone="good" />
          <div className={shared.statHint}>Cash actually received</div>
        </Card>
      </section>

      <section className={shared.section}>
        <h2 className={shared.sectionTitle}>Sales by month</h2>
        <Card>
          {reports.salesByMonth.length === 0 ? (
            <div className={shared.empty}>No months in this period.</div>
          ) : (
            <>
              <div className={styles.legend}>
                <span className={styles.legendItem}>
                  <span className={`${styles.swatch} ${styles.swatchInvoiced}`} /> Invoiced
                </span>
                <span className={styles.legendItem}>
                  <span className={`${styles.swatch} ${styles.swatchCollected}`} /> Collected
                </span>
              </div>
              <div className={styles.chartScroll}>
                <div className={styles.chart}>
                  {reports.salesByMonth.map((m) => (
                    <div key={m.monthIso} className={styles.barGroup}>
                      <div className={styles.bars}>
                        <div
                          className={`${styles.bar} ${styles.barInvoiced}`}
                          style={{ height: `${Math.round((m.invoicedCents / maxMonthCents) * 100)}%` }}
                          title={`Invoiced, ${formatMonthLabel(m.monthIso)}: ${(m.invoicedCents / 100).toFixed(2)}`}
                        />
                        <div
                          className={`${styles.bar} ${styles.barCollected}`}
                          style={{ height: `${Math.round((m.collectedCents / maxMonthCents) * 100)}%` }}
                          title={`Collected, ${formatMonthLabel(m.monthIso)}: ${(m.collectedCents / 100).toFixed(2)}`}
                        />
                      </div>
                      <span className={styles.barLabel}>{formatMonthLabel(m.monthIso)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </Card>
      </section>

      <section className={shared.section}>
        <h2 className={shared.sectionTitle}>Outstanding by client</h2>
        <Card>
          {/* Receivables are a snapshot of what's owed as of today — they are
              NOT limited to the period selected above (a debt raised outside
              the window is still owed). Called out explicitly so the number
              doesn't look inconsistent with the rest of the page. */}
          <p className={styles.asOfNote}>
            As of today — not limited to the selected period.
          </p>
          <div className={styles.receivablesTotals}>
            <div className={styles.receivablesTotal}>
              <span className={shared.statLabel}>Total outstanding</span>
              <MoneyText cents={reports.receivables.totalOutstandingCents} size={18} />
            </div>
            <div className={styles.receivablesTotal}>
              <span className={shared.statLabel}>Total overdue</span>
              <MoneyText cents={reports.receivables.totalOverdueCents} size={18} tone="critical" />
            </div>
          </div>
          {reports.receivables.outstandingByClient.length === 0 ? (
            <div className={shared.empty}>Nothing outstanding right now.</div>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Outstanding</th>
                    <th>Overdue</th>
                    <th>Invoices</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.receivables.outstandingByClient.map((c) => (
                    <tr key={c.clientId ?? "no-client"}>
                      <td>{c.clientName}</td>
                      <td>
                        <MoneyText cents={c.outstandingCents} size={13.5} />
                      </td>
                      <td>
                        {c.overdueCents > 0 ? (
                          <MoneyText cents={c.overdueCents} size={13.5} tone="critical" />
                        ) : (
                          <span className={shared.rowSub}>&mdash;</span>
                        )}
                      </td>
                      <td>{c.invoiceCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      <section className={shared.section}>
        <h2 className={shared.sectionTitle}>Projects</h2>
        <div className={shared.grid2}>
          <Card>
            <div className={shared.statLabel}>Jobs created</div>
            <span className="jq-numeral" style={{ fontSize: 24, fontWeight: 800 }}>
              {reports.projects.projectsCreated}
            </span>
            <div className={styles.stageList}>
              {PROJECT_STAGES.map((stage) => {
                const pill = projectStagePill(stage);
                return (
                  <div key={stage} className={styles.stageRow}>
                    <StatusPill label={pill.label} kind={pill.kind} variant={pill.variant} />
                    <span className={styles.stageCount}>{reports.projects.projectsByStage[stage]}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <div className={shared.statLabel}>Top clients by jobs</div>
            <div className={shared.list} style={{ marginTop: 14 }}>
              {reports.projects.topClientsByProjects.length === 0 ? (
                <div className={shared.empty}>No jobs created in this period.</div>
              ) : (
                reports.projects.topClientsByProjects.map((c) => (
                  <div key={c.clientId ?? "no-client"} className={shared.row}>
                    <span className={shared.rowTitle}>{c.clientName}</span>
                    <span className={shared.rowSub}>
                      {c.projectCount} job{c.projectCount === 1 ? "" : "s"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
