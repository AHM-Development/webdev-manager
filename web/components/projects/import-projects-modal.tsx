"use client";

import {
  Button,
  Input,
  Label,
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
  TextArea,
  TextField,
  type useOverlayState,
} from "@heroui/react";
import { FileSpreadsheet, Link2, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import { previewProjectImport } from "@/libs/api/projects";
import { notify } from "@/libs/notify";

import {
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  type DomainManagement,
  type Project,
  type ProjectPriority,
  type ProjectStatus,
  type ProjectType,
  type ServerLocation,
} from "./data";

type ImportSource = "google" | "csv" | "excel";
type MappingKey =
  | "clientName"
  | "type"
  | "assignee"
  | "status"
  | "priority"
  | "websiteName"
  | "websiteUrl"
  | "figmaLink"
  | "domainManagement"
  | "serverLocation";

type ParsedSheet = {
  headers: string[];
  rows: Record<string, string>[];
};

type FieldMapping = Record<MappingKey, string>;

const importSources: {
  id: ImportSource;
  label: string;
  description: string;
  icon: typeof Link2;
}[] = [
  {
    id: "google",
    label: "Google Sheets",
    description: "Paste a Google Sheets link shared with Viewer access.",
    icon: Link2,
  },
  {
    id: "csv",
    label: "CSV",
    description: "Paste CSV data or upload a .csv file.",
    icon: FileSpreadsheet,
  },
  {
    id: "excel",
    label: "Excel",
    description: "Upload .xlsx/.xls, then map the available columns.",
    icon: Upload,
  },
];

const mappingFields: { key: MappingKey; label: string; required?: boolean }[] = [
  { key: "clientName", label: "Client Name", required: true },
  { key: "type", label: "Type" },
  { key: "assignee", label: "Assignee" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "websiteName", label: "Website Name" },
  { key: "websiteUrl", label: "Website URL" },
  { key: "figmaLink", label: "Figma Link" },
  { key: "domainManagement", label: "Domain Management" },
  { key: "serverLocation", label: "Server Location" },
];

const defaultMapping: FieldMapping = {
  clientName: "",
  type: "",
  assignee: "",
  status: "",
  priority: "",
  websiteName: "",
  websiteUrl: "",
  figmaLink: "",
  domainManagement: "",
  serverLocation: "",
};

function guessMapping(headers: string[]): FieldMapping {
  const find = (patterns: RegExp[]) =>
    headers.find((header) =>
      patterns.some((pattern) => pattern.test(header.toLowerCase()))
    ) ?? "";

  return {
    clientName: find([/client/, /project/, /name/]),
    type: find([/type/]),
    assignee: find([/assignee/, /owner/, /developer/, /lead/]),
    status: find([/status/, /stage/]),
    priority: find([/priority/]),
    websiteName: find([/website.*name/, /site.*name/]),
    websiteUrl: find([/website/, /domain/, /url/, /link/, /live/]),
    figmaLink: find([/figma/]),
    domainManagement: find([/domain.*management/, /registrar/, /dns/]),
    serverLocation: find([/server/, /hosting/, /host/]),
  };
}

function normalizeOption<T extends string>(value: string, options: readonly T[], fallback: T): T {
  const normalized = value.trim().toLowerCase();
  return (
    options.find((option) => option.toLowerCase() === normalized) ??
    fallback
  );
}

function cell(row: Record<string, string>, mapping: FieldMapping, key: MappingKey) {
  const header = mapping[key];
  return header ? row[header]?.trim() ?? "" : "";
}

function toProjects(sheet: ParsedSheet, mapping: FieldMapping): Project[] {
  return sheet.rows
    .map((row, index): Project | null => {
      const clientName = cell(row, mapping, "clientName");
      if (!clientName) return null;

      const websiteUrl = cell(row, mapping, "websiteUrl");
      const websiteName = cell(row, mapping, "websiteName") || "Main Website";

      return {
        id: `import-${Date.now()}-${index}`,
        clientName,
        type: normalizeOption<ProjectType>(
          cell(row, mapping, "type"),
          TYPE_OPTIONS,
          "Full Web Dev"
        ),
        assignee: {
          name: cell(row, mapping, "assignee") || "Unassigned",
        },
        status: normalizeOption<ProjectStatus>(
          cell(row, mapping, "status"),
          STATUS_OPTIONS,
          "In Progress"
        ),
        priority: normalizeOption<ProjectPriority>(
          cell(row, mapping, "priority"),
          PRIORITY_OPTIONS,
          "Medium"
        ),
        websites: websiteUrl
          ? [{ id: `site-${Date.now()}-${index}`, name: websiteName, url: websiteUrl }]
          : [],
        liveLink: websiteUrl || undefined,
        figmaLink: cell(row, mapping, "figmaLink") || undefined,
        domainManagement: normalizeOption<DomainManagement>(
          cell(row, mapping, "domainManagement"),
          ["Client Domain", "Cloudflare"],
          "Cloudflare"
        ),
        serverLocation: normalizeOption<ServerLocation>(
          cell(row, mapping, "serverLocation"),
          ["Client", "Hetzner", "AWS"],
          "Hetzner"
        ),
      };
    })
    .filter((project): project is Project => project !== null);
}

function MappingSelect({
  label,
  value,
  headers,
  required,
  onChange,
}: {
  label: string;
  value: string;
  headers: string[];
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      <Select
        aria-label={`Map ${label}`}
        selectedKey={value || "skip"}
        onSelectionChange={(key) => onChange(String(key) === "skip" ? "" : String(key))}
      >
        <SelectTrigger className="w-full">
          <SelectValue>{value || "Skip"}</SelectValue>
          <SelectIndicator />
        </SelectTrigger>
        <SelectPopover>
          <ListBox>
            <ListBoxItem id="skip">Skip</ListBoxItem>
            {headers.map((header) => (
              <ListBoxItem key={header} id={header}>
                {header}
              </ListBoxItem>
            ))}
          </ListBox>
        </SelectPopover>
      </Select>
    </div>
  );
}

export function ImportProjectsModal({
  state,
  onImport,
}: {
  state: ReturnType<typeof useOverlayState>;
  onImport: (payload: {
    headers: string[];
    rows: Record<string, string>[];
    mapping: Record<string, string>;
  }) => void | Promise<void>;
}) {
  const [source, setSource] = useState<ImportSource>("google");
  const [sheetUrl, setSheetUrl] = useState("");
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>(defaultMapping);
  const [error, setError] = useState<string | null>(null);
  const [loadingSheet, setLoadingSheet] = useState(false);

  const previewProjects = useMemo(
    () => (sheet ? toProjects(sheet, mapping).slice(0, 5) : []),
    [sheet, mapping]
  );
  const importCount = useMemo(
    () => (sheet ? toProjects(sheet, mapping).length : 0),
    [sheet, mapping]
  );

  const reset = () => {
    setSource("google");
    setSheetUrl("");
    setCsvText("");
    setFileName("");
    setSheet(null);
    setMapping(defaultMapping);
    setError(null);
    setLoadingSheet(false);
  };

  const close = () => {
    reset();
    state.close();
  };

  const showError = (message: string) => {
    setError(message);
    notify.error("Import error", { description: message });
  };

  const setParsedSheet = (parsed: ParsedSheet) => {
    if (!parsed.headers.length || !parsed.rows.length) {
      showError("No rows found. Make sure the first row contains column headers.");
      return;
    }
    setSheet(parsed);
    setMapping(guessMapping(parsed.headers));
    setError(null);
  };

  const setPreviewResponse = (preview: {
    headers: string[];
    rows: Record<string, string>[];
    mapping: Record<string, string>;
  }) => {
    setParsedSheet({
      headers: preview.headers,
      rows: preview.rows,
    });
    setMapping({
      ...defaultMapping,
      ...preview.mapping,
    });
  };

  const handleCsvText = async () => {
    try {
      setPreviewResponse(await previewProjectImport({ csvText }));
    } catch (err) {
      showError((err as Error).message ?? "Could not parse CSV data.");
    }
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);

    try {
      setPreviewResponse(await previewProjectImport({ file }));
    } catch (err) {
      showError((err as Error).message ?? "Could not parse the selected file.");
    }
  };

  const handleGoogleSheet = async () => {
    if (!sheetUrl.trim()) {
      showError("Add a Google Sheets link first.");
      return;
    }

    setLoadingSheet(true);
    try {
      setPreviewResponse(await previewProjectImport({ sheetUrl }));
    } catch (err) {
      showError(
        (err as Error).message ??
          "Could not load the Google Sheet. Check its Viewer access and try again."
      );
    } finally {
      setLoadingSheet(false);
    }
  };

  const handleImport = () => {
    if (!sheet) return;
    const projects = toProjects(sheet, mapping);
    if (!projects.length) {
      showError("Map at least the Client Name column before importing.");
      return;
    }
    Promise.resolve(
      onImport({
        headers: sheet.headers,
        rows: sheet.rows,
        mapping,
      })
    )
      .then(close)
      .catch((err) => {
        showError(err?.message ?? "Import failed. Please check the data and try again.");
      });
  };

  return (
    <Modal isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <ModalBackdrop>
        <ModalContainer placement="center">
          <ModalDialog className="max-w-219">
            <ModalHeader>
              <ModalHeading className="text-lg font-semibold">
                Import Projects
              </ModalHeading>
            </ModalHeader>

            <ModalBody className="max-h-[72vh] space-y-5 overflow-y-auto">
              <div className="grid gap-3 md:grid-cols-3">
                {importSources.map((item) => {
                  const Icon = item.icon;
                  const active = source === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSource(item.id);
                        setError(null);
                      }}
                      className={`rounded-2xl border p-4 text-left transition ${
                        active
                          ? "border-[#0b7de3] bg-[#e8f5ff] text-[#082a78]"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <p className="mt-3 text-sm font-semibold">{item.label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {item.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              {source === "google" && (
                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_auto] md:items-end">
                  <TextField value={sheetUrl} onChange={setSheetUrl}>
                    <Label>Google Sheets URL</Label>
                    <Input placeholder="https://docs.google.com/spreadsheets/d/..." />
                  </TextField>
                  <Button
                    isDisabled={loadingSheet}
                    variant="primary"
                    onPress={handleGoogleSheet}
                  >
                    {loadingSheet ? "Loading..." : "Load Sheet"}
                  </Button>
                </div>
              )}

              {(source === "csv" || source === "excel") && (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        Upload file
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Upload CSV, XLSX, or XLS. The backend will parse the file
                        and return columns for mapping.
                      </p>
                    </div>
                    <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      <Upload className="h-4 w-4" />
                      Choose File
                      <input
                        type="file"
                        accept={source === "excel" ? ".xlsx,.xls,.csv" : ".csv,text/csv"}
                        className="sr-only"
                        onChange={(event) => handleFile(event.target.files?.[0])}
                      />
                    </label>
                  </div>

                  {fileName && (
                    <p className="rounded-xl bg-[#e8f5ff] px-3 py-2 text-sm text-[#082a78]">
                      Selected: {fileName}
                    </p>
                  )}

                  <TextField value={csvText} onChange={setCsvText}>
                    <Label>Paste CSV data</Label>
                    <TextArea
                      rows={7}
                      placeholder="Client Name,Type,Assignee,Status,Website URL..."
                    />
                  </TextField>

                  <Button variant="primary" onPress={handleCsvText}>
                    Parse CSV
                  </Button>
                </div>
              )}

              {error && <span className="sr-only">{error}</span>}

              {sheet && (
                <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        Map Columns
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {sheet.rows.length} rows detected. Client Name is required.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {mappingFields.map((field) => (
                        <MappingSelect
                          key={field.key}
                          label={field.label}
                          required={field.required}
                          value={mapping[field.key]}
                          headers={sheet.headers}
                          onChange={(value) =>
                            setMapping((current) => ({
                              ...current,
                              [field.key]: value,
                            }))
                          }
                        />
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-[#f7f8fa] p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-950">
                        Preview
                      </p>
                      <span className="text-xs font-medium text-slate-500">
                        {importCount} ready
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {previewProjects.map((project) => (
                        <div
                          key={project.id}
                          className="rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200"
                        >
                          <p className="font-semibold text-slate-950">
                            {project.clientName}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {project.type} • {project.status} •{" "}
                            {project.assignee.name}
                          </p>
                        </div>
                      ))}
                      {!previewProjects.length && (
                        <p className="rounded-xl bg-white p-3 text-sm text-slate-500 ring-1 ring-slate-200">
                          No preview yet. Map Client Name to continue.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </ModalBody>

            <ModalFooter className="flex justify-end gap-2">
              <Button type="button" variant="tertiary" onPress={close}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                isDisabled={!sheet || !mapping.clientName || importCount === 0}
                onPress={handleImport}
              >
                Import {importCount || ""} Projects
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
