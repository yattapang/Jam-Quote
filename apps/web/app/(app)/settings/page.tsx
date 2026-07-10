import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import { businessProfile } from "@/lib/mock-data";
import shared from "../shared.module.css";

export const metadata = { title: "Settings · JamQuote" };

export default function SettingsPage() {
  const b = businessProfile;
  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>Account</span>
          <h1 className={shared.title}>Settings</h1>
          <span className={shared.subtitle}>Business profile &amp; connections</span>
        </div>
      </header>

      <Card>
        <div className={shared.statLabel}>Business profile</div>
        <div className={shared.list}>
          <div className={shared.totalRowMuted}>
            <span>Name</span>
            <span>{b.name}</span>
          </div>
          <div className={shared.totalRowMuted}>
            <span>TRN</span>
            <span>{b.trn}</span>
          </div>
          <div className={shared.totalRowMuted}>
            <span>Parish</span>
            <span>{b.parish}</span>
          </div>
          <div className={shared.totalRowMuted}>
            <span>Default GCT rate</span>
            <span>{b.defaultGctRatePct}%</span>
          </div>
          <div className={shared.totalRowMuted}>
            <span>WhatsApp</span>
            <span>{b.whatsapp.label}</span>
          </div>
          <div className={shared.totalRowMuted}>
            <span>Email channel</span>
            <span>{b.emailChannel.label}</span>
          </div>
        </div>
      </Card>

      <Card>
        <div className={shared.statLabel}>{b.plan.name}</div>
        <div className={shared.totalRow}>
          <span>{b.plan.features}</span>
          <MoneyText cents={b.plan.priceCents} tone="accent" />
        </div>
        <div className={shared.statHint}>{b.plan.renewsLabel}</div>
      </Card>
    </div>
  );
}
