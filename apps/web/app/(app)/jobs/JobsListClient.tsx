"use client";

import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import DeleteRowButton from "@/components/ui/DeleteRowButton";
import EditJobButton from "./EditJobButton";
import type { Trade } from "@/lib/api-client";
import type { Job, LabourRate, MaterialFavourite } from "@/lib/types";
import shared from "../shared.module.css";

/**
 * Job-type ("job") library list — name, unit, component count and the
 * server-computed unit cost, mirroring MaterialsListClient's row shape.
 * Materials/labour rates are passed through so Edit can re-populate the
 * component builder's pickers without an extra fetch.
 */
export default function JobsListClient({
  jobs,
  materials,
  labourRates,
  trades,
}: {
  jobs: Job[];
  materials: MaterialFavourite[];
  labourRates: LabourRate[];
  trades: Trade[];
}) {
  // The empty state is where this feature is least obvious and most worth
  // explaining: the point is that you build the job ONCE, with its paint and
  // its labour inside, and afterwards quote it by the square foot. A bare
  // "nothing here yet" leaves a contractor to infer that from a blank screen,
  // so it shows the shape of a real job in a trade they recognise.
  return (
    <Card>
      {jobs.length === 0 ? (
        <div className={shared.empty}>
          <p style={{ margin: "0 0 8px", fontWeight: 600 }}>No saved jobs yet.</p>
          <p style={{ margin: "0 0 8px" }}>
            A job is work you sell over and over, priced by the unit. Say you paint interior
            walls: add the paint from your materials and the painter from your labour rates, set
            the unit to <strong>sq ft</strong>, and JamQuote works out the rate.
          </p>
          <p style={{ margin: 0 }}>
            Next time that work comes up, put the job on a quote, type the square footage, and the
            price is done — as a single line, or itemised so the client sees the breakdown.
          </p>
        </div>
      ) : (
        <div className={shared.list}>
          {jobs.map((a) => (
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
                  <EditJobButton job={a} materials={materials} labourRates={labourRates}
            trades={trades} />
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
