import Card from "@/components/ui/Card";
import shared from "../shared.module.css";

export const metadata = { title: "Invoices · JamQuote" };

export default function InvoicesPage() {
  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>Billing</span>
          <h1 className={shared.title}>Invoices</h1>
          <span className={shared.subtitle}>Invoicing &amp; payments</span>
        </div>
      </header>
      <Card>
        <div className={shared.empty}>
          Invoicing, WiPay card checkout, and payment recording are part of Phase 2 —
          screen coming soon.
        </div>
      </Card>
    </div>
  );
}
