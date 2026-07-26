import { getMaterialFavourites } from "@/lib/api-server";
import AddMaterialButton from "./AddMaterialButton";
import MaterialsListClient from "./MaterialsListClient";
import shared from "../shared.module.css";

export const metadata = { title: "Materials · JamQuote" };

export default async function MaterialsPage() {
  const materials = await getMaterialFavourites();

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>Catalog</span>
          <h1 className={shared.title}>Materials</h1>
          <span className={shared.subtitle}>
            {materials.length} saved {materials.length === 1 ? "material" : "materials"} for reuse in quotes
          </span>
        </div>
        <div className={shared.headerActions}>
          <AddMaterialButton />
        </div>
      </header>

      <MaterialsListClient materials={materials} />
    </div>
  );
}
