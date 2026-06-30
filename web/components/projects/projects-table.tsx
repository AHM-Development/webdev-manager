"use client";

import {
  Avatar,
  AvatarFallback,
  Button,
  Chip,
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
  ExternalLink,
  Upload,
  Pencil,
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
  type ProjectPayload,
} from "@/libs/api/projects";
import { notify } from "@/libs/notify";
import { SearchableFilter } from "@/components/ui/searchable-filter";

import { CreateProjectModal } from "./create-project-modal";
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

function PriorityProjectTable({
  priority,
  projects,
  onDrop,
  onEdit,
  onDelete,
}: {
  priority: ProjectPriority;
  projects: Project[];
  onDrop: (ids: string[]) => void;
  onEdit: (project: Project) => void;
  onDelete: (id: string) => void;
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
      onDrop(ids);
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
      onDrop(ids);
    },
    onReorder: (event) => {
      onDrop([...event.keys].map(String));
    },
  });

  return (
    <Table aria-label={`${priority} priority projects`}>
      <TableScrollContainer>
        <TableContent
          className="w-full min-w-[1120px] table-fixed"
          dragAndDropHooks={
            dragAndDropHooks as unknown as ComponentProps<
              typeof TableContent
            >["dragAndDropHooks"]
          }
        >
          <TableHeader>
            <TableColumn id="client" isRowHeader className="w-[16%]">
              Client Name
            </TableColumn>
            <TableColumn id="type" className="w-[10%]">
              Type
            </TableColumn>
            <TableColumn id="assignee" className="w-[14%]">
              Assignee
            </TableColumn>
            <TableColumn id="status" className="w-[12%]">
              Status
            </TableColumn>
            <TableColumn id="websites" className="w-[18%]">
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
                      aria-label={`Edit ${project.clientName}`}
                      onPress={() => onEdit(project)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${project.clientName}`}
                      onPress={() => onDelete(project.id)}
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onFilterChange =
    (setter: (value: string) => void) => (value: string) => setter(value);

  const createState = useOverlayState();
  const importState = useOverlayState();
  const editState = useOverlayState();
  const [selected, setSelected] = useState<Project | null>(null);

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

  const grouped = useMemo(
    () =>
      PRIORITY_OPTIONS.map((priority) => ({
        priority,
        rows: filtered.filter((project) => project.priority === priority),
      })),
    [filtered]
  );

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
    setList((prev) =>
      prev.map((project) => (ids.includes(project.id) ? { ...project, priority } : project))
    );
    try {
      const updated = await Promise.all(
        ids.map((id) => updateProjectPriority(id, priority))
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
    if (result.errors.length) {
      const message = `${result.imported.length} projects imported. ${result.errors.length} rows failed.`;
      setError(message);
      notify.warning("Import completed with issues", { description: message });
    } else {
      notify.success("Projects imported", {
        description: `${result.imported.length} projects added.`,
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

      <div className="space-y-5">
        {grouped.map((group) => {
          return (
            <section key={group.priority} className="space-y-3">
              <div className="flex items-center gap-2">
                <Chip
                  size="sm"
                  color={priorityColor[group.priority]}
                  variant="soft"
                >
                  {group.priority}
                </Chip>
                <h2 className="text-base font-semibold text-gray-900">
                  {group.priority} Priority
                </h2>
                <span className="text-sm text-gray-500">
                  {group.rows.length} project
                  {group.rows.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="app-table-shell overflow-x-auto">
                <PriorityProjectTable
                  priority={group.priority}
                  projects={group.rows}
                  onDrop={(ids) => handlePriorityChange(ids, group.priority)}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
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
      <ProjectDetailDrawer
        project={selected}
        state={editState}
        assignees={registeredAssignees}
        onSave={handleSave}
      />
    </div>
  );
}
