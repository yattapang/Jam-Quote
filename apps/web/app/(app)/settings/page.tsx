import Card from "@/components/ui/Card";
import { businessProfile } from "@/lib/mock-data";
import { getBusiness, getBillingStatus, getBillingPlans, getTrades } from "@/lib/api-server";
import EditBusinessButton from "./EditBusinessButton";
import BrandingSection from "./BrandingSection";
import BillingCard from "./BillingCard";
import shared from "../shared.module.css";
import { formatAddress } from "@/lib/format-address";

export const metadata = { title: "Settings · JamQuote" };

export default async function SettingsPage() {
  const [business, billingStatus, billingPlans, trades] = await Promise.all([
    getBusiness(),
    getBillingStatus(),
    getBillingPlans(),
    getTrades(),
  ]);
  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>Account</span>
          <h1 className={shared.title}>Settings</h1>
          <span className={shared.subtitle}>Business profile &amp; connections</span>
        </div>
        <div className={shared.headerActions}>
          <EditBusinessButton business={business} trades={trades} />
        </div>
      </header>

      <BrandingSection />

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
            <span>Town / parish</span>
            <span>{formatAddress([business.town, business.parish]) || "—"}</span>
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

      <BillingCard status={billingStatus} plans={billingPlans} />
    </div>
  );
}
