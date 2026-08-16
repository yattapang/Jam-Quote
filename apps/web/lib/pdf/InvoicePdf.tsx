import type { ComponentType, PropsWithChildren } from "react";
import {
  Document as RpDocument,
  Page as RpPage,
  View as RpView,
  Text as RpText,
  Image as RpImage,
  StyleSheet,
  type DocumentProps,
  type PageProps,
  type ViewProps,
  type TextProps,
  type ImageProps,
} from "@react-pdf/renderer";
import { computeTotals, formatJmd, QuoteDetailLevel } from "@jamquote/core";
import type { Business, Client } from "@/lib/types";
import type { Invoice } from "@/lib/api-client";
import {
  groupLinesByHeading,
  invoiceBalanceCents,
  lineUnitLabel,
  GCT_TREATMENT_LABEL,
} from "@/lib/quote-totals";
import { formatAddress } from "@/lib/format-address";

/**
 * Server-rendered invoice PDF (#27).
 *
 * Shares QuotePdf's layout and palette on purpose — a contractor's quote and
 * their invoice should look like they came from the same business. What
 * differs is what an invoice has to say and a quote does not: a due date, what
 * has already been paid, and the balance still owing. Those are the numbers a
 * customer looks for, so they get the emphasis at the bottom.
 *
 * The @react-pdf/renderer component re-typing below is the same workaround
 * QuotePdf documents: its .d.ts binds to the root-hoisted @types/react 19
 * while this app compiles against its own React 18 types.
 */
const Document = RpDocument as unknown as ComponentType<PropsWithChildren<DocumentProps>>;
const Page = RpPage as unknown as ComponentType<PropsWithChildren<PageProps>>;
const View = RpView as unknown as ComponentType<PropsWithChildren<ViewProps>>;
const Text = RpText as unknown as ComponentType<PropsWithChildren<TextProps>>;
const Image = RpImage as unknown as ComponentType<ImageProps>;

const COLOR = {
  text: "#26221C",
  textMuted: "#6B6357",
  border: "#DDD5C4",
  surfaceAlt: "#EFEAE0",
  accent: "#9C6E1B",
  due: "#8C2F1E",
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: COLOR.text, fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 22 },
  logo: { maxWidth: 180, maxHeight: 56, marginBottom: 6, objectFit: "contain" },
  businessName: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  muted: { color: COLOR.textMuted, fontSize: 9.5 },
  docNum: { fontSize: 16, fontFamily: "Helvetica-Bold", textAlign: "right", marginBottom: 4 },
  statusPill: {
    fontSize: 9,
    color: COLOR.accent,
    textAlign: "right",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  billTo: { marginBottom: 20, padding: 10, backgroundColor: COLOR.surfaceAlt, borderRadius: 4 },
  sectionLabel: {
    fontSize: 8.5,
    color: COLOR.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  billToName: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  groupHead: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    color: COLOR.accent,
    marginTop: 14,
    marginBottom: 4,
    borderBottom: `1px solid ${COLOR.border}`,
    paddingBottom: 3,
  },
  tableHeadRow: {
    flexDirection: "row",
    borderBottom: `1px solid ${COLOR.border}`,
    paddingBottom: 3,
    marginBottom: 2,
  },
  row: { flexDirection: "row", borderBottom: `0.5px solid ${COLOR.border}`, paddingVertical: 4 },
  colDesc: { width: "46%" },
  colQty: { width: "18%" },
  colGct: { width: "18%" },
  colAmt: { width: "18%", textAlign: "right" },
  headCell: {
    fontSize: 8.5,
    color: COLOR.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  cell: { fontSize: 9.5 },
  cellMuted: { fontSize: 9, color: COLOR.textMuted },
  breakdown: {
    marginLeft: 12,
    marginTop: 2,
    marginBottom: 4,
    paddingLeft: 8,
    borderLeft: `1px solid ${COLOR.border}`,
  },
  breakdownHead: {
    fontSize: 7.5,
    color: COLOR.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1 },
  breakdownDesc: { fontSize: 8.5, color: COLOR.textMuted, width: "55%" },
  breakdownAmt: { fontSize: 8.5, color: COLOR.textMuted, width: "45%", textAlign: "right" },
  totals: { marginTop: 18, alignSelf: "flex-end", width: 240 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalLabel: { fontSize: 9.5 },
  totalLabelMuted: { fontSize: 9.5, color: COLOR.textMuted },
  totalValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  totalValueMuted: { fontSize: 9.5, color: COLOR.textMuted },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: `1px solid ${COLOR.border}`,
    marginTop: 4,
    paddingTop: 6,
  },
  grandLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  grandValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: COLOR.accent },
  /** Balance owing gets the strongest treatment on the page — it is the one
   * number the customer is looking for. */
  dueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: `1px solid ${COLOR.border}`,
    marginTop: 6,
    paddingTop: 7,
  },
  dueLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  dueValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: COLOR.due },
  paidValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: COLOR.accent },
  terms: { marginTop: 22, paddingTop: 8, borderTop: `1px solid ${COLOR.border}` },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTop: `1px solid ${COLOR.border}`,
    paddingTop: 8,
  },
  footerText: { fontSize: 8.5, color: COLOR.textMuted },
});

interface InvoicePdfProps {
  invoice: Invoice;
  client?: Client;
  business: Business;
  /** Omitted -> the header falls back to the business name as text. */
  logo?: { data: Buffer; contentType: string };
}

export default function InvoicePdf({ invoice, client, business, logo }: InvoicePdfProps) {
  // Recomputed from the lines rather than trusting the invoice's stored
  // subtotal/gct/total columns: this document is what the customer is asked to
  // pay against, so the arithmetic on it must be derivable from the lines
  // printed above it. Same computeTotals the API and the editor use.
  const totals = computeTotals({
    lines: invoice.lines.map((l) => ({
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      markupPct: l.markupPct,
      gctTreatment: l.gctTreatment,
    })),
    gctRatePct: invoice.gctRatePct,
    discountPct: invoice.discountPct,
    depositCents: invoice.depositCents,
  });
  const groups = groupLinesByHeading(invoice);
  const detailed = invoice.detailLevel === QuoteDetailLevel.DETAILED;

  const paidCents = invoice.paidCents ?? 0;
  // Shared with the invoice email (#34) so the figure the covering message
  // asks for is by construction the figure printed below.
  const balanceCents = invoiceBalanceCents(totals.totalCents, paidCents);
  const settled = balanceCents === 0;

  const amountByLineId = new Map<string, number>();
  invoice.lines.forEach((l, i) => {
    amountByLineId.set(l.id, totals.lineTotals[i]?.afterMarkupCents ?? 0);
  });

  return (
    <Document title={`Invoice ${invoice.num}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            {logo ? <Image style={styles.logo} src={logo.data} /> : null}
            <Text style={styles.businessName}>{business.name}</Text>
            <Text style={styles.muted}>TRN {business.trn || "—"}</Text>
            <Text style={styles.muted}>
              {formatAddress([business.addressLine, business.town, business.parish])}
            </Text>
          </View>
          <View>
            <Text style={styles.docNum}>{invoice.num}</Text>
            <Text style={styles.statusPill}>{invoice.status}</Text>
            {invoice.createdLabel ? <Text style={styles.muted}>{invoice.createdLabel}</Text> : null}
            {invoice.dueDateLabel ? <Text style={styles.muted}>{invoice.dueDateLabel}</Text> : null}
          </View>
        </View>

        <View style={styles.billTo}>
          <Text style={styles.sectionLabel}>Bill to</Text>
          <Text style={styles.billToName}>{client?.name ?? "Unknown client"}</Text>
          {formatAddress([client?.address, client?.town, client?.parish]) ? (
            <Text style={styles.muted}>
              {formatAddress([client?.address, client?.town, client?.parish])}
            </Text>
          ) : null}
          {client?.phone ? <Text style={styles.muted}>{client.phone}</Text> : null}
        </View>

        {groups.map((g, gi) => (
          <View key={`${g.title}-${gi}`} wrap={false}>
            <Text style={styles.groupHead}>{g.title}</Text>
            <View style={styles.tableHeadRow}>
              <Text style={[styles.colDesc, styles.headCell]}>Description</Text>
              <Text style={[styles.colQty, styles.headCell]}>Qty</Text>
              <Text style={[styles.colGct, styles.headCell]}>GCT</Text>
              <Text style={[styles.colAmt, styles.headCell]}>Amount</Text>
            </View>
            {g.lines.map((line) => (
              <View key={line.id} wrap={false}>
                <View style={styles.row}>
                  <Text style={[styles.colDesc, styles.cell]}>{line.description}</Text>
                  <Text style={[styles.colQty, styles.cellMuted]}>
                    {line.quantity} {lineUnitLabel(line)}
                  </Text>
                  <Text style={[styles.colGct, styles.cellMuted]}>
                    {GCT_TREATMENT_LABEL[line.gctTreatment]}
                  </Text>
                  <Text style={[styles.colAmt, styles.cell]}>
                    {formatJmd(amountByLineId.get(line.id) ?? 0)}
                  </Text>
                </View>
                {detailed && line.jobComponents?.length ? (
                  <View style={styles.breakdown}>
                    <Text style={styles.breakdownHead}>{line.jobName ?? "Breakdown"}</Text>
                    {line.jobComponents.map((c, ci) => (
                      <View key={`${line.id}-c${ci}`} style={styles.breakdownRow}>
                        <Text style={styles.breakdownDesc}>{c.description}</Text>
                        <Text style={styles.breakdownAmt}>
                          {c.quantityPerUnit} x {formatJmd(c.unitPriceCents)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ))}

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabelMuted}>Subtotal</Text>
            <Text style={styles.totalValueMuted}>{formatJmd(totals.subtotalCents)}</Text>
          </View>
          {totals.discountCents > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabelMuted}>Discount</Text>
              <Text style={styles.totalValueMuted}>-{formatJmd(totals.discountCents)}</Text>
            </View>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabelMuted}>GCT</Text>
            <Text style={styles.totalValueMuted}>{formatJmd(totals.gctCents)}</Text>
          </View>
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>{formatJmd(totals.totalCents)}</Text>
          </View>

          {/* Only shown once something has actually been paid — a "Paid $0.00"
              line on a fresh invoice is noise. */}
          {paidCents > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Paid</Text>
              <Text style={styles.totalValue}>-{formatJmd(paidCents)}</Text>
            </View>
          ) : null}

          <View style={styles.dueRow}>
            <Text style={styles.dueLabel}>{settled ? "Paid in full" : "Amount due"}</Text>
            <Text style={settled ? styles.paidValue : styles.dueValue}>
              {formatJmd(balanceCents)}
            </Text>
          </View>
        </View>

        {invoice.terms ? (
          <View style={styles.terms}>
            <Text style={styles.sectionLabel}>Terms</Text>
            <Text style={styles.muted}>{invoice.terms}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {business.name}
            {business.trn ? ` · TRN ${business.trn}` : ""} · Invoice {invoice.num}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
