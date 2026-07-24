import { renderToBuffer } from "@react-pdf/renderer";
import { getQuote, getClients, getBusiness } from "@/lib/api-server";
import QuotePdf from "@/lib/pdf/QuotePdf";

// @react-pdf/renderer needs Node's Buffer/streams — not available on the edge
// runtime. Route handlers aren't wrapped by the (app) layout, so this returns
// a raw PDF response.
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const quote = await getQuote(params.id);
  if (!quote) {
    return new Response("Quote not found", { status: 404 });
  }

  const [clients, business] = await Promise.all([getClients(), getBusiness()]);
  const client = clients.find((c) => c.id === quote.clientId);

  const buffer = await renderToBuffer(QuotePdf({ quote, client, business }));

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Quote-${quote.num}.pdf"`,
    },
  });
}
