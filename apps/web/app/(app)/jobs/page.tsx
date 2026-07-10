import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import MoneyText from "@/components/ui/MoneyText";
import { jobs } from "@/lib/mock-data";
import shared from "../shared.module.css";

export const metadata = { title: "Jobs · JamQuote" };

export default function JobsPage() {
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
          {jobs.map((job) => (
            <div key={job.id} className={shared.row}>
              <div className={shared.rowMain}>
                <span className={shared.rowTitle}>{job.name}</span>
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
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
