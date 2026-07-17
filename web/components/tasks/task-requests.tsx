"use client";

import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { Check, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { Project } from "@/components/projects/data";
import { SearchableFilter } from "@/components/ui/searchable-filter";

import type { Task, TaskRequestStatus } from "./data";

const STATUS_STYLE: Record<TaskRequestStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-100",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  rejected: "bg-rose-50 text-rose-700 ring-rose-100",
};

const STATUS_LABEL: Record<TaskRequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const ALL = "all";

export function TaskRequests({
  requests,
  projects,
  canReview,
  onApprove,
  onReject,
  onOpenTask,
  onAddTask,
  addTaskLabel = "Add Task",
}: {
  requests: Task[];
  projects: Project[];
  canReview: boolean;
  onApprove: (taskId: string) => void;
  onReject: (taskId: string) => void;
  onOpenTask: (task: Task) => void;
  onAddTask?: () => void;
  addTaskLabel?: string;
}) {
  const [client, setClient] = useState<string>(ALL);

  const projectName = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.clientName]));
    return (id: string) => map.get(id) ?? "—";
  }, [projects]);

  // Only clients that actually have requests, so the filter stays useful.
  const clientOptions = useMemo(() => {
    const ids = Array.from(new Set(requests.map((r) => r.projectId)));
    return ids
      .map((id) => ({ id, label: projectName(id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [requests, projectName]);

  const filtered = useMemo(
    () => (client === ALL ? requests : requests.filter((r) => r.projectId === client)),
    [requests, client]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-slate-600">Client</label>
        <SearchableFilter
          ariaLabel="Filter by client"
          value={client}
          onChange={(value) => setClient(value || ALL)}
          options={[
            { key: ALL, label: "All clients" },
            ...clientOptions.map((option) => ({ key: option.id, label: option.label })),
          ]}
          placeholder="All clients"
          triggerClassName="w-56"
        />
        <div className="ml-auto flex items-center gap-2">
          {onAddTask && (
            <Button variant="primary" onPress={onAddTask}>
              <Plus className="h-4 w-4" /> {addTaskLabel}
            </Button>
          )}
          <span className="text-xs text-slate-500">
            {filtered.length} request{filtered.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          No task requests{client === ALL ? "" : " for this client"} yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
        <Table aria-label="Task requests">
          <TableContent className="min-w-[720px]">
            <TableHeader>
              <TableColumn id="title" isRowHeader>Task</TableColumn>
              <TableColumn id="client">Client</TableColumn>
              <TableColumn id="by">Requested by</TableColumn>
              <TableColumn id="status">Status</TableColumn>
              <TableColumn id="actions">{" "}</TableColumn>
            </TableHeader>
            <TableBody>
              {filtered.map((task) => {
                const status = (task.requestStatus ?? "pending") as TaskRequestStatus;
                return (
                  <TableRow key={task.id} id={task.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => onOpenTask(task)}
                        className="text-left font-medium text-slate-900 hover:text-[#0b7de3]"
                      >
                        {task.title}
                      </button>
                    </TableCell>
                    <TableCell>{projectName(task.projectId)}</TableCell>
                    <TableCell>{task.requestedByName ?? "—"}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${STATUS_STYLE[status]}`}
                      >
                        {STATUS_LABEL[status]}
                      </span>
                    </TableCell>
                    <TableCell>
                      {canReview && status === "pending" ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onPress={() => onApprove(task.id)}
                          >
                            <Check className="h-4 w-4" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="tertiary"
                            onPress={() => onReject(task.id)}
                          >
                            <X className="h-4 w-4" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end">
                          <Button size="sm" variant="tertiary" onPress={() => onOpenTask(task)}>
                            View
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </TableContent>
        </Table>
        </div>
      )}
    </div>
  );
}
