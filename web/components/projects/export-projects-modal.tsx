"use client";

import {
  Button,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  type useOverlayState,
} from "@heroui/react";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";

import { SearchableFilter } from "@/components/ui/searchable-filter";

import {
  DOMAIN_OPTIONS,
  SERVER_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  type Project,
} from "./data";

const ALL = "all";

const CSV_HEADERS = [
  "Client Name",
  "Type",
  "Assignee",
  "Status",
  "Priority",
  "Websites",
  "Figma Link",
  "Domain",
  "Server",
] as const;

/** RFC-4180-safe CSV cell: quote when it contains a comma, quote, or newline. */
function csvCell(value: string) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function websitesOf(project: Project) {
  const links = project.websites?.length
    ? project.websites.map((w) => `${w.name} (${w.url})`)
    : [project.liveLink, project.stagingLink].filter(Boolean);
  return links.join(" | ");
}

function buildCsv(rows: Project[]) {
  const lines = [CSV_HEADERS.join(",")];
  for (const project of rows) {
    lines.push(
      [
        project.clientName,
        project.type,
        project.assignee.name,
        project.status,
        project.priority,
        websitesOf(project),
        project.figmaLink ?? "",
        project.domainManagement,
        project.serverLocation,
      ]
        .map(csvCell)
        .join(",")
    );
  }
  // Prepend a BOM so Excel opens UTF-8 correctly.
  return "﻿" + lines.join("\r\n");
}

function download(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExportProjectsModal({
  state,
  projects,
}: {
  state: ReturnType<typeof useOverlayState>;
  projects: Project[];
}) {
  const [type, setType] = useState(ALL);
  const [assignee, setAssignee] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [domain, setDomain] = useState(ALL);
  const [server, setServer] = useState(ALL);

  const assigneeOptions = useMemo(
    () =>
      Array.from(new Set(projects.map((p) => p.assignee.name)))
        .filter(Boolean)
        .sort()
        .map((name) => ({ key: name, label: name })),
    [projects]
  );

  const matches = useMemo(
    () =>
      projects.filter(
        (p) =>
          (type === ALL || p.type === type) &&
          (assignee === ALL || p.assignee.name === assignee) &&
          (status === ALL || p.status === status) &&
          (domain === ALL || p.domainManagement === domain) &&
          (server === ALL || p.serverLocation === server)
      ),
    [projects, type, assignee, status, domain, server]
  );

  const reset = () => {
    setType(ALL);
    setAssignee(ALL);
    setStatus(ALL);
    setDomain(ALL);
    setServer(ALL);
  };

  const close = () => {
    reset();
    state.close();
  };

  const handleExport = () => {
    if (matches.length === 0) return;
    const date = new Date().toISOString().slice(0, 10);
    download(`projects-export-${date}.csv`, buildCsv(matches));
    close();
  };

  const field = (label: string, node: React.ReactNode) => (
    <div className="space-y-1">
      <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
        {label}
      </label>
      {node}
    </div>
  );

  return (
    <Modal isOpen={state.isOpen} onOpenChange={(open) => (open ? state.setOpen(true) : close())}>
      <ModalBackdrop>
        <ModalContainer placement="center" size="md">
          <ModalDialog>
            <ModalHeader>
              <ModalHeading className="text-base font-semibold">Export projects to CSV</ModalHeading>
            </ModalHeader>

            <ModalBody className="space-y-4">
              <p className="text-sm text-slate-500">
                Choose filters to narrow the export. Leave any filter on
                &ldquo;All&rdquo; to include everything.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {field(
                  "Type",
                  <SearchableFilter
                    ariaLabel="Filter by type"
                    value={type}
                    onChange={setType}
                    options={[{ key: ALL, label: "All types" }, ...TYPE_OPTIONS.map((t) => ({ key: t, label: t }))]}
                    placeholder="All types"
                    triggerClassName="w-full"
                  />
                )}
                {field(
                  "Assignee",
                  <SearchableFilter
                    ariaLabel="Filter by assignee"
                    value={assignee}
                    onChange={setAssignee}
                    options={[{ key: ALL, label: "All assignees" }, ...assigneeOptions]}
                    placeholder="All assignees"
                    triggerClassName="w-full"
                  />
                )}
                {field(
                  "Status",
                  <SearchableFilter
                    ariaLabel="Filter by status"
                    value={status}
                    onChange={setStatus}
                    options={[{ key: ALL, label: "All statuses" }, ...STATUS_OPTIONS.map((s) => ({ key: s, label: s }))]}
                    placeholder="All statuses"
                    triggerClassName="w-full"
                  />
                )}
                {field(
                  "Domain",
                  <SearchableFilter
                    ariaLabel="Filter by domain management"
                    value={domain}
                    onChange={setDomain}
                    options={[{ key: ALL, label: "All domains" }, ...DOMAIN_OPTIONS.map((d) => ({ key: d, label: d }))]}
                    placeholder="All domains"
                    triggerClassName="w-full"
                  />
                )}
                {field(
                  "Server",
                  <SearchableFilter
                    ariaLabel="Filter by server"
                    value={server}
                    onChange={setServer}
                    options={[{ key: ALL, label: "All servers" }, ...SERVER_OPTIONS.map((s) => ({ key: s, label: s }))]}
                    placeholder="All servers"
                    triggerClassName="w-full"
                  />
                )}
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <span className="font-semibold text-slate-900">{matches.length}</span>
                <span className="text-slate-600">
                  {" "}
                  of {projects.length} project{projects.length === 1 ? "" : "s"} match — these will be exported.
                </span>
              </div>
            </ModalBody>

            <ModalFooter className="flex justify-end gap-2">
              <Button type="button" variant="tertiary" onPress={close}>
                Cancel
              </Button>
              <Button type="button" variant="primary" isDisabled={matches.length === 0} onPress={handleExport}>
                <Download className="h-4 w-4" />
                Export {matches.length > 0 ? `(${matches.length})` : ""}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
