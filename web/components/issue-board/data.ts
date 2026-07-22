import type {
  TaskAttachment,
  TaskChecklistItem,
  TaskPriority,
  TaskStatus,
} from "@/components/tasks/data";

export type IssueTarget = "task" | "checklist";

export type IssueStatus = "Open" | "In Progress" | "Fixed";

export const ISSUE_STATUSES: IssueStatus[] = ["Open", "In Progress", "Fixed"];

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
  dueDate?: string;
  attachments?: TaskAttachment[];
  applied: AppliedTarget[];
  createdAt?: string;
  updatedAt?: string;
};
