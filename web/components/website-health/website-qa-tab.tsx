"use client";

import { Chip } from "@heroui/react";
import { useEffect, useState } from "react";

import {
  getWebsiteQaResults,
  type WebsiteQaResults,
  type WebsiteQaStatus,
} from "@/libs/api/website-health";

const STATUS_META: Record<
  "pass" | "fail" | "warning" | "na" | "none",
  { label: string; color: "success" | "danger" | "warning" | "default" }
> = {
  pass: { label: "Pass", color: "success" },
  fail: { label: "Fail", color: "danger" },
  warning: { label: "Warning", color: "warning" },
  na: { label: "N/A", color: "default" },
  none: { label: "Not checked", color: "default" },
};

function StatusChip({ status }: { status: WebsiteQaStatus | null }) {
  const meta = STATUS_META[status ?? "none"];
  return (
    <Chip size="sm" variant="soft" color={meta.color}>
      {meta.label}
    </Chip>
  );
}

export function WebsiteQaTab({ websiteId }: { websiteId?: string | null }) {
  const [data, setData] = useState<WebsiteQaResults | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!websiteId) return;
    let active = true;
    setLoading(true);
    getWebsiteQaResults(websiteId)
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [websiteId]);

  if (loading) return <p className="text-sm text-slate-400">Loading QA findings…</p>;
  if (!data || data.groups.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">
        No QA criteria configured yet. Add them in Settings → QA Criteria.
      </p>
    );
  }

  const { summary } = data;
  const checked = summary.total - summary.notChecked;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Chip size="sm" variant="soft" color="success">{summary.pass} pass</Chip>
        <Chip size="sm" variant="soft" color="danger">{summary.fail} fail</Chip>
        <Chip size="sm" variant="soft" color="warning">{summary.warning} warning</Chip>
        {summary.na > 0 && (
          <Chip size="sm" variant="soft" color="default">{summary.na} N/A</Chip>
        )}
        <span className="text-slate-400">
          {checked} of {summary.total} checked
          {summary.notChecked > 0 ? ` · ${summary.notChecked} not checked` : ""}
        </span>
      </div>

      {/* Grouped checklist */}
      {data.groups.map((group) => (
        <div key={group.id}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">{group.name}</h3>
            <span className="text-xs text-slate-400">
              {group.items.filter((item) => item.status === "pass").length}/
              {group.items.length}
            </span>
          </div>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {group.items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-slate-700">{item.text}</p>
                  {item.note && (
                    <p className="mt-0.5 text-xs text-slate-500">{item.note}</p>
                  )}
                </div>
                <div className="shrink-0 pt-0.5">
                  <StatusChip status={item.status} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
