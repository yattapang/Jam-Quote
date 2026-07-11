"use client";

import { useState, type CSSProperties } from "react";
import { getJurisdiction } from "@jamquote/core";
import styles from "./console.module.css";

type Screen = "overview" | "tenants" | "suppliers" | "regulatory" | "rulepack";

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
const planTone: Record<string, string> = { Free: "muted", Starter: "info", Core: "accent", Pro: "good" };

const jm = getJurisdiction("JM");

export default function AdminConsole() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [screen, setScreen] = useState<Screen>("overview");
  const [tenantId, setTenantId] = useState<number | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [published, setPublished] = useState(false);
  const [toast, setToast] = useState(false);

  const titles: Record<Screen, [string, string]> = {
    overview: ["Platform overview", "Health of the JamQuote platform at a glance"],
    tenants: ["Tenants", "1,284 contractor businesses across 14 parishes"],
    suppliers: ["Supplier price index", "Live material pricing feeds & scrape health"],
    regulatory: ["Regulatory review queue", "Tax & regulation changes awaiting human review"],
    rulepack: ["Jurisdiction rule-pack verification", "Versioned, provenance-tracked tax rules per country"],
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
    { label: "Total businesses", value: "1,284", delta: "+42", sub: "this month", tone: "good" },
    { label: "Active subscriptions", value: "892", delta: "+18", sub: "net new", tone: "good" },
    { label: "MRR", value: money(2418540), delta: "+4.7%", sub: "MoM", tone: "good" },
    { label: "Suppliers tracked", value: "37", delta: "2 stale", sub: "feeds", tone: "warn" },
    { label: "Jurisdictions live", value: "3", delta: "JM · TT · GY", sub: "", tone: "info" },
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
  const tenantsRaw: [string, string, string, string, string, string, number | string, number, number][] = [
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
  const statusMap: Record<string, [string, string]> = { active: ["Active", "good"], trial: ["Trial", "info"], past_due: ["Past due", "warn"], churned: ["Churned", "muted"] };
  const initOf = (name: string) => name.split(" ").slice(0, 2).map((w) => w[0]).join("");
  const cnt = (st: string) => tenantsRaw.filter((t) => t[4] === st).length;
  const tenantFilters = [["All", "1,284", true], ["Active", cnt("active")], ["Trial", cnt("trial")], ["Past due", cnt("past_due")], ["Churned", cnt("churned")]];

  const suppliersRaw: [string, string, boolean, string, string, string, number][] = [
    ["ARC Systems", "Steel & Rebar", true, "stale", "Stale · 26h", "HTTP 200 · 0 new · retry queued", 412],
    ["Caribbean Cement", "Cement", true, "fresh", "Fresh · 1h ago", "HTTP 200 · 24 updated", 96],
    ["Tank-Weld Metals", "Steel & Roofing", true, "fresh", "Fresh · 40m ago", "HTTP 200 · 61 updated", 540],
    ["Rapid True Value", "Hardware", true, "fresh", "Fresh · 2h ago", "HTTP 200 · 12 updated", 1280],
    ["Rite Rate Electrical", "Electrical", false, "cached", "Cached · 9h ago", "HTTP 429 · using cache", 333],
    ["General Paints JA", "Paint & Coatings", false, "fresh", "Fresh · 3h ago", "HTTP 200 · 8 updated", 214],
    ["Bathrooms & More", "Fixtures", false, "cached", "Cached · 14h ago", "HTTP 200 · 0 new", 187],
    ["Kingston Timber", "Lumber", false, "stale", "Stale · 2d ago", "Timeout · 3 fails", 158],
  ];
  const freshTone: Record<string, string> = { fresh: "good", cached: "warn", stale: "critical" };
  const supplierStats = [
    { label: "Feeds tracked", value: "37", color: "var(--text)" },
    { label: "Fresh (< 6h)", value: "29", color: "var(--good)" },
    { label: "Cached", value: "6", color: "var(--warn)" },
    { label: "Stale", value: "2", color: "var(--critical)" },
  ];

  const regMap: Record<string, [string, string]> = { needs: ["Needs review", "warn"], monitoring: ["Monitoring", "info"], applied: ["Applied", "good"] };
  const regChanges: [string, string, string, string, string][] = [
    ["Tourism-sector GCT sub-rate (10%)", "TAJ", "2025-04-01", "2025-03-28", "needs"],
    ["Minimum wage revision — Gazette No. 42", "Jamaica Gazette", "2025-06-01", "2025-03-25", "needs"],
    ["NHT contribution ceiling adjustment", "NHT", "2025-05-15", "2025-03-20", "monitoring"],
    ["HEART Trust levy clarification", "HEART/NSTA", "2025-03-01", "2025-02-14", "monitoring"],
    ["Education Tax rate confirmation", "TAJ", "2025-01-01", "2024-12-10", "applied"],
  ];
  const regStats = [
    { value: "2", label: "Needs review", tone: "warn" },
    { value: "2", label: "Monitoring", tone: "info" },
    { value: "31", label: "Applied (YTD)", tone: "good" },
  ];

  // rule-pack — wired to the REAL @jamquote/core jurisdiction rule-pack
  const verified = pill("accent", { padding: "3px 10px" });
  const ruleCards = [
    { label: "CONSUMPTION TAX", value: `${jm.taxLabel} ${jm.defaultTaxRatePct}%`, detail: `${jm.taxLongName} · single standard rate`, provenance: `Verified ${jm.verifiedAsOf} · Devon Reid`, sourceLink: "TAJ", chips: [] as string[] },
    { label: "TAXPAYER ID", value: jm.taxpayerId.label, detail: "Format NNN-NNN-NNN · 9 digits · checksum validated", provenance: "Verified 2026-02-28 · Aisha Meyers", sourceLink: "TAJ", chips: [] as string[] },
    { label: `REGIONS — ${jm.regions.length} ${jm.regionLabel.toUpperCase()}ES`, value: `${jm.regions.length} parishes`, detail: "Used for parish-level tax & delivery logic", provenance: "Verified 2026-01-15 · Devon Reid", sourceLink: "Gov.jm", chips: [...jm.regions] },
    { label: "PAYMENT RAILS", value: jm.paymentProviders.map((p) => p.label).join(" · "), detail: "Digital wallets available for client invoicing", provenance: "Verified 2026-03-01 · Aisha Meyers", sourceLink: "BOJ", chips: [] as string[] },
  ];
  // payroll rates are illustrative (design values); item list comes from the rule-pack.
  const payrollRates: Record<string, [string, string]> = { NIS: ["3.0%", "3.0%"], NHT: ["2.0%", "3.0%"], EDUCATION_TAX: ["2.25%", "3.5%"], HEART: ["—", "3.0%"] };
  const payroll = jm.statutory.map((s) => ({ name: s.code === "EDUCATION_TAX" ? "Education Tax" : s.code, full: s.label, employee: payrollRates[s.code]?.[0] ?? "—", employer: payrollRates[s.code]?.[1] ?? "—", prov: "TAJ · 2026-01-06" }));

  const selTenant = tenantId !== null ? tenantsRaw[tenantId] : null;

  const iconStroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  return (
    <div className={`${styles.root} ${styles.scr}`} data-theme={theme} style={{ display: "flex", height: "100vh", width: "100%", background: "var(--bg)", color: "var(--text)", overflow: "hidden" }}>
      {/* SIDEBAR */}
      <aside style={{ width: 246, flex: "none", background: "var(--surface)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", height: "100%" }}>
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
          <button className={styles.navBtn} onClick={() => setScreen("overview")} style={navBtn("overview")}>
            <svg width="17" height="17" viewBox="0 0 24 24" {...iconStroke}><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></svg>
            <span>Platform overview</span>
          </button>
          <button className={styles.navBtn} onClick={() => setScreen("tenants")} style={navBtn("tenants")}>
            <svg width="17" height="17" viewBox="0 0 24 24" {...iconStroke}><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" /></svg>
            <span>Tenants</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>1,284</span>
          </button>
          <button className={styles.navBtn} onClick={() => setScreen("suppliers")} style={navBtn("suppliers")}>
            <svg width="17" height="17" viewBox="0 0 24 24" {...iconStroke}><path d="M3 9l1-5h16l1 5" /><path d="M4 9v11h16V9" /><path d="M9 20v-6h6v6" /></svg>
            <span>Supplier index</span>
          </button>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".09em", color: "var(--muted)", padding: "16px 10px 8px" }}>GOVERN</div>
          <button className={styles.navBtn} onClick={() => setScreen("regulatory")} style={navBtn("regulatory")}>
            <svg width="17" height="17" viewBox="0 0 24 24" {...iconStroke}><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /><path d="M9 12l2 2 4-4" /></svg>
            <span>Regulatory queue</span>
            <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "var(--warn)", background: "color-mix(in srgb,var(--warn) 16%,transparent)", borderRadius: 6, padding: "1px 7px" }}>3</span>
          </button>
          <button className={styles.navBtn} onClick={() => setScreen("rulepack")} style={navBtn("rulepack")}>
            <svg width="17" height="17" viewBox="0 0 24 24" {...iconStroke}><path d="M4 4h11l5 5v11H4z" /><path d="M15 4v5h5" /><path d="M8 13h6M8 17h4" /></svg>
            <span>Rule-pack verify</span>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", marginLeft: "auto" }} />
          </button>
        </nav>
        <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 9, background: "var(--surface-alt)" }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--info)", color: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12 }}>AM</div>
            <div style={{ lineHeight: 1.2, flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>Aisha Meyers</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>Platform Ops · Admin</div>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", height: "100%" }}>
        <header style={{ flex: "none", height: 60, borderBottom: "1px solid var(--border)", background: "color-mix(in srgb,var(--surface) 70%,transparent)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", gap: 16, padding: "0 24px" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...archivo, fontWeight: 700, fontSize: 17, letterSpacing: "-.01em", lineHeight: 1.1 }}>{screenTitle}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.2 }}>{screenDesc}</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 11px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--muted)", fontSize: 13, minWidth: 210 }}>
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
            <div className={styles.fadein} style={{ padding: "24px 28px 60px", maxWidth: 1240, margin: "0 auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 14, marginBottom: 22 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, marginBottom: 16 }}>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", boxShadow: "var(--shadow)" }}>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 }}>
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
                    <a className={styles.link} href="#" onClick={(e) => { e.preventDefault(); setScreen("tenants"); }} style={{ fontSize: 12, fontWeight: 600 }}>View all</a>
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: "2px 6px 6px" }}>
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
            <div className={styles.fadein} style={{ padding: "24px 28px 60px" }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                {tenantFilters.map((f, i) => (
                  <div key={String(f[0])} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid var(--border)", background: i === 0 ? "var(--surface-alt)" : "var(--surface)", color: "var(--text)" }}>
                    {f[0]}<span style={{ color: "var(--muted)", fontWeight: 600, marginLeft: 2 }}>{String(f[1])}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: "var(--surface-alt)" }}>
                    <th style={th}>BUSINESS</th><th style={th}>PARISH</th><th style={th}>PLAN</th><th style={th}>TRN</th><th style={th}>STATUS</th><th style={{ ...th, textAlign: "right" }}>LAST ACTIVE</th>
                  </tr></thead>
                  <tbody>
                    {tenantsRaw.map((t, i) => {
                      const [sl, st] = statusMap[t[4]]!;
                      return (
                        <tr key={i} className={styles.rowHover} onClick={() => setTenantId(i)} style={{ cursor: "pointer", transition: "background .12s" }}>
                          <td style={td}><div style={{ display: "flex", alignItems: "center", gap: 11 }}><div style={{ width: 30, height: 30, flex: "none", borderRadius: 8, background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center", ...archivo, fontWeight: 700, fontSize: 11, color: "var(--muted)" }}>{initOf(t[0])}</div><span style={{ fontWeight: 600 }}>{t[0]}</span></div></td>
                          <td style={{ ...td, color: "var(--muted)" }}>{t[1]}</td>
                          <td style={td}><span style={pill(planTone[t[2]]!)}>{t[2]}</span></td>
                          <td style={{ ...td, ...archivo, fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>{t[3]}</td>
                          <td style={td}><span style={pill(st)}>{sl}</span></td>
                          <td style={{ ...td, textAlign: "right", color: "var(--muted)" }}>{t[5]}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUPPLIERS */}
          {screen === "suppliers" && (
            <div className={styles.fadein} style={{ padding: "24px 28px 60px", maxWidth: 1240, margin: "0 auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 18 }}>
                {supplierStats.map((s) => (
                  <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "15px 16px", boxShadow: "var(--shadow)" }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", marginBottom: 8 }}>{s.label}</div>
                    <div style={{ ...archivo, fontWeight: 700, fontSize: 23, letterSpacing: "-.02em", color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: "var(--surface-alt)" }}>
                    <th style={th}>SUPPLIER</th><th style={th}>CATEGORY</th><th style={{ ...th, textAlign: "right" }}>SKUS</th><th style={th}>PRICE FRESHNESS</th><th style={th}>LAST FETCH</th>
                  </tr></thead>
                  <tbody>
                    {suppliersRaw.map((s, i) => {
                      const tone = freshTone[s[3]]!;
                      return (
                        <tr key={i} className={styles.rowHover}>
                          <td style={{ ...td, padding: "13px 16px" }}><div style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ fontWeight: 600 }}>{s[0]}</span>{s[2] && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: "var(--accent)", background: "color-mix(in srgb,var(--accent) 14%,transparent)", border: "1px solid color-mix(in srgb,var(--accent) 32%,transparent)", padding: "2px 7px", borderRadius: 999 }}>★ PARTNER</span>}</div></td>
                          <td style={{ ...td, padding: "13px 16px", color: "var(--muted)" }}>{s[1]}</td>
                          <td style={{ ...td, padding: "13px 16px", textAlign: "right", ...archivo, fontVariantNumeric: "tabular-nums" }}>{s[6].toLocaleString("en-US")}</td>
                          <td style={{ ...td, padding: "13px 16px" }}><span style={pill(tone)}><span style={dot(tone, { marginTop: 0, ...(s[3] === "stale" ? { animation: "admin-pulse 1.4s infinite" } : {}) })} />{s[4]}</span></td>
                          <td style={{ ...td, padding: "13px 16px", color: "var(--muted)", fontSize: 12.5 }}>{s[5]}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* REGULATORY */}
          {screen === "regulatory" && (
            <div className={styles.fadein} style={{ padding: "24px 28px 60px", maxWidth: 1100, margin: "0 auto" }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
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
                    <div key={i} className={styles.rowHover} style={{ display: "flex", alignItems: "center", gap: 16, padding: "15px 18px", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ width: 40, height: 40, flex: "none", borderRadius: 10, background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" {...iconStroke}><path d="M4 4h11l5 5v11H4z" /><path d="M15 4v5h5" /></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{r[0]}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontWeight: 600, color: "var(--info)" }}>{r[1]}</span>·<span>Effective {r[2]}</span>·<span>Flagged {r[3]}</span></div>
                      </div>
                      <span style={pill(st)}>{sl}</span>
                      <button onClick={() => { setScreen("rulepack"); if (r[0].includes("GCT")) setDiffOpen(true); }} style={{ height: 32, padding: "0 13px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: isNeeds ? "none" : "1px solid var(--border)", background: isNeeds ? "var(--accent)" : "var(--surface)", color: isNeeds ? "#fff" : "var(--text)" }}>{isNeeds ? "Review diff" : "View"}</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* RULE-PACK */}
          {screen === "rulepack" && (
            <div className={styles.fadein} style={{ padding: "24px 28px 60px", maxWidth: 1180, margin: "0 auto" }}>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px", boxShadow: "var(--shadow)", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
                  <div style={{ width: 52, height: 52, flex: "none", borderRadius: 12, background: "linear-gradient(135deg,#0a7d3f,#f7d20e 55%,#0a0a0a)", display: "flex", alignItems: "center", justifyContent: "center", ...archivo, fontWeight: 800, color: "#fff", fontSize: 19, boxShadow: "var(--shadow)" }}>JM</div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ ...archivo, fontWeight: 800, fontSize: 22, letterSpacing: "-.02em" }}>{jm.countryName}</span>
                      <span style={{ ...archivo, fontWeight: 700, fontSize: 12, background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: 7, padding: "3px 9px", letterSpacing: ".02em" }}>{published ? "v2025.4" : "v2025.3"}</span>
                      <span style={pill("good", { padding: "3px 10px" })}>{published ? "Up to date ✓" : "Verified ✓"}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }}>Rule-pack governs {jm.taxLabel}, {jm.taxpayerId.label} validation, parish regions, payroll statutory items &amp; payment rails · Last published {published ? "just now" : jm.verifiedAsOf} by Devon Reid</div>
                  </div>
                  <button onClick={() => setDiffOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}><path d="M8 3v18M16 3v18" /><path d="M8 8h8M8 16h8" /></svg>Review incoming diff
                  </button>
                </div>
                {!published && (
                  <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 11, background: "color-mix(in srgb,var(--warn) 11%,transparent)", border: "1px solid color-mix(in srgb,var(--warn) 30%,transparent)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
                    <div style={{ flex: 1, fontSize: 13 }}><b style={{ fontWeight: 700 }}>1 change pending review</b> — TAJ proposes a tourism-sector GCT sub-rate. Diff drafted as v2025.4.</div>
                    <button onClick={() => setDiffOpen(true)} style={{ background: "none", border: "none", color: "var(--warn)", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Review →</button>
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
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
                <div style={{ padding: "16px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ ...archivo, fontWeight: 700, fontSize: 15 }}>Payroll statutory items</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Employee &amp; employer contribution rates applied to estimates with labour</div>
                  </div>
                  <span style={verified}>All {payroll.length} verified ✓</span>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
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
                        <td style={{ ...td, padding: "13px 20px" }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={verified}>Verified ✓</span><span style={{ fontSize: 11.5, color: "var(--muted)" }}>{p.prov}</span></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* TENANT DRAWER */}
      {selTenant && <TenantDrawer raw={selTenant} onClose={() => setTenantId(null)} />}

      {/* DIFF MODAL */}
      {diffOpen && (
        <div onClick={() => setDiffOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,12,8,.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
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
  const [sl, st] = statusMap[status]!;
  const init = name.split(" ").slice(0, 2).map((w) => w[0]).join("");
  const limit = plan === "Pro" ? 9999 : plan === "Core" ? 250 : plan === "Starter" ? 60 : 15;
  const seats = plan === "Pro" ? 12 : plan === "Core" ? 6 : plan === "Starter" ? 3 : 1;
  const usedSeats = Math.max(1, Math.round(seats * 0.7));
  const mrrPlan = ({ Free: 0, Starter: 4900, Core: 12900, Pro: 34900 } as Record<string, number>)[plan]!;
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
      <div className={`${styles.scr} ${styles.slidein}`} style={{ position: "fixed", top: 0, right: 0, height: "100vh", width: 420, background: "var(--surface)", borderLeft: "1px solid var(--border)", zIndex: 41, overflowY: "auto", boxShadow: "-20px 0 50px -24px rgba(0,0,0,.4)" }}>
        <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", gap: 13 }}>
          <div style={{ width: 42, height: 42, flex: "none", borderRadius: 11, background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center", ...archivo, fontWeight: 700, fontSize: 14, color: "var(--muted)" }}>{init}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...archivo, fontWeight: 700, fontSize: 17, lineHeight: 1.15 }}>{name}</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>{parish} · TRN {trn}</div>
            <div style={{ display: "flex", gap: 7, marginTop: 9 }}><span style={pill(planTone[plan]!)}>{plan}</span><span style={pill(st)}>{sl}</span></div>
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
