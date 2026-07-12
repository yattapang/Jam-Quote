import type { ComponentType, PropsWithChildren } from "react";
import {
  Document as RpDocument,
  Page as RpPage,
  View as RpView,
  Text as RpText,
  StyleSheet,
  type DocumentProps,
  type PageProps,
  type ViewProps,
  type TextProps,
} from "@react-pdf/renderer";
import { formatJmd } from "@jamquote/core";
import type { Business, Client, Quote } from "@/lib/types";
import { getQuoteTotals, groupLinesByHeading, RATE_UNIT_LABEL, GCT_TREATMENT_LABEL } from "@/lib/quote-totals";

/**
 * Server-rendered branded quote PDF. Built-in Helvetica only (no custom/remote
 * font registration — that's the #1 @react-pdf/renderer failure mode). Colors
 * are the light-theme palette from packages/ui/src/tokens.ts, inlined as hex
 * since react-pdf styles can't read CSS variables.
 *
 * @react-pdf/renderer's own .d.ts types its components against whatever
 * @types/react is hoisted to the monorepo root (currently 19.x, pulled in by
 * apps/mobile), while this app compiles JSX against its own nested React 18
 * types — so TS sees two incompatible `Component` shapes ("property 'refs'
 * missing") even though it's the same component at runtime. Re-typing these
 * as plain function components against this file's own React types sidesteps
 * the cross-package mismatch without touching root dependency versions.
 */
const Document = RpDocument as unknown as ComponentType<PropsWithChildren<DocumentProps>>;
const Page = RpPage as unknown as ComponentType<PropsWithChildren<PageProps>>;
const View = RpView as unknown as ComponentType<PropsWithChildren<ViewProps>>;
const Text = RpText as unknown as ComponentType<PropsWithChildren<TextProps>>;
const COLOR = {
  text: "#26221C",
  textMuted: "#6B6357",
  border: "#DDD5C4",
  surfaceAlt: "#EFEAE0",
  accent: "#9C6E1B",
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    color: COLOR.text,
    fontFamily: "Helvetica",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  businessName: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  muted: {
    color: COLOR.textMuted,
    fontSize: 9.5,
  },
  quoteNum: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    marginBottom: 4,
  },
  statusPill: {
    fontSize: 9,
    color: COLOR.accent,
    textAlign: "right",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  billTo: {
    marginBottom: 20,
    padding: 10,
    backgroundColor: COLOR.surfaceAlt,
    borderRadius: 4,
  },
  sectionLabel: {
    fontSize: 8.5,
    color: COLOR.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  billToName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
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
  row: {
    flexDirection: "row",
    borderBottom: `0.5px solid ${COLOR.border}`,
    paddingVertical: 4,
  },
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
  totals: {
    marginTop: 18,
    alignSelf: "flex-end",
    width: 240,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalRowMuted: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
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
  divider: {
    borderTop: `1px solid ${COLOR.border}`,
    marginTop: 8,
    marginBottom: 4,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTop: `1px solid ${COLOR.border}`,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8.5,
    color: COLOR.textMuted,
  },
});

interface QuotePdfProps {
  quote: Quote;
  client?: Client;
  business: Business;
}

export default function QuotePdf({ quote, client, business }: QuotePdfProps) {
  const totals = getQuoteTotals(quote);
  const groups = groupLinesByHeading(quote);

  const amountByLineId = new Map<string, number>();
  quote.lines.forEach((l, i) => {
    amountByLineId.set(l.id, totals.lineTotals[i]?.afterMarkupCents ?? 0);
  });

  return (
    <Document title={`Quote ${quote.num}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.businessName}>{business.name}</Text>
            <Text style={styles.muted}>TRN {business.trn || "—"}</Text>
            <Text style={styles.muted}>
              {business.addressLine ? `${business.addressLine}, ` : ""}
              {business.parish}
            </Text>
          </View>
          <View>
            <Text style={styles.quoteNum}>{quote.num}</Text>
            <Text style={styles.statusPill}>{quote.status}</Text>
            {quote.createdLabel ? <Text style={styles.muted}>{quote.createdLabel}</Text> : null}
            {quote.validUntilLabel ? <Text style={styles.muted}>{quote.validUntilLabel}</Text> : null}
          </View>
        </View>

        <View style={styles.billTo}>
          <Text style={styles.sectionLabel}>Bill to</Text>
          <Text style={styles.billToName}>{client?.name ?? "Unknown client"}</Text>
          {client?.address ? <Text style={styles.muted}>{client.address}</Text> : null}
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
              <View key={line.id} style={styles.row}>
                <Text style={[styles.colDesc, styles.cell]}>{line.description}</Text>
                <Text style={[styles.colQty, styles.cellMuted]}>
                  {line.quantity} {RATE_UNIT_LABEL[line.rateUnit]}
                </Text>
                <Text style={[styles.colGct, styles.cellMuted]}>
                  {GCT_TREATMENT_LABEL[line.gctTreatment]}
                </Text>
                <Text style={[styles.colAmt, styles.cell]}>
                  {formatJmd(amountByLineId.get(line.id) ?? 0)}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.totals} wrap={false}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatJmd(totals.subtotalCents)}</Text>
          </View>
          {totals.discountCents > 0 && (
            <View style={styles.totalRowMuted}>
              <Text style={styles.totalLabelMuted}>Discount ({quote.discountPct}%)</Text>
              <Text style={styles.totalValueMuted}>-{formatJmd(totals.discountCents)}</Text>
            </View>
          )}
          <View style={styles.totalRowMuted}>
            <Text style={styles.totalLabelMuted}>GCT ({quote.gctRatePct}% on standard)</Text>
            <Text style={styles.totalValueMuted}>{formatJmd(totals.gctCents)}</Text>
          </View>
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>{formatJmd(totals.totalCents)}</Text>
          </View>
          {totals.depositCents > 0 && (
            <>
              <View style={styles.divider} />
              <View style={styles.totalRowMuted}>
                <Text style={styles.totalLabelMuted}>Deposit requested</Text>
                <Text style={styles.totalValueMuted}>{formatJmd(totals.depositCents)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Balance due</Text>
                <Text style={styles.totalValue}>{formatJmd(totals.balanceDueCents)}</Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>TRN {business.trn || "—"}</Text>
          {quote.validUntilLabel ? (
            <Text style={styles.footerText}>Prices {quote.validUntilLabel.toLowerCase()}</Text>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}
