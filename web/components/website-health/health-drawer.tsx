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
  designSignature,
  formSignature,
  listDesignVerifications,
  listFormVerifications,
  saveDesignVerification,
  saveFormVerification,
  sendFormTest,
  type DesignVerification,
  type FormEvidence,
  type FormVerification,
} from "@/libs/api/website-health";
import { assetUrl } from "@/libs/api/client";
import { useAuth } from "@/libs/hooks/useAuth";
import { notify } from "@/libs/notify";
import { ImageUploader } from "@/components/ui/image-uploader";

import {
  summarize,
  type CheckStatus,
  type FormInventoryItem,
  type HealthFinding,
  type LighthouseFieldMetric,
  type LighthouseStrategyResult,
  type PageAudit,
  type PageForm,
  type ProjectHealth,
  type SiteAudit,
} from "./data";
import { ScoreRing } from "./score-ring";

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
  { id: "wordpress", label: "Website Checklists", icon: Plug },
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

function fmtSeconds(ms: number | null) {
  return ms == null ? "–" : `${(ms / 1000).toFixed(1)}s`;
}
function fmtMs(ms: number | null) {
  return ms == null ? "–" : `${Math.round(ms)}ms`;
}
function fmtCls(value: number | null) {
  if (value == null) return "–";
  // CrUX field CLS comes scaled ×100 (e.g. 10 → 0.10); lab CLS is already a decimal.
  const cls = value > 1 ? value / 100 : value;
  return cls.toFixed(2);
}

const CWV_TONE: Record<string, { label: string; className: string; chip: "success" | "warning" | "danger" }> = {
  FAST: { label: "Good", className: "text-green-600", chip: "success" },
  AVERAGE: { label: "Needs improvement", className: "text-amber-600", chip: "warning" },
  SLOW: { label: "Poor", className: "text-red-600", chip: "danger" },
};

function ScoreRingOrDash({ score, label }: { score: number | null; label: string }) {
  if (score == null) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-slate-100 text-sm font-semibold text-slate-300">
          –
        </div>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
    );
  }
  return <ScoreRing score={score} label={label} />;
}

function FieldMetricCard({
  label,
  metric,
  format,
}: {
  label: string;
  metric: LighthouseFieldMetric | null;
  format: (value: number) => string;
}) {
  const tone = (metric && CWV_TONE[metric.category ?? ""]) ?? {
    label: metric?.category ?? "No data",
    className: "text-slate-500",
  };
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${metric ? tone.className : "text-slate-400"}`}>
        {metric ? format(metric.value) : "–"}
      </p>
      {metric && <p className={`text-xs ${tone.className}`}>{tone.label}</p>}
    </div>
  );
}

function LabMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function StrategyPanel({ strategy }: { strategy: LighthouseStrategyResult }) {
  const field = strategy.fieldData;
  const overallTone = field && CWV_TONE[field.overall ?? ""];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-center gap-6 rounded-md border border-slate-200 bg-white p-4">
        <ScoreRingOrDash score={strategy.scores.performance} label="Performance" />
        <ScoreRingOrDash score={strategy.scores.accessibility} label="Accessibility" />
        <ScoreRingOrDash score={strategy.scores.bestPractices} label="Best Practices" />
        <ScoreRingOrDash score={strategy.scores.seo} label="SEO" />
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Core Web Vitals — real users (field data)</h3>
          {field && overallTone && (
            <Chip size="sm" variant="soft" color={overallTone.chip}>
              {field.overall === "FAST" ? "Passed" : field.overall === "AVERAGE" ? "Needs work" : "Failed"}
            </Chip>
          )}
        </div>
        {field ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <FieldMetricCard label="LCP" metric={field.lcp} format={(v) => fmtSeconds(v)} />
            <FieldMetricCard label="INP" metric={field.inp} format={(v) => fmtMs(v)} />
            <FieldMetricCard label="CLS" metric={field.cls} format={(v) => fmtCls(v)} />
            <FieldMetricCard label="FCP" metric={field.fcp} format={(v) => fmtSeconds(v)} />
            <FieldMetricCard label="TTFB" metric={field.ttfb} format={(v) => fmtSeconds(v)} />
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
            Not enough real-user data for this URL. Showing lab results below.
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Lab metrics (Lighthouse)</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <LabMetric label="FCP" value={fmtSeconds(strategy.metrics.fcpMs)} />
          <LabMetric label="LCP" value={fmtSeconds(strategy.metrics.lcpMs)} />
          <LabMetric label="TBT" value={fmtMs(strategy.metrics.tbtMs)} />
          <LabMetric label="CLS" value={fmtCls(strategy.metrics.cls)} />
          <LabMetric label="Speed Index" value={fmtSeconds(strategy.metrics.speedIndexMs)} />
          <LabMetric label="TTI" value={fmtSeconds(strategy.metrics.interactiveMs)} />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Opportunities &amp; Diagnostics</h3>
        {strategy.diagnostics.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
            No opportunities flagged — nice.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {strategy.diagnostics.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm text-slate-800">
                  <Chip size="sm" variant="soft" color={item.group === "opportunity" ? "accent" : "default"}>
                    {item.group === "opportunity" ? "Opportunity" : "Diagnostic"}
                  </Chip>
                  {item.title}
                </span>
                <span className="shrink-0 text-sm font-medium text-amber-600">
                  {item.savingsMs != null && item.savingsMs > 0
                    ? `~${(item.savingsMs / 1000).toFixed(2)}s`
                    : item.displayValue}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function LighthouseTab({ audit }: { audit: SiteAudit }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");

  const page = audit.pages[pageIndex] ?? audit.pages[0];
  const lighthouse = page?.lighthouse;
  const result = lighthouse ? lighthouse[strategy] : null;

  if (!page) {
    return <p className="py-8 text-center text-sm text-slate-500">No pages were scanned.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {audit.pages.length > 1 ? (
          <select
            value={pageIndex}
            onChange={(event) => setPageIndex(Number(event.target.value))}
            className="max-w-xs rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          >
            {audit.pages.map((item, index) => (
              <option key={item.id} value={index}>
                {item.name} — {item.path}
              </option>
            ))}
          </select>
        ) : (
          <PageName page={page} />
        )}

        <div className="inline-flex rounded-md border border-slate-200 p-0.5 text-sm">
          {(["mobile", "desktop"] as const).map((option) => {
            const Icon = option === "mobile" ? Smartphone : Monitor;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setStrategy(option)}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1 font-medium capitalize transition-colors ${
                  strategy === option ? "bg-[var(--brand)] text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                {option}
              </button>
            );
          })}
        </div>
      </div>

      {result ? (
        <StrategyPanel strategy={result} />
      ) : (
        <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-500">
          {lighthouse
            ? `No ${strategy} Lighthouse data for this page.`
            : "Lighthouse wasn't run for this scan (enable it in the scan dialog)."}
        </p>
      )}
    </div>
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

function DesignTab({ audit, websiteId }: { audit: SiteAudit; websiteId?: string | null }) {
  const [verifications, setVerifications] = useState<DesignVerification[]>([]);

  useEffect(() => {
    if (!websiteId) return;
    listDesignVerifications(websiteId).then(setVerifications).catch(() => setVerifications([]));
  }, [websiteId]);

  const verByKey = new Map(verifications.map((verification) => [verification.pageKey, verification]));
  const upsertVerification = (verification: DesignVerification) =>
    setVerifications((current) => [
      ...current.filter((item) => item.pageKey !== verification.pageKey),
      verification,
    ]);

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

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-950">Design sign-off</h3>
        <p className="mb-3 text-xs text-slate-500">
          Manually review each page against its design and record an evidence-backed sign-off. Kept on the
          website, so it survives re-scans and flags as stale when the design QA result changes.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {audit.pages.map((page) => (
            <div key={page.id} className="rounded-md border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{page.name}</p>
                  <p className="mt-1 text-xs text-slate-400">{page.path}</p>
                </div>
                <Chip size="sm" variant="soft" color={page.designQa.issues.length ? "warning" : "success"}>
                  {page.designQa.issues.length} issue{page.designQa.issues.length === 1 ? "" : "s"}
                </Chip>
              </div>
              {websiteId ? (
                <DesignVerificationBlock
                  websiteId={websiteId}
                  page={page}
                  verification={verByKey.get(page.path)}
                  onSaved={upsertVerification}
                />
              ) : (
                <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-400">
                  Sign-off available once the website is saved.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {audit.pages.some((page) => page.designQa.issues.length > 0) && (
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
      )}
    </div>
  );
}

function DesignVerificationBlock({
  websiteId,
  page,
  verification,
  onSaved,
}: {
  websiteId: string;
  page: PageAudit;
  verification: DesignVerification | undefined;
  onSaved: (verification: DesignVerification) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"approved" | "rejected">(verification?.status ?? "approved");
  const [note, setNote] = useState(verification?.note ?? "");
  const [screenshots, setScreenshots] = useState<FormEvidence[]>(verification?.screenshots ?? []);
  const [saving, setSaving] = useState(false);

  const signature = designSignature(page.designQa);
  const stale = verification
    ? verification.designSignature !== signature ||
      Date.now() - new Date(verification.testedAt).getTime() > 30 * 86_400_000
    : false;

  const openEdit = () => {
    setStatus(verification?.status ?? "approved");
    setNote(verification?.note ?? "");
    setScreenshots(verification?.screenshots ?? []);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveDesignVerification(websiteId, page.path, {
        status,
        note: note.trim(),
        screenshots,
        designSignature: signature,
      });
      onSaved(saved);
      setEditing(false);
      notify.success("Sign-off saved");
    } catch (error) {
      notify.error("Could not save sign-off", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const STATUS_LABEL = { approved: "Approved", rejected: "Needs work" } as const;

  if (editing) {
    return (
      <div className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="flex gap-2">
          {(["approved", "rejected"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${
                status === value
                  ? value === "approved"
                    ? "bg-emerald-600 text-white"
                    : "bg-rose-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              {STATUS_LABEL[value]}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          placeholder="Notes (optional) — e.g. matches the approved Figma frame; hero spacing corrected."
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <ImageUploader value={screenshots} onChange={setScreenshots} disabled={saving} />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="tertiary" isDisabled={saving} onPress={() => setEditing(false)}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" isDisabled={saving} onPress={() => void save()}>
            {saving ? "Saving…" : "Save sign-off"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
      {verification ? (
        <>
          <Chip size="sm" variant="soft" color={verification.status === "approved" ? "success" : "danger"}>
            {STATUS_LABEL[verification.status]}
          </Chip>
          {stale && (
            <Chip size="sm" variant="soft" color="warning">
              Stale — re-review
            </Chip>
          )}
          <span className="text-xs text-slate-500">
            {verification.testedByName ? `by ${verification.testedByName} · ` : ""}
            {formatDateTime(verification.testedAt)}
          </span>
          {verification.screenshots.length > 0 && (
            <div className="flex gap-1">
              {verification.screenshots.map((shot) => (
                <a
                  key={shot.id}
                  href={assetUrl(shot.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="block h-8 w-8 overflow-hidden rounded border border-slate-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assetUrl(shot.url)} alt={shot.name} className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          )}
          <Button size="sm" variant="tertiary" onPress={openEdit}>
            Update
          </Button>
        </>
      ) : (
        <>
          <span className="text-xs text-slate-400">Not reviewed</span>
          <Button size="sm" variant="secondary" onPress={openEdit}>
            Mark as reviewed
          </Button>
        </>
      )}
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

function RecipientLine({ label, emails }: { label: string; emails: string[] }) {
  return (
    <p className="text-xs text-slate-600">
      <span className="font-medium text-slate-500">{label}:</span>{" "}
      {emails.length ? emails.join(", ") : <span className="text-slate-400">none</span>}
    </p>
  );
}

function FormsTab({ audit, websiteId }: { audit: SiteAudit; websiteId?: string | null }) {
  const forms = audit.pages.flatMap((page) => page.forms);
  const inventory = audit.formsInventory ?? null;
  const { user } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [verifications, setVerifications] = useState<FormVerification[]>([]);

  useEffect(() => {
    if (!websiteId) return;
    listFormVerifications(websiteId).then(setVerifications).catch(() => setVerifications([]));
  }, [websiteId]);

  const verByKey = new Map(verifications.map((verification) => [verification.formKey, verification]));
  const upsertVerification = (verification: FormVerification) =>
    setVerifications((current) => [
      ...current.filter((item) => item.formKey !== verification.formKey),
      verification,
    ]);
  const [sending, setSending] = useState(false);

  const openTest = (id: string) => {
    setActiveId(id);
    setTestEmail(user?.email ?? "");
  };

  const runTest = async (form: FormInventoryItem) => {
    if (!websiteId) return;
    setSending(true);
    try {
      const result = await sendFormTest(websiteId, form.id, testEmail.trim());
      if (result.sent) {
        notify.success("Test email sent", { description: `Delivered to ${result.to} for ${form.title}.` });
        setActiveId(null);
      } else {
        notify.error("Test not sent", { description: result.error ?? "The site reported the email was not sent." });
      }
    } catch (error) {
      notify.error("Test failed", {
        description: error instanceof Error ? error.message : "Could not reach the connector.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="Forms Found" value={forms.length} />
        <SummaryCard label="Working" value={forms.filter((form) => form.submitStatus === "passed").length} />
        <SummaryCard label="Failed" value={forms.filter((form) => form.submitStatus === "failed").length} />
        <SummaryCard label="Missing CAPTCHA" value={forms.filter((form) => form.recaptcha === "missing").length} />
      </div>

      {inventory && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-950">
            Configured forms (from WordPress)
          </h3>
          {inventory.length ? (
            <ul className="space-y-2">
              {inventory.map((form) => (
                <li key={form.id} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900">{form.title}</p>
                    <Chip size="sm" variant="soft" color="accent">{form.plugin}</Chip>
                  </div>
                  <div className="mt-2 space-y-0.5">
                    <RecipientLine label="To" emails={form.recipients} />
                    <RecipientLine label="Cc" emails={form.cc} />
                    <RecipientLine label="Bcc" emails={form.bcc} />
                  </div>
                  {form.fields.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {form.fields.map((field, index) => (
                        <Chip key={`${form.id}-${index}`} size="sm" variant="soft" color="default">
                          {field.name || field.type}
                          {field.required ? " *" : ""}
                        </Chip>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 border-t border-slate-100 pt-2">
                    {activeId === form.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="email"
                          value={testEmail}
                          onChange={(event) => setTestEmail(event.target.value)}
                          placeholder="test@example.com"
                          className="min-w-[200px] flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                        <Button
                          size="sm"
                          variant="primary"
                          isDisabled={sending || !testEmail.trim()}
                          onPress={() => void runTest(form)}
                        >
                          {sending ? "Sending..." : "Send"}
                        </Button>
                        <Button size="sm" variant="tertiary" isDisabled={sending} onPress={() => setActiveId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="secondary" isDisabled={!websiteId} onPress={() => openTest(form.id)}>
                        Send test email
                      </Button>
                    )}
                  </div>
                  {websiteId && (
                    <FormVerificationBlock
                      websiteId={websiteId}
                      form={form}
                      verification={verByKey.get(form.id)}
                      onSaved={upsertVerification}
                    />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md border border-slate-200 p-3 text-sm text-slate-500">
              No Contact Form 7, WPForms, or Elementor forms were found.
            </p>
          )}
        </div>
      )}

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

function FormVerificationBlock({
  websiteId,
  form,
  verification,
  onSaved,
}: {
  websiteId: string;
  form: FormInventoryItem;
  verification: FormVerification | undefined;
  onSaved: (verification: FormVerification) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"passed" | "failed">(verification?.status ?? "passed");
  const [note, setNote] = useState(verification?.note ?? "");
  const [screenshots, setScreenshots] = useState<FormEvidence[]>(verification?.screenshots ?? []);
  const [saving, setSaving] = useState(false);

  const signature = formSignature(form);
  const stale = verification
    ? verification.formSignature !== signature ||
      Date.now() - new Date(verification.testedAt).getTime() > 30 * 86_400_000
    : false;

  const openEdit = () => {
    setStatus(verification?.status ?? "passed");
    setNote(verification?.note ?? "");
    setScreenshots(verification?.screenshots ?? []);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveFormVerification(websiteId, form.id, {
        status,
        note: note.trim(),
        screenshots,
        formSignature: signature,
      });
      onSaved(saved);
      setEditing(false);
      notify.success("Verification saved");
    } catch (error) {
      notify.error("Could not save verification", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="flex gap-2">
          {(["passed", "failed"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={`rounded-md px-3 py-1 text-xs font-semibold capitalize ${
                status === value
                  ? value === "passed"
                    ? "bg-emerald-600 text-white"
                    : "bg-rose-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          placeholder="Notes (optional) — e.g. received the test email at the expected inbox."
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <ImageUploader value={screenshots} onChange={setScreenshots} disabled={saving} />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="tertiary" isDisabled={saving} onPress={() => setEditing(false)}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" isDisabled={saving} onPress={() => void save()}>
            {saving ? "Saving…" : "Save verification"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
      {verification ? (
        <>
          <Chip size="sm" variant="soft" color={verification.status === "passed" ? "success" : "danger"}>
            <span className="capitalize">{verification.status}</span>
          </Chip>
          {stale && (
            <Chip size="sm" variant="soft" color="warning">
              Stale — re-test
            </Chip>
          )}
          <span className="text-xs text-slate-500">
            {verification.testedByName ? `by ${verification.testedByName} · ` : ""}
            {formatDateTime(verification.testedAt)}
          </span>
          {verification.screenshots.length > 0 && (
            <div className="flex gap-1">
              {verification.screenshots.map((shot) => (
                <a
                  key={shot.id}
                  href={assetUrl(shot.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="block h-8 w-8 overflow-hidden rounded border border-slate-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assetUrl(shot.url)} alt={shot.name} className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          )}
          <Button size="sm" variant="tertiary" onPress={openEdit}>
            Update
          </Button>
        </>
      ) : (
        <>
          <span className="text-xs text-slate-400">Not verified</span>
          <Button size="sm" variant="secondary" onPress={openEdit}>
            Mark as tested
          </Button>
        </>
      )}
    </div>
  );
}

function contentAge(iso?: string | null) {
  if (!iso) return "-";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (!Number.isFinite(days)) return "-";
  return days <= 0 ? "Today" : `${days}d ago`;
}

function severityColor(severity: string) {
  return severity === "critical" ? "danger" : severity === "warning" ? "warning" : "default";
}

function FindingsList({
  title,
  findings,
  emptyLabel,
}: {
  title: string;
  findings: HealthFinding[];
  emptyLabel: string;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-950">{title}</h3>
      {findings.length ? (
        <ul className="space-y-2">
          {findings.map((finding, index) => (
            <li key={`${finding.checkId}-${index}`} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-slate-900">{finding.title}</p>
                <Chip size="sm" variant="soft" color={severityColor(finding.severity)}>
                  {finding.severity}
                </Chip>
              </div>
              <p className="mt-1 text-xs text-slate-600">{finding.detail}</p>
              {finding.recommendation && (
                <p className="mt-1 text-xs text-slate-500">{finding.recommendation}</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-slate-200 p-3 text-sm text-slate-500">{emptyLabel}</p>
      )}
    </div>
  );
}

function WordPressTab({ audit }: { audit: SiteAudit }) {
  const findings = audit.findings ?? [];
  const securityFindings = findings.filter((finding) => finding.category === "security");
  const checklistFindings = findings.filter((finding) => finding.category === "wordpress");
  const content = audit.content ?? null;
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

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-950">Content activity</h3>
        {content ? (
          <div className="grid gap-3 md:grid-cols-4">
            <SummaryCard
              label="Last blog post"
              value={contentAge(content.lastPostPublishedAt)}
              detail={content.lastPostPublishedAt ? formatDateTime(content.lastPostPublishedAt) : "No published posts"}
            />
            <SummaryCard
              label="Last content update"
              value={contentAge(content.lastModifiedAt)}
              detail={content.lastModifiedAt ? formatDateTime(content.lastModifiedAt) : "-"}
            />
            <SummaryCard
              label="Published posts"
              value={content.publishedPosts}
              detail={content.draftPosts ? `${content.draftPosts} draft${content.draftPosts === 1 ? "" : "s"}` : undefined}
            />
            <SummaryCard
              label="Published pages"
              value={content.publishedPages}
              detail={content.firstPostPublishedAt ? `Blog since ${formatDateTime(content.firstPostPublishedAt)}` : undefined}
            />
          </div>
        ) : (
          <p className="rounded-md border border-slate-200 p-3 text-sm text-slate-500">
            Content activity is available once a connected WordPress site is scanned.
          </p>
        )}
      </div>

      <FindingsList
        title="Maintenance & content checks"
        findings={checklistFindings}
        emptyLabel="No maintenance or content issues detected."
      />

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

      <FindingsList
        title="Security"
        findings={securityFindings}
        emptyLabel="No security issues detected."
      />
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
    if (tab === "design") return <DesignTab audit={audit} websiteId={websiteId} />;
    if (tab === "forms") return <FormsTab audit={audit} websiteId={websiteId} />;
    return <WordPressTab audit={audit} />;
  }, [audit, tab, websiteId]);

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
