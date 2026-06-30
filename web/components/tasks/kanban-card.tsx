"use client";

import { Button } from "@heroui/react";
import { Flag, LayoutGrid } from "lucide-react";

import { StatusSelect } from "./status-select";
import type { Task, TaskPriority, TaskStatus } from "./data";

const priorityIconClass: Record<TaskPriority, string> = {
  High: "bg-red-50 text-red-600 ring-red-100",
  Medium: "bg-amber-50 text-amber-600 ring-amber-100",
  Low: "bg-slate-50 text-slate-500 ring-slate-100",
};

export function TaskKanbanCard({
  task,
  onChangeStatus,
  onOpenTask,
  showStatusControl = true,
  projectTaskCount,
}: {
  task: Task;
  onChangeStatus?: (taskId: string, status: TaskStatus) => void;
  onOpenTask: (task: Task) => void;
  showStatusControl?: boolean;
  /** Total number of tasks in this card's project, shown on the card. */
  projectTaskCount?: number;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-900">{task.title}</p>
      {projectTaskCount != null && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f5ff] px-2 py-0.5 text-[11px] font-semibold text-[#082a78]">
          <LayoutGrid className="h-3 w-3" />
          {projectTaskCount} {projectTaskCount === 1 ? "task" : "tasks"} in project
        </span>
      )}
      {task.dueDate && (
        <span className="block text-xs text-gray-400">{task.dueDate}</span>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {showStatusControl && onChangeStatus ? (
            <StatusSelect
              status={task.status}
              onChange={(status) => onChangeStatus(task.id, status)}
            />
          ) : (
            <span className="rounded-full bg-[#e8f5ff] px-2 py-1 text-xs font-semibold text-[#082a78]">
              {task.status}
            </span>
          )}
          <span
            title={`${task.priority} priority`}
            aria-label={`${task.priority} priority`}
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 ${priorityIconClass[task.priority]}`}
          >
            <Flag className="h-3.5 w-3.5" />
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2 text-xs"
          onPress={() => onOpenTask(task)}
        >
          View
        </Button>
      </div>
    </div>
  );
}
