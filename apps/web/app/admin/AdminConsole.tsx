"use client";

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  getJurisdiction,
  formatJmd,
  subscriptionStanding,
  type SubscriptionStanding,
  rulePackVerification,
  ADMIN_CAPABILITIES,
  ADMIN_CAPABILITY_META,
  formatTrn,
} from "@jamquote/core";
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
  getSubscriptionPayments,
  runSubscriptionSweep,
  getSweepRuns,
  recordSubscriptionPayment,
  voidSubscriptionPayment,
  createRegulatory,
  updateRegulatory,
  reviewRegulatory,
  deleteRegulatory,
  ApiError,
  type AdminData,
  type AdminReg,
  type AdminTenant,
  type AdminSubscriptionPayment,
  type AdminSweepRun,
  type RegulatoryInput,
  type AdminUser,
  type PricingConfig,
  type UpdateRulePackInput,
  type EffectiveRulePack,
} from "@/lib/api-client";
import { logout } from "@/lib/auth-actions";
import { startImpersonation } from "@/lib/impersonation-actions";
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

// NOTE: there is deliberately no local `money()` helper any more.
//
// It formatted a number as currency WITHOUT converting from cents, and sat one
// character away from formatJmd, which does convert. Every money value in this
// console is cents, so the two were interchangeable to read and produced a
// 100x error to run: the Platform overview showed MRR as $400,000 while
// Financials showed the same figure as $4,000. formatJmd (from core, used by
// every other screen in the app) is now the only way money is rendered here.
const archivo: CSSProperties = { fontFamily: "var(--font-archivo), system-ui, sans-serif" };
const pill = (tone: string, extra?: CSSProperties): CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 999,
  fontSize: 12, fontWeight: 600, lineHeight: 1.4, whiteSpace: "nowrap",
  color: `var(--${tone})`, background: `color-mix(in srgb, var(--${tone}) 13%, transparent)`,
  border: `1px solid color-mix(in srgb, var(--${tone}) 30%, transparent)`, ...extra,
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

  // --- Rule-pack maintenance: contributions and sources ---
  // Lists the admin edits as a whole and submits with the rest of the pack, so
  // a new levy, a withdrawn one, or a changed set of pages to check needs no
  // release. Declared here — above the save handler that closes over them.
  const [rpCustom, setRpCustom] = useState<NonNullable<UpdateRulePackInput["statutoryCustom"]>>([]);
  const [rpRetired, setRpRetired] = useState<string[]>([]);
  const [rpSourcesDraft, setRpSourcesDraft] = useState(
    () => (data.rulepack?.sources ?? []).join("\n"),
  );
  // Only send `sources` when it has actually been edited, so an ordinary rate
  // save does not rewrite the pack's source list as a side effect.
  const [rpSourcesTouched, setRpSourcesTouched] = useState(false);
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
        // Complete lists, not patches — see UpdateRulePackInput. Sent only
        // when the admin has actually touched them, so an ordinary rate edit
        // does not rewrite the pack's structure as a side effect.
        ...(rpCustom.length > 0 ? { statutoryCustom: rpCustom } : {}),
        ...(rpRetired.length > 0 ? { statutoryRetired: rpRetired } : {}),
        ...(rpSourcesTouched
          ? {
              sources: rpSourcesDraft
                .split("\n")
                .map((u) => u.trim())
                .filter(Boolean),
            }
          : {}),
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

  /**
   * Set a tenant's plan AND term in one call.
   *
   * Replaces a Free/Pro toggle that could not express a yearly commitment at
   * all. `annual` renews a year out and is priced from proAnnualPriceCents,
   * which sits below twelve monthly payments — that discount is the incentive
   * to commit for a year.
   */
  function planChoiceOf(id: string, plan: string, interval: string): string {
    const pending = tenantPlanOverride[id];
    if (pending === "free" || pending === "pro-monthly" || pending === "pro-annual") return pending;
    if (!isPro(plan)) return "free";
    return interval === "annual" ? "pro-annual" : "pro-monthly";
  }

  async function setTenantPlanChoice(id: string, choice: string) {
    const plan = choice === "free" ? "free" : "pro";
    const interval = choice === "pro-annual" ? "annual" : "monthly";
    setTenantPlanBusy((b) => ({ ...b, [id]: true }));
    setTenantPlanError((e) => ({ ...e, [id]: false }));
    try {
      await setTenantPlan(id, { plan, interval });
      setTenantPlanOverride((o) => ({ ...o, [id]: choice }));
      router.refresh();
    } catch {
      setTenantPlanError((e) => ({ ...e, [id]: true }));
    } finally {
      setTenantPlanBusy((b) => ({ ...b, [id]: false }));
    }
  }


  // Re-runs the server AdminPage after every mutation so props reflect the
  // API's new state. Declared here because both the regulatory handlers below
  // and the tenant ones further down use it.
  const router = useRouter();

  // --- Regulatory feed CRUD (MANAGE_RULEPACK) ---
  // The feed was read-only: staff could see a change but not record one,
  // correct one, or mark it dealt with.
  const [regBusy, setRegBusy] = useState<Record<string, boolean>>({});
  const [regError, setRegError] = useState<string | null>(null);
  const [regEditing, setRegEditing] = useState<AdminReg | "new" | null>(null);

  async function runReg(key: string, fn: () => Promise<unknown>) {
    setRegBusy((b) => ({ ...b, [key]: true }));
    setRegError(null);
    try {
      await fn();
      router.refresh();
      setRegEditing(null);
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setRegBusy((b) => ({ ...b, [key]: false }));
    }
  }

  // --- Tenant lifecycle: suspend / restore / permanent delete ---
  // useRouter().refresh() re-runs the server AdminPage after every mutation
  // so the props (tenants/financials/audit) reflect the API's new state —
  // the optimistic *Override state below just avoids a flash while that
  // round-trip is in flight.
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
    tenants: ["Tenants", `${ov ? ov.businesses.toLocaleString() : "—"} contractor businesses across ${jm.regions.length} parishes`],
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
  //
  // Everything on this screen comes from the API or renders as "—". It used to
  // fall back to design-mock values when a section failed to load, which meant
  // a broken or unauthorized admin fetch produced a full, confident-looking
  // console of invented numbers — including an MRR that was hardcoded and
  // never real at all. In a financial console that is worse than an error,
  // because it is actionable. Deltas ("+42 this month", "+4.7% MoM"), the
  // 12-month revenue series, the recent-signup list and the system alerts were
  // all fabricated with no data source behind them; the ones the API cannot
  // answer are gone rather than guessed.
  const stats = [
    { label: "Total businesses", value: ov ? ov.businesses.toLocaleString() : "—" },
    { label: "Active subscriptions", value: ov ? String(ov.activeSubscriptions) : "—" },
    {
      label: "MRR",
      value: data.financials ? formatJmd(data.financials.mrrCents) : "—",
    },
    // NO "Suppliers added" tile. Suppliers became tenant-owned in #31 — there
    // is no platform directory — so a platform-level supplier count on the
    // overview reads as something JamQuote maintains and can act on. It was
    // the last trace of the removed directory, alongside the dead
    // /admin/suppliers fetch. The number still exists on the overview payload
    // if a genuine usage metric is ever wanted; it just does not belong here.
    { label: "Jurisdictions live", value: ov ? String(ov.jurisdictionsLive) : "—" },
  ];

  // The five most recently created tenants. Real rows, or nothing — there is
  // no signup feed to invent one from.
  const recentSignups = [...data.tenants]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  // Real rows only. There is no mock fallback: an empty list means this
  // platform genuinely has no tenants, and saying so is the point.
  const tenantsRaw: TenantRow[] = data.tenants.map((t): TenantRow => [
    t.name,
    t.parish ?? "—",
    t.plan,
    formatTrn(t.trn) || "—",
    t.status,
    relativeTime(t.createdAt),
    "—",
    t.quoteCount,
    t.quoteCount,
  ]);
  // Real business ids, index-aligned with tenantsRaw. Every row now has one,
  // so every row gets its plan/suspend/delete controls — previously the mock
  // rows carried a null id and silently rendered no actions at all, which is
  // why the console looked like it had no tenant controls.
  const tenantIds: string[] = data.tenants.map((t) => t.id);
  const tenantIntervals: string[] = data.tenants.map((t) => t.interval);
  const tenantRenewals: (string | null)[] = data.tenants.map((t) => t.renewsAt);
  const tenantSuspendedBase: boolean[] = data.tenants.map((t) => t.suspended);
  /**
   * Standing is DERIVED from the renewal date, not read from
   * Subscription.status — which is written once as "active" on create and
   * never updated again. Every tenant therefore read "Active" forever, and the
   * old Trial / Past due / Churned filters counted states nothing could set,
   * so all three were permanently zero. Trial is gone entirely: the free tier
   * IS the trial and never expires.
   */
  const standingOf = (i: number): SubscriptionStanding =>
    subscriptionStanding({
      plan: data.tenants[i]?.plan ?? "free",
      interval: data.tenants[i]?.interval ?? "monthly",
      renewsAt: data.tenants[i]?.renewsAt ?? null,
    });
  const STANDING_PILL: Record<SubscriptionStanding, [string, string]> = {
    CURRENT: ["Current", "good"],
    DUE_SOON: ["Due soon", "info"],
    PAST_DUE: ["Past due", "warn"],
    FREE: ["Free", "muted"],
  };
  const initOf = (name: string) => name.split(" ").slice(0, 2).map((w) => w[0]).join("");
  const cnt = (want: SubscriptionStanding) =>
    tenantsRaw.filter((_, i) => standingOf(i) === want).length;
  const tenantFilters = [
    ["All", String(tenantsRaw.length), true],
    ["Current", cnt("CURRENT")],
    ["Due soon", cnt("DUE_SOON")],
    ["Past due", cnt("PAST_DUE")],
    ["Free", cnt("FREE")],
  ];


  const regMap: Record<string, [string, string]> = { needs: ["Needs review", "warn"], monitoring: ["Monitoring", "info"], applied: ["Applied", "good"] };
  // Status now has three states because there is finally something that can
  // set the third: reviewedAt. Before it existed the console counted
  // "Applied (YTD)" on a feed where nothing could ever be applied, so the
  // number was permanently zero.
  const regStatusOf = (r: AdminReg): "applied" | "needs" | "monitoring" =>
    r.reviewedAt ? "applied" : r.actionNeeded ? "needs" : "monitoring";
  const regChanges: RegRow[] = data.regulatory.map((r): RegRow => [
    r.title,
    r.category,
    r.effectiveDate ? r.effectiveDate.slice(0, 10) : "—",
    r.actionNeeded ? "action needed" : "—",
    regStatusOf(r),
  ]);
  const regStats = [
    { value: String(regChanges.filter((r) => r[4] === "needs").length), label: "Needs review", tone: "warn" },
    { value: String(regChanges.filter((r) => r[4] === "monitoring").length), label: "Monitoring", tone: "info" },
    { value: String(regChanges.filter((r) => r[4] === "applied").length), label: "Applied (YTD)", tone: "good" },
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
  // How overdue the pack's verification is, and what to check it against.
  const rpVerify = rulePackVerification(verifiedEff);
  const rpVerifyTone =
    rpVerify.freshness === "stale" || rpVerify.freshness === "never"
      ? "critical"
      : rpVerify.freshness === "aging"
        ? "warn"
        : "good";
  // The pack's own source first, then the jurisdiction baseline's, de-duped.
  const rpSources = [...new Set([sourceEff, ...jm.sources].filter((u): u is string => !!u))];
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
  // Real business id + current suspended state for the selected drawer row,
  // computed the same way as each table row (see tenantIds/tenantSuspendedBase
  // above) — null id for the design-mock rows, which have no real business
  // behind them and so get no "View as tenant" action.
  const selBusinessId = tenantId !== null ? tenantIds[tenantId] ?? null : null;
  const selSuspended =
    tenantId !== null && selBusinessId
      ? tenantSuspendOverride[selBusinessId] ?? tenantSuspendedBase[tenantId] ?? false
      : false;

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
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{ov ? ov.businesses.toLocaleString() : "—"}</span>
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
          {/* Says so plainly when a section could not be reached, so an empty
              table is never mistaken for an empty platform. */}
          {data.failed.length > 0 && (
            <div
              role="alert"
              style={{ margin: "0 auto 16px", maxWidth: 1240, padding: "10px 14px", borderRadius: 10, background: "color-mix(in srgb, var(--critical) 12%, var(--surface))", border: "1px solid var(--critical)", fontSize: 13 }}
            >
              Couldn&apos;t load {data.failed.length} section{data.failed.length > 1 ? "s" : ""} from the
              admin API: <strong>{data.failed.join(", ")}</strong>. Anything below may be incomplete.
              {/* Called out separately because it does not look like a
                  failure. When /admin/me is the one that fails, the console
                  falls back to "no permissions" and every action — suspend,
                  delete, change plan — simply stops rendering. The screen then
                  looks read-only by design rather than broken, which is
                  exactly how it was reported. */}
              {data.failed.some((f) => f.includes("/admin/me")) && (
                <div style={{ marginTop: 6, fontWeight: 600 }}>
                  Your permissions could not be confirmed, so every management action is hidden.
                  This is not a permissions change — reload, and check the API is reachable.
                </div>
              )}
            </div>
          )}
          {/* OVERVIEW */}
          {screen === "overview" && (
            <div className={`${styles.fadein} ${styles.screen}`} style={{ maxWidth: 1240, margin: "0 auto" }}>
              <div className={styles.statTiles} style={{ marginBottom: 22 }}>
                {stats.map((s) => (
                  <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 16px 15px", boxShadow: "var(--shadow)" }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", marginBottom: 9 }}>{s.label}</div>
                    <div style={{ ...archivo, fontWeight: 700, fontSize: 26, letterSpacing: "-.02em", lineHeight: 1 }}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div className={styles.overviewSplit} style={{ marginBottom: 16 }}>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", boxShadow: "var(--shadow)" }}>
                  <div className={styles.mrrHead} style={{ marginBottom: 18 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>Monthly recurring revenue</div>
                      <div style={{ ...archivo, fontWeight: 700, fontSize: 24, letterSpacing: "-.02em", marginTop: 3 }}>
                        {data.financials ? formatJmd(data.financials.mrrCents) : "—"}
                      </div>
                    </div>
                    {/* Net new and churn are NOT shown. Both need a history of
                        subscription changes, and nothing records one — the
                        figures that used to sit here were typed in. */}
                  </div>
                  {/* Was a 12-month revenue series with no data behind it —
                      invented month by month. Nothing stores subscription
                      history, so the honest chart is the CURRENT plan mix,
                      which the API does report. */}
                  {data.financials ? (
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 18, height: 150 }}>
                      {([
                        ["Free", data.financials.freeCount, "color-mix(in srgb, var(--info) 55%, var(--surface-alt))"],
                        ["Pro", data.financials.proCount, "var(--accent)"],
                      ] as [string, number, string][]).map(([label, count, fill]) => {
                        const peak = Math.max(1, data.financials!.freeCount, data.financials!.proCount);
                        return (
                          <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, height: "100%", justifyContent: "flex-end" }}>
                            <div style={{ ...archivo, fontWeight: 700, fontSize: 13 }}>{count}</div>
                            <div style={{ width: "100%", height: `${(count / peak) * 100}%`, minHeight: 2, borderRadius: "5px 5px 2px 2px", background: fill, transition: "height .4s" }} />
                            <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600 }}>{label}</div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ height: 150, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--muted)" }}>
                      Couldn&apos;t load financials.
                    </div>
                  )}
                </div>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", boxShadow: "var(--shadow)", display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>Recent signups</div>
                    <a className={styles.link} href="#" onClick={(e) => { e.preventDefault(); go("tenants"); }} style={{ fontSize: 12, fontWeight: 600 }}>View all</a>
                  </div>
                  {recentSignups.length === 0 && (
                    <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "12px 0" }}>
                      No tenants yet.
                    </div>
                  )}
                  {recentSignups.map((t) => (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ width: 30, height: 30, flex: "none", borderRadius: 8, background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center", ...archivo, fontWeight: 700, fontSize: 12, color: "var(--muted)" }}>{initOf(t.name)}</div>
                      <div style={{ minWidth: 0, flex: 1, lineHeight: 1.25 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{t.parish ?? "—"}</div>
                      </div>
                      <span style={pill(planTone[planDisplay(t.plan)] ?? "muted")}>{planDisplay(t.plan)}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* The SYSTEM ALERTS card was removed, not rebuilt. All four
                  entries were hardcoded prose — a stale supplier feed, a count
                  of regulatory changes awaiting review, "892 active
                  subscriptions matched" — and nothing in the platform raises,
                  stores or clears an alert. A monitoring panel that cannot go
                  red is worse than none: it reads as an all-clear. */}
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
                <div className={styles.mobileHint}>Tap a business to manage its plan, term or status.</div>
                <div className={styles.tableScroll}>
                {/* A suspended row keeps its dimmed opacity through the frozen
                    first column (opacity inherits); only the critical tint is
                    masked by the sticky cell's opaque background, and the
                    "Suspended" pill in the status column carries that anyway. */}
                <table className={`${styles.dataTable} ${styles.dataTableWide}`}>
                  <thead><tr style={{ background: "var(--surface-alt)" }}>
                    <th style={th} className={styles.stickyCol}>BUSINESS</th><th style={th}>PARISH</th><th style={th}>PLAN</th><th style={th}>TRN</th><th style={th}>STATUS</th><th style={{ ...th, textAlign: "right" }}>LAST ACTIVE</th><th style={{ ...th, textAlign: "right" }} className={styles.actionsCell}>ACTIONS</th>
                  </tr></thead>
                  <tbody>
                    {tenantsRaw.map((t, i) => {
                      const [sl, st] = STANDING_PILL[standingOf(i)];
                      const id = tenantIds[i];
                      // The override holds a CHOICE ("pro-annual"); the plan
                      // pill still wants a plan, so map it back.
                      const pendingChoice = id ? tenantPlanOverride[id] : undefined;
                      const currentPlan = pendingChoice
                        ? pendingChoice === "free"
                          ? "free"
                          : "pro"
                        : t[2];
                      const tenantInterval = tenantIntervals[i] ?? "monthly";
                      const renewsAt = tenantRenewals[i] ?? null;
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
                          <td style={td} className={styles.stickyCol}><div style={{ display: "flex", alignItems: "center", gap: 11 }}><div style={{ width: 30, height: 30, flex: "none", borderRadius: 8, background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center", ...archivo, fontWeight: 700, fontSize: 11, color: "var(--muted)" }}>{initOf(t[0])}</div><span style={{ fontWeight: 600 }}>{t[0]}</span></div></td>
                          <td style={{ ...td, color: "var(--muted)" }}>{t[1]}</td>
                          <td style={td}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              <span style={pill(planTone[planDisplay(currentPlan)] ?? "muted")}>{planDisplay(currentPlan)}</span>
                              {/* The term and renewal ARE the account status —
                                  without them "Pro" says nothing about what
                                  this tenant pays or when they next will. */}
                              {isPro(currentPlan) && (
                                <span style={{ fontSize: 11, color: renewsAt ? "var(--muted)" : "var(--warn)" }}>
                                  {tenantInterval === "annual" ? "Annual" : "Monthly"}
                                  {/* A pro plan with no term is a silent free
                                      ride: the sweep skips it, so it is never
                                      reminded and can never revert. Correct
                                      not to chase someone who was never
                                      billed, but it should be visible rather
                                      than indistinguishable from a paid-up
                                      account. */}
                                  {renewsAt ? ` · renews ${renewsAt.slice(0, 10)}` : " · no term set"}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ ...td, ...archivo, fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>{t[3]}</td>
                          <td style={td}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={pill(st)}>{sl}</span>
                              {suspended && <span style={pill("critical")}>Suspended</span>}
                            </div>
                          </td>
                          <td style={{ ...td, textAlign: "right", color: "var(--muted)" }}>{t[5]}</td>
                          <td style={{ ...td, textAlign: "right" }} className={styles.actionsCell} onClick={(e) => e.stopPropagation()}>
                            {id && canManageTenants ? (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                  {/* A select, not a toggle: a toggle cannot
                                      express a yearly term, and the term is
                                      what carries the long-term discount. */}
                                  <select
                                    aria-label={`Plan for ${t[0]}`}
                                    disabled={busy}
                                    value={planChoiceOf(id, currentPlan, tenantInterval)}
                                    onChange={(e) => setTenantPlanChoice(id, e.target.value)}
                                    style={{ height: 28, padding: "0 7px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: "inherit", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", opacity: busy ? 0.6 : 1 }}
                                  >
                                    <option value="free">Free</option>
                                    <option value="pro-monthly">Pro · monthly</option>
                                    <option value="pro-annual">Pro · annual</option>
                                  </select>
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
                {regStats.map((st) => (
                  <div key={st.label} style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "15px 18px", boxShadow: "var(--shadow)", display: "flex", alignItems: "center", gap: 13 }}>
                    <span style={{ width: 11, height: 11, borderRadius: "50%", flex: "none", background: `var(--${st.tone})` }} />
                    <div><div style={{ ...archivo, fontWeight: 700, fontSize: 22, lineHeight: 1 }}>{st.value}</div><div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{st.label}</div></div>
                  </div>
                ))}
              </div>

              {regError && (
                <div role="alert" style={{ marginBottom: 12, padding: "9px 13px", borderRadius: 9, background: "color-mix(in srgb, var(--critical) 12%, var(--surface))", border: "1px solid var(--critical)", fontSize: 13 }}>{regError}</div>
              )}

              {canManageRulepack && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                  <button onClick={() => setRegEditing("new")} style={{ height: 34, padding: "0 15px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: "none", background: "var(--accent)", color: "#fff" }}>
                    Add entry
                  </button>
                </div>
              )}

              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow)" }}>
                {data.regulatory.length === 0 && (
                  <div style={{ padding: "22px 18px", fontSize: 13, color: "var(--muted)" }}>
                    Nothing in the regulatory feed yet.
                  </div>
                )}
                {data.regulatory.map((r) => {
                  const status = regStatusOf(r);
                  const [sl, st] = regMap[status]!;
                  const busy = regBusy[r.id] === true;
                  return (
                    <div key={r.id} className={`${styles.rowHover} ${styles.regRow}`} style={{ padding: "15px 18px", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ width: 40, height: 40, flex: "none", borderRadius: 10, background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}><path d="M4 4h11l5 5v11H4z" /><path d="M15 4v5h5" /></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{r.title}</div>
                        <div className={styles.regMeta} style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                          <span style={{ fontWeight: 600, color: "var(--info)" }}>{r.category}</span>·
                          <span>Effective {r.effectiveDate ? r.effectiveDate.slice(0, 10) : "—"}</span>
                          {r.actionNeeded && <>·<span>{r.actionNeeded}</span></>}
                          {r.reviewedAt && <>·<span>Reviewed {r.reviewedAt.slice(0, 10)}</span></>}
                        </div>
                      </div>
                      <span style={pill(st)}>{sl}</span>
                      {r.sourceUrl && (
                        <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.link} style={{ fontSize: 12.5, fontWeight: 600 }}>Source</a>
                      )}
                      {canManageRulepack && (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => runReg(r.id, () => reviewRegulatory(r.id, !r.reviewedAt))}
                            style={{ height: 32, padding: "0 13px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: "inherit", border: r.reviewedAt ? "1px solid var(--border)" : "none", background: r.reviewedAt ? "var(--surface)" : "var(--accent)", color: r.reviewedAt ? "var(--text)" : "#fff", opacity: busy ? 0.6 : 1 }}
                          >
                            {/* Reopening must be possible, or a mis-click can
                                only be undone in the database. */}
                            {r.reviewedAt ? "Reopen" : "Mark reviewed"}
                          </button>
                          <button disabled={busy} onClick={() => setRegEditing(r)} style={{ height: 32, padding: "0 11px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}>Edit</button>
                          <button
                            disabled={busy}
                            onClick={() => {
                              if (!window.confirm(`Delete "${r.title}" from the regulatory feed? This cannot be undone.`)) return;
                              void runReg(r.id, () => deleteRegulatory(r.id));
                            }}
                            style={{ height: 32, padding: "0 11px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: "1px solid var(--critical)", background: "var(--surface)", color: "var(--critical)" }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {regEditing && (
                <RegulatoryEditor
                  entry={regEditing === "new" ? null : regEditing}
                  busy={regBusy["form"] === true}
                  onCancel={() => setRegEditing(null)}
                  onSave={(values) =>
                    runReg("form", () =>
                      regEditing === "new"
                        ? createRegulatory(values)
                        : updateRegulatory(regEditing.id, values),
                    )
                  }
                />
              )}
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
                    {/* --- Verification ---
                        The date field above is data entry; this is the part
                        that makes it a task. It says how overdue the pack is,
                        links the official sources to check against, and stamps
                        today in one click.

                        There is no automated check on purpose. A real one needs
                        a machine-readable feed of Jamaican rates and none
                        exists — TAJ publishes prose. A scraper over a page that
                        can be reworded at any time would give confident wrong
                        answers about tax rates, which is worse than an honest
                        "last checked 14 months ago". */}
                    <div style={{ border: `1px solid var(--${rpVerifyTone})`, background: `color-mix(in srgb, var(--${rpVerifyTone}) 8%, var(--surface))`, borderRadius: 12, padding: "13px 15px", marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", flex: "none", background: `var(--${rpVerifyTone})` }} />
                        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{rpVerify.label}</span>
                        {rpVerify.freshness === "stale" && (
                          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>· rates have had a budget cycle to move — worth re-checking</span>
                        )}
                        {rpVerify.freshness === "aging" && (
                          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>· due for a re-check soon</span>
                        )}
                        {rpVerify.freshness === "never" && (
                          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>· no one has confirmed these figures against a source</span>
                        )}
                        {canManageRulepack && (
                          <button
                            type="button"
                            onClick={() => setRpForm((f) => (f ? { ...f, verifiedAsOf: new Date().toISOString().slice(0, 10) } : f))}
                            style={{ marginLeft: "auto", height: 31, padding: "0 13px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: "none", background: "var(--accent)", color: "#fff" }}
                          >
                            {/* Fills the date field rather than saving on its
                                own — it must go through the same Save as every
                                other edit, so one review is one audited write. */}
                            Mark verified today
                          </button>
                        )}
                      </div>
                      {rpSources.length > 0 && (
                        <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--muted)", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontWeight: 600 }}>Check against:</span>
                          {rpSources.map((src) => (
                            <a key={src} href={src} target="_blank" rel="noopener noreferrer" className={styles.link} style={{ fontWeight: 600 }}>
                              {(() => { try { return new URL(src).hostname.replace(/^www\./, ""); } catch { return src; } })()}
                            </a>
                          ))}
                        </div>
                      )}
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
                    {/* --- Maintenance, no release required ---
                        Rates for the contributions the CODE knows about were
                        always editable. The SET of contributions was not: a new
                        levy, a withdrawal, or a rename meant a deploy. A tax
                        authority introducing a charge should not be blocked on
                        one, so the set and the check-sources are editable here.

                        Retiring hides a baseline entry rather than deleting it,
                        so the code stays documented and the decision reverses. */}
                    {canManageRulepack && (
                      <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)", marginBottom: 4 }}>
                          MAINTAIN CONTRIBUTIONS
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 11 }}>
                          Add a levy this jurisdiction has introduced, or retire one that has been withdrawn. No release needed.
                        </div>

                        {(rp?.statutory ?? []).length > 0 && (
                          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
                            {(rp?.statutory ?? []).map((st) => {
                              const isRetired = rpRetired.includes(st.code);
                              return (
                                <button
                                  key={st.code}
                                  type="button"
                                  onClick={() =>
                                    setRpRetired((r) =>
                                      isRetired ? r.filter((c) => c !== st.code) : [...r, st.code],
                                    )
                                  }
                                  title={isRetired ? "Bring this contribution back" : "Retire this contribution"}
                                  style={{ height: 29, padding: "0 11px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: "1px solid var(--border)", background: isRetired ? "color-mix(in srgb, var(--critical) 12%, var(--surface))" : "var(--surface)", color: isRetired ? "var(--critical)" : "var(--text)", textDecoration: isRetired ? "line-through" : "none" }}
                                >
                                  {st.code} {isRetired ? "· retired" : "×"}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {rpCustom.map((c, i) => (
                          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <input placeholder="CODE" value={c.code}
                              onChange={(e) => setRpCustom((list) => list.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))}
                              style={{ width: 120, height: 32, padding: "0 9px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }} />
                            <input placeholder="Label shown to staff" value={c.label}
                              onChange={(e) => setRpCustom((list) => list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                              style={{ flex: 1, minWidth: 160, height: 32, padding: "0 9px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }} />
                            <select value={c.appliesTo}
                              onChange={(e) => setRpCustom((list) => list.map((x, j) => (j === i ? { ...x, appliesTo: e.target.value as typeof x.appliesTo } : x)))}
                              style={{ height: 32, padding: "0 8px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}>
                              <option value="EMPLOYEE">Employee</option>
                              <option value="EMPLOYER">Employer</option>
                              <option value="BOTH">Both</option>
                              <option value="SELF_EMPLOYED">Self-employed</option>
                            </select>
                            <input type="number" min={0} max={100} step="0.01" placeholder="Employee %" value={c.employeePct ?? ""}
                              onChange={(e) => setRpCustom((list) => list.map((x, j) => (j === i ? { ...x, employeePct: e.target.value === "" ? null : Number(e.target.value) } : x)))}
                              style={{ width: 96, height: 32, padding: "0 9px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", textAlign: "right" }} />
                            <input type="number" min={0} max={100} step="0.01" placeholder="Employer %" value={c.employerPct ?? ""}
                              onChange={(e) => setRpCustom((list) => list.map((x, j) => (j === i ? { ...x, employerPct: e.target.value === "" ? null : Number(e.target.value) } : x)))}
                              style={{ width: 96, height: 32, padding: "0 9px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", textAlign: "right" }} />
                            <button type="button" onClick={() => setRpCustom((list) => list.filter((_, j) => j !== i))}
                              aria-label="Remove this contribution"
                              style={{ height: 32, padding: "0 10px", borderRadius: 7, border: "1px solid var(--critical)", background: "var(--surface)", color: "var(--critical)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                              Remove
                            </button>
                          </div>
                        ))}

                        <button type="button"
                          onClick={() => setRpCustom((list) => [...list, { code: "", label: "", appliesTo: "BOTH", employeePct: null, employerPct: null }])}
                          style={{ height: 31, padding: "0 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}>
                          + Add a contribution
                        </button>

                        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)", margin: "16px 0 4px" }}>
                          SOURCES TO CHECK
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
                          One URL per line. These are the links offered on the verification card above.
                        </div>
                        <textarea
                          value={rpSourcesDraft}
                          onChange={(e) => { setRpSourcesDraft(e.target.value); setRpSourcesTouched(true); }}
                          style={{ width: "100%", minHeight: 72, resize: "vertical", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}
                        />
                      </div>
                    )}

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
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", marginBottom: 9 }}>MRR (contracted)</div>
                  <div style={{ ...archivo, fontWeight: 700, fontSize: 26, letterSpacing: "-.02em" }}>{financials ? formatJmd(financials.mrrCents) : "—"}</div>
                  {financials && (
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>
                      What pro tenants owe per month · {financials.currency}
                    </div>
                  )}
                </div>

                {/* Collected sits beside MRR deliberately. With only the
                    contracted figure on screen, recording a payment appeared to
                    change nothing — the tenant already owed the same amount —
                    and there was no way to see whether money had arrived. */}
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px", boxShadow: "var(--shadow)" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", marginBottom: 9 }}>Collected this month</div>
                  <div style={{ ...archivo, fontWeight: 700, fontSize: 26, letterSpacing: "-.02em", color: "var(--good)" }}>
                    {financials ? formatJmd(financials.collectedThisMonthCents) : "—"}
                  </div>
                  {financials && (
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>
                      Money actually received · excludes voided
                    </div>
                  )}
                </div>

                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px", boxShadow: "var(--shadow)" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", marginBottom: 9 }}>Past due</div>
                  <div style={{ ...archivo, fontWeight: 700, fontSize: 26, letterSpacing: "-.02em", color: financials && financials.pastDueCount > 0 ? "var(--warn)" : undefined }}>
                    {financials ? String(financials.pastDueCount) : "—"}
                  </div>
                  {financials && (
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>
                      Paid plans whose term has ended
                    </div>
                  )}
                </div>
              </div>

              {/* The sweep's own status. It is surfaced rather than trusted
                  because the API sleeps on the free tier, so the daily cron
                  genuinely may not fire — without a last-run time, "no
                  reminders sent" and "this has not run in three weeks" look
                  exactly the same. */}
              <SweepPanel canRun={canManageTenants} />

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
      {selTenant && (
        <TenantDrawer
          raw={selTenant}
          businessId={selBusinessId}
          suspended={selSuspended}
          tenant={data.tenants.find((t) => t.id === selBusinessId) ?? null}
          canManage={canManageTenants}
          busy={selBusinessId ? !!tenantPlanBusy[selBusinessId] || !!tenantLifecycleBusy[selBusinessId] : false}
          onSetPlan={setTenantPlanChoice}
          onToggleSuspend={toggleTenantSuspend}
          onDelete={openDeleteModal}
          onBillingChanged={() => router.refresh()}
          onClose={() => setTenantId(null)}
        />
      )}

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

      {/* The rule-pack "change review" modal that stood here has been REMOVED.
          It was unreachable — nothing ever called setDiffOpen(true) — and it
          was a design mock: a hardcoded v2025.4 tourism sub-rate, a reviewer
          note assigned to a person who does not exist, and an "Approve &
          publish" button that closed the dialog, set a flag nothing read, and
          showed "published to production". It made no API call.

          Left in place it was one wire away from being the worst defect this
          app could ship: staff told a tax rule change was live when nothing
          had changed. The real editor is the rule-pack screen above
          (GET/PATCH /admin/rulepack), which writes and reads back. */}
    </div>
  );
}

function TenantDrawer({
  raw,
  businessId,
  suspended,
  tenant,
  canManage,
  busy,
  onSetPlan,
  onToggleSuspend,
  onDelete,
  onBillingChanged,
  onClose,
}: {
  raw: [string, string, string, string, string, string, number | string, number, number];
  businessId: string | null;
  suspended: boolean;
  /** The real row, so the drawer stops inventing subscription facts. */
  tenant: AdminTenant | null;
  canManage: boolean;
  busy: boolean;
  onSetPlan: (id: string, choice: string) => void;
  onToggleSuspend: (id: string, suspended: boolean) => void;
  onDelete: (id: string, name: string) => void;
  /** Recording or voiding a payment changes the tenant's plan and renewal, so
   * the console behind the drawer has to re-read rather than show stale dates. */
  onBillingChanged: () => void;
  onClose: () => void;
}) {
  // The hole where `mrr` used to be destructured is deliberate. The drawer
  // shows the tenant's ACTUAL agreed price from the API below; the row's MRR
  // came from the hardcoded per-plan table that was removed for inventing
  // figures, and reinstating it here would put two different numbers for the
  // same tenant on one screen.
  const [name, parish, plan, trn, status, , , q, qm] = raw;
  const statusMap: Record<string, [string, string]> = { active: ["Active", "good"], trial: ["Trial", "info"], past_due: ["Past due", "warn"], churned: ["Churned", "muted"] };
  const [sl, st] = statusMap[status] ?? ["Active", "good"];
  const init = name.split(" ").slice(0, 2).map((w) => w[0]).join("");
  // Real tenants arrive as lowercase "free"/"pro" while the mock rows are
  // already capitalized, so every lookup below is keyed off the normalized
  // label — matching what the tenants table does. Comparing the raw value
  // would send real Pro tenants down each free-tier branch: 15-quote cap,
  // one seat, and $0.00 MRR, all shown as fact to staff.
  const shown = planDisplay(plan);
  // Only what the API actually reports.
  //
  // What used to be here was invented: seat counts and quota caps derived from
  // a plan-name lookup, "Document storage 2.1 / 10 GB", "Invoices sent" as
  // quotes x 0.6, a per-plan MRR from a hardcoded price table, and a fixed
  // "Started 2024-08-19 / Renews 2025-05-19 / Payment rail Lynk". None of it
  // came from anywhere. This drawer is where staff decide whether to suspend
  // or bill a business, so invented figures here are the most expensive kind.
  const metrics = [
    { label: "Quotes created", value: String(q) },
    { label: "This month", value: String(qm) },
  ];
  const interval = tenant?.interval ?? "monthly";
  const sub: [string, string][] = [
    ["Plan", shown],
    ["Term", isPro(plan) ? (interval === "annual" ? "Annual" : "Monthly") : "—"],
    [
      "Agreed price",
      tenant?.priceCents != null ? `${formatJmd(tenant.priceCents)} / ${interval === "annual" ? "year" : "month"}` : "Standard",
    ],
    ["Renews", tenant?.renewsAt ? tenant.renewsAt.slice(0, 10) : "—"],
    ["Created", tenant ? tenant.createdAt.slice(0, 10) : "—"],
  ];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,12,8,.42)", zIndex: 40 }} />
      <div className={`${styles.scr} ${styles.slidein} ${styles.drawer}`} style={{ background: "var(--surface)", borderLeft: "1px solid var(--border)", zIndex: 41, boxShadow: "-20px 0 50px -24px rgba(0,0,0,.4)" }}>
        <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", gap: 13 }}>
          <div style={{ width: 42, height: 42, flex: "none", borderRadius: 11, background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center", ...archivo, fontWeight: 700, fontSize: 14, color: "var(--muted)" }}>{init}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...archivo, fontWeight: 700, fontSize: 17, lineHeight: 1.15 }}>{name}</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>{parish} · TRN {trn}</div>
            <div style={{ display: "flex", gap: 7, marginTop: 9 }}><span style={pill(planTone[shown] ?? "muted")}>{shown}</span><span style={pill(st)}>{sl}</span></div>
            {businessId && (
              <form action={startImpersonation.bind(null, businessId)} style={{ marginTop: 12 }}>
                <button
                  type="submit"
                  disabled={suspended}
                  title={suspended ? "Suspended tenants can't be viewed as — restore the tenant first" : "Open the app as this tenant sees it (read-only, 30 min)"}
                  style={{
                    height: 32,
                    padding: "0 13px",
                    border: "none",
                    borderRadius: 8,
                    background: suspended ? "var(--surface-alt)" : "var(--accent)",
                    color: suspended ? "var(--muted)" : "#fff",
                    fontWeight: 700,
                    fontSize: 12,
                    fontFamily: "inherit",
                    cursor: suspended ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                  View as tenant
                </button>
              </form>
            )}
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
          {/* Account management lives here as well as in the table row. The
              row's ACTIONS column is the last of seven and scrolls off a
              narrow screen, so the controls were reachable but easy to miss —
              clicking the business is the natural gesture for managing it. */}
          {businessId && canManage && (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)", marginBottom: 11 }}>MANAGE ACCOUNT</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 20 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                  Plan &amp; term
                  <select
                    disabled={busy}
                    value={!isPro(plan) ? "free" : interval === "annual" ? "pro-annual" : "pro-monthly"}
                    onChange={(e) => onSetPlan(businessId, e.target.value)}
                    style={{ height: 34, padding: "0 9px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }}
                  >
                    <option value="free">Free</option>
                    <option value="pro-monthly">Pro · monthly</option>
                    <option value="pro-annual">Pro · annual (discounted)</option>
                  </select>
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    disabled={busy}
                    onClick={() => onToggleSuspend(businessId, suspended)}
                    style={{ height: 34, padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: "inherit", border: "1px solid var(--border)", background: "var(--surface)", color: suspended ? "var(--good)" : "var(--warn)", opacity: busy ? 0.6 : 1 }}
                  >
                    {suspended ? "Restore account" : "Suspend account"}
                  </button>
                  <button
                    onClick={() => onDelete(businessId, name)}
                    style={{ height: 34, padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "1px solid color-mix(in srgb, var(--critical) 45%, var(--border))", background: "color-mix(in srgb, var(--critical) 10%, transparent)", color: "var(--critical)" }}
                  >
                    Delete permanently
                  </button>
                </div>
              </div>
            </>
          )}
          {businessId && canManage && <TenantBilling businessId={businessId} onChanged={onBillingChanged} />}

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

/**
 * Create/edit form for one regulatory entry, shown as a modal over the feed.
 *
 * Kept in this file beside the screen that uses it, matching how the rest of
 * the console is written. Uncontrolled-ish: local state seeded from `entry`,
 * so editing one row cannot mutate the list until the save round-trips.
 */
function RegulatoryEditor({
  entry,
  busy,
  onCancel,
  onSave,
}: {
  entry: AdminReg | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (values: RegulatoryInput) => void;
}) {
  const [title, setTitle] = useState(entry?.title ?? "");
  const [category, setCategory] = useState(entry?.category ?? "GCT");
  const [summary, setSummary] = useState(entry?.summary ?? "");
  const [effectiveDate, setEffectiveDate] = useState(entry?.effectiveDate?.slice(0, 10) ?? "");
  const [actionNeeded, setActionNeeded] = useState(entry?.actionNeeded ?? "");
  const [sourceUrl, setSourceUrl] = useState(entry?.sourceUrl ?? "");

  const field: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)",
    background: "var(--surface)", color: "var(--text)", font: "inherit", fontSize: 13.5,
  };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 5 };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      title: title.trim(),
      category: category.trim(),
      summary: summary.trim(),
      // Empty means "no value", sent as null so an existing one is CLEARED
      // rather than left behind — omitting the key would leave it alone, which
      // is not what an emptied field means.
      effectiveDate: effectiveDate ? new Date(`${effectiveDate}T12:00:00.000Z`).toISOString() : null,
      actionNeeded: actionNeeded.trim() || null,
      sourceUrl: sourceUrl.trim() || null,
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={entry ? "Edit regulatory entry" : "Add regulatory entry"}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <form
        onSubmit={submit}
        style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 22, width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--shadow)", display: "grid", gap: 13 }}
      >
        <div style={{ ...archivo, fontWeight: 700, fontSize: 17 }}>
          {entry ? "Edit entry" : "Add regulatory entry"}
        </div>

        <div>
          <label style={label} htmlFor="reg-title">Title</label>
          <input id="reg-title" style={field} value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>

        <div>
          <label style={label} htmlFor="reg-category">Category</label>
          {/* Free text with a datalist, not a select: the column is a string
              with a documented convention precisely so a new levy does not
              need a migration to be recorded. */}
          <input id="reg-category" style={field} value={category} onChange={(e) => setCategory(e.target.value)} list="reg-categories" required />
          <datalist id="reg-categories">
            {["GCT", "NHT", "TRN", "MIN_WAGE", "PERMIT", "OTHER"].map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div>
          <label style={label} htmlFor="reg-summary">Summary</label>
          <textarea id="reg-summary" style={{ ...field, minHeight: 78, resize: "vertical" }} value={summary} onChange={(e) => setSummary(e.target.value)} required />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={label} htmlFor="reg-effective">Effective date</label>
            <input id="reg-effective" type="date" style={field} value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </div>
          <div>
            <label style={label} htmlFor="reg-source">Source URL</label>
            <input id="reg-source" type="url" placeholder="https://…" style={field} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
          </div>
        </div>

        <div>
          <label style={label} htmlFor="reg-action">Action needed</label>
          <input id="reg-action" style={field} value={actionNeeded} onChange={(e) => setActionNeeded(e.target.value)} placeholder="Leave empty for monitoring only" />
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 5 }}>
            Filling this in marks the entry &ldquo;Needs review&rdquo;. Empty means monitoring.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 4 }}>
          <button type="button" onClick={onCancel} disabled={busy} style={{ height: 34, padding: "0 14px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }}>
            Cancel
          </button>
          <button type="submit" disabled={busy} style={{ height: 34, padding: "0 16px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: "inherit", border: "none", background: "var(--accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Saving…" : entry ? "Save changes" : "Add entry"}
          </button>
        </div>
      </form>
    </div>
  );
}


/**
 * A tenant's platform-subscription payments: what they have paid JamQuote, and
 * the form to record the next one.
 *
 * Loads on mount rather than with the page: most drawer opens are not about
 * billing, and the tenants list should not carry every tenant's ledger.
 *
 * Recording a payment advances the term server-side — the console never sends
 * a renewal date. That is the whole point of the endpoint: one action, and the
 * account state follows.
 */
function TenantBilling({
  businessId,
  onChanged,
}: {
  businessId: string;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<AdminSubscriptionPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"CASH" | "BANK_TRANSFER" | "CARD" | "MOBILE_MONEY" | "OTHER">("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [interval, setInterval] = useState<"" | "monthly" | "annual">("");

  const load = useCallback(async () => {
    try {
      setRows(await getSubscriptionPayments(businessId));
    } catch {
      setError("Couldn't load payments.");
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      onChanged();
      setOpen(false);
      setReference("");
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const field: React.CSSProperties = {
    width: "100%", height: 32, padding: "0 9px", borderRadius: 7,
    border: "1px solid var(--border)", background: "var(--surface)",
    color: "var(--text)", fontSize: 13, fontFamily: "inherit",
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)" }}>
          PAYMENTS RECEIVED
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{ height: 28, padding: "0 11px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: "none", background: "var(--accent)", color: "#fff" }}
        >
          {open ? "Cancel" : "Record payment"}
        </button>
      </div>

      {error && (
        <div role="alert" style={{ marginBottom: 9, fontSize: 12.5, color: "var(--critical)" }}>{error}</div>
      )}

      {open && (
        <div style={{ display: "grid", gap: 8, marginBottom: 14, padding: "12px 13px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-alt)" }}>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)" }}>
            Method
            <select style={field} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="CASH">Cash</option>
              <option value="MOBILE_MONEY">Mobile money</option>
              <option value="CARD">Card</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)" }}>
            Reference
            <input style={field} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank ref, cheque no." />
          </label>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)" }}>
            Amount (leave blank for the agreed price)
            <input style={field} type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Standard" />
          </label>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)" }}>
            Term
            <select style={field} value={interval} onChange={(e) => setInterval(e.target.value as typeof interval)}>
              <option value="">Keep current term</option>
              <option value="monthly">Switch to monthly</option>
              <option value="annual">Switch to annual</option>
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(() =>
                recordSubscriptionPayment(businessId, {
                  method,
                  ...(reference.trim() ? { reference: reference.trim() } : {}),
                  // Dollars in the field, cents on the wire — every money value
                  // in this system is an integer number of cents.
                  ...(amount.trim() ? { amountCents: Math.round(Number(amount) * 100) } : {}),
                  ...(interval ? { interval } : {}),
                }),
              )
            }
            style={{ height: 34, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "inherit", border: "none", background: "var(--good)", color: "#fff", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Recording…" : "Record & extend term"}
          </button>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        {rows === null && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Loading…</div>}
        {rows?.length === 0 && (
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No payments recorded yet.</div>
        )}
        {rows?.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0", borderBottom: "1px solid var(--border)", opacity: r.voidedAt ? 0.5 : 1 }}>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
              <div style={{ fontSize: 13, fontWeight: 600, textDecoration: r.voidedAt ? "line-through" : "none" }}>
                {formatJmd(r.amountCents)}
                <span style={{ fontWeight: 400, color: "var(--muted)" }}> · {r.method.replace("_", " ").toLowerCase()}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                {/* The TERM first, because that is what the row is about.
                    Showing the payment date first read as the start of the
                    coverage period and made a correct row look wrong. */}
                covers {r.coversFrom.slice(0, 10)} → {r.coversUntil.slice(0, 10)}
                {" · paid "}
                {r.paidAt.slice(0, 10)}
                {r.reference ? ` · ${r.reference}` : ""}
              </div>
            </div>
            {r.voidedAt ? (
              <span style={pill("muted")}>Voided</span>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`Void this ${formatJmd(r.amountCents)} payment? The term is rolled back if nothing has changed since.`)) return;
                  void run(() => voidSubscriptionPayment(r.id));
                }}
                style={{ height: 26, padding: "0 9px", borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--critical)" }}
              >
                Void
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Subscription sweep status, and a button to run it now.
 *
 * The button exists because a cron on a host that sleeps is not a scheduler:
 * Render spins the API down when idle, so midnight can pass unobserved. It is
 * safe to press repeatedly — notices are claimed against a unique constraint,
 * so a second run sends nothing.
 */
function SweepPanel({ canRun }: { canRun: boolean }) {
  const [runs, setRuns] = useState<AdminSweepRun[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justRan, setJustRan] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRuns(await getSweepRuns());
    } catch {
      setError("Couldn't load sweep history.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const last = runs?.[0];
  // Stale after ~36 hours: a daily sweep that has not run since yesterday has
  // been missed, which on this host is expected rather than exceptional.
  const staleHours = last ? (Date.now() - new Date(last.ranAt).getTime()) / 3_600_000 : null;
  const stale = staleHours === null || staleHours > 36;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px 18px", boxShadow: "var(--shadow)", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", flex: "none", background: stale ? "var(--warn)" : "var(--good)" }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ ...archivo, fontWeight: 700, fontSize: 14 }}>Renewal reminders</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            {last
              ? `Last swept ${new Date(last.ranAt).toLocaleString("en-JM")} (${last.trigger}) · ${last.noticesSent} sent, ${last.reverted} reverted${last.failures > 0 ? `, ${last.failures} failed` : ""}`
              : "Never run."}
          </div>
        </div>
        {canRun && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const r = await runSubscriptionSweep();
                setJustRan(`${r.noticesSent} sent, ${r.reverted} reverted${r.failures > 0 ? `, ${r.failures} failed` : ""}`);
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : "That didn't work.");
              } finally {
                setBusy(false);
              }
            }}
            style={{ height: 32, padding: "0 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: "inherit", border: "none", background: "var(--accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Sweeping…" : "Run now"}
          </button>
        )}
      </div>
      {justRan && <div style={{ fontSize: 12, color: "var(--good)", marginTop: 8 }}>Swept: {justRan}</div>}
      {error && <div role="alert" style={{ fontSize: 12, color: "var(--critical)", marginTop: 8 }}>{error}</div>}
    </div>
  );
}
