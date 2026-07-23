"use client";

import {
  UNASSIGNED,
  buildAssigneeColumns,
  type Task,
  type TaskStatus,
} from "./data";
import { KanbanColumn, type MoveHandler } from "./kanban-column";

function tasksForColumn(
  tasks: Task[],
  column: string,
  knownAssignees: Set<string>
): Task[] {
  if (column === UNASSIGNED) {
    // Anything not assigned to a known column lands in Unassigned.
    return tasks.filter((t) => !knownAssignees.has(t.assignee));
  }
  return tasks.filter((t) => t.assignee === column);
}

export function KanbanBoard({
  projectId,
  clientName,
  getClientName,
  priorityClient,
  getPriorityClient,
  tasks,
  assigneeNames,
  onMove,
  onChangeStatus,
  onOpenTask,
}: {
  projectId: string;
  clientName?: string;
  getClientName?: (task: Task) => string | undefined;
  priorityClient?: boolean;
  getPriorityClient?: (task: Task) => boolean;
  tasks: Task[];
  assigneeNames: string[];
  onMove: MoveHandler;
  onChangeStatus: (taskId: string, status: TaskStatus) => void;
  onOpenTask: (task: Task) => void;
}) {
  const columns = buildAssigneeColumns(assigneeNames, tasks);
  // Every column except "Unassigned" represents a known assignee name.
  const knownAssignees = new Set(columns.filter((c) => c !== UNASSIGNED));

  return (
    <div className="flex h-full gap-4 overflow-x-auto pb-2">
      {columns.map((col) => (
        <KanbanColumn
          key={`${projectId}-${col}`}
          assignee={col}
          clientName={clientName}
          getClientName={getClientName}
          priorityClient={priorityClient}
          getPriorityClient={getPriorityClient}
          tasks={tasksForColumn(tasks, col, knownAssignees)}
          onMove={onMove}
          onChangeStatus={onChangeStatus}
          onOpenTask={onOpenTask}
        />
      ))}
    </div>
  );
}
