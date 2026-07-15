import type { StageStatus } from "@/libs/api/client-logs";

type ChipColor = "success" | "warning" | "danger" | "accent" | "default";

/** Status presentation. `mark` gives a non-colour cue so status never relies on colour alone. */
export const STAGE_STATUS_META: Record<StageStatus, { label: string; color: ChipColor; mark: string; bar: string }> = {
  not_started: { label: "Not started", color: "default", mark: "○", bar: "bg-slate-300" },
  upcoming: { label: "Upcoming", color: "default", mark: "◔", bar: "bg-slate-400" },
  in_progress: { label: "In progress", color: "accent", mark: "◑", bar: "bg-blue-500" },
  awaiting_review: { label: "Awaiting review", color: "warning", mark: "⏳", bar: "bg-amber-500" },
  blocked: { label: "Blocked", color: "danger", mark: "⛔", bar: "bg-rose-500" },
  delayed: { label: "Delayed", color: "danger", mark: "!", bar: "bg-rose-500" },
  completed: { label: "Completed", color: "success", mark: "✓", bar: "bg-emerald-500" },
  verified: { label: "Verified", color: "success", mark: "✓✓", bar: "bg-emerald-600" },
  on_hold: { label: "On hold", color: "default", mark: "⏸", bar: "bg-slate-400" },
};

export function statusMeta(status: StageStatus) {
  return STAGE_STATUS_META[status] ?? STAGE_STATUS_META.not_started;
}

// ---- date helpers (native Date, no dependency) ----
export function toDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

export function formatDate(value?: string | null): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "2-digit" }).format(date);
}

export function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date);
}
