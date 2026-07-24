/**
 * Auth state for the mobile app. Loads any stored JWT on startup and verifies
 * it via /auth/me; exposes login/register/logout. On login it wires the token
 * into apiClient (setAuthToken) so every data request authenticates as the
 * signed-in user's business. Signed out, the app keeps working against the demo
 * business (additive rollout).
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  apiLogin,
  apiRegister,
  fetchMe,
  setAuthToken,
  type AuthBusiness,
  type AuthUser,
  type RegisterInput,
} from "./apiClient";
import { clearToken, loadToken, saveToken } from "./tokenStore";

interface AuthContextValue {
  user: AuthUser | null;
  business: AuthBusiness | null;
  /** True until the stored token (if any) has been checked on startup. */
  initializing: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [business, setBusiness] = useState<AuthBusiness | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const token = await loadToken();
      if (token) {
        setAuthToken(token);
        try {
          const me = await fetchMe(token);
          if (active) {
            setUser(me.user);
            setBusiness(me.business);
          }
        } catch {
          // Token invalid/expired — drop it and fall back to the demo business.
          setAuthToken(null);
          await clearToken();
        }
      }
      if (active) setInitializing(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      business,
      initializing,
      isAuthenticated: user !== null,
      login: async (email, password) => {
        const result = await apiLogin(email, password);
        await saveToken(result.token);
        setAuthToken(result.token);
        setUser(result.user);
        setBusiness(result.business);
      },
      register: async (input) => {
        const result = await apiRegister(input);
        await saveToken(result.token);
        setAuthToken(result.token);
        setUser(result.user);
        setBusiness(result.business);
      },
      logout: async () => {
        await clearToken();
        setAuthToken(null);
        setUser(null);
        setBusiness(null);
      },
    }),
    [user, business, initializing],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
