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
  TextField,
  type useOverlayState,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import type { ProjectPayload } from "@/libs/api/projects";

import {
  PRIORITY_OPTIONS,
} from "./data";
import { projectFormSchema, type ProjectFormValues } from "./schema";

const TYPE_OPTIONS = ["One Pager", "Full Web Dev"];
const STATUS_OPTIONS = [
  "Live",
  "Staging",
  "In Progress",
  "Site Handed Over",
  "Churned",
];
const DOMAIN_OPTIONS = ["Client Domain", "Cloudflare"];
const SERVER_OPTIONS = ["Client", "Hetzner", "AWS"];

const defaultValues: ProjectFormValues = {
  clientName: "",
  type: "One Pager",
  assignee: "",
  priority: "Medium",
  status: "In Progress",
  websites: [{ name: "Main Website", url: "" }],
  liveLink: "",
  stagingLink: "",
  figmaLink: "",
  domainManagement: "Cloudflare",
  serverLocation: "Hetzner",
};

function toPayload(v: ProjectFormValues): ProjectPayload {
  return {
    clientName: v.clientName,
    type: v.type,
    assigneeName: v.assignee,
    priority: v.priority,
    status: v.status,
    websites: v.websites.map((website, index) => ({
      id: `site-${Date.now()}-${index}`,
      name: website.name,
      url: website.url,
    })),
    figmaLink: v.figmaLink || undefined,
    domainManagement: v.domainManagement,
    serverLocation: v.serverLocation,
  };
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-red-600">{message}</p>;
}

export function CreateProjectModal({
  state,
  onCreate,
  assignees,
}: {
  state: ReturnType<typeof useOverlayState>;
  onCreate: (project: ProjectPayload) => void | Promise<void>;
  assignees: string[];
}) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues,
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "websites",
  });

  const onSubmit = async (values: ProjectFormValues) => {
    await onCreate(toPayload(values));
    reset(defaultValues);
    state.close();
  };

  const close = () => {
    reset(defaultValues);
    state.close();
  };

  return (
    <Modal isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <ModalBackdrop>
        <ModalContainer placement="center" size="lg">
          <ModalDialog>
            <form onSubmit={handleSubmit(onSubmit)}>
              <ModalHeader>
                <ModalHeading className="text-lg font-semibold">
                  Add New Project
                </ModalHeading>
              </ModalHeader>

              <ModalBody className="grid max-h-[65vh] grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Controller
                    control={control}
                    name="clientName"
                    render={({ field, fieldState }) => (
                      <TextField
                        name={field.name}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        isInvalid={!!fieldState.error}
                      >
                        <Label>Client Name</Label>
                        <Input
                          ref={field.ref}
                          placeholder="e.g. Acme Dental"
                          className="w-full"
                        />
                        <FieldError message={fieldState.error?.message} />
                      </TextField>
                    )}
                  />
                </div>

                <Controller
                  control={control}
                  name="type"
                  render={({ field, fieldState }) => (
                    <FormSelect
                      label="Type"
                      placeholder="Select type"
                      value={field.value}
                      onChange={field.onChange}
                      options={TYPE_OPTIONS}
                      error={fieldState.error?.message}
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="assignee"
                  render={({ field, fieldState }) => (
                    <FormSelect
                      label="Assignee"
                      placeholder="Select assignee"
                      value={field.value}
                      onChange={field.onChange}
                      options={assignees}
                      error={fieldState.error?.message}
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="status"
                  render={({ field, fieldState }) => (
                    <FormSelect
                      label="Status"
                      placeholder="Select status"
                      value={field.value}
                      onChange={field.onChange}
                      options={STATUS_OPTIONS}
                      error={fieldState.error?.message}
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="priority"
                  render={({ field, fieldState }) => (
                    <FormSelect
                      label="Priority"
                      placeholder="Select priority"
                      value={field.value}
                      onChange={field.onChange}
                      options={PRIORITY_OPTIONS}
                      error={fieldState.error?.message}
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="domainManagement"
                  render={({ field, fieldState }) => (
                    <FormSelect
                      label="Domain Management"
                      placeholder="Select domain management"
                      value={field.value}
                      onChange={field.onChange}
                      options={DOMAIN_OPTIONS}
                      error={fieldState.error?.message}
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="serverLocation"
                  render={({ field, fieldState }) => (
                    <FormSelect
                      label="Server Location"
                      placeholder="Select server location"
                      value={field.value}
                      onChange={field.onChange}
                      options={SERVER_OPTIONS}
                      error={fieldState.error?.message}
                    />
                  )}
                />

                <div className="space-y-3 sm:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Websites / Domains</p>
                      <p className="text-xs text-gray-500">
                        Add each website to scan by name and URL.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="tertiary"
                      onPress={() => append({ name: "", url: "" })}
                    >
                      <Plus className="h-4 w-4" />
                      Add Website
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {fields.map((field, index) => (
                      <div
                        key={field.id}
                        className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-[1fr_1.5fr_auto]"
                      >
                        <Controller
                          control={control}
                          name={`websites.${index}.name`}
                          render={({ field, fieldState }) => (
                            <TextField
                              name={field.name}
                              value={field.value}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              isInvalid={!!fieldState.error}
                            >
                              <Label>Name</Label>
                              <Input
                                ref={field.ref}
                                placeholder="Main Website"
                                className="w-full"
                              />
                              <FieldError
                                message={fieldState.error?.message}
                              />
                            </TextField>
                          )}
                        />
                        <Controller
                          control={control}
                          name={`websites.${index}.url`}
                          render={({ field, fieldState }) => (
                            <TextField
                              name={field.name}
                              value={field.value}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              isInvalid={!!fieldState.error}
                              type="url"
                            >
                              <Label>URL</Label>
                              <Input
                                ref={field.ref}
                                placeholder="https://example.com"
                                className="w-full"
                              />
                              <FieldError
                                message={fieldState.error?.message}
                              />
                            </TextField>
                          )}
                        />
                        <Button
                          type="button"
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          aria-label="Remove website"
                          isDisabled={fields.length === 1}
                          onPress={() => remove(index)}
                          className="self-end"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <TextInputField
                    control={control}
                    name="figmaLink"
                    label="Figma Link"
                    placeholder="https://figma.com/…"
                  />
                </div>
              </ModalBody>

              <ModalFooter className="flex justify-end gap-2">
                <Button type="button" variant="tertiary" onPress={close}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" isDisabled={isSubmitting}>
                  Create Project
                </Button>
              </ModalFooter>
            </form>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

/* ---- small field helpers (local to the modal) ---- */

function FormSelect({
  label,
  placeholder,
  value,
  onChange,
  options,
  error,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  error?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <Select
        aria-label={label}
        selectedKey={value || null}
        onSelectionChange={(key) => onChange(String(key))}
      >
        <SelectTrigger className="w-full">
          <SelectValue>{value || placeholder}</SelectValue>
          <SelectIndicator />
        </SelectTrigger>
        <SelectPopover>
          <ListBox>
            {options.map((o) => (
              <ListBoxItem key={o} id={o}>
                {o}
              </ListBoxItem>
            ))}
          </ListBox>
        </SelectPopover>
      </Select>
      <FieldError message={error} />
    </div>
  );
}

// Generic text input wired to react-hook-form for the optional URL fields.
function TextInputField({
  control,
  name,
  label,
  placeholder,
}: {
  control: ReturnType<typeof useForm<ProjectFormValues>>["control"];
  name: "figmaLink";
  label: string;
  placeholder: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          name={field.name}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          isInvalid={!!fieldState.error}
          type="url"
        >
          <Label>{label}</Label>
          <Input ref={field.ref} placeholder={placeholder} className="w-full" />
          <FieldError message={fieldState.error?.message} />
        </TextField>
      )}
    />
  );
}
