import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, MoneyText, StatusPill } from "../../src/components";
import { dashboardStats, quoteListRows } from "../../src/state/mockData";
import { useTheme } from "../../src/theme/ThemeProvider";
import { resolveFontFamily } from "../../src/theme/fontFamily";

/** Dashboard / Home tab — pipeline snapshot, follow-ups due, recent quotes.
 * Mirrors the "isDashboard" block in extracted/JamQuote.dc.html. */
export default function DashboardScreen() {
  const { colors, space } = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl, gap: space.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={{ fontFamily: resolveFontFamily("body", "500"), fontSize: 12.5, color: colors.textMuted }}>
              Good morning
            </Text>
            <Text style={{ fontFamily: resolveFontFamily("display", "800"), fontSize: 19, color: colors.text }}>
              Owen Blackwood
            </Text>
          </View>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: resolveFontFamily("display", "800"), color: colors.accent, fontSize: 14 }}>
              OB
            </Text>
          </View>
        </View>

        <Pressable
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            padding: 12,
            borderRadius: 11,
            backgroundColor: colors.warnSoft,
          }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warn }} />
          <Text style={{ flex: 1, fontFamily: resolveFontFamily("body", "600"), fontSize: 12.5, color: colors.text }}>
            GCT threshold update takes effect Aug 1 — review pricing
          </Text>
          <Text style={{ color: colors.warn, fontWeight: "700" }}>{"›"}</Text>
        </Pressable>

        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <StatTile label="Pipeline value" cents={dashboardStats.pipelineValueCents} />
            <StatTile label="Win rate (90d)" text={`${dashboardStats.winRatePct90d}%`} color={colors.good} />
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <StatTile label="Overdue inv." cents={dashboardStats.overdueInvoicesCents} color={colors.crit} />
            <StatTile label="Quotes this month" text={`${dashboardStats.quotesThisMonth}`} />
          </View>
        </View>

        <View>
          <SectionHeader title="Follow-ups due" trailing="2" />
          <View style={{ gap: space.sm }}>
            <Pressable
              onPress={() => router.push("/quote-editor")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                padding: 12,
                borderRadius: 11,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: resolveFontFamily("body", "700"), fontSize: 13.5, color: colors.text }}>
                  Devon Facey — Fence & gate
                </Text>
                <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>
                  Sent 6 days ago · no reply
                </Text>
              </View>
              <StatusPill label="Sent" kind="info" />
            </Pressable>
            <Pressable
              onPress={() => router.push("/quote-editor")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                padding: 12,
                borderRadius: 11,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: resolveFontFamily("body", "700"), fontSize: 13.5, color: colors.text }}>
                  Marva Grant — Kitchen tiling
                </Text>
                <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>
                  Viewed yesterday · follow up
                </Text>
              </View>
              <StatusPill label="Viewed" kind="infoSolid" />
            </Pressable>
          </View>
        </View>

        <View>
          <SectionHeader title="Recent quotes" trailing="See all" onTrailingPress={() => router.push("/quotes")} />
          <View style={{ gap: space.sm }}>
            {quoteListRows.slice(0, 3).map((q) => (
              <Pressable
                key={q.num}
                onPress={() => router.push("/quote-editor")}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  padding: 12,
                  borderRadius: 11,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: resolveFontFamily("body", "700"), fontSize: 13.5, color: colors.text }}>
                    {q.num} · {q.client}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>{q.job}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <MoneyText cents={q.amountCents} size={14} />
                  <View style={{ marginTop: 4 }}>
                    <StatusPill label={q.status} kind={q.kind} />
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({
  label,
  cents,
  text,
  color,
}: {
  label: string;
  cents?: number;
  text?: string;
  color?: string;
}) {
  const { colors } = useTheme();
  return (
    <Card style={{ flex: 1, flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
      <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: resolveFontFamily("body", "600") }}>
        {label}
      </Text>
      {cents !== undefined ? (
        <MoneyText cents={cents} size={18} color={color} />
      ) : (
        <Text style={{ fontFamily: resolveFontFamily("display", "800"), fontSize: 18, color: color ?? colors.text }}>
          {text}
        </Text>
      )}
    </Card>
  );
}

function SectionHeader({
  title,
  trailing,
  onTrailingPress,
}: {
  title: string;
  trailing?: string;
  onTrailingPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
      }}
    >
      <Text style={{ fontFamily: resolveFontFamily("body", "700"), fontSize: 14.5, color: colors.text }}>
        {title}
      </Text>
      {trailing ? (
        <Pressable onPress={onTrailingPress}>
          <Text style={{ fontSize: 12, color: colors.accent, fontFamily: resolveFontFamily("body", "700") }}>
            {trailing}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
