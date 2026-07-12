import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import { businessProfile } from "@/lib/mock-data";
import { getBusiness } from "@/lib/api-client";
import EditBusinessButton from "./EditBusinessButton";
import shared from "../shared.module.css";

export const metadata = { title: "Settings · JamQuote" };

export default async function SettingsPage() {
  const business = await getBusiness();
  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>Account</span>
          <h1 className={shared.title}>Settings</h1>
          <span className={shared.subtitle}>Business profile &amp; connections</span>
        </div>
        <div className={shared.headerActions}>
          <EditBusinessButton business={business} />
        </div>
      </header>

      <Card>
        <div className={shared.statLabel}>Business profile</div>
        <div className={shared.list}>
          <div className={shared.totalRowMuted}>
            <span>Name</span>
            <span>{business.name}</span>
          </div>
          <div className={shared.totalRowMuted}>
            <span>TRN</span>
            <span>{business.trn || "—"}</span>
          </div>
          <div className={shared.totalRowMuted}>
            <span>Parish</span>
            <span>{business.parish || "—"}</span>
          </div>
          <div className={shared.totalRowMuted}>
            <span>Trade type</span>
            <span>{business.tradeType || "—"}</span>
          </div>
          <div className={shared.totalRowMuted}>
            <span>Address</span>
            <span>{business.addressLine || "—"}</span>
          </div>
          <div className={shared.totalRowMuted}>
            <span>Default GCT rate</span>
            <span>{business.defaultGctRatePct}%</span>
          </div>
          {/* WhatsApp/email connection status isn't part of the Business
              persistence model yet (WhatsApp Business Cloud API is Phase 2
              per CLAUDE.md) — these two rows stay on the fixture until that
              lands; every field above this comment is now live. */}
          <div className={shared.totalRowMuted}>
            <span>WhatsApp</span>
            <span>{businessProfile.whatsapp.label}</span>
          </div>
          <div className={shared.totalRowMuted}>
            <span>Email channel</span>
            <span>{businessProfile.emailChannel.label}</span>
          </div>
        </div>
      </Card>

      {/* Subscription/billing isn't part of the Business persistence model
          yet (Phase 3 per CLAUDE.md) — the plan card stays on the fixture. */}
      <Card>
        <div className={shared.statLabel}>{businessProfile.plan.name}</div>
        <div className={shared.totalRow}>
          <span>{businessProfile.plan.features}</span>
          <MoneyText cents={businessProfile.plan.priceCents} tone="accent" />
        </div>
        <div className={shared.statHint}>{businessProfile.plan.renewsLabel}</div>
      </Card>
    </div>
  );
}
