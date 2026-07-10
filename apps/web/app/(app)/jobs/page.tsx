import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import StatusPill from "@/components/ui/StatusPill";
import MoneyText from "@/components/ui/MoneyText";
import { quoteStatusPill } from "@/lib/status";
import { getQuoteTotals } from "@/lib/quote-totals";
import { quotes, findClient } from "@/lib/mock-data";
import type { Quote } from "@/lib/types";
import shared from "../shared.module.css";

export const metadata = { title: "Jobs · JamQuote" };

// There is no standalone Job record in the mock layer yet — a job is the work a
// quote is for. Derive the jobs list from quotes grouped by (client, jobLabel).
interface DerivedJob {
  key: string;
  clientId: string;
  jobLabel: string;
  quotes: Quote[];
}

function deriveJobs(): DerivedJob[] {
  const byKey = new Map<string, DerivedJob>();
  for (const q of quotes) {
    const key = `${q.clientId}::${q.jobLabel}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.quotes.push(q);
    } else {
      byKey.set(key, { key, clientId: q.clientId, jobLabel: q.jobLabel, quotes: [q] });
    }
  }
  return [...byKey.values()];
}

export default function JobsPage() {
  const jobs = deriveJobs();

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>Work</span>
          <h1 className={shared.title}>Jobs</h1>
          <span className={shared.subtitle}>{jobs.length} active jobs</span>
        </div>
        <div className={shared.headerActions}>
          <Button variant="primary">New job</Button>
        </div>
      </header>

      <Card>
        <div className={shared.list}>
          {jobs.map((job) => {
            const client = findClient(job.clientId);
            // Quotes are ordered newest-first in the mock data.
            const latest = job.quotes[0];
            const pill = latest ? quoteStatusPill(latest.status) : undefined;
            const value = latest ? getQuoteTotals(latest).totalCents : 0;
            return (
              <div key={job.key} className={shared.row}>
                <div className={shared.rowMain}>
                  <span className={shared.rowTitle}>
                    {job.jobLabel}
                    {pill && <StatusPill label={pill.label} kind={pill.kind} variant={pill.variant} />}
                  </span>
                  <span className={shared.rowSub}>
                    {client?.name ?? "Unknown client"} · {job.quotes.length}{" "}
                    {job.quotes.length === 1 ? "quote" : "quotes"}
                  </span>
                </div>
                <div className={shared.rowRight}>
                  <MoneyText cents={value} />
                  <span className={shared.rowSub}>Latest quote</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
