import Link from "next/link";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import DeleteRowButton from "@/components/ui/DeleteRowButton";
import { getJobs, getClients } from "@/lib/api-client";
import AddJobButton from "./AddJobButton";
import shared from "../shared.module.css";

export const metadata = { title: "Jobs · JamQuote" };

export default async function JobsPage() {
  const [jobs, clients] = await Promise.all([getJobs(), getClients()]);
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
          {jobs.map((job) => (
            <div key={job.id} className={shared.row}>
              <div className={shared.rowMain}>
                <Link
                  href={`/jobs/${job.id}`}
                  className={shared.rowTitle}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  {job.name}
                </Link>
                <span className={shared.rowSub}>
                  {job.clientName} · {job.addressLine}
                </span>
                <span className={shared.rowSub}>{job.stage}</span>
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
          ))}
        </div>
      </Card>
    </div>
  );
}
