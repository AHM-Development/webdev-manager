"use client";

import {
  Chip,
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import {
  getUserActivityOptions,
  getWebsiteActivityOptions,
  listUserActivityLogs,
  listWebsiteActivityLogs,
  type ActivitySeverity,
  type UserActivityLog,
  type WebsiteActivityLog,
} from "@/libs/api/activity-logs";
import { notify } from "@/libs/notify";
import { SearchableFilter } from "@/components/ui/searchable-filter";

import { DateRangeField, type DateRangeValue } from "./date-range-field";

const PAGE_SIZE = 8;

function getPageItems(total: number, current: number): (number | "ellipsis")[] {
  const keys = new Set<number>([1, total, current, current - 1, current + 1]);
  const pages = [...keys].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const items: (number | "ellipsis")[] = [];
  let prev = 0;
  for (const p of pages) {
    if (p - prev > 1) items.push("ellipsis");
    items.push(p);
    prev = p;
  }
  return items;
}

function rangeBounds(range: DateRangeValue) {
  return {
    from: range?.start ? range.start.toString() : "",
    to: range?.end ? range.end.toString() : "",
  };
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function severityColor(severity: ActivitySeverity) {
  if (severity === "danger") return "danger";
  if (severity === "warning") return "warning";
  if (severity === "success") return "success";
  return "default";
}

function FilterSelect({
  ariaLabel,
  allLabel,
  value,
  onChange,
  options,
}: {
  ariaLabel: string;
  allLabel: string;
  value: string;
  onChange: (v: string) => void;
  options: { key: string; label: string }[];
}) {
  return (
    <SearchableFilter
      ariaLabel={ariaLabel}
      value={value}
      onChange={onChange}
      options={[{ key: "all", label: allLabel }, ...options]}
      placeholder={allLabel}
      triggerClassName="w-40"
    />
  );
}

function LogPagination({
  total,
  page,
  setPage,
}: {
  total: number;
  page: number;
  setPage: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-gray-500">
        {total === 0
          ? "No events"
          : `Showing ${(safePage - 1) * PAGE_SIZE + 1}-${Math.min(
              safePage * PAGE_SIZE,
              total
            )} of ${total}`}
      </p>
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                className="inline-flex items-center gap-1"
                isDisabled={safePage === 1}
                onPress={() => setPage(Math.max(1, safePage - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </PaginationPrevious>
            </PaginationItem>
            {getPageItems(totalPages, safePage).map((item, i) =>
              item === "ellipsis" ? (
                <PaginationItem key={`e-${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <PaginationLink
                    isActive={item === safePage}
                    onPress={() => setPage(item)}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              )
            )}
            <PaginationItem>
              <PaginationNext
                className="inline-flex items-center gap-1"
                isDisabled={safePage === totalPages}
                onPress={() => setPage(Math.min(totalPages, safePage + 1))}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </PaginationNext>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

function WebsiteLogsTab() {
  const [project, setProject] = useState("all");
  const [website, setWebsite] = useState("all");
  const [action, setAction] = useState("all");
  const [range, setRange] = useState<DateRangeValue>(null);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<WebsiteActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [options, setOptions] = useState<{
    projects: { id: string; name: string }[];
    websites: { id: string; name: string; url: string | null }[];
    actions: string[];
  }>({ projects: [], websites: [], actions: [] });

  const { from, to } = rangeBounds(range);

  useEffect(() => {
    let active = true;
    getWebsiteActivityOptions()
      .then((data) => {
        if (active) setOptions(data);
      })
      .catch(() => {
        if (active) setOptions({ projects: [], websites: [], actions: [] });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    listWebsiteActivityLogs({
      page,
      pageSize: PAGE_SIZE,
      projectId: project,
      websiteId: website,
      action,
      from,
      to,
    })
      .then((data) => {
        if (!active) return;
        setRows(data.rows);
        setTotal(data.total);
      })
      .catch(() => {
        if (!active) return;
        setRows([]);
        setTotal(0);
        const message = "Unable to load website activity logs.";
        setError(message);
        notify.error("Unable to load activity", { description: message });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [action, from, page, project, to, website]);

  return (
    <div className="space-y-3">
      <div className="app-toolbar flex items-center gap-2 overflow-x-auto p-3">
        <FilterSelect
          ariaLabel="Filter by project"
          allLabel="All projects"
          value={project}
          onChange={(v) => {
            setProject(v);
            setPage(1);
          }}
          options={options.projects.map((item) => ({
            key: item.id,
            label: item.name,
          }))}
        />
        <FilterSelect
          ariaLabel="Filter by website"
          allLabel="All websites"
          value={website}
          onChange={(v) => {
            setWebsite(v);
            setPage(1);
          }}
          options={options.websites.map((item) => ({
            key: item.id,
            label: item.name,
          }))}
        />
        <FilterSelect
          ariaLabel="Filter by action"
          allLabel="All actions"
          value={action}
          onChange={(v) => {
            setAction(v);
            setPage(1);
          }}
          options={options.actions.map((item) => ({
            key: item,
            label: item,
          }))}
        />
        <DateRangeField
          value={range}
          onChange={(v) => {
            setRange(v);
            setPage(1);
          }}
        />
      </div>

      {error && <span className="sr-only">{error}</span>}

      <div className="app-table-shell overflow-x-auto">
        <Table aria-label="Website activity logs">
          <TableContent className="w-full min-w-[880px] table-fixed">
            <TableHeader>
              <TableColumn id="time" isRowHeader className="w-[20%]">
                Date & Time
              </TableColumn>
              <TableColumn id="name" className="w-[18%]">
                Name
              </TableColumn>
              <TableColumn id="ip" className="w-[16%]">
                IP
              </TableColumn>
              <TableColumn id="action" className="w-[18%]">
                Action
              </TableColumn>
              <TableColumn id="detail" className="w-[28%]">
                Detail
              </TableColumn>
            </TableHeader>
            <TableBody
              renderEmptyState={() => (
                <div className="py-10 text-center text-sm text-gray-500">
                  {loading ? "Loading website activity..." : "No website activity in this range."}
                </div>
              )}
            >
              {rows.map((log) => (
                <TableRow key={log.id} id={log.id}>
                  <TableCell>
                    <span className="text-sm text-gray-600">
                      {formatDateTime(log.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium text-gray-800">{log.name}</span>
                    {log.email && (
                      <span className="block truncate text-xs text-gray-500">{log.email}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-gray-600">
                      {log.ipAddress || "-"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Chip size="sm" variant="soft" color={severityColor(log.severity)}>
                      {log.action}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-700">
                      {log.description ||
                        [log.projectName, log.websiteName || log.websiteUrl]
                          .filter(Boolean)
                          .join(" / ") ||
                        log.source}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableContent>
        </Table>
      </div>

      <LogPagination total={total} page={page} setPage={setPage} />
    </div>
  );
}

function UserLogsTab() {
  const [user, setUser] = useState("all");
  const [eventType, setEventType] = useState("all");
  const [range, setRange] = useState<DateRangeValue>(null);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<UserActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [options, setOptions] = useState<{
    users: { id: string; name: string }[];
    eventTypes: string[];
  }>({ users: [], eventTypes: [] });

  const { from, to } = rangeBounds(range);

  useEffect(() => {
    let active = true;
    getUserActivityOptions()
      .then((data) => {
        if (active) setOptions(data);
      })
      .catch(() => {
        if (active) setOptions({ users: [], eventTypes: [] });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    listUserActivityLogs({
      page,
      pageSize: PAGE_SIZE,
      userId: user,
      eventType,
      from,
      to,
    })
      .then((data) => {
        if (!active) return;
        setRows(data.rows);
        setTotal(data.total);
      })
      .catch(() => {
        if (!active) return;
        setRows([]);
        setTotal(0);
        const message = "Unable to load user activity logs.";
        setError(message);
        notify.error("Unable to load activity", { description: message });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventType, from, page, to, user]);

  return (
    <div className="space-y-3">
      <div className="app-toolbar flex items-center gap-2 overflow-x-auto p-3">
        <FilterSelect
          ariaLabel="Filter by user"
          allLabel="All users"
          value={user}
          onChange={(v) => {
            setUser(v);
            setPage(1);
          }}
          options={options.users.map((item) => ({
            key: item.id,
            label: item.name,
          }))}
        />
        <FilterSelect
          ariaLabel="Filter by action"
          allLabel="All actions"
          value={eventType}
          onChange={(v) => {
            setEventType(v);
            setPage(1);
          }}
          options={options.eventTypes.map((item) => ({
            key: item,
            label: item,
          }))}
        />
        <DateRangeField
          value={range}
          onChange={(v) => {
            setRange(v);
            setPage(1);
          }}
        />
      </div>

      {error && <span className="sr-only">{error}</span>}

      <div className="app-table-shell overflow-x-auto">
        <Table aria-label="User activity logs">
          <TableContent className="w-full min-w-[880px] table-fixed">
            <TableHeader>
              <TableColumn id="time" isRowHeader className="w-[20%]">
                Date & Time
              </TableColumn>
              <TableColumn id="name" className="w-[18%]">
                Name
              </TableColumn>
              <TableColumn id="ip" className="w-[16%]">
                IP
              </TableColumn>
              <TableColumn id="action" className="w-[18%]">
                Action
              </TableColumn>
              <TableColumn id="detail" className="w-[28%]">
                Detail
              </TableColumn>
            </TableHeader>
            <TableBody
              renderEmptyState={() => (
                <div className="py-10 text-center text-sm text-gray-500">
                  {loading ? "Loading user activity..." : "No user activity in this range."}
                </div>
              )}
            >
              {rows.map((log) => (
                <TableRow key={log.id} id={log.id}>
                  <TableCell>
                    <span className="text-sm text-gray-600">
                      {formatDateTime(log.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium text-gray-800">{log.name}</span>
                    {log.email && (
                      <span className="block truncate text-xs text-gray-500">{log.email}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-gray-600">
                      {log.ipAddress || "-"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Chip size="sm" variant="soft" color={severityColor(log.severity)}>
                      {log.action}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-700">
                      {log.description || log.targetName || log.eventType}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableContent>
        </Table>
      </div>

      <LogPagination total={total} page={page} setPage={setPage} />
    </div>
  );
}

const TABS = [
  { id: "website", label: "Website Activity" },
  { id: "user", label: "User Activity" },
] as const;

export function ActivityLogsView() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("website");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Activity Logs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Website events and team actions across all projects.
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "website" ? <WebsiteLogsTab /> : <UserLogsTab />}
    </div>
  );
}
