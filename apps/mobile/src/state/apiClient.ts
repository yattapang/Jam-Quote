/**
 * Mobile data access — the single place the app talks to apps/api. Fetches from
 * the live NestJS API and maps to the on-screen row types; falls back to the
 * shared fixtures when the API is unreachable (offline / no dev server).
 *
 * Base URL: on Expo web use the browser host; on a device derive the dev
 * machine's LAN IP from the Metro packager host (expo-constants) — a phone
 * can't reach the PC's "localhost". Override with EXPO_PUBLIC_API_BASE_URL.
 */
import Constants from "expo-constants";
import { QuoteStatus } from "@jamquote/core";
import {
  STATUS_PILL,
  clientRows as fixtureClientRows,
  quoteListRows as fixtureQuoteRows,
  type ClientRow,
  type QuoteListRow,
} from "./mockData";

const API_PORT = 3001;
const BUSINESS_ID = "seed-business-blackwood";

export function apiBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (override) return override;
  // Expo web: same host the browser used.
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:${API_PORT}/api`;
  }
  // Native device: the Metro packager host is the dev machine's LAN IP.
  const host = (Constants.expoConfig?.hostUri ?? "").split(":")[0];
  return `http://${host || "localhost"}:${API_PORT}/api`;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    headers: { "x-business-id": BUSINESS_ID },
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

interface ApiQuote {
  id: string;
  clientId?: string | null;
  jobId?: string | null;
  number: string;
  status: QuoteStatus;
  totalCents: number;
}
interface ApiClientRow {
  id: string;
  name: string;
  phone?: string | null;
  parish?: string | null;
}
interface ApiJob {
  id: string;
  name: string;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function mapQuoteRow(q: ApiQuote, clientName: string, jobName: string): QuoteListRow {
  const pill = STATUS_PILL[q.status] ?? { label: q.status, kind: "neutral" as const };
  return {
    num: q.number,
    client: clientName,
    job: jobName,
    amountCents: q.totalCents,
    status: pill.label,
    kind: pill.kind,
  };
}

export function mapClientRow(c: ApiClientRow, totalCents: number, quoteCount: number): ClientRow {
  return {
    initials: initialsOf(c.name),
    name: c.name,
    parish: c.parish ?? "",
    phone: c.phone ?? "",
    totalCents,
    quoteCount,
  };
}

export async function fetchQuoteRows(): Promise<QuoteListRow[]> {
  try {
    const [quotes, clients, jobs] = await Promise.all([
      get<ApiQuote[]>("/quotes"),
      get<ApiClientRow[]>("/clients"),
      get<ApiJob[]>("/jobs"),
    ]);
    const clientName = new Map(clients.map((c) => [c.id, c.name]));
    const jobName = new Map(jobs.map((j) => [j.id, j.name]));
    return quotes
      .map((q) => mapQuoteRow(q, clientName.get(q.clientId ?? "") ?? "Unknown", jobName.get(q.jobId ?? "") ?? ""))
      .sort((a, b) => b.num.localeCompare(a.num));
  } catch {
    return fixtureQuoteRows;
  }
}

export async function fetchClientRows(): Promise<ClientRow[]> {
  try {
    const [clients, quotes] = await Promise.all([
      get<ApiClientRow[]>("/clients"),
      get<ApiQuote[]>("/quotes"),
    ]);
    return clients.map((c) => {
      const theirs = quotes.filter((q) => q.clientId === c.id);
      return mapClientRow(
        c,
        theirs.reduce((sum, q) => sum + q.totalCents, 0),
        theirs.length,
      );
    });
  } catch {
    return fixtureClientRows;
  }
}
