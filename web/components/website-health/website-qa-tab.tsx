"use client";

import { Chip } from "@heroui/react";
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

// Preview overlay: when no findings have been pushed yet, populate a realistic
// mix of pass/warning/fail with sample details so the display can be reviewed.
function applySampleFindings(data: WebsiteQaResults): WebsiteQaResults {
  const summary = { pass: 0, fail: 0, warning: 0, na: 0, notChecked: 0, total: data.summary.total };
  const groups = data.groups.map((group) => ({
    ...group,
    items: group.items.map((item, index) => {
      const status: WebsiteQaStatus =
        index % 5 === 3 ? "fail" : index % 5 === 1 ? "warning" : "pass";
      summary[status] += 1;
      if (status === "pass") {
        return { ...item, status, note: "", detail: "", checks: "", fix: "" };
      }
      return {
        ...item,
        status,
        note: "",
        detail: `"${item.text}" was flagged during the QA pass.`,
        checks: "Evaluated the relevant pages/elements against this criterion.",
        fix: "Correct the issue on the site and re-run the QA scan.",
      };
    }),
  }));
  return { groups, summary };
}

function QaItemRow({ item }: { item: WebsiteQaItem }) {
  // Match the Website Checklist row: title + status, then (for warning/fail) the
  // description and a "Possible fix:" line inline.
  const description = item.detail || item.note;
  const showDetails =
    (item.status === "fail" || item.status === "warning") && (description || item.fix);

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-sm text-slate-700">{item.text}</span>
        <div className="shrink-0">
          <StatusChip status={item.status} />
        </div>
      </div>
      {showDetails && (
        <div className="mt-1.5 space-y-1 border-l-2 border-slate-200 pl-3 text-sm">
          {description && <p className="text-slate-600">{description}</p>}
          {item.fix && (
            <p className="text-slate-600">
              <span className="font-semibold text-slate-700">Possible fix: </span>
              {item.fix}
            </p>
          )}
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

  // No findings pushed yet → show a sample-populated preview.
  const isSample = data.summary.notChecked === data.summary.total;
  const view = isSample ? applySampleFindings(data) : data;
  const { summary } = view;
  const checked = summary.total - summary.notChecked;

  return (
    <div className="space-y-6">
      {isSample && (
        <Chip size="sm" variant="soft" color="warning">
          Preview — sample data (populates once the AI pushes QA findings)
        </Chip>
      )}

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
      {view.groups.map((group) => (
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
