import { notFound } from "next/navigation";
import {
  formatJmd,
  QuoteDetailLevel,
  groupJobComponents,
  componentQuantityLabel,
  invoiceSettlement,
} from "@jamquote/core";
import Card from "@/components/ui/Card";
import StatusPill from "@/components/ui/StatusPill";
import MoneyText from "@/components/ui/MoneyText";
import { invoiceStatusPill } from "@/lib/status";
import {
  getQuoteTotals,
  groupLinesByHeading,
  lineUnitLabel,
  GCT_TREATMENT_LABEL,
} from "@/lib/quote-totals";
import { getInvoice, getClients } from "@/lib/api-server";
import InvoiceActions from "./InvoiceActions";
import EmailInvoiceButton from "./EmailInvoiceButton";
import RemindButton from "./RemindButton";
import { emailSendingStatus } from "@/lib/email-sending";
import shared from "../../shared.module.css";
import buttonStyles from "@/components/ui/Button.module.css";
import PaymentsPanel from "./PaymentsPanel";
import RetentionPanel from "./RetentionPanel";

export const metadata = { title: "Invoice · JamQuote" };

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const invoice = await getInvoice(params.id);
  if (!invoice) notFound();

  const clients = await getClients();
  const client = clients.find((c) => c.id === invoice.clientId);
  // getQuoteTotals only needs lines/gctRatePct/discountPct/depositCents —
  // Invoice carries the same shape as Quote there, so the same math (and the
  // same single source of truth, @jamquote/core's computeTotals) applies.
  const totals = getQuoteTotals(invoice);
  // Server-side: depends on env vars the browser cannot read.
  const sending = emailSendingStatus();
  const pill = invoiceStatusPill(invoice.status);
  const groups = groupLinesByHeading(invoice);
  const detailed = invoice.detailLevel === QuoteDetailLevel.DETAILED;
  // Retention is NOT a shortfall. An invoice with 10% held is settled when
  // the other 90% arrives — the rest is being held under the contract, not
  // owed. Showing it as a balance due has contractors chasing clients for
  // money nobody owes yet. See invoiceSettlement in core.
  const settlement = invoiceSettlement({
    totalCents: totals.totalCents,
    paidCents: invoice.paidCents,
    retentionCents: invoice.retentionCents,
    retentionReleased: invoice.retentionReleased,
  });
  const balanceDueCents = settlement.outstandingCents;

  const amountByLineId = new Map<string, number>();
  invoice.lines.forEach((l, i) => {
    amountByLineId.set(l.id, totals.lineTotals[i]?.afterMarkupCents ?? 0);
  });

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>
            <a href="/invoices" style={{ color: "inherit" }}>
              ← Invoices
            </a>
          </span>
          <h1 className={shared.title}>
            {invoice.num} <StatusPill label={pill.label} kind={pill.kind} variant={pill.variant} />
          </h1>
          <span className={shared.subtitle}>{client?.name ?? "Unknown client"}</span>
        </div>
        <div className={shared.headerActions}>
          {/* Plain <a>, not a Link: this is a file download from a route
              handler, so client-side navigation would fight it. Matches how
              the quote PDF is exposed. */}
          <a
            href={`/invoices/${invoice.id}/pdf`}
            className={`${buttonStyles.base} ${buttonStyles.secondary} ${buttonStyles.sm}`}
          >
            Download PDF
          </a>
          <EmailInvoiceButton
            invoiceId={invoice.id}
            clientEmail={client?.email}
            unavailableReason={sending.configured ? undefined : sending.reason}
          />
          {/* Chasing only makes sense once something is issued and still
              owed. A reminder on a settled invoice is worse than none. */}
          {invoice.status !== "DRAFT" && balanceDueCents > 0 && (
            <RemindButton
              invoiceId={invoice.id}
              clientPhone={client?.phone}
              reminders={invoice.reminders}
              emailUnavailableReason={sending.configured ? undefined : sending.reason}
            />
          )}
          <InvoiceActions id={invoice.id} status={invoice.status} />
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
                {g.lines.map((line) => {
                  const showBreakdown = detailed && !!line.jobComponents?.length;
                  return (
                    <div key={line.id}>
                      <div className={shared.lineRow}>
                        <span className={shared.lineDesc}>{line.description}</span>
                        <span className={shared.lineMeta}>
                          {line.quantity} {lineUnitLabel(line)} ·{" "}
                          {GCT_TREATMENT_LABEL[line.gctTreatment]}
                        </span>
                        <MoneyText cents={amountByLineId.get(line.id) ?? 0} weight={700} />
                      </div>
                      {showBreakdown && (
                        <div
                          style={{
                            margin: "2px 0 10px 12px",
                            borderLeft: "2px solid var(--jq-border)",
                            paddingLeft: 12,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              textTransform: "uppercase",
                              letterSpacing: 0.4,
                              color: "var(--jq-text-muted)",
                              padding: "2px 0",
                            }}
                          >
                            Breakdown{line.jobUnit ? ` (per ${line.jobUnit})` : ""}
                          </div>
                          {groupJobComponents(line.jobComponents!).map((c, i) => (
                            <div
                              key={i}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 12,
                                fontSize: 12.5,
                                color: "var(--jq-text-muted)",
                                padding: "1px 0",
                              }}
                            >
                              <span>{c.description}</span>
                              <span>
                                {componentQuantityLabel(c)} × {formatJmd(c.unitPriceCents)} ={" "}
                                {formatJmd(Math.round(c.quantityPerUnit * c.unitPriceCents))}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
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
                  <span>Discount ({invoice.discountPct}%)</span>
                  <MoneyText cents={-totals.discountCents} tone="muted" weight={600} />
                </div>
              )}
              <div className={shared.totalRowMuted}>
                <span>GCT ({invoice.gctRatePct}% on standard)</span>
                <MoneyText cents={totals.gctCents} tone="muted" weight={600} />
              </div>
              <div className={shared.totalRowGrand}>
                <span>Total</span>
                <MoneyText cents={totals.totalCents} tone="accent" />
              </div>
              {invoice.depositCents > 0 && (
                <div className={shared.totalRowMuted}>
                  <span>Deposit requested</span>
                  <MoneyText cents={invoice.depositCents} tone="muted" weight={600} />
                </div>
              )}
              {settlement.heldCents > 0 && (
                <div className={shared.totalRowMuted}>
                  <span>
                    Retention held ({invoice.retentionPct}%)
                  </span>
                  <MoneyText cents={settlement.heldCents} tone="muted" weight={600} />
                </div>
              )}
              <hr className={shared.divider} />
              <div className={shared.totalRowMuted}>
                <span>Paid</span>
                <MoneyText cents={invoice.paidCents} tone="good" weight={600} />
              </div>
              <div className={shared.totalRow}>
                {/* Named "due now" only when something IS being held, so an
                    ordinary invoice reads exactly as it always did. */}
                <span>{settlement.heldCents > 0 ? "Due now" : "Balance due"}</span>
                <MoneyText cents={balanceDueCents} weight={700} />
              </div>
              {settlement.heldCents > 0 && settlement.settledForNow && (
                <div className={shared.statHint}>
                  Fully paid apart from retention, which is released on sign-off.
                </div>
              )}
            </div>
          </Card>

          {invoice.retentionCents > 0 && (
            <Card>
              <RetentionPanel
                invoiceId={invoice.id}
                retentionPct={invoice.retentionPct}
                heldCents={invoice.retentionCents}
                released={invoice.retentionReleased}
                isDraft={invoice.status === "DRAFT"}
              />
            </Card>
          )}

          <Card>
            <PaymentsPanel
              invoiceId={invoice.id}
              status={invoice.status}
              balanceDueCents={balanceDueCents}
              payments={invoice.payments}
            />
          </Card>

          <Card>
            <div className={shared.statLabel}>Details</div>
            <div className={shared.list}>
              <div className={shared.totalRowMuted}>
                <span>{invoice.createdLabel}</span>
                <span>{invoice.dueDateLabel || "No due date"}</span>
              </div>
              {invoice.terms && (
                <div className={shared.totalRowMuted}>
                  <span>Terms</span>
                  <span>{invoice.terms}</span>
                </div>
              )}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
