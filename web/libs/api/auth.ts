import type { ResetPasswordValues } from "@/components/login/schema/loginschema";

import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export type AuthSession = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  createdAt: string;
  current: boolean;
};

export async function resetPassword(token: string, payload: ResetPasswordValues) {
  const { data } = await apiClient.post<{ message: string }>(
    endpoints.auth.resetPassword,
    { token, password: payload.password }
  );
  return data.message;
}

export async function listAuthSessions() {
  const { data } = await apiClient.get<{ sessions: AuthSession[] }>("/auth/sessions");
  return data.sessions;
}

export async function revokeAuthSession(sessionId: string) {
  await apiClient.delete(`/auth/sessions/${sessionId}`);
}
