import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export type AgentGrant = {
  id: string;
  agent: string;
  scope: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type AuthorizeAgentInput = {
  clientId: string;
  redirectUri: string;
  scope?: string;
  state?: string | null;
  codeChallenge?: string | null;
  codeChallengeMethod?: string | null;
};

/** Consent: mint a single-use OAuth code for the agent client (as the logged-in user). */
export async function authorizeAgent(input: AuthorizeAgentInput) {
  const { data } = await apiClient.post<{ code: string; redirectUri: string; state: string | null }>(
    endpoints.agent.oauthAuthorize,
    input
  );
  return data;
}

export async function listAgentGrants() {
  const { data } = await apiClient.get<{ grants: AgentGrant[] }>(endpoints.agent.grants);
  return data.grants;
}

export async function revokeAgentGrant(grantId: string) {
  await apiClient.delete(endpoints.agent.grant(grantId));
}
