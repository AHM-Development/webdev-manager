"use client";

import {
  Activity,
  Bug,
  ClipboardList,
  FolderKanban,
  Milestone,
  LayoutDashboard,
  ListChecks,
  Settings,
  StickyNote,
  UserCog,
  Users,
  UserCircle,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuthContext } from "@/libs/auth/auth-context";
import type { ApiUser } from "@/libs/api/users";

type Role = ApiUser["role"];

const navGroups: {
  label: string;
  items: { label: string; href: string; icon: LucideIcon; roles?: Role[] }[];
}[] = [
  {
    label: "Command",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Projects", href: "/dashboard/projects", icon: FolderKanban },
      { label: "Client Logs", href: "/dashboard/client-logs", icon: Milestone },
      { label: "Website Health", href: "/dashboard/website-health", icon: Activity },
    ],
  },
  {
    label: "Work",
    items: [
      { label: "My Tasks", href: "/dashboard/my-tasks", icon: ClipboardList },
      { label: "My Notes", href: "/dashboard/my-notes", icon: StickyNote },
      { label: "Tasks", href: "/dashboard/tasks", icon: ListChecks },
      { label: "Issue Boards", href: "/dashboard/issue-boards", icon: Bug },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Website Users", href: "/dashboard/website-users", icon: UserCog, roles: ["superadmin", "developer"] },
      { label: "Activity Logs", href: "/dashboard/website-logs", icon: Activity, roles: ["superadmin", "developer"] },
      { label: "Tools", href: "/dashboard/tools", icon: Wrench },
      { label: "Users", href: "/dashboard/users", icon: Users, roles: ["superadmin"] },
      { label: "My Profile", href: "/dashboard/my-profile", icon: UserCircle },
      { label: "Settings", href: "/dashboard/settings", icon: Settings, roles: ["superadmin"] },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthContext();

  return (
    <aside className="hidden w-[270px] shrink-0 bg-white text-slate-950 ring-1 ring-slate-200/60 lg:flex lg:flex-col">
      <div className="flex h-20 shrink-0 items-center gap-3 px-5">
        <div className="flex h-11 w-14 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <Image
            src="/ahm-logo.png"
            alt="AHM"
            width={56}
            height={32}
            className="h-8 w-auto object-contain"
          />
        </div>
        <div className="min-w-0">
          <span className="block text-sm font-semibold tracking-wide">
            AHM Web Manager
          </span>
          <span className="block text-xs text-slate-500">
            Website operations suite
          </span>
        </div>
      </div>

      <nav className="premium-scrollbar flex-1 space-y-5 overflow-y-auto px-4 py-3">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {group.label}
            </p>
            <div className="mt-2 space-y-1">
              {group.items.filter((item) => !item.roles || (user && item.roles.includes(user.role))).map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-gradient-to-r from-[#24c7d5] via-[#0b7de3] to-[#082a78] text-white shadow-lg shadow-blue-500/20"
                        : "text-slate-600 hover:bg-[#f4f7f6] hover:text-slate-950"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isActive ? "text-white" : "text-slate-400"
                      }`}
                    />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
