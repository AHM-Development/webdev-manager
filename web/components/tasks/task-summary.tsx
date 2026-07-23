"use client";

import {
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { ArrowUpRight, ChevronDown, Flag, Plus, Search, Star } from "lucide-react";
import { useState } from "react";

import type { Project } from "@/components/projects/data";
import { SearchableFilter } from "@/components/ui/searchable-filter";

import {
  STATUSES,
  ASSIGNEE_COLUMNS,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "./data";
import { StatusSelect } from "./status-select";
import { checklistProgress } from "./task-utils";

const priorityIconClass: Record<TaskPriority, string> = {
  High: "bg-red-50 text-red-600 ring-red-100",
  Medium: "bg-amber-50 text-amber-600 ring-amber-100",
  Low: "bg-slate-50 text-slate-500 ring-slate-100",
};

/** Read-only status pill, used when the viewer can't change a task's status. */
function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
      {status}
    </span>
  );
}

export function TaskSummary({
  tasks,
  projects,
  onChangeStatus,
  onOpenProject,
  onOpenTask,
  onAddTask,
  addTaskLabel = "Add Task",
  readOnly = false,
}: {
  tasks: Task[];
  projects: Project[];
  onChangeStatus: (taskId: string, status: TaskStatus) => void;
  onOpenProject: (projectId: string) => void;
  onOpenTask: (task: Task) => void;
  onAddTask?: () => void;
  addTaskLabel?: string;
  readOnly?: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState<string>("In Progress");
  const [query, setQuery] = useState("");
  const [openProjects, setOpenProjects] = useState<Set<string>>(
    () => new Set()
  );

  const q = query.trim().toLowerCase();
  const clientNameOf = (id: string) =>
    projects.find((p) => p.id === id)?.clientName ?? "";
  const visible = tasks.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (!q) return true;
    return [t.title, t.assignee, clientNameOf(t.projectId)]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const assigneeOrder = [
    ...ASSIGNEE_COLUMNS,
    ...Array.from(
      new Set(tasks.map((task) => task.assignee).filter(Boolean))
    ).filter((assignee) => !ASSIGNEE_COLUMNS.includes(assignee)),
  ];

  const groups = assigneeOrder
    .map((assignee) => ({
      assignee,
      rows: visible.filter((task) => task.assignee === assignee),
      allRows: tasks.filter((task) => task.assignee === assignee),
    }))
    .filter((group) => group.rows.length > 0);

  const toggleProject = (projectKey: string) => {
    setOpenProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectKey)) next.delete(projectKey);
      else next.add(projectKey);
      return next;
    });
  };

  const projectName = (id: string) =>
    projects.find((p) => p.id === id)?.clientName ?? id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">
          {statusFilter === "all" ? "All tasks" : statusFilter} — by Assignee
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {onAddTask && (
            <Button variant="primary" onPress={onAddTask}>
              <Plus className="h-4 w-4" /> {addTaskLabel}
            </Button>
          )}
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              aria-label="Search tasks"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search task, client, assignee…"
              className="w-full pl-9"
            />
          </div>
          <SearchableFilter
            ariaLabel="Filter by status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { key: "all", label: "All statuses" },
              ...STATUSES.map((status) => ({ key: status, label: status })),
            ]}
            placeholder="All statuses"
            triggerClassName="w-40"
          />
          <span className="text-sm text-gray-400">
            {visible.length} task{visible.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {groups.length === 0 && (
        <p className="rounded-lg border border-gray-200 py-10 text-center text-sm text-gray-500">
          No {statusFilter === "all" ? "" : `${statusFilter.toLowerCase()} `}
          tasks right now.
        </p>
      )}

      <div className="space-y-4">
        {groups.map((group) => {
          const projectGroups = projects
            .map((project) => ({
              project,
              rows: group.rows.filter((task) => task.projectId === project.id),
              allRows: group.allRows.filter(
                (task) => task.projectId === project.id
              ),
            }))
            .filter((projectGroup) => projectGroup.rows.length > 0)
            // Priority clients (High-priority projects) float to the top.
            .sort(
              (a, b) =>
                (b.project.priority === "High" ? 1 : 0) -
                (a.project.priority === "High" ? 1 : 0)
            );

          return (
            <section key={group.assignee} className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    {group.assignee}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {group.rows.length} matching task
                    {group.rows.length === 1 ? "" : "s"} in{" "}
                    {projectGroups.length} project
                    {projectGroups.length === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="text-sm text-gray-500">
                  {group.allRows.length} total task
                  {group.allRows.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="app-table-shell overflow-x-auto">
                <Table aria-label={`${group.assignee} projects`}>
                  <TableContent className="w-full min-w-[820px] table-fixed">
                    <TableHeader>
                      <TableColumn
                        id="project"
                        isRowHeader
                        className="w-[40%]"
                      >
                        Project
                      </TableColumn>
                      <TableColumn id="matching" className="w-[16%]">
                        Matching Tasks
                      </TableColumn>
                      <TableColumn id="total" className="w-[16%]">
                        Total Tasks
                      </TableColumn>
                      <TableColumn id="action" className="w-[28%]">
                        Action
                      </TableColumn>
                    </TableHeader>
                    <TableBody>
                      {projectGroups.flatMap((projectGroup) => {
                        const projectKey = `${group.assignee}:${projectGroup.project.id}`;
                        const open = openProjects.has(projectKey);
                        const projectRow = (
                          <TableRow
                            key={projectGroup.project.id}
                            id={projectGroup.project.id}
                            className={
                              projectGroup.project.priority === "High"
                                ? "is-priority-client"
                                : undefined
                            }
                          >
                            <TableCell>
                              <button
                                type="button"
                                onClick={() => toggleProject(projectKey)}
                                className="flex min-w-0 items-center gap-3 text-left"
                                aria-expanded={open}
                              >
                                <ChevronDown
                                  className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${
                                    open ? "rotate-180" : ""
                                  }`}
                                />
                                <span className="min-w-0">
                                  <span className="flex items-center gap-1.5 truncate font-semibold text-gray-900">
                                    {projectGroup.project.priority === "High" && (
                                      <Star
                                        className="h-3.5 w-3.5 shrink-0 fill-amber-500 text-amber-500"
                                        aria-label="Priority client"
                                      />
                                    )}
                                    <span className="truncate">
                                      {projectName(projectGroup.project.id)}
                                    </span>
                                  </span>
                                  <span className="mt-1 block truncate text-xs text-gray-500">
                                    {projectGroup.project.priority === "High"
                                      ? "Priority client · click to view tasks"
                                      : "Click to view matching tasks"}
                                  </span>
                                </span>
                              </button>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium text-gray-900">
                                {projectGroup.rows.length}
                              </span>
                              <span className="ml-1 text-sm text-gray-500">
                                task
                                {projectGroup.rows.length === 1 ? "" : "s"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium text-gray-900">
                                {projectGroup.allRows.length}
                              </span>
                              <span className="ml-1 text-sm text-gray-500">
                                task
                                {projectGroup.allRows.length === 1 ? "" : "s"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onPress={() => toggleProject(projectKey)}
                                >
                                  {open ? "Hide Tasks" : "View Tasks"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onPress={() =>
                                    onOpenProject(projectGroup.project.id)
                                  }
                                >
                                  Open Board
                                  <ArrowUpRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );

                        if (!open) return [projectRow];

                        return [
                          projectRow,
                          <TableRow
                            key={`${projectGroup.project.id}-tasks`}
                            id={`${projectGroup.project.id}-tasks`}
                            className="bg-[#f7f8fa]"
                          >
                            <TableCell colSpan={4}>
                              <div className="space-y-2 py-2">
                                {projectGroup.rows.map((task) => {
                                  const progress = checklistProgress(task);

                                  return (
                                    <div
                                      key={task.id}
                                      className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[minmax(220px,1fr)_140px_86px_170px_104px]"
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate font-medium text-gray-900">
                                          {task.title}
                                        </p>
                                        <p className="mt-1 text-xs text-gray-500">
                                          Due {task.dueDate ?? "not set"}
                                        </p>
                                      </div>

                                      <div className="flex items-center">
                                        {readOnly ? (
                                          <StatusBadge status={task.status} />
                                        ) : (
                                          <StatusSelect
                                            status={task.status}
                                            onChange={(status) =>
                                              onChangeStatus(task.id, status)
                                            }
                                          />
                                        )}
                                      </div>

                                      <div className="flex items-center">
                                        <span
                                          title={`${task.priority} priority`}
                                          aria-label={`${task.priority} priority`}
                                          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ${priorityIconClass[task.priority]}`}
                                        >
                                          <Flag className="h-3.5 w-3.5" />
                                        </span>
                                      </div>

                                      <div className="space-y-1.5">
                                        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                                          <span>Checklist</span>
                                          <span>
                                            {progress.completed}/
                                            {progress.total}
                                          </span>
                                        </div>
                                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                                          <div
                                            className="h-full rounded-full bg-[#0b7de3]"
                                            style={{
                                              width: `${progress.percent}%`,
                                            }}
                                          />
                                        </div>
                                      </div>

                                      <div className="flex items-center justify-end">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="ghost"
                                          onPress={() => onOpenTask(task)}
                                        >
                                          View
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </TableCell>
                          </TableRow>,
                        ];
                      })}
                    </TableBody>
                  </TableContent>
                </Table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
