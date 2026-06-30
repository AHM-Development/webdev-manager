"use client";

import {
  Button,
  ListBox,
  ListBoxItem,
  Select,
  SelectIndicator,
  SelectPopover,
  SelectTrigger,
  SelectValue,
} from "@heroui/react";
import { Download } from "lucide-react";
import { useState } from "react";

import { projects } from "@/components/projects/data";

import {
  MonthlyClientReport,
  ProjectStatusReport,
  SeoAuditReport,
  WorkSummaryReport,
} from "./reports";

const REPORTS = [
  { id: "monthly", label: "Monthly Client Report", Component: MonthlyClientReport },
  { id: "seo", label: "SEO Audit Report", Component: SeoAuditReport },
  { id: "work", label: "Work Summary", Component: WorkSummaryReport },
  { id: "status", label: "Project Status Snapshot", Component: ProjectStatusReport },
] as const;

export function ReportsView() {
  const [projectId, setProjectId] = useState(projects[0]?.id);
  const [reportId, setReportId] = useState<(typeof REPORTS)[number]["id"]>(
    "monthly"
  );

  const project = projects.find((p) => p.id === projectId) ?? projects[0];
  const report = REPORTS.find((r) => r.id === reportId) ?? REPORTS[0];
  const Report = report.Component;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">
          Pick a project and a report, then export it.
        </p>
      </div>

      {/* Toolbar (hidden when printing) */}
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Project
            </label>
            <Select
              aria-label="Select project"
              selectedKey={projectId}
              onSelectionChange={(k) => setProjectId(String(k))}
            >
              <SelectTrigger className="min-w-[200px]">
                <SelectValue>{project.clientName}</SelectValue>
                <SelectIndicator />
              </SelectTrigger>
              <SelectPopover>
                <ListBox>
                  {projects.map((p) => (
                    <ListBoxItem key={p.id} id={p.id}>
                      {p.clientName}
                    </ListBoxItem>
                  ))}
                </ListBox>
              </SelectPopover>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Report
            </label>
            <Select
              aria-label="Select report"
              selectedKey={reportId}
              onSelectionChange={(k) =>
                setReportId(k as (typeof REPORTS)[number]["id"])
              }
            >
              <SelectTrigger className="min-w-[220px]">
                <SelectValue>{report.label}</SelectValue>
                <SelectIndicator />
              </SelectTrigger>
              <SelectPopover>
                <ListBox>
                  {REPORTS.map((r) => (
                    <ListBoxItem key={r.id} id={r.id}>
                      {r.label}
                    </ListBoxItem>
                  ))}
                </ListBox>
              </SelectPopover>
            </Select>
          </div>
        </div>

        <Button variant="primary" onPress={() => window.print()}>
          <Download className="h-4 w-4" />
          Export PDF
        </Button>
      </div>

      {/* The printable report */}
      <div className="report-print rounded-lg border border-gray-200 bg-white p-6">
        <Report project={project} />
      </div>
    </div>
  );
}
