import { Tabs } from "expo-router";
import React from "react";
import { View } from "react-native";
import { useTheme } from "../../src/theme/ThemeProvider";
import { resolveFontFamily } from "../../src/theme/fontFamily";

/** Bottom tab bar: Home / Quotes / Clients / Jobs / More — matches the phone
 * screens' tab bar in extracted/JamQuote.dc.html (tabDefs), including the
 * alternating circle/squircle dot per tab. */
const TAB_SHAPES: Record<string, "circle" | "square"> = {
  index: "circle",
  quotes: "square",
  clients: "circle",
  jobs: "square",
  more: "circle",
};

function TabDot({ routeName, color }: { routeName: string; color: string }) {
  const shape = TAB_SHAPES[routeName] ?? "circle";
  return (
    <View
      style={{
        width: 7,
        height: 7,
        borderRadius: shape === "circle" ? 4 : 2,
        backgroundColor: color,
        marginBottom: 3,
      }}
    />
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 62,
          paddingTop: 8,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontFamily: resolveFontFamily("body", "600"),
          fontSize: 11,
        },
        tabBarIcon: ({ color }) => <TabDot routeName={route.name} color={color} />,
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="quotes" options={{ title: "Quotes" }} />
      <Tabs.Screen name="clients" options={{ title: "Clients" }} />
      <Tabs.Screen name="jobs" options={{ title: "Jobs" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
    </Tabs>
  );
}
