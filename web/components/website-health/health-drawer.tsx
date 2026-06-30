"use client";

import {
  Button,
  Chip,
  Drawer,
  DrawerBackdrop,
  DrawerBody,
  DrawerContent,
  DrawerDialog,
  DrawerHeader,
  DrawerHeading,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  type useOverlayState,
} from "@heroui/react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Monitor,
  Plug,
  Radar,
  Search,
  ShieldCheck,
  Smartphone,
  Tablet,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { Project } from "@/components/projects/data";

import {
  summarize,
  type CheckStatus,
  type PageAudit,
  type PageForm,
  type ProjectHealth,
  type SiteAudit,
} from "./data";

type TabId =
  | "overview"
  | "pages"
  | "lighthouse"
  | "seo"
  | "design"
  | "forms"
  | "wordpress";

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "pages", label: "Pages", icon: FileText },
  { id: "lighthouse", label: "Lighthouse", icon: Gauge },
  { id: "seo", label: "Technical SEO", icon: Search },
  { id: "design", label: "Design QA", icon: Monitor },
  { id: "forms", label: "Forms", icon: FileText },
  { id: "wordpress", label: "WordPress", icon: Plug },
];

function formatDateTime(iso?: string) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function scoreColor(score: number) {
  if (score >= 90) return "text-green-600";
  if (score >= 70) return "text-amber-600";
  return "text-red-600";
}

function statusColor(status: CheckStatus) {
  if (status === "pass") return "success";
  if (status === "warn") return "warning";
  return "danger";
}

function statusLabel(status: CheckStatus) {
  if (status === "pass") return "Pass";
  if (status === "warn") return "Warning";
  return "Fail";
}

function formStatusColor(form: PageForm) {
  if (form.submitStatus === "failed") return "danger";
  if (form.recaptcha === "missing") return "warning";
  return "success";
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (status === "warn") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <XCircle className="h-4 w-4 text-red-600" />;
}

function SummaryCard({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const valueClass =
    tone === "success"
      ? "text-green-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "danger"
          ? "text-red-600"
          : "text-slate-950";

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className={`mt-2 text-xl font-semibold ${valueClass}`}>{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function PageName({ page }: { page: PageAudit }) {
  return (
    <div className="min-w-0">
      <p className="font-medium text-slate-950">{page.name}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{page.path}</p>
    </div>
  );
}

function ScoreText({ score }: { score: number }) {
  return <span className={`font-semibold ${scoreColor(score)}`}>{score}</span>;
}

function OverviewTab({ audit }: { audit: SiteAudit }) {
  const summary = summarize(audit);
  const allForms = audit.pages.flatMap((page) => page.forms);
  const designIssues = audit.pages.flatMap((page) => page.designQa.issues);
  const seoStatuses = audit.pages.flatMap((page) => Object.values(page.seoChecks));
  const seoIssues = seoStatuses.filter((status) => status !== "pass").length;
  const seoCritical = seoStatuses.filter((status) => status === "fail").length;
  const formIssues = allForms.filter(
    (form) => form.submitStatus === "failed" || form.recaptcha === "missing"
  ).length;
  const checklistPending =
    (audit.wordpressVersion !== audit.wordpressLatestVersion ? 1 : 0) +
    audit.plugins.filter((plugin) => !plugin.updated).length +
    audit.users.filter((user) => {
      const age = Math.max(
        0,
        Math.floor(
          (Date.UTC(2026, 5, 15) - new Date(user.passwordUpdatedAt).getTime()) /
            86_400_000
        )
      );
      return age > 90;
    }).length +
    Object.values(audit.siteChecks).filter((status) => status !== "pass").length;
  const checklistCritical =
    (audit.wordpressVersion !== audit.wordpressLatestVersion ? 1 : 0) +
    Object.values(audit.siteChecks).filter((status) => status === "fail").length;
  const urgentItems = [
    ...audit.pages
      .filter((page) => page.speedMobile.performance < 70)
      .map((page) => ({
        title: `${page.name} has low Lighthouse performance`,
        detail: `Mobile performance score is ${page.speedMobile.performance}.`,
        status: "warn" as CheckStatus,
      })),
    ...allForms
      .filter((form) => form.submitStatus === "failed" || form.recaptcha === "missing")
      .map((form) => ({
        title:
          form.submitStatus === "failed"
            ? `${form.name} failed submission test`
            : `${form.name} is missing reCAPTCHA`,
        detail: `${form.pageName} ${form.resultMessage}`,
        status: form.submitStatus === "failed" ? ("fail" as CheckStatus) : ("warn" as CheckStatus),
      })),
    ...designIssues.slice(0, 4).map((issue) => ({
      title: issue.title,
      detail: `${issue.viewport}: ${issue.detail}`,
      status: issue.severity,
    })),
  ].slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard label="Pages" value={audit.pages.length} detail="Discovered and scanned" />
        <SummaryCard
          label="Lighthouse"
          value={summary.performance}
          detail="Average mobile score"
          tone={
            summary.performance >= 90
              ? "success"
              : summary.performance >= 70
                ? "warning"
                : "danger"
          }
        />
        <SummaryCard
          label="Technical SEO"
          value={seoIssues}
          detail={`${seoCritical} failed checks`}
          tone={seoCritical > 0 ? "danger" : seoIssues > 0 ? "warning" : "success"}
        />
        <SummaryCard
          label="Design QA"
          value={designIssues.length}
          detail={`${designIssues.filter((issue) => issue.severity === "fail").length} critical layout issues`}
          tone={
            designIssues.some((issue) => issue.severity === "fail")
              ? "danger"
              : designIssues.length > 0
                ? "warning"
                : "success"
          }
        />
        <SummaryCard
          label="Forms"
          value={formIssues}
          detail={`${summary.forms.total} forms found`}
          tone={summary.forms.failed > 0 ? "danger" : formIssues > 0 ? "warning" : "success"}
        />
        <SummaryCard
          label="Website Checklists"
          value={checklistPending}
          detail={`${checklistCritical} critical items`}
          tone={checklistCritical > 0 ? "danger" : checklistPending > 0 ? "warning" : "success"}
        />
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-950">
            Priority Issues
          </h3>
          <Chip size="sm" variant="soft" color={urgentItems.length ? "warning" : "success"}>
            {urgentItems.length ? `${urgentItems.length} found` : "Clear"}
          </Chip>
        </div>
        {urgentItems.length ? (
          <div className="space-y-2">
            {urgentItems.map((item, index) => (
              <div key={`${item.title}-${index}`} className="flex gap-2 rounded-md bg-slate-50 p-3">
                <StatusIcon status={item.status} />
                <div>
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No priority issues in the latest scan.</p>
        )}
      </div>
    </div>
  );
}

function PagesTab({ audit }: { audit: SiteAudit }) {
  return (
    <Table aria-label="Page health summary">
      <TableScrollContainer>
        <TableContent className="min-w-[820px]">
          <TableHeader>
            <TableColumn id="page" isRowHeader>Page</TableColumn>
            <TableColumn id="status">Status</TableColumn>
            <TableColumn id="lighthouse">Lighthouse</TableColumn>
            <TableColumn id="seo">SEO</TableColumn>
            <TableColumn id="design">Design QA</TableColumn>
            <TableColumn id="forms">Forms</TableColumn>
            <TableColumn id="issues">Issues</TableColumn>
          </TableHeader>
          <TableBody>
            {audit.pages.map((page) => {
              const formIssues = page.forms.filter(
                (form) => form.submitStatus === "failed" || form.recaptcha === "missing"
              ).length;
              const issues =
                Object.values(page.seoChecks).filter((status) => status !== "pass").length +
                page.designQa.issues.length +
                formIssues;
              return (
                <TableRow key={page.id} id={page.id}>
                  <TableCell><PageName page={page} /></TableCell>
                  <TableCell><Chip size="sm" variant="soft" color="success">200</Chip></TableCell>
                  <TableCell><ScoreText score={page.speedMobile.performance} /></TableCell>
                  <TableCell><ScoreText score={page.technicalSeoScore} /></TableCell>
                  <TableCell>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={page.designQa.issues.length ? "warning" : "success"}
                    >
                      {page.designQa.figmaMatch}
                    </Chip>
                  </TableCell>
                  <TableCell>{page.forms.length}</TableCell>
                  <TableCell>
                    <span className={issues ? "font-semibold text-red-600" : "text-slate-500"}>
                      {issues}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );
}

function LighthouseTab({ audit }: { audit: SiteAudit }) {
  return (
    <Table aria-label="Lighthouse page results">
      <TableScrollContainer>
        <TableContent className="min-w-[980px]">
          <TableHeader>
            <TableColumn id="page" isRowHeader>Page</TableColumn>
            <TableColumn id="performance">Performance</TableColumn>
            <TableColumn id="accessibility">Accessibility</TableColumn>
            <TableColumn id="best">Best Practices</TableColumn>
            <TableColumn id="seo">SEO</TableColumn>
            <TableColumn id="lcp">LCP</TableColumn>
            <TableColumn id="cls">CLS</TableColumn>
            <TableColumn id="inp">INP</TableColumn>
            <TableColumn id="size">Size</TableColumn>
            <TableColumn id="console">Console</TableColumn>
          </TableHeader>
          <TableBody>
            {audit.pages.map((page) => (
              <TableRow key={page.id} id={page.id}>
                <TableCell><PageName page={page} /></TableCell>
                <TableCell><ScoreText score={page.speedMobile.performance} /></TableCell>
                <TableCell><ScoreText score={page.speedMobile.accessibility} /></TableCell>
                <TableCell><ScoreText score={page.speedMobile.bestPractices} /></TableCell>
                <TableCell><ScoreText score={page.speedMobile.seo} /></TableCell>
                <TableCell>{page.speedMobile.lcp}s</TableCell>
                <TableCell>{page.speedMobile.cls}</TableCell>
                <TableCell>{page.speedMobile.inp}ms</TableCell>
                <TableCell>{page.speedMobile.transferSizeKb} KB</TableCell>
                <TableCell>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={page.speedMobile.consoleErrors ? "warning" : "success"}
                  >
                    {page.speedMobile.consoleErrors}
                  </Chip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );
}

function SeoTab({ audit }: { audit: SiteAudit }) {
  return (
    <Table aria-label="Technical SEO page results">
      <TableScrollContainer>
        <TableContent className="min-w-[980px]">
          <TableHeader>
            <TableColumn id="page" isRowHeader>Page</TableColumn>
            <TableColumn id="score">Score</TableColumn>
            <TableColumn id="title">Title</TableColumn>
            <TableColumn id="meta">Meta</TableColumn>
            <TableColumn id="h1">H1</TableColumn>
            <TableColumn id="canonical">Canonical</TableColumn>
            <TableColumn id="schema">Schema</TableColumn>
            <TableColumn id="links">Broken Links</TableColumn>
            <TableColumn id="alt">Missing Alt</TableColumn>
          </TableHeader>
          <TableBody>
            {audit.pages.map((page) => (
              <TableRow key={page.id} id={page.id}>
                <TableCell><PageName page={page} /></TableCell>
                <TableCell><ScoreText score={page.technicalSeoScore} /></TableCell>
                <TableCell>
                  <Chip size="sm" variant="soft" color={statusColor(page.seoChecks["title-tag"])}>
                    {statusLabel(page.seoChecks["title-tag"])}
                  </Chip>
                </TableCell>
                <TableCell>
                  <Chip size="sm" variant="soft" color={statusColor(page.seoChecks["meta-description"])}>
                    {statusLabel(page.seoChecks["meta-description"])}
                  </Chip>
                </TableCell>
                <TableCell>
                  <Chip size="sm" variant="soft" color={statusColor(page.seoChecks.headings)}>
                    {statusLabel(page.seoChecks.headings)}
                  </Chip>
                </TableCell>
                <TableCell>
                  <Chip size="sm" variant="soft" color={statusColor(page.seoChecks.canonical)}>
                    {statusLabel(page.seoChecks.canonical)}
                  </Chip>
                </TableCell>
                <TableCell>{page.schemaTypes.join(", ") || "None"}</TableCell>
                <TableCell>{page.brokenInternalLinks + page.brokenExternalLinks}</TableCell>
                <TableCell>{page.missingAltImages}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );
}

function DesignTab({ audit }: { audit: SiteAudit }) {
  return (
    <div className="space-y-4">
      <Table aria-label="Design QA page results">
        <TableScrollContainer>
          <TableContent className="min-w-[920px]">
            <TableHeader>
              <TableColumn id="page" isRowHeader>Page</TableColumn>
              <TableColumn id="mobile">Mobile</TableColumn>
              <TableColumn id="tablet">Tablet</TableColumn>
              <TableColumn id="desktop">Desktop</TableColumn>
              <TableColumn id="figma">Figma Match</TableColumn>
              <TableColumn id="issues">Layout Issues</TableColumn>
              <TableColumn id="summary">AI Summary</TableColumn>
            </TableHeader>
            <TableBody>
              {audit.pages.map((page) => (
                <TableRow key={page.id} id={page.id}>
                  <TableCell><PageName page={page} /></TableCell>
                  <TableCell><ViewportChip status={page.designQa.mobile} icon={Smartphone} /></TableCell>
                  <TableCell><ViewportChip status={page.designQa.tablet} icon={Tablet} /></TableCell>
                  <TableCell><ViewportChip status={page.designQa.desktop} icon={Monitor} /></TableCell>
                  <TableCell>
                    {page.designQa.figmaMatch == null ? (
                      <span className="text-sm text-slate-400">Deferred</span>
                    ) : (
                      <ScoreText score={page.designQa.figmaMatch} />
                    )}
                  </TableCell>
                  <TableCell>{page.designQa.issues.length}</TableCell>
                  <TableCell>
                    <p className="line-clamp-2 max-w-[320px] text-sm text-slate-600">
                      {page.designQa.aiSummary}
                    </p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>

      <div className="grid gap-3 lg:grid-cols-2">
        {audit.pages.flatMap((page) =>
          page.designQa.issues.map((issue) => (
            <div key={`${page.id}-${issue.id}`} className="rounded-md border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{issue.title}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-400">
                    {page.name} / {issue.viewport}
                  </p>
                </div>
                <Chip size="sm" variant="soft" color={statusColor(issue.severity)}>
                  {statusLabel(issue.severity)}
                </Chip>
              </div>
              <p className="mt-3 text-sm text-slate-600">{issue.detail}</p>
              <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Screenshot evidence: {issue.screenshot}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ViewportChip({
  status,
  icon: Icon,
}: {
  status: CheckStatus;
  icon: LucideIcon;
}) {
  return (
    <Chip size="sm" variant="soft" color={statusColor(status)}>
      <span className="inline-flex items-center gap-1">
        <Icon className="h-3.5 w-3.5" />
        {statusLabel(status)}
      </span>
    </Chip>
  );
}

function FormsTab({ audit }: { audit: SiteAudit }) {
  const forms = audit.pages.flatMap((page) => page.forms);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="Forms Found" value={forms.length} />
        <SummaryCard label="Working" value={forms.filter((form) => form.submitStatus === "passed").length} />
        <SummaryCard label="Failed" value={forms.filter((form) => form.submitStatus === "failed").length} />
        <SummaryCard label="Missing CAPTCHA" value={forms.filter((form) => form.recaptcha === "missing").length} />
      </div>

      <Table aria-label="Detected website forms">
        <TableScrollContainer>
          <TableContent className="min-w-[1040px]">
            <TableHeader>
              <TableColumn id="page" isRowHeader>Page</TableColumn>
              <TableColumn id="form">Form</TableColumn>
              <TableColumn id="fields">Fields</TableColumn>
              <TableColumn id="submit">Submit Test</TableColumn>
              <TableColumn id="captcha">reCAPTCHA</TableColumn>
              <TableColumn id="endpoint">Endpoint</TableColumn>
              <TableColumn id="last">Last Tested</TableColumn>
              <TableColumn id="status">Status</TableColumn>
            </TableHeader>
            <TableBody>
              {forms.map((form) => (
                <TableRow key={form.id} id={form.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-slate-950">{form.pageName}</p>
                      <p className="mt-1 text-xs text-slate-500">{form.pagePath}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-slate-900">{form.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{form.selector}</p>
                    </div>
                  </TableCell>
                  <TableCell>{form.fields.length}</TableCell>
                  <TableCell>
                    <Chip size="sm" variant="soft" color={form.submitStatus === "passed" ? "success" : "danger"}>
                      {form.submitStatus}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <Chip size="sm" variant="soft" color={form.recaptcha === "missing" ? "warning" : "success"}>
                      {form.recaptcha}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-500">{form.endpoint}</span>
                  </TableCell>
                  <TableCell>{formatDateTime(form.lastTestedAt)}</TableCell>
                  <TableCell>
                    <Chip size="sm" variant="soft" color={formStatusColor(form)}>
                      {form.submitStatus === "passed" && form.recaptcha !== "missing"
                        ? "Healthy"
                        : "Needs review"}
                    </Chip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>
    </div>
  );
}

function WordPressTab({ audit }: { audit: SiteAudit }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard
          label="WP Version"
          value={audit.wordpressVersion}
          detail={`Latest ${audit.wordpressLatestVersion}`}
        />
        <SummaryCard label="Theme" value={audit.themeName} detail={audit.themeVersion} />
        <SummaryCard label="PHP" value={audit.phpVersion} />
        <SummaryCard label="Connector" value={audit.connectorStatus} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-950">Plugins</h3>
          <Table aria-label="WordPress plugins">
            <TableScrollContainer>
              <TableContent>
                <TableHeader>
                  <TableColumn id="plugin" isRowHeader>Plugin</TableColumn>
                  <TableColumn id="installed">Installed</TableColumn>
                  <TableColumn id="latest">Latest</TableColumn>
                  <TableColumn id="status">Status</TableColumn>
                </TableHeader>
                <TableBody>
                  {audit.plugins.map((plugin) => (
                    <TableRow key={plugin.name} id={plugin.name}>
                      <TableCell>{plugin.name}</TableCell>
                      <TableCell>{plugin.installedVersion}</TableCell>
                      <TableCell>{plugin.latestVersion}</TableCell>
                      <TableCell>
                        <Chip size="sm" variant="soft" color={plugin.updated ? "success" : "warning"}>
                          {plugin.updated ? "Updated" : "Update"}
                        </Chip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </TableContent>
            </TableScrollContainer>
          </Table>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-950">Users</h3>
          <Table aria-label="WordPress users">
            <TableScrollContainer>
              <TableContent>
                <TableHeader>
                  <TableColumn id="user" isRowHeader>User</TableColumn>
                  <TableColumn id="role">Role</TableColumn>
                  <TableColumn id="password">Password</TableColumn>
                </TableHeader>
                <TableBody>
                  {audit.users.map((user) => {
                    const age = Math.max(
                      0,
                      Math.floor(
                        (Date.UTC(2026, 5, 15) - new Date(user.passwordUpdatedAt).getTime()) /
                          86_400_000
                      )
                    );
                    return (
                      <TableRow key={user.email} id={user.email}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-950">{user.name}</p>
                            <p className="mt-1 text-xs text-slate-500">{user.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>{user.role}</TableCell>
                        <TableCell>
                          <Chip size="sm" variant="soft" color={age > 90 ? "warning" : "success"}>
                            {age}d ago
                          </Chip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </TableContent>
            </TableScrollContainer>
          </Table>
        </div>
      </div>
    </div>
  );
}

export function HealthDrawer({
  project,
  health,
  websiteId,
  state,
  onScan,
  onExport,
}: {
  project: Project | null;
  health: ProjectHealth | null;
  websiteId?: string | null;
  state: ReturnType<typeof useOverlayState>;
  onScan?: (websiteId: string) => Promise<void>;
  onExport?: () => void;
}) {
  const [tab, setTab] = useState<TabId>("overview");

  useEffect(() => {
    setTab("overview");
  }, [websiteId]);

  const websites = health?.websites ?? [];
  const audit =
    websites.find((item) => item.websiteId === websiteId) ??
    websites[0] ??
    null;
  const summary = audit ? summarize(audit) : null;

  const tabContent = useMemo(() => {
    if (!audit) return null;
    if (tab === "overview") return <OverviewTab audit={audit} />;
    if (tab === "pages") return <PagesTab audit={audit} />;
    if (tab === "lighthouse") return <LighthouseTab audit={audit} />;
    if (tab === "seo") return <SeoTab audit={audit} />;
    if (tab === "design") return <DesignTab audit={audit} />;
    if (tab === "forms") return <FormsTab audit={audit} />;
    return <WordPressTab audit={audit} />;
  }, [audit, tab]);

  return (
    <Drawer isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <DrawerBackdrop variant="blur">
        <DrawerContent placement="right">
          <DrawerDialog className="w-full max-w-[960px]">
            <DrawerHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <DrawerHeading className="text-lg font-semibold text-slate-950">
                      {audit?.websiteName ?? "Website Health"}
                    </DrawerHeading>
                    <p className="mt-1 text-sm text-slate-500">
                      {project?.clientName ?? "No project selected"}
                    </p>
                    {audit && (
                      <a
                        href={audit.websiteUrl}
                        target="_blank"
                        className="mt-2 inline-flex items-center gap-1 break-all text-xs font-medium text-[#0b7de3]"
                      >
                        {audit.websiteUrl}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {summary && (
                      <Chip
                        size="sm"
                        variant="soft"
                        color={
                          summary.overall >= 90
                            ? "success"
                            : summary.overall >= 70
                              ? "warning"
                              : "danger"
                        }
                      >
                        {summary.overall} Health
                      </Chip>
                    )}
                    <Button size="sm" variant="tertiary" onPress={onExport}>
                      <Download className="h-4 w-4" />
                      Export
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onPress={() => audit && onScan ? void onScan(audit.websiteId) : undefined}
                    >
                      <Radar className="h-4 w-4" />
                      Run Scan
                    </Button>
                  </div>
                </div>

              </div>
            </DrawerHeader>

            <DrawerBody className="space-y-4 overflow-y-auto bg-slate-50">
              {!audit ? (
                <p className="py-12 text-center text-sm text-slate-500">
                  No website health data is available.
                </p>
              ) : (
                <>
                  <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50">
                    {TABS.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setTab(item.id)}
                          className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${
                            tab === item.id
                              ? "border-slate-950 text-slate-950"
                              : "border-transparent text-slate-500 hover:text-slate-900"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>

                  <div>{tabContent}</div>
                </>
              )}
            </DrawerBody>
          </DrawerDialog>
        </DrawerContent>
      </DrawerBackdrop>
    </Drawer>
  );
}
