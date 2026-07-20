"use client";

import {
  Avatar,
  AvatarFallback,
  Button,
  Chip,
  ListBox,
  ListBoxItem,
  Select,
  SelectPopover,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  useOverlayState,
} from "@heroui/react";
import {
  ChevronDown,
  Download,
  ExternalLink,
  Upload,
  Eye,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ComponentProps } from "react";
import {
  isTextDropItem,
  useDragAndDrop,
} from "react-aria-components";

import {
  createProject,
  deleteProject,
  getProjectOptions,
  importProjects,
  listProjects,
  updateProject,
  updateProjectPriority,
  updateProjectStatus,
  type ProjectPayload,
} from "@/libs/api/projects";
import { notify } from "@/libs/notify";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SearchableFilter } from "@/components/ui/searchable-filter";

import { CreateProjectModal } from "./create-project-modal";
import { ExportProjectsModal } from "./export-projects-modal";
import { ImportProjectsModal } from "./import-projects-modal";
import {
  PRIORITY_OPTIONS,
  priorityColor,
  statusColor,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  type Project,
  type ProjectPriority,
} from "./data";
import { ProjectDetailDrawer } from "./project-detail-drawer";

const ALL = "all";
const DRAG_TYPE = "application/x-ahm-project";

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type Option = { key: string; label: string };

function FilterSelect({
  ariaLabel,
  placeholder,
  value,
  onChange,
  options,
}: {
  ariaLabel: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
}) {
  return (
    <SearchableFilter
      ariaLabel={ariaLabel}
      value={value}
      onChange={onChange}
      options={[{ key: ALL, label: placeholder }, ...options]}
      placeholder={placeholder}
      triggerClassName="w-40"
    />
  );
}

function LinkCell({ href, label }: { href?: string; label: string }) {
  if (!href) return <span className="text-gray-400">—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

const GROUP_OPTIONS = ["High", "Medium", "Low", "Churned"] as const;
type ProjectGroup = (typeof GROUP_OPTIONS)[number];

/** Pill-style colours for each priority/churned group. */
const groupChip: Record<ProjectGroup, string> = {
  High: "bg-red-100 text-red-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-emerald-100 text-emerald-700",
  Churned: "bg-gray-200 text-gray-600",
};

/** A project's current group is its priority, or "Churned" once it's churned. */
function projectGroupOf(project: Project): ProjectGroup {
  return project.status === "Churned" ? "Churned" : project.priority;
}

/** Clickable group pill with a dropdown to move a project between High/Medium/Low/Churned. */
function ProjectGroupSelect({
  project,
  onChange,
}: {
  project: Project;
  onChange: (project: Project, group: ProjectGroup) => void;
}) {
  const current = projectGroupOf(project);
  return (
    <Select
      aria-label={`Change group for ${project.clientName}`}
      selectedKey={current}
      onSelectionChange={(key) => onChange(project, key as ProjectGroup)}
    >
      <SelectTrigger
        className={`inline-flex min-h-auto items-center gap-1 rounded-full border-0 px-2.5 py-1 text-xs font-semibold shadow-none ${groupChip[current]}`}
      >
        <SelectValue>{current}</SelectValue>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </SelectTrigger>
      <SelectPopover>
        <ListBox>
          {GROUP_OPTIONS.map((group) => (
            <ListBoxItem key={group} id={group}>
              {group}
            </ListBoxItem>
          ))}
        </ListBox>
      </SelectPopover>
    </Select>
  );
}

function PriorityProjectTable({
  label,
  projects,
  onDrop,
  onEdit,
  onDelete,
  onChangeGroup,
}: {
  label: string;
  projects: Project[];
  /** When omitted, the table is display-only (no drag-to-reprioritise). */
  onDrop?: (ids: string[]) => void;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
  onChangeGroup: (project: Project, group: ProjectGroup) => void;
}) {
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) =>
      [...keys].map((key) => {
        const project = projects.find((item) => item.id === key);
        return {
          [DRAG_TYPE]: JSON.stringify({ id: String(key) }),
          "text/plain": project?.clientName ?? "",
        };
      }),
    acceptedDragTypes: [DRAG_TYPE],
    getDropOperation: () => "move",
    onInsert: async (event) => {
      const ids = await Promise.all(
        event.items
          .filter(isTextDropItem)
          .map(
            async (item) =>
              (JSON.parse(await item.getText(DRAG_TYPE)) as { id: string }).id
          )
      );
      onDrop?.(ids);
    },
    onRootDrop: async (event) => {
      const ids = await Promise.all(
        event.items
          .filter(isTextDropItem)
          .map(
            async (item) =>
              (JSON.parse(await item.getText(DRAG_TYPE)) as { id: string }).id
          )
      );
      onDrop?.(ids);
    },
    onReorder: (event) => {
      onDrop?.([...event.keys].map(String));
    },
  });

  return (
    <Table aria-label={`${label} projects`}>
      <TableScrollContainer>
        <TableContent
          className="w-full min-w-[1120px] table-fixed"
          dragAndDropHooks={
            onDrop
              ? (dragAndDropHooks as unknown as ComponentProps<
                  typeof TableContent
                >["dragAndDropHooks"])
              : undefined
          }
        >
          <TableHeader>
            <TableColumn id="client" isRowHeader className="w-[16%]">
              Client Name
            </TableColumn>
            <TableColumn id="type" className="w-[10%]">
              Type
            </TableColumn>
            <TableColumn id="priority" className="w-[10%]">
              Priority
            </TableColumn>
            <TableColumn id="assignee" className="w-[14%]">
              Assignee
            </TableColumn>
            <TableColumn id="status" className="w-[12%]">
              Status
            </TableColumn>
            <TableColumn id="websites" className="w-[14%]">
              Websites / Domains
            </TableColumn>
            <TableColumn id="figma" className="w-[10%]">
              Figma Link
            </TableColumn>
            <TableColumn id="domain" className="w-[12%]">
              Domain
            </TableColumn>
            <TableColumn id="server" className="w-[10%]">
              Server
            </TableColumn>
            <TableColumn id="action" className="w-[8%]">
              Action
            </TableColumn>
          </TableHeader>
          <TableBody
            items={projects}
            renderEmptyState={() => (
              <div className="py-8 text-center text-sm text-gray-400">
                Drop projects here
              </div>
            )}
          >
            {(project) => (
              <TableRow
                id={project.id}
                key={project.id}
                textValue={project.clientName}
                className="cursor-grab data-[dragging=true]:opacity-50"
              >
                <TableCell>
                  <span className="font-medium text-gray-900">
                    {project.clientName}
                  </span>
                </TableCell>
                <TableCell>
                  <Chip
                    size="sm"
                    color={project.type === "One Pager" ? "warning" : "accent"}
                    variant="soft"
                  >
                    {project.type}
                  </Chip>
                </TableCell>
                <TableCell>
                  <ProjectGroupSelect project={project} onChange={onChangeGroup} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8 text-xs">
                      <AvatarFallback>
                        {initials(project.assignee.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="whitespace-nowrap">
                      {project.assignee.name}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Chip
                    size="sm"
                    color={statusColor[project.status]}
                    variant="soft"
                  >
                    {project.status}
                  </Chip>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {(project.websites?.length
                      ? project.websites
                      : project.liveLink
                        ? [
                            {
                              id: "main",
                              name: "Main Website",
                              url: project.liveLink,
                            },
                          ]
                        : []
                    ).map((website) => (
                      <a
                        key={website.id}
                        href={website.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-full bg-[#e8f5ff] px-2.5 py-1 text-xs font-medium text-[#082a78] hover:bg-[#d7f7fb]"
                      >
                        {website.name}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                    {!project.websites?.length && !project.liveLink && (
                      <span className="text-gray-400">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <LinkCell href={project.figmaLink} label="View" />
                </TableCell>
                <TableCell>
                  <span className="whitespace-nowrap text-gray-700">
                    {project.domainManagement}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-gray-700">
                    {project.serverLocation}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      aria-label={`View ${project.clientName}`}
                      onPress={() => onEdit(project)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${project.clientName}`}
                      onPress={() => onDelete(project)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );
}

export function ProjectsTable() {
  const [list, setList] = useState<Project[]>([]);
  const [registeredAssignees, setRegisteredAssignees] = useState<string[]>([]);
  const [assignee, setAssignee] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [tab, setTab] = useState<"all" | ProjectPriority | "Churned">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onFilterChange =
    (setter: (value: string) => void) => (value: string) => setter(value);

  const createState = useOverlayState();
  const importState = useOverlayState();
  const exportState = useOverlayState();
  const editState = useOverlayState();
  const confirmDeleteState = useOverlayState();
  const [selected, setSelected] = useState<Project | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);

  const requestDelete = (project: Project) => {
    setPendingDelete(project);
    confirmDeleteState.open();
  };

  useEffect(() => {
    let active = true;

    async function loadProjects() {
      try {
        const [projects, projectOptions] = await Promise.all([
          listProjects(),
          getProjectOptions(),
        ]);
        if (!active) return;
        setList(projects);
        setRegisteredAssignees(projectOptions.assignees);
      } catch (err) {
        if (!active) return;
        const message = (err as Error).message ?? "Could not load projects.";
        setError(message);
        notify.error("Could not load projects", { description: message });
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadProjects();
    return () => {
      active = false;
    };
  }, []);

  const assigneeOptions: Option[] = useMemo(() => {
    const names = Array.from(new Set(list.map((p) => p.assignee.name)));
    return names.map((n) => ({ key: n, label: n }));
  }, [list]);

  const filtered = useMemo(
    () =>
      list.filter(
        (p) =>
          (assignee === ALL || p.assignee.name === assignee) &&
          (type === ALL || p.type === type) &&
          (status === ALL || p.status === status)
      ),
    [list, assignee, type, status]
  );

  // Churned projects are excluded from the priority groups and shown separately.
  const priorityGroups = useMemo(
    () =>
      PRIORITY_OPTIONS.map((priority) => ({
        priority,
        rows: filtered.filter(
          (project) => project.priority === priority && project.status !== "Churned"
        ),
      })),
    [filtered]
  );
  const churnedRows = useMemo(
    () => filtered.filter((project) => project.status === "Churned"),
    [filtered]
  );

  type RenderGroup =
    | { kind: "priority"; priority: ProjectPriority; rows: Project[] }
    | { kind: "churned"; rows: Project[] };

  // Which group(s) to render for the active tab. "All" stacks every group (and
  // supports drag between them); a specific tab shows just that one.
  const visibleGroups = useMemo<RenderGroup[]>(() => {
    if (tab === "all") {
      const groups: RenderGroup[] = priorityGroups.map((group) => ({
        kind: "priority",
        priority: group.priority,
        rows: group.rows,
      }));
      // Always show the Churned section here so it stays a drop target for
      // drag-to-churn, even before any project has been churned.
      groups.push({ kind: "churned", rows: churnedRows });
      return groups;
    }
    if (tab === "Churned") return [{ kind: "churned", rows: churnedRows }];
    const group = priorityGroups.find((item) => item.priority === tab);
    return [{ kind: "priority", priority: tab, rows: group?.rows ?? [] }];
  }, [tab, priorityGroups, churnedRows]);

  const TABS: { id: "all" | ProjectPriority | "Churned"; label: string; count: number }[] = [
    { id: "all", label: "All", count: filtered.length },
    { id: "High", label: "High", count: priorityGroups[0].rows.length },
    { id: "Medium", label: "Medium", count: priorityGroups[1].rows.length },
    { id: "Low", label: "Low", count: priorityGroups[2].rows.length },
    { id: "Churned", label: "Churned", count: churnedRows.length },
  ];

  const handleEdit = (p: Project) => {
    setSelected(p);
    editState.open();
  };

  const handleSave = async (projectId: string, payload: ProjectPayload) => {
    const saved = await updateProject(projectId, payload);
    setList((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
    setSelected(saved);
    notify.success("Project updated", { description: saved.clientName });
    return saved;
  };

  const handlePriorityChange = async (ids: string[], priority: ProjectPriority) => {
    setError(null);
    const previous = list;
    // Dragging a churned project into a priority group also restores it (active again).
    const restoreIds = new Set(
      previous
        .filter((project) => ids.includes(project.id) && project.status === "Churned")
        .map((project) => project.id)
    );
    setList((prev) =>
      prev.map((project) =>
        ids.includes(project.id)
          ? {
              ...project,
              priority,
              status: restoreIds.has(project.id) ? "In Progress" : project.status,
            }
          : project
      )
    );
    try {
      const updated = await Promise.all(
        ids.map(async (id) => {
          let project = await updateProjectPriority(id, priority);
          if (restoreIds.has(id)) project = await updateProjectStatus(id, "In Progress");
          return project;
        })
      );
      setList((prev) =>
        prev.map((project) => updated.find((item) => item.id === project.id) ?? project)
      );
      setSelected((current) =>
        current ? updated.find((item) => item.id === current.id) ?? current : current
      );
    } catch (err) {
      setList(previous);
      const message = (err as Error).message ?? "Could not update priority.";
      setError(message);
      notify.error("Could not update priority", { description: message });
    }
  };

  const handleSetChurned = async (ids: string[], churned: boolean) => {
    setError(null);
    const previous = list;
    const nextStatus: Project["status"] = churned ? "Churned" : "In Progress";
    setList((prev) =>
      prev.map((project) =>
        ids.includes(project.id) ? { ...project, status: nextStatus } : project
      )
    );
    try {
      const updated = await Promise.all(
        ids.map((id) => updateProjectStatus(id, nextStatus))
      );
      setList((prev) =>
        prev.map((project) => updated.find((item) => item.id === project.id) ?? project)
      );
      setSelected((current) =>
        current ? updated.find((item) => item.id === current.id) ?? current : current
      );
    } catch (err) {
      setList(previous);
      const message = (err as Error).message ?? "Could not update status.";
      setError(message);
      notify.error("Could not update status", { description: message });
    }
  };

  // Move a project between groups via the pill dropdown: a priority group sets
  // priority (and un-churns if needed); "Churned" sets the project churned.
  const handleChangeGroup = (project: Project, group: ProjectGroup) => {
    if (group === projectGroupOf(project)) return;
    if (group === "Churned") void handleSetChurned([project.id], true);
    else void handlePriorityChange([project.id], group);
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await deleteProject(id);
      setList((prev) => prev.filter((p) => p.id !== id));
      notify.success("Project deleted");
    } catch (err) {
      const message = (err as Error).message ?? "Could not delete project.";
      setError(message);
      notify.error("Could not delete project", { description: message });
      throw err;
    }
  };

  const handleCreate = async (payload: ProjectPayload) => {
    const created = await createProject(payload);
    setList((prev) => [created, ...prev]);
    notify.success("Project created", { description: created.clientName });
  };

  const handleImport = async (payload: {
    headers: string[];
    rows: Record<string, string>[];
    mapping: Record<string, string>;
  }) => {
    const result = await importProjects(payload);
    const skippedCount = result.skipped?.length ?? 0;
    const skippedNote = skippedCount ? ` ${skippedCount} skipped (already exist).` : "";
    if (result.errors.length) {
      const message = `${result.imported.length} added. ${result.errors.length} failed.${skippedNote}`;
      setError(message);
      notify.warning("Import completed with issues", { description: message });
    } else {
      notify.success("Projects imported", {
        description: `${result.imported.length} added.${skippedNote}`,
      });
    }
    setList((prev) => [...result.imported, ...prev]);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar: filters on the left, action on the right */}
      <div className="app-toolbar flex items-center justify-between gap-3 overflow-x-auto p-3">
        <div className="flex shrink-0 items-center gap-2">
          <FilterSelect
            ariaLabel="Filter by assignee"
            placeholder="All Assignees"
            value={assignee}
            onChange={onFilterChange(setAssignee)}
            options={assigneeOptions}
          />
          <FilterSelect
            ariaLabel="Filter by type"
            placeholder="All Types"
            value={type}
            onChange={onFilterChange(setType)}
            options={TYPE_OPTIONS.map((t) => ({ key: t, label: t }))}
          />
          <FilterSelect
            ariaLabel="Filter by status"
            placeholder="All Statuses"
            value={status}
            onChange={onFilterChange(setStatus)}
            options={STATUS_OPTIONS.map((s) => ({ key: s, label: s }))}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="tertiary" onPress={exportState.open}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="tertiary" onPress={importState.open}>
            <Upload className="h-4 w-4" />
            Import Bulk
          </Button>
          <Button variant="primary" onPress={createState.open}>
            <Plus className="h-4 w-4" />
            Add New Project
          </Button>
        </div>
      </div>

      {error && <span className="sr-only">{error}</span>}

      {isLoading && (
        <p className="rounded-lg border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">
          Loading projects...
        </p>
      )}

      {!isLoading && filtered.length === 0 && (
        <p className="rounded-lg border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">
          No projects match the selected filters.
        </p>
      )}

      {/* Priority tabs */}
      <div className="app-tabbar flex w-fit flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`app-tab px-4 py-2 text-sm font-semibold ${
              tab === t.id ? "app-tab-active" : "hover:bg-[#f4f7f6] hover:text-slate-950"
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-gray-400">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {visibleGroups.map((group) => {
          if (group.kind === "churned") {
            return (
              <section key="Churned" className="space-y-3">
                <div className="flex items-center gap-2">
                  <Chip size="sm" color="danger" variant="soft">Churned</Chip>
                  <h2 className="text-base font-semibold text-gray-900">Churned</h2>
                  <span className="text-sm text-gray-500">
                    {group.rows.length} project{group.rows.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="app-table-shell overflow-x-auto">
                  <PriorityProjectTable
                    label="Churned"
                    projects={group.rows}
                    onDrop={(ids) => handleSetChurned(ids, true)}
                    onEdit={handleEdit}
                    onDelete={requestDelete}
                    onChangeGroup={handleChangeGroup}
                  />
                </div>
              </section>
            );
          }
          return (
            <section key={group.priority} className="space-y-3">
              <div className="flex items-center gap-2">
                <Chip size="sm" color={priorityColor[group.priority]} variant="soft">
                  {group.priority}
                </Chip>
                <h2 className="text-base font-semibold text-gray-900">
                  {group.priority} Priority
                </h2>
                <span className="text-sm text-gray-500">
                  {group.rows.length} project{group.rows.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="app-table-shell overflow-x-auto">
                <PriorityProjectTable
                  label={group.priority}
                  projects={group.rows}
                  onDrop={(ids) => handlePriorityChange(ids, group.priority)}
                  onEdit={handleEdit}
                  onDelete={requestDelete}
                  onChangeGroup={handleChangeGroup}
                />
              </div>
            </section>
          );
        })}
      </div>

      <CreateProjectModal
        state={createState}
        assignees={registeredAssignees}
        onCreate={handleCreate}
      />
      <ImportProjectsModal state={importState} onImport={handleImport} />
      <ExportProjectsModal state={exportState} projects={list} />
      <ConfirmDialog
        state={confirmDeleteState}
        destructive
        title="Delete this project?"
        confirmLabel="Delete project"
        description={
          pendingDelete ? (
            <>
              You&apos;re about to permanently delete{" "}
              <strong className="text-slate-900">{pendingDelete.clientName}</strong> and its
              associated websites and data. This action cannot be undone.
            </>
          ) : (
            ""
          )
        }
        onConfirm={async () => {
          if (pendingDelete) await handleDelete(pendingDelete.id);
        }}
      />
      <ProjectDetailDrawer
        project={selected}
        state={editState}
        assignees={registeredAssignees}
        onSave={handleSave}
      />
    </div>
  );
}
