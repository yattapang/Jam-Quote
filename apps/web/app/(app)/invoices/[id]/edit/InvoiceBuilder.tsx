"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { computeTotals, QuoteDetailLevel } from "@jamquote/core";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import MoneyText from "@/components/ui/MoneyText";
import { updateInvoice, ApiError } from "@/lib/api-client";
import ClientSelectField from "@/components/forms/ClientSelectField";
import type { ClientOption } from "@/components/forms/types";
import type { Assembly, LabourRate, MaterialFavourite } from "@/lib/types";
import shared from "../../../shared.module.css";
import LineItemsEditor from "../../../LineItemsEditor";
import {
  customHeadingsFromInitial,
  fromCents,
  groupLinesIntoSections,
  lineToInvoiceLineInput,
  linesFromInitial,
  savableLines,
  toCents,
  type DraftLine,
  type InitialLine,
  type InitialLines,
  type InitialSection,
} from "@/lib/line-editor";

const DEFAULT_GCT_RATE = 15; // fallback only — real rate comes from the invoice's own gctRatePct prop

// Invoice-shaped aliases over the shared line-editor types. The pages that
// import these keep their existing names; the shapes now have one definition.
export type InitialInvoiceLine = InitialLine;
export type InitialInvoiceSection = InitialSection;
export interface InitialInvoice extends InitialLines {
  clientId?: string;
  dueDate?: string; // yyyy-mm-dd, for the date input
  terms?: string;
  gctRatePct: number;
  discountPct: number;
  depositCents: number;
  detailLevel?: QuoteDetailLevel;
}

/**
 * Draft invoice editor — edits header fields (bill-to client, due date, terms,
 * GCT/discount/deposit) and the sectioned line-item list, then PATCHes via
 * updateInvoice.
 * Only reachable while the invoice is DRAFT (enforced by the edit page, which
 * redirects otherwise); the API itself also rejects a PATCH once finalized.
 *
 * The lines themselves are edited by the shared LineItemsEditor, so this screen
 * has the same material/labour/job-type libraries as the quote builder.
 */
export default function InvoiceBuilder({
  invoiceId,
  invoiceNumber,
  initial,
  favourites = [],
  assemblies = [],
  labourRates = [],
  clients: initialClients = [],
}: {
  invoiceId: string;
  invoiceNumber: string;
  initial: InitialInvoice;
  /** Clients offered by the bill-to picker, which also creates new ones inline. */
  clients?: ClientOption[];
  /** Saved materials offered as a reuse picker per line. */
  favourites?: MaterialFavourite[];
  /** The business's job-type library, offered via "+ Add job type". */
  assemblies?: Assembly[];
  /** The business's labour-rate book, offered via "+ Add labour". */
  labourRates?: LabourRate[];
}) {
  const router = useRouter();
  const backHref = `/invoices/${invoiceId}`;

  const [clientId, setClientId] = useState(initial.clientId ?? "");
  const [clients, setClients] = useState<ClientOption[]>(initialClients);
  const [dueDate, setDueDate] = useState(initial.dueDate ?? "");
  const [terms, setTerms] = useState(initial.terms ?? "");
  const [gctRatePct, setGctRatePct] = useState(String(initial.gctRatePct ?? DEFAULT_GCT_RATE));
  const [discountPct, setDiscountPct] = useState(String(initial.discountPct ?? 0));
  const [depositDollars, setDepositDollars] = useState(fromCents(initial.depositCents ?? 0));
  const [detailLevel, setDetailLevel] = useState<QuoteDetailLevel>(initial.detailLevel ?? QuoteDetailLevel.SUMMARY);
  const [lines, setLines] = useState<DraftLine[]>(() => linesFromInitial(initial));
  // Only read on the line editor's first render, to seed its heading dropdown.
  const initialCustomHeadings = useMemo(() => customHeadingsFromInitial(initial), [initial]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const gctRatePctNum = Number(gctRatePct) || 0;
  const totals = useMemo(
    () =>
      computeTotals({
        lines: lines.map((l) => ({
          quantity: Number(l.quantity) || 0,
          unitPriceCents: toCents(l.unitPriceDollars),
          gctTreatment: l.gctTreatment,
        })),
        gctRatePct: gctRatePctNum,
        discountPct: Number(discountPct) || 0,
        depositCents: toCents(depositDollars),
      }),
    [lines, discountPct, depositDollars, gctRatePctNum],
  );

  async function save() {
    const validLines = savableLines(lines);
    if (validLines.length === 0) return setError("Add at least one line item with a description and quantity.");

    setSaving(true);
    setError("");

    // Every heading becomes a section, ordered by the heading's
    // first-appearance position across the (ordered) line list — same
    // convention as the quote builder.
    const sections = groupLinesIntoSections(validLines).map((s) => ({
      title: s.title,
      sort: s.sort,
      // The API orders lines within a section by `sort`, not by array position.
      lineItems: s.lines.map((l, i) => lineToInvoiceLineInput(l, i)),
    }));

    try {
      await updateInvoice(invoiceId, {
        // null, not undefined, when the picker is blank — the API reads an
        // absent key as "leave the client alone", so undefined here would make
        // clearing the field a silent no-op.
        clientId: clientId || null,
        dueDate: dueDate ? new Date(`${dueDate}T00:00:00.000Z`).toISOString() : undefined,
        terms: terms.trim() || undefined,
        gctRatePct: gctRatePctNum,
        discountPct: Number(discountPct) || 0,
        depositCents: toCents(depositDollars),
        detailLevel,
        lineItems: [],
        sections,
      });
      router.push(`/invoices/${invoiceId}`);
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : "Couldn't save changes — is the API running?");
      setSaving(false);
    }
  }

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>
            <a href={backHref} style={{ color: "inherit" }}>
              ← Invoice
            </a>
          </span>
          <h1 className={shared.title}>Edit invoice {invoiceNumber}</h1>
          <span className={shared.subtitle}>Draft invoice — edit line items and terms before finalizing.</span>
        </div>
      </header>

      <Card>
        <div className={shared.list}>
          <ClientSelectField
            label="Bill to"
            clients={clients}
            value={clientId}
            onChange={setClientId}
            onCreated={(c) => setClients((cs) => [...cs, c])}
          />
        </div>
      </Card>

      <LineItemsEditor
        documentNoun="invoice"
        lines={lines}
        onLinesChange={setLines}
        initialCustomHeadings={initialCustomHeadings}
        favourites={favourites}
        assemblies={assemblies}
        labourRates={labourRates}
        detailLevel={detailLevel}
        onDetailLevelChange={setDetailLevel}
      />

      <div className={shared.grid2}>
        <Card>
          <div style={{ display: "grid", gap: 12 }}>
            <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <Input
              label="Terms"
              placeholder="e.g. Payment due within 14 days"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Input label="GCT %" type="number" value={gctRatePct} onChange={(e) => setGctRatePct(e.target.value)} />
              <Input label="Discount %" type="number" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
              <Input label="Deposit $" type="number" value={depositDollars} onChange={(e) => setDepositDollars(e.target.value)} />
            </div>
          </div>
        </Card>
        <Card>
          <div className={shared.totals}>
            <div className={shared.totalRow}>
              <span>Subtotal</span>
              <MoneyText cents={totals.subtotalCents} weight={600} />
            </div>
            {totals.discountCents > 0 && (
              <div className={shared.totalRowMuted}>
                <span>Discount</span>
                <MoneyText cents={-totals.discountCents} tone="muted" weight={600} />
              </div>
            )}
            <div className={shared.totalRowMuted}>
              <span>GCT ({gctRatePctNum}% on standard)</span>
              <MoneyText cents={totals.gctCents} tone="muted" weight={600} />
            </div>
            <div className={shared.totalRowGrand}>
              <span>Total</span>
              <MoneyText cents={totals.totalCents} tone="accent" />
            </div>
            {totals.depositCents > 0 && (
              <div className={shared.totalRow}>
                <span>Balance due</span>
                <MoneyText cents={totals.balanceDueCents} weight={700} />
              </div>
            )}
          </div>
        </Card>
      </div>

      {error && <div style={{ color: "var(--jq-crit)", fontSize: 13 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Button href={backHref} variant="ghost">
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
