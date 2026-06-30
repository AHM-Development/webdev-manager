"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3 } from "lucide-react";
import Link from "next/link";

import {
  listUserActivityLogs,
  listWebsiteActivityLogs,
  type UserActivityLog,
  type WebsiteActivityLog,
} from "@/libs/api/activity-logs";

type RecentLog =
  | (UserActivityLog & { group: "user" })
  | (WebsiteActivityLog & { group: "website" });

function logDetail(log: RecentLog) {
  if (log.description) return log.description;
  if (log.group === "website") {
    return [log.projectName, log.websiteName || log.websiteUrl].filter(Boolean).join(" / ");
  }
  return log.targetName || log.eventType;
}

function logSource(log: RecentLog) {
  if (log.group === "website") return log.websiteName || log.projectName || log.source;
  return log.name;
}

export function RecentActivityCard() {
  const [logs, setLogs] = useState<RecentLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.all([
      listWebsiteActivityLogs({ page: 1, pageSize: 4 }),
      listUserActivityLogs({ page: 1, pageSize: 4 }),
    ])
      .then(([website, user]) => {
        if (!active) return;
        setLogs([
          ...website.rows.map((log) => ({ ...log, group: "website" as const })),
          ...user.rows.map((log) => ({ ...log, group: "user" as const })),
        ]);
      })
      .catch(() => {
        if (active) setLogs([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const recent = useMemo(
    () =>
      logs
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 4),
    [logs]
  );

  return (
    <div className="app-panel p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Recent Activity</p>
          <p className="mt-1 text-sm text-slate-500">
            Latest user and website events.
          </p>
        </div>
        <Clock3 className="h-5 w-5 text-[#0b7de3]" />
      </div>
      <div className="mt-4 space-y-3">
        {loading && (
          <div className="rounded-2xl bg-[#f7f8fa] p-3 text-sm text-slate-500">
            Loading activity...
          </div>
        )}
        {!loading && recent.length === 0 && (
          <Link
            href="/dashboard/website-logs"
            className="block rounded-2xl bg-[#f7f8fa] p-3 text-sm font-medium text-slate-600 hover:bg-[#e8f5ff] hover:text-[#082a78]"
          >
            No activity yet. Open activity logs.
          </Link>
        )}
        {recent.map((log) => (
          <div key={`${log.group}-${log.id}`} className="rounded-2xl bg-[#f7f8fa] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">{log.action}</p>
                <p className="mt-1 text-sm text-slate-600">{logDetail(log)}</p>
              </div>
              <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-xs font-medium text-[#082a78]">
                {logSource(log)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
