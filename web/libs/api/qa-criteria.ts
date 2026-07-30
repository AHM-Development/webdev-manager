import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export type QaCriteriaItem = { id: string; text: string };
export type QaCriteriaGroup = { id: string; name: string; items: QaCriteriaItem[] };
export type QaCriteriaConfig = {
  groups: QaCriteriaGroup[];
  prompt: string;
  template: { url: string; name: string } | null;
};

export async function getQaCriteria() {
  const { data } = await apiClient.get<QaCriteriaConfig>(endpoints.qaCriteria.base);
  return data;
}

export async function createQaGroup(name: string) {
  const { data } = await apiClient.post<QaCriteriaConfig>(endpoints.qaCriteria.groups, { name });
  return data;
}

export async function renameQaGroup(groupId: string, name: string) {
  const { data } = await apiClient.patch<QaCriteriaConfig>(
    endpoints.qaCriteria.group(groupId),
    { name }
  );
  return data;
}

export async function deleteQaGroup(groupId: string) {
  const { data } = await apiClient.delete<QaCriteriaConfig>(endpoints.qaCriteria.group(groupId));
  return data;
}

export async function addQaItem(groupId: string, text: string) {
  const { data } = await apiClient.post<QaCriteriaConfig>(
    endpoints.qaCriteria.groupItems(groupId),
    { text }
  );
  return data;
}

export async function updateQaItem(itemId: string, text: string) {
  const { data } = await apiClient.patch<QaCriteriaConfig>(
    endpoints.qaCriteria.item(itemId),
    { text }
  );
  return data;
}

export async function deleteQaItem(itemId: string) {
  const { data } = await apiClient.delete<QaCriteriaConfig>(endpoints.qaCriteria.item(itemId));
  return data;
}

export async function saveQaPrompt(prompt: string) {
  const { data } = await apiClient.put<QaCriteriaConfig>(endpoints.qaCriteria.prompt, { prompt });
  return data;
}

export async function uploadQaTemplate(file: File) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post<QaCriteriaConfig>(endpoints.qaCriteria.template, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
