import {
  STATUSES,
  type TaskAttachment,
  type TaskChecklistItem,
  type TaskPriority,
  type TaskStatus,
} from "@/components/tasks/data";

export type IssueTarget = "task" | "checklist";

// An issue is a task that spans clients, so it shares the task status set.
export type IssueStatus = TaskStatus;

export const ISSUE_STATUSES: IssueStatus[] = STATUSES;

export type AppliedTarget = {
  id?: string;
  projectId: string;
  projectName?: string;
  as: IssueTarget;
  /** The real board task this application created (if any). */
  taskId?: string;
  taskStatus?: TaskStatus;
  fixed: boolean;
  fixedAt?: string | null;
};

export type Issue = {
  id: string;
  title: string;
  description?: string;
  checklist?: TaskChecklistItem[];
  priority: TaskPriority;
  status: IssueStatus;
  assignee?: string;
  assigneeUserId?: string;
  startDate?: string;
  dueDate?: string;
  attachments?: TaskAttachment[];
  applied: AppliedTarget[];
  createdAt?: string;
  updatedAt?: string;
};
