import type {
  Task,
  TaskAttachment,
  TaskRequestStatus,
  TaskStatus,
} from "@/components/tasks/data";

import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export type TaskPayload = Omit<Task, "id">;

export type TaskComment = {
  id: string;
  taskId: string;
  parentId: string | null;
  body: string;
  mentions: string[];
  author: { id: string | null; name: string; avatarUrl: string | null };
  createdAt: string;
  updatedAt: string;
  replies: TaskComment[];
};

export async function listTaskComments(taskId: string) {
  const { data } = await apiClient.get<{ comments: TaskComment[] }>(
    endpoints.tasks.comments(taskId)
  );
  return data.comments;
}

export async function createTaskComment(
  taskId: string,
  payload: { body: string; parentId?: string }
) {
  const { data } = await apiClient.post<{ comment: TaskComment }>(
    endpoints.tasks.comments(taskId),
    payload
  );
  return data.comment;
}

export async function deleteTaskComment(taskId: string, commentId: string) {
  await apiClient.delete(endpoints.tasks.comment(taskId, commentId));
}

export async function uploadTaskAttachment(file: File) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post<{ attachment: TaskAttachment }>(
    endpoints.tasks.uploads,
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data.attachment;
}

export type TaskAssignee = {
  id: string;
  name: string;
  email: string;
  role: "superadmin" | "developer" | "staff";
  avatarUrl: string | null;
};

export async function listAssignees() {
  const { data } = await apiClient.get<{ assignees: TaskAssignee[] }>(
    endpoints.tasks.assignees
  );
  return data.assignees;
}

export async function getTask(taskId: string) {
  const { data } = await apiClient.get<{ task: Task }>(
    endpoints.tasks.detail(taskId)
  );
  return data.task;
}

export async function listTasks(filters?: {
  projectId?: string;
  status?: TaskStatus;
  assignee?: string;
  requestStatus?: TaskRequestStatus;
  requests?: boolean;
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
