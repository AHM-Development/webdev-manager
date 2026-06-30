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

import { ISSUE_STATUSES, type IssueStatus } from "./data";

const statusChip: Record<IssueStatus, string> = {
  Open: "bg-slate-100 text-slate-700",
  "In Progress": "bg-[var(--brand-soft)] text-[var(--brand-strong)]",
  Fixed: "bg-green-100 text-green-700",
};

export function IssueStatusSelect({
  status,
  onChange,
}: {
  status: IssueStatus;
  onChange: (status: IssueStatus) => void;
}) {
  return (
    <Select
      aria-label="Change issue status"
      selectedKey={status}
      onSelectionChange={(key) => onChange(key as IssueStatus)}
    >
      <SelectTrigger
        className={`inline-flex min-h-auto items-center gap-1 rounded-full border-0 px-2.5 py-1 text-xs font-medium shadow-none ${statusChip[status]}`}
      >
        <SelectValue>{status}</SelectValue>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </SelectTrigger>
      <SelectPopover>
        <ListBox>
          {ISSUE_STATUSES.map((s) => (
            <ListBoxItem key={s} id={s}>
              {s}
            </ListBoxItem>
          ))}
        </ListBox>
      </SelectPopover>
    </Select>
  );
}
