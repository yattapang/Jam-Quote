import Card from "@/components/ui/Card";
import { getJurisdiction, supportedJurisdictions } from "@jamquote/core";
import styles from "./admin.module.css";

// Platform-level mock data (tenants across the whole product, not one business).
const tenants = [
  { name: "Blackwood Construction & Masonry", parish: "St. Catherine", plan: "Pro", trn: "102-458-963", status: "Active" },
  { name: "Island Electrical Services", parish: "Kingston", plan: "Core", trn: "114-902-337", status: "Active" },
  { name: "Reid & Sons Plumbing", parish: "St. James", plan: "Starter", trn: "128-771-004", status: "Trial" },
  { name: "Portmore Tiling Co.", parish: "St. Catherine", plan: "Free", trn: "—", status: "Active" },
];

const suppliers = [
  { name: "Kirk's Hardware", parish: "St. Catherine", freshness: "Updated 2h ago", partner: true },
  { name: "H&L True Value", parish: "Kingston", freshness: "Updated yesterday", partner: true },
  { name: "Graham's Building Supplies", parish: "Manchester", freshness: "Cached · 4 days", partner: false },
];

const regulatoryQueue = [
  { title: "GCT threshold update — Aug 1, 2026", source: "TAJ / Gazette", status: "Needs review" },
  { title: "Minimum wage adjustment", source: "MLSS", status: "Monitoring" },
];

export default function AdminPage() {
  const jm = getJurisdiction("JM");

  return (
    <>
      <div>
        <h1 className={styles.title}>Platform overview</h1>
        <p className={styles.subtitle}>
          Internal console for JamQuote staff — tenants, suppliers, and the human-verified
          jurisdiction rule-packs.
        </p>
      </div>

      <section className={styles.statGrid}>
        <Card>
          <div className={styles.statLabel}>Businesses</div>
          <div className={styles.statValue}>128</div>
        </Card>
        <Card>
          <div className={styles.statLabel}>Active subscriptions</div>
          <div className={styles.statValue}>94</div>
        </Card>
        <Card>
          <div className={styles.statLabel}>Suppliers tracked</div>
          <div className={styles.statValue}>{suppliers.length}</div>
        </Card>
        <Card>
          <div className={styles.statLabel}>Jurisdiction rule-packs</div>
          <div className={styles.statValue}>{supportedJurisdictions().length}</div>
        </Card>
      </section>

      {/* The credibility differentiator: verified-per-country rule-packs. */}
      <section>
        <h2 className={styles.sectionTitle}>Jurisdiction rule-pack — {jm.countryName}</h2>
        <Card>
          <div className={styles.kv}>
            <span className={styles.kvKey}>Rule-pack version</span>
            <span>
              {jm.rulePackVersion}{" "}
              <span className={styles.pill}>Verified {jm.verifiedAsOf}</span>
            </span>
            <span className={styles.kvKey}>Currency</span>
            <span>{jm.currency.code} ({jm.currency.symbol})</span>
            <span className={styles.kvKey}>Consumption tax</span>
            <span>
              {jm.taxLabel} — {jm.taxLongName} · standard {jm.defaultTaxRatePct}%
            </span>
            <span className={styles.kvKey}>Taxpayer ID</span>
            <span>{jm.taxpayerId.label}</span>
            <span className={styles.kvKey}>{jm.regionLabel}es</span>
            <span>{jm.regions.length} regions</span>
            <span className={styles.kvKey}>Payment rails</span>
            <span>{jm.paymentProviders.map((p) => p.label).join(", ")}</span>
            <span className={styles.kvKey}>Payroll statutory</span>
            <span>
              {jm.statutory.map((s) => s.code).join(", ")}{" "}
              <span className={styles.pillWarn}>rates pending verification</span>
            </span>
            <span className={styles.kvKey}>Sources</span>
            <span>{jm.sources.join(" · ")}</span>
          </div>
        </Card>
      </section>

      <section>
        <h2 className={styles.sectionTitle}>Businesses (tenants)</h2>
        <Card>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Parish</th>
                  <th>Plan</th>
                  <th>TRN</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.name}>
                    <td>{t.name}</td>
                    <td>{t.parish}</td>
                    <td>{t.plan}</td>
                    <td>{t.trn}</td>
                    <td>
                      <span className={t.status === "Active" ? styles.pill : styles.pillWarn}>{t.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section>
        <h2 className={styles.sectionTitle}>Supplier price index</h2>
        <Card>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Parish</th>
                  <th>Price freshness</th>
                  <th>Partner</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td>{s.parish}</td>
                    <td>{s.freshness}</td>
                    <td>{s.partner ? <span className={styles.pill}>Partner</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section>
        <h2 className={styles.sectionTitle}>Regulatory review queue</h2>
        <Card>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Update</th>
                  <th>Source</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {regulatoryQueue.map((r) => (
                  <tr key={r.title}>
                    <td>{r.title}</td>
                    <td>{r.source}</td>
                    <td>
                      <span className={r.status === "Needs review" ? styles.pillWarn : styles.pill}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <p className={styles.note}>
        Starter console (read-only, mock data). It reads the real jurisdiction rule-pack from
        @jamquote/core; tenants/suppliers are placeholders until the admin API lands.
      </p>
    </>
  );
}
