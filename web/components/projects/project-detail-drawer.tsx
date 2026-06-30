"use client";

import {
  Button,
  Drawer,
  DrawerBackdrop,
  DrawerBody,
  DrawerContent,
  DrawerDialog,
  DrawerFooter,
  DrawerHeader,
  DrawerHeading,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Select,
  SelectIndicator,
  SelectPopover,
  SelectTrigger,
  SelectValue,
  TextField,
  type useOverlayState,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";

import type { ProjectPayload } from "@/libs/api/projects";

import {
  PRIORITY_OPTIONS,
  type Project,
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

function projectToFormValues(project: Project): ProjectFormValues {
  const websites =
    project.websites?.length
      ? project.websites.map((website) => ({
          name: website.name,
          url: website.url,
        }))
      : project.liveLink
        ? [{ name: "Main Website", url: project.liveLink }]
        : [{ name: "Main Website", url: "" }];

  return {
    clientName: project.clientName,
    type: project.type,
    assignee: project.assignee.name,
    priority: project.priority,
    status: project.status,
    websites,
    liveLink: project.liveLink ?? "",
    stagingLink: project.stagingLink ?? "",
    figmaLink: project.figmaLink ?? "",
    domainManagement: project.domainManagement,
    serverLocation: project.serverLocation,
  };
}

function toPayload(values: ProjectFormValues): ProjectPayload {
  return {
    clientName: values.clientName,
    type: values.type,
    assigneeName: values.assignee,
    priority: values.priority,
    status: values.status,
    websites: values.websites.map((website, index) => ({
      id: `site-${Date.now()}-${index}`,
      name: website.name,
      url: website.url,
    })),
    figmaLink: values.figmaLink || undefined,
    domainManagement: values.domainManagement,
    serverLocation: values.serverLocation,
  };
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-red-600">{message}</p>;
}

function LinkValue({ href, label }: { href?: string; label: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

export function ProjectDetailDrawer({
  project,
  state,
  onSave,
  assignees,
}: {
  project: Project | null;
  state: ReturnType<typeof useOverlayState>;
  onSave: (projectId: string, payload: ProjectPayload) => Promise<Project>;
  assignees: string[];
}) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: project
      ? projectToFormValues(project)
      : {
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
        },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "websites",
  });
  const figmaLink = useWatch({ control, name: "figmaLink" });

  useEffect(() => {
    if (project) reset(projectToFormValues(project));
  }, [project, reset]);

  const close = () => {
    if (project) reset(projectToFormValues(project));
    state.close();
  };

  const onSubmit = async (values: ProjectFormValues) => {
    if (!project) return;
    const saved = await onSave(project.id, toPayload(values));
    reset(projectToFormValues(saved));
  };

  return (
    <Drawer isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <DrawerBackdrop variant="blur">
        <DrawerContent placement="right">
          <DrawerDialog className="w-full max-w-2xl">
            {project && (
              <form onSubmit={handleSubmit(onSubmit)}>
                <DrawerHeader>
                  <DrawerHeading className="text-lg font-semibold">
                    Edit Project
                  </DrawerHeading>
                </DrawerHeader>

                <DrawerBody className="max-h-[calc(100vh-9rem)] overflow-y-auto">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                            <Input ref={field.ref} className="w-full" />
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
                          <p className="text-sm font-medium">
                            Websites / Domains
                          </p>
                          <p className="text-xs text-gray-500">
                            These websites are used by Website Health scans.
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
                            className="grid gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:grid-cols-[1fr_1.5fr_auto]"
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
                                  <Input ref={field.ref} className="w-full" />
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
                                    className="w-full"
                                    placeholder="https://example.com"
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
                      <Controller
                        control={control}
                        name="figmaLink"
                        render={({ field, fieldState }) => (
                          <TextField
                            name={field.name}
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            isInvalid={!!fieldState.error}
                            type="url"
                          >
                            <div className="mb-1 flex items-center justify-between gap-3">
                              <Label>Figma Link</Label>
                              <LinkValue href={figmaLink} label="Open" />
                            </div>
                            <Input
                              ref={field.ref}
                              className="w-full"
                              placeholder="https://figma.com/..."
                            />
                            <FieldError message={fieldState.error?.message} />
                          </TextField>
                        )}
                      />
                    </div>
                  </div>
                </DrawerBody>

                <DrawerFooter className="flex justify-end gap-2">
                  <Button type="button" variant="tertiary" onPress={close}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    isDisabled={isSubmitting}
                  >
                    Save Changes
                  </Button>
                </DrawerFooter>
              </form>
            )}
          </DrawerDialog>
        </DrawerContent>
      </DrawerBackdrop>
    </Drawer>
  );
}

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
