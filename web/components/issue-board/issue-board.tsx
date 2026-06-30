"use client";

import {
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  useOverlayState,
} from "@heroui/react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  deleteIssue,
  getIssueOptions,
  listIssues,
  updateIssueStatus,
  type IssueOptions,
} from "@/libs/api/issues";
import { notify } from "@/libs/notify";
import type { TaskPriority } from "@/components/tasks/data";

import type { Issue, IssueStatus } from "./data";
import { IssueModal } from "./issue-modal";
import { IssueStatusSelect } from "./issue-status-select";

const emptyOptions: IssueOptions = {
  statuses: ["Open", "In Progress", "Fixed"],
  targetTypes: ["task", "checklist"],
  priorities: ["Low", "Medium", "High"],
  projects: [],
};

const priorityColor: Record<TaskPriority, "danger" | "warning" | "default"> = {
  High: "danger",
  Medium: "warning",
  Low: "default",
};

/** Fixed progress across all the clients an issue is applied to. */
function ClientsProgress({ issue }: { issue: Issue }) {
  const total = issue.applied.length;
  const fixed = issue.applied.filter((target) => target.fixed).length;

  if (total === 0) return <span className="text-slate-400">—</span>;

  const color =
    fixed === total
      ? "text-green-600"
      : fixed > 0
        ? "text-amber-600"
        : "text-slate-600";

  return (
    <span className={`text-sm font-medium ${color}`}>
      {fixed}/{total} fixed
    </span>
  );
}

export function IssueBoard() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [options, setOptions] = useState<IssueOptions>(emptyOptions);
  const [loading, setLoading] = useState(true);
  const editState = useOverlayState();
  const createState = useOverlayState();
  const [active, setActive] = useState<Issue | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [issueRows, optionRows] = await Promise.all([
        listIssues(),
        getIssueOptions(),
      ]);
      setIssues(issueRows);
      setOptions(optionRows);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load issues.";
      notify.error("Unable to load issues", { description: message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const upsertIssue = (issue: Issue) => {
    setIssues((prev) =>
      prev.some((item) => item.id === issue.id)
        ? prev.map((item) => (item.id === issue.id ? issue : item))
        : [issue, ...prev]
    );
    setActive((current) => (current?.id === issue.id ? issue : current));
  };

  const openEdit = (issue: Issue) => {
    setActive(issue);
    editState.open();
  };

  const handleChangeStatus = async (id: string, status: IssueStatus) => {
    try {
      const updated = await updateIssueStatus(id, status);
      upsertIssue(updated);
      notify.success("Issue status updated");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update issue status.";
      notify.error("Unable to update status", { description: message });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteIssue(id);
      setIssues((prev) => prev.filter((issue) => issue.id !== id));
      notify.success("Issue deleted");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete issue.";
      notify.error("Unable to delete issue", { description: message });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Issue Board</h1>
          <p className="mt-1 text-sm text-gray-500">
            Capture an issue once, apply it to all or selected clients, and it
            appears as a task on each client&apos;s board.
          </p>
        </div>
        <Button variant="primary" onPress={createState.open}>
          <Plus className="h-4 w-4" />
          New Issue
        </Button>
      </div>

      <div className="app-table-shell overflow-x-auto">
        <Table aria-label="Issues">
          <TableContent className="w-full min-w-[860px] table-fixed">
            <TableHeader>
              <TableColumn id="issue" isRowHeader className="w-[36%]">
                Issue
              </TableColumn>
              <TableColumn id="clients" className="w-[14%]">
                Clients
              </TableColumn>
              <TableColumn id="checklist" className="w-[12%]">
                Checklist
              </TableColumn>
              <TableColumn id="priority" className="w-[10%]">
                Priority
              </TableColumn>
              <TableColumn id="status" className="w-[16%]">
                Status
              </TableColumn>
              <TableColumn id="action" className="w-[12%]">
                Action
              </TableColumn>
            </TableHeader>
            <TableBody
              renderEmptyState={() => (
                <div className="py-10 text-center text-sm text-gray-500">
                  {loading ? "Loading issues..." : "No issues yet — create one to get started."}
                </div>
              )}
            >
              {issues.map((issue) => (
                <TableRow key={issue.id} id={issue.id}>
                  <TableCell>
                    <p className="font-medium text-gray-900">{issue.title}</p>
                    {issue.description && (
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {issue.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <ClientsProgress issue={issue} />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-slate-600">
                      {issue.checklist && issue.checklist.length > 0
                        ? `${issue.checklist.length} item${
                            issue.checklist.length === 1 ? "" : "s"
                          }`
                        : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Chip size="sm" variant="soft" color={priorityColor[issue.priority]}>
                      {issue.priority}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <IssueStatusSelect
                      status={issue.status}
                      onChange={(status) => void handleChangeStatus(issue.id, status)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() => openEdit(issue)}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${issue.title}`}
                        onPress={() => void handleDelete(issue.id)}
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

      <IssueModal
        key={`edit:${active?.id ?? "none"}:${editState.isOpen ? "open" : "closed"}`}
        mode="edit"
        state={editState}
        issue={active}
        options={options}
        onSaved={upsertIssue}
      />
      <IssueModal
        key={`create:${createState.isOpen ? "open" : "closed"}`}
        mode="create"
        state={createState}
        issue={null}
        options={options}
        onSaved={upsertIssue}
      />
    </div>
  );
}
