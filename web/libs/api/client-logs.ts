import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export type StageStatus =
  | "not_started"
  | "upcoming"
  | "in_progress"
  | "awaiting_review"
  | "blocked"
  | "delayed"
  | "completed"
  | "verified"
  | "on_hold";

export type StagePriority = "Low" | "Medium" | "High" | "Critical";
export type RiskLevel = "Low" | "Medium" | "High";

export type StageTaskStats = {
  total: number;
  open: number;
  awaitingReview: number;
  overdue: number;
  criticalOpen: number;
  verified: number;
};

export type ClientLogStage = {
  id: string;
  projectId: string;
  templateId: string | null;
  name: string;
  description: string;
  position: number;
  status: StageStatus;
  storedStatus: string;
  isDelayed: boolean;
  progress: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  estimatedDurationDays: number | null;
  ownerUserId: string | null;
  ownerName: string | null;
  reviewerUserId: string | null;
  reviewerName: string | null;
  priority: StagePriority;
  riskLevel: RiskLevel;
  isRequired: boolean;
  isMilestone: boolean;
  isLaunchBlocker: boolean;
  isOnHold: boolean;
  dependsOn: string[];
  taskStats: StageTaskStats;
  createdAt: string;
  updatedAt: string;
};

export type StageDetail = ClientLogStage & {
  projectName: string | null;
  participants: { userId: string; name: string | null }[];
  approvals: { id: string; type: string; decision: string; approvedByName: string | null; note: string | null; createdAt: string }[];
  evidence: { id: string; type: string; url: string | null; description: string | null; createdAt: string }[];
  history: {
    id: string;
    action: string;
    field: string | null;
    oldValue: string | null;
    newValue: string | null;
    reason: string | null;
    userName: string | null;
    createdAt: string;
  }[];
  tasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
    isCritical: boolean;
    verificationStatus: string;
    assigneeName: string | null;
    dueDate: string | null;
  }[];
};

export type TemplateStage = {
  id: string;
  templateId: string;
  name: string;
  description: string;
  position: number;
  isRequired: boolean;
  isMilestone: boolean;
  isLaunchBlocker: boolean;
  defaultOwnerRole: string | null;
  estimatedDurationDays: number | null;
};

export type ClientLogTemplate = {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  stages: TemplateStage[];
};

export type StageUpdate = Partial<{
  name: string;
  description: string;
  status: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  ownerUserId: string | null;
  reviewerUserId: string | null;
  priority: StagePriority;
  riskLevel: RiskLevel;
  isRequired: boolean;
  isMilestone: boolean;
  isLaunchBlocker: boolean;
  isOnHold: boolean;
  override: boolean;
  reason: string;
}>;

export type AssignableUser = { id: string; name: string; email: string; role: string };

export type LaunchStatus =
  | "not_ready"
  | "at_risk"
  | "almost_ready"
  | "ready"
  | "live"
  | "post_launch_review";

export type LaunchReadiness = {
  projectId: string;
  percentage: number;
  status: LaunchStatus;
  blockers: string[];
  criticalOpen: number;
  awaitingReview: number;
  overdue: number;
};

export type NewStageTask = {
  title: string;
  description?: string;
  priority?: "Low" | "Medium" | "High";
  isCritical?: boolean;
  assigneeUserId?: string | null;
  reviewerUserId?: string | null;
  dueDate?: string | null;
  acceptanceCriteria?: string[];
  affectedUrls?: string[];
};

export async function listClientLogTemplates() {
  const { data } = await apiClient.get<{ templates: ClientLogTemplate[] }>(endpoints.clientLogs.templates);
  return data.templates;
}

// ---- template editing (super-admin) ----
export type TemplateStageInput = {
  name?: string;
  description?: string;
  isRequired?: boolean;
  isMilestone?: boolean;
  isLaunchBlocker?: boolean;
  defaultOwnerRole?: string | null;
};

export async function addTemplateStage(templateId: string, input: TemplateStageInput) {
  const { data } = await apiClient.post<{ template: ClientLogTemplate }>(endpoints.clientLogs.templateStages(templateId), input);
  return data.template;
}

export async function updateTemplateStage(templateId: string, stageId: string, input: TemplateStageInput) {
  const { data } = await apiClient.patch<{ template: ClientLogTemplate }>(endpoints.clientLogs.templateStage(templateId, stageId), input);
  return data.template;
}

export async function removeTemplateStage(templateId: string, stageId: string) {
  const { data } = await apiClient.delete<{ template: ClientLogTemplate }>(endpoints.clientLogs.templateStage(templateId, stageId));
  return data.template;
}

export async function reorderTemplateStages(templateId: string, orderedIds: string[]) {
  const { data } = await apiClient.post<{ template: ClientLogTemplate }>(endpoints.clientLogs.templateReorder(templateId), { orderedIds });
  return data.template;
}

// ---- overview (one row per client) ----
export type ClientLogsStatus =
  | "not_created"
  | "on_track"
  | "at_risk"
  | "delayed"
  | "blocked"
  | "live"
  | "post_launch_review";

export type ClientOverviewRow = {
  projectId: string;
  clientName: string;
  projectType: string;
  projectStatus: string;
  hasTimeline: boolean;
  status: ClientLogsStatus;
  stageCount: number;
  currentStage: string | null;
  currentOwner: string | null;
  progress: number;
  readinessPercentage: number | null;
  readinessStatus: LaunchStatus | null;
  blockerCount: number;
  nextMilestone: { name: string; date: string | null } | null;
  lastUpdated: string | null;
};

export type ClientOverviewSummary = {
  total: number;
  notCreated: number;
  delayed: number;
  blocked: number;
  approachingLaunch: number;
  live: number;
};

export type ClientOverviewResult = {
  clients: ClientOverviewRow[];
  summary: ClientOverviewSummary;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export async function listClientOverview(params?: {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: string;
}) {
  const { data } = await apiClient.get<ClientOverviewResult>(endpoints.clientLogs.overview, { params });
  return data;
}

export async function listProjectStages(projectId: string) {
  const { data } = await apiClient.get<{ stages: ClientLogStage[] }>(endpoints.clientLogs.projectStages(projectId));
  return data.stages;
}

export async function clearClientLogs(projectId: string) {
  await apiClient.delete(endpoints.clientLogs.resetProject(projectId));
}

export async function applyClientLogTemplate(projectId: string, templateId: string) {
  const { data } = await apiClient.post<{ stages: ClientLogStage[] }>(endpoints.clientLogs.applyTemplate(projectId), {
    templateId,
  });
  return data.stages;
}

export async function addStage(
  projectId: string,
  input: { name: string; description?: string; isRequired?: boolean; isMilestone?: boolean; isLaunchBlocker?: boolean },
) {
  const { data } = await apiClient.post<{ stages: ClientLogStage[] }>(endpoints.clientLogs.projectStages(projectId), input);
  return data.stages;
}

export async function reorderStages(projectId: string, orderedIds: string[]) {
  const { data } = await apiClient.post<{ stages: ClientLogStage[] }>(endpoints.clientLogs.stageReorder(projectId), { orderedIds });
  return data.stages;
}

export async function removeStage(stageId: string) {
  const { data } = await apiClient.delete<{ stages: ClientLogStage[] }>(endpoints.clientLogs.stage(stageId));
  return data.stages;
}

export async function getStageDetail(stageId: string) {
  const { data } = await apiClient.get<{ stage: StageDetail }>(endpoints.clientLogs.stage(stageId));
  return data.stage;
}

export async function updateStage(stageId: string, update: StageUpdate) {
  const { data } = await apiClient.patch<{ stage: StageDetail }>(endpoints.clientLogs.stage(stageId), update);
  return data.stage;
}

export async function listAssignableUsers() {
  const { data } = await apiClient.get<{ users: AssignableUser[] }>(endpoints.clientLogs.assignableUsers);
  return data.users;
}

export async function getLaunchReadiness(projectId: string) {
  const { data } = await apiClient.get<{ readiness: LaunchReadiness }>(endpoints.clientLogs.launchReadiness(projectId));
  return data.readiness;
}

export async function createStageTask(stageId: string, task: NewStageTask) {
  const { data } = await apiClient.post<{ stage: StageDetail }>(endpoints.clientLogs.stageTasks(stageId), task);
  return data.stage;
}

export async function linkStageTask(stageId: string, taskId: string) {
  const { data } = await apiClient.post<{ stage: StageDetail }>(endpoints.clientLogs.stageTaskLink(stageId), { taskId });
  return data.stage;
}

// ---- meetings & actions ----
export type MeetingAction = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  risk: string | null;
  affectedAreas: string[];
  acceptanceCriteria: string[];
  suggestedOwnerId: string | null;
  suggestedReviewerId: string | null;
  dueDate: string | null;
  sourceTimestamp: string | null;
  confirmationStatus: "awaiting_confirmation" | "confirmed" | "rejected";
  taskId: string | null;
};
export type Meeting = {
  id: string;
  projectId: string;
  stageId: string | null;
  title: string;
  meetingDate: string | null;
  participants: string[];
  fathomUrl: string | null;
  recordingUrl: string | null;
  transcriptUrl: string | null;
  summary: string | null;
  status: "pending" | "confirmed";
  createdAt: string;
  actions: MeetingAction[];
};

export async function listMeetings(projectId: string, stageId?: string) {
  const { data } = await apiClient.get<{ meetings: Meeting[] }>(endpoints.clientLogs.projectMeetings(projectId), {
    params: stageId ? { stageId } : undefined,
  });
  return data.meetings;
}
/** Manually log a meeting (e.g. paste a Fathom link). Reuses the import surface with no AI actions. */
export async function addMeeting(input: {
  projectId: string;
  stageId?: string;
  title: string;
  fathomUrl?: string;
  meetingDate?: string;
  summary?: string;
}) {
  const { data } = await apiClient.post<{ meeting: Meeting }>(endpoints.clientLogs.meetingsImport, {
    projectId: input.projectId,
    stageId: input.stageId,
    meeting: {
      title: input.title,
      fathomUrl: input.fathomUrl || null,
      meetingDate: input.meetingDate || null,
      summary: input.summary || null,
    },
    actions: [],
  });
  return data.meeting;
}
export async function confirmMeetingAction(actionId: string, input?: { assigneeUserId?: string }) {
  const { data } = await apiClient.post<{ meeting: Meeting }>(endpoints.clientLogs.meetingActionConfirm(actionId), input ?? {});
  return data.meeting;
}
export async function rejectMeetingAction(actionId: string) {
  const { data } = await apiClient.post<{ meeting: Meeting }>(endpoints.clientLogs.meetingActionReject(actionId), {});
  return data.meeting;
}
