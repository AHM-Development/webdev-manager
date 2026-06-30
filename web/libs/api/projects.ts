import type { Project, ProjectPriority } from "@/components/projects/data";

import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export type ProjectPayload = {
  clientName: string;
  type: Project["type"];
  assigneeName: string;
  status: Project["status"];
  priority: Project["priority"];
  websites: NonNullable<Project["websites"]>;
  figmaLink?: string;
  domainManagement: Project["domainManagement"];
  serverLocation: Project["serverLocation"];
};

export async function listProjects() {
  const { data } = await apiClient.get<{ projects: Project[] }>(
    endpoints.projects.list
  );
  return data.projects;
}

export type ProjectOptions = {
  types: string[];
  statuses: string[];
  priorities: string[];
  domainManagement: string[];
  serverLocations: string[];
  assignees: string[];
};

export async function getProjectOptions() {
  const { data } = await apiClient.get<ProjectOptions>(
    endpoints.projects.options
  );
  return data;
}

export async function createProject(payload: ProjectPayload) {
  const { data } = await apiClient.post<{ project: Project }>(
    endpoints.projects.create,
    payload
  );
  return data.project;
}

export async function updateProject(projectId: string, payload: ProjectPayload) {
  const { data } = await apiClient.patch<{ project: Project }>(
    endpoints.projects.update(projectId),
    payload
  );
  return data.project;
}

export async function updateProjectPriority(
  projectId: string,
  priority: ProjectPriority
) {
  const { data } = await apiClient.patch<{ project: Project }>(
    endpoints.projects.priority(projectId),
    { priority }
  );
  return data.project;
}

export async function deleteProject(projectId: string) {
  await apiClient.delete(endpoints.projects.delete(projectId));
}

export async function importProjects(payload: {
  headers: string[];
  rows: Record<string, string>[];
  mapping: Record<string, string>;
}) {
  const { data } = await apiClient.post<{
    imported: Project[];
    errors: { row: number; message: string }[];
  }>(endpoints.projects.import, payload);
  return data;
}

export async function previewProjectImport(
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
    }>(endpoints.projects.importPreview, form, {
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
  }>(endpoints.projects.importPreview, payload);
  return data;
}
