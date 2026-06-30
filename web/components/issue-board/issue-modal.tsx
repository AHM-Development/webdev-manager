"use client";

import {
  Button,
  Chip,
  Input,
  Label,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  TextArea,
  TextField,
  type useOverlayState,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Plus, Search, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { organizeTaskWithAi } from "@/libs/api/ai";
import {
  addIssueApplications,
  createIssue,
  deleteIssueApplication,
  updateIssue,
  updateIssueApplication,
  type IssueOptions,
} from "@/libs/api/issues";
import { notify } from "@/libs/notify";
import type { TaskChecklistItem, TaskPriority } from "@/components/tasks/data";
import { ChecklistTextArea } from "@/components/tasks/checklist-textarea";
import { makeChecklistItem } from "@/components/tasks/task-utils";

import type { AppliedTarget, Issue } from "./data";
import { issueFormSchema, type IssueFormValues } from "./schema";

const PRIORITIES: TaskPriority[] = ["Low", "Medium", "High"];

/** Themed segmented control — active uses the brand color, not gray-900. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 p-0.5 text-sm">
      {options.map((option) => {
        const isActive = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`rounded px-3 py-1 font-medium transition-colors ${
              isActive
                ? "bg-[var(--brand)] text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Scope picker (All clients / Selected clients) + searchable client list. */
function ClientScopePicker({
  scope,
  onScopeChange,
  projects,
  selected,
  onToggle,
}: {
  scope: "all" | "selected";
  onScopeChange: (scope: "all" | "selected") => void;
  projects: IssueOptions["projects"];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? projects.filter((project) => project.name.toLowerCase().includes(q))
    : projects;

  return (
    <div className="space-y-2">
      <Segmented
        value={scope}
        onChange={onScopeChange}
        options={[
          { id: "all", label: "All clients" },
          { id: "selected", label: "Selected clients" },
        ]}
      />

      {scope === "selected" && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search clients..."
              className="w-full rounded-md border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--brand)]"
            />
          </div>
          <ul className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-1">
            {filtered.length === 0 && (
              <li className="py-3 text-center text-sm text-slate-400">
                No clients found.
              </li>
            )}
            {filtered.map((project) => {
              const isOn = selected.has(project.id);
              return (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(project.id)}
                    className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm ${
                      isOn
                        ? "bg-[var(--brand-soft)] text-[var(--brand-strong)]"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <span>{project.name}</span>
                    {isOn && <Check className="h-4 w-4 text-[var(--brand)]" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {selected.size > 0 && (
            <p className="text-xs text-slate-500">{selected.size} selected</p>
          )}
        </div>
      )}
    </div>
  );
}

function projectName(target: AppliedTarget, options: IssueOptions) {
  return (
    target.projectName ??
    options.projects.find((project) => project.id === target.projectId)?.name ??
    target.projectId
  );
}

export function IssueModal({
  mode,
  state,
  issue,
  options,
  onSaved,
}: {
  mode: "create" | "edit";
  state: ReturnType<typeof useOverlayState>;
  issue: Issue | null;
  options: IssueOptions;
  onSaved: (issue: Issue) => void;
}) {
  const isEdit = mode === "edit";
  const [checklist, setChecklist] = useState<TaskChecklistItem[]>(
    issue?.checklist ?? []
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sourceText, setSourceText] = useState("");
  const [isOrganizing, setIsOrganizing] = useState(false);
  // Create runs as a two-step wizard (organize → details); edit opens straight
  // to the details step.
  const [organized, setOrganized] = useState(isEdit);

  const form = useForm<IssueFormValues>({
    resolver: zodResolver(issueFormSchema),
    defaultValues: {
      title: issue?.title ?? "",
      description: issue?.description ?? "",
      priority: issue?.priority ?? "Medium",
      status: issue?.status ?? "Open",
      scope: "all",
    },
  });

  const scope = form.watch("scope");
  const done = checklist.filter((item) => item.completed).length;

  const close = () => {
    state.close();
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addChecklistItem = () =>
    setChecklist((prev) => [...prev, makeChecklistItem("", prev.length)]);

  const updateChecklistItem = (id: string, value: string) =>
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, title: value } : item))
    );

  const toggleChecklistItem = (id: string, completed: boolean) =>
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed } : item))
    );

  const removeChecklistItem = (id: string) =>
    setChecklist((prev) => prev.filter((item) => item.id !== id));

  // Turn pasted notes into a structured issue (title, description, checklist,
  // priority) via Claude — the same organizer used by Add Task, client-agnostic.
  const organize = async () => {
    const text = sourceText.trim();
    if (!text) {
      notify.error("Paste some details first", {
        description: "Add the notes or message you want organized.",
      });
      return;
    }
    setIsOrganizing(true);
    try {
      const draft = await organizeTaskWithAi({ sourceText: text });
      form.setValue("title", draft.title, { shouldValidate: true });
      form.setValue("description", draft.description);
      if (draft.priority) form.setValue("priority", draft.priority);
      setChecklist(
        draft.checklist.map((item, index) => ({
          ...makeChecklistItem(item.title, index),
          completed: item.completed,
        }))
      );
      setOrganized(true);
      notify.success("Organized with AI");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not organize the issue.";
      notify.error("Could not organize", { description: message });
    } finally {
      setIsOrganizing(false);
    }
  };

  // Edit-only: apply the issue to more clients.
  const applyToMore = async () => {
    if (!issue) return;
    try {
      const updated =
        scope === "all"
          ? await addIssueApplications(issue.id, { scope: "all" })
          : await addIssueApplications(issue.id, { projectIds: [...selected] });
      onSaved(updated);
      setSelected(new Set());
      notify.success("Issue applied", {
        description: "Tasks created on the selected boards.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to apply issue.";
      notify.error("Unable to apply issue", { description: message });
    }
  };

  const toggleFixed = async (target: AppliedTarget) => {
    if (!issue || !target.id) return;
    try {
      const updated = await updateIssueApplication(issue.id, target.id, {
        fixed: !target.fixed,
      });
      onSaved(updated);
      notify.success(target.fixed ? "Marked unresolved" : "Marked fixed");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update task.";
      notify.error("Unable to update task", { description: message });
    }
  };

  const removeApplied = async (target: AppliedTarget) => {
    if (!issue || !target.id) return;
    try {
      const updated = await deleteIssueApplication(issue.id, target.id);
      onSaved(updated);
      notify.success("Removed from board");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to remove task.";
      notify.error("Unable to remove task", { description: message });
    }
  };

  const submit = form.handleSubmit(async (values) => {
    // Step 1 of create: organize first instead of submitting.
    if (mode === "create" && !organized) {
      await organize();
      return;
    }

    const cleanChecklist = checklist
      .map((item) => ({ ...item, title: item.title.trim() }))
      .filter((item) => item.title);

    if (mode === "create") {
      if (values.scope === "selected" && selected.size === 0) {
        notify.error("Select at least one client", {
          description: "Choose the clients this issue applies to.",
        });
        return;
      }
      try {
        const created = await createIssue({
          title: values.title.trim(),
          description: values.description.trim() || undefined,
          checklist: cleanChecklist,
          priority: values.priority,
          scope: values.scope,
          projectIds: values.scope === "selected" ? [...selected] : undefined,
        });
        onSaved(created);
        notify.success("Issue created", { description: created.title });
        close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to create issue.";
        notify.error("Unable to create issue", { description: message });
      }
      return;
    }

    if (!issue) return;
    try {
      const updated = await updateIssue(issue.id, {
        title: values.title.trim(),
        description: values.description.trim(),
        checklist: cleanChecklist,
        priority: values.priority,
        status: values.status,
      });
      onSaved(updated);
      notify.success("Issue updated");
      close();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save issue.";
      notify.error("Unable to save issue", { description: message });
    }
  });

  return (
    <Modal isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <ModalBackdrop>
        <ModalContainer placement="center" size="lg">
          <ModalDialog>
            <form onSubmit={submit}>
              <ModalHeader>
                <ModalHeading className="text-base font-semibold">
                  {isEdit ? "Edit Issue" : "New Issue"}
                </ModalHeading>
              </ModalHeader>

              <ModalBody className="max-h-[72vh] space-y-4 overflow-y-auto">
                {!organized ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Organize with AI</p>
                    <p className="text-xs text-slate-500">
                      Paste the notes, message, or requirements. AI drafts the
                      title, description, and checklist — you&apos;ll choose which
                      clients it applies to on the next step.
                    </p>
                    <textarea
                      value={sourceText}
                      onChange={(event) => setSourceText(event.target.value)}
                      rows={10}
                      autoFocus
                      placeholder="Paste the issue details here..."
                      className="w-full resize-y rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-[var(--brand)]"
                    />
                  </div>
                ) : (
                  <>
                <Controller
                  control={form.control}
                  name="title"
                  render={({ field, fieldState }) => (
                    <TextField
                      aria-label="Issue title"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      isInvalid={!!fieldState.error}
                    >
                      <Label>Title</Label>
                      <Input
                        placeholder="e.g. Add cookie consent banner"
                        className="w-full"
                      />
                      {fieldState.error && (
                        <p className="mt-1 text-sm text-red-600">
                          {fieldState.error.message}
                        </p>
                      )}
                    </TextField>
                  )}
                />

                <Controller
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <TextField
                      aria-label="Issue description"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                    >
                      <Label>Description</Label>
                      <TextArea
                        placeholder="Short context..."
                        rows={3}
                        className="w-full resize-y"
                      />
                    </TextField>
                  )}
                />

                {/* Checklist editor */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Checklist</Label>
                    {checklist.length > 0 && (
                      <span className="text-xs font-medium text-slate-500">
                        {done}/{checklist.length} done
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {checklist.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
                      >
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={(event) =>
                            toggleChecklistItem(item.id, event.target.checked)
                          }
                          aria-label={item.title || "Checklist item"}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
                        />
                        <ChecklistTextArea
                          value={item.title}
                          completed={item.completed}
                          ariaLabel={item.title || "Checklist item"}
                          onChange={(value) => updateChecklistItem(item.id, value)}
                        />
                        <button
                          type="button"
                          aria-label="Remove checklist item"
                          className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          onClick={() => removeChecklistItem(item.id)}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="tertiary"
                    onPress={addChecklistItem}
                  >
                    <Plus className="h-4 w-4" />
                    Add item
                  </Button>
                </div>

                {/* Priority + Status */}
                <div className="flex flex-wrap gap-6">
                  <Controller
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <div className="space-y-1.5">
                        <p className="text-sm font-medium">Priority</p>
                        <Segmented<TaskPriority>
                          value={field.value}
                          onChange={field.onChange}
                          options={PRIORITIES.map((item) => ({
                            id: item,
                            label: item,
                          }))}
                        />
                      </div>
                    )}
                  />

                  {isEdit && (
                    <Controller
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <div className="space-y-1.5">
                          <p className="text-sm font-medium">Status</p>
                          <Segmented
                            value={field.value}
                            onChange={field.onChange}
                            options={options.statuses.map((item) => ({
                              id: item,
                              label: item,
                            }))}
                          />
                        </div>
                      )}
                    />
                  )}
                </div>

                {/* Create: choose where to apply. Edit: list + apply more. */}
                {!isEdit ? (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">Apply to</p>
                    <Controller
                      control={form.control}
                      name="scope"
                      render={({ field }) => (
                        <ClientScopePicker
                          scope={field.value}
                          onScopeChange={field.onChange}
                          projects={options.projects}
                          selected={selected}
                          onToggle={toggleSelect}
                        />
                      )}
                    />
                    <p className="text-xs text-slate-500">
                      A task is created on each chosen client&apos;s board.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium">
                        Applied to ({issue?.applied.length ?? 0})
                      </p>
                      {!issue || issue.applied.length === 0 ? (
                        <p className="text-sm text-slate-400">Not applied yet.</p>
                      ) : (
                        <ul className="space-y-1 rounded-md border border-slate-200 p-1">
                          {issue.applied.map((target) => (
                            <li
                              key={target.id ?? target.projectId}
                              className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
                            >
                              <span className="flex items-center gap-2">
                                <span className="text-slate-800">
                                  {projectName(target, options)}
                                </span>
                                {target.taskStatus && (
                                  <Chip size="sm" variant="soft" color="accent">
                                    {target.taskStatus}
                                  </Chip>
                                )}
                              </span>
                              <span className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => void toggleFixed(target)}
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                                    target.fixed
                                      ? "bg-[var(--brand)] text-white"
                                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                  }`}
                                >
                                  <Check className="h-3 w-3" />
                                  {target.fixed ? "Fixed" : "Mark fixed"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void removeApplied(target)}
                                  aria-label="Remove"
                                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="space-y-2 rounded-md border border-dashed border-slate-200 p-3">
                      <p className="text-sm font-medium">Apply to more clients</p>
                      <Controller
                        control={form.control}
                        name="scope"
                        render={({ field }) => (
                          <ClientScopePicker
                            scope={field.value}
                            onScopeChange={field.onChange}
                            projects={options.projects}
                            selected={selected}
                            onToggle={toggleSelect}
                          />
                        )}
                      />
                      <Button
                        size="sm"
                        variant="tertiary"
                        type="button"
                        isDisabled={scope === "selected" && selected.size === 0}
                        onPress={applyToMore}
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </Button>
                    </div>
                  </>
                )}
                  </>
                )}
              </ModalBody>

              <ModalFooter
                className={`flex gap-2 ${
                  organized && !isEdit ? "justify-between" : "justify-end"
                }`}
              >
                {!organized ? (
                  <>
                    <Button type="button" variant="tertiary" onPress={close}>
                      Cancel
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="tertiary"
                        onPress={() => setOrganized(true)}
                      >
                        Enter manually
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        isDisabled={isOrganizing}
                        onPress={organize}
                      >
                        <Sparkles className="h-4 w-4" />
                        {isOrganizing ? "Organizing..." : "Organize with AI"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    {!isEdit && (
                      <Button
                        type="button"
                        variant="tertiary"
                        onPress={() => setOrganized(false)}
                      >
                        Back
                      </Button>
                    )}
                    <div className="flex gap-2">
                      <Button type="button" variant="tertiary" onPress={close}>
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        isDisabled={form.formState.isSubmitting}
                      >
                        {isEdit ? "Save" : "Create Issue"}
                      </Button>
                    </div>
                  </>
                )}
              </ModalFooter>
            </form>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
