import type { Task, TaskStatus } from "@/components/tasks/data";

import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export type TaskPayload = Omit<Task, "id">;

export type TaskAssignee = {
  id: string;
  name: string;
  email: string;
  role: "superadmin" | "developer";
  avatarUrl: string | null;
};

export async function listAssignees() {
  const { data } = await apiClient.get<{ assignees: TaskAssignee[] }>(
    endpoints.tasks.assignees
  );
  return data.assignees;
}

export async function listTasks(filters?: {
  projectId?: string;
  status?: TaskStatus;
  assignee?: string;
}) {
  const { data } = await apiClient.get<{ tasks: Task[] }>(
    endpoints.tasks.list,
    { params: filters }
  );
  return data.tasks;
}

export async function listMyTasks(filters?: { projectId?: string }) {
  const { data } = await apiClient.get<{ tasks: Task[] }>(endpoints.tasks.my, {
    params: filters,
  });
  return data.tasks;
}

export async function createTask(payload: TaskPayload) {
  const { data } = await apiClient.post<{ task: Task }>(
    endpoints.tasks.create,
    payload
  );
  return data.task;
}

export async function updateTask(taskId: string, payload: TaskPayload) {
  const { data } = await apiClient.patch<{ task: Task }>(
    endpoints.tasks.update(taskId),
    payload
  );
  return data.task;
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const { data } = await apiClient.patch<{ task: Task }>(
    endpoints.tasks.status(taskId),
    { status }
  );
  return data.task;
}

export async function moveTasks(
  items: Array<{
    id: string;
    status?: TaskStatus;
    assignee?: string;
    sortOrder?: number;
  }>
) {
  const { data } = await apiClient.patch<{ tasks: Task[] }>(
    endpoints.tasks.move,
    { items }
  );
  return data.tasks;
}

export async function deleteTask(taskId: string) {
  await apiClient.delete(endpoints.tasks.delete(taskId));
}
