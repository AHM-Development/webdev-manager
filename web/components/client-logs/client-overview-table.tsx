"use client";

import {
  Button,
  Chip,
  Input,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
  PaginationSummary,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableFooter,
  TableHeader,
  TableRow,
  TableScrollContainer,
  TextField,
} from "@heroui/react";

import type { ClientLogsStatus, ClientOverviewResult } from "@/libs/api/client-logs";

import { formatDate } from "./status";
import { SelectField } from "./ui-fields";

const STATUS_META: Record<ClientLogsStatus, { label: string; color: "success" | "warning" | "danger" | "accent" | "default" }> = {
  not_created: { label: "Not created", color: "default" },
  on_track: { label: "On track", color: "success" },
  at_risk: { label: "At risk", color: "warning" },
  delayed: { label: "Delayed", color: "danger" },
  blocked: { label: "Blocked", color: "danger" },
  live: { label: "Live", color: "accent" },
  post_launch_review: { label: "Post-launch", color: "accent" },
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "not_created", label: "Not created" },
  { value: "on_track", label: "On track" },
  { value: "at_risk", label: "At risk" },
  { value: "delayed", label: "Delayed" },
  { value: "blocked", label: "Blocked" },
  { value: "live", label: "Live" },
];

export function ClientOverviewTable({
  data,
  loading,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  page,
  onPageChange,
  onOpen,
  onSetup,
  canClear = false,
  onClear,
}: {
  data: ClientOverviewResult | null;
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  page: number;
  onPageChange: (page: number) => void;
  onOpen: (projectId: string) => void;
  onSetup?: (projectId: string) => void;
  canClear?: boolean;
  onClear?: (projectId: string, clientName: string) => void;
}) {
  const clients = data?.clients ?? [];
  const summary = data?.summary;
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      {summary && (
        <div className="grid gap-3 md:grid-cols-5">
          {[
            ["Clients", summary.total, "text-slate-950"],
            ["Delayed", summary.delayed, summary.delayed ? "text-rose-600" : "text-slate-950"],
            ["Blocked", summary.blocked, summary.blocked ? "text-rose-600" : "text-slate-950"],
            ["Approaching launch", summary.approachingLaunch, "text-amber-600"],
            ["Live", summary.live, "text-emerald-600"],
          ].map(([label, value, tone]) => (
            <div key={label as string} className="rounded-md border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">{label}</p>
              <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>{value as number}</p>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[170px]">
          <SelectField
            ariaLabel="Status filter"
            value={statusFilter}
            onChange={onStatusFilterChange}
            options={STATUS_FILTERS}
          />
        </div>
        <TextField aria-label="Search clients" value={search} onChange={onSearchChange} className="min-w-[220px]">
          <Input placeholder="Search clients…" />
        </TextField>
      </div>

      {/* Table */}
      <div className="app-table-shell overflow-x-auto">
        <Table aria-label="Client Logs overview">
          <TableScrollContainer>
            <TableContent className="min-w-[1040px]">
              <TableHeader>
                <TableColumn id="client" isRowHeader>Client</TableColumn>
                <TableColumn id="status">Client Logs</TableColumn>
                <TableColumn id="stage">Current stage</TableColumn>
                <TableColumn id="progress">Progress</TableColumn>
                <TableColumn id="readiness">Launch</TableColumn>
                <TableColumn id="blockers">Blockers</TableColumn>
                <TableColumn id="milestone">Next milestone</TableColumn>
                <TableColumn id="updated">Updated</TableColumn>
                <TableColumn id="action">Action</TableColumn>
              </TableHeader>
              <TableBody>
                {clients.map((client) => {
                  const meta = STATUS_META[client.status] ?? STATUS_META.not_created;
                  return (
                    <TableRow key={client.projectId} id={client.projectId}>
                      <TableCell>
                        <button type="button" onClick={() => onOpen(client.projectId)} className="text-left">
                          <p className="font-semibold text-slate-950 hover:text-blue-600">{client.clientName}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{client.projectType} · {client.projectStatus}</p>
                        </button>
                      </TableCell>
                      <TableCell><Chip size="sm" variant="soft" color={meta.color}>{meta.label}</Chip></TableCell>
                      <TableCell>
                        {client.currentStage ? (
                          <div>
                            <p className="text-sm text-slate-800">{client.currentStage}</p>
                            <p className="text-xs text-slate-400">{client.currentOwner ?? "Unassigned"}</p>
                          </div>
                        ) : <span className="text-sm text-slate-400">—</span>}
                      </TableCell>
                      <TableCell>
                        {client.hasTimeline ? (
                          <div className="w-24">
                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                              <div className="h-full rounded-full bg-blue-600" style={{ width: `${client.progress}%` }} />
                            </div>
                            <span className="mt-0.5 block text-right text-[10px] tabular-nums text-slate-400">{client.progress}%</span>
                          </div>
                        ) : <span className="text-sm text-slate-400">—</span>}
                      </TableCell>
                      <TableCell>
                        {client.readinessPercentage != null ? (
                          <span className="text-sm font-semibold tabular-nums text-slate-800">{client.readinessPercentage}%</span>
                        ) : <span className="text-sm text-slate-400">—</span>}
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm tabular-nums ${client.blockerCount ? "font-semibold text-rose-600" : "text-slate-400"}`}>
                          {client.blockerCount || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {client.nextMilestone ? (
                          <span className="whitespace-nowrap text-sm text-slate-700">
                            {client.nextMilestone.name}
                            {client.nextMilestone.date ? ` · ${formatDate(client.nextMilestone.date)}` : ""}
                          </span>
                        ) : <span className="text-sm text-slate-400">—</span>}
                      </TableCell>
                      <TableCell><span className="whitespace-nowrap text-sm text-slate-500">{formatDate(client.lastUpdated)}</span></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {client.hasTimeline ? (
                            <Button size="sm" variant="tertiary" onPress={() => onOpen(client.projectId)}>Open</Button>
                          ) : (
                            <Button size="sm" variant="tertiary" onPress={() => (onSetup ?? onOpen)(client.projectId)}>Set up</Button>
                          )}
                          {canClear && client.hasTimeline && onClear && (
                            <Button size="sm" variant="tertiary" className="text-rose-600" onPress={() => onClear(client.projectId, client.clientName)}>
                              Clear
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </TableContent>
          </TableScrollContainer>
          <TableFooter>
            <Pagination>
              <PaginationSummary>
                {pagination && pagination.total
                  ? `Showing ${(pagination.page - 1) * pagination.pageSize + 1}-${Math.min(pagination.page * pagination.pageSize, pagination.total)} of ${pagination.total}`
                  : loading ? "Loading clients…" : "No clients found"}
              </PaginationSummary>
              {pagination && pagination.totalPages > 1 && (
                <PaginationContent>
                  <PaginationItem><PaginationPrevious isDisabled={page === 1} onPress={() => onPageChange(Math.max(1, page - 1))}>Prev</PaginationPrevious></PaginationItem>
                  <PaginationItem><span className="px-2 text-sm text-slate-500">Page {pagination.page} of {pagination.totalPages}</span></PaginationItem>
                  <PaginationItem><PaginationNext isDisabled={page === pagination.totalPages} onPress={() => onPageChange(Math.min(pagination.totalPages, page + 1))}>Next</PaginationNext></PaginationItem>
                </PaginationContent>
              )}
            </Pagination>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
