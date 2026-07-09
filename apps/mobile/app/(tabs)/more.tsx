import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { rateBookRows } from "../../src/state/mockData";
import { useTheme, type ThemePreference } from "../../src/theme/ThemeProvider";
import { resolveFontFamily } from "../../src/theme/fontFamily";

interface MenuItem {
  label: string;
  sub: string;
  route?: "/invoice-detail";
}

const MENU_ITEMS: MenuItem[] = [
  { label: "Invoices", sub: "5 invoices · 1 overdue", route: "/invoice-detail" },
  { label: "Labour rate book", sub: `${rateBookRows.length} labour types` },
  { label: "Material favourites", sub: "Quick-add pricing" },
  { label: "Equipment / rental catalog", sub: "4 suppliers" },
  { label: "Supplier directory", sub: "Live + cached prices" },
  { label: "Regulatory feed", sub: "GCT threshold update · Aug 1" },
  { label: "Reports", sub: "Revenue, win rate" },
  { label: "Business profile & settings", sub: "TRN, parish, connections" },
];

/** More tab — settings-style menu, plus the light/dark theme override used
 * for verifying both palettes on-device. */
export default function MoreScreen() {
  const { colors, space, preference, setPreference } = useTheme();
  const router = useRouter();

  const options: { key: ThemePreference; label: string }[] = [
    { key: "system", label: "System" },
    { key: "light", label: "Light" },
    { key: "dark", label: "Dark" },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xl }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontFamily: resolveFontFamily("display", "800"), color: colors.accent, fontSize: 18 }}>
            OB
          </Text>
        </View>
        <View>
          <Text style={{ fontFamily: resolveFontFamily("display", "800"), fontSize: 18, color: colors.text }}>
            Owen Blackwood
          </Text>
          <Text style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 2 }}>
            Blackwood Construction · TRN 123-456-789
          </Text>
        </View>

        <View>
          <Text
            style={{
              fontSize: 11.5,
              fontWeight: "700",
              color: colors.textMuted,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Appearance
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {options.map((opt) => {
              const active = preference === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setPreference(opt.key)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 9,
                    alignItems: "center",
                    backgroundColor: active ? colors.accent : colors.surfaceAlt,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: resolveFontFamily("body", "700"),
                      fontSize: 12.5,
                      color: active ? colors.onAccent : colors.text,
                    }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          {MENU_ITEMS.map((item) => (
            <Pressable
              key={item.label}
              onPress={() => item.route && router.push(item.route)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <View>
                <Text style={{ fontFamily: resolveFontFamily("body", "700"), fontSize: 14, color: colors.text }}>
                  {item.label}
                </Text>
                <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>{item.sub}</Text>
              </View>
              <Text style={{ color: colors.textMuted, fontWeight: "700" }}>{"›"}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
