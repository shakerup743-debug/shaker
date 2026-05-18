import AsyncStorage from "@react-native-async-storage/async-storage";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

const TOKEN_KEY = "foodoro-token";
const USER_KEY = "foodoro-user";

const BASE_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applyToken = useCallback((token: string) => {
    setAuthTokenGetter(() => token);
  }, []);

  const clearAuth = useCallback(async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    setAuthTokenGetter(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const restore = async () => {
      try {
        const [token, userStr] = await AsyncStorage.multiGet([TOKEN_KEY, USER_KEY]);
        const t = token[1];
        const u = userStr[1];
        if (t && u) {
          const parsed = JSON.parse(u) as AuthUser;
          applyToken(t);
          setUser(parsed);
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    };
    void restore();
  }, [applyToken]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? "Login failed");
    }
    const data = await res.json() as { token: string; user: AuthUser };
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    applyToken(data.token);
    setUser(data.user);
  }, [applyToken]);

  const logout = useCallback(async () => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) {
      fetch(`${BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    await clearAuth();
  }, [clearAuth]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
