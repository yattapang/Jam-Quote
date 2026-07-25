"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import MoneyText from "@/components/ui/MoneyText";
import StatusPill from "@/components/ui/StatusPill";
import type { BillingStatus, PricingConfig } from "@/lib/api-client";
import shared from "../shared.module.css";

function renewsLabel(iso: string | null | undefined): string {
  if (!iso) return "active";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "active";
  return `renews ${d.toLocaleDateString("en-JM", { month: "short", day: "numeric", year: "numeric" })}`;
}

/**
 * Settings' "Plan & billing" card. Reads are server-fetched (getBillingStatus/
 * getBillingPlans in api-server.ts) and passed in as props; this stays a
 * client component only because the "Upgrade to Pro" CTA opens a modal.
 * Automated payment is a later phase (per CLAUDE.md's WiPay/billing phasing),
 * so the CTA is just an explainer — no fake checkout flow here.
 */
export default function BillingCard({
  status,
  plans,
}: {
  status: BillingStatus | null;
  plans: PricingConfig | null;
}) {
  const [open, setOpen] = useState(false);
  const isPro = status?.isPro ?? false;

  return (
    <Card>
      <div className={shared.sectionHead}>
        <div className={shared.statLabel}>Plan &amp; billing</div>
        <StatusPill label={isPro ? "Pro" : "Free"} kind={isPro ? "accent" : "neutral"} />
      </div>

      {!status ? (
        <div className={shared.statHint}>Couldn&apos;t load billing status — is the API running?</div>
      ) : isPro ? (
        <div className={shared.list}>
          <div className={shared.totalRow}>
            <span>Pro plan</span>
            <span style={{ textTransform: "capitalize" }}>{renewsLabel(status.renewsAt)}</span>
          </div>
          {plans && (
            <div className={shared.statHint}>
              <MoneyText cents={plans.proMonthlyPriceCents} tone="muted" size={12.5} weight={600} />
              /mo
            </div>
          )}
        </div>
      ) : (
        <div className={shared.list}>
          <div className={shared.totalRowMuted}>
            <span>Quotes used this month</span>
            <span>
              {status.quotesThisMonth} of {status.freeQuotesPerMonth}
            </span>
          </div>
          {plans && (
            <div className={shared.statHint}>
              Upgrade for unlimited quotes —{" "}
              <MoneyText cents={plans.proMonthlyPriceCents} tone="accent" size={12.5} weight={700} />
              /mo or <MoneyText cents={plans.proAnnualPriceCents} tone="accent" size={12.5} weight={700} />
              /yr
            </div>
          )}
          <div style={{ marginTop: 4 }}>
            <Button variant="outlineAccent" size="sm" onClick={() => setOpen(true)}>
              Upgrade to Pro
            </Button>
          </div>
        </div>
      )}

      {open && (
        <Modal title="Upgrade to Pro" onClose={() => setOpen(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13.5, lineHeight: 1.55 }}>
            <p>
              Automated upgrades aren&apos;t live yet — to move to Pro, contact JamQuote and we&apos;ll switch
              your plan on our end.
            </p>
            {plans && (
              <p style={{ color: "var(--jq-text-muted)" }}>
                Pro is <MoneyText cents={plans.proMonthlyPriceCents} tone="default" size={13.5} weight={700} />
                /mo or <MoneyText cents={plans.proAnnualPriceCents} tone="default" size={13.5} weight={700} />
                /yr — unlimited quotes.
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
                Got it
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}
