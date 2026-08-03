import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { View } from "react-native";
import { AuthProvider, useAuth } from "../src/state/AuthContext";
import { QuoteDraftProvider } from "../src/state/QuoteDraftContext";
import { fontsToLoad } from "../src/theme/fonts";
import { ThemeProvider, useTheme } from "../src/theme/ThemeProvider";

SplashScreen.preventAutoHideAsync().catch(() => {
  /* no-op: splash may already be hidden in some environments (e.g. web) */
});

function RootStack() {
  const { colors } = useTheme();
  const router = useRouter();
  const { authRequired, acknowledgeAuthRequired } = useAuth();

  // Central 401/403 response: AuthContext (apiClient's setUnauthorizedHandler)
  // already cleared the local session; send the user to sign in from wherever
  // they are in the app, instead of every screen handling this individually.
  useEffect(() => {
    if (authRequired) {
      acknowledgeAuthRequired();
      router.push("/login");
    }
  }, [authRequired, acknowledgeAuthRequired, router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={colors.bg === "#17140F" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="quote-editor" options={{ presentation: "card" }} />
        <Stack.Screen name="add-material" options={{ presentation: "modal" }} />
        <Stack.Screen name="invoice-detail" options={{ presentation: "card" }} />
        <Stack.Screen name="feature-preview" options={{ presentation: "card" }} />
        <Stack.Screen name="login" options={{ presentation: "modal" }} />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontsToLoad);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <QuoteDraftProvider>
          <RootStack />
        </QuoteDraftProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
