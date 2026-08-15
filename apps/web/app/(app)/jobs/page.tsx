import Link from "next/link";
import { projectStageTracksProgress } from "@jamquote/core";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import StatusPill from "@/components/ui/StatusPill";
import DeleteRowButton from "@/components/ui/DeleteRowButton";
import { projectStagePill } from "@/lib/status";
import { getProjects, getClients } from "@/lib/api-server";
import AddJobButton from "./AddJobButton";
import shared from "../shared.module.css";

export const metadata = { title: "Jobs · JamQuote" };

export default async function JobsPage() {
  const [jobs, clients] = await Promise.all([getProjects(), getClients()]);
  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>Work</span>
          <h1 className={shared.title}>Jobs</h1>
          <span className={shared.subtitle}>{jobs.length} active jobs</span>
        </div>
        <div className={shared.headerActions}>
          <AddJobButton clients={clients.map((c) => ({ id: c.id, name: c.name }))} />
        </div>
      </header>

      <Card>
        <div className={shared.list}>
          {jobs.length === 0 && (
            <div className={shared.empty}>No jobs yet — add one to get started.</div>
          )}
          {jobs.map((job) => {
            const pill = projectStagePill(job.stage);
            return (
              <div key={job.id} className={shared.row}>
                <div className={shared.rowMain}>
                  {/* Title + stage pill, the same row shape the quotes and
                      invoices lists use — the stage used to be plain grey text
                      here, which read as an afterthought rather than status. */}
                  <span className={shared.rowTitle}>
                    <Link href={`/jobs/${job.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                      {job.name}
                    </Link>
                    <StatusPill label={pill.label} kind={pill.kind} variant={pill.variant} />
                  </span>
                  <span className={shared.rowSub}>
                    {job.clientName} · {job.addressLine}
                  </span>
                  {/* Progress belongs on the LIST: someone checking several
                      jobs should not have to open each one. Muted text in the
                      existing sub-line rather than a bar — no other list screen
                      draws one, and an empty track at 0% reads as broken when 0
                      is simply where every job starts. Hidden at stages where
                      the number would mislead (projectStageTracksProgress). */}
                  {projectStageTracksProgress(job.stage) && (
                    <span className={shared.rowSub}>{job.progressPct}% complete</span>
                  )}
                </div>
                <div className={shared.rowRight}>
                  <MoneyText cents={job.valueCents} />
                  <span className={shared.rowSub}>
                    {job.quoteCount} {job.quoteCount === 1 ? "quote" : "quotes"}
                  </span>
                  <DeleteRowButton
                    kind="job"
                    id={job.id}
                    confirmMessage={`Delete ${job.name}? This can't be undone.`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
