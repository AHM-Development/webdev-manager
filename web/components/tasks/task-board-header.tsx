"use client";

import { Button, Input } from "@heroui/react";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";

import type { Project } from "@/components/projects/data";

export function TaskBoardHeader({
  project,
  allClients = false,
  index,
  total,
  canPrev,
  canNext,
  searchValue,
  onSearchChange,
  onPrev,
  onNext,
  onOpenSwitcher,
  onAddTask,
}: {
  project: Project | null;
  allClients?: boolean;
  index: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onOpenSwitcher: () => void;
  onAddTask: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-200 pb-3">
      <div className="flex items-center gap-1">
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          isDisabled={!canPrev}
          onPress={onPrev}
          aria-label="Previous project"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <button
          type="button"
          onClick={onOpenSwitcher}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-gray-100"
          title="Switch client (⌘K)"
        >
          <span className="text-lg font-semibold text-gray-900">
            {allClients ? "All clients" : project?.clientName ?? "All clients"}
          </span>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </button>

        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          isDisabled={!canNext}
          onPress={onNext}
          aria-label="Next project"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-3">
        {onSearchChange && (
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              aria-label="Search board tasks"
              value={searchValue ?? ""}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search task, client, assignee…"
              className="w-full pl-9"
            />
          </div>
        )}
        {!allClients && (
          <span className="text-sm text-gray-400">
            {index + 1} / {total}
          </span>
        )}
        <Button variant="primary" size="sm" onPress={onAddTask}>
          <Plus className="h-4 w-4" />
          Add Task
        </Button>
      </div>
    </div>
  );
}
