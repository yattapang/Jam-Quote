import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/state/AuthContext";
import { useTheme } from "../src/theme/ThemeProvider";
import { resolveFontFamily } from "../src/theme/fontFamily";

type Mode = "login" | "register";

export default function LoginScreen() {
  const { colors, space } = useTheme();
  const router = useRouter();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isRegister = mode === "register";

  async function submit() {
    setError("");
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    if (isRegister && !businessName.trim()) {
      setError("Business name is required.");
      return;
    }
    setBusy(true);
    try {
      if (isRegister) {
        await register({
          email: email.trim(),
          password,
          businessName: businessName.trim(),
          fullName: fullName.trim() || undefined,
        });
      } else {
        await login(email.trim(), password);
      }
      // Back to wherever they came from (tabs / More); data now scoped to them.
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  } as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1, justifyContent: "center" }}>
          <View style={{ marginBottom: space.sm }}>
            <Text style={{ fontFamily: resolveFontFamily("display", "800"), fontSize: 26, color: colors.text }}>
              {isRegister ? "Create your account" : "Welcome back"}
            </Text>
            <Text style={{ fontSize: 13.5, color: colors.textMuted, marginTop: 4 }}>
              {isRegister
                ? "Set up your contractor business on JamQuote."
                : "Sign in to your JamQuote business."}
            </Text>
          </View>

          {isRegister && (
            <>
              <TextInput
                style={inputStyle}
                placeholder="Business name"
                placeholderTextColor={colors.textMuted}
                value={businessName}
                onChangeText={setBusinessName}
                autoCapitalize="words"
              />
              <TextInput
                style={inputStyle}
                placeholder="Your name (optional)"
                placeholderTextColor={colors.textMuted}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
              />
            </>
          )}

          <TextInput
            style={inputStyle}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextInput
            style={inputStyle}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={isRegister ? "new-password" : "current-password"}
          />

          {error ? (
            <Text style={{ color: colors.crit, fontSize: 13 }}>{error}</Text>
          ) : null}

          <Pressable
            onPress={submit}
            disabled={busy}
            style={{
              backgroundColor: colors.accent,
              borderRadius: 10,
              paddingVertical: 14,
              alignItems: "center",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={{ fontFamily: resolveFontFamily("body", "700"), fontSize: 15, color: colors.onAccent }}>
                {isRegister ? "Create account" : "Sign in"}
              </Text>
            )}
          </Pressable>

          <Pressable onPress={() => { setError(""); setMode(isRegister ? "login" : "register"); }} style={{ alignItems: "center", paddingVertical: 6 }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>
              {isRegister ? "Already have an account? " : "New to JamQuote? "}
              <Text style={{ color: colors.accent, fontFamily: resolveFontFamily("body", "700") }}>
                {isRegister ? "Sign in" : "Create one"}
              </Text>
            </Text>
          </Pressable>

          {!isRegister && (
            <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: "center", marginTop: space.sm }}>
              Demo login: owner@blackwood.jm / Blackwood123!
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
