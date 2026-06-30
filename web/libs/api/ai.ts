import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export type OrganizedTaskDraft = {
  title: string;
  description: string;
  checklist: Array<{ title: string; completed: boolean }>;
  attachments: Array<{ name: string; type: "file" | "link"; url?: string | null }>;
  priority: "Low" | "Medium" | "High";
  status: "Backlog" | "To Do" | "In Progress" | "Review" | "Blocked" | "Done";
  confidence?: "low" | "medium" | "high";
  needsReview?: boolean;
};

export async function organizeTaskWithAi(input: {
  sourceText: string;
  projectId?: string;
}) {
  const { data } = await apiClient.post<{ draft: OrganizedTaskDraft }>(
    endpoints.ai.organizeTask,
    { sourceText: input.sourceText, projectId: input.projectId },
    { timeout: 130000 }
  );
  return data.draft;
}
