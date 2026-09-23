import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../src/theme/ThemeProvider";
import { resolveFontFamily } from "../src/theme/fontFamily";

/**
 * Generic placeholder for More-menu items whose full screens land in later
 * phases. Works on native AND web (React Native's Alert is a no-op on web, so
 * unwired taps must navigate to a real screen to feel responsive).
 */
export default function FeaturePreviewScreen() {
  const { colors, space } = useTheme();
  const router = useRouter();
  const { title, phase } = useLocalSearchParams<{ title?: string; phase?: string }>();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <View style={{ padding: space.lg, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 20, color: colors.text }}>{"‹"}</Text>
        </Pressable>
        <Text style={{ fontFamily: resolveFontFamily("display", "800"), fontSize: 17, color: colors.text }}>
          {title ?? "Feature"}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: 14 }}>
        <View
          style={{
            padding: 18,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            gap: 8,
          }}
        >
          <Text style={{ fontFamily: resolveFontFamily("display", "800"), fontSize: 18, color: colors.text }}>
            {title ?? "This feature"}
          </Text>
          <Text style={{ fontSize: 13.5, color: colors.textMuted, lineHeight: 20 }}>
            This screen isn&apos;t built yet. Phase 1 is the quote builder — {title ?? "this section"} arrives in{" "}
            {phase ?? "a later phase"}. The data model and backend hooks for it already exist; the UI comes next.
          </Text>
        </View>

        <Pressable
          onPress={() => router.back()}
          style={{ padding: 14, borderRadius: 11, backgroundColor: colors.accent, alignItems: "center" }}
        >
          <Text style={{ fontFamily: resolveFontFamily("body", "700"), color: colors.onAccent, fontSize: 14 }}>
            Back
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
