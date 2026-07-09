import { GctTreatment, RateUnit } from "@jamquote/core";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, MoneyText, StatusPill } from "../src/components";
import { useQuoteDraft } from "../src/state/QuoteDraftContext";
import { categoryColor, categoryLabel, CATEGORY_ORDER } from "../src/state/categoryMeta";
import type { DraftLineItem } from "../src/state/mockData";
import { rateUnitLabel } from "../src/state/mockData";
import { resolveFontFamily } from "../src/theme/fontFamily";
import { useTheme } from "../src/theme/ThemeProvider";

const rateUnitQtyWord: Record<RateUnit, string> = {
  HOUR: "hrs",
  DAY: "days",
  WEEK: "wks",
  MONTH: "mos",
  JOB: "jobs",
  UNIT: "units",
};

/**
 * Quote editor ★ — sectioned line items (Materials / Labour / Equipment &
 * rental / …) with live totals computed by @jamquote/core.computeTotals.
 * Mirrors "isQuoteEditor" in extracted/JamQuote.dc.html.
 */
export default function QuoteEditorScreen() {
  const { colors, space } = useTheme();
  const router = useRouter();
  const { lines, addLine, totals } = useQuoteDraft();
  const [showTotals, setShowTotals] = useState(false);

  const sections = useMemo(() => {
    return CATEGORY_ORDER.map((category) => {
      const categoryLines = lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => line.category === category);
      const sectionTotalCents = categoryLines.reduce(
        (sum, { index }) => sum + (totals.lineTotals[index]?.afterMarkupCents ?? 0),
        0,
      );
      return { category, lines: categoryLines, sectionTotalCents };
    }).filter((s) => s.lines.length > 0 || s.category === "MATERIAL" || s.category === "LABOUR" || s.category === "EQUIPMENT");
  }, [lines, totals]);

  const quickAddLabour = () => {
    const id = `labour-${Date.now()}`;
    addLine({
      id,
      category: "LABOUR",
      description: "Helper / labourer",
      quantity: 2,
      rateUnit: "DAY",
      unitPriceCents: 280000,
      priceSource: "MANUAL",
      gctTreatment: "STANDARD",
    } as DraftLineItem);
  };

  const quickAddEquipment = () => {
    const id = `equip-${Date.now()}`;
    addLine({
      id,
      category: "EQUIPMENT",
      description: "Scaffolding, per bay",
      quantity: 1,
      rateUnit: "WEEK",
      unitPriceCents: 180000,
      priceSource: "MANUAL",
      gctTreatment: "STANDARD",
    } as DraftLineItem);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <View
        style={{
          padding: space.lg,
          paddingBottom: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 20, color: colors.text }}>{"‹"}</Text>
        </Pressable>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontFamily: resolveFontFamily("display", "800"), fontSize: 17, color: colors.text }}>
              QT-0142
            </Text>
            <StatusPill label="Draft" kind="neutral" />
          </View>
          <Text style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 2 }}>
            Basil Reid · Spanish Town, St. Catherine
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 6, gap: 18 }}>
        {sections.map(({ category, lines: sectionLines, sectionTotalCents }) => (
          <View key={category}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text
                style={{
                  fontFamily: resolveFontFamily("body", "800"),
                  fontSize: 12,
                  letterSpacing: 0.4,
                  color: categoryColor(category, colors),
                  textTransform: "uppercase",
                }}
              >
                {categoryLabel[category]}
              </Text>
              <MoneyText cents={sectionTotalCents} size={13} weight="700" color={colors.textMuted} />
            </View>

            <View style={{ gap: 8 }}>
              {sectionLines.map(({ line, index }) => (
                <View
                  key={line.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 13,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 11,
                    backgroundColor: colors.surface,
                  }}
                >
                  <View style={{ width: 6, alignSelf: "stretch", borderRadius: 3, backgroundColor: categoryColor(category, colors) }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: resolveFontFamily("body", "700"), fontSize: 14, color: colors.text }}>
                      {line.description}
                    </Text>
                    <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>
                      {line.quantity} {rateUnitQtyWord[line.rateUnit]} × {formatUnitPrice(line.unitPriceCents, line.rateUnit)}
                      {line.gctTreatment !== GctTreatment.STANDARD ? ` · ${gctLabel(line.gctTreatment)}` : ""}
                    </Text>
                  </View>
                  <MoneyText cents={totals.lineTotals[index]?.afterMarkupCents ?? 0} size={14.5} />
                </View>
              ))}
            </View>

            <Button
              title={`+ Add ${categoryLabel[category].toLowerCase()}`}
              variant="dashed"
              fullWidth
              style={{ marginTop: 8 }}
              onPress={() => {
                if (category === "MATERIAL") router.push("/add-material");
                else if (category === "LABOUR") quickAddLabour();
                else if (category === "EQUIPMENT") quickAddEquipment();
                else Alert.alert("Coming soon", "This category isn't wired up in the preview yet.");
              }}
            />
          </View>
        ))}

        {showTotals ? (
          <View style={{ gap: 6, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
            <TotalsRow label="Subtotal" cents={totals.subtotalCents} colors={colors} />
            <TotalsRow label="Discount (5%)" cents={-totals.discountCents} colors={colors} />
            <TotalsRow label="GCT (15%)" cents={totals.gctCents} colors={colors} />
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
            <TotalsRow label="Total" cents={totals.totalCents} colors={colors} bold />
            <TotalsRow label="Balance due" cents={totals.balanceDueCents} colors={colors} />
          </View>
        ) : null}
      </ScrollView>

      <View
        style={{
          padding: space.lg,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          gap: 10,
        }}
      >
        <Button
          title="Scan material to add a line"
          variant="secondary"
          fullWidth
          onPress={() =>
            Alert.alert("Scan material", "Camera scan-to-price isn't wired up in this preview — use manual add instead.")
          }
        />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 12, color: colors.textMuted }}>Subtotal</Text>
          <MoneyText cents={totals.subtotalCents} size={17} />
        </View>
        <Button title={showTotals ? "Hide totals & terms" : "Review Totals & Terms"} fullWidth onPress={() => setShowTotals((v) => !v)} />
      </View>
    </SafeAreaView>
  );
}

function TotalsRow({
  label,
  cents,
  colors,
  bold,
}: {
  label: string;
  cents: number;
  colors: ReturnType<typeof useTheme>["colors"];
  bold?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ fontSize: bold ? 14 : 12.5, color: bold ? colors.text : colors.textMuted, fontWeight: bold ? "700" : "400" }}>
        {label}
      </Text>
      <MoneyText cents={cents} size={bold ? 16 : 13} weight={bold ? "800" : "700"} />
    </View>
  );
}

function formatUnitPrice(cents: number, rateUnit: RateUnit): string {
  const dollars = (cents / 100).toLocaleString("en-JM", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$${dollars}${rateUnitLabel[rateUnit]}`;
}

function gctLabel(treatment: GctTreatment): string {
  return treatment === GctTreatment.ZERO_RATED ? "Zero-rated" : "Exempt";
}
