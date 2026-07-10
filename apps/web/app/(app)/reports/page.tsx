import Card from "@/components/ui/Card";
import shared from "../shared.module.css";

export const metadata = { title: "Reports · JamQuote" };

export default function ReportsPage() {
  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>Insights</span>
          <h1 className={shared.title}>Reports</h1>
          <span className={shared.subtitle}>Pipeline, win rate &amp; revenue reporting</span>
        </div>
      </header>
      <Card>
        <div className={shared.empty}>Reporting dashboards are part of Phase 2 — coming soon.</div>
      </Card>
    </div>
  );
}
