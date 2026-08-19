import { formatJmd } from "@jamquote/core";
import { getSharedQuote, type PublicQuoteLine } from "@/lib/public-quote";
import styles from "./shared-quote.module.css";
import PrintButton from "./PrintButton";

export const metadata = { title: "Your quote" };

/**
 * The quote a contractor's CLIENT sees.
 *
 * Public by design — `/q` is not in the middleware's protected prefixes, and
 * the share token is the authorisation. This page exists because the WhatsApp
 * button already sent clients a link to `/quotes/<id>`, which sits behind
 * auth: the client hit a login wall, and the contractor had no way to know
 * their quote had not been read.
 *
 * Written for someone who has never heard of JamQuote and will never sign in.
 * No app chrome, no navigation, nothing to click except downloading the PDF.
 */
export default async function SharedQuotePage({ params }: { params: { token: string } }) {
  const quote = await getSharedQuote(params.token);

  if (!quote) {
    // One message for an unknown token, a revoked link and a draft. The
    // contractor can always re-share; telling an anonymous visitor WHICH of
    // the three it was would confirm whether a token is real.
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>This link isn&apos;t available</h1>
          <p className={styles.muted}>
            It may have expired or been withdrawn. Please ask for a new link.
          </p>
        </div>
      </main>
    );
  }

  const { business } = quote;
  const address = [business.addressLine, business.town, business.parish]
    .filter(Boolean)
    .join(", ");
  const allLines: { heading: string | null; lines: PublicQuoteLine[] }[] = [
    ...(quote.lineItems.length > 0 ? [{ heading: null, lines: quote.lineItems }] : []),
    ...quote.sections.map((s) => ({ heading: s.title, lines: s.lineItems })),
  ];

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
            <div className={styles.number}>{quote.number}</div>
            {quote.validUntil && (
              <div className={styles.muted}>Valid until {quote.validUntil.slice(0, 10)}</div>
            )}
          </div>
        </header>

        {quote.clientName && <p className={styles.forWhom}>Prepared for {quote.clientName}</p>}

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
            <dd>{formatJmd(quote.subtotalCents)}</dd>
          </div>
          <div>
            <dt>GCT</dt>
            <dd>{formatJmd(quote.gctCents)}</dd>
          </div>
          <div className={styles.grand}>
            <dt>Total</dt>
            <dd>{formatJmd(quote.totalCents)}</dd>
          </div>
          {quote.depositCents > 0 && (
            <div>
              <dt>Deposit</dt>
              <dd>{formatJmd(quote.depositCents)}</dd>
            </div>
          )}
        </dl>

        {quote.terms && (
          <section className={styles.terms}>
            <h2 className={styles.groupTitle}>Terms</h2>
            <p>{quote.terms}</p>
          </section>
        )}

        <PrintButton />

        <p className={styles.footer}>
          Questions about this quote? Reply to {business.name} directly.
        </p>
      </div>
    </main>
  );
}
