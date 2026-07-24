/**
 * Cross-platform JWT storage. Native (Expo Go / device) uses expo-secure-store
 * (Keychain / Keystore); web falls back to localStorage since SecureStore isn't
 * available there.
 */
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const KEY = "jamquote_token";
const isWeb = Platform.OS === "web";

export async function saveToken(token: string): Promise<void> {
  if (isWeb) {
    try {
      window.localStorage.setItem(KEY, token);
    } catch {
      /* storage unavailable (private mode) — session stays in memory only */
    }
    return;
  }
  await SecureStore.setItemAsync(KEY, token);
}

export async function loadToken(): Promise<string | null> {
  if (isWeb) {
    try {
      return window.localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(KEY);
}

export async function clearToken(): Promise<void> {
  if (isWeb) {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}
