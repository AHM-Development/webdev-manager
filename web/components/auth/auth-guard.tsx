"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuthContext } from "@/libs/auth/auth-context";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, router, user]);

  if (isLoading || !user) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#f7f8fa]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#0b7de3]" />
      </div>
    );
  }

  return children;
}
