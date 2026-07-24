import { notFound } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import StatusPill from "@/components/ui/StatusPill";
import DeleteRowButton from "@/components/ui/DeleteRowButton";
import { quoteStatusPill } from "@/lib/status";
import { getJob, getClients, getQuotes } from "@/lib/api-server";
import EditJobButton from "./EditJobButton";
import shared from "../../shared.module.css";

export const metadata = { title: "Job · JamQuote" };

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const job = await getJob(params.id);
  if (!job) notFound();

  const [clients, quotes] = await Promise.all([
    getClients(),
    getQuotes().then((qs) => qs.filter((q) => q.jobId === job.id)),
  ]);
  const totalCents = quotes.reduce((sum, q) => sum + (q.totalCents ?? 0), 0);

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>
            <Link href="/jobs" style={{ color: "inherit" }}>
              ← Jobs
            </Link>
          </span>
          <h1 className={shared.title}>{job.name}</h1>
          <span className={shared.subtitle}>
            {job.clientName} · {job.stage}
          </span>
        </div>
        <div className={shared.headerActions}>
          <EditJobButton job={job} clients={clients.map((c) => ({ id: c.id, name: c.name }))} />
          <DeleteRowButton
            kind="job"
            id={job.id}
            confirmMessage={`Delete ${job.name}? This can't be undone.`}
            redirectTo="/jobs"
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
              {quotes.length === 0 && <div className={shared.empty}>No quotes for this job yet.</div>}
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
                        <span className={shared.rowSub}>{q.createdLabel}</span>
                      </div>
                      <div className={shared.rowRight}>
                        <MoneyText cents={q.totalCents ?? 0} />
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
                <span>Client</span>
                <span>{job.clientName}</span>
              </div>
              <div className={shared.totalRowMuted}>
                <span>Address</span>
                <span>{job.addressLine || "—"}</span>
              </div>
              <div className={shared.totalRowMuted}>
                <span>Parish</span>
                <span>{job.parish || "—"}</span>
              </div>
              <div className={shared.totalRowMuted}>
                <span>Stage</span>
                <span>{job.stage || "—"}</span>
              </div>
              <div className={shared.totalRowMuted}>
                <span>Progress</span>
                <span>{job.progressPct}%</span>
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
