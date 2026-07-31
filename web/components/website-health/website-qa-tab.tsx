"use client";

import { Chip } from "@heroui/react";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import {
  getWebsiteQaResults,
  type WebsiteQaItem,
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

function DetailBlock({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-600">{value}</p>
    </div>
  );
}

function QaItemRow({ item }: { item: WebsiteQaItem }) {
  const [open, setOpen] = useState(false);
  const hasDetails = !!(item.detail || item.checks || item.fix || item.note);
  // Fall back to `note` for the "why" block when `detail` wasn't provided.
  const why = item.detail || item.note;

  return (
    <li>
      <div className="flex items-start justify-between gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={() => hasDetails && setOpen((prev) => !prev)}
          className={`flex min-w-0 flex-1 items-start gap-2 text-left ${
            hasDetails ? "cursor-pointer" : "cursor-default"
          }`}
          aria-expanded={hasDetails ? open : undefined}
        >
          {hasDetails ? (
            <ChevronDown
              className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          ) : (
            <span className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span className="min-w-0 text-sm text-slate-700">{item.text}</span>
        </button>
        <div className="shrink-0 pt-0.5">
          <StatusChip status={item.status} />
        </div>
      </div>
      {hasDetails && open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-3 py-3 pl-9">
          <DetailBlock label="Why" value={why} />
          <DetailBlock label="Checks done" value={item.checks} />
          <DetailBlock label="Possible fix" value={item.fix} />
        </div>
      )}
    </li>
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
              <QaItemRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
