"use client";

import {
  Button,
  Chip,
  ListBox,
  ListBoxItem,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Select,
  SelectIndicator,
  SelectPopover,
  SelectTrigger,
  SelectValue,
  type useOverlayState,
} from "@heroui/react";
import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { Project } from "@/components/projects/data";

import {
  imageIssueLabel,
  summarize,
  type CheckStatus,
  type ProjectHealth,
  type SiteAudit,
} from "./data";
import { SEO_CHECKLIST } from "./seo-checklist";
import { SITE_CHECKLIST } from "./site-checklist";

type ReportSectionId =
  | "overview"
  | "qa"
  | "lighthouse"
  | "technicalSeo"
  | "pages"
  | "plugins"
  | "users"
  | "wordpress";

const REPORT_SECTIONS: { id: ReportSectionId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "qa", label: "QA Scan" },
  { id: "lighthouse", label: "Lighthouse" },
  { id: "technicalSeo", label: "Technical SEO" },
  { id: "pages", label: "Pages" },
  { id: "plugins", label: "Plugins" },
  { id: "users", label: "Users" },
  { id: "wordpress", label: "WordPress" },
];

function formatDate(iso?: string) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function scoreColor(score: number) {
  return score >= 90
    ? "text-green-600"
    : score >= 50
      ? "text-amber-600"
      : "text-red-600";
}

function statusColor(status: CheckStatus) {
  if (status === "pass") return "success";
  if (status === "warn") return "warning";
  return "danger";
}

function ReportBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="break-inside-avoid border-t border-gray-200 pt-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function DataRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 text-sm last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-800">{value}</span>
    </div>
  );
}

function StatusChip({ status }: { status: CheckStatus }) {
  return (
    <Chip size="sm" variant="soft" color={statusColor(status)}>
      {status}
    </Chip>
  );
}

function ConsolidatedReport({
  project,
  audit,
  selectedSections,
}: {
  project: Project;
  audit: SiteAudit;
  selectedSections: Set<ReportSectionId>;
}) {
  const summary = summarize(audit);
  const generatedAt = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="space-y-6 bg-white text-gray-900">
      <header className="flex items-start justify-between gap-6 border-b border-gray-200 pb-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            AHM Web Manager
          </p>
          <h2 className="mt-1 text-2xl font-semibold">
            Website Health Export
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {project.clientName} • {audit.websiteName}
          </p>
          <p className="mt-1 text-sm text-blue-700">{audit.websiteUrl}</p>
        </div>
        <p className="text-right text-sm text-gray-500">{generatedAt}</p>
      </header>

      {selectedSections.has("overview") && (
        <ReportBlock title="Overview">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-400">Overall</p>
              <p className={`mt-1 text-2xl font-bold ${scoreColor(summary.overall)}`}>
                {summary.overall}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-400">Performance</p>
              <p className={`mt-1 text-2xl font-bold ${scoreColor(summary.performance)}`}>
                {summary.performance}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-400">SEO Issues</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {summary.seo.warn + summary.seo.fail}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-400">Image Issues</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {summary.imagesNeedingAttention}
              </p>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-gray-200 px-3">
            <DataRow label="Last activity" value={formatDate(audit.lastActivityAt)} />
            <DataRow label="Last website update" value={formatDate(audit.lastUpdatedAt)} />
            <DataRow label="Pages scanned" value={audit.pages.length} />
            <DataRow label="Sitemap" value={audit.sitemapUrl} />
          </div>
        </ReportBlock>
      )}

      {selectedSections.has("qa") && (
        <ReportBlock title="QA Scan">
          <div className="rounded-lg border border-gray-200">
            {audit.qaFindings.map((finding) => (
              <div
                key={finding.id}
                className="flex items-start justify-between gap-4 border-b border-gray-100 px-3 py-2 text-sm last:border-0"
              >
                <div>
                  <p className="font-medium text-gray-900">{finding.title}</p>
                  <p className="text-gray-500">{finding.detail}</p>
                </div>
                <StatusChip status={finding.status} />
              </div>
            ))}
          </div>
        </ReportBlock>
      )}

      {selectedSections.has("lighthouse") && (
        <ReportBlock title="Lighthouse">
          <div className="space-y-3">
            {audit.pages.map((page) => (
              <div key={page.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-gray-900">
                    {page.name} <span className="text-gray-400">{page.path}</span>
                  </p>
                  <p className={`font-semibold ${scoreColor(page.speedMobile.performance)}`}>
                    {page.speedMobile.performance} mobile
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <DataRow label="A11y" value={page.speedMobile.accessibility} />
                  <DataRow label="Best practices" value={page.speedMobile.bestPractices} />
                  <DataRow label="SEO" value={page.speedMobile.seo} />
                  <DataRow label="LCP" value={`${page.speedMobile.lcp}s`} />
                </div>
              </div>
            ))}
          </div>
        </ReportBlock>
      )}

      {selectedSections.has("technicalSeo") && (
        <ReportBlock title="Technical SEO">
          <div className="mb-4 rounded-lg border border-gray-200">
            {SITE_CHECKLIST.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-4 border-b border-gray-100 px-3 py-2 text-sm last:border-0"
              >
                <div>
                  <p className="font-medium text-gray-900">{item.title}</p>
                  {audit.siteNotes[item.id] && (
                    <p className="text-gray-500">{audit.siteNotes[item.id]}</p>
                  )}
                </div>
                <StatusChip status={audit.siteChecks[item.id]} />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {audit.pages.map((page) => {
              const issues = SEO_CHECKLIST.filter(
                (item) => page.seoChecks[item.id] !== "pass"
              );
              return (
                <div key={page.id} className="rounded-lg border border-gray-200 p-3">
                  <p className="font-medium text-gray-900">
                    {page.name} <span className="text-gray-400">{page.path}</span>
                  </p>
                  {issues.length === 0 ? (
                    <p className="mt-2 text-sm text-green-700">All checks passed.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {issues.map((item) => (
                        <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                          <span>
                            <span className="text-gray-800">{item.title}</span>
                            {page.seoNotes[item.id] && (
                              <span className="text-gray-500"> - {page.seoNotes[item.id]}</span>
                            )}
                          </span>
                          <StatusChip status={page.seoChecks[item.id]} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </ReportBlock>
      )}

      {selectedSections.has("pages") && (
        <ReportBlock title="Pages">
          <div className="rounded-lg border border-gray-200">
            {audit.pages.map((page) => {
              const imageIssues = page.images.flatMap((image) => image.issues);
              return (
                <div
                  key={page.id}
                  className="grid gap-3 border-b border-gray-100 px-3 py-2 text-sm last:border-0 sm:grid-cols-[1fr_120px_1.4fr]"
                >
                  <span className="font-medium text-gray-900">
                    {page.name} <span className="text-gray-400">{page.path}</span>
                  </span>
                  <span className={scoreColor(page.speedMobile.performance)}>
                    {page.speedMobile.performance} mobile
                  </span>
                  <span className="text-gray-500">
                    {imageIssues.length === 0
                      ? "No image issues"
                      : imageIssues.map((issue) => imageIssueLabel[issue]).join(", ")}
                  </span>
                </div>
              );
            })}
          </div>
        </ReportBlock>
      )}

      {selectedSections.has("plugins") && (
        <ReportBlock title="Plugins">
          <div className="rounded-lg border border-gray-200">
            {audit.plugins.map((plugin) => (
              <div
                key={plugin.name}
                className="grid gap-3 border-b border-gray-100 px-3 py-2 text-sm last:border-0 sm:grid-cols-[1fr_130px_130px_120px]"
              >
                <span className="font-medium text-gray-900">{plugin.name}</span>
                <span>{plugin.installedVersion}</span>
                <span>{plugin.latestVersion}</span>
                <Chip size="sm" variant="soft" color={plugin.updated ? "success" : "warning"}>
                  {plugin.updated ? "Updated" : "Outdated"}
                </Chip>
              </div>
            ))}
          </div>
        </ReportBlock>
      )}

      {selectedSections.has("users") && (
        <ReportBlock title="Users">
          <div className="rounded-lg border border-gray-200">
            {audit.users.map((user) => (
              <div
                key={user.email}
                className="grid gap-3 border-b border-gray-100 px-3 py-2 text-sm last:border-0 sm:grid-cols-[1fr_120px_150px_150px]"
              >
                <span>
                  <span className="font-medium text-gray-900">{user.name}</span>
                  <span className="block text-gray-500">{user.email}</span>
                </span>
                <span>{user.role}</span>
                <span>Login: {formatDate(user.lastLoginAt)}</span>
                <span>Password: {formatDate(user.passwordUpdatedAt)}</span>
              </div>
            ))}
          </div>
        </ReportBlock>
      )}

      {selectedSections.has("wordpress") && (
        <ReportBlock title="WordPress">
          <div className="rounded-lg border border-gray-200 px-3">
            <DataRow label="Installed version" value={audit.wordpressVersion} />
            <DataRow label="Latest version" value={audit.wordpressLatestVersion} />
            <DataRow
              label="Status"
              value={
                audit.wordpressVersion === audit.wordpressLatestVersion
                  ? "Updated"
                  : "Update available"
              }
            />
          </div>
        </ReportBlock>
      )}
    </div>
  );
}

export function ExportHealthReportModal({
  project,
  health,
  state,
}: {
  project: Project | null;
  health: ProjectHealth | null;
  state: ReturnType<typeof useOverlayState>;
}) {
  const websites = health?.websites ?? [];
  const [websiteId, setWebsiteId] = useState("");
  const [selectedSections, setSelectedSections] = useState<Set<ReportSectionId>>(
    () => new Set(REPORT_SECTIONS.map((section) => section.id))
  );

  useEffect(() => {
    if (state.isOpen) {
      setWebsiteId(websites[0]?.websiteId ?? "");
      setSelectedSections(new Set(REPORT_SECTIONS.map((section) => section.id)));
    }
  }, [state.isOpen, websites]);

  const audit = useMemo(
    () => websites.find((website) => website.websiteId === websiteId) ?? websites[0],
    [websiteId, websites]
  );

  const toggleSection = (id: ReportSectionId) => {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canExport = !!project && !!audit && selectedSections.size > 0;

  return (
    <Modal isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <ModalBackdrop>
        <ModalContainer placement="center" size="lg">
          <ModalDialog>
            <ModalHeader>
              <ModalHeading className="text-lg font-semibold">
                Export Website Health
              </ModalHeading>
            </ModalHeader>
            <ModalBody className="max-h-[72vh] space-y-5 overflow-y-auto">
              {!project || !audit ? (
                <p className="rounded-lg border border-gray-200 py-8 text-center text-sm text-gray-500">
                  No website health data is available for this project.
                </p>
              ) : (
                <>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Website
                      </label>
                      <Select
                        aria-label="Select website to export"
                        selectedKey={audit.websiteId}
                        onSelectionChange={(key) => setWebsiteId(String(key))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue>{audit.websiteName}</SelectValue>
                          <SelectIndicator />
                        </SelectTrigger>
                        <SelectPopover>
                          <ListBox>
                            {websites.map((website) => (
                              <ListBoxItem
                                key={website.websiteId}
                                id={website.websiteId}
                              >
                                {website.websiteName}
                              </ListBoxItem>
                            ))}
                          </ListBox>
                        </SelectPopover>
                      </Select>
                    </div>

                    <div>
                      <p className="mb-1 text-sm font-medium">
                        Reports to include
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        {REPORT_SECTIONS.map((section) => (
                          <label
                            key={section.id}
                            className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={selectedSections.has(section.id)}
                              onChange={() => toggleSection(section.id)}
                              className="h-4 w-4"
                            />
                            {section.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="report-print hidden bg-white p-5">
                    <ConsolidatedReport
                      project={project}
                      audit={audit}
                      selectedSections={selectedSections}
                    />
                  </div>
                </>
              )}
            </ModalBody>
            <ModalFooter className="flex justify-end gap-2">
              <Button type="button" variant="tertiary" onPress={state.close}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                isDisabled={!canExport}
                onPress={() => window.print()}
              >
                <Download className="h-4 w-4" />
                Export File
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
