/**
 * Single source of truth for the contractor Reports page. Like
 * `computeDashboardStats` and `computeTotals`, this is a pure function so
 * api, web, and mobile all derive the same numbers from the same raw rows
 * instead of three surfaces quietly disagreeing about what "revenue" means.
 *
 * Callers own fetching/filtering the raw rows (e.g. excluding voided
 * payments before they reach `payments` here) — this module only does the
 * arithmetic and grouping.
 */

import { InvoiceStatus, ProjectStage, PROJECT_STAGES, QuoteStatus } from "../types/enums.js";
import type { Cents } from "../tax/money.js";

/** Inclusive start, exclusive end — so consecutive reporting periods
 * (e.g. one calendar month after another) tile with no gap and no overlap. */
export interface ReportsRange {
  fromIso: string;
  toIso: string;
}

export interface ReportQuote {
  status: QuoteStatus;
  totalCents: Cents;
  createdAt: string; // ISO
}

export interface ReportInvoice {
  status: InvoiceStatus;
  totalCents: Cents;
  paidCents: Cents;
  /**
   * The date the invoice BEARS, which is what revenue is attributed to — not
   * when the row was written. A contractor writing up June's work in July is
   * reporting June revenue, and using createdAt made that impossible to say.
   */
  issueDate: string; // ISO
  dueDate?: string | null; // ISO date, no time-of-day
  clientId?: string | null;
  clientName?: string | null;
}

/** Caller pre-filters out voided/reversed payments — this module trusts
 * every row it's handed is real cash received. */
export interface ReportPayment {
  amountCents: Cents;
  paidAt: string; // ISO
}

export interface ReportProject {
  stage: ProjectStage;
  createdAt: string; // ISO
  clientId?: string | null;
  clientName?: string | null;
}

export interface QuoteFunnelSummary {
  sentCount: number;
  sentValueCents: Cents;
  acceptedCount: number;
  acceptedValueCents: Cents;
  /** Integer 0-100. 0 (not NaN) when nothing was sent. */
  winRatePct: number;
}

export interface RevenueSummary {
  invoicedCents: Cents;
  collectedCents: Cents;
}

export interface ClientOutstandingSummary {
  clientId: string | null;
  clientName: string;
  outstandingCents: Cents;
  overdueCents: Cents;
  invoiceCount: number;
}

export interface ReceivablesSummary {
  totalOutstandingCents: Cents;
  totalOverdueCents: Cents;
  /** Sorted by outstandingCents descending. */
  outstandingByClient: ClientOutstandingSummary[];
}

export interface MonthlySalesBucket {
  monthIso: string; // "YYYY-MM", Jamaica local calendar month
  invoicedCents: Cents;
  collectedCents: Cents;
}

export interface ClientProjectCount {
  clientId: string | null;
  clientName: string;
  projectCount: number;
}

export interface ProjectsSummary {
  projectsCreated: number;
  /** Every ProjectStage present, zero-filled, in workflow order. */
  projectsByStage: Record<ProjectStage, number>;
  /** Sorted by projectCount descending, ties broken by name. Capped — see
   * TOP_CLIENTS_BY_JOBS_LIMIT. */
  topClientsByProjects: ClientProjectCount[];
}

export interface ReportsSummary {
  range: ReportsRange;
  quotes: QuoteFunnelSummary;
  revenue: RevenueSummary;
  receivables: ReceivablesSummary;
  salesByMonth: MonthlySalesBucket[];
  projects: ProjectsSummary;
}

/** The "top clients" card is a leaderboard, not a directory — past a
 * handful of names it stops being scannable at a glance on the Reports page,
 * so it's capped rather than left to grow unbounded with the business. */
const TOP_CLIENTS_BY_JOBS_LIMIT = 10;

/**
 * Jamaica does not observe daylight saving time, so unlike most timezones
 * its UTC offset is a fixed constant year-round rather than something that
 * needs a timezone database: UTC-5, always. jurisdiction.ts does not yet
 * carry a timezone field (checked before adding this), so it's defined here
 * rather than invented on the JurisdictionProfile. If JamQuote later expands
 * to a Caribbean jurisdiction that *does* observe DST, this constant needs
 * to become a real per-jurisdiction lookup rather than being reused as-is.
 *
 * Exported because the API's default range and the web period presets must
 * agree with the bucketing here exactly. If they drift, "This month" selects
 * a window whose edges fall in a different month than the buckets drawn from
 * it, and the chart quietly gains or loses a column.
 */
export const JAMAICA_UTC_OFFSET_MS = -5 * 60 * 60 * 1000;

/** Compute every headline number the Reports page shows, from raw rows. */
export function computeReportsSummary(
  input: {
    quotes: ReportQuote[];
    invoices: ReportInvoice[];
    payments: ReportPayment[];
    projects: ReportProject[];
  },
  range: ReportsRange,
  now: Date = new Date(),
): ReportsSummary {
  return {
    range,
    quotes: computeQuoteFunnel(input.quotes, range),
    revenue: computeRevenue(input.invoices, input.payments, range),
    // Deliberately NOT range-filtered — see computeReceivables.
    receivables: computeReceivables(input.invoices, now),
    salesByMonth: computeSalesByMonth(input.invoices, input.payments, range),
    projects: computeProjectsSummary(input.projects, range),
  };
}

/** iso falls within [range.fromIso, range.toIso). NaN-safe: a malformed
 * date compares false against everything and is simply excluded, rather
 * than throwing and taking the whole report down with it. */
function inRange(iso: string, range: ReportsRange): boolean {
  const t = new Date(iso).getTime();
  const from = new Date(range.fromIso).getTime();
  const to = new Date(range.toIso).getTime();
  return t >= from && t < to;
}

/**
 * Quotes sent vs. won, over quotes created in range.
 *
 * "Sent" is everything that ever left DRAFT (a quote still being drafted was
 * never put in front of a client, so it can't count as an attempt either
 * way). "Won" is ACCEPTED *or* INVOICED — this is the one rule in the whole
 * module worth over-explaining: once a client accepts, the app converts the
 * quote into an invoice and the quote's status moves to INVOICED, leaving
 * ACCEPTED behind entirely. If winRatePct only counted ACCEPTED, every time
 * the contractor did the *next* step after winning a job — invoicing it —
 * their own win rate would drop. The metric would be actively punishing the
 * contractor for succeeding, which is exactly backwards.
 */
function computeQuoteFunnel(quotes: ReportQuote[], range: ReportsRange): QuoteFunnelSummary {
  let sentCount = 0;
  let sentValueCents = 0;
  let acceptedCount = 0;
  let acceptedValueCents = 0;

  for (const q of quotes) {
    if (!inRange(q.createdAt, range)) continue;
    if (q.status === QuoteStatus.DRAFT) continue; // never sent

    sentCount += 1;
    sentValueCents += q.totalCents;

    if (q.status === QuoteStatus.ACCEPTED || q.status === QuoteStatus.INVOICED) {
      acceptedCount += 1;
      acceptedValueCents += q.totalCents;
    }
  }

  const winRatePct = sentCount === 0 ? 0 : Math.round((acceptedCount / sentCount) * 100);
  return { sentCount, sentValueCents, acceptedCount, acceptedValueCents, winRatePct };
}

/**
 * Revenue invoiced vs. actually collected, in range.
 *
 * `collectedCents` is summed from `ReportPayment.amountCents` and
 * deliberately never reads `Invoice.paidCents`. paidCents is a cumulative
 * running total living on the invoice with no date of its own — it can tell
 * you an invoice is now fully paid, but not *when* that money arrived. A
 * client who pays a March invoice in August would either vanish from an
 * August report (if paidCents were attributed to the invoice's creation
 * month) or corrupt March's numbers (if attributed there) — either way the
 * report would lie about how much cash moved during the period it claims to
 * describe. Payment rows carry their own `paidAt`, so they're the only
 * source that can answer "how much cash came in during this window."
 */
function computeRevenue(
  invoices: ReportInvoice[],
  payments: ReportPayment[],
  range: ReportsRange,
): RevenueSummary {
  let invoicedCents = 0;
  for (const inv of invoices) {
    // A DRAFT invoice isn't a claim on anyone yet — it's not revenue until
    // it's actually issued.
    if (inv.status === InvoiceStatus.DRAFT) continue;
    if (!inRange(inv.issueDate, range)) continue;
    invoicedCents += inv.totalCents;
  }

  let collectedCents = 0;
  for (const p of payments) {
    if (!inRange(p.paidAt, range)) continue;
    collectedCents += p.amountCents;
  }

  return { invoicedCents, collectedCents };
}

const NO_CLIENT_KEY = "__no_client__";
const NO_CLIENT_LABEL = "No client";

/** Group key for a nullable client id — a stable string so it can be a Map
 * key, distinct from any real id. */
function clientGroupKey(clientId: string | null | undefined): string {
  return clientId ?? NO_CLIENT_KEY;
}

/** Display label for a client group. A present clientId with a missing name
 * is treated as data hygiene noise ("Unknown client"), never conflated with
 * genuinely client-less rows ("No client") — those mean different things to
 * the contractor reading the report. */
function clientGroupLabel(
  clientId: string | null | undefined,
  clientName: string | null | undefined,
): string {
  if (clientId == null) return NO_CLIENT_LABEL;
  return clientName ?? "Unknown client";
}

/**
 * Outstanding (and overdue) balances by client, as of `now`.
 *
 * Deliberately NOT filtered by `range`, even though every other section of
 * this report is. A debt raised in March is still owed in August — scoping
 * receivables to the reporting window would make most of what the
 * contractor is actually owed disappear from the one report meant to show
 * it. Receivables are a snapshot of "as things stand today", not a tally of
 * activity during a period.
 */
/**
 * Exported because the dashboard's overdue card needs the same figure the
 * Reports page shows. Two implementations of "overdue" would eventually
 * disagree, and the contractor would be told two different things about the
 * same money on two screens of the same app.
 */
export function computeReceivables(invoices: ReportInvoice[], now: Date): ReceivablesSummary {
  const nowMs = now.getTime();
  const byClient = new Map<string, ClientOutstandingSummary>();

  for (const inv of invoices) {
    if (inv.status === InvoiceStatus.DRAFT) continue; // not a claim on anyone yet
    const remainingCents = inv.totalCents - inv.paidCents;
    if (remainingCents <= 0) continue; // fully paid (or overpaid) -> nothing outstanding

    const key = clientGroupKey(inv.clientId);
    const existing = byClient.get(key);
    const entry: ClientOutstandingSummary =
      existing ??
      {
        clientId: inv.clientId ?? null,
        clientName: clientGroupLabel(inv.clientId, inv.clientName),
        outstandingCents: 0,
        overdueCents: 0,
        invoiceCount: 0,
      };

    entry.outstandingCents += remainingCents;
    entry.invoiceCount += 1;

    // A null dueDate means "no due date was ever set" — that can never be
    // overdue, since there's no date it's late relative to.
    if (inv.dueDate != null) {
      const dueMs = new Date(inv.dueDate).getTime();
      if (!Number.isNaN(dueMs) && dueMs < nowMs) {
        entry.overdueCents += remainingCents;
      }
    }

    byClient.set(key, entry);
  }

  const outstandingByClient = Array.from(byClient.values()).sort(
    (a, b) => b.outstandingCents - a.outstandingCents,
  );
  const totalOutstandingCents = outstandingByClient.reduce(
    (sum, c) => sum + c.outstandingCents,
    0,
  );
  const totalOverdueCents = outstandingByClient.reduce((sum, c) => sum + c.overdueCents, 0);

  return { totalOutstandingCents, totalOverdueCents, outstandingByClient };
}

/** Shift a UTC instant into Jamaica local time and read off its calendar
 * month as "YYYY-MM". Using UTC directly would bucket a 7pm-on-the-31st
 * invoice into the next UTC day — and sometimes the next month — which is
 * not the month the contractor experienced doing that business. */
function jamaicaMonthKey(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + JAMAICA_UTC_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1; // 1-12
  return `${year}-${String(month).padStart(2, "0")}`;
}

function nextMonthKey(key: string): string {
  const [yearStr, monthStr] = key.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  return month >= 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * Every calendar month from the range's start to its end, inclusive,
 * Jamaica-local, in order. Charts must never have a silently-missing month —
 * that reads as "no data was collected" when really the bucket is genuinely
 * zero, and either misleads the contractor about the shape of their sales
 * trend or gets misread as a bug in the report itself.
 */
function monthKeysInRange(range: ReportsRange): string[] {
  const fromMs = new Date(range.fromIso).getTime();
  const toMs = new Date(range.toIso).getTime();
  if (!(toMs > fromMs)) return []; // empty or inverted range -> nothing to bucket

  const firstKey = jamaicaMonthKey(range.fromIso);
  // range.toIso is exclusive, so the actual last in-range instant is 1ms
  // before it — using toIso itself could pull in a whole extra empty month
  // whenever the range ends exactly on a month boundary.
  const lastKey = jamaicaMonthKey(new Date(toMs - 1).toISOString());

  const keys: string[] = [firstKey];
  while (keys[keys.length - 1] !== lastKey) {
    keys.push(nextMonthKey(keys[keys.length - 1] ?? firstKey));
  }
  return keys;
}

/** Monthly invoiced-vs-collected series for the sales chart. */
function computeSalesByMonth(
  invoices: ReportInvoice[],
  payments: ReportPayment[],
  range: ReportsRange,
): MonthlySalesBucket[] {
  const keys = monthKeysInRange(range);
  const buckets = new Map<string, MonthlySalesBucket>(
    keys.map((monthIso) => [monthIso, { monthIso, invoicedCents: 0, collectedCents: 0 }]),
  );

  for (const inv of invoices) {
    if (inv.status === InvoiceStatus.DRAFT) continue;
    if (!inRange(inv.issueDate, range)) continue;
    const bucket = buckets.get(jamaicaMonthKey(inv.issueDate));
    // Every in-range timestamp maps to a key already in `buckets` by
    // construction (monthKeysInRange spans exactly the range's months);
    // the check just satisfies noUncheckedIndexedAccess defensively.
    if (bucket) bucket.invoicedCents += inv.totalCents;
  }

  for (const p of payments) {
    if (!inRange(p.paidAt, range)) continue;
    const bucket = buckets.get(jamaicaMonthKey(p.paidAt));
    if (bucket) bucket.collectedCents += p.amountCents;
  }

  // Map preserves insertion order, which is chronological here.
  return Array.from(buckets.values());
}

/** Projects created in range, by stage, and the busiest clients. */
function computeProjectsSummary(projects: ReportProject[], range: ReportsRange): ProjectsSummary {
  const inRangeProjects = projects.filter((j) => inRange(j.createdAt, range));

  // Zero-fill every stage up front, in workflow order, so a stage with no
  // projects this period still shows as 0 rather than being silently absent —
  // and so a stage added later can't be forgotten here.
  const projectsByStage = Object.fromEntries(PROJECT_STAGES.map((stage) => [stage, 0])) as Record<
    ProjectStage,
    number
  >;
  for (const j of inRangeProjects) {
    projectsByStage[j.stage] += 1;
  }

  const counts = new Map<string, ClientProjectCount>();
  for (const j of inRangeProjects) {
    const key = clientGroupKey(j.clientId);
    const existing = counts.get(key);
    if (existing) {
      existing.projectCount += 1;
    } else {
      counts.set(key, {
        clientId: j.clientId ?? null,
        clientName: clientGroupLabel(j.clientId, j.clientName),
        projectCount: 1,
      });
    }
  }

  const topClientsByProjects = Array.from(counts.values())
    .sort((a, b) => b.projectCount - a.projectCount || a.clientName.localeCompare(b.clientName))
    .slice(0, TOP_CLIENTS_BY_JOBS_LIMIT);

  return { projectsCreated: inRangeProjects.length, projectsByStage, topClientsByProjects };
}
