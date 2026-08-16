import { getJobs, getLabourRates, getMaterialFavourites } from "@/lib/api-server";
import AddAssemblyButton from "./AddAssemblyButton";
import AssembliesListClient from "./AssembliesListClient";
import shared from "../shared.module.css";

export const metadata = { title: "Job types · JamQuote" };

export default async function AssembliesPage() {
  const [assemblies, materials, labourRates] = await Promise.all([
    getJobs(),
    getMaterialFavourites(),
    getLabourRates(),
  ]);

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>Catalog</span>
          <h1 className={shared.title}>Job types</h1>
          <span className={shared.subtitle}>
            {assemblies.length} saved {assemblies.length === 1 ? "job type" : "job types"} built from your
            material + labour libraries
          </span>
        </div>
        <div className={shared.headerActions}>
          <AddAssemblyButton materials={materials} labourRates={labourRates} />
        </div>
      </header>

      <AssembliesListClient assemblies={assemblies} materials={materials} labourRates={labourRates} />
    </div>
  );
}
