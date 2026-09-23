import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, MoneyText, SignInPrompt, StatusPill } from "../../src/components";
import { quoteFilterNames, type QuoteListRow } from "../../src/state/mockData";
import { ApiAuthError, deleteQuote, fetchQuoteRows } from "../../src/state/apiClient";
import { useAuth } from "../../src/state/AuthContext";
import { useTheme } from "../../src/theme/ThemeProvider";
import { resolveFontFamily } from "../../src/theme/fontFamily";

/** Quotes list tab with status filter chips — mirrors "isQuotesList" in
 * extracted/JamQuote.dc.html. */
export default function QuotesListScreen() {
  const { colors, space } = useTheme();
  const router = useRouter();
  const { isAuthenticated, initializing } = useAuth();
  const [filter, setFilter] = useState<(typeof quoteFilterNames)[number]>("All");
  // Every tenant route requires auth now — no rows (fixture or otherwise)
  // until we know who's signed in. Fixtures only ever come back from
  // fetchQuoteRows() itself, as a network-failure fallback.
  const [allRows, setAllRows] = useState<QuoteListRow[]>([]);
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchQuoteRows()
      .then(setAllRows)
      .catch((err) => {
        // ApiAuthError: the central handler (AuthContext) already cleared the
        // session and is routing to /login — leave rows empty, never fixtures.
        if (!(err instanceof ApiAuthError)) throw err;
      });
  }, [isAuthenticated]);

  const rows = useMemo(
    () => (filter === "All" ? allRows : allRows.filter((q) => q.status === filter)),
    [filter, allRows],
  );

  if (!initializing && !isAuthenticated) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
        <SignInPrompt label="quotes" />
      </SafeAreaView>
    );
  }

  const handleDelete = (item: QuoteListRow) => {
    Alert.alert(`Delete ${item.num}?`, "This permanently removes the quote. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteQuote(item.id);
            setAllRows((prev) => prev.filter((r) => r.id !== item.id));
          } catch (err) {
            Alert.alert("Couldn't delete quote", err instanceof Error ? err.message : "Please try again.");
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm }}
      >
        {quoteFilterNames.map((name) => (
          <Button key={name} title={name} variant="chip" active={filter === name} onPress={() => setFilter(name)} />
        ))}
      </ScrollView>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: space.lg, paddingTop: space.xs, gap: space.sm }}
        renderItem={({ item }) => (
          <QuoteRow row={item} onPress={() => router.push("/quote-editor")} onLongPress={() => handleDelete(item)} />
        )}
      />

      <Pressable
        onPress={() => router.push("/quote-editor")}
        style={{
          position: "absolute",
          right: space.lg,
          bottom: space.lg,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.accent,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }}
      >
        <Text style={{ color: colors.onAccent, fontSize: 26, fontWeight: "700" }}>+</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function QuoteRow({
  row,
  onPress,
  onLongPress,
}: {
  row: QuoteListRow;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 13,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: resolveFontFamily("body", "700"), fontSize: 14, color: colors.text }}>
          {row.num} · {row.client}
        </Text>
        <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>{row.job}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <MoneyText cents={row.amountCents} size={14.5} />
        <View style={{ marginTop: 4 }}>
          <StatusPill label={row.status} kind={row.kind} />
        </View>
      </View>
    </Pressable>
  );
}
