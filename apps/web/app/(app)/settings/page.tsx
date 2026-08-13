import Card from "@/components/ui/Card";
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
        </div>
      </Card>

      {/* Channel connections. The Connection model exists in the schema but
          nothing writes it — there is no connect flow, no OAuth, no webhook —
          so there is no state to read and this card is deliberately static.
          It previously rendered a fixture that said "Connected · 876 555 0142",
          which a signed-in contractor had every reason to read as their own
          linked number. Wire this to a real read once messaging ships (Phase 2:
          WhatsApp Business Cloud API, per CLAUDE.md). */}
      <Card>
        <div className={shared.statLabel}>Sending channels</div>
        <div className={shared.list}>
          <div className={shared.totalRowMuted}>
            <span>WhatsApp</span>
            <span>Not available yet</span>
          </div>
          <div className={shared.totalRowMuted}>
            <span>Email</span>
            <span>Not available yet</span>
          </div>
          <div className={shared.statHint}>
            Sending quotes straight from JamQuote over WhatsApp or email is coming in a later
            release. For now, share a quote using the buttons on the quote itself.
          </div>
        </div>
      </Card>

      <BillingCard status={billingStatus} plans={billingPlans} />
    </div>
  );
}
