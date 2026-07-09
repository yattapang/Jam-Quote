import { computeTotals, type QuoteTotals } from "@jamquote/core";
import React, { createContext, useContext, useMemo, useState } from "react";
import {
  DraftLineItem,
  initialQuoteLines,
  QUOTE_DISCOUNT_PCT,
  QUOTE_GCT_RATE_PCT,
} from "./mockData";

interface QuoteDraftContextValue {
  lines: DraftLineItem[];
  addLine: (line: DraftLineItem) => void;
  removeLine: (id: string) => void;
  discountPct: number;
  gctRatePct: number;
  totals: QuoteTotals;
}

const QuoteDraftContext = createContext<QuoteDraftContextValue | undefined>(undefined);

/**
 * Holds the in-progress quote (QT-0142 mock) shared between the quote editor
 * and the add-line screens. Totals are always derived via @jamquote/core's
 * computeTotals — this is the mobile app's only source of quote math, per
 * docs/ARCHITECTURE.md's "golden rule".
 */
export function QuoteDraftProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<DraftLineItem[]>(initialQuoteLines);

  const addLine = (line: DraftLineItem) => setLines((prev) => [...prev, line]);
  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));

  const totals = useMemo(
    () =>
      computeTotals({
        lines: lines.map((l) => ({
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          markupPct: l.markupPct,
          gctTreatment: l.gctTreatment,
        })),
        gctRatePct: QUOTE_GCT_RATE_PCT,
        discountPct: QUOTE_DISCOUNT_PCT,
      }),
    [lines],
  );

  const value = useMemo<QuoteDraftContextValue>(
    () => ({ lines, addLine, removeLine, discountPct: QUOTE_DISCOUNT_PCT, gctRatePct: QUOTE_GCT_RATE_PCT, totals }),
    [lines, totals],
  );

  return <QuoteDraftContext.Provider value={value}>{children}</QuoteDraftContext.Provider>;
}

export function useQuoteDraft(): QuoteDraftContextValue {
  const ctx = useContext(QuoteDraftContext);
  if (!ctx) throw new Error("useQuoteDraft must be used within a QuoteDraftProvider");
  return ctx;
}
