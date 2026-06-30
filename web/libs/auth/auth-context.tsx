"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { LoginValues } from "@/components/login/schema/loginschema";
import { apiClient } from "@/libs/api/client";
import { endpoints } from "@/libs/api/endpoints";
import { clearAuthTokens, setAccessToken } from "@/libs/api/token-store";
import type { ApiUser } from "@/libs/api/users";

type AuthResponse = {
  user: ApiUser;
  accessToken: string;
};

type AuthContextValue = {
  user: ApiUser | null;
  isLoading: boolean;
  login: (values: LoginValues) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshSession: () => Promise<ApiUser | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = async () => {
    try {
      const { data } = await apiClient.post<AuthResponse>(endpoints.auth.refresh);
      setAccessToken(data.accessToken);
      setUser(data.user);
      return data.user;
    } catch {
      clearAuthTokens();
      setUser(null);
      return null;
    }
  };

  useEffect(() => {
    let active = true;
    apiClient
      .post<AuthResponse>(endpoints.auth.refresh)
      .then(({ data }) => {
        if (!active) return;
        setAccessToken(data.accessToken);
        setUser(data.user);
      })
      .catch(() => {
        if (!active) return;
        clearAuthTokens();
        setUser(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    const expire = () => {
      clearAuthTokens();
      setUser(null);
      router.replace("/login");
    };
    window.addEventListener("ahm:auth-expired", expire);
    return () => {
      active = false;
      window.removeEventListener("ahm:auth-expired", expire);
    };
  }, [router]);

  const login = async (values: LoginValues) => {
    const { data } = await apiClient.post<AuthResponse>(endpoints.auth.login, values);
    setAccessToken(data.accessToken);
    setUser(data.user);
    router.replace("/dashboard");
  };

  const logout = async () => {
    try {
      await apiClient.post(endpoints.auth.logout);
    } finally {
      clearAuthTokens();
      setUser(null);
      router.replace("/login");
    }
  };

  const logoutAll = async () => {
    try {
      await apiClient.post(endpoints.auth.logoutAll);
    } finally {
      clearAuthTokens();
      setUser(null);
      router.replace("/login");
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, logoutAll, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuthContext must be used inside AuthProvider.");
  return value;
}
