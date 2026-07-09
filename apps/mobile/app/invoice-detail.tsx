import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, MoneyText, StatusPill } from "../src/components";
import { resolveFontFamily } from "../src/theme/fontFamily";
import { useTheme } from "../src/theme/ThemeProvider";

const LINE_BREAKDOWN = [
  { label: "Materials", cents: 9600000 },
  { label: "Labour", cents: 5400000 },
  { label: "Equipment & rental", cents: 1800000 },
  { label: "GCT (15%)", cents: 2394000 },
  { label: "Discount (5%)", cents: -840000 },
];

/**
 * Invoice detail — amount due, line breakdown, payment history, and a
 * "Pay by card" CTA that will call the WiPay hosted-checkout endpoint
 * (apps/api's payments module owns the real integration; this is a stub).
 * Mirrors "isInvoiceDetail" in extracted/JamQuote.dc.html.
 */
export default function InvoiceDetailScreen() {
  const { colors, space } = useTheme();
  const router = useRouter();
  const [payingByCard, setPayingByCard] = useState(false);

  const handlePayByCard = async () => {
    setPayingByCard(true);
    // TODO(api): POST /invoices/:id/payments/wipay to create a hosted
    // checkout session, then open the returned URL (expo-web-browser) and
    // handle the signed webhook result. See docs/ARCHITECTURE.md §2 (Payments).
    await new Promise((resolve) => setTimeout(resolve, 600));
    setPayingByCard(false);
    Alert.alert("Pay by card", "WiPay hosted checkout isn't wired up in this preview yet.");
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={{ fontSize: 20, color: colors.text }}>{"‹"}</Text>
          </Pressable>
          <View>
            <Text style={{ fontFamily: resolveFontFamily("display", "800"), fontSize: 16, color: colors.text }}>
              INV-0098
            </Text>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>Basil Reid</Text>
          </View>
        </View>
        <StatusPill label="Overdue" kind="critSolid" />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, gap: 18, paddingBottom: 24 }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            padding: 16,
            gap: 6,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Amount due</Text>
            <MoneyText cents={18354080} size={18} color={colors.crit} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>Due date</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>Jun 30, 2026 (9 days overdue)</Text>
          </View>
        </View>

        <View>
          <Text style={{ fontFamily: resolveFontFamily("body", "700"), fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Line items
          </Text>
          <View style={{ gap: 6 }}>
            {LINE_BREAKDOWN.map((row) => (
              <View key={row.label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 12.5, color: colors.textMuted }}>{row.label}</Text>
                <MoneyText cents={row.cents} size={12.5} weight="700" />
              </View>
            ))}
          </View>
        </View>

        <View>
          <Text style={{ fontFamily: resolveFontFamily("body", "700"), fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Payment history
          </Text>
          <View style={{ padding: 12, borderRadius: 10, backgroundColor: colors.surfaceAlt }}>
            <Text style={{ fontSize: 12.5, color: colors.textMuted }}>No payments recorded yet.</Text>
          </View>
        </View>
      </ScrollView>

      <View
        style={{
          padding: space.lg,
          paddingTop: 14,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          gap: 10,
        }}
      >
        <Button title={payingByCard ? "Contacting WiPay…" : "Pay by card"} fullWidth disabled={payingByCard} onPress={handlePayByCard} />
        <Button title="Record manual payment" variant="secondary" fullWidth onPress={() => Alert.alert("Record payment", "Not built in this preview — see quote-editor/add-material for the fully wired flows.")} />
      </View>
    </SafeAreaView>
  );
}
