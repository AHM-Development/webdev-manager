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
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { PasswordField } from "@/components/ui/password";
import type { WebsiteCredentialOptions } from "@/libs/api/website-users";

import type { Credential } from "./data";
import {
  credentialFormSchema,
  type CredentialFormValues,
} from "./schema";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-red-600">{message}</p>;
}

function NameCombobox({
  value,
  onChange,
  onBlur,
  names,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  names: string[];
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const matches = names.filter(
    (n) => n.toLowerCase().includes(q) && n.toLowerCase() !== q
  );

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          onBlur();
          setTimeout(() => setOpen(false), 120);
        }}
        placeholder="Type a new name or select existing"
        className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-blue-500 ${
          invalid ? "border-red-400" : "border-gray-200"
        }`}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-md">
          {matches.map((n) => (
            <li key={n}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(n);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                {n}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

function valuesFromCredential(
  credential: Credential | null,
  options: WebsiteCredentialOptions
): CredentialFormValues {
  return {
    name: credential?.name ?? "",
    targetKind: credential?.externalSite ? "external" : "project",
    projectId: credential?.projectId ?? options.projects[0]?.id ?? "",
    websiteId: credential?.websiteId ?? "",
    externalSite: credential?.externalSite ?? "",
    environment: credential?.environment ?? "Live",
    username: credential?.username ?? "",
    password: credential?.password ?? "",
    note: credential?.note ?? "",
  };
}

export function CredentialModal({
  state,
  credential,
  names,
  options,
  onSave,
}: {
  state: ReturnType<typeof useOverlayState>;
  credential: Credential | null;
  names: string[];
  options: WebsiteCredentialOptions;
  onSave: (cred: Credential) => void | Promise<void>;
}) {
  const isEdit = !!credential;
  const form = useForm<CredentialFormValues>({
    resolver: zodResolver(credentialFormSchema(isEdit)),
    defaultValues: valuesFromCredential(credential, options),
  });

  const targetKind = form.watch("targetKind");
  const projectId = form.watch("projectId");
  const websiteId = form.watch("websiteId");
  const environment = form.watch("environment");

  const submit = form.handleSubmit(async (values) => {
    const isExternal = values.targetKind === "external";
    try {
      await onSave({
        id: credential?.id ?? `c-${Date.now()}`,
        name: values.name.trim(),
        projectId: isExternal ? undefined : values.projectId,
        websiteId: isExternal ? undefined : values.websiteId || undefined,
        externalSite: isExternal ? values.externalSite.trim() : undefined,
        environment: values.environment,
        username: values.username.trim(),
        password: values.password || undefined,
        createdAt: credential?.createdAt ?? today(),
        passwordUpdatedAt: values.password ? today() : credential?.passwordUpdatedAt ?? today(),
        note: values.note.trim() || undefined,
      });
      state.close();
    } catch {
      // The caller shows a toast and keeps the modal open.
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
                  {credential ? "Edit Credential" : "Add Credential"}
                </ModalHeading>
              </ModalHeader>

              <ModalBody className="max-h-[70vh] space-y-4 overflow-y-auto">
                <Controller
                  control={form.control}
                  name="name"
                  render={({ field, fieldState }) => (
                    <div>
                      <label className="mb-1 block text-sm font-medium">Name</label>
                      <NameCombobox
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        names={names}
                        invalid={!!fieldState.error}
                      />
                      <FieldError message={fieldState.error?.message} />
                    </div>
                  )}
                />

                <Controller
                  control={form.control}
                  name="targetKind"
                  render={({ field }) => (
                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Credential for
                      </label>
                      <div className="inline-flex rounded-md border border-gray-200 p-0.5 text-sm">
                        {(
                          [
                            { id: "project", label: "Managed project" },
                            { id: "external", label: "External site" },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => field.onChange(opt.id)}
                            className={`rounded px-3 py-1.5 ${
                              field.value === opt.id
                                ? "bg-gray-900 text-white"
                                : "text-gray-600 hover:bg-gray-100"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                />

                {targetKind === "project" ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Controller
                      control={form.control}
                      name="projectId"
                      render={({ field, fieldState }) => (
                        <div>
                          <label className="mb-1 block text-sm font-medium">
                            Project
                          </label>
                          <Select
                            aria-label="Project"
                            selectedKey={field.value}
                            onSelectionChange={(k) => {
                              field.onChange(String(k));
                              form.setValue("websiteId", "");
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue>
                                {options.projects.find((p) => p.id === field.value)
                                  ?.name ?? "Select project"}
                              </SelectValue>
                              <SelectIndicator />
                            </SelectTrigger>
                            <SelectPopover>
                              <ListBox>
                                {options.projects.map((p) => (
                                  <ListBoxItem key={p.id} id={p.id}>
                                    {p.name}
                                  </ListBoxItem>
                                ))}
                              </ListBox>
                            </SelectPopover>
                          </Select>
                          <FieldError message={fieldState.error?.message} />
                        </div>
                      )}
                    />

                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Website
                      </label>
                      <Controller
                        control={form.control}
                        name="environment"
                        render={({ field }) => (
                          <div className="mb-3 inline-flex rounded-md border border-gray-200 p-0.5 text-sm">
                            {(["Live", "Staging"] as const).map((env) => (
                              <button
                                key={env}
                                type="button"
                                onClick={() => field.onChange(env)}
                                className={`rounded px-3 py-1.5 ${
                                  environment === env
                                    ? "bg-gray-900 text-white"
                                    : "text-gray-600 hover:bg-gray-100"
                                }`}
                              >
                                {env}
                              </button>
                            ))}
                          </div>
                        )}
                      />
                      <Controller
                        control={form.control}
                        name="websiteId"
                        render={({ field }) => (
                          <Select
                            aria-label="Specific website"
                            selectedKey={websiteId || "none"}
                            onSelectionChange={(k) =>
                              field.onChange(String(k) === "none" ? "" : String(k))
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue>
                                {websiteId
                                  ? options.websites.find((site) => site.id === websiteId)
                                      ?.name ?? "Select website"
                                  : "No specific website"}
                              </SelectValue>
                              <SelectIndicator />
                            </SelectTrigger>
                            <SelectPopover>
                              <ListBox>
                                <ListBoxItem id="none">No specific website</ListBoxItem>
                                {options.websites
                                  .filter((site) => site.projectId === projectId)
                                  .map((site) => (
                                    <ListBoxItem key={site.id} id={site.id}>
                                      {site.name}
                                    </ListBoxItem>
                                  ))}
                              </ListBox>
                            </SelectPopover>
                          </Select>
                        )}
                      />
                    </div>
                  </div>
                ) : (
                  <Controller
                    control={form.control}
                    name="externalSite"
                    render={({ field, fieldState }) => (
                      <TextField
                        aria-label="External site"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        isInvalid={!!fieldState.error}
                      >
                        <Label>External site</Label>
                        <Input
                          className="w-full"
                          placeholder="e.g. Mailchimp or example.com"
                        />
                        <FieldError message={fieldState.error?.message} />
                      </TextField>
                    )}
                  />
                )}

                <Controller
                  control={form.control}
                  name="username"
                  render={({ field, fieldState }) => (
                    <TextField
                      aria-label="Username"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      isInvalid={!!fieldState.error}
                    >
                      <Label>Username</Label>
                      <Input className="w-full" placeholder="username or email" />
                      <FieldError message={fieldState.error?.message} />
                    </TextField>
                  )}
                />

                <Controller
                  control={form.control}
                  name="password"
                  render={({ field, fieldState }) => (
                    <PasswordField
                      label="Password"
                      placeholder={isEdit ? "Leave blank to keep current password" : "Password"}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      isInvalid={!!fieldState.error}
                      error={fieldState.error?.message}
                    />
                  )}
                />

                <Controller
                  control={form.control}
                  name="note"
                  render={({ field }) => (
                    <TextField
                      aria-label="Note"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                    >
                      <Label>Note (optional)</Label>
                      <TextArea rows={2} className="w-full resize-y" />
                    </TextField>
                  )}
                />
              </ModalBody>

              <ModalFooter className="flex justify-end gap-2">
                <Button type="button" variant="tertiary" onPress={state.close}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isDisabled={form.formState.isSubmitting}
                >
                  {credential ? "Save" : "Add Credential"}
                </Button>
              </ModalFooter>
            </form>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
