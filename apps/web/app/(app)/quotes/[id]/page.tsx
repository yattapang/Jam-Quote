import { notFound } from "next/navigation";
import Card from "@/components/ui/Card";
import StatusPill from "@/components/ui/StatusPill";
import MoneyText from "@/components/ui/MoneyText";
import { quoteStatusPill } from "@/lib/status";
import {
  getQuoteTotals,
  groupLinesByHeading,
  RATE_UNIT_LABEL,
  GCT_TREATMENT_LABEL,
} from "@/lib/quote-totals";
import { getQuote, getClients, getBusiness } from "@/lib/api-client";
import QuoteActions from "./QuoteActions";
import WhatsAppButton from "./WhatsAppButton";
import buttonStyles from "@/components/ui/Button.module.css";
import shared from "../../shared.module.css";

export default async function QuoteDetailPage({ params }: { params: { id: string } }) {
  const quote = await getQuote(params.id);
  if (!quote) notFound();

  const [clients, business] = await Promise.all([getClients(), getBusiness()]);
  const client = clients.find((c) => c.id === quote.clientId);
  const totals = getQuoteTotals(quote);
  const pill = quoteStatusPill(quote.status);
  const groups = groupLinesByHeading(quote);

  // Map each line to its computed after-markup amount (index-aligned with core).
  const amountByLineId = new Map<string, number>();
  quote.lines.forEach((l, i) => {
    amountByLineId.set(l.id, totals.lineTotals[i]?.afterMarkupCents ?? 0);
  });

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>
            <a href="/quotes" style={{ color: "inherit" }}>
              ← Quotes
            </a>
          </span>
          <h1 className={shared.title}>
            {quote.num}{" "}
            <StatusPill label={pill.label} kind={pill.kind} variant={pill.variant} />
          </h1>
          <span className={shared.subtitle}>
            {client?.name ?? "Unknown client"} · {quote.jobLabel}
          </span>
        </div>
        <div className={shared.headerActions}>
          <a
            href={`/quotes/${quote.id}/pdf`}
            className={`${buttonStyles.base} ${buttonStyles.secondary} ${buttonStyles.sm}`}
          >
            Download PDF
          </a>
          <WhatsAppButton
            quoteId={quote.id}
            quoteNum={quote.num}
            clientName={client?.name}
            clientPhone={client?.phone}
            totalCents={totals.totalCents}
          />
          <QuoteActions id={quote.id} status={quote.status} />
        </div>
      </header>

      <div className={shared.grid2}>
        <section className={shared.section}>
          <Card>
            {groups.map((g, i) => (
              <div key={`${g.title}-${i}`} className={shared.lineGroup}>
                <div className={shared.groupHead}>
                  <span className={shared.groupName}>{g.title}</span>
                </div>
                {g.lines.map((line) => (
                  <div key={line.id} className={shared.lineRow}>
                    <span className={shared.lineDesc}>{line.description}</span>
                    <span className={shared.lineMeta}>
                      {line.quantity} {RATE_UNIT_LABEL[line.rateUnit]} ·{" "}
                      {GCT_TREATMENT_LABEL[line.gctTreatment]}
                    </span>
                    <MoneyText cents={amountByLineId.get(line.id) ?? 0} weight={700} />
                  </div>
                ))}
              </div>
            ))}
          </Card>
        </section>

        <section className={shared.section}>
          <Card>
            <div className={shared.totals}>
              <div className={shared.totalRow}>
                <span>Subtotal</span>
                <MoneyText cents={totals.subtotalCents} weight={600} />
              </div>
              {totals.discountCents > 0 && (
                <div className={shared.totalRowMuted}>
                  <span>Discount ({quote.discountPct}%)</span>
                  <MoneyText cents={-totals.discountCents} tone="muted" weight={600} />
                </div>
              )}
              <div className={shared.totalRowMuted}>
                <span>GCT ({quote.gctRatePct}% on standard)</span>
                <MoneyText cents={totals.gctCents} tone="muted" weight={600} />
              </div>
              <div className={shared.totalRowGrand}>
                <span>Total</span>
                <MoneyText cents={totals.totalCents} tone="accent" />
              </div>
              {totals.depositCents > 0 && (
                <>
                  <hr className={shared.divider} />
                  <div className={shared.totalRowMuted}>
                    <span>Deposit requested</span>
                    <MoneyText cents={totals.depositCents} tone="muted" weight={600} />
                  </div>
                  <div className={shared.totalRow}>
                    <span>Balance due</span>
                    <MoneyText cents={totals.balanceDueCents} weight={700} />
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card>
            <div className={shared.statLabel}>Details</div>
            <div className={shared.list}>
              <div className={shared.totalRowMuted}>
                <span>TRN</span>
                <span>{business.trn || "—"}</span>
              </div>
              <div className={shared.totalRowMuted}>
                <span>{quote.createdLabel}</span>
                <span>{quote.validUntilLabel}</span>
              </div>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
