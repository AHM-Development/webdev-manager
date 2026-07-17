"use client";

import { useOverlayState } from "@heroui/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Project } from "@/components/projects/data";
import { listProjects } from "@/libs/api/projects";
import {
  approveTaskRequest,
  createTask,
  listAssignees,
  listTaskRequests,
  listTasks,
  moveTasks,
  rejectTaskRequest,
  updateTask,
  updateTaskStatus,
} from "@/libs/api/tasks";
import { useAuth } from "@/libs/hooks/useAuth";
import { notify } from "@/libs/notify";

import {
  CreateTaskModal,
  type NewTaskInput,
  type TaskAssigneeOption,
} from "./create-task-modal";
import { type Task, type TaskStatus } from "./data";
import { KanbanBoard } from "./kanban-board";
import { ProjectSwitcher } from "./project-switcher";
import { TaskBoardHeader } from "./task-board-header";
import { TaskDetailModal } from "./task-detail-modal";
import { TaskRequests } from "./task-requests";
import { TaskSummary } from "./task-summary";

const RECENTS_KEY = "wpm:recent-projects";

/** Tracks recently-viewed project ids (most recent first), persisted to localStorage. */
function useRecents(currentId: string) {
  const [storedRecents, setStoredRecents] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  });

  const recents = useMemo(
    () =>
      [currentId, ...storedRecents.filter((id) => id !== currentId)].slice(
        0,
        5
      ),
    [currentId, storedRecents]
  );

  useEffect(() => {
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
    } catch {
      /* ignore */
    }
  }, [recents]);

  const trackRecent = useCallback((id: string) => {
    setStoredRecents((prev) =>
      [id, ...prev.filter((recentId) => recentId !== id)].slice(0, 5)
    );
  }, []);

  return { recents, trackRecent };
}

/** Reassign tasks to a column (assignee), optionally relative to a target; preserves order. */
function applyMove(
  all: Task[],
  projectId: string,
  movingIds: string[],
  toAssignee: string,
  targetId?: string,
  position?: "before" | "after"
): Task[] {
  const movingSet = new Set(movingIds);
  const moving = all
    .filter((t) => movingSet.has(t.id))
    .map((t) => ({ ...t, assignee: toAssignee }));
  if (moving.length === 0) return all;

  const rest = all.filter((t) => !movingSet.has(t.id));

  let insertIdx: number;
  if (targetId) {
    const idx = rest.findIndex((t) => t.id === targetId);
    insertIdx = idx < 0 ? rest.length : position === "after" ? idx + 1 : idx;
  } else {
    let last = -1;
    rest.forEach((t, i) => {
      if (t.projectId === projectId) last = i;
    });
    insertIdx = last < 0 ? rest.length : last + 1;
  }
  rest.splice(insertIdx, 0, ...moving);
  return rest;
}

export function TasksView() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const switcher = useOverlayState();
  const addTask = useOverlayState();
  const detailState = useOverlayState();
  const [tab, setTab] = useState<"summary" | "requests" | "board">("summary");

  const role = user?.role;
  const isSuperAdmin = role === "superadmin";
  const isStaff = role === "staff";
  const canReview = role === "superadmin" || role === "developer";

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [requests, setRequests] = useState<Task[]>([]);
  const [assignees, setAssignees] = useState<TaskAssigneeOption[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Staff may edit only their own request while it's still pending.
  const detailReadOnly = isStaff
    ? !(activeTask?.requestedBy === user?.id && activeTask?.requestStatus === "pending")
    : false;

  // Selected project comes from the URL (?project=id); default to the first.
  const requested = params.get("project");
  const foundIndex = projects.findIndex((p) => p.id === requested);
  const index = foundIndex >= 0 ? foundIndex : 0;
  const project = projects[index] ?? null;

  const { recents, trackRecent } = useRecents(project?.id ?? "");

  const projectTasks = useMemo(
    () => (project ? tasks.filter((t) => t.projectId === project.id) : []),
    [tasks, project]
  );

  const taskCountByProject = useMemo(
    () =>
      tasks.reduce<Record<string, number>>((acc, task) => {
        acc[task.projectId] = (acc[task.projectId] ?? 0) + 1;
        return acc;
      }, {}),
    [tasks]
  );

  const projectOptions = useMemo(
    () =>
      projects.map((item) => ({
        id: item.id,
        label: item.clientName,
        meta: item.websites?.[0]?.url ?? item.liveLink ?? item.stagingLink,
      })),
    [projects]
  );

  const assigneeNames = useMemo(
    () => assignees.map((member) => member.name),
    [assignees]
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [projectRows, taskRows, assigneeRows, requestRows] = await Promise.all([
        listProjects(),
        listTasks({ requestStatus: "approved" }),
        listAssignees(),
        listTaskRequests(),
      ]);
      setProjects(projectRows);
      setTasks(taskRows);
      setRequests(requestRows);
      setAssignees(
        assigneeRows.map((member) => ({ id: member.id, name: member.name }))
      );
    } catch (err) {
      const message = (err as Error).message ?? "Could not load tasks.";
      notify.error("Could not load tasks", { description: message });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const goTo = (id?: string) => {
    if (!id) return;
    trackRecent(id);
    router.replace(`/dashboard/tasks?project=${id}`, { scroll: false });
  };

  const handleMove = useCallback(
    (
      ids: string[],
      toAssignee: string,
      targetId?: string,
      position?: "before" | "after"
    ) => {
      if (!project) return;
      setTasks((prev) => {
        const next = applyMove(prev, project.id, ids, toAssignee, targetId, position);
        void moveTasks(
          ids.map((id, index) => ({
            id,
            assignee: toAssignee,
            sortOrder: (index + 1) * 100,
          }))
        ).then((updated) => {
          setTasks((current) =>
            current.map((task) => updated.find((item) => item.id === task.id) ?? task)
          );
        }).catch((err) => {
          const message = (err as Error).message ?? "Could not move task.";
          notify.error("Could not move task", { description: message });
          void load();
        });
        return next;
      });
    },
    [load, project]
  );

  const handleCreate = useCallback(async (input: NewTaskInput) => {
    const created = await createTask(input);
    if (created.requestStatus === "approved") {
      setTasks((prev) => [created, ...prev]);
      notify.success("Task created", { description: created.title });
    } else {
      setRequests((prev) => [created, ...prev]);
      notify.success("Task request submitted", {
        description: "A manager will review it shortly.",
      });
    }
  }, []);

  const handleApprove = useCallback(async (taskId: string) => {
    try {
      const updated = await approveTaskRequest(taskId);
      setRequests((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setTasks((prev) => [updated, ...prev.filter((t) => t.id !== updated.id)]);
      notify.success("Request approved", { description: updated.title });
    } catch (err) {
      notify.error("Could not approve request", {
        description: (err as Error).message ?? "Please try again.",
      });
    }
  }, []);

  const handleReject = useCallback(async (taskId: string) => {
    try {
      const updated = await rejectTaskRequest(taskId);
      setRequests((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      notify.success("Request rejected", { description: updated.title });
    } catch (err) {
      notify.error("Could not reject request", {
        description: (err as Error).message ?? "Please try again.",
      });
    }
  }, []);

  const handleChangeStatus = useCallback(
    async (taskId: string, status: TaskStatus) => {
      const previous = tasks;
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status } : t))
      );
      try {
        const saved = await updateTaskStatus(taskId, status);
        setTasks((prev) =>
          prev.map((task) => (task.id === saved.id ? saved : task))
        );
      } catch (err) {
        setTasks(previous);
        const message = (err as Error).message ?? "Could not update status.";
        notify.error("Could not update status", { description: message });
      }
    },
    [tasks]
  );

  const openTask = useCallback(
    (task: Task) => {
      setActiveTask(task);
      detailState.open();
    },
    [detailState]
  );

  const handleUpdateTask = useCallback(async (updatedTask: Task) => {
    const saved = await updateTask(updatedTask.id, {
      projectId: updatedTask.projectId,
      title: updatedTask.title,
      description: updatedTask.description,
      checklist: updatedTask.checklist,
      attachments: updatedTask.attachments,
      status: updatedTask.status,
      assignee: updatedTask.assignee,
      assigneeUserId: updatedTask.assigneeUserId,
      priority: updatedTask.priority,
      startDate: updatedTask.startDate,
      dueDate: updatedTask.dueDate,
    });
    setTasks((prev) => prev.map((task) => (task.id === saved.id ? saved : task)));
    setRequests((prev) => prev.map((task) => (task.id === saved.id ? saved : task)));
    setActiveTask(saved);
    notify.success("Task updated", { description: saved.title });
  }, []);

  // ⌘K / Ctrl+K opens the switcher.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        switcher.open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [switcher]);

  // Board is Super-Admin only; everyone gets Summary + Requests.
  const TABS = [
    { id: "summary", label: "Task Summary" },
    { id: "requests", label: "Task Requests" },
    ...(isSuperAdmin ? [{ id: "board", label: "Board" } as const] : []),
  ] as const;

  const addTaskLabel = isStaff ? "Request Task" : "Add Task";

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="app-tabbar flex w-fit gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`app-tab px-4 py-2 text-sm font-semibold ${
              tab === t.id
                ? "app-tab-active"
                : "hover:bg-[#f4f7f6] hover:text-slate-950"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "summary" ? (
        <div className="min-h-0 flex-1 overflow-y-auto pt-4">
          <TaskSummary
            tasks={tasks}
            projects={projects}
            readOnly={isStaff}
            onChangeStatus={handleChangeStatus}
            onOpenTask={openTask}
            onAddTask={addTask.open}
            addTaskLabel={addTaskLabel}
            onOpenProject={(id) => {
              if (isSuperAdmin) {
                goTo(id);
                setTab("board");
              }
            }}
          />
        </div>
      ) : tab === "requests" ? (
        <div className="min-h-0 flex-1 overflow-y-auto pt-4">
          <TaskRequests
            requests={requests}
            projects={projects}
            canReview={canReview}
            onApprove={handleApprove}
            onReject={handleReject}
            onOpenTask={openTask}
            onAddTask={addTask.open}
            addTaskLabel={addTaskLabel}
          />
        </div>
      ) : isLoading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center pt-4 text-sm text-slate-500">
          Loading tasks...
        </div>
      ) : !project ? (
        <div className="flex min-h-0 flex-1 items-center justify-center pt-4 text-center text-sm text-slate-500">
          Add a project first before creating tasks.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 pt-4">
          <TaskBoardHeader
            project={project}
            index={index}
            total={projects.length}
            canPrev={index > 0}
            canNext={index < projects.length - 1}
            onPrev={() => goTo(projects[index - 1]?.id)}
            onNext={() => goTo(projects[index + 1]?.id)}
            onOpenSwitcher={switcher.open}
            onAddTask={addTask.open}
          />

          <div className="min-h-0 flex-1">
            <KanbanBoard
              projectId={project.id}
              tasks={projectTasks}
              assigneeNames={assigneeNames}
              onMove={handleMove}
              onChangeStatus={handleChangeStatus}
              onOpenTask={openTask}
            />
          </div>
        </div>
      )}

      <ProjectSwitcher
        state={switcher}
        projects={projects}
        counts={taskCountByProject}
        currentId={project?.id ?? ""}
        recents={recents}
        onSelect={goTo}
      />

      <CreateTaskModal
        state={addTask}
        projectOptions={projectOptions}
        assigneeOptions={assignees}
        onCreate={handleCreate}
      />

      <TaskDetailModal
        state={detailState}
        task={activeTask}
        projectOptions={projectOptions}
        assigneeOptions={assignees}
        onUpdate={handleUpdateTask}
        readOnly={detailReadOnly}
      />
    </div>
  );
}
