import { formatJmd } from "@jamquote/core";
import React from "react";
import { Text, TextStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { FontWeightToken, resolveFontFamily } from "../theme/fontFamily";

export interface MoneyTextProps {
  cents: number;
  size?: number;
  weight?: FontWeightToken;
  color?: string;
  style?: TextStyle;
}

/**
 * The one place mobile screens render JMD amounts. Always routes through
 * @jamquote/core's formatJmd — never hand-format money. See docs/ARCHITECTURE.md §3.
 */
export function MoneyText({ cents, size = 15, weight = "800", color, style }: MoneyTextProps) {
  const { colors } = useTheme();
  return (
    <Text
      style={[
        {
          fontFamily: resolveFontFamily("display", weight),
          fontSize: size,
          color: color ?? colors.text,
        },
        style,
      ]}
    >
      {formatJmd(cents)}
    </Text>
  );
}
