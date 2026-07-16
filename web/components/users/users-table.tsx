"use client";

import {
  Button,
  Chip,
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
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TextField,
  useOverlayState,
} from "@heroui/react";
import { Copy, Eye, KeyRound, MailPlus, Pencil, Search, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  roleColor,
  statusColor,
  USER_ROLES,
  INVITABLE_USER_ROLES,
  type AppUser,
  type AppUserRole,
  type AppUserStatus,
} from "./data";
import {
  createUserInvite,
  deleteUser,
  listUsers,
  sendUserResetLink,
  updateUser,
  type ApiUser,
} from "@/libs/api/users";
import { notify } from "@/libs/notify";
import { SearchableFilter } from "@/components/ui/searchable-filter";

const STATUS_OPTIONS: AppUserStatus[] = ["Active", "Invited", "Disabled"];
const ALL = "all";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function emptyInvitedUser(): AppUser {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: `u-${Date.now()}`,
    name: "",
    firstName: "",
    lastName: "",
    email: "",
    role: "Developer",
    status: "Invited",
    createdAt: today,
    lastActiveAt: today,
  };
}

const roleToApi: Record<AppUserRole, ApiUser["role"]> = {
  "Super Admin": "superadmin",
  "Web Dev Manager": "web_dev_manager",
  Developer: "developer",
  Designer: "designer",
  "Client Success Manager": "client_success_manager",
  Spectator: "spectator",
};

const roleFromApi: Record<ApiUser["role"], AppUserRole> = {
  superadmin: "Super Admin",
  web_dev_manager: "Web Dev Manager",
  developer: "Developer",
  designer: "Designer",
  client_success_manager: "Client Success Manager",
  spectator: "Spectator",
};

const statusToApi: Record<AppUserStatus, ApiUser["status"]> = {
  Active: "active",
  Invited: "invited",
  Disabled: "disabled",
};

const statusFromApi: Record<ApiUser["status"], AppUserStatus> = {
  active: "Active",
  invited: "Invited",
  disabled: "Disabled",
};

function mapApiUser(user: ApiUser): AppUser {
  const firstName = user.firstName ?? "";
  const lastName = user.lastName ?? "";
  return {
    id: user.id,
    name: user.name || [firstName, lastName].filter(Boolean).join(" "),
    firstName,
    lastName,
    email: user.email,
    role: roleFromApi[user.role],
    status: statusFromApi[user.status],
    createdAt: user.createdAt,
    lastActiveAt: user.lastLoginAt,
  };
}

function InviteUserModal({
  state,
  onInvite,
}: {
  state: ReturnType<typeof useOverlayState>;
  onInvite: (user: AppUser) => Promise<string>;
}) {
  const [draft, setDraft] = useState<AppUser>(() => emptyInvitedUser());
  const [showErrors, setShowErrors] = useState(false);
  const [inviteLink, setInviteLink] = useState("");

  const set = <K extends keyof AppUser>(key: K, value: AppUser[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const valid = draft.name.trim() && draft.email.trim().includes("@");

  const sendInvite = async () => {
    if (!valid) {
      setShowErrors(true);
      return;
    }
    const invitedUser = {
      ...draft,
      name: draft.name.trim(),
      email: draft.email.trim(),
      status: "Invited" as AppUserStatus,
    };
    const url = await onInvite(invitedUser);
    setInviteLink(url);
  };

  return (
    <Modal isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <ModalBackdrop>
        <ModalContainer placement="center" size="md">
          <ModalDialog>
            <ModalHeader>
              <ModalHeading className="text-lg font-semibold">
                Invite New User
              </ModalHeading>
            </ModalHeader>
            <ModalBody className="space-y-4">
              <TextField
                aria-label="Name"
                value={draft.name}
                onChange={(value) => {
                  const parts = value.trim().split(/\s+/);
                  setDraft((current) => ({
                    ...current,
                    name: value,
                    firstName: parts[0] || "",
                    lastName: parts.slice(1).join(" "),
                  }));
                }}
                isInvalid={showErrors && !draft.name.trim()}
              >
                <Label>Name</Label>
                <Input className="w-full" placeholder="Full name" />
                {showErrors && !draft.name.trim() && (
                  <p className="mt-1 text-sm text-red-600">Name is required.</p>
                )}
              </TextField>

              <TextField
                aria-label="Email"
                value={draft.email}
                onChange={(value) => set("email", value)}
                isInvalid={showErrors && !draft.email.trim().includes("@")}
                type="email"
              >
                <Label>Email</Label>
                <Input className="w-full" placeholder="name@example.com" />
                {showErrors && !draft.email.trim().includes("@") && (
                  <p className="mt-1 text-sm text-red-600">
                    Enter a valid email.
                  </p>
                )}
              </TextField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormSelect
                  label="Role"
                  value={draft.role}
                  onChange={(value) => set("role", value as AppUserRole)}
                  options={INVITABLE_USER_ROLES}
                />
                <FormSelect
                  label="Status"
                  value={draft.status}
                  onChange={(value) => set("status", value as AppUserStatus)}
                  options={["Invited"]}
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-[#f7f8fa] p-4">
                <div className="flex items-start gap-3">
                  <MailPlus className="mt-0.5 h-5 w-5 text-[#0b7de3]" />
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      Invite email preview
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      The user will receive a secure invite link to complete
                      their profile, set password, and confirm account access.
                    </p>
                  </div>
                </div>
                {inviteLink && (
                  <div className="mt-3 flex gap-2 rounded-xl bg-white p-2 ring-1 ring-slate-200">
                    <input
                      readOnly
                      value={inviteLink}
                      className="min-w-0 flex-1 bg-transparent px-2 text-sm text-slate-700 outline-none"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="tertiary"
                      onPress={() => navigator.clipboard.writeText(inviteLink)}
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </Button>
                  </div>
                )}
              </div>
            </ModalBody>
            <ModalFooter className="flex justify-end gap-2">
              <Button type="button" variant="tertiary" onPress={state.close}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onPress={sendInvite}>
                <Send className="h-4 w-4" />
                Send Invite
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

function FormSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <Select
        aria-label={label}
        selectedKey={value}
        onSelectionChange={(key) => onChange(String(key))}
      >
        <SelectTrigger className="w-full">
          <SelectValue>{value}</SelectValue>
          <SelectIndicator />
        </SelectTrigger>
        <SelectPopover>
          <ListBox>
            {options.map((option) => (
              <ListBoxItem key={option} id={option}>
                {option}
              </ListBoxItem>
            ))}
          </ListBox>
        </SelectPopover>
      </Select>
    </div>
  );
}

export function UsersTable() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const inviteModal = useOverlayState();
  const editModal = useOverlayState();

  useEffect(() => {
    let active = true;
    listUsers()
      .then((result) => {
        if (active) setUsers(result.map(mapApiUser));
      })
      .catch((err) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Unable to load users.";
        setError(message);
        notify.error("Unable to load users", { description: message });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = users.filter((user) => {
    const q = query.trim().toLowerCase();
    const matchesSearch =
      !q ||
      [user.name, user.email, user.role, user.status]
        .join(" ")
        .toLowerCase()
        .includes(q);

    return (
      matchesSearch &&
      (roleFilter === ALL || user.role === roleFilter) &&
      (statusFilter === ALL || user.status === statusFilter)
    );
  });

  const openAdd = () => {
    inviteModal.open();
  };

  const openEdit = (user: AppUser) => {
    setEditing(user);
    editModal.open();
  };

  const handleInvite = async (user: AppUser) => {
    const [firstName, ...rest] = user.name.trim().split(/\s+/);
    const result = await createUserInvite({
      firstName: user.firstName || firstName || user.email,
      lastName: user.lastName || rest.join(" ") || "User",
      email: user.email,
      role: roleToApi[user.role],
    });
    setUsers((current) => [mapApiUser(result.user), ...current]);
    notify.success("Invite created", {
      description: `Invite link is ready for ${user.email}.`,
    });
    return result.invite.inviteUrl;
  };

  const handleSave = async (user: AppUser) => {
    const updated = await updateUser(user.id, {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: roleToApi[user.role],
      status: statusToApi[user.status],
    });
    setUsers((current) =>
      current.map((item) => (item.id === user.id ? mapApiUser(updated) : item))
    );
    notify.success("User updated", { description: user.email });
  };

  const handleDelete = async (id: string) => {
    await deleteUser(id);
    setUsers((current) => current.filter((user) => user.id !== id));
    notify.success("User deleted");
  };

  const [resettingId, setResettingId] = useState<string | null>(null);
  const handleSendResetLink = async (user: AppUser) => {
    setResettingId(user.id);
    try {
      const delivered = await sendUserResetLink(user.id);
      notify.success("Reset link sent", {
        description: delivered
          ? `A password reset link was emailed to ${user.email}.`
          : `Reset link generated for ${user.email}, but email delivery isn't configured.`,
      });
    } catch (err) {
      notify.error("Could not send reset link", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setResettingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="mt-1 text-sm text-gray-500">
            Invite users, manage roles, and review account access.
          </p>
        </div>
        <Button variant="primary" onPress={openAdd}>
          <MailPlus className="h-4 w-4" />
          Invite User
        </Button>
      </div>

      <div className="app-toolbar flex items-center gap-2 overflow-x-auto p-3">
        <div className="relative w-64 shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            aria-label="Search users"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, role..."
            className="w-full pl-9"
          />
        </div>
        <FilterSelect
          label="Role"
          value={roleFilter}
          placeholder="All roles"
          onChange={setRoleFilter}
          options={USER_ROLES}
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          placeholder="All statuses"
          onChange={setStatusFilter}
          options={STATUS_OPTIONS}
        />
        <span className="text-sm text-gray-400">
          {filtered.length} user{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="app-table-shell overflow-x-auto">
        {error && <span className="sr-only">{error}</span>}
        <Table aria-label="Users">
          <TableContent className="w-full min-w-[840px] table-fixed">
            <TableHeader>
              <TableColumn id="name" isRowHeader className="w-[24%]">
                Name
              </TableColumn>
              <TableColumn id="email" className="w-[25%]">
                Email
              </TableColumn>
              <TableColumn id="role" className="w-[15%]">
                Role
              </TableColumn>
              <TableColumn id="status" className="w-[13%]">
                Status
              </TableColumn>
              <TableColumn id="created" className="w-[12%]">
                Created
              </TableColumn>
              <TableColumn id="action" className="w-[11%]">
                Action
              </TableColumn>
            </TableHeader>
            <TableBody
              renderEmptyState={() => (
                <div className="py-10 text-center text-sm text-gray-500">
                  No users match your search.
                  {loading ? " Loading..." : ""}
                </div>
              )}
            >
              {filtered.map((user) => (
                <TableRow key={user.id} id={user.id}>
                  <TableCell>
                    <span className="font-medium text-gray-900">
                      {user.name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-700">{user.email}</span>
                  </TableCell>
                  <TableCell>
                    <Chip size="sm" variant="soft" color={roleColor[user.role]}>
                      {user.role}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={statusColor[user.status]}
                    >
                      {user.status}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-700">
                      {formatDate(user.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        aria-label={`Edit or view ${user.name}`}
                        onPress={() => openEdit(user)}
                      >
                        {user.role === "Spectator" ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <Pencil className="h-4 w-4" />
                        )}
                      </Button>
                      {user.status === "Active" && (
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          aria-label={`Send password reset link to ${user.name}`}
                          onPress={() => handleSendResetLink(user)}
                          isDisabled={resettingId === user.id}
                        >
                          <KeyRound className="h-4 w-4 text-slate-500" />
                        </Button>
                      )}
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${user.name}`}
                        onPress={() => handleDelete(user.id)}
                        isDisabled={user.role === "Super Admin"}
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

      <InviteUserModal key={inviteModal.isOpen ? "invite-open" : "invite-closed"} state={inviteModal} onInvite={handleInvite} />
      <UserModal key={`${editing?.id ?? "none"}-${editModal.isOpen}`} state={editModal} user={editing} onSave={handleSave} />
    </div>
  );
}

function UserModal({
  state,
  user,
  onSave,
}: {
  state: ReturnType<typeof useOverlayState>;
  user: AppUser | null;
  onSave: (user: AppUser) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AppUser>(() => user ?? emptyInvitedUser());

  const set = <K extends keyof AppUser>(key: K, value: AppUser[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  if (!user) return null;

  return (
    <Modal isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <ModalBackdrop>
        <ModalContainer placement="center" size="md">
          <ModalDialog>
            <ModalHeader>
              <ModalHeading className="text-lg font-semibold">
                Edit User
              </ModalHeading>
            </ModalHeader>
            <ModalBody className="space-y-4">
              <TextField
                value={draft.name}
                onChange={(value) => {
                  const parts = value.trim().split(/\s+/);
                  setDraft((current) => ({
                    ...current,
                    name: value,
                    firstName: parts[0] || "",
                    lastName: parts.slice(1).join(" "),
                  }));
                }}
              >
                <Label>Name</Label>
                <Input className="w-full" />
              </TextField>
              <TextField value={draft.email} onChange={(value) => set("email", value)}>
                <Label>Email</Label>
                <Input className="w-full" />
              </TextField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormSelect
                  label="Role"
                  value={draft.role}
                  onChange={(value) => set("role", value as AppUserRole)}
                  options={user.role === "Super Admin" ? ["Super Admin"] : INVITABLE_USER_ROLES}
                />
                <FormSelect
                  label="Status"
                  value={draft.status}
                  onChange={(value) => set("status", value as AppUserStatus)}
                  options={user.role === "Super Admin" ? ["Active"] : STATUS_OPTIONS}
                />
              </div>
            </ModalBody>
            <ModalFooter className="flex justify-end gap-2">
              <Button type="button" variant="tertiary" onPress={state.close}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onPress={async () => {
                  await onSave(draft);
                  state.close();
                }}
              >
                Save Changes
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

function FilterSelect({
  label,
  value,
  placeholder,
  onChange,
  options,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <SearchableFilter
      ariaLabel={`Filter by ${label.toLowerCase()}`}
      value={value}
      onChange={onChange}
      options={[
        { key: ALL, label: placeholder },
        ...options.map((option) => ({ key: option, label: option })),
      ]}
      placeholder={placeholder}
      triggerClassName="w-40"
    />
  );
}
