import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusPill } from "../../src/components";
import { jobRows } from "../../src/state/mockData";
import { useTheme } from "../../src/theme/ThemeProvider";
import { resolveFontFamily } from "../../src/theme/fontFamily";

/** Jobs list tab with progress bars — mirrors "isJobsList" in
 * extracted/JamQuote.dc.html. */
export default function JobsListScreen() {
  const { colors, space } = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <FlatList
        data={jobRows}
        keyExtractor={(item) => item.name}
        contentContainerStyle={{ padding: space.lg, gap: space.sm }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push("/quote-editor")}
            style={{
              gap: 8,
              padding: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontFamily: resolveFontFamily("body", "700"), fontSize: 14.5, color: colors.text }}>
                  {item.name}
                </Text>
                <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>{item.address}</Text>
              </View>
              <StatusPill label={item.stage} kind={item.kind} />
            </View>
            <View style={{ height: 6, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: "hidden" }}>
              <View style={{ height: "100%", width: `${item.pct}%`, backgroundColor: colors.accent, borderRadius: 4 }} />
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
