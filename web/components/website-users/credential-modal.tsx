"use client";

import {
  Button,
  ComboBox,
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
  TextArea,
  TextField,
  type useOverlayState,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
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
  userId,
  onChange,
  users,
  invalid,
}: {
  value: string;
  userId: string;
  onChange: (name: string, userId: string) => void;
  users: { id: string; name: string; email: string }[];
  invalid?: boolean;
}) {
  return (
    <ComboBox
      aria-label="Name"
      allowsCustomValue
      menuTrigger="focus"
      inputValue={value}
      selectedKey={userId || null}
      isInvalid={invalid}
      // Typing = custom name, which clears the user link. Selecting an item is
      // handled by onSelectionChange; with a controlled inputValue, React Aria
      // does not fire this on selection, so the link is never clobbered.
      onInputChange={(text) => onChange(text, "")}
      onSelectionChange={(key) => {
        if (key == null) return;
        const picked = users.find((u) => u.id === String(key));
        if (picked) onChange(picked.name, picked.id);
      }}
      className="w-full"
    >
      <ComboBox.InputGroup>
        <Input
          className="w-full"
          placeholder="Select a user or type a custom name"
        />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <ComboBox.Popover>
        <ListBox>
          {users.map((u) => (
            <ListBoxItem
              key={u.id}
              id={u.id}
              textValue={`${u.name} ${u.email}`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm">{u.name}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{u.email}</p>
              </div>
            </ListBoxItem>
          ))}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
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
  options,
  onSave,
}: {
  state: ReturnType<typeof useOverlayState>;
  credential: Credential | null;
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
                        userId={form.watch("userId")}
                        onChange={(name, userId) => {
                          field.onChange(name);
                          form.setValue("userId", userId);
                        }}
                        users={options.users}
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
