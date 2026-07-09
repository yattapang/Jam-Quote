import React from "react";
import { Pressable, StyleProp, Text, View, ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { resolveFontFamily } from "../theme/fontFamily";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "chip" | "dashed";

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** For "chip"/filter-style buttons: whether this option is currently selected. */
  active?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Reusable action button built from design tokens. See extracted/JamQuote.dc.html pill/CTA buttons. */
export function Button({
  title,
  onPress,
  variant = "primary",
  active = true,
  disabled,
  fullWidth,
  style,
}: ButtonProps) {
  const { colors, radius } = useTheme();

  let backgroundColor = "transparent";
  let color = colors.text;
  let borderColor = "transparent";
  let borderWidth = 0;
  let borderStyle: "solid" | "dashed" = "solid";
  let borderRadius: number = radius.lg;
  let paddingVertical = 15;
  let fontSize = 15;

  if (variant === "primary") {
    backgroundColor = colors.accent;
    color = colors.onAccent;
    borderRadius = 100;
  } else if (variant === "secondary") {
    borderColor = colors.border;
    borderWidth = 1.5;
    color = colors.text;
  } else if (variant === "ghost") {
    color = colors.accent;
  } else if (variant === "dashed") {
    borderColor = colors.border;
    borderWidth = 1.5;
    borderStyle = "dashed";
    color = colors.text;
    paddingVertical = 11;
    fontSize = 13;
    borderRadius = radius.md;
  } else if (variant === "chip") {
    backgroundColor = active ? colors.accent : colors.surfaceAlt;
    color = active ? colors.onAccent : colors.text;
    borderRadius = 100;
    paddingVertical = 9;
    fontSize = 12.5;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          opacity: disabled ? 0.5 : pressed ? 0.82 : 1,
          width: fullWidth ? "100%" : undefined,
        },
        style,
      ]}
    >
      <View
        style={{
          backgroundColor,
          borderColor,
          borderWidth,
          borderStyle,
          borderRadius,
          paddingVertical,
          paddingHorizontal: variant === "chip" || variant === "dashed" ? 14 : 20,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color,
            fontFamily: resolveFontFamily("body", "700"),
            fontSize,
            textAlign: "center",
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>
    </Pressable>
  );
}
