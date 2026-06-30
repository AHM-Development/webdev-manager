"use client";

import { Button } from "@heroui/react";
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";

import type { Project } from "@/components/projects/data";

export function TaskBoardHeader({
  project,
  index,
  total,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onOpenSwitcher,
  onAddTask,
}: {
  project: Project;
  index: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
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
          title="Switch project (⌘K)"
        >
          <span className="text-lg font-semibold text-gray-900">
            {project.clientName}
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
        <span className="text-sm text-gray-400">
          {index + 1} / {total}
        </span>
        <Button variant="primary" size="sm" onPress={onAddTask}>
          <Plus className="h-4 w-4" />
          Add Task
        </Button>
      </div>
    </div>
  );
}
