"use client";

import {
  Button,
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
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { PasswordField } from "@/components/ui/password";
import { SearchableFilter } from "@/components/ui/searchable-filter";
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
  credential: Credential | null
): CredentialFormValues {
  return {
    name: credential?.name ?? "",
    projectId: credential?.projectId ?? "",
    websiteId: credential?.websiteId ?? "",
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
    defaultValues: valuesFromCredential(credential),
  });

  const projectId = form.watch("projectId");

  const clientOptions = options.projects.map((p) => ({ key: p.id, label: p.name }));
  const websiteOptions = options.websites
    .filter((site) => site.projectId === projectId)
    .map((site) => ({ key: site.id, label: site.name, description: site.url }));

  const submit = form.handleSubmit(async (values) => {
    // Website is required whenever the selected client has saved websites.
    if (websiteOptions.length > 0 && !values.websiteId) {
      form.setError("websiteId", { type: "custom", message: "Website is required" });
      return;
    }
    try {
      await onSave({
        id: credential?.id ?? `c-${Date.now()}`,
        name: values.name.trim(),
        projectId: values.projectId,
        websiteId: values.websiteId || undefined,
        environment: credential?.environment ?? "Live",
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
                  name="projectId"
                  render={({ field, fieldState }) => (
                    <div>
                      <label className="mb-1 block text-sm font-medium">Client</label>
                      <SearchableFilter
                        ariaLabel="Client"
                        value={field.value}
                        options={clientOptions}
                        onChange={(v) => {
                          field.onChange(v);
                          form.setValue("websiteId", "");
                          form.clearErrors("websiteId");
                        }}
                        placeholder="Search a client..."
                        searchPlaceholder="Search clients..."
                        className="w-full"
                        triggerClassName="w-full"
                      />
                      <FieldError message={fieldState.error?.message} />
                    </div>
                  )}
                />

                <Controller
                  control={form.control}
                  name="websiteId"
                  render={({ field, fieldState }) => (
                    <div>
                      <label className="mb-1 block text-sm font-medium">Website</label>
                      {!projectId ? (
                        <p className="rounded-md border border-dashed border-gray-200 px-3 py-2 text-sm text-gray-400">
                          Select a client first
                        </p>
                      ) : websiteOptions.length === 0 ? (
                        <p className="rounded-md border border-dashed border-gray-200 px-3 py-2 text-sm text-gray-500">
                          No websites saved for this client
                        </p>
                      ) : (
                        <SearchableFilter
                          ariaLabel="Website"
                          value={field.value}
                          options={websiteOptions}
                          onChange={field.onChange}
                          placeholder="Select a website..."
                          searchPlaceholder="Search websites..."
                          className="w-full"
                          triggerClassName="w-full"
                        />
                      )}
                      <FieldError message={fieldState.error?.message} />
                    </div>
                  )}
                />

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
