"use client";

import { Chip } from "@heroui/react";
import {
  ArrowUpRight,
  Ban,
  Bug,
  CalendarClock,
  ClipboardList,
  FolderKanban,
  Layers,
  ListChecks,
  NotebookPen,
  Plus,
  Radar,
  Rocket,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { RecentActivityCard } from "@/components/activity-logs/recent-activity-card";
import type { Issue } from "@/components/issue-board/data";
import {
  priorityColor,
  statusColor as projectStatusColor,
  type Project,
} from "@/components/projects/data";
import {
  statusColor as taskStatusColor,
  type Task,
} from "@/components/tasks/data";
import type { Credential } from "@/components/website-users/data";
import { listClientOverview, type ClientOverviewResult } from "@/libs/api/client-logs";
import { listIssues } from "@/libs/api/issues";
import { listNotes, type Note } from "@/libs/api/notes";
import { listProjects } from "@/libs/api/projects";
import { listMyTasks, listTasks } from "@/libs/api/tasks";
import {
  listWebsiteHealth,
  type HealthSummary,
  type HealthWebsiteRow,
} from "@/libs/api/website-health";
import { listWebsiteCredentials } from "@/libs/api/website-users";
import { useAuth } from "@/libs/hooks/useAuth";
import { notify } from "@/libs/notify";

type AttentionItem = {
  id: string;
  severity: "Critical" | "Warning";
  title: string;
  target: string;
  owner: string;
  timing: string;
  href: string;
};

const QUICK_ACTIONS = [
  { label: "Add task", href: "/dashboard/tasks", icon: Plus },
  { label: "Add project", href: "/dashboard/projects", icon: FolderKanban },
  { label: "Run scan", href: "/dashboard/website-health", icon: Radar },
  { label: "Create issue", href: "/dashboard/issue-boards", icon: Bug },
  { label: "Add note", href: "/dashboard/my-notes", icon: NotebookPen },
];

function summaryOf(row: HealthWebsiteRow): HealthSummary | null {
  return row.latestScan?.summary ?? null;
}

function isOverdue(task: Task) {
  if (!task.dueDate || task.status === "Done") return false;
  return task.dueDate < new Date().toISOString().slice(0, 10);
}

function projectName(projects: Project[], projectId: string) {
  return projects.find((project) => project.id === projectId)?.clientName ?? "Unknown project";
}

function formatDate(value?: string) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function checklistProgress(task: Task) {
  const checklist = task.checklist ?? [];
  const completed = checklist.filter((item) => item.completed).length;
  return {
    completed,
    total: checklist.length,
    percent: checklist.length ? Math.round((completed / checklist.length) * 100) : 0,
  };
}

function scoreClass(score: number) {
  if (score >= 90) return "text-green-600";
  if (score >= 70) return "text-amber-600";
  return "text-red-600";
}

function issueCountClass(count: number) {
  return count ? "font-semibold text-amber-600" : "text-green-600";
}

function SectionHeader({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string;
  description: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {href && (
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-[#0b7de3] hover:text-[#082a78]">
          {linkLabel ?? "View all"}
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="px-5 py-8 text-center text-sm text-slate-500">{text}</p>;
}

export function OperationsDashboard() {
  const { user } = useAuth();
  const canSeeClientLogs = user?.role === "superadmin" || user?.role === "web_dev_manager";
  const [clientLogs, setClientLogs] = useState<ClientOverviewResult | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workspaceTasks, setWorkspaceTasks] = useState<Task[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [healthRows, setHealthRows] = useState<HealthWebsiteRow[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let active = true;

    Promise.all([
        listProjects(),
        listTasks(),
        listMyTasks(),
        listIssues({ status: "all" }),
        listNotes({ limit: 3 }),
        // Health is readable by all roles; credentials need write access, so
        // both are guarded to keep the dashboard usable when one isn't allowed.
        listWebsiteHealth({ pageSize: 100 })
          .then((result) => result.websites)
          .catch(() => [] as HealthWebsiteRow[]),
        listWebsiteCredentials().catch(() => [] as Credential[]),
      ])
      .then(([projectRows, taskRows, personalRows, issueRows, noteRows, healthData, credentialRows]) => {
        if (!active) return;
        setProjects(projectRows);
        setWorkspaceTasks(taskRows);
        setMyTasks(personalRows);
        setIssues(issueRows);
        setRecentNotes(noteRows);
        setHealthRows(healthData);
        setCredentials(credentialRows);
      })
      .catch((error) => {
        if (!active) return;
        notify.error("Could not load dashboard", {
          description: (error as Error).message ?? "Refresh the page and try again.",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!canSeeClientLogs) {
      setClientLogs(null);
      return;
    }
    let active = true;
    // pageSize:1 — we only need the summary counts, not the client rows.
    listClientOverview({ page: 1, pageSize: 1 })
      .then((result) => { if (active) setClientLogs(result); })
      .catch(() => { if (active) setClientLogs(null); });
    return () => { active = false; };
  }, [canSeeClientLogs]);

  const scannedHealth = healthRows.filter((row) => summaryOf(row));

  const activeTasks = workspaceTasks.filter((task) => task.status !== "Done");
  const overdueTasks = activeTasks.filter(isOverdue);
  const blockedTasks = activeTasks.filter((task) => task.status === "Blocked");
  const reviewTasks = activeTasks.filter((task) => task.status === "Review");
  const openIssues = issues.filter((issue) => issue.status !== "Fixed");
  const atRiskProjects = projects.filter(
    (project) =>
      project.status !== "Live" &&
      project.status !== "Site Handed Over" &&
      (project.priority === "High" ||
        overdueTasks.some((task) => task.projectId === project.id))
  );
  const criticalWebsites = scannedHealth.filter((row) => {
    const summary = summaryOf(row)!;
    return summary.overall < 70 || summary.criticalIssues > 0;
  });

  const attentionItems = (() => {
    const taskItems: AttentionItem[] = overdueTasks.slice(0, 4).map((task) => ({
      id: `task-${task.id}`,
      severity: "Critical",
      title: task.title,
      target: projectName(projects, task.projectId),
      owner: task.assignee,
      timing: `Due ${formatDate(task.dueDate)}`,
      href: `/dashboard/tasks?project=${task.projectId}`,
    }));

    const blockerItems: AttentionItem[] = blockedTasks
      .filter((task) => !overdueTasks.some((overdue) => overdue.id === task.id))
      .slice(0, 2)
      .map((task) => ({
        id: `blocked-${task.id}`,
        severity: "Critical",
        title: `Blocked: ${task.title}`,
        target: projectName(projects, task.projectId),
        owner: task.assignee,
        timing: "Blocked now",
        href: `/dashboard/tasks?project=${task.projectId}`,
      }));

    const websiteItems: AttentionItem[] = criticalWebsites.slice(0, 3).map((row) => {
      const summary = summaryOf(row)!;
      return {
        id: `health-${row.id}`,
        severity: summary.overall < 70 ? "Critical" : "Warning",
        title: `${row.name} needs a health review`,
        target: row.projectName,
        owner: "Web team",
        timing: `${summary.criticalIssues} critical findings`,
        href: "/dashboard/website-health",
      };
    });

    const staleCredentialItems: AttentionItem[] = credentials
      .filter((credential) => credential.passwordUpdatedAt)
      .map((credential) => ({
        credential,
        age: Math.floor(
          (now - new Date(`${credential.passwordUpdatedAt.slice(0, 10)}T00:00:00`).getTime()) /
            86_400_000
        ),
      }))
      .filter((item) => Number.isFinite(item.age) && item.age > 90)
      .sort((a, b) => b.age - a.age)
      .slice(0, 2)
      .map(({ credential, age }) => ({
        id: `credential-${credential.id}`,
        severity: "Warning",
        title: `${credential.name}'s website password is stale`,
        target: credential.projectName ?? credential.websiteName ?? credential.externalSite ?? "Website credentials",
        owner: credential.name,
        timing: `${age} days old`,
        href: "/dashboard/website-users",
      }));

    return [...taskItems, ...blockerItems, ...websiteItems, ...staleCredentialItems]
      .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "Critical" ? -1 : 1))
      .slice(0, 8);
  })();

  const personalWork = myTasks
    .filter((task) => task.status !== "Done")
    .sort((a, b) => {
      if (isOverdue(a) !== isOverdue(b)) return isOverdue(a) ? -1 : 1;
      const rank = { High: 0, Medium: 1, Low: 2 };
      return rank[a.priority] - rank[b.priority];
    })
    .slice(0, 6);

  const deliveryProjects = projects
    .filter((project) => project.status !== "Churned")
    .sort((a, b) => {
      const rank = { High: 0, Medium: 1, Low: 2 };
      return rank[a.priority] - rank[b.priority];
    })
    .slice(0, 6);

  const criticalHealthList = scannedHealth
    .filter((row) => {
      const summary = summaryOf(row)!;
      return summary.overall < 90 || summary.criticalIssues > 0;
    })
    .sort((a, b) => summaryOf(a)!.overall - summaryOf(b)!.overall)
    .slice(0, 6);

  const kpis = [
    { label: "My Active Tasks", value: myTasks.filter((task) => task.status !== "Done").length, detail: `${reviewTasks.length} workspace reviews`, icon: ClipboardList, href: "/dashboard/my-tasks", tone: "text-[#0b7de3]" },
    { label: "Overdue Tasks", value: overdueTasks.length, detail: `${blockedTasks.length} blocked`, icon: CalendarClock, href: "/dashboard/tasks", tone: overdueTasks.length ? "text-red-600" : "text-green-600" },
    { label: "Projects at Risk", value: atRiskProjects.length, detail: `${projects.length} total projects`, icon: FolderKanban, href: "/dashboard/projects", tone: atRiskProjects.length ? "text-amber-600" : "text-green-600" },
    { label: "Critical Websites", value: criticalWebsites.length, detail: `${scannedHealth.length} scanned`, icon: ShieldAlert, href: "/dashboard/website-health", tone: criticalWebsites.length ? "text-red-600" : "text-green-600" },
    { label: "Open Issues", value: openIssues.length, detail: `${issues.filter((issue) => issue.status === "In Progress").length} in progress`, icon: Bug, href: "/dashboard/issue-boards", tone: openIssues.length ? "text-amber-600" : "text-green-600" },
    { label: "Waiting for Review", value: reviewTasks.length, detail: "Across the workspace", icon: ListChecks, href: "/dashboard/tasks", tone: "text-[#0b7de3]" },
  ];

  return (
    <div className="space-y-4">
      <section className="app-toolbar flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Operations Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">Work requiring attention across delivery, websites, and the team.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.label} href={action.href} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-950">
                <Icon className="h-4 w-4 text-[#0b7de3]" />
                {action.label}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} href={item.href} className="metric-card group min-h-[132px] p-4 transition-transform hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <Icon className={`h-5 w-5 ${item.tone}`} />
                <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-[#0b7de3]" />
              </div>
              <p className={`mt-4 text-2xl font-semibold ${item.tone}`}>{loading ? "-" : item.value}</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{item.label}</p>
              <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
            </Link>
          );
        })}
      </section>

      {canSeeClientLogs && clientLogs && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Client Timelines", value: clientLogs.summary.total, detail: `${clientLogs.summary.notCreated} not set up`, icon: Layers, tone: "text-[#0b7de3]" },
            { label: "Delayed Clients", value: clientLogs.summary.delayed, detail: "Behind schedule", icon: CalendarClock, tone: clientLogs.summary.delayed ? "text-red-600" : "text-green-600" },
            { label: "Blocked Clients", value: clientLogs.summary.blocked, detail: "Launch blocked", icon: Ban, tone: clientLogs.summary.blocked ? "text-red-600" : "text-green-600" },
            { label: "Approaching Launch", value: clientLogs.summary.approachingLaunch, detail: `${clientLogs.summary.live} live`, icon: Rocket, tone: clientLogs.summary.approachingLaunch ? "text-amber-600" : "text-green-600" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.label} href="/dashboard/client-logs" className="metric-card group min-h-[132px] p-4 transition-transform hover:-translate-y-0.5">
                <div className="flex items-center justify-between">
                  <Icon className={`h-5 w-5 ${item.tone}`} />
                  <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-[#0b7de3]" />
                </div>
                <p className={`mt-4 text-2xl font-semibold ${item.tone}`}>{item.value}</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{item.label}</p>
                <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
              </Link>
            );
          })}
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <div className="app-panel overflow-hidden p-0">
          <SectionHeader title="Needs Attention" description="Urgent work across tasks, websites, and credentials." />
          {loading ? (
            <EmptyRow text="Loading workspace risks..." />
          ) : attentionItems.length === 0 ? (
            <EmptyRow text="No urgent items need attention." />
          ) : (
            <div className="divide-y divide-slate-100">
              {attentionItems.map((item) => (
                <Link key={item.id} href={item.href} className="grid gap-3 px-5 py-3.5 hover:bg-slate-50 md:grid-cols-[110px_minmax(0,1fr)_140px_130px] md:items-center">
                  <Chip size="sm" variant="soft" color={item.severity === "Critical" ? "danger" : "warning"}>{item.severity}</Chip>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{item.title}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{item.target}</p>
                  </div>
                  <span className="text-sm text-slate-600">{item.owner}</span>
                  <span className="text-sm font-medium text-slate-600">{item.timing}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="app-panel overflow-hidden p-0">
          <SectionHeader title="My Work" description="Your highest-priority active tasks." href="/dashboard/my-tasks" />
          {loading ? (
            <EmptyRow text="Loading your tasks..." />
          ) : personalWork.length === 0 ? (
            <EmptyRow text="No active tasks assigned to you." />
          ) : (
            <div className="divide-y divide-slate-100">
              {personalWork.map((task) => {
                const progress = checklistProgress(task);
                return (
                  <Link key={task.id} href={`/dashboard/tasks?project=${task.projectId}`} className="block px-5 py-3.5 hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{task.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{projectName(projects, task.projectId)}</p>
                      </div>
                      <Chip size="sm" variant="soft" color={taskStatusColor[task.status]}>{task.status}</Chip>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-[#0b7de3]" style={{ width: `${progress.percent}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{progress.completed}/{progress.total}</span>
                      <span className={`text-xs font-medium ${isOverdue(task) ? "text-red-600" : "text-slate-500"}`}>{formatDate(task.dueDate)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.6fr)]">
        <div className="app-panel overflow-hidden p-0">
          <SectionHeader title="Project Delivery" description="Active projects ordered by operational priority." href="/dashboard/projects" />
          {loading ? (
            <EmptyRow text="Loading projects..." />
          ) : deliveryProjects.length === 0 ? (
            <EmptyRow text="No active projects found." />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[minmax(180px,1fr)_100px_130px_150px_110px_90px] gap-3 border-b border-slate-100 bg-slate-50 px-5 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  <span>Project</span><span>Priority</span><span>Status</span><span>Assignee</span><span>Tasks</span><span>Health</span>
                </div>
                {deliveryProjects.map((project) => {
                  const projectTasks = workspaceTasks.filter((task) => task.projectId === project.id && task.status !== "Done");
                  const healthRow = healthRows.find((row) => row.projectId === project.id && summaryOf(row));
                  const overall = healthRow ? summaryOf(healthRow)!.overall : null;
                  return (
                    <Link key={project.id} href={`/dashboard/tasks?project=${project.id}`} className="grid grid-cols-[minmax(180px,1fr)_100px_130px_150px_110px_90px] items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-sm last:border-0 hover:bg-slate-50">
                      <span className="font-semibold text-slate-950">{project.clientName}</span>
                      <Chip size="sm" variant="soft" color={priorityColor[project.priority]}>{project.priority}</Chip>
                      <Chip size="sm" variant="soft" color={projectStatusColor[project.status]}>{project.status}</Chip>
                      <span className="text-slate-600">{project.assignee.name}</span>
                      <span className="text-slate-600">{projectTasks.length} active</span>
                      <span className={`font-semibold ${overall != null ? scoreClass(overall) : "text-slate-400"}`}>{overall ?? "-"}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="app-panel overflow-hidden p-0">
          <SectionHeader title="Issue Queue" description="Unresolved workspace issues." href="/dashboard/issue-boards" />
          {loading ? (
            <EmptyRow text="Loading issues..." />
          ) : openIssues.length === 0 ? (
            <EmptyRow text="No unresolved issues." />
          ) : (
            <div className="divide-y divide-slate-100">
              {openIssues.slice(0, 5).map((issue) => (
                <Link key={issue.id} href="/dashboard/issue-boards" className="block px-5 py-3.5 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-950">{issue.title}</p>
                    <Chip size="sm" variant="soft" color={issue.status === "In Progress" ? "accent" : "warning"}>{issue.status}</Chip>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{issue.applied.length} applications</span>
                    <span>{issue.applied.filter((item) => !item.fixed).length} unresolved</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="app-panel overflow-hidden p-0">
        <SectionHeader title="Website Health" description="Websites with warnings or critical scan results." href="/dashboard/website-health" linkLabel="Open health" />
        {loading ? (
          <EmptyRow text="Loading website health..." />
        ) : criticalHealthList.length === 0 ? (
          <EmptyRow text={scannedHealth.length === 0 ? "No scans yet — run a website scan to see results." : "All scanned websites are healthy."} />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[850px]">
              <div className="grid grid-cols-[minmax(220px,1fr)_90px_110px_110px_110px_120px] gap-3 border-b border-slate-100 bg-slate-50 px-5 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                <span>Website</span><span>Overall</span><span>Lighthouse</span><span>SEO Issues</span><span>Design</span><span>Checklist</span>
              </div>
              {criticalHealthList.map((row) => {
                const summary = summaryOf(row)!;
                return (
                  <Link key={row.id} href="/dashboard/website-health" className="grid grid-cols-[minmax(220px,1fr)_90px_110px_110px_110px_120px] items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-sm last:border-0 hover:bg-slate-50">
                    <span><span className="block font-semibold text-slate-950">{row.projectName}</span><span className="mt-1 block text-xs text-slate-500">{row.name}</span></span>
                    <span className={`font-semibold ${scoreClass(summary.overall)}`}>{summary.overall}</span>
                    <span className={`font-semibold ${summary.performance == null ? "text-slate-400" : scoreClass(summary.performance)}`}>{summary.performance ?? "-"}</span>
                    <span className={issueCountClass(summary.technicalSeoIssues)}>{summary.technicalSeoIssues}</span>
                    <span className={issueCountClass(summary.designIssues)}>{summary.designIssues}</span>
                    <span className={issueCountClass(summary.checklistIssues)}>{summary.checklistIssues}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <RecentActivityCard />
        <div className="app-panel overflow-hidden p-0">
          <SectionHeader title="My Notes" description="Recently updated personal notes." href="/dashboard/my-notes" />
          {loading ? (
            <EmptyRow text="Loading notes..." />
          ) : recentNotes.length === 0 ? (
            <EmptyRow text="No notes yet." />
          ) : (
            <div className="divide-y divide-slate-100">
              {recentNotes.map((note) => (
                <Link key={note.id} href="/dashboard/my-notes" className="block px-5 py-3.5 hover:bg-slate-50">
                  <p className="text-sm font-semibold text-slate-950">{note.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{note.content}</p>
                  <p className="mt-2 text-xs text-slate-400">Updated {formatDateTime(note.updatedAt)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
