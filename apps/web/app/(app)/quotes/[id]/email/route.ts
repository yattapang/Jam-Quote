import { renderToBuffer } from "@react-pdf/renderer";
import { Resend } from "resend";
import { formatJmd } from "@jamquote/core";
import { getQuote, getClients, getBusiness } from "@/lib/api-server";
import { getSession } from "@/lib/session";
import { getQuoteTotals } from "@/lib/quote-totals";
import QuotePdf from "@/lib/pdf/QuotePdf";
import { escapeHtml } from "@/lib/escape-html";

// Same reasoning as the PDF route: @react-pdf/renderer needs Node's
// Buffer/streams, not available on the edge runtime.
export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  // Auth is checked here explicitly, before touching api-server. The getX()
  // helpers redirect to /login on a 401, and this route is called via fetch()
  // — which follows redirects — so the caller would receive the login page as
  // a 200 and report "Sent" for a quote that was never emailed. Middleware
  // only checks that the cookie EXISTS, so a present-but-expired token still
  // reaches this handler; getSession() validates it against /auth/me.
  const session = await getSession();
  if (!session) {
    return Response.json(
      { error: "Your session has expired. Please sign in again." },
      { status: 401 },
    );
  }

  if (!process.env.RESEND_API_KEY) {
    return Response.json({ error: "Email is not configured yet." }, { status: 503 });
  }

  const quote = await getQuote(params.id);
  if (!quote) {
    return Response.json({ error: "Quote not found." }, { status: 404 });
  }

  const [clients, business] = await Promise.all([getClients(), getBusiness()]);
  const client = clients.find((c) => c.id === quote.clientId);
  if (!client?.email) {
    return Response.json({ error: "This client has no email address on file." }, { status: 400 });
  }

  const totalCents = getQuoteTotals(quote).totalCents;
  const buffer = await renderToBuffer(QuotePdf({ quote, client, business }));

  // Escaped before interpolation: these are free text a contractor typed, so
  // "Bell & Sons" would otherwise reach the customer as broken markup, and a
  // name containing tags would be injected into the message outright. Shares
  // the helper with the invoice email so the two cannot diverge.
  const businessName = escapeHtml(business.name);
  const quoteNum = escapeHtml(quote.num);
  const clientName = escapeHtml(client.name || "there");

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.QUOTE_FROM_EMAIL ?? "JamQuote <onboarding@resend.dev>",
    to: client.email,
    replyTo: process.env.QUOTE_REPLY_TO || undefined,
    subject: `Quote ${quote.num} from ${business.name}`,
    html: `
      <p>Hi ${clientName},</p>
      <p>Here's quote <strong>${quoteNum}</strong> from ${businessName}, for a total of <strong>${formatJmd(totalCents)}</strong>.</p>
      <p>The full quote is attached as a PDF.</p>
      <p>Thanks,<br/>${businessName}</p>
    `,
    attachments: [{ filename: `Quote-${quote.num}.pdf`, content: buffer }],
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 502 });
  }

  return Response.json({ ok: true });
}
