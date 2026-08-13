"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getJurisdiction, formatJmd, ADMIN_CAPABILITIES, ADMIN_CAPABILITY_META } from "@jamquote/core";
import {
  getAdminPricing,
  updateAdminPricing,
  setTenantPlan,
  suspendTenant,
  restoreTenant,
  hardDeleteTenant,
  promoteAdmin,
  updateAdmin,
  revokeAdmin,
  updateAdminRulePack,
  ApiError,
  type AdminData,
  type AdminUser,
  type PricingConfig,
  type EffectiveRulePack,
} from "@/lib/api-client";
import { logout } from "@/lib/auth-actions";
import { relativeTime } from "@/lib/relative-time";
import styles from "./console.module.css";

type Screen =
  | "overview"
  | "tenants"
  | "regulatory"
  | "rulepack"
  | "pricing"
  | "financials"
  | "activity"
  | "admins";

/** Lowercases and normalizes a plan string for comparisons/API calls — real
 * tenant data comes back "free"/"pro" (see PATCH /admin/tenants/:id/plan),
 * while the design-mock rows use capitalized display strings ("Free", "Pro",
 * plus mock-only "Starter"/"Core" tiers that don't exist in the real API). */
function isPro(plan: string): boolean {
  return plan.trim().toLowerCase() === "pro";
}
/** Display label for a plan value — normalizes real lowercase "free"/"pro"
 * to the same capitalized form the mock rows and planTone map use. */
function planDisplay(plan: string): string {
  const p = plan.trim().toLowerCase();
  if (p === "pro") return "Pro";
  if (p === "free") return "Free";
  return plan;
}
/** cents <-> dollar-string helpers for the pricing editor's money inputs
 * (mirrors the fromCents/toCents pattern used in QuoteBuilder). */
function centsToDollarsStr(cents: number): string {
  return (cents / 100).toFixed(2);
}
function dollarsStrToCents(v: string): number {
  return Math.round(Number(v) * 100);
}

const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const archivo: CSSProperties = { fontFamily: "var(--font-archivo), system-ui, sans-serif" };
const pill = (tone: string, extra?: CSSProperties): CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 999,
  fontSize: 12, fontWeight: 600, lineHeight: 1.4, whiteSpace: "nowrap",
  color: `var(--${tone})`, background: `color-mix(in srgb, var(--${tone}) 13%, transparent)`,
  border: `1px solid color-mix(in srgb, var(--${tone}) 30%, transparent)`, ...extra,
});
const dot = (tone: string, extra?: CSSProperties): CSSProperties => ({
  display: "inline-block", width: 9, height: 9, borderRadius: "50%", flex: "none", background: `var(--${tone})`, marginTop: 4, ...extra,
});
const th: CSSProperties = { textAlign: "left", padding: "11px 16px", fontSize: 10.5, letterSpacing: ".06em", color: "var(--muted)", fontWeight: 700, borderBottom: "1px solid var(--border)" };
const td: CSSProperties = { padding: "12px 16px", borderBottom: "1px solid var(--border)" };
const inputStyle: CSSProperties = { height: 36, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", width: "100%" };
const planTone: Record<string, string> = { Free: "muted", Starter: "info", Core: "accent", Pro: "good" };

/** Compact one-line rendering of an audit entry's free-form `details` payload
 * (shape varies by action — e.g. a tenant delete's confirmName, a plan
 * change's before/after). Never throws on odd shapes. */
function detailsPreview(details: unknown): string {
  if (details === null || details === undefined || details === "") return "—";
  if (typeof details === "string") return details;
  try {
    const s = JSON.stringify(details);
    return s.length > 90 ? `${s.slice(0, 87)}…` : s;
  } catch {
    return String(details);
  }
}

type TenantRow = [string, string, string, string, string, string, number | string, number, number];
type RegRow = [string, string, string, string, string];

const jm = getJurisdiction("JM");

export default function AdminConsole({
  data,
  admin,
}: {
  data: AdminData;
  admin: { name: string; email: string };
}) {
  const ov = data.overview;
  // The viewing admin's own authorization (from GET /admin/me). A super-admin
  // implicitly holds every capability — the API enforces the same; this only
  // gates what the console offers. See @jamquote/core AdminCapability.
  const me = data.me;
  // Mobile nav drawer. Closed by default and closed again on every navigation,
  // or it would sit open over the screen the admin just chose.
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = () => setNavOpen(false);

  const can = (cap: string) => me.isSuperAdmin || me.capabilities.includes(cap);
  const canManageTenants = can("MANAGE_TENANTS");
  const canManagePricing = can("MANAGE_PRICING");
  const canViewFinancials = can("VIEW_FINANCIALS");
  const canManageAdmins = can("MANAGE_ADMINS");
  const canManageRulepack = can("MANAGE_RULEPACK");
  const adminInitials =
    admin.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "A";
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [screen, setScreen] = useState<Screen>("overview");
  /** Navigate. On mobile this also dismisses the drawer — every nav control
   * goes through here so no call site can forget. */
  const go = (next: Screen) => {
    setScreen(next);
    setNavOpen(false);
  };
  const [tenantId, setTenantId] = useState<number | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [published, setPublished] = useState(false);
  const [toast, setToast] = useState(false);

  // --- Pricing editor (GET/PATCH /admin/pricing) ---
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [pricingLoadError, setPricingLoadError] = useState(false);
  const [pricingForm, setPricingForm] = useState({
    freeQuotesPerMonth: "",
    proMonthlyPriceDollars: "",
    proAnnualPriceDollars: "",
    currency: "",
  });
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingStatus, setPricingStatus] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    getAdminPricing()
      .then((p) => {
        if (cancelled) return;
        setPricing(p);
        setPricingForm({
          freeQuotesPerMonth: String(p.freeQuotesPerMonth),
          proMonthlyPriceDollars: centsToDollarsStr(p.proMonthlyPriceCents),
          proAnnualPriceDollars: centsToDollarsStr(p.proAnnualPriceCents),
          currency: p.currency,
        });
      })
      .catch(() => {
        if (!cancelled) setPricingLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function savePricing() {
    setPricingSaving(true);
    setPricingStatus("idle");
    try {
      const updated = await updateAdminPricing({
        freeQuotesPerMonth: Number(pricingForm.freeQuotesPerMonth) || undefined,
        proMonthlyPriceCents: dollarsStrToCents(pricingForm.proMonthlyPriceDollars) || undefined,
        proAnnualPriceCents: dollarsStrToCents(pricingForm.proAnnualPriceDollars) || undefined,
        currency: pricingForm.currency.trim() || undefined,
      });
      setPricing(updated);
      setPricingForm({
        freeQuotesPerMonth: String(updated.freeQuotesPerMonth),
        proMonthlyPriceDollars: centsToDollarsStr(updated.proMonthlyPriceCents),
        proAnnualPriceDollars: centsToDollarsStr(updated.proAnnualPriceCents),
        currency: updated.currency,
      });
      setPricingStatus("saved");
    } catch {
      setPricingStatus("error");
    } finally {
      setPricingSaving(false);
    }
  }

  // --- Rule-pack editor (GET/PATCH /admin/rulepack) — the effective pack comes
  // in via server props (data.rulepack); edits PATCH the override and swap the
  // returned effective pack into local state so the screen re-renders. ---
  const [rulepack, setRulepack] = useState<EffectiveRulePack | null>(data.rulepack);
  const rpToForm = (rp: EffectiveRulePack) => ({
    taxLabel: rp.taxLabel,
    defaultTaxRatePct: String(rp.defaultTaxRatePct),
    verifiedAsOf: rp.verifiedAsOf ?? "",
    sourceUrl: rp.sourceUrl ?? "",
    statutory: Object.fromEntries(
      rp.statutory.map((s) => [
        s.code,
        {
          employeePct: s.employeePct != null ? String(s.employeePct) : "",
          employerPct: s.employerPct != null ? String(s.employerPct) : "",
        },
      ]),
    ) as Record<string, { employeePct: string; employerPct: string }>,
  });
  const [rpForm, setRpForm] = useState(() => (data.rulepack ? rpToForm(data.rulepack) : null));
  const [rpSaving, setRpSaving] = useState(false);
  const [rpStatus, setRpStatus] = useState<"idle" | "saved" | "error">("idle");

  function setRpStat(code: string, side: "employeePct" | "employerPct", value: string) {
    setRpForm((f) => (f ? { ...f, statutory: { ...f.statutory, [code]: { ...f.statutory[code]!, [side]: value } } } : f));
  }

  async function saveRulepack() {
    if (!rpForm) return;
    setRpSaving(true);
    setRpStatus("idle");
    try {
      const statutoryRates: Record<string, { employeePct: number | null; employerPct: number | null }> = {};
      for (const [code, v] of Object.entries(rpForm.statutory)) {
        statutoryRates[code] = {
          employeePct: v.employeePct.trim() === "" ? null : Number(v.employeePct),
          employerPct: v.employerPct.trim() === "" ? null : Number(v.employerPct),
        };
      }
      const updated = await updateAdminRulePack({
        taxLabel: rpForm.taxLabel.trim() || undefined,
        defaultTaxRatePct: rpForm.defaultTaxRatePct.trim() === "" ? undefined : Number(rpForm.defaultTaxRatePct),
        verifiedAsOf: rpForm.verifiedAsOf.trim() === "" ? null : rpForm.verifiedAsOf,
        sourceUrl: rpForm.sourceUrl.trim() === "" ? null : rpForm.sourceUrl.trim(),
        statutoryRates,
      });
      setRulepack(updated);
      setRpForm(rpToForm(updated));
      setRpStatus("saved");
    } catch {
      setRpStatus("error");
    } finally {
      setRpSaving(false);
    }
  }

  // --- Per-tenant plan toggle (PATCH /admin/tenants/:id/plan) — only wired
  // for real tenant rows (data.tenants has real ids; the design-mock rows
  // below don't correspond to a real business, so no action is offered). ---
  const [tenantPlanOverride, setTenantPlanOverride] = useState<Record<string, string>>({});
  const [tenantPlanBusy, setTenantPlanBusy] = useState<Record<string, boolean>>({});
  const [tenantPlanError, setTenantPlanError] = useState<Record<string, boolean>>({});

  async function toggleTenantPlan(id: string, currentPlan: string) {
    const nextPlan = isPro(currentPlan) ? "free" : "pro";
    setTenantPlanBusy((b) => ({ ...b, [id]: true }));
    setTenantPlanError((e) => ({ ...e, [id]: false }));
    try {
      await setTenantPlan(id, { plan: nextPlan });
      setTenantPlanOverride((o) => ({ ...o, [id]: nextPlan }));
    } catch {
      setTenantPlanError((e) => ({ ...e, [id]: true }));
    } finally {
      setTenantPlanBusy((b) => ({ ...b, [id]: false }));
    }
  }

  // --- Tenant lifecycle: suspend / restore / permanent delete ---
  // useRouter().refresh() re-runs the server AdminPage after every mutation
  // so the props (tenants/financials/audit) reflect the API's new state —
  // the optimistic *Override state below just avoids a flash while that
  // round-trip is in flight.
  const router = useRouter();
  const [tenantSuspendOverride, setTenantSuspendOverride] = useState<Record<string, boolean>>({});
  const [tenantLifecycleBusy, setTenantLifecycleBusy] = useState<Record<string, boolean>>({});
  const [tenantLifecycleError, setTenantLifecycleError] = useState<Record<string, string>>({});

  async function toggleTenantSuspend(id: string, currentlySuspended: boolean) {
    setTenantLifecycleBusy((b) => ({ ...b, [id]: true }));
    setTenantLifecycleError((e) => ({ ...e, [id]: "" }));
    try {
      if (currentlySuspended) await restoreTenant(id);
      else await suspendTenant(id);
      setTenantSuspendOverride((o) => ({ ...o, [id]: !currentlySuspended }));
      router.refresh();
    } catch (err) {
      setTenantLifecycleError((e) => ({
        ...e,
        [id]: err instanceof ApiError ? err.message : "Failed — try again",
      }));
    } finally {
      setTenantLifecycleBusy((b) => ({ ...b, [id]: false }));
    }
  }

  // Permanent-delete modal — the operator must type the exact business name
  // (mirrors the server's confirmName check on DELETE /admin/tenants/:id).
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function openDeleteModal(id: string, name: string) {
    setDeleteTarget({ id, name });
    setDeleteTyped("");
    setDeleteError("");
  }
  function closeDeleteModal() {
    if (deleteBusy) return;
    setDeleteTarget(null);
    setDeleteTyped("");
    setDeleteError("");
  }
  async function confirmHardDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await hardDeleteTenant(deleteTarget.id, deleteTyped);
      setDeleteTarget(null);
      setDeleteTyped("");
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Couldn't delete — try again");
    } finally {
      setDeleteBusy(false);
    }
  }


  // --- Admins: promote by email / edit capabilities / revoke (MANAGE_ADMINS) ---
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoteCaps, setPromoteCaps] = useState<string[]>([]);
  const [promoteBusy, setPromoteBusy] = useState(false);
  const [promoteError, setPromoteError] = useState("");
  const [promoteOk, setPromoteOk] = useState(false);
  // Per-admin edited capability draft (absent = showing the saved list).
  const [capDraft, setCapDraft] = useState<Record<string, string[]>>({});
  const [adminRowBusy, setAdminRowBusy] = useState<Record<string, boolean>>({});
  const [adminRowError, setAdminRowError] = useState<Record<string, string>>({});
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);

  const toggleInList = (list: string[], cap: string) =>
    list.includes(cap) ? list.filter((c) => c !== cap) : [...list, cap];
  const capsFor = (a: AdminUser) => capDraft[a.id] ?? a.capabilities;
  const isSelfAdmin = (a: AdminUser) =>
    !!a.email && !!admin.email && a.email.toLowerCase() === admin.email.toLowerCase();

  async function submitPromote(e: FormEvent) {
    e.preventDefault();
    const email = promoteEmail.trim();
    if (!email) return;
    setPromoteBusy(true);
    setPromoteError("");
    setPromoteOk(false);
    try {
      await promoteAdmin({ email, capabilities: promoteCaps });
      setPromoteEmail("");
      setPromoteCaps([]);
      setPromoteOk(true);
      router.refresh();
    } catch (err) {
      setPromoteError(err instanceof ApiError ? err.message : "Couldn't add admin");
    } finally {
      setPromoteBusy(false);
    }
  }

  async function saveAdminCaps(a: AdminUser) {
    setAdminRowBusy((b) => ({ ...b, [a.id]: true }));
    setAdminRowError((e) => ({ ...e, [a.id]: "" }));
    try {
      await updateAdmin(a.id, { capabilities: capsFor(a) });
      setCapDraft((d) => {
        const next = { ...d };
        delete next[a.id];
        return next;
      });
      router.refresh();
    } catch (err) {
      setAdminRowError((e) => ({ ...e, [a.id]: err instanceof ApiError ? err.message : "Couldn't save" }));
    } finally {
      setAdminRowBusy((b) => ({ ...b, [a.id]: false }));
    }
  }

  async function toggleSuperAdmin(a: AdminUser) {
    setAdminRowBusy((b) => ({ ...b, [a.id]: true }));
    setAdminRowError((e) => ({ ...e, [a.id]: "" }));
    try {
      await updateAdmin(a.id, { isSuperAdmin: !a.isSuperAdmin });
      router.refresh();
    } catch (err) {
      setAdminRowError((e) => ({ ...e, [a.id]: err instanceof ApiError ? err.message : "Couldn't update" }));
    } finally {
      setAdminRowBusy((b) => ({ ...b, [a.id]: false }));
    }
  }

  async function doRevokeAdmin(id: string) {
    setAdminRowBusy((b) => ({ ...b, [id]: true }));
    setAdminRowError((e) => ({ ...e, [id]: "" }));
    try {
      await revokeAdmin(id);
      setRevokeConfirmId(null);
      router.refresh();
    } catch (err) {
      setAdminRowError((e) => ({ ...e, [id]: err instanceof ApiError ? err.message : "Couldn't revoke" }));
    } finally {
      setAdminRowBusy((b) => ({ ...b, [id]: false }));
    }
  }

  const titles: Record<Screen, [string, string]> = {
    overview: ["Platform overview", "Health of the JamQuote platform at a glance"],
    tenants: ["Tenants", `${ov ? ov.businesses.toLocaleString() : "1,284"} contractor businesses across ${jm.regions.length} parishes`],
    regulatory: ["Regulatory review queue", "Tax & regulation changes awaiting human review"],
    rulepack: ["Jurisdiction rule-pack verification", "Versioned, provenance-tracked tax rules per country"],
    pricing: ["Pricing", "Free-tier limit & Pro pricing for the whole platform"],
    financials: ["Financials", "Plan mix, MRR & upcoming renewals across the platform"],
    activity: ["Activity log", "Recent admin actions across the platform, newest first"],
    admins: ["Admins", "Staff admins and what each is authorized to do"],
  };
  const [screenTitle, screenDesc] = titles[screen];

  const navBtn = (id: Screen): CSSProperties => ({
    display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 11px", borderRadius: 9,
    border: "none", background: screen === id ? "var(--surface-alt)" : "transparent",
    color: screen === id ? "var(--text)" : "var(--muted)", font: "inherit", fontSize: 13.5,
    fontWeight: screen === id ? 600 : 500, cursor: "pointer", textAlign: "left",
  });

  // --- data ---
  const stats = [
    { label: "Total businesses", value: ov ? ov.businesses.toLocaleString() : "1,284", delta: "+42", sub: "this month", tone: "good" },
    { label: "Active subscriptions", value: ov ? String(ov.activeSubscriptions) : "892", delta: "+18", sub: "net new", tone: "good" },
    { label: "MRR", value: money(2418540), delta: "+4.7%", sub: "MoM", tone: "good" },
    // "feeds" was accurate when suppliers were a curated platform directory
    // with price feeds. They are tenant-owned now (#31), so this counts the
    // sum of every contractor's own merchant list — a usage metric, not a
    // directory the platform maintains.
    { label: "Suppliers added", value: ov ? String(ov.suppliersTracked) : "37", delta: "all tenants", sub: "merchant lists", tone: "info" },
    { label: "Jurisdictions live", value: ov ? String(ov.jurisdictionsLive) : "3", delta: jm.countryCode, sub: "", tone: "info" },
  ];
  const rv: [string, number][] = [["J", 1.28], ["F", 1.35], ["M", 1.42], ["A", 1.55], ["M", 1.63], ["J", 1.74], ["J", 1.88], ["A", 1.97], ["S", 2.08], ["O", 2.19], ["N", 2.31], ["D", 2.42]];
  const signups = [
    ["Blue Mountain Builders", "St. Andrew", "Core", "12m"],
    ["Reef & Rock Masonry", "St. James", "Starter", "48m"],
    ["Portmore Concrete Co.", "St. Catherine", "Pro", "2h"],
    ["Yallahs Roofing Ltd", "St. Thomas", "Free", "3h"],
    ["Falmouth Fit-Out", "Trelawny", "Core", "5h"],
  ];
  const alerts = [
    { tone: "critical", text: "Supplier 'ARC Systems' feed stale — 26h since last OK fetch", time: "triggered 1h ago" },
    { tone: "warn", text: "3 regulatory changes awaiting review (1 past effective date)", time: "updated 20m ago" },
    { tone: "good", text: "Payments reconciled — 892 active subscriptions matched", time: "2h ago" },
    { tone: "info", text: published ? "Rule-pack JM v2025.4 published to production" : "Rule-pack JM v2025.3 live in production", time: "today 09:14" },
  ];
  const tenantsMock: TenantRow[] = [
    ["Blue Mountain Builders", "St. Andrew", "Core", "128-540-991", "active", "4m ago", 3820000, 214, 18],
    ["Portmore Concrete Co.", "St. Catherine", "Pro", "094-118-330", "active", "22m ago", 9140500, 486, 41],
    ["Reef & Rock Masonry", "St. James", "Starter", "551-902-114", "trial", "1h ago", 612000, 38, 6],
    ["Falmouth Fit-Out", "Trelawny", "Core", "203-771-845", "active", "3h ago", 2455000, 151, 12],
    ["Spanish Town Steelworks", "St. Catherine", "Pro", "337-220-676", "active", "5h ago", 7788000, 402, 33],
    ["Yallahs Roofing Ltd", "St. Thomas", "Free", "480-114-209", "trial", "8h ago", 88000, 9, 2],
    ["Mandeville Millwork", "Manchester", "Starter", "661-903-552", "past_due", "2d ago", "—", 72, 7],
    ["Negril Coastal Homes", "Westmoreland", "Core", "775-241-018", "active", "1d ago", 3010000, 168, 14],
    ["Ocho Rios Renovations", "St. Ann", "Pro", "118-663-490", "active", "6h ago", 6420000, 357, 29],
    ["Old Harbour Plumbing", "St. Catherine", "Free", "902-556-103", "churned", "34d ago", "—", 24, 3],
  ];
  const tenantsRaw: TenantRow[] = data.tenants.length
    ? data.tenants.map((t): TenantRow => [t.name, t.parish ?? "—", t.plan, t.trn ?? "—", t.status, relativeTime(t.createdAt), "—", t.quoteCount, t.quoteCount])
    : tenantsMock;
  // Real business ids, index-aligned with tenantsRaw — null for the
  // design-mock rows (no real business behind them, so no plan toggle).
  const tenantIds: (string | null)[] = data.tenants.length ? data.tenants.map((t) => t.id) : tenantsMock.map(() => null);
  // Suspended flag, index-aligned with tenantsRaw (from GET
  // /admin/tenants?includeSuspended=true) — mock rows are never suspended.
  const tenantSuspendedBase: boolean[] = data.tenants.length ? data.tenants.map((t) => t.suspended) : tenantsMock.map(() => false);
  const statusMap: Record<string, [string, string]> = { active: ["Active", "good"], trial: ["Trial", "info"], past_due: ["Past due", "warn"], churned: ["Churned", "muted"] };
  const initOf = (name: string) => name.split(" ").slice(0, 2).map((w) => w[0]).join("");
  const cnt = (st: string) => tenantsRaw.filter((t) => t[4] === st).length;
  const tenantFilters = [["All", "1,284", true], ["Active", cnt("active")], ["Trial", cnt("trial")], ["Past due", cnt("past_due")], ["Churned", cnt("churned")]];


  const regMap: Record<string, [string, string]> = { needs: ["Needs review", "warn"], monitoring: ["Monitoring", "info"], applied: ["Applied", "good"] };
  const regMock: RegRow[] = [
    ["Tourism-sector GCT sub-rate (10%)", "TAJ", "2025-04-01", "2025-03-28", "needs"],
    ["Minimum wage revision — Gazette No. 42", "Jamaica Gazette", "2025-06-01", "2025-03-25", "needs"],
    ["NHT contribution ceiling adjustment", "NHT", "2025-05-15", "2025-03-20", "monitoring"],
    ["HEART Trust levy clarification", "HEART/NSTA", "2025-03-01", "2025-02-14", "monitoring"],
    ["Education Tax rate confirmation", "TAJ", "2025-01-01", "2024-12-10", "applied"],
  ];
  const regChanges: RegRow[] = data.regulatory.length
    ? data.regulatory.map((r): RegRow => [r.title, r.category, r.effectiveDate ? r.effectiveDate.slice(0, 10) : "—", r.actionNeeded ? "action needed" : "—", r.actionNeeded ? "needs" : "monitoring"])
    : regMock;
  const regStats = data.regulatory.length
    ? [
        { value: String(regChanges.filter((r) => r[4] === "needs").length), label: "Needs review", tone: "warn" },
        { value: String(regChanges.filter((r) => r[4] === "monitoring").length), label: "Monitoring", tone: "info" },
        { value: String(regChanges.filter((r) => r[4] === "applied").length), label: "Applied (YTD)", tone: "good" },
      ]
    : [
        { value: "2", label: "Needs review", tone: "warn" },
        { value: "2", label: "Monitoring", tone: "info" },
        { value: "31", label: "Applied (YTD)", tone: "good" },
      ];

  // rule-pack — the editable consumption-tax + provenance + statutory rates come
  // from the effective pack (GET /admin/rulepack; live `rulepack` state); the
  // code-owned values (taxpayer id, regions, payment rails) stay from core `jm`.
  const verified = pill("accent", { padding: "3px 10px" });
  const rp = rulepack; // effective pack, or null when the API was unreachable
  const taxLabelEff = rp?.taxLabel ?? jm.taxLabel;
  const taxRateEff = rp?.defaultTaxRatePct ?? jm.defaultTaxRatePct;
  const verifiedEff = rp?.verifiedAsOf ?? jm.verifiedAsOf;
  const sourceEff = rp?.sourceUrl ?? jm.sources[0] ?? null;
  const rpOverridden = rp?.overridden ?? false;
  const taxProv = `${verifiedEff ? `Verified ${verifiedEff}` : "Unverified"} · ${rpOverridden ? "admin override" : "core baseline"}`;
  const ruleCards = [
    { label: "CONSUMPTION TAX", value: `${taxLabelEff} ${taxRateEff}%`, detail: `${jm.taxLongName} · single standard rate`, provenance: taxProv, sourceLink: sourceEff ? "Source" : "TAJ", chips: [] as string[] },
    { label: "TAXPAYER ID", value: jm.taxpayerId.label, detail: "Format NNN-NNN-NNN · 9 digits · checksum validated", provenance: "Code-owned · not editable", sourceLink: "TAJ", chips: [] as string[] },
    { label: `REGIONS — ${jm.regions.length} ${jm.regionLabel.toUpperCase()}ES`, value: `${jm.regions.length} parishes`, detail: "Used for parish-level tax & delivery logic", provenance: "Code-owned · not editable", sourceLink: "Gov.jm", chips: [...jm.regions] },
    { label: "PAYMENT RAILS", value: jm.paymentProviders.map((p) => p.label).join(" · "), detail: "Digital wallets available for client invoicing", provenance: "Code-owned · not editable", sourceLink: "BOJ", chips: [] as string[] },
  ];
  // Payroll statutory rates now come from the effective pack (admin-editable);
  // fall back to the core item list (rates unset) when the API was unreachable.
  const payroll = (rp?.statutory ?? jm.statutory.map((s) => ({ code: s.code, label: s.label, employeePct: null as number | null, employerPct: null as number | null, verified: false, asOf: null as string | null }))).map((s) => ({
    name: s.code === "EDUCATION_TAX" ? "Education Tax" : s.code,
    full: s.label,
    employee: s.employeePct != null ? `${s.employeePct}%` : "—",
    employer: s.employerPct != null ? `${s.employerPct}%` : "—",
    verified: s.verified,
    prov: s.asOf ? `TAJ · ${s.asOf}` : "Not sourced yet",
  }));
  const payrollVerifiedCount = payroll.filter((p) => p.verified).length;

  const selTenant = tenantId !== null ? tenantsRaw[tenantId] : null;

  // --- Financials screen data (GET /admin/financials) ---
  const financials = data.financials;
  const upcomingRenewals = financials
    ? [...financials.upcomingRenewals].sort((a, b) => a.renewsAt.localeCompare(b.renewsAt))
    : [];

  // --- Activity screen data (GET /admin/audit, newest first) ---
  const auditEntries = data.audit;

  const iconStroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  return (
    <div className={`${styles.root} ${styles.scr} ${styles.shell}`} data-theme={theme}>
      {/* Mobile header — hidden on desktop via CSS. */}
      <header className={styles.topbar}>
        <button
          type="button"
          className={styles.hamburger}
          aria-label="Open navigation menu"
          aria-expanded={navOpen}
          onClick={() => setNavOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>
        <div style={{ ...archivo, fontWeight: 800, fontSize: 15 }}>JamQuote staff</div>
      </header>

      {navOpen && <div className={styles.backdrop} onClick={closeNav} aria-hidden="true" />}

      {/* SIDEBAR */}
      <aside className={`${styles.aside} ${navOpen ? styles.asideOpen : ""}`}>
        <div style={{ padding: "18px 18px 14px", display: "flex", alignItems: "center", gap: 11, borderBottom: "1px solid var(--border)" }}>
          <div style={{ width: 34, height: 34, flex: "none", borderRadius: 9, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--surface)" }}>
            <svg width="19" height="19" viewBox="0 0 24 24" {...iconStroke} strokeWidth={2.4}><path d="M4 20V7l8-4 8 4v13" /><path d="M9 20v-6h6v6" /></svg>
          </div>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ ...archivo, fontWeight: 800, fontSize: 16, letterSpacing: "-.01em" }}>JamQuote</div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, letterSpacing: ".03em" }}>STAFF CONSOLE</div>
          </div>
        </div>
        <nav className={styles.scr} style={{ flex: 1, overflowY: "auto", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".09em", color: "var(--muted)", padding: "6px 10px 8px" }}>MONITOR</div>
          <button className={styles.navBtn} onClick={() => go("overview")} style={navBtn("overview")}>
            <svg width="17" height="17" viewBox="0 0 24 24" {...iconStroke}><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></svg>
            <span>Platform overview</span>
          </button>
          <button className={styles.navBtn} onClick={() => go("tenants")} style={navBtn("tenants")}>
            <svg width="17" height="17" viewBox="0 0 24 24" {...iconStroke}><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" /></svg>
            <span>Tenants</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{ov ? ov.businesses.toLocaleString() : "1,284"}</span>
          </button>
          {canViewFinancials && (
            <button className={styles.navBtn} onClick={() => go("financials")} style={navBtn("financials")}>
              <svg width="17" height="17" viewBox="0 0 24 24" {...iconStroke}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>
              <span>Financials</span>
            </button>
          )}
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".09em", color: "var(--muted)", padding: "16px 10px 8px" }}>GOVERN</div>
          <button className={styles.navBtn} onClick={() => go("regulatory")} style={navBtn("regulatory")}>
            <svg width="17" height="17" viewBox="0 0 24 24" {...iconStroke}><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /><path d="M9 12l2 2 4-4" /></svg>
            <span>Regulatory queue</span>
            <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "var(--warn)", background: "color-mix(in srgb,var(--warn) 16%,transparent)", borderRadius: 6, padding: "1px 7px" }}>3</span>
          </button>
          <button className={styles.navBtn} onClick={() => go("rulepack")} style={navBtn("rulepack")}>
            <svg width="17" height="17" viewBox="0 0 24 24" {...iconStroke}><path d="M4 4h11l5 5v11H4z" /><path d="M15 4v5h5" /><path d="M8 13h6M8 17h4" /></svg>
            <span>Rule-pack verify</span>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", marginLeft: "auto" }} />
          </button>
          <button className={styles.navBtn} onClick={() => go("pricing")} style={navBtn("pricing")}>
            <svg width="17" height="17" viewBox="0 0 24 24" {...iconStroke}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1 3 2.2c0 2.8-6 1.3-6 4.1 0 1.2 1.3 2.2 3 2.2s3-1.1 3-2.5" /></svg>
            <span>Pricing</span>
          </button>
          <button className={styles.navBtn} onClick={() => go("activity")} style={navBtn("activity")}>
            <svg width="17" height="17" viewBox="0 0 24 24" {...iconStroke}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
            <span>Activity log</span>
          </button>
          {canManageAdmins && (
            <button className={styles.navBtn} onClick={() => go("admins")} style={navBtn("admins")}>
              <svg width="17" height="17" viewBox="0 0 24 24" {...iconStroke}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M17 8h5M19.5 5.5v5" /></svg>
              <span>Admins</span>
            </button>
          )}
        </nav>
        <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 9, background: "var(--surface-alt)" }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--info)", color: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12 }}>{adminInitials}</div>
            <div style={{ lineHeight: 1.2, flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{admin.name}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{admin.email || "Platform Admin"}</div>
            </div>
          </div>
          <form action={logout} style={{ marginTop: 8 }}>
            <button
              type="submit"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "inherit", fontSize: 12, cursor: "pointer" }}
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* MAIN */}
      <main className={styles.main}>
        <header className={styles.screenHeader} style={{ borderBottom: "1px solid var(--border)", background: "color-mix(in srgb,var(--surface) 70%,transparent)", backdropFilter: "blur(8px)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...archivo, fontWeight: 700, fontSize: 17, letterSpacing: "-.01em", lineHeight: 1.1 }}>{screenTitle}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.2 }}>{screenDesc}</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <div className={styles.headerSearch} style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--muted)", fontSize: 13 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>
              <span>Search tenants, TRN, rules…</span>
              <span style={{ marginLeft: "auto", fontSize: 11, border: "1px solid var(--border)", borderRadius: 4, padding: "1px 5px" }}>⌘K</span>
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 11px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", color: "var(--good)", background: "color-mix(in srgb,var(--good) 13%,transparent)", border: "1px solid color-mix(in srgb,var(--good) 30%,transparent)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--good)" }} />PRODUCTION
            </div>
            <button className={styles.iconBtn} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle theme" style={{ width: 34, height: 34, flex: "none", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--text)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {theme === "dark" ? (
                <svg width="17" height="17" viewBox="0 0 24 24" {...iconStroke}><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" {...iconStroke}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
              )}
            </button>
          </div>
        </header>

        <div className={styles.scr} style={{ flex: 1, overflowY: "auto", position: "relative" }}>
          {/* OVERVIEW */}
          {screen === "overview" && (
            <div className={`${styles.fadein} ${styles.screen}`} style={{ maxWidth: 1240, margin: "0 auto" }}>
              <div className={styles.statTiles} style={{ marginBottom: 22 }}>
                {stats.map((s) => (
                  <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 16px 15px", boxShadow: "var(--shadow)" }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", marginBottom: 9 }}>{s.label}</div>
                    <div style={{ ...archivo, fontWeight: 700, fontSize: 26, letterSpacing: "-.02em", lineHeight: 1 }}>{s.value}</div>
                    <div style={{ marginTop: 9, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ color: `var(--${s.tone})`, fontWeight: 700 }}>{s.delta}</span>
                      <span style={{ color: "var(--muted)", fontWeight: 500 }}>{s.sub}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className={styles.overviewSplit} style={{ marginBottom: 16 }}>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", boxShadow: "var(--shadow)" }}>
                  <div className={styles.mrrHead} style={{ marginBottom: 18 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>Monthly recurring revenue</div>
                      <div style={{ ...archivo, fontWeight: 700, fontSize: 24, letterSpacing: "-.02em", marginTop: 3 }}>{money(2418540)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 16, textAlign: "right" }}>
                      <div><div style={{ fontSize: 11, color: "var(--muted)" }}>Net new</div><div style={{ ...archivo, fontWeight: 700, fontSize: 15, color: "var(--good)" }}>+$108,420</div></div>
                      <div><div style={{ fontSize: 11, color: "var(--muted)" }}>Churn</div><div style={{ ...archivo, fontWeight: 700, fontSize: 15 }}>1.9%</div></div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 150 }}>
                    {rv.map((r, i) => (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, height: "100%", justifyContent: "flex-end" }}>
                        <div style={{ width: "100%", height: `${(r[1] / 2.5) * 100}%`, borderRadius: "5px 5px 2px 2px", background: i === rv.length - 1 ? "var(--accent)" : "color-mix(in srgb, var(--info) 55%, var(--surface-alt))", transition: "height .4s" }} />
                        <div style={{ fontSize: 9.5, color: "var(--muted)", fontWeight: 600 }}>{r[0]}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", boxShadow: "var(--shadow)", display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>Recent signups</div>
                    <a className={styles.link} href="#" onClick={(e) => { e.preventDefault(); go("tenants"); }} style={{ fontSize: 12, fontWeight: 600 }}>View all</a>
                  </div>
                  {signups.map((g) => (
                    <div key={g[0]} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ width: 30, height: 30, flex: "none", borderRadius: 8, background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center", ...archivo, fontWeight: 700, fontSize: 12, color: "var(--muted)" }}>{initOf(g[0]!)}</div>
                      <div style={{ minWidth: 0, flex: 1, lineHeight: 1.25 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g[0]}</div>
                        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{g[1]}</div>
                      </div>
                      <span style={pill(planTone[g[2]!]!)}>{g[2]}</span>
                      <div style={{ fontSize: 11, color: "var(--muted)", width: 44, textAlign: "right" }}>{g[3]}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "6px 8px", boxShadow: "var(--shadow)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px 6px" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></svg>
                  <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".02em", color: "var(--muted)" }}>SYSTEM ALERTS</span>
                </div>
                <div className={styles.alertGrid} style={{ padding: "2px 6px 6px" }}>
                  {alerts.map((a, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "11px 12px", borderRadius: 10, background: "var(--surface-alt)" }}>
                      <span style={dot(a.tone)} />
                      <div style={{ lineHeight: 1.3 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{a.text}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{a.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TENANTS */}
          {screen === "tenants" && (
            <div className={`${styles.fadein} ${styles.screen}`}>
              <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                {tenantFilters.map((f, i) => (
                  <div key={String(f[0])} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid var(--border)", background: i === 0 ? "var(--surface-alt)" : "var(--surface)", color: "var(--text)" }}>
                    {f[0]}<span style={{ color: "var(--muted)", fontWeight: 600, marginLeft: 2 }}>{String(f[1])}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow)" }}>
                <div className={styles.tableScroll}>
                <table className={`${styles.dataTable} ${styles.dataTableWide}`}>
                  <thead><tr style={{ background: "var(--surface-alt)" }}>
                    <th style={th}>BUSINESS</th><th style={th}>PARISH</th><th style={th}>PLAN</th><th style={th}>TRN</th><th style={th}>STATUS</th><th style={{ ...th, textAlign: "right" }}>LAST ACTIVE</th><th style={{ ...th, textAlign: "right" }}>ACTIONS</th>
                  </tr></thead>
                  <tbody>
                    {tenantsRaw.map((t, i) => {
                      const [sl, st] = statusMap[t[4]] ?? ["Active", "good"];
                      const id = tenantIds[i];
                      const currentPlan = (id && tenantPlanOverride[id]) || t[2];
                      const busy = id ? !!tenantPlanBusy[id] : false;
                      const rowError = id ? !!tenantPlanError[id] : false;
                      const suspended = id ? tenantSuspendOverride[id] ?? tenantSuspendedBase[i] ?? false : false;
                      const lifecycleBusy = id ? !!tenantLifecycleBusy[id] : false;
                      const lifecycleError = id ? tenantLifecycleError[id] : "";
                      return (
                        <tr
                          key={i}
                          className={styles.rowHover}
                          onClick={() => setTenantId(i)}
                          style={{
                            cursor: "pointer",
                            transition: "background .12s",
                            opacity: suspended ? 0.58 : 1,
                            background: suspended ? "color-mix(in srgb, var(--critical) 5%, transparent)" : undefined,
                          }}
                        >
                          <td style={td}><div style={{ display: "flex", alignItems: "center", gap: 11 }}><div style={{ width: 30, height: 30, flex: "none", borderRadius: 8, background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center", ...archivo, fontWeight: 700, fontSize: 11, color: "var(--muted)" }}>{initOf(t[0])}</div><span style={{ fontWeight: 600 }}>{t[0]}</span></div></td>
                          <td style={{ ...td, color: "var(--muted)" }}>{t[1]}</td>
                          <td style={td}><span style={pill(planTone[planDisplay(currentPlan)] ?? "muted")}>{planDisplay(currentPlan)}</span></td>
                          <td style={{ ...td, ...archivo, fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>{t[3]}</td>
                          <td style={td}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={pill(st)}>{sl}</span>
                              {suspended && <span style={pill("critical")}>Suspended</span>}
                            </div>
                          </td>
                          <td style={{ ...td, textAlign: "right", color: "var(--muted)" }}>{t[5]}</td>
                          <td style={{ ...td, textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                            {id && canManageTenants ? (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                  <button
                                    disabled={busy}
                                    onClick={() => toggleTenantPlan(id, currentPlan)}
                                    style={{ height: 28, padding: "0 11px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: "inherit", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", opacity: busy ? 0.6 : 1 }}
                                  >
                                    {busy ? "Saving…" : isPro(currentPlan) ? "Set Free" : "Set Pro"}
                                  </button>
                                  <button
                                    disabled={lifecycleBusy}
                                    onClick={() => toggleTenantSuspend(id, suspended)}
                                    style={{ height: 28, padding: "0 11px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: lifecycleBusy ? "default" : "pointer", fontFamily: "inherit", border: "1px solid var(--border)", background: "var(--surface)", color: suspended ? "var(--good)" : "var(--warn)", opacity: lifecycleBusy ? 0.6 : 1 }}
                                  >
                                    {lifecycleBusy ? "…" : suspended ? "Restore" : "Suspend"}
                                  </button>
                                  <button
                                    onClick={() => openDeleteModal(id, t[0])}
                                    style={{ height: 28, padding: "0 11px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "1px solid color-mix(in srgb, var(--critical) 45%, var(--border))", background: "color-mix(in srgb, var(--critical) 10%, transparent)", color: "var(--critical)" }}
                                  >
                                    Delete
                                  </button>
                                </div>
                                {rowError && <span style={{ fontSize: 10.5, color: "var(--critical)" }}>Failed — retry</span>}
                                {lifecycleError && <span style={{ fontSize: 10.5, color: "var(--critical)", maxWidth: 220 }}>{lifecycleError}</span>}
                              </div>
                            ) : (
                              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}


          {/* REGULATORY */}
          {screen === "regulatory" && (
            <div className={`${styles.fadein} ${styles.screen}`} style={{ maxWidth: 1100, margin: "0 auto" }}>
              <div className={styles.regStatRow} style={{ marginBottom: 18 }}>
                {regStats.map((s) => (
                  <div key={s.label} style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "15px 18px", boxShadow: "var(--shadow)", display: "flex", alignItems: "center", gap: 13 }}>
                    <span style={{ width: 11, height: 11, borderRadius: "50%", flex: "none", background: `var(--${s.tone})` }} />
                    <div><div style={{ ...archivo, fontWeight: 700, fontSize: 22, lineHeight: 1 }}>{s.value}</div><div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{s.label}</div></div>
                  </div>
                ))}
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow)" }}>
                {regChanges.map((r, i) => {
                  const [sl, st] = regMap[r[4]]!;
                  const isNeeds = r[4] === "needs";
                  return (
                    <div key={i} className={`${styles.rowHover} ${styles.regRow}`} style={{ padding: "15px 18px", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ width: 40, height: 40, flex: "none", borderRadius: 10, background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}><path d="M4 4h11l5 5v11H4z" /><path d="M15 4v5h5" /></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{r[0]}</div>
                        <div className={styles.regMeta} style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}><span style={{ fontWeight: 600, color: "var(--info)" }}>{r[1]}</span>·<span>Effective {r[2]}</span>·<span>Flagged {r[3]}</span></div>
                      </div>
                      <span style={pill(st)}>{sl}</span>
                      <button onClick={() => { go("rulepack"); if (r[0].includes("GCT")) setDiffOpen(true); }} style={{ height: 32, padding: "0 13px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: isNeeds ? "none" : "1px solid var(--border)", background: isNeeds ? "var(--accent)" : "var(--surface)", color: isNeeds ? "#fff" : "var(--text)" }}>{isNeeds ? "Review diff" : "View"}</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* RULE-PACK */}
          {screen === "rulepack" && (
            <div className={`${styles.fadein} ${styles.screen}`} style={{ maxWidth: 1180, margin: "0 auto" }}>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px", boxShadow: "var(--shadow)", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
                  <div style={{ width: 52, height: 52, flex: "none", borderRadius: 12, background: "linear-gradient(135deg,#0a7d3f,#f7d20e 55%,#0a0a0a)", display: "flex", alignItems: "center", justifyContent: "center", ...archivo, fontWeight: 800, color: "#fff", fontSize: 19, boxShadow: "var(--shadow)" }}>JM</div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ ...archivo, fontWeight: 800, fontSize: 22, letterSpacing: "-.02em" }}>{jm.countryName}</span>
                      <span style={{ ...archivo, fontWeight: 700, fontSize: 12, background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: 7, padding: "3px 9px", letterSpacing: ".02em" }}>{rp?.rulePackVersion ?? jm.rulePackVersion}</span>
                      <span style={pill(rpOverridden ? "warn" : "good", { padding: "3px 10px" })}>{rpOverridden ? "Admin override" : "Core baseline"}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }}>Rule-pack governs {taxLabelEff}, {jm.taxpayerId.label} validation, parish regions, payroll statutory items &amp; payment rails · {verifiedEff ? `Verified ${verifiedEff}` : "Unverified"}{rp?.updatedAt ? ` · last edited ${rp.updatedAt.slice(0, 10)}` : ""}</div>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>
                    Editable values are DB-backed; everything else is code-owned in the app.
                  </span>
                </div>
              </div>

              {/* Editable slice — gated by MANAGE_RULEPACK (the API enforces it too). */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", boxShadow: "var(--shadow)", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ ...archivo, fontWeight: 700, fontSize: 15 }}>Edit jurisdiction values</div>
                  {rpOverridden && <span style={pill("warn", { padding: "3px 10px" })}>Override active</span>}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16 }}>
                  Overrides the static baseline for the consumption-tax rate, its provenance, and the statutory
                  payroll rates. The tax rate seeds every newly-registered business&apos;s default {taxLabelEff}.
                </div>
                {!rpForm ? (
                  <div style={{ fontSize: 13, color: "var(--critical)" }}>Couldn&apos;t load the rule-pack — is the API running?</div>
                ) : (
                  <>
                    <div className={styles.formGrid} style={{ marginBottom: 16 }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>
                        Consumption-tax rate (%)
                        <input type="number" min={0} max={100} step="0.01" disabled={!canManageRulepack} value={rpForm.defaultTaxRatePct}
                          onChange={(e) => setRpForm((f) => (f ? { ...f, defaultTaxRatePct: e.target.value } : f))}
                          style={{ height: 36, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13.5, fontFamily: "inherit" }} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>
                        Tax label
                        <input type="text" maxLength={16} disabled={!canManageRulepack} value={rpForm.taxLabel}
                          onChange={(e) => setRpForm((f) => (f ? { ...f, taxLabel: e.target.value } : f))}
                          style={{ height: 36, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13.5, fontFamily: "inherit" }} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>
                        Verified as of
                        <input type="date" disabled={!canManageRulepack} value={rpForm.verifiedAsOf}
                          onChange={(e) => setRpForm((f) => (f ? { ...f, verifiedAsOf: e.target.value } : f))}
                          style={{ height: 36, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13.5, fontFamily: "inherit" }} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>
                        Source URL
                        <input type="url" placeholder="https://…" disabled={!canManageRulepack} value={rpForm.sourceUrl}
                          onChange={(e) => setRpForm((f) => (f ? { ...f, sourceUrl: e.target.value } : f))}
                          style={{ height: 36, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13.5, fontFamily: "inherit" }} />
                      </label>
                    </div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)", marginBottom: 8 }}>STATUTORY PAYROLL RATES (%)</div>
                    <div className={styles.statutoryGrid} style={{ marginBottom: 16 }}>
                      <div className={styles.statutorySpacer} />
                      <div className={styles.statutoryHead} style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>EMPLOYEE</div>
                      <div className={styles.statutoryHead} style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>EMPLOYER</div>
                      {(rp?.statutory ?? []).map((s) => (
                        <div key={s.code} style={{ display: "contents" }}>
                          <div className={styles.statutoryLabel}>{s.code === "EDUCATION_TAX" ? "Education Tax" : s.code}<span style={{ fontWeight: 400, color: "var(--muted)" }}> · {s.label}</span></div>
                          <input className={styles.statInput} type="number" min={0} max={100} step="0.01" placeholder="—" disabled={!canManageRulepack} value={rpForm.statutory[s.code]?.employeePct ?? ""}
                            onChange={(e) => setRpStat(s.code, "employeePct", e.target.value)}
                            style={{ height: 32, padding: "0 9px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", textAlign: "right" }} />
                          <input className={styles.statInput} type="number" min={0} max={100} step="0.01" placeholder="—" disabled={!canManageRulepack} value={rpForm.statutory[s.code]?.employerPct ?? ""}
                            onChange={(e) => setRpStat(s.code, "employerPct", e.target.value)}
                            style={{ height: 32, padding: "0 9px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", textAlign: "right" }} />
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <button onClick={saveRulepack} disabled={rpSaving || !canManageRulepack}
                        title={canManageRulepack ? undefined : "You don't have the Manage rule-packs capability"}
                        style={{ height: 38, padding: "0 18px", border: "none", borderRadius: 9, background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: rpSaving || !canManageRulepack ? "default" : "pointer", fontFamily: "inherit", opacity: rpSaving || !canManageRulepack ? 0.7 : 1 }}>
                        {rpSaving ? "Saving…" : "Save rule-pack"}
                      </button>
                      {!canManageRulepack && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Read-only — needs the Manage rule-packs capability.</span>}
                      {rpStatus === "saved" && <span style={{ fontSize: 13, color: "var(--good)", fontWeight: 600 }}>Saved ✓</span>}
                      {rpStatus === "error" && <span style={{ fontSize: 13, color: "var(--critical)", fontWeight: 600 }}>Couldn&apos;t save — check the values and try again.</span>}
                    </div>
                  </>
                )}
              </div>

              <div className={styles.ruleCardGrid} style={{ marginBottom: 16 }}>
                {ruleCards.map((c) => (
                  <div key={c.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", boxShadow: "var(--shadow)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)" }}>{c.label}</div>
                      <span style={verified}>Verified ✓</span>
                    </div>
                    <div style={{ ...archivo, fontWeight: 700, fontSize: 24, letterSpacing: "-.02em", lineHeight: 1.05 }}>{c.value}</div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }}>{c.detail}</div>
                    {c.chips.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                        {c.chips.map((p) => (
                          <span key={p} style={{ fontSize: 11.5, fontWeight: 500, padding: "3px 9px", borderRadius: 7, background: "var(--surface-alt)", border: "1px solid var(--border)" }}>{p}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: 11.5, color: "var(--muted)" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" {...iconStroke}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /></svg>
                      <span>{c.provenance}</span>
                      <a className={styles.link} href="#" onClick={(e) => e.preventDefault()} style={{ marginLeft: "auto", fontWeight: 600 }}>{c.sourceLink} ↗</a>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow)" }}>
                <div className={styles.cardHead} style={{ padding: "16px 20px 12px" }}>
                  <div>
                    <div style={{ ...archivo, fontWeight: 700, fontSize: 15 }}>Payroll statutory items</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Employee &amp; employer contribution rates applied to estimates with labour</div>
                  </div>
                  <span style={payrollVerifiedCount === payroll.length && payroll.length > 0 ? verified : pill("muted", { padding: "3px 10px" })}>
                    {payrollVerifiedCount === payroll.length && payroll.length > 0 ? `All ${payroll.length} verified ✓` : `${payrollVerifiedCount} of ${payroll.length} sourced`}
                  </span>
                </div>
                <div className={styles.tableScroll}>
                <table className={styles.dataTable}>
                  <thead><tr style={{ background: "var(--surface-alt)" }}>
                    <th style={{ ...th, padding: "10px 20px", borderTop: "1px solid var(--border)" }}>STATUTORY ITEM</th>
                    <th style={{ ...th, textAlign: "right", borderTop: "1px solid var(--border)" }}>EMPLOYEE</th>
                    <th style={{ ...th, textAlign: "right", borderTop: "1px solid var(--border)" }}>EMPLOYER</th>
                    <th style={{ ...th, padding: "10px 20px", borderTop: "1px solid var(--border)" }}>PROVENANCE</th>
                  </tr></thead>
                  <tbody>
                    {payroll.map((p) => (
                      <tr key={p.name}>
                        <td style={{ ...td, padding: "13px 20px" }}><div style={{ fontWeight: 600 }}>{p.name}</div><div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{p.full}</div></td>
                        <td style={{ ...td, textAlign: "right", ...archivo, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{p.employee}</td>
                        <td style={{ ...td, textAlign: "right", ...archivo, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{p.employer}</td>
                        <td style={{ ...td, padding: "13px 20px" }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}>{p.verified ? <span style={verified}>Verified ✓</span> : <span style={pill("muted", { padding: "3px 10px" })}>Unverified</span>}<span style={{ fontSize: 11.5, color: "var(--muted)" }}>{p.prov}</span></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}

          {/* PRICING */}
          {screen === "pricing" && (
            <div className={`${styles.fadein} ${styles.screen}`} style={{ maxWidth: 720, margin: "0 auto" }}>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px", boxShadow: "var(--shadow)" }}>
                <div style={{ ...archivo, fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Platform pricing</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 18 }}>
                  Sets the live PricingConfig — the free-tier monthly quote limit and Pro price shown to every
                  business. Takes effect immediately for new limit checks.
                </div>
                {pricingLoadError && !pricing && (
                  <div style={{ fontSize: 13, color: "var(--critical)", marginBottom: 14 }}>Couldn&apos;t load pricing — is the API running?</div>
                )}
                <div className={styles.formGrid} style={{ marginBottom: 16 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>
                    Free quotes / month
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={pricingForm.freeQuotesPerMonth}
                      onChange={(e) => setPricingForm((f) => ({ ...f, freeQuotesPerMonth: e.target.value }))}
                      style={{ height: 36, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13.5, fontFamily: "inherit" }}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>
                    Currency
                    <input
                      type="text"
                      value={pricingForm.currency}
                      onChange={(e) => setPricingForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                      maxLength={3}
                      style={{ height: 36, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13.5, fontFamily: "inherit" }}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>
                    Pro price / month ({pricingForm.currency || "—"})
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={pricingForm.proMonthlyPriceDollars}
                      onChange={(e) => setPricingForm((f) => ({ ...f, proMonthlyPriceDollars: e.target.value }))}
                      style={{ height: 36, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13.5, fontFamily: "inherit" }}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>
                    Pro price / year ({pricingForm.currency || "—"})
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={pricingForm.proAnnualPriceDollars}
                      onChange={(e) => setPricingForm((f) => ({ ...f, proAnnualPriceDollars: e.target.value }))}
                      style={{ height: 36, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13.5, fontFamily: "inherit" }}
                    />
                  </label>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    onClick={savePricing}
                    disabled={pricingSaving || !canManagePricing}
                    title={canManagePricing ? undefined : "You don't have the Manage pricing capability"}
                    style={{ height: 38, padding: "0 18px", border: "none", borderRadius: 9, background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: pricingSaving || !canManagePricing ? "default" : "pointer", fontFamily: "inherit", opacity: pricingSaving || !canManagePricing ? 0.7 : 1 }}
                  >
                    {pricingSaving ? "Saving…" : "Save pricing"}
                  </button>
                  {!canManagePricing && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Read-only — needs the Manage pricing capability.</span>}
                  {pricingStatus === "saved" && <span style={{ fontSize: 13, color: "var(--good)", fontWeight: 600 }}>Saved ✓</span>}
                  {pricingStatus === "error" && <span style={{ fontSize: 13, color: "var(--critical)", fontWeight: 600 }}>Couldn&apos;t save — is the API running?</span>}
                </div>
              </div>
            </div>
          )}

          {/* FINANCIALS */}
          {screen === "financials" && (
            <div className={`${styles.fadein} ${styles.screen}`} style={{ maxWidth: 1000, margin: "0 auto" }}>
              {!financials && (
                <div style={{ fontSize: 13, color: "var(--critical)", marginBottom: 16 }}>Couldn&apos;t load financials — is the API running?</div>
              )}
              <div className={styles.financeTiles} style={{ marginBottom: 18 }}>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px", boxShadow: "var(--shadow)" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", marginBottom: 9 }}>Free-tier businesses</div>
                  <div style={{ ...archivo, fontWeight: 700, fontSize: 26, letterSpacing: "-.02em" }}>{financials ? financials.freeCount.toLocaleString() : "—"}</div>
                </div>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px", boxShadow: "var(--shadow)" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", marginBottom: 9 }}>Pro businesses</div>
                  <div style={{ ...archivo, fontWeight: 700, fontSize: 26, letterSpacing: "-.02em", color: "var(--good)" }}>{financials ? financials.proCount.toLocaleString() : "—"}</div>
                </div>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px", boxShadow: "var(--shadow)" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", marginBottom: 9 }}>MRR</div>
                  <div style={{ ...archivo, fontWeight: 700, fontSize: 26, letterSpacing: "-.02em" }}>{financials ? formatJmd(financials.mrrCents) : "—"}</div>
                  {financials && (
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>
                      Pro @ {formatJmd(financials.proMonthlyPriceCents)}/mo · {financials.currency}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow)" }}>
                <div style={{ padding: "14px 18px 10px", ...archivo, fontWeight: 700, fontSize: 14.5 }}>Upcoming renewals (next 60 days)</div>
                {upcomingRenewals.length === 0 ? (
                  <div style={{ padding: "18px 18px 22px", fontSize: 13, color: "var(--muted)" }}>
                    {financials ? "No Pro renewals due in the next 60 days." : "—"}
                  </div>
                ) : (
                  <div className={styles.tableScroll}>
                  <table className={styles.dataTable}>
                    <thead><tr style={{ background: "var(--surface-alt)" }}>
                      <th style={th}>BUSINESS</th><th style={th}>PLAN</th><th style={{ ...th, textAlign: "right" }}>RENEWS</th>
                    </tr></thead>
                    <tbody>
                      {upcomingRenewals.map((r) => (
                        <tr key={r.businessId} className={styles.rowHover}>
                          <td style={{ ...td, padding: "12px 18px" }}>{r.businessName}</td>
                          <td style={{ ...td, padding: "12px 18px" }}><span style={pill(planTone[planDisplay(r.plan)] ?? "muted")}>{planDisplay(r.plan)}</span></td>
                          <td style={{ ...td, padding: "12px 18px", textAlign: "right", ...archivo, fontVariantNumeric: "tabular-nums" }}>{new Date(r.renewsAt).toLocaleDateString("en-JM", { year: "numeric", month: "short", day: "numeric" })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ACTIVITY */}
          {screen === "activity" && (
            <div className={`${styles.fadein} ${styles.screen}`} style={{ maxWidth: 1180, margin: "0 auto" }}>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow)" }}>
                <div className={styles.tableScroll}>
                <table className={`${styles.dataTable} ${styles.dataTableWide}`}>
                  <thead><tr style={{ background: "var(--surface-alt)" }}>
                    <th style={th}>WHEN</th><th style={th}>WHO</th><th style={th}>ACTION</th><th style={th}>TARGET</th><th style={th}>DETAILS</th>
                  </tr></thead>
                  <tbody>
                    {auditEntries.length === 0 ? (
                      <tr><td colSpan={5} style={{ ...td, padding: "18px", color: "var(--muted)" }}>No activity recorded yet.</td></tr>
                    ) : (
                      auditEntries.map((a) => (
                        <tr key={a.id} className={styles.rowHover}>
                          <td style={{ ...td, padding: "12px 16px", color: "var(--muted)", whiteSpace: "nowrap" }} title={a.createdAt}>{relativeTime(a.createdAt)}</td>
                          <td style={{ ...td, padding: "12px 16px" }}>{a.actorEmail}</td>
                          <td style={{ ...td, padding: "12px 16px", fontWeight: 600 }}>{a.action}</td>
                          <td style={{ ...td, padding: "12px 16px", color: "var(--muted)" }}>{a.targetType}{a.targetId ? ` · ${a.targetId}` : ""}</td>
                          <td style={{ ...td, padding: "12px 16px", color: "var(--muted)", fontSize: 12, ...archivo, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detailsPreview(a.details)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}

          {/* ADMINS — super-admin / MANAGE_ADMINS only */}
          {screen === "admins" && canManageAdmins && (
            <div className={`${styles.fadein} ${styles.screen}`} style={{ maxWidth: 1100, margin: "0 auto" }}>
              {/* Promote an existing user by email. */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px", boxShadow: "var(--shadow)", marginBottom: 16 }}>
                <div style={{ ...archivo, fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>+ Add admin</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>
                  Promote an existing JamQuote user by email — they must have signed up first. Choose which capabilities to grant.
                </div>
                <form onSubmit={submitPromote} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className={styles.formRow}>
                    <label className={styles.formField} style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                      User email
                      <input required type="email" value={promoteEmail} onChange={(e) => setPromoteEmail(e.target.value)} placeholder="name@example.com" style={inputStyle} />
                    </label>
                    <button
                      type="submit"
                      disabled={promoteBusy || !promoteEmail.trim()}
                      style={{ height: 36, padding: "0 16px", border: "none", borderRadius: 8, background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: promoteBusy ? "default" : "pointer", fontFamily: "inherit", opacity: promoteBusy || !promoteEmail.trim() ? 0.6 : 1, whiteSpace: "nowrap" }}
                    >
                      {promoteBusy ? "Adding…" : "Add admin"}
                    </button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {ADMIN_CAPABILITIES.map((cap) => (
                      <label key={cap} title={ADMIN_CAPABILITY_META[cap].description} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, padding: "5px 10px", border: "1px solid var(--border)", borderRadius: 8, background: promoteCaps.includes(cap) ? "var(--surface-alt)" : "var(--surface)", cursor: "pointer" }}>
                        <input type="checkbox" checked={promoteCaps.includes(cap)} onChange={() => setPromoteCaps((c) => toggleInList(c, cap))} />
                        {ADMIN_CAPABILITY_META[cap].label}
                      </label>
                    ))}
                  </div>
                </form>
                {promoteError && <div style={{ fontSize: 12.5, color: "var(--critical)", marginTop: 10 }}>{promoteError}</div>}
                {promoteOk && !promoteError && <div style={{ fontSize: 12.5, color: "var(--good)", marginTop: 10 }}>Admin added ✓</div>}
              </div>

              {/* Existing admins. */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow)" }}>
                <div className={styles.tableScroll}>
                <table className={styles.dataTable}>
                  <thead><tr style={{ background: "var(--surface-alt)" }}>
                    <th style={th}>ADMIN</th><th style={th}>CAPABILITIES</th><th style={{ ...th, textAlign: "right" }}>ACTIONS</th>
                  </tr></thead>
                  <tbody>
                    {data.admins.length === 0 ? (
                      <tr><td colSpan={3} style={{ ...td, padding: "18px", color: "var(--muted)" }}>No admins found.</td></tr>
                    ) : (
                      data.admins.map((a) => {
                        const self = isSelfAdmin(a);
                        const rowBusy = !!adminRowBusy[a.id];
                        const rowErr = adminRowError[a.id];
                        const caps = capsFor(a);
                        const dirty = a.id in capDraft;
                        return (
                          <tr key={a.id} className={styles.rowHover}>
                            <td style={{ ...td, padding: "13px 16px", verticalAlign: "top" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                <span style={{ fontWeight: 600 }}>
                                  {a.fullName || a.email || "—"}
                                  {self && <span style={{ color: "var(--muted)", fontWeight: 500 }}> (you)</span>}
                                </span>
                                {a.email && <span style={{ fontSize: 12, color: "var(--muted)" }}>{a.email}</span>}
                                {a.isSuperAdmin && <span style={{ ...pill("accent"), marginTop: 4, alignSelf: "flex-start" }}>Super-admin</span>}
                              </div>
                            </td>
                            <td style={{ ...td, padding: "13px 16px", verticalAlign: "top" }}>
                              {a.isSuperAdmin ? (
                                <span style={{ fontSize: 12.5, color: "var(--muted)" }}>All capabilities (super-admin)</span>
                              ) : (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {ADMIN_CAPABILITIES.map((cap) => (
                                    <label key={cap} title={ADMIN_CAPABILITY_META[cap].description} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 7, background: caps.includes(cap) ? "var(--surface-alt)" : "var(--surface)", cursor: "pointer" }}>
                                      <input type="checkbox" checked={caps.includes(cap)} onChange={() => setCapDraft((d) => ({ ...d, [a.id]: toggleInList(capsFor(a), cap) }))} />
                                      {ADMIN_CAPABILITY_META[cap].label}
                                    </label>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td style={{ ...td, padding: "13px 16px", textAlign: "right", verticalAlign: "top" }}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                                  {!a.isSuperAdmin && dirty && (
                                    <button disabled={rowBusy} onClick={() => saveAdminCaps(a)} style={{ height: 28, padding: "0 12px", border: "none", borderRadius: 7, background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 12, cursor: rowBusy ? "default" : "pointer", fontFamily: "inherit", opacity: rowBusy ? 0.6 : 1 }}>{rowBusy ? "…" : "Save"}</button>
                                  )}
                                  {me.isSuperAdmin && !self && (
                                    <button disabled={rowBusy} onClick={() => toggleSuperAdmin(a)} style={{ height: 28, padding: "0 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: rowBusy ? "default" : "pointer", fontFamily: "inherit", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}>{a.isSuperAdmin ? "Revoke super-admin" : "Make super-admin"}</button>
                                  )}
                                  {!self && (revokeConfirmId === a.id ? (
                                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                      <button disabled={rowBusy} onClick={() => doRevokeAdmin(a.id)} style={{ height: 28, padding: "0 11px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: rowBusy ? "default" : "pointer", fontFamily: "inherit", border: "1px solid color-mix(in srgb, var(--critical) 45%, var(--border))", background: "color-mix(in srgb, var(--critical) 10%, transparent)", color: "var(--critical)" }}>{rowBusy ? "…" : "Confirm revoke"}</button>
                                      <button onClick={() => setRevokeConfirmId(null)} style={{ height: 28, padding: "0 11px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}>Cancel</button>
                                    </span>
                                  ) : (
                                    <button onClick={() => setRevokeConfirmId(a.id)} style={{ height: 28, padding: "0 11px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--muted)" }}>Revoke</button>
                                  ))}
                                </div>
                                {rowErr && <span style={{ fontSize: 10.5, color: "var(--critical)", maxWidth: 260 }}>{rowErr}</span>}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* TENANT DRAWER */}
      {selTenant && <TenantDrawer raw={selTenant} onClose={() => setTenantId(null)} />}

      {/* PERMANENT DELETE MODAL — operator must type the exact business name;
          mirrors the server's confirmName check on DELETE /admin/tenants/:id. */}
      {deleteTarget && (
        <div onClick={closeDeleteModal} className={styles.modalOverlay} style={{ background: "rgba(15,12,8,.5)", zIndex: 55 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "100%", background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--critical) 40%, var(--border))", borderRadius: 16, boxShadow: "0 30px 80px -20px rgba(0,0,0,.55)", animation: "admin-fadein .2s ease" }}>
            <div style={{ padding: "20px 22px 4px", display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 36, height: 36, flex: "none", borderRadius: 10, background: "color-mix(in srgb, var(--critical) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--critical)" }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...archivo, fontWeight: 700, fontSize: 16.5 }}>Permanently delete tenant</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>
                  This permanently deletes <b style={{ color: "var(--text)" }}>{deleteTarget.name}</b> and ALL its data — clients,
                  jobs, quotes, invoices. This action cannot be undone.
                </div>
              </div>
            </div>
            <div style={{ padding: "14px 22px 4px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>
                Type the business name <b style={{ color: "var(--text)" }}>{deleteTarget.name}</b> to confirm
                <input
                  autoFocus
                  value={deleteTyped}
                  onChange={(e) => setDeleteTyped(e.target.value)}
                  placeholder={deleteTarget.name}
                  style={{ height: 38, padding: "0 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13.5, fontFamily: "inherit" }}
                />
              </label>
              {deleteError && <div style={{ fontSize: 12.5, color: "var(--critical)", marginTop: 10 }}>{deleteError}</div>}
            </div>
            <div style={{ padding: "18px 22px 22px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={closeDeleteModal}
                disabled={deleteBusy}
                style={{ height: 38, padding: "0 16px", border: "1px solid var(--border)", borderRadius: 9, background: "var(--surface)", color: "var(--text)", fontWeight: 600, fontSize: 13, cursor: deleteBusy ? "default" : "pointer", fontFamily: "inherit" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmHardDelete}
                disabled={deleteBusy || deleteTyped !== deleteTarget.name}
                style={{
                  height: 38,
                  padding: "0 18px",
                  border: "none",
                  borderRadius: 9,
                  background: "var(--critical)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: deleteBusy || deleteTyped !== deleteTarget.name ? "default" : "pointer",
                  fontFamily: "inherit",
                  opacity: deleteBusy || deleteTyped !== deleteTarget.name ? 0.5 : 1,
                }}
              >
                {deleteBusy ? "Deleting…" : "Permanently delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIFF MODAL */}
      {diffOpen && (
        <div onClick={() => setDiffOpen(false)} className={styles.modalOverlay} style={{ background: "rgba(15,12,8,.5)", zIndex: 50 }}>
          <div className={styles.scr} onClick={(e) => e.stopPropagation()} style={{ width: 760, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "0 30px 80px -20px rgba(0,0,0,.55)", animation: "admin-fadein .25s ease" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ ...archivo, fontWeight: 700, fontSize: 17 }}>Rule-pack change review</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>Jamaica · v2025.3 → <b style={{ color: "var(--text)" }}>v2025.4 (draft)</b> · Consumption tax</div>
              </div>
              <button className={styles.iconBtn} onClick={() => setDiffOpen(false)} style={{ width: 30, height: 30, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--muted)", cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
            <div style={{ padding: "18px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "var(--muted)", marginBottom: 16, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--info)" }}>Source: Tax Administration Jamaica (TAJ) ↗</span>·<span>Effective 2025-04-01</span>·<span>Flagged by rulebot · 2025-03-28</span>
              </div>
              <div className={styles.diffGrid}>
                <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "9px 14px", background: "var(--surface-alt)", fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)" }}>CURRENT · v2025.3</div>
                  <div style={{ padding: 14 }}><div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>GCT rate</div><div style={{ ...archivo, fontWeight: 700, fontSize: 20, marginTop: 4 }}>15%</div><div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>Single standard rate applied to all sectors. No sector-specific sub-rate.</div></div>
                </div>
                <div style={{ border: "1px solid color-mix(in srgb,var(--good) 45%,var(--border))", borderRadius: 12, overflow: "hidden", background: "color-mix(in srgb,var(--good) 7%,transparent)" }}>
                  <div style={{ padding: "9px 14px", background: "color-mix(in srgb,var(--good) 15%,transparent)", fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: "var(--good)" }}>INCOMING · v2025.4</div>
                  <div style={{ padding: 14 }}><div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>GCT rate</div><div style={{ ...archivo, fontWeight: 700, fontSize: 20, marginTop: 4 }}>15% <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>standard</span></div><div style={{ ...archivo, fontWeight: 700, fontSize: 16, marginTop: 6, color: "var(--good)" }}>+ 10% <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>tourism sector</span></div><div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>Adds reduced GCT sub-rate for accommodation &amp; tourism-registered vendors.</div></div>
                </div>
              </div>
              <div style={{ marginTop: 16, background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: 11, padding: "13px 15px", fontSize: 12.5, lineHeight: 1.5 }}>
                <b style={{ fontWeight: 700 }}>Reviewer note.</b> Verify vendor eligibility criteria against TAJ bulletin before publishing. Sub-rate must not apply to estimates outside NAICS tourism codes. <span style={{ color: "var(--muted)" }}>Assigned to Aisha Meyers.</span>
              </div>
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 12, color: "var(--muted)", flex: 1 }}>Publishing bumps the pack to <b style={{ color: "var(--text)" }}>v2025.4</b> and records an audit entry.</div>
              <button onClick={() => setDiffOpen(false)} style={{ height: 38, padding: "0 16px", border: "1px solid var(--border)", borderRadius: 9, background: "var(--surface)", color: "var(--text)", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Request changes</button>
              <button onClick={() => { setDiffOpen(false); setPublished(true); setToast(true); setTimeout(() => setToast(false), 3200); }} style={{ height: 38, padding: "0 18px", border: "none", borderRadius: 9, background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 7 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>Approve &amp; publish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 60, display: "flex", alignItems: "center", gap: 11, padding: "13px 18px", borderRadius: 11, background: "var(--text)", color: "var(--bg)", fontSize: 13, fontWeight: 600, boxShadow: "0 16px 40px -12px rgba(0,0,0,.5)", animation: "admin-fadein .3s ease" }}>
          <span style={{ display: "flex", width: 20, height: 20, borderRadius: "50%", background: "var(--good)", alignItems: "center", justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
          Rule-pack JM v2025.4 published to production
        </div>
      )}
    </div>
  );
}

function TenantDrawer({ raw, onClose }: { raw: [string, string, string, string, string, string, number | string, number, number]; onClose: () => void }) {
  const [name, parish, plan, trn, status, , mrr, q, qm] = raw;
  const statusMap: Record<string, [string, string]> = { active: ["Active", "good"], trial: ["Trial", "info"], past_due: ["Past due", "warn"], churned: ["Churned", "muted"] };
  const [sl, st] = statusMap[status] ?? ["Active", "good"];
  const init = name.split(" ").slice(0, 2).map((w) => w[0]).join("");
  const limit = plan === "Pro" ? 9999 : plan === "Core" ? 250 : plan === "Starter" ? 60 : 15;
  const seats = plan === "Pro" ? 12 : plan === "Core" ? 6 : plan === "Starter" ? 3 : 1;
  const usedSeats = Math.max(1, Math.round(seats * 0.7));
  const mrrPlan = ({ Free: 0, Starter: 4900, Core: 12900, Pro: 34900 } as Record<string, number>)[plan] ?? 0;
  const metrics = [
    { label: "Quotes created", value: String(q) },
    { label: "This month", value: String(qm) },
    { label: "Value quoted", value: mrr === "—" ? "—" : money(Number(mrr)) },
    { label: "Invoices sent", value: String(Math.round(q * 0.6)) },
  ];
  const usage = [
    { label: "Quotes", text: `${qm} / ${limit > 9000 ? "∞" : limit}`, w: Math.min(100, (qm / (limit > 9000 ? qm * 1.4 : limit)) * 100), tone: "accent" },
    { label: "Team seats", text: `${usedSeats} / ${seats}`, w: (usedSeats / seats) * 100, tone: "info" },
    { label: "Document storage", text: "2.1 / 10 GB", w: 21, tone: "good" },
  ];
  const sub = [["Plan", plan], ["MRR", money(mrrPlan)], ["Started", "2024-08-19"], ["Renews", "2025-05-19"], ["Payment rail", "Lynk"]];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,12,8,.42)", zIndex: 40 }} />
      <div className={`${styles.scr} ${styles.slidein} ${styles.drawer}`} style={{ background: "var(--surface)", borderLeft: "1px solid var(--border)", zIndex: 41, boxShadow: "-20px 0 50px -24px rgba(0,0,0,.4)" }}>
        <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", gap: 13 }}>
          <div style={{ width: 42, height: 42, flex: "none", borderRadius: 11, background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center", ...archivo, fontWeight: 700, fontSize: 14, color: "var(--muted)" }}>{init}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...archivo, fontWeight: 700, fontSize: 17, lineHeight: 1.15 }}>{name}</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>{parish} · TRN {trn}</div>
            <div style={{ display: "flex", gap: 7, marginTop: 9 }}><span style={pill(planTone[plan] ?? "muted")}>{plan}</span><span style={pill(st)}>{sl}</span></div>
          </div>
          <button className={styles.iconBtn} onClick={onClose} style={{ width: 30, height: 30, flex: "none", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--muted)", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: "18px 22px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
            {metrics.map((m) => (
              <div key={m.label} style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: 11, padding: "12px 13px" }}>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{m.label}</div>
                <div style={{ ...archivo, fontWeight: 700, fontSize: 19, marginTop: 5, letterSpacing: "-.01em" }}>{m.value}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)", marginBottom: 11 }}>USAGE THIS CYCLE</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 13, marginBottom: 20 }}>
            {usage.map((u) => (
              <div key={u.label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}><span style={{ fontWeight: 500 }}>{u.label}</span><span style={{ color: "var(--muted)", ...archivo, fontVariantNumeric: "tabular-nums" }}>{u.text}</span></div>
                <div style={{ height: 7, borderRadius: 5, background: "var(--surface-alt)", overflow: "hidden" }}><div style={{ height: "100%", width: `${u.w}%`, background: `var(--${u.tone})`, borderRadius: 5 }} /></div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)", marginBottom: 11 }}>SUBSCRIPTION</div>
          <div style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
            {sub.map((r) => (
              <div key={r[0]} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}><span style={{ color: "var(--muted)" }}>{r[0]}</span><span style={{ fontWeight: 600, ...archivo }}>{r[1]}</span></div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
