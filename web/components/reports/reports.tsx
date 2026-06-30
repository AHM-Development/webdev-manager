"use client";

import { Chip } from "@heroui/react";
import { AlertTriangle, CheckCircle2, ExternalLink, XCircle } from "lucide-react";

import type { Project } from "@/components/projects/data";
import { tasks as allTasks, STATUSES } from "@/components/tasks/data";
import {
  healthByProject,
  primaryAudit,
  summarize,
  type CheckStatus,
} from "@/components/website-health/data";
import { SEO_CHECKLIST } from "@/components/website-health/seo-checklist";
import { SITE_CHECKLIST } from "@/components/website-health/site-checklist";

/* --------------------------------- shared --------------------------------- */

export function useToday() {
  return new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function ReportHeader({
  title,
  project,
}: {
  title: string;
  project: Project;
}) {
  const today = useToday();
  return (
    <div className="mb-6 flex items-start justify-between border-b border-gray-200 pb-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-400">
          AHM Web Manager
        </p>
        <h2 className="mt-1 text-xl font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">{project.clientName}</p>
      </div>
      <p className="text-sm text-gray-400">{today}</p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 text-sm last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-800">{children}</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone ?? "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "pass")
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />;
  if (status === "warn")
    return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />;
  return <XCircle className="h-4 w-4 shrink-0 text-red-600" />;
}

function scoreColor(score: number) {
  return score >= 90
    ? "text-green-600"
    : score >= 50
      ? "text-amber-500"
      : "text-red-600";
}

function Link({ href }: { href?: string }) {
  if (!href) return <span className="text-gray-400">—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
    >
      {href.replace(/^https?:\/\//, "")}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function NoSite() {
  return (
    <p className="rounded-lg border border-gray-200 py-8 text-center text-sm text-gray-500">
      No live or staging site is configured for this client.
    </p>
  );
}

/* ----------------------------- Project Status ----------------------------- */

export function ProjectStatusReport({ project }: { project: Project }) {
  const projectTasks = allTasks.filter((t) => t.projectId === project.id);
  const done = projectTasks.filter((t) => t.status === "Done").length;
  const audit = primaryAudit(healthByProject[project.id] ?? { websites: [] });
  const summary = audit ? summarize(audit) : null;

  return (
    <div>
      <ReportHeader title="Project Status Snapshot" project={project} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Status" value={project.status} />
        <StatCard
          label="Health"
          value={summary ? summary.overall : "—"}
          tone={summary ? scoreColor(summary.overall) : undefined}
        />
        <StatCard label="Tasks done" value={`${done}/${projectTasks.length}`} />
        <StatCard label="Type" value={project.type} />
      </div>

      <Section title="Overview">
        <Field label="Client">{project.clientName}</Field>
        <Field label="Status">{project.status}</Field>
        <Field label="Type">{project.type}</Field>
        <Field label="Assignee">{project.assignee.name}</Field>
        <Field label="Domain management">{project.domainManagement}</Field>
        <Field label="Server location">{project.serverLocation}</Field>
      </Section>

      <Section title="Links">
        <Field label="Live">
          <Link href={project.liveLink} />
        </Field>
        <Field label="Staging">
          <Link href={project.stagingLink} />
        </Field>
        <Field label="Figma">
          <Link href={project.figmaLink} />
        </Field>
      </Section>
    </div>
  );
}

/* ------------------------------- SEO Audit -------------------------------- */

export function SeoAuditReport({ project }: { project: Project }) {
  const audit = primaryAudit(healthByProject[project.id] ?? { websites: [] });

  return (
    <div>
      <ReportHeader title="SEO Audit Report" project={project} />
      {!audit ? (
        <NoSite />
      ) : (
        <>
          <Section title="Site-wide checks">
            <ul className="rounded-lg border border-gray-200">
              {SITE_CHECKLIST.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm last:border-0"
                >
                  <StatusIcon status={audit.siteChecks[item.id]} />
                  <span className="text-gray-800">{item.title}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="On-page SEO by page">
            <div className="space-y-4">
              {audit.pages.map((page) => {
                const counts = SEO_CHECKLIST.reduce(
                  (acc, item) => {
                    acc[page.seoChecks[item.id]]++;
                    return acc;
                  },
                  { pass: 0, warn: 0, fail: 0 } as Record<CheckStatus, number>
                );
                const issues = SEO_CHECKLIST.filter(
                  (i) => page.seoChecks[i.id] !== "pass"
                );
                return (
                  <div
                    key={page.id}
                    className="rounded-lg border border-gray-200 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium text-gray-900">
                        {page.name}{" "}
                        <span className="text-gray-400">{page.path}</span>
                      </span>
                      <span className="flex gap-2 text-xs">
                        <span className="text-green-700">{counts.pass} ok</span>
                        <span className="text-amber-600">{counts.warn} warn</span>
                        <span className="text-red-600">{counts.fail} fail</span>
                      </span>
                    </div>
                    {issues.length === 0 ? (
                      <p className="text-sm text-green-700">All checks passed.</p>
                    ) : (
                      <ul className="space-y-1">
                        {issues.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-start gap-2 text-sm"
                          >
                            <StatusIcon status={page.seoChecks[item.id]} />
                            <span>
                              <span className="text-gray-800">{item.title}</span>
                              {page.seoNotes[item.id] && (
                                <span className="text-gray-500">
                                  {" "}
                                  — {page.seoNotes[item.id]}
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

/* ----------------------------- Work Summary ------------------------------- */

export function WorkSummaryReport({ project }: { project: Project }) {
  const projectTasks = allTasks.filter((t) => t.projectId === project.id);
  const byStatus = STATUSES.map((s) => ({
    status: s,
    count: projectTasks.filter((t) => t.status === s).length,
  }));
  const done = projectTasks.filter((t) => t.status === "Done");
  const inProgress = projectTasks.filter((t) => t.status === "In Progress");

  return (
    <div>
      <ReportHeader title="Work Summary" project={project} />

      <Section title="Status breakdown">
        <div className="flex flex-wrap gap-2">
          {byStatus.map((s) => (
            <Chip key={s.status} size="sm" variant="soft">
              {s.status}: {s.count}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title={`Completed (${done.length})`}>
        {done.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing completed yet.</p>
        ) : (
          <ul className="rounded-lg border border-gray-200">
            {done.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between border-b border-gray-100 px-3 py-2 text-sm last:border-0"
              >
                <span className="text-gray-800">{t.title}</span>
                <span className="text-gray-400">{t.assignee}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`In progress (${inProgress.length})`}>
        {inProgress.length === 0 ? (
          <p className="text-sm text-gray-400">No tasks in progress.</p>
        ) : (
          <ul className="rounded-lg border border-gray-200">
            {inProgress.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between border-b border-gray-100 px-3 py-2 text-sm last:border-0"
              >
                <span className="text-gray-800">{t.title}</span>
                <span className="text-gray-400">{t.assignee}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/* --------------------------- Monthly Client ------------------------------- */

export function MonthlyClientReport({ project }: { project: Project }) {
  const audit = primaryAudit(healthByProject[project.id] ?? { websites: [] });
  const summary = audit ? summarize(audit) : null;
  const projectTasks = allTasks.filter((t) => t.projectId === project.id);
  const done = projectTasks.filter((t) => t.status === "Done");
  const inProgress = projectTasks.filter((t) => t.status === "In Progress");

  return (
    <div>
      <ReportHeader title="Monthly Client Report" project={project} />

      <Section title="Website Health">
        {!summary ? (
          <NoSite />
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Overall"
                value={summary.overall}
                tone={scoreColor(summary.overall)}
              />
              <StatCard
                label="Performance"
                value={summary.performance}
                tone={scoreColor(summary.performance)}
              />
              <StatCard label="SEO issues" value={summary.seo.warn + summary.seo.fail} />
              <StatCard label="Images to fix" value={summary.imagesNeedingAttention} />
            </div>
            {audit && (
              <ul className="rounded-lg border border-gray-200">
                {audit.pages.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between border-b border-gray-100 px-3 py-2 text-sm last:border-0"
                  >
                    <span className="text-gray-700">
                      {p.name}{" "}
                      <span className="text-gray-400">{p.path}</span>
                    </span>
                    <span
                      className={`font-medium ${scoreColor(p.speedMobile.performance)}`}
                    >
                      {p.speedMobile.performance} mobile
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Section>

      <Section title="Work this month">
        <div className="mb-3 grid grid-cols-2 gap-3">
          <StatCard label="Completed" value={done.length} tone="text-green-600" />
          <StatCard label="In progress" value={inProgress.length} />
        </div>
        {done.length > 0 && (
          <ul className="rounded-lg border border-gray-200">
            {done.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm last:border-0"
              >
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-gray-800">{t.title}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
