"use client";

import { Bell, LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthContext } from "@/libs/auth/auth-context";

const pageMeta = [
  { href: "/dashboard/projects", title: "Projects", eyebrow: "Client delivery" },
  {
    href: "/dashboard/website-health",
    title: "Website Health",
    eyebrow: "Scanning & audits",
  },
  { href: "/dashboard/my-tasks", title: "My Tasks", eyebrow: "Personal queue" },
  { href: "/dashboard/my-notes", title: "My Notes", eyebrow: "Personal notes" },
  { href: "/dashboard/tasks", title: "Tasks", eyebrow: "Delivery board" },
  { href: "/dashboard/issue-boards", title: "Issue Boards", eyebrow: "Fix queue" },
  {
    href: "/dashboard/website-users",
    title: "Website Users",
    eyebrow: "Credentials",
  },
  {
    href: "/dashboard/website-logs",
    title: "Activity Logs",
    eyebrow: "Audit trail",
  },
  { href: "/dashboard/tools", title: "Tools", eyebrow: "Utilities" },
  { href: "/dashboard/users", title: "Users", eyebrow: "Access control" },
  { href: "/dashboard/my-profile", title: "My Profile", eyebrow: "Account" },
  { href: "/dashboard/settings", title: "Settings", eyebrow: "Workspace" },
];

function currentPage(pathname: string) {
  if (pathname === "/dashboard") {
    return { title: "Dashboard", eyebrow: "Command center" };
  }
  return (
    pageMeta.find((item) => pathname.startsWith(item.href)) ?? {
      title: "Website Operations",
      eyebrow: "Command center",
    }
  );
}

export function Header() {
  const pathname = usePathname();
  const page = currentPage(pathname);
  const { user, logout } = useAuthContext();

  const initials =
    `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.toUpperCase() ||
    "AH";
  const role =
    user?.role === "superadmin"
      ? "Super Admin"
      : user?.role === "developer"
        ? "Developer"
        : user?.role === "spectator"
          ? "Spectator"
          : "Account";

  return (
    <header className="mb-0 border-l border-b flex h-16 shrink-0 items-center justify-between gap-4 bg-white px-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)] ring-1 ring-slate-200/70">
      <div className="flex min-w-0 flex-1 items-center gap-5">
        <div className="min-w-fit">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0b7de3]">
            {page.eyebrow}
          </p>
          <h1 className="mt-0.5 text-base font-semibold tracking-tight text-slate-950">
            {page.title}
          </h1>
        </div>
        {/* <div className="hidden h-10 min-w-0 flex-1 items-center gap-2 rounded-xl bg-[#f6f7f9] px-3 text-sm text-slate-500 ring-1 ring-slate-200/70 lg:flex">
          <Search className="h-4 w-4" />
          <span className="truncate">Search clients, tasks, audits, credentials...</span>
          <span className="ml-auto rounded-md bg-white px-1.5 py-0.5 text-[11px] text-slate-400">
            ⌘K
          </span>
        </div> */}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <Link
          href="/dashboard/tasks"
          className="hidden h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#24c7d5] via-[#0b7de3] to-[#082a78] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(11,125,227,0.22)] transition-colors hover:brightness-95 sm:inline-flex"
        >
          <Plus className="h-4 w-4" />
          Add Task
        </Link>
        <button
          type="button"
          aria-label="Notifications"
          className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-950"
        >
          <Bell className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Sign out"
          title="Sign out"
          onClick={() => void logout()}
          className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-950"
        >
          <LogOut className="h-4 w-4" />
        </button>
        <Link
          href="/dashboard/my-profile"
          className="flex h-10 items-center gap-3 rounded-xl bg-[#f6f7f9] px-2.5 hover:bg-slate-100"
        >
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#24c7d5] to-[#0b7de3] text-xs font-semibold text-white">
            {initials}
          </div>
          <div className="hidden leading-tight sm:block">
            <p className="text-xs font-semibold text-slate-950">
              {user?.name || "My Profile"}
            </p>
            <p className="text-[11px] text-slate-500">{role}</p>
          </div>
        </Link>
      </div>
    </header>
  );
}
