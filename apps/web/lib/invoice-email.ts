/**
 * Subject + HTML body for the invoice email (#34).
 *
 * Split out of the route handler so the wording — which is what a contractor's
 * customer actually reads — is testable without a Resend key or a rendered
 * PDF. The route stays responsible for auth, attachments and delivery.
 */
import { formatJmd } from "@jamquote/core";
import { escapeHtml } from "./escape-html";

/**
 * Content-ID the logo attachment is referenced by from the body.
 *
 * A CID inline attachment is the only logo delivery that survives the major
 * clients: Gmail and Outlook both block or strip remote <img src="https://…">
 * and `data:` URIs by default, which yields a silently logo-less email rather
 * than a visible failure.
 */
export const LOGO_CID = "jamquote-invoice-logo";

export interface InvoiceEmailInput {
  invoiceNum: string;
  businessName: string;
  /** Blank/absent falls back to a neutral greeting. */
  clientName?: string;
  /**
   * What is still OWED, not the invoice total. An invoice with payments
   * recorded against it says a smaller number on its PDF, and an email asking
   * for the full total beside it reads as a second bill.
   */
  balanceDueCents: number;
  dueDateLabel?: string;
  /**
   * Whether the logo is actually attached as an inline part on this send. When
   * false the header degrades to the business name as text — a logo that could
   * not be fetched or attached must never stop the invoice going out.
   */
  withLogo?: boolean;
}

export function buildInvoiceEmail(input: InvoiceEmailInput): { subject: string; html: string } {
  const { invoiceNum, businessName, clientName, balanceDueCents, dueDateLabel, withLogo } = input;
  const settled = balanceDueCents === 0;
  const business = escapeHtml(businessName);
  const num = escapeHtml(invoiceNum);
  const greetName = clientName?.trim() ? escapeHtml(clientName.trim()) : "there";

  const header = withLogo
    ? `<img src="cid:${LOGO_CID}" alt="${business}" style="max-width:180px;max-height:56px" />`
    : `<h2 style="margin:0 0 16px;font-size:18px">${business}</h2>`;

  // A settled invoice is a receipt, not a request for money — asking a
  // customer to pay $0.00 is worse than saying nothing.
  const body = settled
    ? `<p>Invoice <strong>${num}</strong> is paid in full — nothing further is owed. A copy is attached for your records.</p>`
    : // The label already arrives sentence-cased ("Due 30 Aug 2026"), so it is
      // parenthesised rather than run into the sentence.
      `<p>Here's invoice <strong>${num}</strong> from ${business}. The amount due is <strong>${formatJmd(
        balanceDueCents,
      )}</strong>${dueDateLabel?.trim() ? ` (${escapeHtml(dueDateLabel.trim())})` : ""}.</p>
      <p>The full invoice is attached as a PDF.</p>`;

  return {
    subject: settled
      ? `Invoice ${invoiceNum} from ${businessName} — paid in full`
      : `Invoice ${invoiceNum} from ${businessName}`,
    html: `
      ${header}
      <p>Hi ${greetName},</p>
      ${body}
      <p>Thanks,<br/>${business}</p>
    `,
  };
}
