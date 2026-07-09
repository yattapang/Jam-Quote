import { GctTreatment, LineCategory, PriceSource, RateUnit } from "@jamquote/core";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, MoneyText } from "../src/components";
import { useQuoteDraft } from "../src/state/QuoteDraftContext";
import { cementSupplierPrices, type SupplierPriceResult } from "../src/state/mockData";
import { resolveFontFamily } from "../src/theme/fontFamily";
import { useTheme } from "../src/theme/ThemeProvider";

const GCT_OPTIONS: { label: string; value: GctTreatment }[] = [
  { label: "Standard GCT", value: GctTreatment.STANDARD },
  { label: "Zero-rated", value: GctTreatment.ZERO_RATED },
  { label: "Exempt", value: GctTreatment.EXEMPT },
];

/**
 * Add material ★ — supplier price lookup (source + freshness always shown)
 * with a manual-override field that is never blocked by lookup state.
 * Mirrors "isAddMaterial" in extracted/JamQuote.dc.html.
 */
export default function AddMaterialScreen() {
  const { colors, space } = useTheme();
  const router = useRouter();
  const { addLine } = useQuoteDraft();

  const [query, setQuery] = useState("cement, 42.5kg");
  const [selectedId, setSelectedId] = useState(cementSupplierPrices[0]!.id);
  const [quantity, setQuantity] = useState(40);
  const [gctTreatment, setGctTreatment] = useState<GctTreatment>(GctTreatment.STANDARD);
  const [overrideCents, setOverrideCents] = useState<number | null>(null);
  const [overrideNote, setOverrideNote] = useState("");

  const selected = cementSupplierPrices.find((s) => s.id === selectedId) ?? cementSupplierPrices[0]!;
  const isOverridden = overrideCents !== null && overrideCents !== selected.unitPriceCents;
  const effectiveUnitPriceCents = overrideCents ?? selected.unitPriceCents;
  const lineTotalCents = useMemo(() => Math.round(quantity * effectiveUnitPriceCents), [quantity, effectiveUnitPriceCents]);

  const canSave = !isOverridden || overrideNote.trim().length > 0;

  const handleSelectSupplier = (s: SupplierPriceResult) => {
    setSelectedId(s.id);
    setOverrideCents(null);
    setOverrideNote("");
  };

  const handleManualOverride = (delta: number) => {
    const base = overrideCents ?? selected.unitPriceCents;
    setOverrideCents(Math.max(0, base + delta));
  };

  const handleAdd = () => {
    addLine({
      id: `material-${Date.now()}`,
      category: LineCategory.MATERIAL,
      description: query,
      quantity,
      rateUnit: RateUnit.UNIT,
      unitPriceCents: effectiveUnitPriceCents,
      priceSource: isOverridden ? PriceSource.MANUAL : PriceSource.LOOKUP,
      gctTreatment,
      supplierName: selected.supplierName,
      overrideNote: isOverridden ? overrideNote.trim() : undefined,
    });
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <View style={{ padding: space.lg, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 20, color: colors.text }}>{"‹"}</Text>
        </Pressable>
        <Text style={{ fontFamily: resolveFontFamily("display", "800"), fontSize: 17, color: colors.text }}>
          Add material
        </Text>
      </View>

      <View style={{ paddingHorizontal: space.lg, paddingBottom: 12 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          style={{
            padding: 13,
            borderRadius: 10,
            borderWidth: 1.5,
            borderColor: colors.accent,
            backgroundColor: colors.surface,
            color: colors.text,
            fontSize: 15,
          }}
          placeholder="Search materials…"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, gap: 8, paddingBottom: 12 }}>
        <Text
          style={{
            fontSize: 11.5,
            fontWeight: "700",
            color: colors.textMuted,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            marginBottom: 2,
          }}
        >
          Supplier prices
        </Text>
        {cementSupplierPrices.map((s) => {
          const active = s.id === selectedId;
          const freshColor =
            s.freshnessKind === "good" ? colors.good : s.freshnessKind === "warn" ? colors.warn : colors.crit;
          return (
            <Pressable
              key={s.id}
              onPress={() => handleSelectSupplier(s)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 13,
                borderRadius: 11,
                borderWidth: active ? 2 : 1,
                borderColor: active ? colors.accent : colors.border,
                backgroundColor: active ? colors.accentSoft : colors.surface,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: resolveFontFamily("body", "700"), fontSize: 14, color: colors.text }}>
                  {s.supplierName} — {s.location}
                </Text>
                <Text style={{ fontSize: 11.5, color: freshColor, marginTop: 3, fontWeight: "600" }}>
                  ● {s.freshness}
                </Text>
              </View>
              <MoneyText cents={s.unitPriceCents} size={15} />
            </Pressable>
          );
        })}
      </ScrollView>

      <View
        style={{
          padding: space.lg,
          paddingTop: 14,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          gap: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 12.5, fontWeight: "600", color: colors.textMuted }}>Quantity</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable
              onPress={() => setQuantity((q) => Math.max(0, q - 1))}
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surfaceAlt,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>−</Text>
            </Pressable>
            <Text style={{ fontFamily: resolveFontFamily("display", "800"), fontSize: 16, color: colors.text, minWidth: 26, textAlign: "center" }}>
              {quantity}
            </Text>
            <Pressable
              onPress={() => setQuantity((q) => q + 1)}
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surfaceAlt,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>+</Text>
            </Pressable>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>bags</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 12.5, fontWeight: "600", color: colors.textMuted }}>Rate (manual override available)</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable onPress={() => handleManualOverride(-500)} hitSlop={8}>
              <Text style={{ fontSize: 16, color: colors.textMuted }}>−</Text>
            </Pressable>
            <MoneyText cents={effectiveUnitPriceCents} size={15} />
            <Pressable onPress={() => handleManualOverride(500)} hitSlop={8}>
              <Text style={{ fontSize: 16, color: colors.textMuted }}>+</Text>
            </Pressable>
          </View>
        </View>

        {isOverridden ? (
          <TextInput
            value={overrideNote}
            onChangeText={setOverrideNote}
            placeholder="Override note (required — why did you change this price?)"
            placeholderTextColor={colors.textMuted}
            style={{
              padding: 12,
              borderRadius: 9,
              borderWidth: 1,
              borderColor: overrideNote.trim() ? colors.border : colors.crit,
              backgroundColor: colors.surfaceAlt,
              color: colors.text,
              fontSize: 12.5,
            }}
          />
        ) : null}

        <View style={{ flexDirection: "row", gap: 8 }}>
          {GCT_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              title={opt.label}
              variant={gctTreatment === opt.value ? "primary" : "secondary"}
              style={{ flex: 1 }}
              onPress={() => setGctTreatment(opt.value)}
            />
          ))}
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 4,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: "600" }}>Line total</Text>
          <MoneyText cents={lineTotalCents} size={19} />
        </View>

        <Button title="Add to quote" fullWidth disabled={!canSave} onPress={handleAdd} />
      </View>
    </SafeAreaView>
  );
}
