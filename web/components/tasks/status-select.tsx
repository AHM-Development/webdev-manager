"use client";

import {
  ListBox,
  ListBoxItem,
  Select,
  SelectPopover,
  SelectTrigger,
  SelectValue,
} from "@heroui/react";
import { ChevronDown } from "lucide-react";

import { STATUSES, type TaskStatus } from "./data";

/** Color-coded chip classes per status. */
const statusChip: Record<TaskStatus, string> = {
  Backlog: "bg-gray-100 text-gray-700",
  "To Do": "bg-gray-100 text-gray-700",
  "In Progress": "bg-blue-100 text-blue-700",
  Review: "bg-amber-100 text-amber-700",
  Blocked: "bg-red-100 text-red-700",
  Done: "bg-green-100 text-green-700",
};

/** Chip-style status picker with a chevron — used on board cards and the summary. */
export function StatusSelect({
  status,
  onChange,
}: {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
}) {
  return (
    <Select
      aria-label="Change status"
      selectedKey={status}
      onSelectionChange={(key) => onChange(key as TaskStatus)}
    >
      <SelectTrigger
        className={`inline-flex min-h-auto items-center gap-1 rounded-full border-0 px-2.5 py-1 text-xs font-medium shadow-none ${statusChip[status]}`}
      >
        <SelectValue>{status}</SelectValue>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </SelectTrigger>
      <SelectPopover>
        <ListBox>
          {STATUSES.map((s) => (
            <ListBoxItem key={s} id={s}>
              {s}
            </ListBoxItem>
          ))}
        </ListBox>
      </SelectPopover>
    </Select>
  );
}
