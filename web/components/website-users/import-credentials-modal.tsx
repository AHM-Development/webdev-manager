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
import { zodResolver } from "@hookform/resolvers/zod";
import { FileSpreadsheet, Link2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import {
  importWebsiteCredentials,
  previewWebsiteCredentialImport,
  type WebsiteCredentialOptions,
} from "@/libs/api/website-users";
import { notify } from "@/libs/notify";

import type { CredEnv, Credential } from "./data";
import {
  credentialImportSchema,
  type CredentialImportValues,
} from "./schema";

type ImportSource = "google" | "csv" | "excel";
type MappingKey =
  | "name"
  | "projectOrSite"
  | "environment"
  | "username"
  | "password"
  | "createdAt"
  | "passwordUpdatedAt"
  | "note";

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
    description: "Use a published CSV link or exported sheet URL.",
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
  { key: "name", label: "Name", required: true },
  { key: "projectOrSite", label: "Project / Site", required: true },
  { key: "environment", label: "Website" },
  { key: "username", label: "Username", required: true },
  { key: "password", label: "Password", required: true },
  { key: "createdAt", label: "Created" },
  { key: "passwordUpdatedAt", label: "Password Updated" },
  { key: "note", label: "Note" },
];

const defaultMapping: FieldMapping = {
  name: "",
  projectOrSite: "",
  environment: "",
  username: "",
  password: "",
  createdAt: "",
  passwordUpdatedAt: "",
  note: "",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function guessMapping(headers: string[]): FieldMapping {
  const find = (patterns: RegExp[]) =>
    headers.find((header) =>
      patterns.some((pattern) => pattern.test(header.toLowerCase()))
    ) ?? "";

  return {
    name: find([/name/, /member/, /assignee/, /owner/, /user/]),
    projectOrSite: find([/project/, /client/, /site/, /website/, /domain/, /url/]),
    environment: find([/environment/, /website/, /live/, /staging/]),
    username: find([/username/, /user name/, /login/, /email/]),
    password: find([/password/, /pass/]),
    createdAt: find([/created/, /created at/, /date added/]),
    passwordUpdatedAt: find([/password.*updated/, /updated/, /last changed/]),
    note: find([/note/, /role/, /access/, /remarks/]),
  };
}

function cell(row: Record<string, string>, mapping: FieldMapping, key: MappingKey) {
  const header = mapping[key];
  return header ? row[header]?.trim() ?? "" : "";
}

function normalizeDate(value: string, fallback: string) {
  if (!value) return fallback;
  var parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString().slice(0, 10);
}

function normalizeEnvironment(value: string): CredEnv {
  return value.trim().toLowerCase() === "staging" ? "Staging" : "Live";
}

function findProject(target: string, options: WebsiteCredentialOptions) {
  const normalized = target.trim().toLowerCase();
  if (!normalized) return undefined;

  return options.projects.find((project) => {
    const websites = options.websites.filter((site) => site.projectId === project.id);
    const names = [project.id, project.name, ...websites.flatMap((site) => [site.name, site.url])];
    return names.some((value) => value.toLowerCase() === normalized);
  });
}

function toCredentials(
  sheet: ParsedSheet,
  mapping: FieldMapping,
  options: WebsiteCredentialOptions
): Credential[] {
  const todayValue = today();

  return sheet.rows
    .map((row, index): Credential | null => {
      const name = cell(row, mapping, "name");
      const target = cell(row, mapping, "projectOrSite");
      const username = cell(row, mapping, "username");
      const password = cell(row, mapping, "password");

      if (!name || !target || !username || !password) return null;

      const project = findProject(target, options);

      return {
        id: `cred-import-${Date.now()}-${index}`,
        name,
        projectId: project?.id,
        externalSite: project ? undefined : target,
        environment: normalizeEnvironment(cell(row, mapping, "environment")),
        username,
        password,
        createdAt: normalizeDate(cell(row, mapping, "createdAt"), todayValue),
        passwordUpdatedAt: normalizeDate(
          cell(row, mapping, "passwordUpdatedAt"),
          todayValue
        ),
        note: cell(row, mapping, "note") || undefined,
      };
    })
    .filter((credential): credential is Credential => credential !== null);
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
          <SelectValue>{value || "Do not import"}</SelectValue>
          <SelectIndicator />
        </SelectTrigger>
        <SelectPopover>
          <ListBox>
            <ListBoxItem id="skip">Do not import</ListBoxItem>
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

export function ImportCredentialsModal({
  state,
  options,
  onImport,
}: {
  state: ReturnType<typeof useOverlayState>;
  options: WebsiteCredentialOptions;
  onImport: (credentials: Credential[]) => void;
}) {
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CredentialImportValues>({
    resolver: zodResolver(credentialImportSchema),
    defaultValues: {
      source: "google",
      sheetUrl: "",
      csvText: "",
      mapping: defaultMapping,
    },
  });

  const source = form.watch("source") as ImportSource;
  const mapping = form.watch("mapping") as FieldMapping;

  const previewCredentials = useMemo(
    () => (sheet ? toCredentials(sheet, mapping, options).slice(0, 5) : []),
    [sheet, mapping, options]
  );
  const importCount = useMemo(
    () => (sheet ? toCredentials(sheet, mapping, options).length : 0),
    [sheet, mapping, options]
  );

  const reset = () => {
    setFileName("");
    setSheet(null);
    setError(null);
    form.reset({
      source: "google",
      sheetUrl: "",
      csvText: "",
      mapping: defaultMapping,
    });
  };

  const close = () => {
    reset();
    state.close();
  };

  const showError = (message: string) => {
    setError(message);
    notify.error("Import error", { description: message });
  };

  const setPreviewResponse = (preview: {
    headers: string[];
    rows: Record<string, string>[];
  }) => {
    if (!preview.headers.length || !preview.rows.length) {
      showError("No rows found. Make sure the first row contains column headers.");
      return;
    }

    setSheet({
      headers: preview.headers,
      rows: preview.rows,
    });
    form.setValue("mapping", {
      ...defaultMapping,
      ...guessMapping(preview.headers),
    });
    setError(null);
  };

  const handleCsvText = async () => {
    try {
      setPreviewResponse(
        await previewWebsiteCredentialImport({ csvText: form.getValues("csvText") })
      );
    } catch (err) {
      showError((err as Error).message ?? "Could not parse CSV data.");
    }
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);

    try {
      setPreviewResponse(await previewWebsiteCredentialImport({ file }));
    } catch (err) {
      showError((err as Error).message ?? "Could not parse the selected file.");
    }
  };

  const handleGoogleSheet = async () => {
    const sheetUrl = form.getValues("sheetUrl");
    if (!sheetUrl.trim()) {
      showError("Add a Google Sheets link first.");
      return;
    }

    try {
      setPreviewResponse(await previewWebsiteCredentialImport({ sheetUrl }));
    } catch (err) {
      showError(
        (err as Error).message ??
          "Could not fetch the Google Sheet. Publish it as CSV, or export/paste the CSV data instead."
      );
    }
  };

  const handleImport = () => {
    if (!sheet) return;
    const values = form.getValues();
    const credentials = toCredentials(sheet, values.mapping, options);
    if (!credentials.length) {
      showError("Map Name, Project / Site, Username, and Password before importing.");
      return;
    }

    importWebsiteCredentials({
      headers: sheet.headers,
      rows: sheet.rows,
      mapping: values.mapping,
    })
      .then((result) => {
        onImport(result.imported);
        if (result.errors.length) {
          notify.warning("Import completed with issues", {
            description: `${result.imported.length} imported. ${result.errors.length} rows failed.`,
          });
        }
        close();
      })
      .catch((err) => {
        showError(err?.message ?? "Import failed. Please check the data and try again.");
      });
  };

  return (
    <Modal isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <ModalBackdrop>
        <ModalContainer placement="center">
          <ModalDialog className="max-w-3xl">
            <ModalHeader>
              <ModalHeading className="text-lg font-semibold">
                Import Credentials
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
                        form.setValue("source", item.id);
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
                  <Controller
                    control={form.control}
                    name="sheetUrl"
                    render={({ field }) => (
                      <TextField
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                      >
                        <Label>Google Sheets URL</Label>
                        <Input placeholder="https://docs.google.com/spreadsheets/d/..." />
                      </TextField>
                    )}
                  />
                  <Button variant="primary" onPress={handleGoogleSheet}>
                    Load Sheet
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
                        Upload CSV, XLSX, or XLS. The columns will be available
                        for mapping before import.
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

                  <Controller
                    control={form.control}
                    name="csvText"
                    render={({ field }) => (
                      <TextField
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                      >
                        <Label>Paste CSV data</Label>
                        <TextArea
                          rows={7}
                          placeholder="Name,Project / Site,Website,Username,Password,Created,Password Updated,Note..."
                        />
                      </TextField>
                    )}
                  />

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
                        {sheet.rows.length} rows detected. Name, Project / Site,
                        Username, and Password are required.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {mappingFields.map((field) => (
                        <Controller
                          key={field.key}
                          control={form.control}
                          name={`mapping.${field.key}`}
                          render={({ field: mappingField }) => (
                            <MappingSelect
                              label={field.label}
                              required={field.required}
                              value={mappingField.value}
                              headers={sheet.headers}
                              onChange={mappingField.onChange}
                            />
                          )}
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
                      {previewCredentials.map((credential) => (
                        <div
                          key={credential.id}
                          className="rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200"
                        >
                          <p className="font-semibold text-slate-950">
                            {credential.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {credential.externalSite ??
                              options.projects.find((project) => project.id === credential.projectId)
                                ?.name ??
                              "Unknown site"}{" "}
                            • {credential.environment} • {credential.username}
                          </p>
                        </div>
                      ))}
                      {!previewCredentials.length && (
                        <p className="rounded-xl bg-white p-3 text-sm text-slate-500 ring-1 ring-slate-200">
                          No preview yet. Map the required fields to continue.
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
                isDisabled={
                  !sheet ||
                  !mapping.name ||
                  !mapping.projectOrSite ||
                  !mapping.username ||
                  !mapping.password ||
                  importCount === 0
                }
                onPress={handleImport}
              >
                Import {importCount || ""} Credentials
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
