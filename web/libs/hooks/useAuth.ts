"use client";

import { useAuthContext } from "@/libs/auth/auth-context";

/**
 * Auth actions for the app. Keeps API/navigation logic out of components.
 * On a failed request, the rejected value is the normalized ApiError
 * (see libs/api/interceptors), so callers can read `err.message`.
 */
export function useAuth() {
  return useAuthContext();
}
