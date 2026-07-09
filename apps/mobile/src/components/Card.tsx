import React from "react";
import { Pressable, View, ViewProps, ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

export interface CardProps extends ViewProps {
  onPress?: () => void;
  /** Thin colored bar on the left edge, used for quote line-item category coding. */
  accentBar?: string;
}

/** Bordered surface card matching the design's `border + surface` rows. */
export function Card({ onPress, accentBar, style, children, ...rest }: CardProps) {
  const { colors, radius, space } = useTheme();

  const content = (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.lg,
          padding: space.md,
          gap: space.md,
        } as ViewStyle,
        style,
      ]}
      {...rest}
    >
      {accentBar ? (
        <View style={{ width: 6, alignSelf: "stretch", borderRadius: 3, backgroundColor: accentBar }} />
      ) : null}
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        {content}
      </Pressable>
    );
  }
  return content;
}
