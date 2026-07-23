"use client";

import {
  Button,
  useOverlayState,
} from "@heroui/react";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GridList,
  GridListItem,
  isTextDropItem,
  useDragAndDrop,
} from "react-aria-components";

import type { Project } from "@/components/projects/data";
import { SearchableFilter } from "@/components/ui/searchable-filter";
import { listProjects } from "@/libs/api/projects";
import {
  createTask,
  listAssignees,
  listMyTasks,
  moveTasks,
  updateTask,
  updateTaskStatus,
} from "@/libs/api/tasks";
import { apiClient, endpoints } from "@/libs/api";
import { notify } from "@/libs/notify";
import { type Task, type TaskStatus } from "@/components/tasks/data";
import {
  CreateTaskModal,
  type NewTaskInput,
  type TaskAssigneeOption,
} from "@/components/tasks/create-task-modal";
import { TaskKanbanCard } from "@/components/tasks/kanban-card";
import { TaskDetailModal } from "@/components/tasks/task-detail-modal";

const ALL_PROJECTS = "all";
const DRAG_TYPE = "application/x-wpm-my-task";

type BoardColumn = {
  id: "backlogs" | "in-progress" | "in-review" | "blocked" | "done";
  title: string;
  status: TaskStatus;
  includes: TaskStatus[];
};

const COLUMNS: BoardColumn[] = [
  {
    id: "backlogs",
    title: "Backlogs",
    status: "Backlog",
    includes: ["Backlog"],
  },
  {
    id: "in-progress",
    title: "In Progress",
    status: "In Progress",
    includes: ["In Progress"],
  },
  {
    id: "in-review",
    title: "In Review",
    status: "Review",
    includes: ["Review"],
  },
  {
    id: "blocked",
    title: "Blocked",
    status: "Blocked",
    includes: ["Blocked"],
  },
  { id: "done", title: "Done", status: "Done", includes: ["Done"] },
];

function dropPosition(position: string): "before" | "after" {
  return position === "after" ? "after" : "before";
}

function applyMove(
  all: Task[],
  movingIds: string[],
  toStatus: TaskStatus,
  targetId?: string,
  position?: "before" | "after"
): Task[] {
  const movingSet = new Set(movingIds);
  const moving = all
    .filter((task) => movingSet.has(task.id))
    .map((task) => ({ ...task, status: toStatus }));

  if (moving.length === 0) return all;

  const rest = all.filter((task) => !movingSet.has(task.id));

  let insertIndex = rest.length;
  if (targetId) {
    const targetIndex = rest.findIndex((task) => task.id === targetId);
    insertIndex =
      targetIndex < 0
        ? rest.length
        : position === "after"
          ? targetIndex + 1
          : targetIndex;
  } else {
    const lastInColumn = rest.reduce(
      (last, task, index) => (task.status === toStatus ? index : last),
      -1
    );
    insertIndex = lastInColumn < 0 ? rest.length : lastInColumn + 1;
  }

  rest.splice(insertIndex, 0, ...moving);
  return rest;
}

function StatusColumn({
  column,
  tasks,
  getClientName,
  getPriorityClient,
  onMove,
  onChangeStatus,
  onOpenTask,
}: {
  column: BoardColumn;
  tasks: Task[];
  getClientName?: (task: Task) => string | undefined;
  getPriorityClient?: (task: Task) => boolean;
  onMove: (
    ids: string[],
    toStatus: TaskStatus,
    targetId?: string,
    position?: "before" | "after"
  ) => void;
  onChangeStatus: (taskId: string, status: TaskStatus) => void;
  onOpenTask: (task: Task) => void;
}) {
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) =>
      [...keys].map((key) => {
        const task = tasks.find((item) => item.id === key);
        return {
          [DRAG_TYPE]: JSON.stringify({ id: String(key) }),
          "text/plain": task?.title ?? "",
        };
      }),
    acceptedDragTypes: [DRAG_TYPE],
    getDropOperation: () => "move",
    onInsert: async (event) => {
      const ids = await Promise.all(
        event.items
          .filter(isTextDropItem)
          .map(
            async (item) =>
              (JSON.parse(await item.getText(DRAG_TYPE)) as { id: string }).id
          )
      );
      onMove(
        ids,
        column.status,
        String(event.target.key),
        dropPosition(event.target.dropPosition)
      );
    },
    onRootDrop: async (event) => {
      const ids = await Promise.all(
        event.items
          .filter(isTextDropItem)
          .map(
            async (item) =>
              (JSON.parse(await item.getText(DRAG_TYPE)) as { id: string }).id
          )
      );
      onMove(ids, column.status);
    },
    onReorder: (event) => {
      onMove(
        [...event.keys].map(String),
        column.status,
        String(event.target.key),
        dropPosition(event.target.dropPosition)
      );
    },
  });

  return (
    <div className="kanban-column flex h-full w-72 shrink-0 flex-col">
      <div className="space-y-2 border-b border-slate-100 px-3 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-800">
            {column.title}
          </span>
          <span className="rounded-full bg-[#e8f5ff] px-2 py-0.5 text-xs font-semibold text-[#082a78]">
            {tasks.length}
          </span>
        </div>
      </div>

      <GridList
        aria-label={`${column.title} tasks`}
        items={tasks}
        dragAndDropHooks={dragAndDropHooks}
        renderEmptyState={() => (
          <div className="px-3 py-6 text-center text-xs text-gray-400">
            Drop tasks here
          </div>
        )}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2 outline-none"
      >
        {(item) => {
          const isPriority = getPriorityClient?.(item) ?? false;
          return (
          <GridListItem
            id={item.id}
            textValue={item.title}
            style={
              isPriority
                ? { backgroundColor: "#fffbeb", borderLeft: "3px solid #f59e0b" }
                : undefined
            }
            className="kanban-card cursor-grab p-3 outline-none transition-transform hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#0b7de3] data-[dragging=true]:opacity-50"
          >
            <TaskKanbanCard
              task={item}
              clientName={getClientName?.(item)}
              priorityClient={isPriority}
              onChangeStatus={onChangeStatus}
              onOpenTask={onOpenTask}
            />
          </GridListItem>
          );
        }}
      </GridList>
    </div>
  );
}

export function MyTasksBoard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assignees, setAssignees] = useState<TaskAssigneeOption[]>([]);
  const [projectFilter, setProjectFilter] = useState(ALL_PROJECTS);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [currentUserName, setCurrentUserName] = useState("Unassigned");
  const [isLoading, setIsLoading] = useState(true);
  const createState = useOverlayState();
  const detailState = useOverlayState();

  const myTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          (projectFilter === ALL_PROJECTS || task.projectId === projectFilter)
      ),
    [tasks, projectFilter]
  );

  const selectedProjectId =
    projectFilter === ALL_PROJECTS ? projects[0]?.id ?? "" : projectFilter;

  const projectOptions = useMemo(
    () =>
      projects.map((project) => ({
        id: project.id,
        label: project.clientName,
        meta: project.websites?.[0]?.url ?? project.liveLink ?? project.stagingLink,
      })),
    [projects]
  );

  const clientNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.clientName])),
    [projects]
  );

  const priorityClientIds = useMemo(
    () =>
      new Set(
        projects.filter((project) => project.priority === "High").map((p) => p.id)
      ),
    [projects]
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [projectRows, taskRows, assigneeRows, me] = await Promise.all([
        listProjects(),
        listMyTasks(),
        listAssignees(),
        apiClient.get<{ user: { name?: string; email?: string } }>(
          endpoints.auth.me
        ),
      ]);
      setProjects(projectRows);
      setTasks(taskRows);
      setAssignees(
        assigneeRows.map((member) => ({ id: member.id, name: member.name }))
      );
      setCurrentUserName(me.data.user.name || me.data.user.email || "Unassigned");
    } catch (err) {
      const message = (err as Error).message ?? "Could not load your tasks.";
      notify.error("Could not load your tasks", { description: message });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMove = (
    ids: string[],
    toStatus: TaskStatus,
    targetId?: string,
    position?: "before" | "after"
  ) => {
    setTasks((prev) => {
      const next = applyMove(prev, ids, toStatus, targetId, position);
      void moveTasks(
        ids.map((id, index) => ({
          id,
          status: toStatus,
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
  };

  const handleCreate = async (input: NewTaskInput) => {
    const created = await createTask(input);
    setTasks((prev) => [created, ...prev]);
    notify.success("Task created", { description: created.title });
  };

  const handleChangeStatus = async (taskId: string, status: TaskStatus) => {
    const previous = tasks;
    setTasks((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, status } : task))
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
  };

  const openTask = (task: Task) => {
    setActiveTask(task);
    detailState.open();
  };

  const handleUpdateTask = async (updatedTask: Task) => {
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
    setTasks((prev) =>
      prev.map((task) => (task.id === saved.id ? saved : task))
    );
    setActiveTask(saved);
    notify.success("Task updated", { description: saved.title });
  };

  return (
    <div className="flex h-full min-h-[calc(100dvh-7.5rem)] flex-col gap-4">
      <section className="app-toolbar p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              My Tasks
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Your assigned tasks across projects, grouped by delivery stage.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48 shrink-0">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Project
              </label>
              <SearchableFilter
                ariaLabel="Filter by project"
                value={projectFilter}
                onChange={setProjectFilter}
                options={[
                  { key: ALL_PROJECTS, label: "All projects" },
                  ...projects.map((project) => ({
                    key: project.id,
                    label: project.clientName,
                  })),
                ]}
                placeholder="All projects"
                triggerClassName="w-48 bg-white"
              />
            </div>

            <Button type="button" variant="primary" onPress={createState.open}>
              <Plus className="h-4 w-4" />
              Add New Task
            </Button>
          </div>
        </div>
      </section>

      <section className="min-h-0 flex-1">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            Loading your tasks...
          </div>
        ) : (
        <div className="flex h-full gap-4 overflow-x-auto pb-2">
          {COLUMNS.map((column) => (
            <StatusColumn
              key={column.id}
              column={column}
              tasks={myTasks.filter((task) =>
                column.includes.includes(task.status)
              )}
              getClientName={(task) => clientNameById.get(task.projectId)}
              getPriorityClient={(task) => priorityClientIds.has(task.projectId)}
              onMove={handleMove}
              onChangeStatus={handleChangeStatus}
              onOpenTask={openTask}
            />
          ))}
        </div>
        )}
      </section>

      <CreateTaskModal
        key={`${selectedProjectId}:${createState.isOpen ? "open" : "closed"}`}
        state={createState}
        defaultAssignee={currentUserName}
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
      />
    </div>
  );
}
