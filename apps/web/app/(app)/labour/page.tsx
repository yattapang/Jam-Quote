import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import DeleteRowButton from "@/components/ui/DeleteRowButton";
import { getLabourRates, getTrades } from "@/lib/api-server";
import AddLabourRateButton from "./AddLabourRateButton";
import EditLabourRateButton from "./EditLabourRateButton";
import shared from "../shared.module.css";

export const metadata = { title: "Labour · JamQuote" };

const RATE_UNIT_LABEL: Record<string, string> = {
  HOUR: "hour",
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
  JOB: "job",
  UNIT: "unit",
};

export default async function LabourPage() {
  const [labourRates, trades] = await Promise.all([getLabourRates(), getTrades()]);

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>Catalog</span>
          <h1 className={shared.title}>Labour rate book</h1>
          <span className={shared.subtitle}>
            {labourRates.length} saved {labourRates.length === 1 ? "rate" : "rates"} for reuse in quotes
          </span>
        </div>
        <div className={shared.headerActions}>
          <AddLabourRateButton trades={trades} />
        </div>
      </header>

      <Card>
        {labourRates.length === 0 ? (
          <span className={shared.empty}>
            No saved labour rates yet — add one here to reuse trades and rates across quotes.
          </span>
        ) : (
          <div className={shared.list}>
            {labourRates.map((r) => (
              <div key={r.id} className={shared.row}>
                <div className={shared.rowMain}>
                  <span className={shared.rowTitle}>{r.trade}</span>
                  {r.skillTier && <span className={shared.rowSub}>{r.skillTier}</span>}
                </div>
                <div className={shared.rowRight}>
                  <span>
                    <MoneyText cents={r.rateCents} /> / {r.unitLabel ?? RATE_UNIT_LABEL[r.rateUnit] ?? r.rateUnit.toLowerCase()}
                  </span>
                  <EditLabourRateButton rate={r} trades={trades} />
                  <DeleteRowButton
                    kind="labourRate"
                    id={r.id}
                    confirmMessage={`Delete this ${r.trade} rate? This can't be undone.`}
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
