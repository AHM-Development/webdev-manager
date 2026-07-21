"use client";

import {
  Avatar,
  AvatarFallback,
} from "@heroui/react";
import { useState } from "react";
import {
  GridList,
  GridListItem,
  isTextDropItem,
  useDragAndDrop,
} from "react-aria-components";

import { STATUSES, UNASSIGNED, type Task, type TaskStatus } from "./data";
import { TaskKanbanCard } from "./kanban-card";
import { SearchableFilter } from "@/components/ui/searchable-filter";

const DRAG_TYPE = "application/x-wpm-task";
const ALL = "all";

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export type MoveHandler = (
  ids: string[],
  toAssignee: string,
  targetId?: string,
  position?: "before" | "after"
) => void;

export function KanbanColumn({
  assignee,
  clientName,
  tasks,
  onMove,
  onChangeStatus,
  onOpenTask,
}: {
  assignee: string;
  clientName?: string;
  tasks: Task[];
  onMove: MoveHandler;
  onChangeStatus: (taskId: string, status: TaskStatus) => void;
  onOpenTask: (task: Task) => void;
}) {
  const isUnassigned = assignee === UNASSIGNED;
  const [filter, setFilter] = useState<string>(ALL);

  const visible =
    filter === ALL ? tasks : tasks.filter((t) => t.status === filter);

  const dropPos = (p: string): "before" | "after" =>
    p === "after" ? "after" : "before";

  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) =>
      [...keys].map((key) => {
        const t = tasks.find((x) => x.id === key);
        return {
          [DRAG_TYPE]: JSON.stringify({ id: String(key) }),
          "text/plain": t?.title ?? "",
        };
      }),
    acceptedDragTypes: [DRAG_TYPE],
    getDropOperation: () => "move",
    onInsert: async (e) => {
      const ids = await Promise.all(
        e.items
          .filter(isTextDropItem)
          .map(
            async (i) =>
              (JSON.parse(await i.getText(DRAG_TYPE)) as { id: string }).id
          )
      );
      onMove(ids, assignee, String(e.target.key), dropPos(e.target.dropPosition));
    },
    onRootDrop: async (e) => {
      const ids = await Promise.all(
        e.items
          .filter(isTextDropItem)
          .map(
            async (i) =>
              (JSON.parse(await i.getText(DRAG_TYPE)) as { id: string }).id
          )
      );
      onMove(ids, assignee);
    },
    onReorder: (e) => {
      onMove(
        [...e.keys].map(String),
        assignee,
        String(e.target.key),
        dropPos(e.target.dropPosition)
      );
    },
  });

  return (
    <div className="kanban-column flex h-full w-72 shrink-0 flex-col">
      <div className="space-y-2 border-b border-slate-100 px-3 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isUnassigned ? (
              <span className="text-sm font-semibold text-slate-600">
                Unassigned Tasks
              </span>
            ) : (
              <>
                <Avatar className="h-6 w-6 text-[10px]">
                  <AvatarFallback>{initials(assignee)}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-semibold text-slate-800">
                  {assignee}
                </span>
              </>
            )}
          </div>
          <span className="rounded-full bg-[#e8f5ff] px-2 py-0.5 text-xs font-semibold text-[#082a78]">
            {visible.length}
          </span>
        </div>

        {/* Per-column status filter (not for the Unassigned column) */}
        {!isUnassigned && (
          <SearchableFilter
            ariaLabel={`Filter ${assignee} by status`}
            value={filter}
            onChange={setFilter}
            options={[
              { key: ALL, label: "All statuses" },
              ...STATUSES.map((status) => ({ key: status, label: status })),
            ]}
            placeholder="All statuses"
            className="w-40"
            triggerClassName="h-8 w-40 bg-[#f7f8fa] text-xs"
          />
        )}
      </div>

      <GridList
        aria-label={`${assignee} tasks`}
        items={visible}
        dragAndDropHooks={dragAndDropHooks}
        renderEmptyState={() => (
          <div className="px-3 py-6 text-center text-xs text-gray-400">
            {tasks.length === 0 ? "Drop tasks here" : "No matching tasks"}
          </div>
        )}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2 outline-none"
      >
        {(item) => (
          <GridListItem
            id={item.id}
            textValue={item.title}
            className="kanban-card cursor-grab p-3 outline-none transition-transform hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#0b7de3] data-[dragging=true]:opacity-50"
          >
            <TaskKanbanCard
              task={item}
              clientName={clientName}
              onChangeStatus={onChangeStatus}
              onOpenTask={onOpenTask}
            />
          </GridListItem>
        )}
      </GridList>
    </div>
  );
}
