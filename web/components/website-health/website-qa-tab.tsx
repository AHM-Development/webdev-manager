"use client";

import { Button, Chip } from "@heroui/react";
import { Copy, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  generateQaToken,
  getQaRunner,
  getWebsiteQaResults,
  revokeQaToken,
  type QaRunner,
  type WebsiteQaItem,
  type WebsiteQaResults,
  type WebsiteQaStatus,
} from "@/libs/api/website-health";
import { useAuth } from "@/libs/hooks/useAuth";
import { notify } from "@/libs/notify";

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

function QaResults({ websiteId }: { websiteId?: string | null }) {
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

function formatDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

// Super-Admin / Developer panel: a per-website push token and the ready-to-paste
// prompt an external Claude uses to run QA and push findings back to this site.
function QaRunnerPanel({ websiteId }: { websiteId?: string | null }) {
  const [runner, setRunner] = useState<QaRunner | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!websiteId) return;
    let active = true;
    setLoading(true);
    getQaRunner(websiteId)
      .then((result) => active && setRunner(result))
      .catch(() => active && setRunner(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [websiteId]);

  if (!websiteId || loading) return null;

  const copy = async (text: string | null, label: string) => {
    if (!text) return;
    try {
      await navigator.clipboard?.writeText(text);
      notify.success(`${label} copied`);
    } catch {
      notify.error(`Unable to copy ${label.toLowerCase()}`);
    }
  };

  const generate = async () => {
    setBusy(true);
    try {
      setRunner(await generateQaToken(websiteId));
      notify.success(runner?.hasToken ? "QA token regenerated" : "QA token generated");
    } catch (err) {
      notify.error("Unable to generate token", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      setRunner(await revokeQaToken(websiteId));
      notify.success("QA token revoked");
    } catch (err) {
      notify.error("Unable to revoke token", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <div>
            <p className="text-sm font-semibold text-slate-800">QA Runner</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {runner?.hasToken
                ? "Copy the prompt and paste it into Claude — it reviews the site and pushes findings back here."
                : "Generate a token to get a ready-to-paste prompt for the external Claude QA run."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {runner?.hasToken && (
            <Button
              size="sm"
              variant="primary"
              isDisabled={busy}
              onPress={() => copy(runner.prompt, "Prompt")}
            >
              <Copy className="h-4 w-4" />
              Copy prompt
            </Button>
          )}
          <Button size="sm" variant="tertiary" isDisabled={busy} onPress={generate}>
            <RefreshCw className="h-4 w-4" />
            {runner?.hasToken ? "Regenerate" : "Generate token"}
          </Button>
          {runner?.hasToken && (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label="Revoke QA token"
              isDisabled={busy}
              onPress={revoke}
            >
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          )}
        </div>
      </div>

      {runner?.hasToken && (
        <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Token</span>
            <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 font-mono text-xs text-slate-700 ring-1 ring-slate-200">
              {runner.token}
            </code>
            <button
              type="button"
              onClick={() => copy(runner.token, "Token")}
              className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-200"
              aria-label="Copy token"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Regenerating replaces this token — any previously copied prompt stops working.
            {runner.createdAt ? ` Created ${formatDate(runner.createdAt)}.` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

export function WebsiteQaTab({ websiteId }: { websiteId?: string | null }) {
  const { user } = useAuth();
  const canManage = user?.role === "superadmin" || user?.role === "developer";

  return (
    <div className="space-y-6">
      {canManage && <QaRunnerPanel websiteId={websiteId} />}
      <QaResults websiteId={websiteId} />
    </div>
  );
}
