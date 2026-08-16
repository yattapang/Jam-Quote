"use client";

import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import DeleteRowButton from "@/components/ui/DeleteRowButton";
import EditAssemblyButton from "./EditAssemblyButton";
import type { Job, LabourRate, MaterialFavourite } from "@/lib/types";
import shared from "../shared.module.css";

/**
 * Job-type ("job") library list — name, unit, component count and the
 * server-computed unit cost, mirroring MaterialsListClient's row shape.
 * Materials/labour rates are passed through so Edit can re-populate the
 * component builder's pickers without an extra fetch.
 */
export default function AssembliesListClient({
  assemblies,
  materials,
  labourRates,
}: {
  assemblies: Job[];
  materials: MaterialFavourite[];
  labourRates: LabourRate[];
}) {
  return (
    <Card>
      {assemblies.length === 0 ? (
        <span className={shared.empty}>
          No job types yet — build one from your material and labour libraries to quote it in one click.
        </span>
      ) : (
        <div className={shared.list}>
          {assemblies.map((a) => (
            <div key={a.id} className={shared.row}>
              <div className={shared.rowMain}>
                <span className={shared.rowTitle}>{a.name}</span>
                <span className={shared.rowSub}>
                  per {a.unit} · {a.components.length} {a.components.length === 1 ? "component" : "components"}
                  {a.markupPct > 0 ? ` · ${a.markupPct}% markup` : ""}
                </span>
              </div>
              <div className={shared.rowRight}>
                <MoneyText cents={a.unitCostCents} />
                <div style={{ display: "flex", gap: 8 }}>
                  <EditAssemblyButton job={a} materials={materials} labourRates={labourRates} />
                  <DeleteRowButton
                    kind="job"
                    id={a.id}
                    confirmMessage={`Delete ${a.name}? This can't be undone.`}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
