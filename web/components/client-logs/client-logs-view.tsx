"use client";

import {
  Button,
  Chip,
  Input,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  TextField,
  useOverlayState,
} from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  addStage,
  applyClientLogTemplate,
  clearClientLogs,
  getLaunchReadiness,
  listClientLogTemplates,
  listClientOverview,
  listProjectStages,
  removeStage,
  reorderStages,
  type ClientLogStage,
  type ClientLogTemplate,
  type ClientOverviewResult,
  type LaunchReadiness,
  type LaunchStatus,
  type StageStatus,
} from "@/libs/api/client-logs";
import { useAuth } from "@/libs/hooks/useAuth";
import { notify } from "@/libs/notify";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { ClientOverviewTable } from "./client-overview-table";
import { GanttChart, type GanttScale } from "./gantt-chart";
import { StageDrawer } from "./stage-drawer";
import { formatDate, statusMeta } from "./status";
import { CheckboxField, SelectField } from "./ui-fields";

const SCALES: GanttScale[] = ["day", "week", "month"];
const STATUS_FILTERS: (StageStatus | "all")[] = [
  "all",
  "not_started",
  "upcoming",
  "in_progress",
  "awaiting_review",
  "blocked",
  "delayed",
  "completed",
  "verified",
  "on_hold",
];

const LAUNCH_META: Record<LaunchStatus, { label: string; color: "success" | "warning" | "danger" | "accent" | "default"; bar: string }> = {
  not_ready: { label: "Not ready", color: "danger", bar: "bg-rose-500" },
  at_risk: { label: "At risk", color: "danger", bar: "bg-rose-500" },
  almost_ready: { label: "Almost ready", color: "warning", bar: "bg-amber-500" },
  ready: { label: "Ready for launch", color: "success", bar: "bg-emerald-500" },
  live: { label: "Live", color: "success", bar: "bg-emerald-600" },
  post_launch_review: { label: "Post-launch review", color: "accent", bar: "bg-blue-500" },
};

function LaunchReadinessPanel({ readiness }: { readiness: LaunchReadiness }) {
  const meta = LAUNCH_META[readiness.status] ?? LAUNCH_META.not_ready;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-950">Launch readiness</span>
          <Chip size="sm" variant="soft" color={meta.color}>{meta.label}</Chip>
        </div>
        <span className="text-lg font-semibold tabular-nums text-slate-900">{readiness.percentage}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${readiness.percentage}%` }} />
      </div>
      {readiness.blockers.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Blocked by</p>
          <ul className="mt-1 space-y-1">
            {readiness.blockers.map((blocker, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-slate-700">
                <span aria-hidden className="mt-0.5 text-rose-500">•</span>
                {blocker}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-sm text-emerald-600">No outstanding launch blockers.</p>
      )}
    </div>
  );
}

export function ClientLogsView() {
  const { user } = useAuth();
  const role = user?.role;
  // Structural management (apply template, add/reorder/remove stages) is superadmin-only.
  const canManage = role === "superadmin";
  // Editing stages/tasks/meetings is open to developers and staff too.
  const canEdit = canManage || role === "developer" || role === "staff";
  const isSuperAdmin = role === "superadmin";

  const [templates, setTemplates] = useState<ClientLogTemplate[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [clientName, setClientName] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [stages, setStages] = useState<ClientLogStage[]>([]);
  const [readiness, setReadiness] = useState<LaunchReadiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [scale, setScale] = useState<GanttScale>("week");
  const [view, setView] = useState<"gantt" | "list">("gantt");
  const [statusFilter, setStatusFilter] = useState<StageStatus | "all">("all");
  const [search, setSearch] = useState("");

  // Overview (client list) state.
  const [overview, setOverview] = useState<ClientOverviewResult | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewPage, setOverviewPage] = useState(1);
  const [overviewSearch, setOverviewSearch] = useState("");
  const [overviewStatus, setOverviewStatus] = useState("all");

  const drawer = useOverlayState();
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const confirmClearState = useOverlayState();
  const [clearTarget, setClearTarget] = useState<{ projectId: string; clientName: string } | null>(null);
  const [showAddStage, setShowAddStage] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [newStageMilestone, setNewStageMilestone] = useState(false);
  const [addingStage, setAddingStage] = useState(false);

  useEffect(() => {
    listClientLogTemplates()
      .then((data) => {
        setTemplates(data);
        const preferred = data.find((template) => template.isDefault) ?? data[0];
        if (preferred) setTemplateId(preferred.id);
      })
      .catch(() => setTemplates([]));
  }, []);

  const loadOverview = useCallback(() => {
    setOverviewLoading(true);
    listClientOverview({ page: overviewPage, pageSize: 12, q: overviewSearch, status: overviewStatus })
      .then(setOverview)
      .catch(() => setOverview(null))
      .finally(() => setOverviewLoading(false));
  }, [overviewPage, overviewSearch, overviewStatus]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const loadStages = useCallback((id: string) => {
    if (!id) {
      setStages([]);
      setReadiness(null);
      return;
    }
    setLoading(true);
    listProjectStages(id)
      .then((data) => {
        setStages(data);
        if (data.length) {
          getLaunchReadiness(id).then(setReadiness).catch(() => setReadiness(null));
        } else {
          setReadiness(null);
        }
      })
      .catch((error) => {
        notify.error("Unable to load stages", {
          description: error instanceof Error ? error.message : "Please try again.",
        });
        setStages([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadStages(projectId);
  }, [projectId, loadStages]);

  const apply = async () => {
    if (!projectId || !templateId) return;
    setApplying(true);
    try {
      const created = await applyClientLogTemplate(projectId, templateId);
      setStages(created);
      notify.success("Template applied", { description: `${created.length} stages created.` });
    } catch (error) {
      notify.error("Unable to apply template", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setApplying(false);
    }
  };

  const openStage = (id: string) => {
    setActiveStageId(id);
    drawer.open();
  };

  const openClient = (id: string) => {
    const row = overview?.clients.find((client) => client.projectId === id);
    setClientName(row?.clientName ?? "");
    setProjectId(id);
  };

  const handleSetup = async (id: string) => {
    if (!templateId) {
      notify.error("No template available", { description: "Define the base template in Settings first." });
      return;
    }
    try {
      await applyClientLogTemplate(id, templateId);
      notify.success("Client Logs set up", { description: "The base template was duplicated to this client." });
      openClient(id);
    } catch (error) {
      notify.error("Unable to set up", { description: error instanceof Error ? error.message : "Please try again." });
    }
  };

  const backToList = () => {
    setProjectId("");
    setStages([]);
    setReadiness(null);
    loadOverview();
  };

  const handleAddStage = async () => {
    if (!projectId || !newStageName.trim()) return;
    setAddingStage(true);
    try {
      const updated = await addStage(projectId, { name: newStageName.trim(), isMilestone: newStageMilestone });
      setStages(updated);
      setNewStageName("");
      setNewStageMilestone(false);
      setShowAddStage(false);
    } catch (error) {
      notify.error("Unable to add stage", { description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setAddingStage(false);
    }
  };

  const handleMoveStage = async (stageId: string, direction: "up" | "down") => {
    const index = stages.findIndex((stage) => stage.id === stageId);
    const swap = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swap < 0 || swap >= stages.length) return;
    const reordered = [...stages];
    [reordered[index], reordered[swap]] = [reordered[swap], reordered[index]];
    setStages(reordered); // optimistic
    try {
      setStages(await reorderStages(projectId, reordered.map((stage) => stage.id)));
    } catch (error) {
      loadStages(projectId);
      notify.error("Unable to reorder", { description: error instanceof Error ? error.message : "Please try again." });
    }
  };

  const handleDeleteStage = async (stageId: string) => {
    try {
      setStages(await removeStage(stageId));
      drawer.close();
      notify.success("Stage removed");
    } catch (error) {
      notify.error("Unable to remove stage", { description: error instanceof Error ? error.message : "Please try again." });
    }
  };

  const requestClear = (id: string, name: string) => {
    setClearTarget({ projectId: id, clientName: name });
    confirmClearState.open();
  };

  const confirmClear = async () => {
    if (!clearTarget) return;
    try {
      await clearClientLogs(clearTarget.projectId);
      notify.success("Client Logs cleared", { description: `${clearTarget.clientName}'s timeline was reset.` });
      loadOverview();
    } catch (error) {
      notify.error("Unable to clear", { description: error instanceof Error ? error.message : "Please try again." });
      throw error;
    }
  };

  const filtered = useMemo(() => {
    return stages.filter((stage) => {
      if (statusFilter !== "all" && stage.status !== statusFilter) return false;
      if (search && !stage.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [stages, statusFilter, search]);

  const summary = useMemo(() => {
    const delayed = stages.filter((stage) => stage.status === "delayed").length;
    const blocked = stages.filter((stage) => stage.status === "blocked").length;
    const active = stages.filter((stage) => stage.status === "in_progress" || stage.status === "awaiting_review").length;
    const done = stages.filter((stage) => stage.status === "completed" || stage.status === "verified").length;
    return { delayed, blocked, active, done, total: stages.length };
  }, [stages]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          {projectId ? (
            <>
              <button type="button" onClick={backToList} className="mb-1 text-sm text-slate-500 hover:text-slate-900">← All clients</button>
              <h1 className="text-2xl font-semibold text-slate-950">{clientName || "Client"}</h1>
              <p className="mt-1 text-sm text-slate-600">Client Logs timeline</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-slate-950">Client Logs</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                The major stages of each client&apos;s website project — current stage, delays, ownership, and launch readiness.
              </p>
            </>
          )}
        </div>
        {projectId && stages.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Chip size="sm" variant="soft" color="default">{summary.total} stages</Chip>
            <Chip size="sm" variant="soft" color="accent">{summary.active} active</Chip>
            {summary.delayed > 0 && <Chip size="sm" variant="soft" color="danger">{summary.delayed} delayed</Chip>}
            {summary.blocked > 0 && <Chip size="sm" variant="soft" color="danger">{summary.blocked} blocked</Chip>}
            <Chip size="sm" variant="soft" color="success">{summary.done} complete</Chip>
          </div>
        )}
      </div>

      {!projectId && (
        <ClientOverviewTable
          data={overview}
          loading={overviewLoading}
          search={overviewSearch}
          onSearchChange={(value) => { setOverviewPage(1); setOverviewSearch(value); }}
          statusFilter={overviewStatus}
          onStatusFilterChange={(value) => { setOverviewPage(1); setOverviewStatus(value); }}
          page={overviewPage}
          onPageChange={setOverviewPage}
          onOpen={openClient}
          onSetup={handleSetup}
          canClear={isSuperAdmin}
          onClear={requestClear}
        />
      )}

      {projectId && loading && (
        <div className="rounded-lg border border-slate-200 p-10 text-center text-sm text-slate-500">Loading timeline…</div>
      )}

      {projectId && !loading && stages.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-200 p-10 text-center">
          <p className="text-sm text-slate-600">This client has no Client Logs timeline yet.</p>
          {canManage ? (
            <div className="mt-4 flex items-center justify-center gap-2">
              <div className="min-w-[240px]">
                <SelectField
                  ariaLabel="Template"
                  value={templateId}
                  onChange={setTemplateId}
                  options={templates.map((template) => ({ value: template.id, label: `${template.name} (${template.stages.length} stages)` }))}
                />
              </div>
              <Button size="sm" variant="primary" isDisabled={applying || !templateId} onPress={() => void apply()}>
                {applying ? "Applying…" : "Apply template"}
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-400">A manager needs to apply a stage template.</p>
          )}
        </div>
      )}

      {projectId && !loading && stages.length > 0 && (
        <>
          {readiness && <LaunchReadinessPanel readiness={readiness} />}
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
              {(["gantt", "list"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setView(option)}
                  className={`px-3 py-1.5 text-sm capitalize ${view === option ? "bg-[var(--brand)] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {option}
                </button>
              ))}
            </div>
            {view === "gantt" && (
              <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
                {SCALES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setScale(option)}
                    className={`px-3 py-1.5 text-sm capitalize ${scale === option ? "bg-[var(--brand)] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
            <div className="min-w-[170px]">
              <SelectField
                ariaLabel="Status filter"
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as StageStatus | "all")}
                options={STATUS_FILTERS.map((option) => ({ value: option, label: option === "all" ? "All statuses" : statusMeta(option as StageStatus).label }))}
              />
            </div>
            <TextField aria-label="Search stages" value={search} onChange={setSearch} className="min-w-[200px]">
              <Input placeholder="Search stages…" />
            </TextField>
            {canManage && (
              <Button size="sm" variant="secondary" onPress={() => setShowAddStage((v) => !v)}>
                {showAddStage ? "Cancel" : "Add stage"}
              </Button>
            )}
          </div>

          {canManage && showAddStage && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-2">
              <TextField aria-label="New stage name" value={newStageName} onChange={setNewStageName} className="min-w-[220px] flex-1">
                <Input placeholder="New stage name…" />
              </TextField>
              <CheckboxField isSelected={newStageMilestone} onChange={setNewStageMilestone}>Milestone</CheckboxField>
              <Button size="sm" variant="primary" isDisabled={addingStage || !newStageName.trim()} onPress={() => void handleAddStage()}>
                {addingStage ? "Adding…" : "Add"}
              </Button>
            </div>
          )}

          {view === "gantt" ? (
            <GanttChart stages={filtered} scale={scale} onOpenStage={openStage} />
          ) : (
            <StageList
              stages={filtered}
              onOpenStage={openStage}
              canReorder={canManage && statusFilter === "all" && !search}
              onMove={handleMoveStage}
            />
          )}
        </>
      )}

      <StageDrawer stageId={activeStageId} state={drawer} canEdit={canEdit} canManage={canManage} onDelete={handleDeleteStage} onSaved={() => loadStages(projectId)} />

      <ConfirmDialog
        state={confirmClearState}
        title="Clear Client Logs?"
        description={
          <>
            This permanently deletes <strong>{clearTarget?.clientName}</strong>&apos;s entire Client Logs timeline —
            all stages, website checks, meetings, and launch readiness. Linked tasks stay on the board but are unlinked.
            The client returns to “Not created”. This cannot be undone.
          </>
        }
        confirmLabel="Clear timeline"
        destructive
        onConfirm={confirmClear}
      />
    </div>
  );
}

function StageList({
  stages,
  onOpenStage,
  canReorder = false,
  onMove,
}: {
  stages: ClientLogStage[];
  onOpenStage: (id: string) => void;
  canReorder?: boolean;
  onMove?: (id: string, direction: "up" | "down") => void;
}) {
  return (
    <div className="app-table-shell overflow-x-auto">
      <Table aria-label="Stage list">
        <TableScrollContainer>
          <TableContent className="min-w-[900px]">
            <TableHeader>
              <TableColumn id="stage" isRowHeader>Stage</TableColumn>
              <TableColumn id="owner">Owner</TableColumn>
              <TableColumn id="status">Status</TableColumn>
              <TableColumn id="progress">Progress</TableColumn>
              <TableColumn id="planned">Planned</TableColumn>
              <TableColumn id="actual">Actual end</TableColumn>
              <TableColumn id="open">Open</TableColumn>
              <TableColumn id="review">Review</TableColumn>
              <TableColumn id="overdue">Overdue</TableColumn>
              {canReorder ? <TableColumn id="reorder">Order</TableColumn> : null}
            </TableHeader>
            <TableBody>
              {stages.map((stage, index) => {
                const meta = statusMeta(stage.status);
                return (
                  <TableRow key={stage.id} id={stage.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => onOpenStage(stage.id)}
                        className="flex items-center gap-1.5 font-medium text-slate-900 hover:text-blue-600"
                      >
                        {stage.isMilestone && <span className="text-amber-500" title="Milestone">◆</span>}
                        {stage.name}
                      </button>
                    </TableCell>
                    <TableCell><span className="text-slate-600">{stage.ownerName ?? "Unassigned"}</span></TableCell>
                    <TableCell>
                      <Chip size="sm" variant="soft" color={meta.color}>
                        <span aria-hidden className="mr-1">{meta.mark}</span>
                        {meta.label}
                      </Chip>
                    </TableCell>
                    <TableCell><span className="tabular-nums text-slate-600">{stage.progress}%</span></TableCell>
                    <TableCell><span className="whitespace-nowrap text-slate-600">{formatDate(stage.plannedStart)} → {formatDate(stage.plannedEnd)}</span></TableCell>
                    <TableCell><span className="text-slate-600">{formatDate(stage.actualEnd)}</span></TableCell>
                    <TableCell><span className="tabular-nums">{stage.taskStats.open}</span></TableCell>
                    <TableCell><span className="tabular-nums">{stage.taskStats.awaitingReview}</span></TableCell>
                    <TableCell><span className={`tabular-nums ${stage.taskStats.overdue ? "font-semibold text-rose-600" : ""}`}>{stage.taskStats.overdue}</span></TableCell>
                    {canReorder ? (
                      <TableCell>
                        <span className="flex gap-1">
                          <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => onMove?.(stage.id, "up")} className="rounded border border-slate-200 px-1.5 text-slate-500 disabled:opacity-30 hover:bg-slate-50">↑</button>
                          <button type="button" aria-label="Move down" disabled={index === stages.length - 1} onClick={() => onMove?.(stage.id, "down")} className="rounded border border-slate-200 px-1.5 text-slate-500 disabled:opacity-30 hover:bg-slate-50">↓</button>
                        </span>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>
    </div>
  );
}
