"use client";

/**
 * One shared success-feedback mechanism for the whole app. Mounted once in
 * app/(app)/layout.tsx, above the routed page content, so a toast fired just
 * before a `router.push()` survives the navigation: the provider's own state
 * lives in a layout that Next's app router keeps mounted across route
 * changes within this segment, only the page content underneath is swapped.
 * That means callers just do `showToast("Quote saved"); router.push(...)` —
 * no query-flag or sessionStorage relay is needed, which avoids polluting
 * the URL/history and the awkwardness of clearing a flag after a refresh.
 */
import { createContext, useCallback, useContext, useRef, useState } from "react";
import styles from "./ToastProvider.module.css";

const AUTO_DISMISS_MS = 4000;

interface ToastContextValue {
  showToast: (message: string) => void;
}

// Default is a no-op, not a throw: dozens of component tests render a single
// form/button in isolation (no app shell above them) and call useToast() only
// incidentally through the save path. Requiring every one of those to wrap
// itself in a ToastProvider would turn this into a churn-heavy, unrelated
// change to unrelated test files. The real app always has the provider
// mounted once in app/(app)/layout.tsx, so production callers never see the
// no-op; tests that care about the toast itself render with ToastProvider
// explicitly (see ToastProvider.test.tsx and the *.toast.test.tsx files).
const noopToastContext: ToastContextValue = { showToast: () => {} };
const ToastContext = createContext<ToastContextValue>(noopToastContext);

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

interface ToastState {
  id: number;
  message: string;
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);
  const nextId = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleDismiss = useCallback(
    (id: number) => {
      clearTimer();
      if (pausedRef.current) return;
      timerRef.current = setTimeout(() => {
        setToast((current) => (current?.id === id ? null : current));
      }, AUTO_DISMISS_MS);
    },
    [clearTimer],
  );

  const showToast = useCallback(
    (message: string) => {
      const id = ++nextId.current;
      pausedRef.current = false;
      setToast({ id, message });
      scheduleDismiss(id);
    },
    [scheduleDismiss],
  );

  const handlePause = useCallback(() => {
    pausedRef.current = true;
    clearTimer();
  }, [clearTimer]);

  const handleResume = useCallback(() => {
    pausedRef.current = false;
    if (toast) scheduleDismiss(toast.id);
  }, [scheduleDismiss, toast]);

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className={styles.viewport}>
        {toast && (
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className={styles.toast}
            tabIndex={0}
            onMouseEnter={handlePause}
            onMouseLeave={handleResume}
            onFocus={handlePause}
            onBlur={handleResume}
          >
            <span className={styles.message}>{toast.message}</span>
            <button
              type="button"
              className={styles.close}
              aria-label="Dismiss notification"
              onClick={dismiss}
            >
              ×
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
