export type TaskStatus =
  | "Backlog"
  | "In Progress"
  | "Review"
  | "Blocked"
  | "Done";

export type TaskPriority = "Low" | "Medium" | "High";

export type TaskChecklistItem = {
  id: string;
  title: string;
  completed: boolean;
};

export type TaskAttachment = {
  id: string;
  name: string;
  type: "file" | "link" | "source";
  url?: string;
};

export type Task = {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  checklist?: TaskChecklistItem[];
  attachments?: TaskAttachment[];
  status: TaskStatus;
  assignee: string;
  assigneeUserId?: string;
  priority: TaskPriority;
  startDate?: string;
  dueDate?: string;
  // Client Logs linkage (optional; set when a task belongs to a project stage).
  stageId?: string | null;
  websiteId?: string | null;
  reviewerUserId?: string | null;
  isCritical?: boolean;
  // Task-request approval flow. Staff-created tasks start as "pending" requests.
  requestStatus?: TaskRequestStatus;
  requestedBy?: string | null;
  requestedByName?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
};

export type TaskRequestStatus = "pending" | "approved" | "rejected";

/** All task statuses, in workflow order (used for the status menu + column filter). */
export const STATUSES: TaskStatus[] = [
  "Backlog",
  "In Progress",
  "Review",
  "Blocked",
  "Done",
];

/**
 * The board is grouped by assignee: an "Unassigned" column, then one per team
 * member. The team members are loaded from the API (developers + superadmins),
 * so the only static column is "Unassigned".
 */
export const UNASSIGNED = "Unassigned";
export const ASSIGNEE_COLUMNS = [UNASSIGNED];

/**
 * Builds the ordered list of board columns: "Unassigned" first, then each known
 * assignee (developers + superadmins), then any other assignee that still has
 * tasks (e.g. a member who has since been removed) so their work stays visible.
 */
export function buildAssigneeColumns(
  assigneeNames: string[],
  tasks: Task[]
): string[] {
  const known = new Set(assigneeNames);
  const orphans = tasks
    .map((task) => task.assignee)
    .filter((name): name is string =>
      Boolean(name) && name !== UNASSIGNED && !known.has(name)
    );
  return [UNASSIGNED, ...assigneeNames, ...Array.from(new Set(orphans))];
}

/** Priority → HeroUI Chip color (valid: success | warning | danger | default | accent). */
export const priorityColor: Record<
  TaskPriority,
  "danger" | "warning" | "default"
> = {
  High: "danger",
  Medium: "warning",
  Low: "default",
};

/** Task status → HeroUI Chip color. */
export const statusColor: Record<
  TaskStatus,
  "success" | "warning" | "danger" | "default" | "accent"
> = {
  Backlog: "default",
  "In Progress": "accent",
  Review: "warning",
  Blocked: "danger",
  Done: "success",
};

export const tasks: Task[] = [
  // p1 — Acme Dental
  { id: "t1", projectId: "p1", title: "Set up staging environment", status: "Done", assignee: "Sarah Chen", priority: "Medium" },
  { id: "t2", projectId: "p1", title: "Homepage hero redesign", status: "In Progress", assignee: "Sarah Chen", priority: "High", dueDate: "2026-06-12" },
  { id: "t3", projectId: "p1", title: "Booking form integration", status: "Backlog", assignee: "Mike Ross", priority: "High" },
  { id: "t4", projectId: "p1", title: "SEO meta + sitemap", status: "Backlog", assignee: "Unassigned", priority: "Low" },
  { id: "t5", projectId: "p1", title: "Cookie consent banner", status: "Review", assignee: "Tom Baker", priority: "Medium" },
  { id: "t6", projectId: "p1", title: "Accessibility audit", status: "Backlog", assignee: "Aisha Khan", priority: "Medium" },

  // p2 — Bright Smiles
  { id: "t7", projectId: "p2", title: "Single-page layout", status: "In Progress", assignee: "Mike Ross", priority: "High", dueDate: "2026-06-09" },
  { id: "t8", projectId: "p2", title: "Contact section copy", status: "Backlog", assignee: "Mike Ross", priority: "Medium" },
  { id: "t9", projectId: "p2", title: "Mobile nav polish", status: "Backlog", assignee: "Unassigned", priority: "Low" },

  // p3 — GreenLeaf Clinic
  { id: "t10", projectId: "p3", title: "Wireframes sign-off", status: "Done", assignee: "Aisha Khan", priority: "Medium" },
  { id: "t11", projectId: "p3", title: "Services CMS model", status: "In Progress", assignee: "Aisha Khan", priority: "High" },
  { id: "t12", projectId: "p3", title: "Team page", status: "Backlog", assignee: "Tom Baker", priority: "Low" },
  { id: "t13", projectId: "p3", title: "Appointment API hookup", status: "Backlog", assignee: "Mike Ross", priority: "High", dueDate: "2026-06-20" },

  // p4 — Urban Physio
  { id: "t14", projectId: "p4", title: "Handover docs", status: "Done", assignee: "Tom Baker", priority: "Low" },
  { id: "t15", projectId: "p4", title: "Final QA pass", status: "Review", assignee: "Tom Baker", priority: "Medium" },

  // p6 — PeakFit Studio
  { id: "t16", projectId: "p6", title: "Class schedule widget", status: "In Progress", assignee: "Aisha Khan", priority: "High" },
  { id: "t17", projectId: "p6", title: "Pricing table", status: "Backlog", assignee: "Aisha Khan", priority: "Medium" },
  { id: "t18", projectId: "p6", title: "Newsletter signup", status: "Backlog", assignee: "Unassigned", priority: "Low" },

  // p7 — CityVet
  { id: "t19", projectId: "p7", title: "Emergency banner", status: "Backlog", assignee: "Mike Ross", priority: "High", dueDate: "2026-06-08" },
  { id: "t20", projectId: "p7", title: "Vet profiles", status: "In Progress", assignee: "Mike Ross", priority: "Medium" },
  { id: "t21", projectId: "p7", title: "Map embed", status: "Backlog", assignee: "Unassigned", priority: "Low" },
];

/** Count of tasks per project id. */
export const taskCountByProject: Record<string, number> = tasks.reduce(
  (acc, t) => {
    acc[t.projectId] = (acc[t.projectId] ?? 0) + 1;
    return acc;
  },
  {} as Record<string, number>
);
