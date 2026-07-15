"use client";

import {
  Button,
  Chip,
  Drawer,
  DrawerBackdrop,
  DrawerBody,
  DrawerContent,
  DrawerDialog,
  DrawerHeader,
  DrawerHeading,
  Input,
  TextField,
  useOverlayState,
} from "@heroui/react";
import { useEffect, useState } from "react";

import {
  CreateTaskModal,
  type NewTaskInput,
  type TaskAssigneeOption,
} from "@/components/tasks/create-task-modal";
import {
  getStageDetail,
  listAssignableUsers,
  updateStage,
  type AssignableUser,
  type StageDetail,
  type StageUpdate,
} from "@/libs/api/client-logs";
import { createTask, listAssignees } from "@/libs/api/tasks";
import { notify } from "@/libs/notify";

import { StageMeetings } from "./stage-meetings";
import { formatDate, statusMeta } from "./status";
import { CheckboxField, DateInput, SelectField } from "./ui-fields";

const STATUS_OPTIONS = [
  "not_started",
  "in_progress",
  "awaiting_review",
  "blocked",
  "completed",
  "verified",
  "on_hold",
];
const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Critical"];
const RISK_OPTIONS = ["Low", "Medium", "High"];

function dateInput(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export function StageDrawer({
  stageId,
  state,
  canEdit,
  canManage = false,
  onDelete,
  onSaved,
}: {
  stageId: string | null;
  state: ReturnType<typeof useOverlayState>;
  canEdit: boolean;
  canManage?: boolean;
  onDelete?: (stageId: string) => void;
  onSaved?: () => void;
}) {
  const [stage, setStage] = useState<StageDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<StageUpdate>({});
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [taskAssignees, setTaskAssignees] = useState<TaskAssigneeOption[]>([]);
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const createTaskState = useOverlayState();

  useEffect(() => {
    if (!state.isOpen) return;
    listAssignableUsers().then(setUsers).catch(() => setUsers([]));
    listAssignees()
      .then((list) => setTaskAssignees(list.map((a) => ({ id: a.id, name: a.name }))))
      .catch(() => setTaskAssignees([]));
  }, [state.isOpen]);

  useEffect(() => {
    if (!state.isOpen || !stageId) return;
    let active = true;
    setLoading(true);
    setStage(null);
    setOverride(false);
    setReason("");
    setConfirmDelete(false);
    getStageDetail(stageId)
      .then((detail) => {
        if (!active) return;
        setStage(detail);
        setForm({
          status: detail.storedStatus,
          plannedStart: dateInput(detail.plannedStart) || null,
          plannedEnd: dateInput(detail.plannedEnd) || null,
          actualStart: dateInput(detail.actualStart) || null,
          actualEnd: dateInput(detail.actualEnd) || null,
          ownerUserId: detail.ownerUserId,
          reviewerUserId: detail.reviewerUserId,
          priority: detail.priority,
          riskLevel: detail.riskLevel,
          isOnHold: detail.isOnHold,
          isLaunchBlocker: detail.isLaunchBlocker,
        });
      })
      .catch((error) => {
        notify.error("Unable to load stage", {
          description: error instanceof Error ? error.message : "Please try again.",
        });
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [state.isOpen, stageId]);

  const set = <K extends keyof StageUpdate>(key: K, value: StageUpdate[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!stageId) return;
    setSaving(true);
    try {
      const verifying = form.status === "verified";
      const updated = await updateStage(stageId, {
        ...form,
        plannedStart: form.plannedStart || null,
        plannedEnd: form.plannedEnd || null,
        actualStart: form.actualStart || null,
        actualEnd: form.actualEnd || null,
        ...(verifying && override ? { override: true, reason: reason || undefined } : {}),
      });
      setStage(updated);
      notify.success("Stage updated");
      onSaved?.();
    } catch (error) {
      notify.error("Unable to update stage", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Reuse the real Tasks create modal; inject the stage tag so the task is an
  // ordinary board task linked to this stage.
  const onCreateTask = async (input: NewTaskInput) => {
    if (!stage) return;
    await createTask({ ...input, stageId: stage.id });
    if (stageId) setStage(await getStageDetail(stageId));
    notify.success("Task created");
    onSaved?.();
  };

  const meta = stage ? statusMeta(stage.status) : null;

  return (
    <>
    <Drawer isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <DrawerBackdrop variant="blur">
        <DrawerContent placement="right">
          <DrawerDialog className="w-full max-w-[560px]">
            <DrawerHeader>
              <DrawerHeading>{stage?.name ?? "Stage"}</DrawerHeading>
            </DrawerHeader>
            <DrawerBody className="space-y-5 overflow-y-auto bg-slate-50">
            {loading && <p className="text-sm text-slate-500">Loading stage…</p>}
            {!loading && !stage && <p className="text-sm text-slate-500">Stage details could not be loaded.</p>}
            {stage && meta && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip size="sm" variant="soft" color={meta.color}>
                    <span aria-hidden className="mr-1">{meta.mark}</span>
                    {meta.label}
                  </Chip>
                  {stage.isMilestone && <Chip size="sm" variant="soft" color="accent">Milestone</Chip>}
                  {stage.isLaunchBlocker && <Chip size="sm" variant="soft" color="danger">Launch blocker</Chip>}
                  {!stage.isRequired && <Chip size="sm" variant="soft" color="default">Optional</Chip>}
                </div>

                {stage.description && <p className="text-sm text-slate-600">{stage.description}</p>}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Meta label="Owner" value={stage.ownerName ?? "Unassigned"} />
                  <Meta label="Reviewer" value={stage.reviewerName ?? "—"} />
                  <Meta label="Planned start" value={formatDate(stage.plannedStart)} />
                  <Meta label="Planned end" value={formatDate(stage.plannedEnd)} />
                  <Meta label="Actual start" value={formatDate(stage.actualStart)} />
                  <Meta label="Actual end" value={formatDate(stage.actualEnd)} />
                </div>

                {/* Progress (derived from task completion) */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-950">Progress</h3>
                    <span className="text-xs tabular-nums text-slate-500">{stage.progress}%</span>
                  </div>
                  <span
                    className="block h-2 overflow-hidden rounded-full bg-slate-200"
                    title="Derived from completed tasks — 100% when the stage is completed or verified"
                  >
                    <span className="block h-full rounded-full bg-blue-600" style={{ width: `${stage.progress}%` }} />
                  </span>
                </div>

                {/* Task stats */}
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-950">Tasks</h3>
                  <div className="mb-2 flex flex-wrap gap-2 text-xs">
                    <Stat label="Total" value={stage.taskStats.total} />
                    <Stat label="Open" value={stage.taskStats.open} tone={stage.taskStats.open ? "amber" : "slate"} />
                    <Stat label="Awaiting review" value={stage.taskStats.awaitingReview} tone={stage.taskStats.awaitingReview ? "amber" : "slate"} />
                    <Stat label="Overdue" value={stage.taskStats.overdue} tone={stage.taskStats.overdue ? "rose" : "slate"} />
                    <Stat label="Critical open" value={stage.taskStats.criticalOpen} tone={stage.taskStats.criticalOpen ? "rose" : "slate"} />
                    <Stat label="Verified" value={stage.taskStats.verified} tone="emerald" />
                  </div>
                  {stage.tasks.length ? (
                    <ul className="space-y-1">
                      {stage.tasks.map((task) => (
                        <li key={task.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                          <span className="truncate">{task.title}</span>
                          <span className="flex items-center gap-2 text-xs text-slate-500">
                            {task.isCritical && <Chip size="sm" variant="soft" color="danger">Critical</Chip>}
                            <span>{task.status}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-md border border-dashed border-slate-200 p-3 text-sm text-slate-400">
                      No tasks linked to this stage yet.
                    </p>
                  )}
                  {canEdit && (
                    <div className="mt-2">
                      <Button size="sm" variant="secondary" onPress={createTaskState.open}>
                        Add task
                      </Button>
                    </div>
                  )}
                </div>

                {/* Edit */}
                {canEdit && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <h3 className="mb-3 text-sm font-semibold text-slate-950">Update stage</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <Labeled label="Status">
                          <SelectField
                            ariaLabel="Status"
                            value={form.status ?? ""}
                            onChange={(value) => set("status", value)}
                            options={STATUS_OPTIONS.map((option) => ({ value: option, label: statusMeta(option as never).label }))}
                          />
                        </Labeled>
                      </div>
                      <Labeled label="Planned start">
                        <DateInput ariaLabel="Planned start" value={form.plannedStart} onChange={(value) => set("plannedStart", value || null)} />
                      </Labeled>
                      <Labeled label="Planned end">
                        <DateInput ariaLabel="Planned end" value={form.plannedEnd} onChange={(value) => set("plannedEnd", value || null)} />
                      </Labeled>
                      <Labeled label="Actual start">
                        <DateInput ariaLabel="Actual start" value={form.actualStart} onChange={(value) => set("actualStart", value || null)} />
                      </Labeled>
                      <Labeled label="Actual end">
                        <DateInput ariaLabel="Actual end" value={form.actualEnd} onChange={(value) => set("actualEnd", value || null)} />
                      </Labeled>
                      <Labeled label="Priority">
                        <SelectField
                          ariaLabel="Priority"
                          value={form.priority ?? "Medium"}
                          onChange={(value) => set("priority", value as never)}
                          options={PRIORITY_OPTIONS.map((option) => ({ value: option, label: option }))}
                        />
                      </Labeled>
                      <Labeled label="Risk level">
                        <SelectField
                          ariaLabel="Risk level"
                          value={form.riskLevel ?? "Low"}
                          onChange={(value) => set("riskLevel", value as never)}
                          options={RISK_OPTIONS.map((option) => ({ value: option, label: option }))}
                        />
                      </Labeled>
                      <Labeled label="Owner">
                        <SelectField
                          ariaLabel="Owner"
                          value={form.ownerUserId ?? ""}
                          onChange={(value) => set("ownerUserId", value || null)}
                          placeholder="Unassigned"
                          options={[{ value: "", label: "Unassigned" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
                        />
                      </Labeled>
                      <Labeled label="Reviewer">
                        <SelectField
                          ariaLabel="Reviewer"
                          value={form.reviewerUserId ?? ""}
                          onChange={(value) => set("reviewerUserId", value || null)}
                          placeholder="None"
                          options={[{ value: "", label: "None" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
                        />
                      </Labeled>
                    </div>
                    <div className="mt-3">
                      <CheckboxField isSelected={!!form.isOnHold} onChange={(value) => set("isOnHold", value)}>
                        On hold (excludes the stage from delayed detection)
                      </CheckboxField>
                    </div>
                    {form.status === "verified" && (
                      <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2">
                        <CheckboxField isSelected={override} onChange={setOverride} className="text-amber-800">
                          Override completion requirements
                        </CheckboxField>
                        {override && (
                          <TextField aria-label="Override reason" value={reason} onChange={setReason} className="mt-2">
                            <Input placeholder="Reason for override (recorded in the audit history)" />
                          </TextField>
                        )}
                      </div>
                    )}
                    <div className="mt-3 flex justify-end">
                      <Button size="sm" variant="primary" isDisabled={saving} onPress={() => void save()}>
                        {saving ? "Saving…" : "Save changes"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Meetings */}
                <StageMeetings projectId={stage.projectId} stageId={stage.id} canEdit={canEdit} />

                {/* History */}
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-950">Activity</h3>
                  {stage.history.length ? (
                    <ul className="space-y-1.5">
                      {stage.history.slice(0, 20).map((entry) => (
                        <li key={entry.id} className="text-xs text-slate-500">
                          <span className="font-medium text-slate-700">{entry.userName ?? "System"}</span>{" "}
                          {entry.action.replace(/_/g, " ")}
                          {entry.field ? ` — ${entry.field}: ${entry.oldValue ?? "—"} → ${entry.newValue ?? "—"}` : ""}
                          <span className="ml-1 text-slate-400">{formatDate(entry.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-400">No activity recorded yet.</p>
                  )}
                </div>

                {/* Remove stage (managers) */}
                {canManage && onDelete && stageId && (
                  <div className="border-t border-slate-100 pt-3">
                    {confirmDelete ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-rose-700">Remove this stage? Linked tasks stay on the board.</span>
                        <Button size="sm" variant="primary" className="bg-rose-600" onPress={() => onDelete(stageId)}>Confirm remove</Button>
                        <Button size="sm" variant="tertiary" onPress={() => setConfirmDelete(false)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="tertiary" className="text-rose-600" onPress={() => setConfirmDelete(true)}>Remove stage</Button>
                    )}
                  </div>
                )}
              </>
            )}
            </DrawerBody>
          </DrawerDialog>
        </DrawerContent>
      </DrawerBackdrop>
    </Drawer>
    {stage && (
      <CreateTaskModal
        key={stage.id}
        state={createTaskState}
        projectOptions={stage.projectId ? [{ id: stage.projectId, label: stage.projectName ?? "Client" }] : []}
        assigneeOptions={taskAssignees}
        defaultProjectId={stage.projectId ?? ""}
        onCreate={onCreateTask}
      />
    )}
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-slate-800">{value}</p>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "amber" | "rose" | "emerald" }) {
  const tones = {
    slate: "text-slate-600",
    amber: "text-amber-600",
    rose: "text-rose-600",
    emerald: "text-emerald-600",
  } as const;
  return (
    <span className="rounded-md border border-slate-200 px-2 py-1">
      <span className="text-slate-400">{label}:</span> <span className={`font-semibold ${tones[tone]}`}>{value}</span>
    </span>
  );
}
