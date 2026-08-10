import { renderToBuffer } from "@react-pdf/renderer";
import { getInvoice, getClients, getBusiness, getLogoBytes } from "@/lib/api-server";
import InvoicePdf from "@/lib/pdf/InvoicePdf";

// @react-pdf/renderer needs Node's Buffer/streams — not available on the edge
// runtime. Mirrors the quote PDF route.
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const invoice = await getInvoice(params.id);
  if (!invoice) {
    return new Response("Invoice not found", { status: 404 });
  }

  // getLogoBytes resolves null rather than throwing, so a missing or
  // unreachable logo degrades to the text header instead of failing the
  // download.
  const [clients, business, logo] = await Promise.all([getClients(), getBusiness(), getLogoBytes()]);
  const client = clients.find((c) => c.id === invoice.clientId);

  const buffer = await renderToBuffer(
    InvoicePdf({ invoice, client, business, logo: logo ?? undefined }),
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Invoice-${invoice.num}.pdf"`,
    },
  });
}
