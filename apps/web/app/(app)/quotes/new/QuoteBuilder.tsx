"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { computeTotals, depositCentsFrom, DepositMode, QuoteDetailLevel } from "@jamquote/core";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import MoneyText from "@/components/ui/MoneyText";
import { createQuote, updateQuote, ApiError, type Trade } from "@/lib/api-client";
import ClientSelectField from "@/components/forms/ClientSelectField";
import ProjectSelectField from "@/components/forms/ProjectSelectField";
import type { ClientOption, ProjectOption } from "@/components/forms/types";
import type { EquipmentItem, Job, LabourRate, MaterialFavourite } from "@/lib/types";
import {
  clearDraft,
  draftAge,
  draftIsWorthRestoring,
  draftKey,
  loadDraft,
  saveDraft,
  type StoredDraft,
} from "@/lib/quote-draft-recovery";
import shared from "../../shared.module.css";
import LineItemsEditor from "../../LineItemsEditor";
import {
  customHeadingsFromInitial,
  fromCents,
  groupLinesIntoSections,
  lineToLineInput,
  linesFromInitial,
  savableLines,
  incompleteLines,
  describeIncompleteLine,
  toCents,
  type DraftLine,
  type InitialLine,
  type InitialLines,
  type InitialSection,
} from "@/lib/line-editor";

const DEFAULT_GCT_RATE = 15; // fallback only — real rate comes from the business's gctRatePct prop
const DEFAULT_VALID_DAYS = 30;
const DAY_MS = 86_400_000;
// Quote-shaped aliases over the shared line-editor types. The pages that
// import these keep their existing names; the shapes now have one definition.
export type InitialQuoteLine = InitialLine;
export type InitialQuoteSection = InitialSection;
export interface InitialQuote extends InitialLines {
  clientId?: string;
  projectId?: string;
  discountPct: number;
  depositCents: number;
  /** Per-quote summary/detailed presentation setting to restore on edit. */
  detailLevel?: QuoteDetailLevel;
  /** Raw ISO timestamps, used only to derive the "valid for N days" default. */
  validUntil?: string;
  createdAt?: string;
}

/**
 * Existing quotes store an absolute `validUntil`; the builder shows a
 * relative "valid for N days" field instead. Derive N from the gap between
 * `validUntil` and `createdAt` (or now, for a brand-new quote), rounded to
 * the nearest whole day, falling back to the default when there's no
 * existing validUntil (new quote) or the gap is nonsensical.
 */
function initialValidDays(initial?: InitialQuote): number {
  if (!initial?.validUntil) return DEFAULT_VALID_DAYS;
  const start = initial.createdAt ? new Date(initial.createdAt) : new Date();
  const end = new Date(initial.validUntil);
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  return days > 0 ? days : DEFAULT_VALID_DAYS;
}

/**
 * Exactly the fields a contractor would hate to retype.
 *
 * Deliberately not the whole component state: `saving`, `error` and the
 * clients/projects lists are either transient or re-fetched, and restoring
 * them would put a stale error banner back on screen.
 */
interface DraftSnapshot {
  clientId: string;
  projectId: string;
  discountPct: string;
  depositInput: string;
  validDays: string;
  detailLevel: QuoteDetailLevel;
  lines: DraftLine[];
}

export default function QuoteBuilder({
  clients: initialClients,
  projects: initialProjects,
  favourites: initialFavourites = [],
  jobs = [],
  labourRates = [],
  equipment = [],
  trades = [],
  mode = "create",
  quoteId,
  initial,
  gctRatePct = DEFAULT_GCT_RATE,
}: {
  clients: ClientOption[];
  projects: ProjectOption[];
  /** Saved materials (name + last price) offered as a reuse picker per line. */
  favourites?: MaterialFavourite[];
  /** The business's job-type library — a line's "Saved" picker offers these
   * once its kind is JOB. Each carries a server-computed unitCostCents and
   * its component snapshot. */
  jobs?: Job[];
  /** The business's labour-rate book — a line's "Saved" picker offers these
   * once its kind is LABOUR. */
  labourRates?: LabourRate[];
  /** The business's equipment library, for EQUIPMENT-kind lines. */
  equipment?: EquipmentItem[];
  /** Trades list, threaded through to the line editor's "+ Add new labour
   * rate…" modal (LabourRateForm's trade picker). */
  trades?: Trade[];
  mode?: "create" | "edit";
  quoteId?: string;
  initial?: InitialQuote;
  /** The business's default GCT rate (Business.defaultGctRatePct from
   * getBusiness()) — never hardcoded. Callers should pass the real rate;
   * the default here only covers the case where the business is
   * unavailable (see getBusiness()'s EMPTY_BUSINESS fallback). */
  gctRatePct?: number;
}) {
  const router = useRouter();
  const isEdit = mode === "edit" && !!quoteId;
  const backHref = isEdit ? `/quotes/${quoteId}` : "/quotes";
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [projectId, setProjectId] = useState(initial?.projectId ?? "");
  const [discountPct, setDiscountPct] = useState(String(initial?.discountPct ?? 0));
  // Raw field value: dollars in AMOUNT mode, percent in PERCENT mode. Only the
  // resolved depositCents is ever saved (see @jamquote/core deposit.ts), so an
  // existing quote always reopens in AMOUNT mode — there is no stored
  // percentage to restore, by design.
  const [depositMode, setDepositMode] = useState<DepositMode>(DepositMode.AMOUNT);
  const [depositInput, setDepositInput] = useState(fromCents(initial?.depositCents ?? 0));
  const [validDays, setValidDays] = useState(String(initialValidDays(initial)));
  const [lines, setLines] = useState<DraftLine[]>(() => linesFromInitial(initial));
  // Only read on the line editor's first render, to seed its heading dropdown.
  const initialCustomHeadings = useMemo(() => customHeadingsFromInitial(initial), [initial]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Set when save() fails with the API's 402 FREE_LIMIT_REACHED response, so
  // the error banner can add an "Upgrade to Pro" link to /settings.
  const [limitReached, setLimitReached] = useState(false);
  // Local copies of the clients/projects lists — seeded from props, then kept in
  // sync locally when the user creates a new one inline ("+ Add new client…" /
  // "+ Add new job…") so it appears immediately in the picker without
  // navigating away or losing the in-progress quote.
  const [clients, setClients] = useState<ClientOption[]>(initialClients);
  const [projects, setProjects] = useState<ProjectOption[]>(initialProjects);
  // Per-quote presentation setting: SUMMARY (each job-type line as one priced
  // row) vs DETAILED (expand its component snapshot on the quote/PDF). Display
  // only — never affects totals.
  const [detailLevel, setDetailLevel] = useState<QuoteDetailLevel>(
    initial?.detailLevel ?? QuoteDetailLevel.SUMMARY,
  );
  // ---- Draft recovery -----------------------------------------------------
  // The owner lost a quote to the back button. Nothing had reached the server,
  // so there was nothing to go back to.
  //
  // Local, NOT a server-side autosave: creating a quote reserves a number
  // irreversibly, so saving on every line change would leave a contractor's
  // numbering full of gaps and their list full of empty drafts. See
  // lib/quote-draft-recovery.ts.
  const storageKey = draftKey(isEdit ? "edit" : "new", quoteId);
  const [recovered, setRecovered] = useState<StoredDraft<DraftSnapshot> | null>(null);
  // Blocks the autosave until the restore offer has been answered — otherwise
  // the empty form would overwrite the very draft being offered back.
  const restoreSettled = useRef(false);

  const snapshot = useMemo<DraftSnapshot>(
    () => ({ clientId, projectId, discountPct, depositInput, validDays, detailLevel, lines }),
    [clientId, projectId, discountPct, depositInput, validDays, detailLevel, lines],
  );

  useEffect(() => {
    const found = loadDraft<DraftSnapshot>(storageKey);
    if (found && draftIsWorthRestoring(found.values)) setRecovered(found);
    else restoreSettled.current = true;
  }, [storageKey]);

  // Snapshot as it stood on mount, so "has the contractor started typing?" can
  // be answered while the restore offer is still up.
  const mountedSnapshot = useRef(snapshot);

  useEffect(() => {
    if (!restoreSettled.current) {
      // The offer is still on screen. If they have started typing instead of
      // answering it, that IS the answer: the old draft goes and the work in
      // front of them starts being protected.
      //
      // Without this, ignoring the banner left autosave switched off — so
      // someone who dismissed it mentally and carried on could lose a second
      // quote to exactly the problem the banner exists to solve.
      if (JSON.stringify(snapshot) === JSON.stringify(mountedSnapshot.current)) return;
      restoreSettled.current = true;
      setRecovered(null);
    }
    saveDraft(storageKey, snapshot);
  }, [storageKey, snapshot]);

  const restoreDraft = useCallback(() => {
    if (!recovered) return;
    const v = recovered.values;
    setClientId(v.clientId);
    setProjectId(v.projectId);
    setDiscountPct(v.discountPct);
    setDepositInput(v.depositInput);
    setValidDays(v.validDays);
    setDetailLevel(v.detailLevel);
    setLines(v.lines);
    setRecovered(null);
    restoreSettled.current = true;
  }, [recovered]);

  const discardDraft = useCallback(() => {
    clearDraft(storageKey);
    setRecovered(null);
    restoreSettled.current = true;
  }, [storageKey]);

  const totals = useMemo(
    () =>
      (() => {
        const base = {
          lines: lines.map((l) => ({
            quantity: Number(l.quantity) || 0,
            unitPriceCents: toCents(l.unitPriceDollars),
            gctTreatment: l.gctTreatment,
          })),
          gctRatePct,
          discountPct: Number(discountPct) || 0,
        };
        // A percentage deposit needs the total to resolve against. Not
        // circular: computeTotals derives totalCents before the deposit and
        // uses the deposit only for balanceDueCents.
        const { totalCents } = computeTotals(base);
        return computeTotals({
          ...base,
          depositCents: depositCentsFrom(depositMode, depositInput, totalCents),
        });
      })(),
    [lines, discountPct, depositInput, depositMode, gctRatePct],
  );

  async function save() {
    // Refuse rather than silently discard. A line the contractor worked on but
    // left incomplete used to be filtered out on save and discovered missing
    // when they reopened the document — indistinguishable from the app losing
    // their work, and on a bill it is money quietly absent.
    const unfinished = incompleteLines(lines);
    const firstUnfinished = unfinished[0];
    if (firstUnfinished) {
      return setError(`${describeIncompleteLine(lines, firstUnfinished)} before saving.`);
    }

    const validLines = savableLines(lines);
    if (validLines.length === 0) return setError("Add at least one line item with a description and quantity.");

    setSaving(true);
    setError("");
    setLimitReached(false);

    // Every heading becomes a section, ordered by the heading's
    // first-appearance position across the (ordered) line list.
    const sections = groupLinesIntoSections(validLines).map((s) => ({
      title: s.title,
      sort: s.sort,
      lineItems: s.lines.map(lineToLineInput),
    }));

    const days = Number(validDays) || DEFAULT_VALID_DAYS;
    const payload = {
      clientId: clientId || undefined,
      projectId: projectId || undefined,
      gctRatePct,
      discountPct: Number(discountPct) || 0,
      // Already resolved from the mode + raw input against the total, and it is
      // the figure shown in the panel — reading it back guarantees the saved
      // deposit is the one the contractor was looking at.
      depositCents: totals.depositCents,
      validUntil: new Date(Date.now() + days * DAY_MS).toISOString(),
      detailLevel,
      lineItems: [],
      sections,
    };
    try {
      const { id } = isEdit ? await updateQuote(quoteId!, payload) : await createQuote(payload);
      // The quote exists on the server now, so the local copy is no longer a
      // safety net — leaving it would offer to "restore" work already saved.
      clearDraft(storageKey);
      router.push(`/quotes/${id}`);
    } catch (err) {
      // Free-plan quote limit: the API returns 402 with
      // { message, code: "FREE_LIMIT_REACHED" } — surface its own message
      // (it names the limit) rather than the generic "couldn't save" text.
      if (err instanceof ApiError && err.status === 402) {
        setError(err.body?.message || "You've reached your free plan limit for this month. Upgrade to Pro to keep creating quotes.");
        setLimitReached(err.body?.code === "FREE_LIMIT_REACHED");
      } else {
        setError(isEdit ? "Couldn't save changes — is the API running?" : "Couldn't save the quote — is the API running?");
        setLimitReached(false);
      }
      setSaving(false);
    }
  }

  return (
    <div className={shared.page}>
      {/* Offered, never applied automatically. Silently repopulating the form
          would be worse than losing it: a contractor who deliberately started
          again would find last week's lines back without asking. */}
      {recovered && (
        <div className={shared.recoverBar}>
          <span>
            You have an unsaved quote from {draftAge(recovered.savedAt)}.
          </span>
          <span className={shared.recoverActions}>
            <Button variant="primary" size="sm" onClick={restoreDraft}>
              Restore it
            </Button>
            <Button variant="ghost" size="sm" onClick={discardDraft}>
              Start fresh
            </Button>
          </span>
        </div>
      )}
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>
            <a href={backHref} style={{ color: "inherit" }}>
              ← {isEdit ? "Quote" : "Quotes"}
            </a>
          </span>
          <h1 className={shared.title}>{isEdit ? "Edit quote" : "New quote"}</h1>
          <span className={shared.subtitle}>Build an itemized estimate — GCT at {gctRatePct}% on standard lines.</span>
        </div>
      </header>

      <Card>
        <div className={shared.list}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <ClientSelectField clients={clients} value={clientId} onChange={setClientId} onCreated={(c) => setClients((cs) => [...cs, c])} />
            <ProjectSelectField
              projects={projects}
              clients={clients}
              value={projectId}
              onChange={setProjectId}
              onCreated={(j) => setProjects((js) => [...js, j])}
              onClientCreated={(c) => setClients((cs) => [...cs, c])}
              // The client picked to the left is the client this job belongs
              // to — don't ask for it again in the modal.
              defaultClientId={clientId}
            />
          </div>
        </div>
      </Card>

      <LineItemsEditor
        documentNoun="quote"
        lines={lines}
        onLinesChange={setLines}
        initialCustomHeadings={initialCustomHeadings}
        favourites={initialFavourites}
        jobs={jobs}
        labourRates={labourRates}
        equipment={equipment}
        trades={trades}
        detailLevel={detailLevel}
        onDetailLevelChange={setDetailLevel}
      />

      <div className={shared.grid2}>
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Input label="Discount %" type="number" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
            {/* Deposit takes a dollar amount or a percentage of the total —
                "half up front" is as common as a flat figure, and working the
                percentage out by hand is where a wrong number gets quoted. */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "end" }}>
              <Input
                label={depositMode === DepositMode.PERCENT ? "Deposit %" : "Deposit $"}
                type="number"
                min={0}
                {...(depositMode === DepositMode.PERCENT ? { max: 100 } : {})}
                value={depositInput}
                onChange={(e) => setDepositInput(e.target.value)}
              />
              <Select
                // A non-breaking space, not "&nbsp;": a JSX string attribute is
                // not HTML, so the entity would print literally. This keeps the
                // control baseline-aligned with the labelled Input beside it
                // while aria-label carries the real name.
                label={" "}
                aria-label="Deposit as amount or percent"
                options={[
                  { value: DepositMode.AMOUNT, label: "$" },
                  { value: DepositMode.PERCENT, label: "%" },
                ]}
                value={depositMode}
                onChange={(e) => setDepositMode(e.target.value as DepositMode)}
              />
            </div>
            <Input label="Valid for (days)" type="number" min={1} value={validDays} onChange={(e) => setValidDays(e.target.value)} />
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
              <span>GCT ({gctRatePct}% on standard)</span>
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

      {error && (
        <div style={{ color: "var(--jq-crit)", fontSize: 13 }}>
          {error}
          {limitReached && (
            <>
              {" "}
              <Link href="/settings" style={{ color: "inherit", textDecoration: "underline", fontWeight: 600 }}>
                Upgrade to Pro
              </Link>
            </>
          )}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Button href={backHref} variant="ghost">
          Cancel
        </Button>
        <Button variant="primary" onClick={save}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create quote"}
        </Button>
      </div>
    </div>
  );
}
