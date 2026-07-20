"use client";

import {
  Button,
  Chip,
  Input,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  useOverlayState,
} from "@heroui/react";
import { ChevronDown, Copy, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";

import {
  copyWebsiteCredentialPackage,
  createWebsiteCredential,
  deleteWebsiteCredential,
  getWebsiteCredentialOptions,
  listWebsiteCredentials,
  revealWebsiteCredential,
  updateWebsiteCredential,
  type WebsiteCredentialOptions,
} from "@/libs/api/website-users";
import { notify } from "@/libs/notify";
import { SearchableFilter } from "@/components/ui/searchable-filter";

import { CredentialModal } from "./credential-modal";
import { ImportCredentialsModal } from "./import-credentials-modal";
import { namesFrom, type Credential } from "./data";

const emptyOptions: WebsiteCredentialOptions = {
  projects: [],
  websites: [],
  names: [],
  environments: ["Live", "Staging"],
};

function CopyMenu({
  label,
  onCopyAll,
  onCopyUsername,
  onCopyPassword,
}: {
  label: string;
  onCopyAll: () => void | Promise<void>;
  onCopyUsername: () => void | Promise<void>;
  onCopyPassword: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const items = [
    { key: "all", label: "Copy all", fn: onCopyAll },
    { key: "username", label: "Copy username", fn: onCopyUsername },
    { key: "password", label: "Copy password", fn: onCopyPassword },
  ];

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="ghost"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onPress={() => setOpen((prev) => !prev)}
      >
        <Copy className="h-4 w-4" />
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 z-40 mt-1 w-40 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          >
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  setOpen(false);
                  void item.fn();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function credentialProjectName(c: Credential, options: WebsiteCredentialOptions) {
  return (
    c.projectName ??
    options.projects.find((project) => project.id === c.projectId)?.name ??
    c.projectId ??
    "Unknown"
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`));
}

function daysSince(value: string) {
  const updated = new Date(`${String(value).slice(0, 10)}T00:00:00`).getTime();
  const now = new Date().getTime();
  return Math.max(0, Math.floor((now - updated) / 86_400_000));
}

function PasswordHealth({ updatedAt }: { updatedAt: string }) {
  const age = daysSince(updatedAt);
  const status =
    age > 180
      ? { label: "Stale", color: "danger" as const }
      : age > 90
        ? { label: "Review", color: "warning" as const }
        : { label: "Healthy", color: "success" as const };

  return (
    <div className="space-y-1">
      <Chip size="sm" variant="soft" color={status.color}>
        {status.label}
      </Chip>
      <p className="text-xs text-gray-500">
        {formatDate(updatedAt)} • {age}d ago
      </p>
    </div>
  );
}

export function WebsiteUsersTable() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [options, setOptions] = useState<WebsiteCredentialOptions>(emptyOptions);
  const [loading, setLoading] = useState(true);
  const modal = useOverlayState();
  const importModal = useOverlayState();
  const [editing, setEditing] = useState<Credential | null>(null);
  const [nameFilter, setNameFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [query, setQuery] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [credentialRows, optionRows] = await Promise.all([
        listWebsiteCredentials(),
        getWebsiteCredentialOptions(),
      ]);
      setCredentials(credentialRows);
      setOptions(optionRows);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load credentials.";
      notify.error("Unable to load credentials", { description: message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const names = namesFrom(credentials);

  const targetOptions = (() => {
    const seen = new Map<string, string>();
    for (const c of credentials) {
      if (c.externalSite) seen.set(`ext:${c.externalSite}`, `${c.externalSite} (External)`);
      else if (c.projectId) seen.set(c.projectId, credentialProjectName(c, options));
    }
    return [...seen.entries()].map(([key, label]) => ({ key, label }));
  })();

  const matchProject = (c: Credential) => {
    if (projectFilter === "all") return true;
    if (projectFilter.startsWith("ext:")) return c.externalSite === projectFilter.slice(4);
    return c.projectId === projectFilter;
  };

  const filtered = credentials.filter((c) => {
    const q = query.trim().toLowerCase();
    const target = c.externalSite ?? credentialProjectName(c, options);
    const matchesSearch =
      !q ||
      [
        c.name,
        target,
        c.websiteName ?? "",
        c.websiteUrl ?? "",
        c.environment,
        c.username,
        c.note ?? "",
        c.createdAt,
        c.passwordUpdatedAt,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);

    return (
      (nameFilter === "all" || c.name === nameFilter) &&
      matchProject(c) &&
      matchesSearch
    );
  });

  const openAdd = () => {
    setEditing(null);
    modal.open();
  };

  const openEdit = (cred: Credential) => {
    setEditing(cred);
    modal.open();
  };

  const handleSave = async (cred: Credential) => {
    try {
      const payload = {
        name: cred.name,
        projectId: cred.projectId,
        websiteId: cred.websiteId,
        externalSite: cred.externalSite,
        environment: cred.environment,
        username: cred.username,
        password: cred.password,
        createdAt: cred.createdAt,
        passwordUpdatedAt: cred.passwordUpdatedAt,
        note: cred.note,
      };
      const saved = editing
        ? await updateWebsiteCredential(cred.id, payload)
        : await createWebsiteCredential(payload);

      setCredentials((prev) => {
        const exists = prev.some((c) => c.id === saved.id);
        return exists ? prev.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...prev];
      });
      notify.success(editing ? "Credential updated" : "Credential added", {
        description: saved.name,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save credential.";
      notify.error("Unable to save credential", { description: message });
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWebsiteCredential(id);
      setCredentials((prev) => prev.filter((c) => c.id !== id));
      notify.success("Credential deleted");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete credential.";
      notify.error("Unable to delete credential", { description: message });
    }
  };

  const handleCopyAll = async (c: Credential) => {
    try {
      const content = await copyWebsiteCredentialPackage(c.id);
      await navigator.clipboard?.writeText(content);
      notify.success("Credential copied", {
        description: "Site URL, username, and password copied.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to copy credential.";
      notify.error("Unable to copy credential", { description: message });
    }
  };

  const handleCopyUsername = async (c: Credential) => {
    try {
      await navigator.clipboard?.writeText(c.username);
      notify.success("Username copied");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to copy username.";
      notify.error("Unable to copy username", { description: message });
    }
  };

  const handleCopyPassword = async (c: Credential) => {
    try {
      const password = await revealWebsiteCredential(c.id);
      await navigator.clipboard?.writeText(password);
      notify.success("Password copied");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to copy password.";
      notify.error("Unable to copy password", { description: message });
    }
  };

  const handleImport = (imported: Credential[]) => {
    setCredentials((prev) => [...imported, ...prev]);
    notify.success("Credentials imported", {
      description: `${imported.length} credential${imported.length === 1 ? "" : "s"} added.`,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Website Users</h1>
          <p className="mt-1 text-sm text-gray-500">
            Website credentials granted to team members per project.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="tertiary" onPress={importModal.open}>
            <Upload className="h-4 w-4" />
            Import Bulk
          </Button>
          <Button variant="primary" onPress={openAdd}>
            <Plus className="h-4 w-4" />
            Add Credential
          </Button>
        </div>
      </div>

      <div className="app-toolbar flex items-center gap-2 overflow-x-auto p-3">
        <div className="relative w-64 shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            aria-label="Search credentials"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, project, username..."
            className="w-full pl-9"
          />
        </div>

        <SearchableFilter
          ariaLabel="Filter by name"
          value={nameFilter}
          onChange={setNameFilter}
          options={[
            { key: "all", label: "All names" },
            ...names.map((name) => ({ key: name, label: name })),
          ]}
          placeholder="All names"
          triggerClassName="w-40"
        />

        <SearchableFilter
          ariaLabel="Filter by project or site"
          value={projectFilter}
          onChange={setProjectFilter}
          options={[
            { key: "all", label: "All projects & sites" },
            ...targetOptions,
          ]}
          placeholder="All projects & sites"
          triggerClassName="w-48"
        />

        <span className="text-sm text-gray-400">
          {filtered.length} credential{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="app-table-shell overflow-x-auto">
        <Table aria-label="Website credentials">
          <TableContent className="w-full min-w-[1040px] table-fixed">
            <TableHeader>
              <TableColumn id="name" isRowHeader className="w-[14%]">
                Name
              </TableColumn>
              <TableColumn id="project" className="w-[17%]">
                Project / Site
              </TableColumn>
              <TableColumn id="env" className="w-[9%]">
                Website
              </TableColumn>
              <TableColumn id="username" className="w-[15%]">
                Username
              </TableColumn>
              <TableColumn id="created" className="w-[11%]">
                Created
              </TableColumn>
              <TableColumn id="passwordUpdated" className="w-[15%]">
                Password Health
              </TableColumn>
              <TableColumn id="note" className="w-[12%]">
                Note
              </TableColumn>
              <TableColumn id="action" className="w-[7%]">
                Action
              </TableColumn>
            </TableHeader>
            <TableBody
              renderEmptyState={() => (
                <div className="py-10 text-center text-sm text-gray-500">
                  {loading ? "Loading credentials..." : "No credentials yet — add one to get started."}
                </div>
              )}
            >
              {filtered.map((c) => (
                <TableRow key={c.id} id={c.id}>
                  <TableCell>
                    <span className="font-medium text-gray-900">{c.name}</span>
                  </TableCell>
                  <TableCell>
                    {c.externalSite ? (
                      <span className="flex items-center gap-2">
                        <span className="text-gray-700">{c.externalSite}</span>
                        <Chip size="sm" variant="soft" color="accent">
                          External
                        </Chip>
                      </span>
                    ) : (
                      <span className="text-gray-700">
                        {credentialProjectName(c, options)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.externalSite ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <Chip
                        size="sm"
                        variant="soft"
                        color={c.environment === "Live" ? "success" : "warning"}
                      >
                        {c.websiteName || c.environment}
                      </Chip>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm text-gray-800">
                      {c.username}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-700">
                      {formatDate(c.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <PasswordHealth updatedAt={c.passwordUpdatedAt} />
                  </TableCell>
                  <TableCell>
                    {c.note ? (
                      <span className="text-sm text-gray-600">{c.note}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <CopyMenu
                        label={`Copy credential for ${c.name}`}
                        onCopyAll={() => handleCopyAll(c)}
                        onCopyUsername={() => handleCopyUsername(c)}
                        onCopyPassword={() => handleCopyPassword(c)}
                      />
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        aria-label={`Edit credential for ${c.name}`}
                        onPress={() => openEdit(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete credential for ${c.name}`}
                        onPress={() => void handleDelete(c.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableContent>
        </Table>
      </div>

      <CredentialModal
        key={`${editing?.id ?? "new"}:${modal.isOpen ? "open" : "closed"}`}
        state={modal}
        credential={editing}
        names={names}
        options={options}
        onSave={handleSave}
      />
      <ImportCredentialsModal
        state={importModal}
        options={options}
        onImport={handleImport}
      />
    </div>
  );
}
