import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { resolveFontFamily } from "../theme/fontFamily";
import { Button } from "./Button";

/**
 * Empty state for tenant screens (Quotes/Clients/Jobs) when signed out. Every
 * tenant API route now requires a token, so a signed-out user has no business
 * data to show — this replaces what used to be a silent fall-through to demo
 * fixtures, which looked exactly like real data.
 */
export function SignInPrompt({ label }: { label: string }) {
  const { colors, space } = useTheme();
  const router = useRouter();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md }}>
      <Text
        style={{
          fontFamily: resolveFontFamily("display", "800"),
          fontSize: 17,
          color: colors.text,
          textAlign: "center",
        }}
      >
        Sign in to see your {label}
      </Text>
      <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: "center" }}>
        Your quotes, clients and jobs are tied to your business account.
      </Text>
      <Button title="Sign in" onPress={() => router.push("/login")} />
    </View>
  );
}
