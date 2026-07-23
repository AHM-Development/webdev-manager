"use client";

import { Button } from "@heroui/react";
import { Flag, Star } from "lucide-react";

import { StatusSelect } from "./status-select";
import { checklistProgress } from "./task-utils";
import type { Task, TaskPriority, TaskStatus } from "./data";

const priorityIconClass: Record<TaskPriority, string> = {
  High: "bg-red-50 text-red-600 ring-red-100",
  Medium: "bg-amber-50 text-amber-600 ring-amber-100",
  Low: "bg-slate-50 text-slate-500 ring-slate-100",
};

export function TaskKanbanCard({
  task,
  clientName,
  priorityClient = false,
  onChangeStatus,
  onOpenTask,
  showStatusControl = true,
}: {
  task: Task;
  clientName?: string;
  priorityClient?: boolean;
  onChangeStatus?: (taskId: string, status: TaskStatus) => void;
  onOpenTask: (task: Task) => void;
  showStatusControl?: boolean;
}) {
  const progress = checklistProgress(task);
  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        {clientName && (
          <p className="flex items-center gap-1 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {priorityClient && (
              <Star
                className="h-3 w-3 shrink-0 fill-amber-500 text-amber-500"
                aria-label="Priority client"
              />
            )}
            <span className="truncate">{clientName}</span>
          </p>
        )}
        <p className="text-sm font-medium text-gray-900">{task.title}</p>
      </div>
      {task.dueDate && (
        <span className="block text-xs text-gray-400">{task.dueDate}</span>
      )}
      {progress.total > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span>Checklist</span>
            <span className="tabular-nums">{progress.completed}/{progress.total}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[#0b7de3]" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
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
