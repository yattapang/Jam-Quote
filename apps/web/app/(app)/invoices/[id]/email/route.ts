import { renderToBuffer } from "@react-pdf/renderer";
import { Resend } from "resend";
import { getInvoice, getClients, getBusiness, getLogoBytes } from "@/lib/api-server";
import { getSession } from "@/lib/session";
import { getQuoteTotals, invoiceBalanceCents } from "@/lib/quote-totals";
import { buildInvoiceEmail, LOGO_CID } from "@/lib/invoice-email";
import InvoicePdf from "@/lib/pdf/InvoicePdf";

// Same reasoning as the PDF route: @react-pdf/renderer needs Node's
// Buffer/streams, not available on the edge runtime.
export const runtime = "nodejs";

/** Filename extension for the inline logo part. Resend derives contentType
 * from the filename when it is not set, so the two must not disagree. */
const LOGO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  // Auth is checked here explicitly, before touching api-server. The getX()
  // helpers redirect to /login on a 401, and this route is called via fetch()
  // — which follows redirects — so the caller would receive the login page as
  // a 200 and report "Sent" for an invoice that was never emailed. Middleware
  // only checks that the cookie EXISTS, so a present-but-expired token still
  // reaches this handler; getSession() validates it against /auth/me.
  const session = await getSession();
  if (!session) {
    return Response.json(
      { error: "Your session has expired. Please sign in again." },
      { status: 401 },
    );
  }

  // Refuse loudly rather than logging a warning and returning ok. #24 fixed
  // exactly this shape on password reset: the contractor saw "Sent", the
  // customer received nothing, and nobody found out until the money was late.
  if (!process.env.RESEND_API_KEY) {
    return Response.json({ error: "Email is not configured yet." }, { status: 503 });
  }

  // Ownership: getInvoice goes through serverRequest with the caller's JWT,
  // and the API's InvoicesController is behind TenantAuthGuard and scopes
  // findOne by the businessId from that token — another tenant's invoice id
  // returns 404 here, never someone else's invoice.
  const invoice = await getInvoice(params.id);
  if (!invoice) {
    return Response.json({ error: "Invoice not found." }, { status: 404 });
  }

  // getLogoBytes resolves null rather than throwing, so a missing or
  // unreachable logo degrades to the text header instead of failing the send.
  const [clients, business, logo] = await Promise.all([getClients(), getBusiness(), getLogoBytes()]);
  const client = clients.find((c) => c.id === invoice.clientId);
  const to = client?.email;
  if (!to) {
    return Response.json({ error: "This client has no email address on file." }, { status: 400 });
  }

  // The email must ask for the BALANCE, not the total — see invoiceBalanceCents.
  const balanceDueCents = invoiceBalanceCents(getQuoteTotals(invoice).totalCents, invoice.paidCents);
  const buffer = await renderToBuffer(
    InvoicePdf({ invoice, client, business, logo: logo ?? undefined }),
  );

  const pdfAttachment = { filename: `Invoice-${invoice.num}.pdf`, content: buffer };
  // `contentId` is the field name in the installed Resend SDK (6.x); it is
  // serialised to the API's `content_id`, which marks the part inline so the
  // body's `cid:` reference resolves.
  const logoAttachment = logo
    ? {
        filename: `logo.${LOGO_EXT[logo.contentType.split(";")[0]?.trim() ?? ""] ?? "png"}`,
        content: logo.data,
        contentType: logo.contentType,
        contentId: LOGO_CID,
      }
    : null;

  const resend = new Resend(process.env.RESEND_API_KEY);
  // The from/reply-to pair is deliberately shared with the quote route: a
  // business has one sending identity, and separate INVOICE_* vars would
  // silently fall back to the resend.dev sandbox address on every deployment
  // that has only ever set QUOTE_FROM_EMAIL.
  const send = (withLogo: boolean) => {
    const { subject, html } = buildInvoiceEmail({
      invoiceNum: invoice.num,
      businessName: business.name,
      clientName: client?.name,
      balanceDueCents,
      dueDateLabel: invoice.dueDateLabel,
      withLogo,
    });
    return resend.emails.send({
      from: process.env.QUOTE_FROM_EMAIL ?? "JamQuote <onboarding@resend.dev>",
      to,
      replyTo: process.env.QUOTE_REPLY_TO || undefined,
      subject,
      html,
      attachments: withLogo && logoAttachment ? [pdfAttachment, logoAttachment] : [pdfAttachment],
    });
  };

  let { error } = await send(Boolean(logoAttachment));

  // Branding is not worth an undelivered invoice. If the send that carried the
  // inline logo was rejected (oversized part, content type Resend won't take),
  // retry once with the text header instead of reporting a failure the
  // contractor cannot act on.
  if (error && logoAttachment) {
    console.warn(
      `[invoices/email] send with inline logo failed for ${invoice.num} (${error.message}) — retrying without it`,
    );
    ({ error } = await send(false));
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 502 });
  }

  return Response.json({ ok: true });
}
