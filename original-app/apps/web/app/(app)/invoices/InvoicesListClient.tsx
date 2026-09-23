"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import StatusPill from "@/components/ui/StatusPill";
import MoneyText from "@/components/ui/MoneyText";
import { invoiceStatusPill, INVOICE_STATUS_FILTERS } from "@/lib/status";
import type { Invoice } from "@/lib/api-client";
import type { InvoiceStatus } from "@jamquote/core";
import shared from "../shared.module.css";
import NewInvoiceButton from "./NewInvoiceButton";
import type { ClientOption } from "@/components/forms/types";

export default function InvoicesListClient({
  invoices,
  clientNames,
  clients,
}: {
  invoices: Invoice[];
  clientNames: Record<string, string>;
  /** For the New invoice picker — InvoiceBuilder has no client field, so the
   * client is chosen at creation time. */
  clients: ClientOption[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<InvoiceStatus | "ALL">("ALL");
  const visible = filter === "ALL" ? invoices : invoices.filter((i) => i.status === filter);

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>Billing</span>
          <h1 className={shared.title}>Invoices</h1>
          <span className={shared.subtitle}>{invoices.length} invoices in your book</span>
        </div>
        <div className={shared.headerActions}>
          <NewInvoiceButton clients={clients} />
        </div>
      </header>

      <div className={shared.filters}>
        {INVOICE_STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            className={filter === f.value ? shared.chipActive : shared.chip}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        <div className={shared.list}>
          {visible.length === 0 && <div className={shared.empty}>No invoices with this status.</div>}
          {visible.map((inv) => {
            const pill = invoiceStatusPill(inv.status);
            const openInvoice = () => router.push(`/invoices/${inv.id}`);
            return (
              <div
                key={inv.id}
                className={shared.row}
                role="link"
                tabIndex={0}
                onClick={openInvoice}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openInvoice();
                }}
                style={{ cursor: "pointer" }}
              >
                <div className={shared.rowMain}>
                  <span className={shared.rowTitle}>
                    {inv.num}
                    <StatusPill label={pill.label} kind={pill.kind} variant={pill.variant} />
                  </span>
                  <span className={shared.rowSub}>
                    {(inv.clientId && clientNames[inv.clientId]) ?? "Unknown client"}
                    {inv.dueDateLabel ? ` · ${inv.dueDateLabel}` : ""}
                  </span>
                </div>
                <div className={shared.rowRight}>
                  <MoneyText cents={inv.totalCents ?? 0} />
                  <span className={shared.rowSub}>{inv.createdLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
