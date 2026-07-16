import type { SiteAudit } from "@/components/website-health/data";

import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export type HealthSummary = {
  overall: number;
  performance: number | null;
  pages: number;
  forms: number;
  criticalIssues: number;
  warningIssues: number;
  technicalSeoIssues: number;
  designIssues: number;
  checklistIssues: number;
  security: "pass" | "warn" | "fail";
  connectorStatus: "connected" | "disconnected";
};

export type HealthScan = {
  id: string;
  websiteId: string;
  status: "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";
  stage: string;
  progress: number;
  summary: HealthSummary | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

/** The five selectable scan checks. "website_checklists" covers WordPress
 *  maintenance and security; "forms" audits WP form plugins (both need the
 *  paired connector). */
export type HealthCheck =
  | "lighthouse"
  | "technical_seo"
  | "design_qa"
  | "website_checklists"
  | "forms";

export const HEALTH_CHECKS: HealthCheck[] = [
  "lighthouse",
  "technical_seo",
  "design_qa",
  "website_checklists",
  "forms",
];

export type HealthCapabilities = { lighthouse: boolean; ai: boolean };

export type HealthWebsiteRow = {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  url: string;
  connector: { status: "connected" | "warning" | "disconnected" | "revoked"; lastHeartbeatAt: string | null };
  profile: { sitemapUrl: string | null; defaultChecks: HealthCheck[] | null };
  latestScan: HealthScan | null;
};

export type WebsiteHealthDetail = {
  project: { id: string; clientName: string; figmaLink: string | null };
  website: { id: string; name: string; url: string };
  profile: {
    approvedIdentity: Record<string, unknown>;
    essentialPlugins: string[];
    formTestPolicy: Record<string, unknown>;
    maxPages: number;
    figmaComparisonEnabled: false;
    sitemapUrl: string | null;
    defaultChecks: HealthCheck[] | null;
    contentStalenessDays: number | null;
  };
  connector: { status: string; pluginVersion: string | null; lastHeartbeatAt: string | null };
  scan: HealthScan | null;
  audit: SiteAudit | null;
};

export async function listWebsiteHealth(params?: { page?: number; pageSize?: number; q?: string }) {
  const { data } = await apiClient.get<{
    websites: HealthWebsiteRow[];
    overview: {
      websites: number;
      scannedWebsites: number;
      averageHealth: number | null;
      pages: number;
      forms: number;
      criticalIssues: number;
    };
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }>(endpoints.websiteHealth.list, { params });
  return data;
}

export async function getWebsiteHealth(websiteId: string) {
  const { data } = await apiClient.get<WebsiteHealthDetail>(endpoints.websiteHealth.website(websiteId));
  return data;
}

export async function startWebsiteHealthScan(
  websiteId: string,
  options?: { checks?: HealthCheck[]; sitemapUrl?: string }
) {
  const { data } = await apiClient.post<{ scan: HealthScan }>(endpoints.websiteHealth.scans, {
    websiteId,
    checks: options?.checks,
    sitemapUrl: options?.sitemapUrl,
  });
  return data.scan;
}

export async function getWebsiteHealthCapabilities() {
  const { data } = await apiClient.get<{ capabilities: HealthCapabilities }>(
    endpoints.websiteHealth.capabilities
  );
  return data.capabilities;
}

export async function getWebsiteHealthScan(scanId: string) {
  const { data } = await apiClient.get<{ scan: HealthScan }>(endpoints.websiteHealth.scan(scanId));
  return data.scan;
}

export async function cancelWebsiteHealthScan(scanId: string) {
  const { data } = await apiClient.post<{ scan: HealthScan }>(endpoints.websiteHealth.cancel(scanId));
  return data.scan;
}

export async function retryWebsiteHealthScan(scanId: string) {
  const { data } = await apiClient.post<{ scan: HealthScan }>(endpoints.websiteHealth.retry(scanId));
  return data.scan;
}

export async function createWordPressPairingCode(websiteId: string) {
  const { data } = await apiClient.post<{
    code: string;
    expiresAt: string;
    apiUrl: string;
    website: { id: string; name: string; url: string };
  }>(endpoints.wordpressConnector.pairingCode(websiteId));
  return data;
}

export async function sendFormTest(websiteId: string, formId: string, to: string) {
  const { data } = await apiClient.post<{
    result: { sent: boolean; to?: string; form?: string; plugin?: string; error?: string };
  }>(endpoints.websiteHealth.formTest(websiteId), { formId, to });
  return data.result;
}

// ---- Manual forms test verification (evidence-backed sign-off) ----
export type FormEvidence = { id: string; url: string; name: string };
export type FormVerification = {
  formKey: string;
  status: "passed" | "failed";
  note: string;
  screenshots: FormEvidence[];
  formSignature: string | null;
  testedByName: string | null;
  testedAt: string;
};

/** Stable signature of a form's delivery config, to detect drift since verification. */
export function formSignature(form: {
  recipients: string[];
  cc: string[];
  bcc: string[];
  fields: { name: string; required: boolean }[];
}) {
  const recipients = [...form.recipients, ...form.cc, ...form.bcc]
    .map((email) => email.toLowerCase().trim())
    .sort()
    .join("|");
  const fields = form.fields
    .map((field) => `${field.name}:${field.required ? 1 : 0}`)
    .sort()
    .join("|");
  const raw = `${recipients}::${fields}`;
  let hash = 5381;
  for (let i = 0; i < raw.length; i += 1) hash = ((hash << 5) + hash + raw.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

export async function uploadFormEvidence(file: File) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post<FormEvidence>(endpoints.websiteHealth.uploads, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function listFormVerifications(websiteId: string) {
  const { data } = await apiClient.get<{ verifications: FormVerification[] }>(
    endpoints.websiteHealth.formVerifications(websiteId)
  );
  return data.verifications;
}

export async function saveFormVerification(
  websiteId: string,
  formKey: string,
  payload: {
    status: "passed" | "failed";
    note?: string;
    screenshots: FormEvidence[];
    formSignature: string;
  }
) {
  const { data } = await apiClient.put<{ verification: FormVerification }>(
    endpoints.websiteHealth.formVerification(websiteId, formKey),
    payload
  );
  return data.verification;
}

// ---- Manual Design QA sign-off (per page, evidence-backed) ----
export type DesignVerification = {
  pageKey: string;
  status: "approved" | "rejected";
  note: string;
  screenshots: FormEvidence[];
  designSignature: string | null;
  testedByName: string | null;
  testedAt: string;
};

/** Stable signature of a page's design QA result, to detect drift since sign-off. */
export function designSignature(designQa: {
  figmaMatch: number | null;
  mobile: string;
  tablet: string;
  desktop: string;
  issues: unknown[];
}) {
  const raw = [
    designQa.figmaMatch ?? "na",
    designQa.mobile,
    designQa.tablet,
    designQa.desktop,
    designQa.issues.length,
  ].join("|");
  let hash = 5381;
  for (let i = 0; i < raw.length; i += 1) hash = ((hash << 5) + hash + raw.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

export async function listDesignVerifications(websiteId: string) {
  const { data } = await apiClient.get<{ verifications: DesignVerification[] }>(
    endpoints.websiteHealth.designVerifications(websiteId)
  );
  return data.verifications;
}

export async function saveDesignVerification(
  websiteId: string,
  pageKey: string,
  payload: {
    status: "approved" | "rejected";
    note?: string;
    screenshots: FormEvidence[];
    designSignature: string;
  }
) {
  const { data } = await apiClient.put<{ verification: DesignVerification }>(
    endpoints.websiteHealth.designVerification(websiteId, pageKey),
    payload
  );
  return data.verification;
}

export async function updateWebsiteHealthProfile(
  websiteId: string,
  profile: Omit<WebsiteHealthDetail["profile"], "sitemapUrl" | "defaultChecks">
) {
  const { data } = await apiClient.patch<{ profile: WebsiteHealthDetail["profile"] }>(
    endpoints.websiteHealth.profile(websiteId),
    profile
  );
  return data.profile;
}
