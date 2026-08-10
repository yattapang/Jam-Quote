import { renderToBuffer } from "@react-pdf/renderer";
import { getQuote, getClients, getBusiness, getLogoBytes } from "@/lib/api-server";
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

  // getLogoBytes resolves null rather than throwing, so a missing or
  // unreachable logo degrades to the text header instead of failing the quote.
  const [clients, business, logo] = await Promise.all([getClients(), getBusiness(), getLogoBytes()]);
  const client = clients.find((c) => c.id === quote.clientId);

  const buffer = await renderToBuffer(QuotePdf({ quote, client, business, logo: logo ?? undefined }));

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Quote-${quote.num}.pdf"`,
    },
  });
}
