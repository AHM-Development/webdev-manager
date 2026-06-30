import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export type ActivitySeverity = "info" | "success" | "warning" | "danger";

export type UserActivityLog = {
  id: string;
  userId: string | null;
  name: string;
  email: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  action: string;
  eventType: string;
  description: string | null;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  severity: ActivitySeverity;
  metadata: unknown;
  createdAt: string;
};

export type WebsiteActivityLog = {
  id: string;
  projectId: string | null;
  projectName: string | null;
  websiteId: string | null;
  websiteName: string | null;
  websiteUrl: string | null;
  actorUserId: string | null;
  name: string;
  email: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  action: string;
  description: string | null;
  severity: ActivitySeverity;
  source: string;
  metadata: unknown;
  createdAt: string;
};

export type ActivityLogPage<T> = {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
};

export async function listUserActivityLogs(params: {
  page?: number;
  pageSize?: number;
  userId?: string;
  eventType?: string;
  from?: string;
  to?: string;
}) {
  const { data } = await apiClient.get<ActivityLogPage<UserActivityLog>>(
    endpoints.activityLogs.users,
    { params }
  );
  return data;
}

export async function getUserActivityOptions() {
  const { data } = await apiClient.get<{
    users: { id: string; name: string }[];
    eventTypes: string[];
  }>(endpoints.activityLogs.userOptions);
  return data;
}

export async function listWebsiteActivityLogs(params: {
  page?: number;
  pageSize?: number;
  projectId?: string;
  websiteId?: string;
  action?: string;
  from?: string;
  to?: string;
}) {
  const { data } = await apiClient.get<ActivityLogPage<WebsiteActivityLog>>(
    endpoints.activityLogs.websites,
    { params }
  );
  return data;
}

export async function getWebsiteActivityOptions() {
  const { data } = await apiClient.get<{
    projects: { id: string; name: string }[];
    websites: { id: string; name: string; url: string | null }[];
    actions: string[];
  }>(endpoints.activityLogs.websiteOptions);
  return data;
}
