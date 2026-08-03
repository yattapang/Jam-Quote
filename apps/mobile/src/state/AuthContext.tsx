/**
 * Auth state for the mobile app. Loads any stored JWT on startup and verifies
 * it via /auth/me; exposes login/register/logout. On login it wires the token
 * into apiClient (setAuthToken) so every data request authenticates as the
 * signed-in user's business. Every tenant route now requires a token — signed
 * out, the app has no business context and tenant screens show an empty/
 * sign-in-required state rather than data (see the tab screens).
 *
 * Central 401/403 handling: this provider registers a handler with apiClient
 * (setUnauthorizedHandler) once on mount. Any request anywhere in the app that
 * comes back 401 (bad/expired token) or 403 (valid token, no usable business —
 * admin account or suspended business) ends the local session here and flips
 * `authRequired`, which app/_layout.tsx watches to redirect to /login. This
 * keeps individual screens from having to special-case auth failures.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  apiLogin,
  apiRegister,
  fetchMe,
  setAuthToken,
  setUnauthorizedHandler,
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
  /** Flips true when apiClient reports a 401/403 from any request. app/_layout.tsx
   * watches this to redirect to /login, then calls acknowledgeAuthRequired(). */
  authRequired: boolean;
  acknowledgeAuthRequired: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [business, setBusiness] = useState<AuthBusiness | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);

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
          // Token invalid/expired — drop it. No fallback: tenant routes require auth now.
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

  // One-time registration of the central 401/403 handler (see file header).
  useEffect(() => {
    setUnauthorizedHandler((status) => {
      if (status === 401) {
        // Bad/expired token — the API has already rejected it; drop it locally too.
        setAuthToken(null);
        void clearToken();
      }
      // Either way (401 bad token, or 403 valid-token-but-no-tenant-access) the
      // user can't use tenant screens right now — end the local session and
      // ask them to sign in again.
      setUser(null);
      setBusiness(null);
      setAuthRequired(true);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      business,
      initializing,
      isAuthenticated: user !== null,
      authRequired,
      acknowledgeAuthRequired: () => setAuthRequired(false),
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
    [user, business, initializing, authRequired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
