import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import DeleteRowButton from "@/components/ui/DeleteRowButton";
import { getEquipment } from "@/lib/api-server";
import AddEquipmentButton from "./AddEquipmentButton";
import EditEquipmentButton from "./EditEquipmentButton";
import shared from "../shared.module.css";

export const metadata = { title: "Equipment · JamQuote" };

const RATE_UNIT_LABEL: Record<string, string> = {
  HOUR: "hour",
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
  JOB: "job",
  UNIT: "unit",
};

export default async function EquipmentPage() {
  const equipment = await getEquipment();

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>Catalog</span>
          <h1 className={shared.title}>Equipment</h1>
          <span className={shared.subtitle}>
            {equipment.length} saved {equipment.length === 1 ? "item" : "items"} for reuse in quotes
          </span>
        </div>
        <div className={shared.headerActions}>
          <AddEquipmentButton />
        </div>
      </header>

      <Card>
        {equipment.length === 0 ? (
          <span className={shared.empty}>
            No saved equipment yet — add the mixer, the scaffold or the truck once, and put it on a
            quote at the right rate every time.
          </span>
        ) : (
          <div className={shared.list}>
            {equipment.map((e) => (
              <div key={e.id} className={shared.row}>
                <div className={shared.rowMain}>
                  <span className={shared.rowTitle}>{e.name}</span>
                  {/* Owned vs hired is the first thing worth knowing about a
                      piece of kit: hired has someone to ring, owned does not. */}
                  <span className={shared.rowSub}>
                    {e.owned
                      ? "Owned"
                      : [e.vendor, e.vendorPhone].filter(Boolean).join(" · ") || "Hired"}
                  </span>
                </div>
                <div className={shared.rowRight}>
                  <span>
                    <MoneyText cents={e.rateCents} /> /{" "}
                    {RATE_UNIT_LABEL[e.rateUnit] ?? e.rateUnit.toLowerCase()}
                  </span>
                  <EditEquipmentButton item={e} />
                  <DeleteRowButton
                    kind="equipment"
                    id={e.id}
                    confirmMessage={`Delete ${e.name}? This can't be undone.`}
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
