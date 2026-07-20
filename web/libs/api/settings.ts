import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export type WorkspaceSettings = {
  workspaceName: string;
  supportEmail: string;
  timezone: string;
  defaultSenderName: string;
  updatedAt: string;
};

export type EmailConnectorSettings = {
  provider: "google";
  status: "connected" | "disconnected";
  clientId: string;
  redirectUri: string;
  connectedEmail: string | null;
  lastTestStatus: "not_tested" | "ready" | "failed";
  lastTestedAt: string | null;
  updatedAt: string;
};

export type AiPromptSettings = {
  key: string;
  name: string;
  systemPrompt: string;
  userPromptTemplate: string;
  model: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  updatedAt: string;
};

export async function getWorkspaceSettings() {
  const { data } = await apiClient.get<{ workspace: WorkspaceSettings }>(
    endpoints.settings.workspace
  );
  return data.workspace;
}

export async function updateWorkspaceSettings(payload: Partial<WorkspaceSettings>) {
  const { data } = await apiClient.patch<{ workspace: WorkspaceSettings }>(
    endpoints.settings.workspace,
    payload
  );
  return data.workspace;
}

export async function getEmailConnectorSettings() {
  const { data } = await apiClient.get<{ connector: EmailConnectorSettings }>(
    endpoints.settings.emailConnector
  );
  return data.connector;
}

export async function updateEmailConnectorSettings(payload: {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
}) {
  const { data } = await apiClient.patch<{ connector: EmailConnectorSettings }>(
    endpoints.settings.emailConnector,
    payload
  );
  return data.connector;
}

export async function connectGoogleEmailConnector() {
  const { data } = await apiClient.post<{ connector: EmailConnectorSettings }>(
    endpoints.settings.googleConnect
  );
  return data.connector;
}

export async function disconnectGoogleEmailConnector() {
  const { data } = await apiClient.post<{ connector: EmailConnectorSettings }>(
    endpoints.settings.googleDisconnect
  );
  return data.connector;
}

export async function testEmailConnector() {
  const { data } = await apiClient.post<{ connector: EmailConnectorSettings }>(
    endpoints.settings.emailConnectorTest
  );
  return data.connector;
}

/** Send a real test email to `to`. Resolves on success, rejects with the reason. */
export async function sendTestEmail(to: string) {
  const { data } = await apiClient.post<{ delivered: boolean; to: string }>(
    endpoints.settings.emailConnectorTestSend,
    { to }
  );
  return data;
}

export async function getAiPromptSettings(promptKey: string) {
  const { data } = await apiClient.get<{ prompt: AiPromptSettings }>(
    endpoints.settings.aiPrompt(promptKey)
  );
  return data.prompt;
}

export async function updateAiPromptSettings(
  promptKey: string,
  payload: Partial<AiPromptSettings>
) {
  const { data } = await apiClient.patch<{ prompt: AiPromptSettings }>(
    endpoints.settings.aiPrompt(promptKey),
    payload
  );
  return data.prompt;
}
