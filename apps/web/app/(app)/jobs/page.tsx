import { getJobs, getLabourRates, getMaterialFavourites } from "@/lib/api-server";
import AddJobButton from "./AddJobButton";
import JobsListClient from "./JobsListClient";
import shared from "../shared.module.css";

export const metadata = { title: "Jobs · JamQuote" };

export default async function AssembliesPage() {
  const [jobs, materials, labourRates] = await Promise.all([
    getJobs(),
    getMaterialFavourites(),
    getLabourRates(),
  ]);

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>Job library</span>
          <h1 className={shared.title}>Jobs</h1>
          <span className={shared.subtitle}>
            {jobs.length} saved {jobs.length === 1 ? "job" : "jobs"} you can price by the unit —
            built from your material and labour libraries
          </span>
        </div>
        <div className={shared.headerActions}>
          <AddJobButton materials={materials} labourRates={labourRates} />
        </div>
      </header>

      <JobsListClient jobs={jobs} materials={materials} labourRates={labourRates} />
    </div>
  );
}
