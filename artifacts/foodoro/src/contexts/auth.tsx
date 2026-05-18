import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const TOKEN_KEY = "foodoro-token";
const USER_KEY = "foodoro-user";

const REFRESH_WINDOW_MS = 30 * 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000;
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const IDLE_WARN_MS = 2 * 60 * 1000;

export type UserRole = "admin" | "cashier" | "kitchen_staff" | "inventory_manager";

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
  logout: () => void;
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
  const [idleWarning, setIdleWarning] = useState(false);
  const { t } = useTranslation();
  const { toast } = useToast();
  const warnedRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleWarnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyToken = useCallback((token: string) => {
    setAuthTokenGetter(() => token);
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setAuthTokenGetter(null);
    setUser(null);
    setSessionRemainingMs(null);
    setIdleWarning(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (idleWarnTimerRef.current) clearTimeout(idleWarnTimerRef.current);
  }, []);

  const storeSession = useCallback((token: string, authUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(authUser));
    applyToken(token);
    setUser(authUser);
    warnedRef.current = false;
  }, [applyToken]);

  const silentRefresh = useCallback(async (): Promise<boolean> => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return false;
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
      const data = await res.json() as { token: string; user: AuthUser };
      storeSession(data.token, data.user);
      return true;
    } catch {
      return false;
    }
  }, [storeSession]);

  const doLogout = useCallback(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    clearAuth();
  }, [clearAuth]);

  const resetIdleTimers = useCallback(() => {
    setIdleWarning(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (idleWarnTimerRef.current) clearTimeout(idleWarnTimerRef.current);

    idleWarnTimerRef.current = setTimeout(() => {
      setIdleWarning(true);
    }, IDLE_TIMEOUT_MS - IDLE_WARN_MS);

    idleTimerRef.current = setTimeout(() => {
      setIdleWarning(false);
      doLogout();
    }, IDLE_TIMEOUT_MS);
  }, [doLogout]);

  const dismissIdleWarning = useCallback(() => {
    resetIdleTimers();
  }, [resetIdleTimers]);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const userStr = localStorage.getItem(USER_KEY);

    const init = async () => {
      if (token && userStr) {
        try {
          const parsed = JSON.parse(userStr) as AuthUser;
          const expiry = getTokenExpiry(token);
          const now = Date.now();

          if (expiry && expiry <= now) {
            const refreshed = await silentRefresh();
            if (!refreshed) {
              clearAuth();
              setIsLoading(false);
              return;
            }
          } else {
            setUser(parsed);
            applyToken(token);
            if (expiry && expiry - now <= REFRESH_WINDOW_MS) {
              void silentRefresh();
            }
          }
        } catch {
          clearAuth();
        }
      }
      setIsLoading(false);
    };

    void init();
  }, [applyToken, clearAuth, silentRefresh]);

  useEffect(() => {
    if (!user) return;
    resetIdleTimers();

    const events = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "click"];
    const handler = () => { resetIdleTimers(); };
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (idleWarnTimerRef.current) clearTimeout(idleWarnTimerRef.current);
    };
  }, [user, resetIdleTimers]);

  useEffect(() => {
    const updateRemaining = async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token || !user) {
        setSessionRemainingMs(null);
        return;
      }

      const expiry = getTokenExpiry(token);
      if (expiry === null) return;

      const msUntilExpiry = expiry - Date.now();

      if (msUntilExpiry <= 0) {
        clearAuth();
        return;
      }

      setSessionRemainingMs(msUntilExpiry);

      if (msUntilExpiry <= REFRESH_WINDOW_MS) {
        const refreshed = await silentRefresh();
        if (!refreshed && !warnedRef.current) {
          warnedRef.current = true;
          toast({
            title: t("session.refreshFailed"),
            description: t("session.refreshFailedDesc"),
            variant: "destructive",
          });
        }
      }
    };

    if (!user) return;

    void updateRemaining();
    const interval = setInterval(() => { void updateRemaining(); }, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, silentRefresh, clearAuth, toast, t]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? "Login failed");
    }

    const data = await res.json() as { token: string; user: AuthUser };
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
        idleWarning,
        dismissIdleWarning,
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
