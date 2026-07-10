"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import StatusPill from "@/components/ui/StatusPill";
import MoneyText from "@/components/ui/MoneyText";
import { quoteStatusPill, QUOTE_STATUS_FILTERS } from "@/lib/status";
import { getQuoteTotals } from "@/lib/quote-totals";
import { quotes, findClient } from "@/lib/mock-data";
import type { QuoteStatus } from "@jamquote/core";
import shared from "../shared.module.css";

export default function QuotesPage() {
  const [filter, setFilter] = useState<QuoteStatus | "ALL">("ALL");

  const visible = filter === "ALL" ? quotes : quotes.filter((q) => q.status === filter);

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>Estimating</span>
          <h1 className={shared.title}>Quotes</h1>
          <span className={shared.subtitle}>{quotes.length} quotes in your book</span>
        </div>
        <div className={shared.headerActions}>
          <Button variant="primary">New quote</Button>
        </div>
      </header>

      <div className={shared.filters}>
        {QUOTE_STATUS_FILTERS.map((f) => (
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
          {visible.length === 0 && <div className={shared.empty}>No quotes with this status.</div>}
          {visible.map((q) => {
            const client = findClient(q.clientId);
            const totals = getQuoteTotals(q);
            const pill = quoteStatusPill(q.status);
            return (
              <a key={q.id} href={`/quotes/${q.id}`} className={shared.row} style={{ textDecoration: "none" }}>
                <div className={shared.rowMain}>
                  <span className={shared.rowTitle}>
                    {q.num}
                    <StatusPill label={pill.label} kind={pill.kind} variant={pill.variant} />
                  </span>
                  <span className={shared.rowSub}>
                    {client?.name ?? "Unknown client"} · {q.jobLabel}
                  </span>
                </div>
                <div className={shared.rowRight}>
                  <MoneyText cents={totals.totalCents} />
                  <span className={shared.rowSub}>{q.createdLabel}</span>
                </div>
              </a>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
