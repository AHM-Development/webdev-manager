"use client";

import { Chip } from "@heroui/react";
import { useMemo } from "react";

import type { ClientLogStage } from "@/libs/api/client-logs";

import {
  addDays,
  daysBetween,
  formatDate,
  formatDateShort,
  startOfDay,
  statusMeta,
  toDate,
} from "./status";

export type GanttScale = "day" | "week" | "month";

const ROW_H = 46;
const HEADER_H = 44;
const LEFT_W = 360;
const PX_PER_DAY: Record<GanttScale, number> = { day: 30, week: 12, month: 4.2 };

function collectDates(stages: ClientLogStage[]): Date[] {
  const dates: Date[] = [];
  for (const stage of stages) {
    for (const value of [stage.plannedStart, stage.plannedEnd, stage.actualStart, stage.actualEnd]) {
      const date = toDate(value);
      if (date) dates.push(date);
    }
  }
  return dates;
}

function buildTicks(start: Date, totalDays: number, scale: GanttScale, pxPerDay: number) {
  const ticks: { x: number; label: string; major: boolean }[] = [];
  if (scale === "day") {
    for (let i = 0; i <= totalDays; i += 1) {
      const date = addDays(start, i);
      const isMonthStart = date.getDate() === 1;
      ticks.push({ x: i * pxPerDay, label: isMonthStart ? formatDateShort(date) : String(date.getDate()), major: isMonthStart });
    }
  } else if (scale === "week") {
    for (let i = 0; i <= totalDays; i += 7) {
      ticks.push({ x: i * pxPerDay, label: formatDateShort(addDays(start, i)), major: false });
    }
  } else {
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const end = addDays(start, totalDays);
    while (cursor <= end) {
      ticks.push({
        x: daysBetween(start, cursor) * pxPerDay,
        label: new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" }).format(cursor),
        major: true,
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  }
  return ticks;
}

/** Simplified stacked timeline for small screens — the two-pane Gantt doesn't fit. */
function MobileTimeline({
  stages,
  onOpenStage,
}: {
  stages: ClientLogStage[];
  onOpenStage: (id: string) => void;
}) {
  const nameById = new Map(stages.map((stage) => [stage.id, stage.name]));
  return (
    <ol className="space-y-2">
      {stages.map((stage) => {
        const meta = statusMeta(stage.status);
        const predecessors = (stage.dependsOn ?? [])
          .map((id) => nameById.get(id))
          .filter((name): name is string => Boolean(name));
        return (
          <li key={stage.id}>
            <button
              type="button"
              onClick={() => onOpenStage(stage.id)}
              className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left hover:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                  {stage.isMilestone && <span className="text-amber-500">◆</span>}
                  <span>{stage.name}</span>
                  {!stage.isRequired && <span className="text-[10px] font-normal text-slate-400">(optional)</span>}
                </span>
                <Chip size="sm" variant="soft" color={meta.color}>
                  <span aria-hidden className="mr-1">{meta.mark}</span>
                  {meta.label}
                </Chip>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                  <span className="block h-full rounded-full bg-blue-600" style={{ width: `${stage.progress}%` }} />
                </span>
                <span className="text-[10px] tabular-nums text-slate-400">{stage.progress}%</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>{stage.ownerName ?? "Unassigned"}</span>
                {(stage.plannedStart || stage.plannedEnd) && (
                  <span>{formatDate(stage.plannedStart)} → {formatDate(stage.plannedEnd)}</span>
                )}
                {stage.isDelayed && <span className="font-medium text-rose-600">Delayed</span>}
                {predecessors.length > 0 && <span>After: {predecessors.join(", ")}</span>}
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function GanttChart({
  stages,
  scale,
  onOpenStage,
}: {
  stages: ClientLogStage[];
  scale: GanttScale;
  onOpenStage: (id: string) => void;
}) {
  const model = useMemo(() => {
    const pxPerDay = PX_PER_DAY[scale];
    const dates = collectDates(stages);
    const today = startOfDay(new Date());
    let rangeStart = dates.length ? startOfDay(new Date(Math.min(...dates.map((d) => d.getTime())))) : addDays(today, -14);
    let rangeEnd = dates.length ? startOfDay(new Date(Math.max(...dates.map((d) => d.getTime())))) : addDays(today, 30);
    rangeStart = addDays(rangeStart, -3);
    rangeEnd = addDays(rangeEnd, 5);
    const totalDays = Math.max(1, daysBetween(rangeStart, rangeEnd));
    const width = (totalDays + 1) * pxPerDay;
    const x = (value?: string | null) => {
      const date = toDate(value);
      return date ? daysBetween(rangeStart, date) * pxPerDay : null;
    };
    return {
      pxPerDay,
      width,
      x,
      todayX: today >= rangeStart && today <= rangeEnd ? daysBetween(rangeStart, today) * pxPerDay : null,
      ticks: buildTicks(rangeStart, totalDays, scale, pxPerDay),
    };
  }, [stages, scale]);

  const bodyHeight = stages.length * ROW_H;

  // Anchor points (bar edges + row centre) per stage, for drawing dependency arrows.
  const anchors = useMemo(() => {
    const map = new Map<string, { leftX: number; rightX: number; centerY: number }>();
    stages.forEach((stage, rowIndex) => {
      const startX = model.x(stage.plannedStart);
      const endX = model.x(stage.plannedEnd);
      const centerY = rowIndex * ROW_H + ROW_H / 2;
      if (stage.isMilestone && startX != null) {
        const px = endX ?? startX;
        map.set(stage.id, { leftX: px, rightX: px, centerY });
      } else if (startX != null && endX != null && endX >= startX) {
        const width = Math.max(model.pxPerDay, endX - startX);
        map.set(stage.id, { leftX: startX, rightX: startX + width, centerY });
      }
    });
    return map;
  }, [stages, model]);

  // A cubic path from each predecessor's right edge to the dependent stage's left edge.
  const dependencyPaths = useMemo(() => {
    const paths: { id: string; d: string }[] = [];
    stages.forEach((stage) => {
      const target = anchors.get(stage.id);
      if (!target || !stage.dependsOn?.length) return;
      stage.dependsOn.forEach((depId) => {
        const source = anchors.get(depId);
        if (!source) return;
        const x1 = source.rightX;
        const y1 = source.centerY;
        const x2 = target.leftX;
        const y2 = target.centerY;
        const dx = Math.max(12, Math.min(40, Math.abs(x2 - x1) / 2));
        paths.push({ id: `${depId}-${stage.id}`, d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}` });
      });
    });
    return paths;
  }, [stages, anchors]);

  return (
    <>
      {/* Mobile: simplified stacked timeline */}
      <div className="md:hidden">
        <MobileTimeline stages={stages} onOpenStage={onOpenStage} />
      </div>

      {/* Desktop: full two-pane Gantt */}
      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white md:flex">
      {/* Left columns */}
      <div className="shrink-0 border-r border-slate-200" style={{ width: LEFT_W }}>
        <div
          className="flex items-center gap-2 border-b border-slate-100 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400"
          style={{ height: HEADER_H }}
        >
          <span className="flex-1">Stage</span>
          <span className="w-24">Owner</span>
          <span className="w-16 text-right">Progress</span>
        </div>
        {stages.map((stage) => {
          const meta = statusMeta(stage.status);
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => onOpenStage(stage.id)}
              className="flex w-full items-center gap-2 border-b border-slate-100 px-3 text-left hover:bg-slate-50"
              style={{ height: ROW_H }}
            >
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-900">
                  {stage.isMilestone && <span title="Milestone" className="text-amber-500">◆</span>}
                  <span className="truncate">{stage.name}</span>
                  {!stage.isRequired && <span className="text-[10px] font-normal text-slate-400">(optional)</span>}
                </span>
                <span className="mt-0.5 block">
                  <Chip size="sm" variant="soft" color={meta.color}>
                    <span aria-hidden className="mr-1">{meta.mark}</span>
                    {meta.label}
                  </Chip>
                </span>
              </span>
              <span className="w-24 truncate text-xs text-slate-500">{stage.ownerName ?? "Unassigned"}</span>
              <span className="w-16">
                <span className="block h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <span className="block h-full rounded-full bg-blue-600" style={{ width: `${stage.progress}%` }} />
                </span>
                <span className="mt-0.5 block text-right text-[10px] tabular-nums text-slate-400">{stage.progress}%</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-x-auto">
        <div style={{ width: model.width }}>
          {/* Header ticks */}
          <div className="relative border-b border-slate-100" style={{ height: HEADER_H }}>
            {model.ticks.map((tick, index) => (
              <div
                key={index}
                className="absolute top-0 flex h-full items-center"
                style={{ left: tick.x }}
              >
                <span
                  className={`whitespace-nowrap pl-1 text-[10px] ${tick.major ? "font-semibold text-slate-600" : "text-slate-400"}`}
                >
                  {tick.label}
                </span>
              </div>
            ))}
          </div>

          {/* Rows + overlays */}
          <div className="relative" style={{ height: bodyHeight }}>
            {/* gridlines */}
            {model.ticks.map((tick, index) => (
              <div
                key={index}
                className={`absolute top-0 w-px ${tick.major ? "bg-slate-200" : "bg-slate-100"}`}
                style={{ left: tick.x, height: bodyHeight }}
              />
            ))}
            {/* dependency arrows (behind bars) */}
            {dependencyPaths.length > 0 && (
              <svg
                className="pointer-events-none absolute inset-0 z-[3]"
                width={model.width}
                height={bodyHeight}
                aria-hidden
              >
                <defs>
                  <marker id="cl-dep-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
                  </marker>
                </defs>
                {dependencyPaths.map((path) => (
                  <path
                    key={path.id}
                    d={path.d}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    markerEnd="url(#cl-dep-arrow)"
                  />
                ))}
              </svg>
            )}
            {/* today line */}
            {model.todayX != null && (
              <div
                className="absolute top-0 z-10 w-0.5 bg-rose-400"
                style={{ left: model.todayX, height: bodyHeight }}
                title="Today"
              />
            )}
            {/* bars */}
            {stages.map((stage, rowIndex) => {
              const meta = statusMeta(stage.status);
              const startX = model.x(stage.plannedStart);
              const endX = model.x(stage.plannedEnd);
              const actualStartX = model.x(stage.actualStart);
              const actualEndX = model.x(stage.actualEnd);
              const top = rowIndex * ROW_H;
              const hasBar = startX != null && endX != null && endX >= startX;
              const barLeft = startX ?? 0;
              const barWidth = hasBar ? Math.max(model.pxPerDay, (endX as number) - (startX as number)) : 0;
              const tooltip = `${stage.name}\nStatus: ${meta.label}\nPlanned: ${formatDate(stage.plannedStart)} → ${formatDate(stage.plannedEnd)}\nActual: ${formatDate(stage.actualStart)} → ${formatDate(stage.actualEnd)}\nOwner: ${stage.ownerName ?? "Unassigned"}`;
              return (
                <div key={stage.id} className="absolute left-0 right-0" style={{ top, height: ROW_H }}>
                  {stage.isMilestone && startX != null ? (
                    <button
                      type="button"
                      onClick={() => onOpenStage(stage.id)}
                      title={tooltip}
                      aria-label={`${stage.name} milestone`}
                      className="absolute z-[5] flex items-center justify-center"
                      style={{ left: (endX ?? startX) - 7, top: ROW_H / 2 - 7 }}
                    >
                      <span className={`block h-3.5 w-3.5 rotate-45 rounded-[2px] ${meta.bar}`} />
                    </button>
                  ) : null}
                  {hasBar && !stage.isMilestone ? (
                    <button
                      type="button"
                      onClick={() => onOpenStage(stage.id)}
                      title={tooltip}
                      aria-label={`${stage.name}, ${meta.label}`}
                      className={`absolute z-[5] flex items-center overflow-hidden rounded-md px-2 text-left ${meta.bar} ${stage.isDelayed ? "ring-1 ring-rose-700" : ""}`}
                      style={{ left: barLeft, width: barWidth, top: 10, height: ROW_H - 22 }}
                    >
                      <span className="truncate text-[11px] font-medium text-white">
                        {stage.isDelayed ? "! " : ""}
                        {barWidth > 60 ? stage.name : ""}
                      </span>
                    </button>
                  ) : null}
                  {/* actual strip */}
                  {actualStartX != null && !stage.isMilestone ? (
                    <div
                      className="absolute z-[4] h-1.5 rounded-full bg-slate-700/70"
                      style={{
                        left: actualStartX,
                        width: Math.max(model.pxPerDay / 2, (actualEndX ?? model.todayX ?? actualStartX) - actualStartX),
                        top: ROW_H - 12,
                      }}
                      title={`Actual: ${formatDate(stage.actualStart)} → ${formatDate(stage.actualEnd)}`}
                    />
                  ) : null}
                  {!hasBar && !stage.isMilestone ? (
                    <span className="absolute left-2 text-[11px] text-slate-300" style={{ top: ROW_H / 2 - 8 }}>
                      No dates set
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
