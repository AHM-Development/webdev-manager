"use client";

import { Toast } from "@heroui/react";
import type { ReactNode } from "react";
import { AuthProvider } from "@/libs/auth/auth-context";

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <Toast.Provider placement="top" maxVisibleToasts={4} />
    </AuthProvider>
  );
}
