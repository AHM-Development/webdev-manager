"use client";

import {
  Autocomplete,
  Button,
  Checkbox,
  DateField,
  DateRangePicker,
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
  RangeCalendar,
  TextArea,
  TextField,
  type useOverlayState,
} from "@heroui/react";
import { getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, Link2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { DateValue, RangeValue } from "react-aria-components";

import {
  STATUSES,
  UNASSIGNED,
  type Task,
  type TaskAttachment,
  type TaskChecklistItem,
  type TaskPriority,
} from "./data";
import {
  buildAssigneeSelect,
  type TaskAssigneeOption,
  type TaskProjectOption,
} from "./create-task-modal";
import { editTaskSchema, type EditTaskValues } from "./schema";
import { checklistProgress } from "./task-utils";
import { ChecklistTextArea } from "./checklist-textarea";

function toDateValue(value?: string): DateValue | null {
  if (!value) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

function toDateRangeValue(
  startDate?: string,
  dueDate?: string
): RangeValue<DateValue> | null {
  const start = toDateValue(startDate);
  const end = toDateValue(dueDate);
  return start && end ? { start, end } : null;
}

function TaskDateRangeField({
  startDate,
  dueDate,
  onChange,
  error,
}: {
  startDate: string;
  dueDate: string;
  onChange: (value: RangeValue<DateValue> | null) => void;
  error?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        Date Range
      </label>
      <DateRangePicker
        aria-label="Task date range"
        value={toDateRangeValue(startDate, dueDate)}
        onChange={onChange}
        minValue={today(getLocalTimeZone())}
        className="w-full"
      >
        <DateField.Group fullWidth>
          <DateField.Input slot="start">
            {(segment) => <DateField.Segment segment={segment} />}
          </DateField.Input>
          <DateRangePicker.RangeSeparator />
          <DateField.Input slot="end">
            {(segment) => <DateField.Segment segment={segment} />}
          </DateField.Input>
          <DateField.Suffix>
            <DateRangePicker.Trigger>
              <DateRangePicker.TriggerIndicator />
            </DateRangePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <DateRangePicker.Popover placement="bottom start">
          <RangeCalendar aria-label="Task date range">
            <RangeCalendar.Header>
              <RangeCalendar.YearPickerTrigger>
                <RangeCalendar.YearPickerTriggerHeading />
                <RangeCalendar.YearPickerTriggerIndicator />
              </RangeCalendar.YearPickerTrigger>
              <RangeCalendar.NavButton slot="previous" />
              <RangeCalendar.NavButton slot="next" />
            </RangeCalendar.Header>
            <RangeCalendar.Grid>
              <RangeCalendar.GridHeader>
                {(day) => (
                  <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>
                )}
              </RangeCalendar.GridHeader>
              <RangeCalendar.GridBody>
                {(date) => <RangeCalendar.Cell date={date} />}
              </RangeCalendar.GridBody>
            </RangeCalendar.Grid>
            <RangeCalendar.YearPickerGrid>
              <RangeCalendar.YearPickerGridBody>
                {({ year }) => <RangeCalendar.YearPickerCell year={year} />}
              </RangeCalendar.YearPickerGridBody>
            </RangeCalendar.YearPickerGrid>
          </RangeCalendar>
        </DateRangePicker.Popover>
      </DateRangePicker>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function AutocompleteField({
  label,
  value,
  onChange,
  options,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string; meta?: string }[];
  error?: string;
}) {
  return (
    <div>
      <Autocomplete
        selectedKey={value || null}
        onClear={() => onChange("")}
        onSelectionChange={(key) => onChange(key ? String(key) : "")}
        fullWidth
      >
        <Label>{label}</Label>
        <Autocomplete.Trigger>
          <Autocomplete.Value />
          <Autocomplete.ClearButton />
          <Autocomplete.Indicator />
        </Autocomplete.Trigger>
        <Autocomplete.Popover>
          <Autocomplete.Filter>
            <Input
              autoFocus
              className="mb-2 w-full"
              placeholder={`Search ${label.toLowerCase()}...`}
            />
            <ListBox>
              {options.map((option) => (
                <ListBoxItem
                  key={option.id}
                  id={option.id}
                  textValue={`${option.label} ${option.meta ?? ""}`}
                >
                  <div>
                    <span className="font-medium">{option.label}</span>
                    {option.meta && (
                      <span className="block text-xs text-slate-500">
                        {option.meta}
                      </span>
                    )}
                  </div>
                </ListBoxItem>
              ))}
            </ListBox>
          </Autocomplete.Filter>
        </Autocomplete.Popover>
      </Autocomplete>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function valuesFromTask(task: Task | null): EditTaskValues {
  return {
    projectId: task?.projectId ?? "",
    title: task?.title ?? "",
    description: task?.description ?? "",
    assignee: task?.assignee || UNASSIGNED,
    assigneeUserId: task?.assigneeUserId ?? "",
    priority: task?.priority ?? "Medium",
    status: task?.status ?? "Backlog",
    startDate: task?.startDate ?? "",
    dueDate: task?.dueDate ?? "",
  };
}

export function TaskDetailModal({
  state,
  task,
  projectOptions,
  assigneeOptions,
  onUpdate,
}: {
  state: ReturnType<typeof useOverlayState>;
  task: Task | null;
  projectOptions: TaskProjectOption[];
  assigneeOptions: TaskAssigneeOption[];
  onUpdate: (task: Task) => Promise<void> | void;
}) {
  const assigneeSelect = useMemo(
    () => buildAssigneeSelect(assigneeOptions),
    [assigneeOptions]
  );
  const [checklist, setChecklist] = useState<TaskChecklistItem[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const form = useForm<EditTaskValues>({
    resolver: zodResolver(editTaskSchema),
    defaultValues: valuesFromTask(task),
  });

  useEffect(() => {
    form.reset(valuesFromTask(task));
    setChecklist(task?.checklist ?? []);
    setAttachments(task?.attachments ?? []);
  }, [form, task]);

  if (!task) return null;

  const progress = checklistProgress({ ...task, checklist });
  const updateChecklistItem = (itemId: string, value: string) => {
    setChecklist((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, title: value } : item
      )
    );
  };

  const toggleChecklistItem = (itemId: string, completed: boolean) => {
    setChecklist((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, completed } : item
      )
    );
  };

  const removeChecklistItem = (itemId: string) => {
    setChecklist((current) => current.filter((item) => item.id !== itemId));
  };

  const submit = form.handleSubmit(async (values) => {
    await onUpdate({
      ...task,
      projectId: values.projectId,
      title: values.title.trim(),
      description: values.description.trim(),
      checklist,
      attachments,
      assignee: values.assignee,
      assigneeUserId: values.assigneeUserId || undefined,
      priority: values.priority,
      status: values.status,
      startDate: values.startDate || undefined,
      dueDate: values.dueDate || undefined,
    });
    state.close();
  });

  return (
    <Modal isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <ModalBackdrop>
        <ModalContainer placement="center">
          <ModalDialog className="max-w-3xl">
            <form onSubmit={submit}>
              <ModalHeader>
                <ModalHeading className="text-base font-semibold">
                  Task Details
                </ModalHeading>
              </ModalHeader>

              <ModalBody className="max-h-[72vh] space-y-5 overflow-y-auto">
                <Controller
                  control={form.control}
                  name="projectId"
                  render={({ field, fieldState }) => (
                    <AutocompleteField
                      label="Client Name"
                      value={field.value}
                      onChange={field.onChange}
                      options={projectOptions}
                      error={fieldState.error?.message}
                    />
                  )}
                />

                <Controller
                  control={form.control}
                  name="title"
                  render={({ field, fieldState }) => (
                    <TextField
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      isInvalid={!!fieldState.error}
                    >
                      <Label>Title</Label>
                      <Input ref={field.ref} className="w-full" />
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
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                    >
                      <Label>Description</Label>
                      <TextArea rows={4} className="w-full resize-y" />
                    </TextField>
                  )}
                />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Checklists</Label>
                    <span className="text-xs font-medium text-slate-500">
                      {progress.completed}/{progress.total} done
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[#0b7de3]"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                  <div className="space-y-2">
                    {checklist.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
                      >
                        <Checkbox
                          isSelected={item.completed}
                          onChange={(selected) =>
                            toggleChecklistItem(item.id, selected)
                          }
                          aria-label={item.title}
                          className="shrink-0"
                        >
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                        </Checkbox>
                        <ChecklistTextArea
                          value={item.title}
                          completed={item.completed}
                          ariaLabel={item.title}
                          onChange={(value) => updateChecklistItem(item.id, value)}
                        />
                        <button
                          type="button"
                          aria-label={`Remove ${item.title}`}
                          className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          onClick={() => removeChecklistItem(item.id)}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {checklist.length === 0 && (
                      <p className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-400">
                        No checklist items yet.
                      </p>
                    )}
                  </div>
                </div>

                <Controller
                  control={form.control}
                  name="assignee"
                  render={({ field }) => (
                    <AutocompleteField
                      label="Assignee"
                      value={field.value}
                      onChange={(name) => {
                        const next = name || UNASSIGNED;
                        field.onChange(next);
                        form.setValue(
                          "assigneeUserId",
                          assigneeSelect.idByName.get(next) ?? ""
                        );
                      }}
                      options={assigneeSelect.options}
                    />
                  )}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <Controller
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <AutocompleteField
                        label="Priority"
                        value={field.value}
                        onChange={field.onChange}
                        options={(["Low", "Medium", "High"] as TaskPriority[]).map(
                          (item) => ({ id: item, label: item })
                        )}
                      />
                    )}
                  />
                  <Controller
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <AutocompleteField
                        label="Status"
                        value={field.value}
                        onChange={field.onChange}
                        options={STATUSES.map((item) => ({
                          id: item,
                          label: item,
                        }))}
                      />
                    )}
                  />
                </div>

                <TaskDateRangeField
                  startDate={form.watch("startDate")}
                  dueDate={form.watch("dueDate")}
                  onChange={(value) => {
                    form.setValue(
                      "startDate",
                      value?.start ? value.start.toString() : "",
                      { shouldValidate: true }
                    );
                    form.setValue(
                      "dueDate",
                      value?.end ? value.end.toString() : "",
                      { shouldValidate: true }
                    );
                  }}
                  error={
                    form.formState.errors.startDate?.message ??
                    form.formState.errors.dueDate?.message
                  }
                />

                {attachments.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-700">
                      Attachments
                    </p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="relative aspect-square overflow-hidden rounded-md border border-slate-200 bg-white p-3"
                        >
                          <button
                            type="button"
                            aria-label={`Remove ${attachment.name}`}
                            className="absolute right-2 top-2 rounded-full bg-white p-1 text-slate-500 shadow-sm hover:text-slate-900"
                            onClick={() =>
                              setAttachments((current) =>
                                current.filter((item) => item.id !== attachment.id)
                              )
                            }
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <a
                            href={attachment.url || undefined}
                            target={attachment.url ? "_blank" : undefined}
                            rel={attachment.url ? "noreferrer" : undefined}
                            className="flex h-full flex-col justify-between"
                            onClick={(event) => {
                              if (!attachment.url) event.preventDefault();
                            }}
                          >
                            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#e8f5ff] text-[#0b7de3]">
                              {attachment.type === "link" ? (
                                <Link2 className="h-5 w-5" />
                              ) : (
                                <FileText className="h-5 w-5" />
                              )}
                            </div>
                            <div>
                              <p className="line-clamp-2 break-all text-xs font-semibold text-slate-800">
                                {attachment.name}
                              </p>
                              <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-400">
                                {attachment.type === "link" ? "Link" : "File"}
                              </p>
                            </div>
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </ModalBody>

              <ModalFooter className="flex justify-end gap-2">
                <Button type="button" variant="tertiary" onPress={state.close}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Save Changes
                </Button>
              </ModalFooter>
            </form>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
