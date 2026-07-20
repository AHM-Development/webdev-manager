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

function UserNameCombobox({
  value,
  onChange,
  onBlur,
  users,
  names,
  invalid,
}: {
  value: string;
  onChange: (name: string, userId: string) => void;
  onBlur: () => void;
  users: { id: string; name: string; email: string }[];
  names: string[];
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();

  const userMatches = users.filter(
    (u) =>
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
  );
  // Custom names already saved that don't belong to a registered user.
  const userNameSet = new Set(users.map((u) => u.name.toLowerCase()));
  const customMatches = names.filter(
    (n) =>
      !userNameSet.has(n.toLowerCase()) &&
      n.toLowerCase().includes(q) &&
      n.toLowerCase() !== q
  );
  const hasSuggestions = userMatches.length > 0 || customMatches.length > 0;

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value, ""); // typing = custom, clears the user link
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          onBlur();
          setTimeout(() => setOpen(false), 120);
        }}
        placeholder="Select a user or type a custom name"
        className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-blue-500 ${
          invalid ? "border-red-400" : "border-gray-200"
        }`}
      />
      {open && hasSuggestions && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-md">
          {userMatches.map((u) => (
            <li key={`u-${u.id}`}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(u.name, u.id);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left hover:bg-gray-50"
              >
                <span className="block text-sm text-gray-800">{u.name}</span>
                <span className="block text-xs text-gray-500">{u.email}</span>
              </button>
            </li>
          ))}
          {customMatches.length > 0 && userMatches.length > 0 && (
            <li
              aria-hidden
              className="border-t border-gray-100 px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-gray-400"
            >
              Custom names
            </li>
          )}
          {customMatches.map((n) => (
            <li key={`n-${n}`}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(n, "");
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
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
    userId: credential?.userId ?? "",
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
        userId: values.userId || undefined,
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
                      <UserNameCombobox
                        value={field.value}
                        onChange={(name, userId) => {
                          field.onChange(name);
                          form.setValue("userId", userId);
                        }}
                        onBlur={field.onBlur}
                        users={options.users}
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
