"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import StatusPill from "@/components/ui/StatusPill";
import MoneyText from "@/components/ui/MoneyText";
import DeleteRowButton from "@/components/ui/DeleteRowButton";
import { quoteStatusPill, QUOTE_STATUS_FILTERS } from "@/lib/status";
import type { Quote } from "@/lib/types";
import type { QuoteStatus } from "@jamquote/core";
import shared from "../shared.module.css";

export default function QuotesListClient({
  quotes,
  clientNames,
}: {
  quotes: Quote[];
  clientNames: Record<string, string>;
}) {
  const router = useRouter();
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
          <Button href="/quotes/new" variant="primary">
            New quote
          </Button>
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
            const pill = quoteStatusPill(q.status);
            const openQuote = () => router.push(`/quotes/${q.id}`);
            return (
              <div
                key={q.id}
                className={shared.row}
                role="link"
                tabIndex={0}
                onClick={openQuote}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openQuote();
                }}
                style={{ cursor: "pointer" }}
              >
                <div className={shared.rowMain}>
                  <span className={shared.rowTitle}>
                    {q.num}
                    <StatusPill label={pill.label} kind={pill.kind} variant={pill.variant} />
                  </span>
                  <span className={shared.rowSub}>
                    {clientNames[q.clientId] ?? "Unknown client"} · {q.jobLabel}
                  </span>
                </div>
                <div className={shared.rowRight}>
                  <MoneyText cents={q.totalCents ?? 0} />
                  <span className={shared.rowSub}>{q.createdLabel}</span>
                  <DeleteRowButton
                    kind="quote"
                    id={q.id}
                    confirmMessage={`Delete quote ${q.num}? This can't be undone.`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
