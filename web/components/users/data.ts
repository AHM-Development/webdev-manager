export type AppUserRole = "Super Admin" | "Developer" | "Staff";
export type AppUserStatus = "Active" | "Invited" | "Disabled";

// Staff job titles (designations) — a label on Staff users, not a permission role.
export type StaffTitle =
  | "Client Success Manager"
  | "Designer"
  | "SEO"
  | "Operations";

export type AppUser = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  role: AppUserRole;
  title: StaffTitle | null;
  status: AppUserStatus;
  createdAt: string;
  lastActiveAt: string | null;
};

export const USER_ROLES: AppUserRole[] = [
  "Super Admin",
  "Developer",
  "Staff",
];
export const INVITABLE_USER_ROLES: AppUserRole[] = [
  "Developer",
  "Staff",
];

export const STAFF_TITLES: StaffTitle[] = [
  "Client Success Manager",
  "Designer",
  "SEO",
  "Operations",
];

export const roleColor: Record<
  AppUserRole,
  "danger" | "accent" | "default"
> = {
  "Super Admin": "danger",
  Developer: "accent",
  Staff: "default",
};

export const statusColor: Record<
  AppUserStatus,
  "success" | "warning" | "default"
> = {
  Active: "success",
  Invited: "warning",
  Disabled: "default",
};
