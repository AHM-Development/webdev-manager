export type AppUserRole =
  | "Super Admin"
  | "Web Dev Manager"
  | "Developer"
  | "Designer"
  | "Client Success Manager"
  | "Spectator";
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

export const USER_ROLES: AppUserRole[] = [
  "Super Admin",
  "Web Dev Manager",
  "Developer",
  "Designer",
  "Client Success Manager",
  "Spectator",
];
export const INVITABLE_USER_ROLES: AppUserRole[] = [
  "Web Dev Manager",
  "Developer",
  "Designer",
  "Client Success Manager",
  "Spectator",
];

export const roleColor: Record<
  AppUserRole,
  "danger" | "accent" | "default"
> = {
  "Super Admin": "danger",
  "Web Dev Manager": "danger",
  Developer: "accent",
  Designer: "accent",
  "Client Success Manager": "accent",
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
