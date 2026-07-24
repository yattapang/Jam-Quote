import { renderToBuffer } from "@react-pdf/renderer";
import { Resend } from "resend";
import { formatJmd } from "@jamquote/core";
import { getQuote, getClients, getBusiness } from "@/lib/api-server";
import { getQuoteTotals } from "@/lib/quote-totals";
import QuotePdf from "@/lib/pdf/QuotePdf";

// Same reasoning as the PDF route: @react-pdf/renderer needs Node's
// Buffer/streams, not available on the edge runtime.
export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
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

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.QUOTE_FROM_EMAIL ?? "JamQuote <onboarding@resend.dev>",
    to: client.email,
    replyTo: process.env.QUOTE_REPLY_TO || undefined,
    subject: `Quote ${quote.num} from ${business.name}`,
    html: `
      <p>Hi ${client.name || "there"},</p>
      <p>Here's quote <strong>${quote.num}</strong> from ${business.name}, for a total of <strong>${formatJmd(totalCents)}</strong>.</p>
      <p>The full quote is attached as a PDF.</p>
      <p>Thanks,<br/>${business.name}</p>
    `,
    attachments: [{ filename: `Quote-${quote.num}.pdf`, content: buffer }],
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 502 });
  }

  return Response.json({ ok: true });
}
