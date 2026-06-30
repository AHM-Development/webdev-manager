export type AppUserRole = "Super Admin" | "Developer" | "Spectator";
export type AppUserStatus = "Active" | "Invited" | "Disabled";

export type AppUser = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  role: AppUserRole;
  status: AppUserStatus;
  createdAt: string;
  lastActiveAt: string | null;
};

export const USER_ROLES: AppUserRole[] = ["Super Admin", "Developer", "Spectator"];
export const INVITABLE_USER_ROLES: AppUserRole[] = ["Developer", "Spectator"];

export const roleColor: Record<
  AppUserRole,
  "danger" | "accent" | "default"
> = {
  "Super Admin": "danger",
  Developer: "accent",
  Spectator: "default",
};

export const statusColor: Record<
  AppUserStatus,
  "success" | "warning" | "default"
> = {
  Active: "success",
  Invited: "warning",
  Disabled: "default",
};
