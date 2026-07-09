import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MoneyText } from "../../src/components";
import { clientRows } from "../../src/state/mockData";
import { useTheme } from "../../src/theme/ThemeProvider";
import { resolveFontFamily } from "../../src/theme/fontFamily";

/** Clients list tab — mirrors "isClientsList" in extracted/JamQuote.dc.html. */
export default function ClientsListScreen() {
  const { colors, space } = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <View style={{ padding: space.lg, paddingBottom: space.sm }}>
        <View style={{ padding: 12, borderRadius: 10, backgroundColor: colors.surfaceAlt }}>
          <Text style={{ color: colors.textMuted, fontSize: 13.5 }}>Search clients…</Text>
        </View>
      </View>
      <FlatList
        data={clientRows}
        keyExtractor={(item) => item.name}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.sm }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push("/quote-editor")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 13,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
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
              <Text style={{ fontFamily: resolveFontFamily("display", "800"), color: colors.accent, fontSize: 13 }}>
                {item.initials}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: resolveFontFamily("body", "700"), fontSize: 14, color: colors.text }}>
                {item.name}
              </Text>
              <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>
                {item.parish} · {item.phone}
              </Text>
            </View>
            <MoneyText cents={item.totalCents} size={13} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
