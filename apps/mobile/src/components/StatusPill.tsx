import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { resolveFontFamily } from "../theme/fontFamily";

/**
 * Mirrors `pillColors()` in extracted/JamQuote.dc.html: soft-tinted pills for
 * most statuses, solid-filled for the "needs attention now" states.
 */
export type StatusKind =
  | "neutral"
  | "info"
  | "infoSolid"
  | "good"
  | "goodSolid"
  | "warn"
  | "crit"
  | "critSolid"
  | "accent";

export function StatusPill({ label, kind = "neutral" }: { label: string; kind?: StatusKind }) {
  const { colors } = useTheme();

  const map: Record<StatusKind, { bg: string; fg: string }> = {
    neutral: { bg: colors.neutralPillSoft, fg: colors.neutralPill },
    info: { bg: colors.infoSoft, fg: colors.info },
    infoSolid: { bg: colors.info, fg: "#fff" },
    good: { bg: colors.goodSoft, fg: colors.good },
    goodSolid: { bg: colors.good, fg: "#fff" },
    warn: { bg: colors.warnSoft, fg: colors.warn },
    crit: { bg: colors.critSoft, fg: colors.crit },
    critSolid: { bg: colors.crit, fg: "#fff" },
    accent: { bg: colors.accent, fg: colors.onAccent },
  };
  const { bg, fg } = map[kind];

  return (
    <View
      style={{
        backgroundColor: bg,
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 100,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: fg, fontFamily: resolveFontFamily("body", "700"), fontSize: 10.5 }}>{label}</Text>
    </View>
  );
}
