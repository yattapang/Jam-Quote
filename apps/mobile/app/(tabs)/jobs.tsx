import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MoneyText, StatusPill } from "../../src/components";
import { jobRows, type JobRow } from "../../src/state/mockData";
import { deleteJob, fetchJobRows } from "../../src/state/apiClient";
import { useTheme } from "../../src/theme/ThemeProvider";
import { resolveFontFamily } from "../../src/theme/fontFamily";

/** Jobs list tab with progress bars — mirrors "isJobsList" in
 * extracted/JamQuote.dc.html. */
export default function JobsListScreen() {
  const { colors, space } = useTheme();
  const router = useRouter();
  const [rows, setRows] = useState<JobRow[]>(jobRows);
  useEffect(() => {
    fetchJobRows().then(setRows).catch(() => {});
  }, []);

  const handleDelete = (item: JobRow) => {
    Alert.alert(`Delete ${item.name}?`, "This permanently removes the job. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteJob(item.id);
            setRows((prev) => prev.filter((r) => r.id !== item.id));
          } catch (err) {
            Alert.alert("Couldn't delete job", err instanceof Error ? err.message : "Please try again.");
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: space.lg, gap: space.sm }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push("/quote-editor")}
            onLongPress={() => handleDelete(item)}
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
                <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>
                  {item.clientName} · {item.address}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <StatusPill label={item.stage} kind={item.kind} />
                <MoneyText cents={item.valueCents} size={13} />
              </View>
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
