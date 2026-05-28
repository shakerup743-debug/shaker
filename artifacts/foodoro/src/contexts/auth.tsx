// Persistent-login auth context.
//
// Flow:
//   • Login   → backend issues short-lived JWT (7d) + HttpOnly refresh cookie (30d).
//               JWT is kept in localStorage for Bearer-header API calls.
//   • Init    → on app open, if a JWT is in localStorage and still valid: use it.
//               Otherwise (expired or missing) hit /api/auth/refresh with
//               credentials:'include' so the cookie does the work. If that
//               succeeds → seamless login. Else → show sign-in.
//   • Refresh → triggered (a) on init if access token missing/expired,
//               (b) proactively in the last 24h of access-token lifetime,
//               (c) on every 401 from any API call (handled in fetch wrapper).
//   • Logout  → POST /api/auth/logout (revokes refresh chain + clears cookie),
//               then wipe local state.
//
// We intentionally do NOT auto-logout on idle. Persistent login is the goal.
// Sensitive operations (Master Password ops) still require re-auth on their own.

import React, {
  createContext, useContext, useEffect, useState, useCallback, useRef,
} from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

const TOKEN_KEY = "foodoro-token";
const USER_KEY  = "foodoro-user";

// When the JWT has less than this many ms left, silently refresh in the background.
const REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h before expiry
const CHECK_INTERVAL_MS = 5 * 60 * 1000;       // poll every 5 minutes

export type UserRole = "admin" | "owner" | "cashier" | "kitchen" | "kitchen_staff" | "waiter" | "inventory_manager" | "accountant" | "branch_manager" | "area_manager" | "platform_admin";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  sessionRemainingMs: number | null;
  idleWarning: boolean;
  dismissIdleWarning: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function base64urlDecode(str: string): string {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  return atob(padded);
}

function getTokenExpiry(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(base64urlDecode(parts[1]!)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionRemainingMs, setSessionRemainingMs] = useState<number | null>(null);

  const refreshInFlightRef = useRef<Promise<boolean> | null>(null);
  const initRanRef = useRef(false);

  const applyToken = useCallback((token: string) => {
    setAuthTokenGetter(() => token);
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setAuthTokenGetter(null);
    setUser(null);
    setSessionRemainingMs(null);
  }, []);

  const storeSession = useCallback((token: string, authUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(authUser));
    applyToken(token);
    setUser(authUser);
  }, [applyToken]);

  /**
   * Hits POST /api/auth/refresh with credentials:"include" so the HttpOnly
   * refresh cookie is sent. No Authorization header is needed — that was the
   * core bug of the previous implementation.
   *
   * Deduplicates concurrent calls so a burst of 401s only triggers one refresh.
   */
  const silentRefresh = useCallback(async (): Promise<boolean> => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    const p = (async (): Promise<boolean> => {
      try {
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { token: string; user: AuthUser };
        storeSession(data.token, data.user);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlightRef.current = null;
      }
    })();
    refreshInFlightRef.current = p;
    return p;
  }, [storeSession]);

  const doLogout = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch { /* network errors are fine — we still clear local state */ }
    clearAuth();
  }, [clearAuth]);

  // ── INIT: runs once on app open ────────────────────────────────────────
  // 1. If localStorage has a JWT that hasn't expired → use it.
  // 2. Else try a cookie-based refresh — covers the "came back after a week"
  //    case where localStorage was cleared or the JWT expired but the
  //    long-lived cookie is still valid.
  useEffect(() => {
    if (initRanRef.current) return;
    initRanRef.current = true;

    const init = async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      const userStr = localStorage.getItem(USER_KEY);

      if (token && userStr) {
        const expiry = getTokenExpiry(token);
        const now = Date.now();
        if (expiry && expiry > now) {
          try {
            const parsed = JSON.parse(userStr) as AuthUser;
            setUser(parsed);
            applyToken(token);
            // Refresh proactively if we're inside the 24h window
            if (expiry - now <= REFRESH_WINDOW_MS) void silentRefresh();
            setIsLoading(false);
            return;
          } catch { /* corrupted state, fall through to refresh */ }
        }
      }

      // No usable local state — try cookie refresh silently
      const refreshed = await silentRefresh();
      if (!refreshed) clearAuth();
      setIsLoading(false);
    };

    void init();
  }, [applyToken, clearAuth, silentRefresh]);

  // ── Periodic check: keep token fresh + display remaining time ──────────
  useEffect(() => {
    if (!user) { setSessionRemainingMs(null); return; }

    const tick = async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) { setSessionRemainingMs(null); return; }
      const expiry = getTokenExpiry(token);
      if (expiry == null) return;
      const remaining = expiry - Date.now();
      setSessionRemainingMs(remaining);
      if (remaining <= 0) {
        // try one last refresh; if it fails, clear
        const ok = await silentRefresh();
        if (!ok) clearAuth();
      } else if (remaining <= REFRESH_WINDOW_MS) {
        void silentRefresh();
      }
    };

    void tick();
    const interval = setInterval(() => { void tick(); }, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, silentRefresh, clearAuth]);

  // ── Global 401 auto-recovery for fetch ─────────────────────────────────
  // We monkey-patch window.fetch. When any /api/* call comes back 401, try
  // a silent refresh; if it succeeds, replay the original request once.
  useEffect(() => {
    // Guard against double-wrapping under HMR / multiple AuthProvider mounts.
    const w = window as Window & { __foodoroFetchPatched?: boolean };
    if (w.__foodoroFetchPatched) return;
    w.__foodoroFetchPatched = true;

    const originalFetch = window.fetch.bind(window);
    const isAuthRoute = (url: string): boolean =>
      url.includes("/api/auth/login")
      || url.includes("/api/auth/refresh")
      || url.includes("/api/auth/logout")
      || url.includes("/api/auth/signup")
      || url.includes("/api/auth/google");

    const wrapped: typeof window.fetch = async (input, init) => {
      const res = await originalFetch(input as RequestInfo, init);
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (res.status !== 401) return res;
      if (!url.includes("/api/")) return res;
      if (isAuthRoute(url)) return res;

      const ok = await silentRefresh();
      if (!ok) return res;

      // Replay original request with the fresh token
      const fresh = localStorage.getItem(TOKEN_KEY);
      const newInit: RequestInit = { ...(init ?? {}) };
      const headers = new Headers(newInit.headers ?? {});
      if (fresh) headers.set("Authorization", `Bearer ${fresh}`);
      newInit.headers = headers;
      return originalFetch(input as RequestInfo, newInit);
    };
    window.fetch = wrapped;
    return () => {
      window.fetch = originalFetch;
      w.__foodoroFetchPatched = false;
    };
  }, [silentRefresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",   // critical: receive the HttpOnly refresh cookie
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Login failed");
    }
    const data = (await res.json()) as { token: string; user: AuthUser };
    storeSession(data.token, data.user);
  }, [storeSession]);

  const hasRole = useCallback((...roles: UserRole[]) => {
    if (!user) return false;
    if (roles.length === 0) return true;
    return roles.includes(user.role);
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        sessionRemainingMs,
        idleWarning: false,            // disabled — persistent login by design
        dismissIdleWarning: () => {},
        login,
        logout: doLogout,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
