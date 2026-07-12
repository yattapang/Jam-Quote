import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import DeleteRowButton from "@/components/ui/DeleteRowButton";
import { getMaterialFavourites } from "@/lib/api-client";
import AddMaterialButton from "./AddMaterialButton";
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

      <Card>
        {materials.length === 0 ? (
          <span className={shared.empty}>
            No saved materials yet — add one here, or save a quote line with the ★ button in the quote builder.
          </span>
        ) : (
          <div className={shared.list}>
            {materials.map((m) => (
              <div key={m.id} className={shared.row}>
                <div className={shared.rowMain}>
                  <span className={shared.rowTitle}>{m.name}</span>
                  {m.unit && <span className={shared.rowSub}>{m.unit}</span>}
                </div>
                <div className={shared.rowRight}>
                  <MoneyText cents={m.priceCents} />
                  <DeleteRowButton
                    kind="material"
                    id={m.id}
                    confirmMessage={`Delete ${m.name}? This can't be undone.`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
