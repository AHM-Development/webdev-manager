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
  SearchField,
  TextArea,
  TextField,
  useFilter,
  type useOverlayState,
} from "@heroui/react";
import { getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  FileText,
  Link2,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { DateValue, RangeValue } from "react-aria-components";

import { organizeTaskWithAi } from "@/libs/api/ai";
import { notify } from "@/libs/notify";

import {
  STATUSES,
  UNASSIGNED,
  type Task,
  type TaskAttachment,
  type TaskPriority,
} from "./data";
import { addTaskSchema, type AddTaskValues } from "./schema";
import { ChecklistTextArea } from "./checklist-textarea";
import { makeChecklistItem } from "./task-utils";

export type NewTaskInput = Omit<Task, "id">;
export type TaskProjectOption = { id: string; label: string; meta?: string };
export type TaskAssigneeOption = { id: string; name: string };

/** Builds the assignee dropdown options ("Unassigned" + each member) and a
 *  name → user-id lookup so a chosen name can be saved with its user id. */
export function buildAssigneeSelect(assigneeOptions: TaskAssigneeOption[]) {
  const options = [
    { id: UNASSIGNED, label: UNASSIGNED },
    ...assigneeOptions.map((option) => ({ id: option.name, label: option.name })),
  ];
  const idByName = new Map(
    assigneeOptions.map((option) => [option.name, option.id])
  );
  return { options, idByName };
}

function cleanLine(line: string) {
  return line.replace(/^[-*•\d.)\s]+/, "").trim();
}

function titleFrom(text: string) {
  const cleaned = cleanLine(text).replace(/https?:\/\/\S+/g, "").trim();
  if (!cleaned) return "Review requested task";
  const sentence = cleaned.split(/[.!?\n]/)[0]?.trim() ?? cleaned;
  return sentence.length > 72 ? `${sentence.slice(0, 69).trim()}...` : sentence;
}

function checklistFrom(text: string) {
  const lines = text
    .split("\n")
    .map(cleanLine)
    .filter(Boolean);
  const items = lines.slice(1);
  return (
    items.length
      ? items
      : [
          "Review source material and confirm requirements",
          "Break down implementation steps",
          "Complete the requested work",
          "Send for review",
        ]
  ).join("\n");
}

function linksFrom(text: string) {
  return Array.from(
    new Set(
      (text.match(/https?:\/\/[^\s<>"']+/gi) ?? [])
        .map((url) => url.replace(/[),.;!?]+$/, ""))
        .filter(Boolean)
    )
  );
}

function toDateValue(value: string): DateValue | null {
  if (!value) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

function toDateRangeValue(
  startDate: string,
  dueDate: string
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

function HeroAutocompleteField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
}) {
  const { contains } = useFilter({ sensitivity: "base" });

  return (
    <Autocomplete
      selectedKey={value || null}
      onClear={() => onChange("")}
      onSelectionChange={(key) => {
        onChange(key ? String(key) : "");
      }}
      fullWidth
    >
      <Label>{label}</Label>
      <Autocomplete.Trigger>
        <Autocomplete.Value />
        <Autocomplete.ClearButton />
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Autocomplete.Popover>
        <Autocomplete.Filter filter={contains}>
          <SearchField aria-label={`Search ${label.toLowerCase()}`}>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input
                autoFocus
                placeholder={`Search ${label.toLowerCase()}...`}
              />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <ListBox>
            {options.map((option) => (
              <ListBoxItem key={option.id} id={option.id} textValue={option.label}>
                {option.label}
              </ListBoxItem>
            ))}
          </ListBox>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}

function ProjectAutocompleteField({
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
  const { contains } = useFilter({ sensitivity: "base" });

  return (
    <div>
      <Autocomplete
        selectedKey={value || null}
        onClear={() => onChange("")}
        onSelectionChange={(key) => {
          onChange(key ? String(key) : "");
        }}
        fullWidth
      >
        <Label>{label}</Label>
        <Autocomplete.Trigger>
          <Autocomplete.Value />
          <Autocomplete.ClearButton />
          <Autocomplete.Indicator />
        </Autocomplete.Trigger>
        <Autocomplete.Popover>
          <Autocomplete.Filter filter={contains}>
            <SearchField aria-label={`Search ${label.toLowerCase()}`}>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input
                  autoFocus
                  placeholder={`Search ${label.toLowerCase()}...`}
                />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
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

export function CreateTaskModal({
  state,
  projectOptions,
  assigneeOptions,
  defaultAssignee = UNASSIGNED,
  onCreate,
}: {
  state: ReturnType<typeof useOverlayState>;
  projectOptions: TaskProjectOption[];
  assigneeOptions: TaskAssigneeOption[];
  defaultAssignee?: string;
  onCreate: (input: NewTaskInput) => Promise<void> | void;
}) {
  const assigneeSelect = useMemo(
    () => buildAssigneeSelect(assigneeOptions),
    [assigneeOptions]
  );
  const [organized, setOrganized] = useState(false);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [organizedAttachments, setOrganizedAttachments] = useState<
    TaskAttachment[]
  >([]);
  const [removedLinks, setRemovedLinks] = useState<Set<string>>(() => new Set());
  const [checkedChecklistItems, setCheckedChecklistItems] = useState<Set<number>>(
    () => new Set()
  );
  const form = useForm<AddTaskValues>({
    resolver: zodResolver(addTaskSchema),
    defaultValues: {
      projectId: "",
      assignee: defaultAssignee,
      assigneeUserId: "",
      startDate: "",
      dueDate: "",
      sourceText: "",
      title: "",
      description: "",
      checklistText: "",
      priority: "Medium",
      status: "Backlog",
    },
  });

  const sourceText = form.watch("sourceText");
  const checklistText = form.watch("checklistText");

  const attachments = useMemo<TaskAttachment[]>(
    () => {
      const candidates: TaskAttachment[] = [
        ...organizedAttachments,
        ...linksFrom(sourceText)
        .filter((link) => !removedLinks.has(link))
        .map((link, index) => ({
          id: `link-${index}-${link}`,
          name: link,
          type: "link" as const,
          url: link,
        })),
      ];
      return Array.from(
        new Map(
          candidates
            .filter((item) => item.type !== "link" || !item.url || !removedLinks.has(item.url))
            .map((item) => [item.url || item.id, item])
        ).values()
      );
    },
    [organizedAttachments, removedLinks, sourceText]
  );

  const checklistItems = useMemo(
    () => checklistText.split("\n").map(cleanLine).filter(Boolean),
    [checklistText]
  );

  const reset = () => {
    form.reset({
      projectId: "",
      assignee: defaultAssignee,
      assigneeUserId: "",
      startDate: "",
      dueDate: "",
      sourceText: "",
      title: "",
      description: "",
      checklistText: "",
      priority: "Medium",
      status: "Backlog",
    });
    setOrganized(false);
    setIsOrganizing(false);
    setOrganizedAttachments([]);
    setRemovedLinks(new Set());
    setCheckedChecklistItems(new Set());
  };

  const close = () => {
    reset();
    state.close();
  };

  const organize = async () => {
    const values = form.getValues();
    const isSourceValid = await form.trigger(["projectId", "sourceText"]);
    if (!isSourceValid) {
      notify.error("Complete the task source", {
        description: "Select a client and paste the task details first.",
      });
      return;
    }

    setIsOrganizing(true);
    try {
      const draft = await organizeTaskWithAi({
        sourceText: values.sourceText.trim(),
        projectId: values.projectId,
      });
      form.setValue("title", draft.title || titleFrom(values.sourceText), {
        shouldValidate: true,
      });
      form.setValue("description", draft.description || values.sourceText, {
        shouldValidate: true,
      });
      form.setValue(
        "checklistText",
        (draft.checklist ?? [])
          .map((item) => item.title)
          .filter(Boolean)
          .join("\n") || checklistFrom(values.sourceText),
        {
          shouldValidate: true,
        }
      );
      form.setValue("priority", draft.priority ?? "Medium", {
        shouldValidate: true,
      });
      form.setValue("status", draft.status ?? "Backlog", {
        shouldValidate: true,
      });
      setOrganizedAttachments(
        (draft.attachments ?? []).map((attachment, index) => ({
          id: `organized-${index}-${attachment.name}`,
          name: attachment.name,
          type: attachment.type,
          url: attachment.url ?? undefined,
        }))
      );
      setIsOrganizing(false);
      setOrganized(true);
      setCheckedChecklistItems(new Set());
    } catch (err) {
      setIsOrganizing(false);
      notify.error("Could not organize task", {
        description:
          (err as Error).message ??
          "Check your task organizer prompt and Claude API settings.",
      });
    }
  };

  const updateChecklistItem = (index: number, value: string) => {
    const next = [...checklistItems];
    next[index] = value;
    form.setValue("checklistText", next.join("\n"), { shouldValidate: true });
  };

  const removeChecklistItem = (index: number) => {
    form.setValue(
      "checklistText",
      checklistItems.filter((_, itemIndex) => itemIndex !== index).join("\n"),
      { shouldValidate: true }
    );
    setCheckedChecklistItems((current) => {
      const next = new Set<number>();
      current.forEach((itemIndex) => {
        if (itemIndex < index) next.add(itemIndex);
        if (itemIndex > index) next.add(itemIndex - 1);
      });
      return next;
    });
  };

  const toggleChecklistItem = (index: number, isSelected: boolean) => {
    setCheckedChecklistItems((current) => {
      const next = new Set(current);
      if (isSelected) {
        next.add(index);
      } else {
        next.delete(index);
      }
      return next;
    });
  };

  const removeAttachment = (attachment: TaskAttachment) => {
    if (attachment.type === "link" && attachment.url) {
      setRemovedLinks((current) => new Set(current).add(attachment.url ?? ""));
    }
    setOrganizedAttachments((current) =>
      current.filter((item) => item.id !== attachment.id)
    );
  };

  const submit = form.handleSubmit(async (values) => {
    if (!organized) {
      await organize();
      return;
    }
    const checklist = values.checklistText
      .split("\n")
      .map(cleanLine)
      .filter(Boolean)
      .map((title, index) => ({
        ...makeChecklistItem(title, index),
        completed: checkedChecklistItems.has(index),
      }));

    await onCreate({
      projectId: values.projectId,
      title: values.title.trim(),
      description: values.description.trim(),
      checklist,
      attachments,
      status: values.status,
      assignee: values.assignee,
      assigneeUserId: values.assigneeUserId || undefined,
      priority: values.priority,
      startDate: values.startDate || undefined,
      dueDate: values.dueDate || undefined,
    });
    close();
  });

  return (
    <Modal
      isOpen={state.isOpen}
      onOpenChange={(open) => {
        if (open) {
          state.setOpen(true);
        } else {
          close();
        }
      }}
    >
      <ModalBackdrop>
        <ModalContainer placement="center">
          <ModalDialog className="max-w-3xl">
            <form onSubmit={submit}>
              <ModalHeader>
                <ModalHeading className="text-base font-semibold">
                  Add Task
                </ModalHeading>
              </ModalHeader>

              <ModalBody className="max-h-[72vh] space-y-5 overflow-y-auto">
                {!organized && (
                  <div className="space-y-5">
                    <Controller
                      control={form.control}
                      name="projectId"
                      render={({ field, fieldState }) => (
                        <ProjectAutocompleteField
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
                      name="sourceText"
                      render={({ field }) => (
                        <TextField
                          aria-label="Paste task source"
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                        >
                          <Label>Task details</Label>
                          <TextArea
                            rows={12}
                            className="w-full resize-y"
                            placeholder="Paste the task details, messages, notes, instructions, and any reference links here..."
                          />
                          {form.formState.errors.sourceText && (
                            <p className="mt-1 text-sm text-red-600">
                              {form.formState.errors.sourceText.message}
                            </p>
                          )}
                        </TextField>
                      )}
                    />
                    {linksFrom(sourceText).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {linksFrom(sourceText).map((link) => (
                          <a
                            key={link}
                            href={link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-[#0b7de3] hover:border-blue-300 hover:bg-blue-50"
                          >
                            <Link2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{link}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {organized && (
                  <div className="space-y-5">
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
                          <Input className="w-full" />
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
                      <Label>Checklists</Label>
                      <div className="space-y-2">
                        {checklistItems.map((item, index) => (
                          <div
                            key={index}
                            className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
                          >
                            <Checkbox
                              isSelected={checkedChecklistItems.has(index)}
                              onChange={(isSelected) =>
                                toggleChecklistItem(index, isSelected)
                              }
                              aria-label={`Checklist item ${index + 1}`}
                              className="shrink-0"
                            >
                              <Checkbox.Control>
                                <Checkbox.Indicator />
                              </Checkbox.Control>
                            </Checkbox>
                            <ChecklistTextArea
                              value={item}
                              completed={checkedChecklistItems.has(index)}
                              ariaLabel={`Checklist item ${index + 1}`}
                              onChange={(value) => updateChecklistItem(index, value)}
                            />
                            <button
                              type="button"
                              aria-label={`Remove checklist item ${index + 1}`}
                              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              onClick={() => removeChecklistItem(index)}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        {checklistItems.length === 0 && (
                          <p className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-400">
                            No checklist items were generated.
                          </p>
                        )}
                      </div>
                    </div>

                    <Controller
                      control={form.control}
                      name="assignee"
                      render={({ field }) => (
                        <HeroAutocompleteField
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
                          <HeroAutocompleteField
                            label="Priority"
                            value={field.value}
                            onChange={field.onChange}
                            options={(
                              ["Low", "Medium", "High"] as TaskPriority[]
                            ).map((item) => ({ id: item, label: item }))}
                          />
                        )}
                      />

                      <Controller
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <HeroAutocompleteField
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
                                onClick={() => removeAttachment(attachment)}
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
                  </div>
                )}
              </ModalBody>

              <ModalFooter
                className={`flex gap-2 ${
                  organized ? "justify-between" : "justify-end"
                }`}
              >
                {organized ? (
                  <>
                    <Button
                      type="button"
                      variant="tertiary"
                      onPress={() => setOrganized(false)}
                    >
                      Back
                    </Button>
                    <div className="flex gap-2">
                      <Button type="button" variant="tertiary" onPress={close}>
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        isDisabled={isOrganizing}
                      >
                        Create Task
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="tertiary"
                      onPress={close}
                      isDisabled={isOrganizing}
                    >
                      Cancel
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
