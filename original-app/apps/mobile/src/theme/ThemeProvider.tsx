import React, { createContext, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import {
  dark,
  fonts,
  light,
  radius,
  space,
  type ThemeName,
  type ThemeTokens,
} from "@jamquote/ui";

/**
 * Theme preference: "system" follows the OS light/dark setting; "light"/"dark"
 * pin the app regardless of OS. Both palettes are first-class per
 * docs/ARCHITECTURE.md §8 — never hand-pick colors outside this provider.
 */
export type ThemePreference = "system" | ThemeName;

interface ThemeContextValue {
  colors: ThemeTokens;
  scheme: ThemeName;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  fonts: typeof fonts;
  radius: typeof radius;
  space: typeof space;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>("system");

  const scheme: ThemeName =
    preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;
  const colors = scheme === "dark" ? dark : light;

  const value = useMemo<ThemeContextValue>(
    () => ({ colors, scheme, preference, setPreference, fonts, radius, space }),
    [colors, scheme, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
