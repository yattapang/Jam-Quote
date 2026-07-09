/**
 * packages/ui tokens.ts declares generic family names ("Archivo", "Public Sans").
 * expo-google-fonts loads specific weight-named variants (e.g. "Archivo_800ExtraBold"),
 * so this maps a token family + numeric weight to the actual loaded fontFamily string.
 * Keep this the single place components go to resolve a fontFamily.
 */
export type FontFamilyKind = "display" | "body";
export type FontWeightToken = "400" | "500" | "600" | "700" | "800" | "900";

const DISPLAY: Partial<Record<FontWeightToken, string>> = {
  "600": "Archivo_600SemiBold",
  "700": "Archivo_700Bold",
  "800": "Archivo_800ExtraBold",
  "900": "Archivo_900Black",
};

const BODY: Partial<Record<FontWeightToken, string>> = {
  "400": "PublicSans_400Regular",
  "500": "PublicSans_500Medium",
  "600": "PublicSans_600SemiBold",
  "700": "PublicSans_700Bold",
};

export function resolveFontFamily(kind: FontFamilyKind, weight: FontWeightToken): string {
  const table = kind === "display" ? DISPLAY : BODY;
  return table[weight] ?? (kind === "display" ? "Archivo_700Bold" : "PublicSans_400Regular");
}
