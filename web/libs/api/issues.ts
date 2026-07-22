import type {
  TaskAttachment,
  TaskChecklistItem,
  TaskPriority,
} from "@/components/tasks/data";
import type {
  Issue,
  IssueStatus,
  IssueTarget,
} from "@/components/issue-board/data";

import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export type IssueOptions = {
  statuses: IssueStatus[];
  targetTypes: IssueTarget[];
  priorities?: TaskPriority[];
  projects: { id: string; name: string }[];
  assignees: { id: string; name: string }[];
};

export async function listIssues(params?: {
  q?: string;
  status?: IssueStatus | "all";
  projectId?: string;
  targetType?: IssueTarget | "all";
  fixed?: "true" | "false";
}) {
  const { data } = await apiClient.get<{ issues: Issue[] }>(
    endpoints.issues.list,
    { params }
  );
  return data.issues;
}

export async function getIssueOptions() {
  const { data } = await apiClient.get<IssueOptions>(endpoints.issues.options);
  return data;
}

export async function createIssue(payload: {
  title: string;
  description?: string;
  checklist?: TaskChecklistItem[];
  priority?: TaskPriority;
  assigneeName?: string;
  assigneeUserId?: string;
  dueDate?: string;
  attachments?: TaskAttachment[];
  scope?: "all" | "selected";
  projectIds?: string[];
}) {
  const { data } = await apiClient.post<{ issue: Issue }>(
    endpoints.issues.create,
    payload
  );
  return data.issue;
}

export async function updateIssue(
  issueId: string,
  payload: {
    title?: string;
    description?: string;
    checklist?: TaskChecklistItem[];
    priority?: TaskPriority;
    status?: IssueStatus;
    assigneeName?: string;
    assigneeUserId?: string;
    dueDate?: string;
    attachments?: TaskAttachment[];
  }
) {
  const { data } = await apiClient.patch<{ issue: Issue }>(
    endpoints.issues.update(issueId),
    payload
  );
  return data.issue;
}

export async function updateIssueStatus(issueId: string, status: IssueStatus) {
  const { data } = await apiClient.patch<{ issue: Issue }>(
    endpoints.issues.status(issueId),
    { status }
  );
  return data.issue;
}

export async function deleteIssue(issueId: string) {
  await apiClient.delete(endpoints.issues.delete(issueId));
}

export async function addIssueApplications(
  issueId: string,
  payload: { scope: "all" } | { projectIds: string[] }
) {
  const { data } = await apiClient.post<{ issue: Issue }>(
    endpoints.issues.applications(issueId),
    payload
  );
  return data.issue;
}

export async function updateIssueApplication(
  issueId: string,
  applicationId: string,
  payload: { fixed: boolean }
) {
  const { data } = await apiClient.patch<{ issue: Issue }>(
    endpoints.issues.application(issueId, applicationId),
    payload
  );
  return data.issue;
}

export async function deleteIssueApplication(
  issueId: string,
  applicationId: string
) {
  const { data } = await apiClient.delete<{ issue: Issue }>(
    endpoints.issues.application(issueId, applicationId)
  );
  return data.issue;
}
