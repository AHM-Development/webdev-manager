"use client";

import {
  Button,
  Dropdown,
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
  useOverlayState,
} from "@heroui/react";
import {
  Download,
  ExternalLink,
  Eye,
  MoreHorizontal,
  Plug,
  Radar,
  Settings2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { Project } from "@/components/projects/data";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import {
  getWebsiteHealth,
  getWebsiteHealthCapabilities,
  listWebsiteHealth,
  startWebsiteHealthScan,
  type HealthCapabilities,
  type HealthWebsiteRow,
} from "@/libs/api/website-health";
import { notify } from "@/libs/notify";
import { realtimeEvents } from "@/libs/realtime/events";

import { AhmCorePairingModal } from "./ahm-core-pairing-modal";
import type { ProjectHealth } from "./data";
import { ExportHealthReportModal } from "./export-health-report-modal";
import { HealthDrawer } from "./health-drawer";
import { StartHealthScanModal, type StartScanOptions } from "./start-health-scan-modal";
import { WebsiteHealthProfileModal } from "./website-health-profile-modal";

const PAGE_SIZE = 8;
const ACTIVE_SCAN_STATUSES = new Set(["queued", "running"]);

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDateTime(iso?: string | null) {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function scoreTone(value: number | null | undefined) {
  if (value == null) return "text-slate-400";
  if (value >= 90) return "text-green-600";
  if (value >= 70) return "text-amber-600";
  return "text-red-600";
}

function issueTone(value: number | null | undefined) {
  if (!value) return "text-green-600";
  return value > 5 ? "text-red-600" : "text-amber-600";
}

function Metric({ value, className }: { value: number | null | undefined; className: string }) {
  return <span className={`text-sm font-semibold ${className}`}>{value ?? "-"}</span>;
}

function toProject(row: HealthWebsiteRow): Project {
  return {
    id: row.projectId,
    clientName: row.projectName,
    type: "Full Web Dev",
    assignee: { name: "Unassigned" },
    status: "In Progress",
    priority: "Medium",
    websites: [{ id: row.id, name: row.name, url: row.url }],
    domainManagement: "Client Domain",
    serverLocation: "Client",
  };
}

/** Maps a scan stage to a short, friendly phrase for the progress UI. */
const STAGE_PHRASES: Record<string, string> = {
  queued: "Queued",
  starting: "Getting ready…",
  crawling: "Crawling pages…",
  analyzing_page: "Analysing pages…",
  site_checks: "Checking site-wide SEO…",
  wordpress: "Running WordPress checks…",
  forms: "Checking forms…",
  completed: "Done",
  failed: "Scan failed",
  cancelled: "Cancelled",
};

function stagePhrase(stage: string) {
  return STAGE_PHRASES[stage] ?? "Scanning…";
}

type ActiveScanItem = {
  id: string;
  name: string;
  host: string;
  phrase: string;
  progress: number;
  queued: boolean;
};

function ActiveScansPanel({ scans }: { scans: ActiveScanItem[] }) {
  if (!scans.length) return null;
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
        <span className="text-sm font-semibold text-slate-900">Active scans</span>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-blue-700">
          {scans.length} of 5
        </span>
        <span className="ml-auto text-xs text-slate-400">New scans queue until a slot frees</span>
      </div>
      <div>
        {scans.map((scan) => (
          <div
            key={scan.id}
            className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-3.5 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                {scan.name}
                <span className="truncate text-xs font-normal text-slate-400">{scan.host}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                <span
                  className={`h-2 w-2 flex-none rounded-full ${
                    scan.queued ? "bg-slate-300" : "animate-pulse bg-blue-500"
                  }`}
                />
                {scan.phrase}
              </div>
            </div>
            {scan.queued ? (
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Queued</span>
            ) : (
              <span className="text-sm font-semibold tabular-nums text-blue-700">{scan.progress}%</span>
            )}
            <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
              {scan.queued ? (
                <div className="h-full w-1/3 animate-pulse rounded-full bg-slate-300" />
              ) : (
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: `${scan.progress}%` }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function WebsiteHealthTable() {
  const drawer = useOverlayState();
  const exportModal = useOverlayState();
  const scanModal = useOverlayState();
  const pairingModal = useOverlayState();
  const profileModal = useOverlayState();
  const [rows, setRows] = useState<HealthWebsiteRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState({
    averageHealth: null as number | null,
    pages: 0,
    forms: 0,
    criticalIssues: 0,
  });
  const [selectedRow, setSelectedRow] = useState<HealthWebsiteRow | null>(null);
  const [capabilities, setCapabilities] = useState<HealthCapabilities | null>(null);
  const [scanPrefill, setScanPrefill] = useState<{ websiteId?: string; locked: boolean }>({
    locked: false,
  });
  const [selected, setSelected] = useState<{
    project: Project;
    health: ProjectHealth;
    websiteId: string;
  } | null>(null);

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const result = await listWebsiteHealth({ page, pageSize: PAGE_SIZE });
      setRows(result.websites);
      setTotal(result.pagination.total);
      setTotalPages(result.pagination.totalPages);
      setOverview(result.overview);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Website health could not be loaded.";
      notify.error("Unable to load website health", { description: message });
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    getWebsiteHealthCapabilities()
      .then(setCapabilities)
      .catch(() => setCapabilities({ lighthouse: false, ai: false }));
  }, []);

  const openScan = (websiteId?: string) => {
    setScanPrefill({ websiteId, locked: !!websiteId });
    scanModal.open();
  };

  const activeScans: ActiveScanItem[] = rows
    .filter((row) => row.latestScan && ACTIVE_SCAN_STATUSES.has(row.latestScan.status))
    .map((row) => {
      const scan = row.latestScan!;
      const queued = scan.status === "queued";
      return {
        id: row.id,
        name: row.name,
        host: hostOf(row.url),
        phrase: queued ? "Queued — starts when a slot frees" : stagePhrase(scan.stage),
        progress: scan.progress ?? 0,
        queued,
      };
    });
  const hasActiveScan = activeScans.length > 0;

  useEffect(() => {
    if (!hasActiveScan) return;
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [hasActiveScan, load]);

  const refreshFromSocket = useCallback(() => void load(), [load]);
  useRealtimeEvent(realtimeEvents.healthScanProgress, refreshFromSocket);
  useRealtimeEvent(realtimeEvents.healthScanCompleted, refreshFromSocket);
  useRealtimeEvent(realtimeEvents.healthScanFailed, refreshFromSocket);

  const openDetails = async (row: HealthWebsiteRow, mode: "drawer" | "export") => {
    try {
      const detail = await getWebsiteHealth(row.id);
      if (!detail.audit) {
        notify.info("No scan result yet", { description: "Run a scan before opening the report." });
        return;
      }
      setSelected({
        project: toProject(row),
        health: { websites: [detail.audit] },
        websiteId: row.id,
      });
      if (mode === "drawer") drawer.open();
      else exportModal.open();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The website report could not be loaded.";
      notify.error("Unable to open report", { description: message });
    }
  };

  const startScan = async (websiteId: string, options: StartScanOptions) => {
    try {
      await startWebsiteHealthScan(websiteId, options);
      notify.success("Website scan queued");
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The scan could not be started.";
      notify.error("Unable to start scan", { description: message });
      throw error;
    }
  };

  const openPairing = (row: HealthWebsiteRow) => {
    setSelectedRow(row);
    pairingModal.open();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Website Health</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Scan every registered website for Lighthouse, technical SEO, design and content QA,
            forms, WordPress maintenance, and security issues.
          </p>
        </div>
        <Button variant="primary" size="sm" onPress={() => openScan()}>
          <Radar className="h-4 w-4" />
          Scan Website
        </Button>
      </div>

      <ActiveScansPanel scans={activeScans} />

      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["Average Health", overview.averageHealth ?? "-"],
          ["Websites", total],
          ["Pages Scanned", overview.pages],
          ["Forms Found", overview.forms],
          ["Critical Issues", overview.criticalIssues],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <div className="app-table-shell overflow-x-auto">
        <Table aria-label="Website health overview">
          <TableScrollContainer>
            <TableContent className="min-w-[1120px]">
              <TableHeader>
                <TableColumn id="website" isRowHeader>Website</TableColumn>
                <TableColumn id="overall">Overall</TableColumn>
                <TableColumn id="pages">Pages</TableColumn>
                <TableColumn id="lighthouse">Lighthouse</TableColumn>
                <TableColumn id="seo">Technical SEO</TableColumn>
                <TableColumn id="design">Design QA</TableColumn>
                <TableColumn id="checklists">Website checklists</TableColumn>
                <TableColumn id="last">Last Scan</TableColumn>
                <TableColumn id="action">Action</TableColumn>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const scan = row.latestScan;
                  const summary = scan?.summary;
                  const active = scan ? ACTIVE_SCAN_STATUSES.has(scan.status) : false;
                  return (
                    <TableRow key={row.id} id={row.id}>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-950">{row.projectName}</p>
                          <p className="mt-1 truncate text-xs text-slate-500">{row.name} · {hostOf(row.url)}</p>
                          {active && scan && <p className="mt-1 text-xs font-medium text-blue-600">{scan.stage} · {scan.progress}%</p>}
                        </div>
                      </TableCell>
                      <TableCell><Metric value={summary?.overall} className={scoreTone(summary?.overall)} /></TableCell>
                      <TableCell><Metric value={summary?.pages} className="text-slate-700" /></TableCell>
                      <TableCell><Metric value={summary?.performance} className={scoreTone(summary?.performance)} /></TableCell>
                      <TableCell><Metric value={summary?.technicalSeoIssues} className={issueTone(summary?.technicalSeoIssues)} /></TableCell>
                      <TableCell><Metric value={summary?.designIssues} className={issueTone(summary?.designIssues)} /></TableCell>
                      <TableCell><Metric value={summary?.checklistIssues} className={issueTone(summary?.checklistIssues)} /></TableCell>
                      <TableCell><span className="whitespace-nowrap text-sm text-slate-600">{formatDateTime(scan?.completedAt || scan?.createdAt)}</span></TableCell>
                      <TableCell>
                        <Dropdown>
                          <Dropdown.Trigger aria-label={`Open actions for ${row.name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-950">
                            <MoreHorizontal className="h-4 w-4" />
                          </Dropdown.Trigger>
                          <Dropdown.Popover placement="bottom end">
                            <Dropdown.Menu aria-label={`${row.name} actions`}>
                              <Dropdown.Item id="view" onAction={() => void openDetails(row, "drawer")}><span className="flex items-center gap-2"><Eye className="h-4 w-4" />View details</span></Dropdown.Item>
                              <Dropdown.Item id="scan" isDisabled={active} onAction={() => openScan(row.id)}><span className="flex items-center gap-2"><Radar className="h-4 w-4" />Run scan</span></Dropdown.Item>
                              <Dropdown.Item id="connect" onAction={() => openPairing(row)}><span className="flex items-center gap-2"><Plug className="h-4 w-4" />Connect AHM Core</span></Dropdown.Item>
                              <Dropdown.Item id="settings" onAction={() => { setSelectedRow(row); profileModal.open(); }}><span className="flex items-center gap-2"><Settings2 className="h-4 w-4" />Scan settings</span></Dropdown.Item>
                              <Dropdown.Item id="export" isDisabled={!summary} onAction={() => void openDetails(row, "export")}><span className="flex items-center gap-2"><Download className="h-4 w-4" />Export report</span></Dropdown.Item>
                              <Dropdown.Item id="open" href={row.url} target="_blank"><span className="flex items-center gap-2"><ExternalLink className="h-4 w-4" />Open website</span></Dropdown.Item>
                            </Dropdown.Menu>
                          </Dropdown.Popover>
                        </Dropdown>
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
                {total ? `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total}` : loading ? "Loading websites..." : "No websites registered"}
              </PaginationSummary>
              {totalPages > 1 && (
                <PaginationContent>
                  <PaginationItem><PaginationPrevious isDisabled={page === 1} onPress={() => setPage((value) => Math.max(1, value - 1))}>Prev</PaginationPrevious></PaginationItem>
                  <PaginationItem><span className="px-2 text-sm text-slate-500">Page {page} of {totalPages}</span></PaginationItem>
                  <PaginationItem><PaginationNext isDisabled={page === totalPages} onPress={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</PaginationNext></PaginationItem>
                </PaginationContent>
              )}
            </Pagination>
          </TableFooter>
        </Table>
      </div>

      <StartHealthScanModal
        key={`${scanPrefill.websiteId ?? "any"}:${scanModal.isOpen ? "open" : "closed"}`}
        state={scanModal}
        websites={rows}
        capabilities={capabilities}
        defaultWebsiteId={scanPrefill.websiteId}
        lockWebsite={scanPrefill.locked}
        onStart={startScan}
      />
      <AhmCorePairingModal state={pairingModal} website={selectedRow} />
      <WebsiteHealthProfileModal state={profileModal} website={selectedRow} />
      <HealthDrawer project={selected?.project ?? null} health={selected?.health ?? null} websiteId={selected?.websiteId ?? null} state={drawer} onScan={(websiteId) => startScan(websiteId, { checks: [] })} onExport={exportModal.open} />
      <ExportHealthReportModal project={selected?.project ?? null} health={selected?.health ?? null} state={exportModal} />
    </div>
  );
}
