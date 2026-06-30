import type { Credential } from "@/components/website-users/data";

import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export type WebsiteCredentialPayload = {
  name: string;
  projectId?: string;
  websiteId?: string;
  externalSite?: string;
  environment: Credential["environment"];
  username: string;
  password?: string;
  createdAt?: string;
  passwordUpdatedAt?: string;
  note?: string;
};

export type WebsiteCredentialOptions = {
  projects: { id: string; name: string }[];
  websites: { id: string; projectId: string; name: string; url: string }[];
  names: string[];
  environments: Credential["environment"][];
};

export async function listWebsiteCredentials(params?: {
  q?: string;
  name?: string;
  projectId?: string;
  environment?: string;
}) {
  const { data } = await apiClient.get<{ credentials: Credential[] }>(
    endpoints.websiteUsers.list,
    { params }
  );
  return data.credentials;
}

export async function getWebsiteCredentialOptions() {
  const { data } = await apiClient.get<WebsiteCredentialOptions>(
    endpoints.websiteUsers.options
  );
  return data;
}

export async function createWebsiteCredential(payload: WebsiteCredentialPayload) {
  const { data } = await apiClient.post<{ credential: Credential }>(
    endpoints.websiteUsers.create,
    payload
  );
  return data.credential;
}

export async function updateWebsiteCredential(
  credentialId: string,
  payload: WebsiteCredentialPayload
) {
  const { data } = await apiClient.patch<{ credential: Credential }>(
    endpoints.websiteUsers.update(credentialId),
    payload
  );
  return data.credential;
}

export async function deleteWebsiteCredential(credentialId: string) {
  await apiClient.delete(endpoints.websiteUsers.delete(credentialId));
}

export async function copyWebsiteCredentialPackage(credentialId: string) {
  const { data } = await apiClient.post<{ content: string }>(
    endpoints.websiteUsers.copyPackage(credentialId)
  );
  return data.content;
}

export async function previewWebsiteCredentialImport(
  payload:
    | { csvText: string }
    | { sheetUrl: string }
    | { file: File }
) {
  if ("file" in payload) {
    const form = new FormData();
    form.append("file", payload.file);
    const { data } = await apiClient.post<{
      headers: string[];
      rows: Record<string, string>[];
      sampleRows: Record<string, string>[];
      mapping: Record<string, string>;
      totalRows: number;
    }>(endpoints.websiteUsers.importPreview, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  }

  const { data } = await apiClient.post<{
    headers: string[];
    rows: Record<string, string>[];
    sampleRows: Record<string, string>[];
    mapping: Record<string, string>;
    totalRows: number;
  }>(endpoints.websiteUsers.importPreview, payload);
  return data;
}

export async function importWebsiteCredentials(payload: {
  headers: string[];
  rows: Record<string, string>[];
  mapping: Record<string, string>;
}) {
  const { data } = await apiClient.post<{
    imported: Credential[];
    errors: { row: number; message: string }[];
  }>(endpoints.websiteUsers.import, payload);
  return data;
}
