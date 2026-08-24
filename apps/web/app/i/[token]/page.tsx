import { formatJmd, invoiceSettlement } from "@jamquote/core";
import { getSharedInvoice } from "@/lib/public-invoice";
import type { PublicQuoteLine } from "@/lib/public-quote";
import styles from "../../q/[token]/shared-quote.module.css";
import PrintButton from "../../q/[token]/PrintButton";

export const metadata = { title: "Your invoice" };

/**
 * The invoice a contractor's CLIENT sees.
 *
 * Built for the payment reminder: a WhatsApp chase that names a figure but
 * cannot show the document behind it is the first thing a client queries, and
 * "send me the invoice again" is the delay that keeps the money out.
 *
 * Shares the quote page's stylesheet on purpose — a client who has seen the
 * quote should recognise the invoice as coming from the same place. Written
 * for someone who has never heard of JamQuote and will never sign in.
 */
export default async function SharedInvoicePage({ params }: { params: { token: string } }) {
  const invoice = await getSharedInvoice(params.token);

  if (!invoice) {
    // One message for an unknown token, a revoked link and a draft — telling
    // an anonymous visitor which would confirm whether a token is real.
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>This link isn&apos;t available</h1>
          <p className={styles.muted}>
            It may have been withdrawn, or the address may be incomplete. Ask whoever sent it for a
            fresh link.
          </p>
        </div>
      </main>
    );
  }

  const { business } = invoice;
  const address = [business.addressLine, business.town, business.parish].filter(Boolean).join(", ");
  const allLines: { heading: string | null; lines: PublicQuoteLine[] }[] = [
    ...(invoice.lineItems.length > 0 ? [{ heading: null, lines: invoice.lineItems }] : []),
    ...invoice.sections.map((s) => ({ heading: s.title, lines: s.lineItems })),
  ];

  // The same settlement split the contractor sees. Retention held back is not
  // owed yet, so showing it inside "due now" would demand money the contract
  // says the client may keep.
  const settlement = invoiceSettlement({
    totalCents: invoice.totalCents,
    paidCents: invoice.paidCents,
    retentionCents: invoice.retentionCents,
    retentionReleased: invoice.retentionReleased,
  });

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <header className={styles.header}>
          <div>
            <div className={styles.business}>{business.name}</div>
            {address && <div className={styles.muted}>{address}</div>}
            {business.trn && <div className={styles.muted}>TRN {business.trn}</div>}
          </div>
          <div className={styles.numberBlock}>
            <div className={styles.number}>{invoice.number}</div>
            <div className={styles.muted}>Issued {invoice.issueDate.slice(0, 10)}</div>
            {invoice.dueDate && (
              <div className={styles.muted}>Due {invoice.dueDate.slice(0, 10)}</div>
            )}
          </div>
        </header>

        {invoice.clientName && <p className={styles.forWhom}>Invoice for {invoice.clientName}</p>}

        {allLines.map((group, gi) => (
          <section key={gi} className={styles.group}>
            {group.heading && <h2 className={styles.groupTitle}>{group.heading}</h2>}
            <table className={styles.table}>
              <tbody>
                {group.lines.map((l) => (
                  <tr key={l.id}>
                    <td className={styles.desc}>
                      {l.description}
                      <span className={styles.qty}>
                        {" "}
                        — {l.quantity} {l.unitLabel?.trim() || l.rateUnit.toLowerCase()}
                      </span>
                    </td>
                    <td className={styles.amount}>
                      {formatJmd(Math.round(Number(l.quantity) * l.unitPriceCents))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        <dl className={styles.totals}>
          <div>
            <dt>Subtotal</dt>
            <dd>{formatJmd(invoice.subtotalCents)}</dd>
          </div>
          <div>
            <dt>GCT</dt>
            <dd>{formatJmd(invoice.gctCents)}</dd>
          </div>
          <div className={styles.grand}>
            <dt>Total</dt>
            <dd>{formatJmd(invoice.totalCents)}</dd>
          </div>
          {invoice.paidCents > 0 && (
            <div>
              <dt>Paid</dt>
              <dd>{formatJmd(invoice.paidCents)}</dd>
            </div>
          )}
          {settlement.heldCents > 0 && (
            <div>
              <dt>Retention held</dt>
              <dd>{formatJmd(settlement.heldCents)}</dd>
            </div>
          )}
          <div className={styles.grand}>
            {/* Named "due now" only when retention is being held, so an
                ordinary invoice reads exactly as the client expects. */}
            <dt>{settlement.heldCents > 0 ? "Due now" : "Balance due"}</dt>
            <dd>{formatJmd(settlement.outstandingCents)}</dd>
          </div>
        </dl>

        {invoice.terms && (
          <section className={styles.terms}>
            <h2 className={styles.groupTitle}>Terms</h2>
            <p>{invoice.terms}</p>
          </section>
        )}

        <PrintButton />

        <p className={styles.footer}>
          To pay or query this invoice, contact {business.name} directly.
        </p>
      </div>
    </main>
  );
}
