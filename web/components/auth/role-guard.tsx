"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuthContext } from "@/libs/auth/auth-context";
import type { ApiUser } from "@/libs/api/users";

export function RoleGuard({
  roles,
  children,
}: {
  roles: ApiUser["role"][];
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuthContext();
  const router = useRouter();
  const allowed = !!user && roles.includes(user.role);

  useEffect(() => {
    if (!isLoading && user && !allowed) router.replace("/dashboard");
  }, [allowed, isLoading, router, user]);

  if (isLoading || !allowed) return null;
  return children;
}
