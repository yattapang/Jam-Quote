/**
 * Design tokens extracted verbatim from the design source
 * (extracted/JamQuote.dc.html). Web (CSS vars) and mobile (RN theme) both
 * derive from these — do not hand-pick colors in components.
 */

export const fonts = {
  display: "Archivo", // headings & numerals: 600/700/800/900
  body: "Public Sans", // UI & body: 400/500/600/700
} as const;

export interface ThemeTokens {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  good: string;
  goodSoft: string;
  warn: string;
  warnSoft: string;
  crit: string;
  critSoft: string;
  info: string;
  infoSoft: string;
  neutralPill: string;
  neutralPillSoft: string;
}

export const light: ThemeTokens = {
  bg: "#F6F3EC",
  surface: "#FFFFFF",
  surfaceAlt: "#EFEAE0",
  border: "#DDD5C4",
  text: "#26221C",
  textMuted: "#6B6357",
  accent: "#9C6E1B", // worksite gold — primary actions & money-positive only
  accentSoft: "#F1E4C6",
  onAccent: "#FFFFFF",
  good: "#2E7D46",
  goodSoft: "#DEEFE1",
  warn: "#C2570F",
  warnSoft: "#FBE6D7",
  crit: "#B23A2E",
  critSoft: "#F7DEDB",
  info: "#2C5F82",
  infoSoft: "#DCEAF1",
  neutralPill: "#8A8375",
  neutralPillSoft: "#E7E2D6",
};

export const dark: ThemeTokens = {
  bg: "#17140F",
  surface: "#221E17",
  surfaceAlt: "#2B261C",
  border: "#3A3427",
  text: "#EFE9DC",
  textMuted: "#A69C89",
  accent: "#E0AA48",
  accentSoft: "#3A2E15",
  onAccent: "#1A1408",
  good: "#57B378",
  goodSoft: "#1E3226",
  warn: "#E8843F",
  warnSoft: "#3A2716",
  crit: "#E2695A",
  critSoft: "#3A1E1B",
  info: "#6FA9CC",
  infoSoft: "#1E2E38",
  neutralPill: "#A69C89",
  neutralPillSoft: "#2E2A20",
};

export const radius = { sm: 6, md: 9, lg: 14 } as const;
export const space = { xs: 4, sm: 8, md: 14, lg: 22, xl: 36 } as const;

export const themes = { light, dark } as const;
export type ThemeName = keyof typeof themes;
