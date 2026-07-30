"use client";

import { Button } from "@heroui/react";
import {
  Copy,
  FileText,
  ListChecks,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { assetUrl } from "@/libs/api/client";
import {
  addQaItem,
  createQaGroup,
  deleteQaGroup,
  deleteQaItem,
  getQaCriteria,
  renameQaGroup,
  saveQaPrompt,
  updateQaItem,
  uploadQaTemplate,
  type QaCriteriaConfig,
} from "@/libs/api/qa-criteria";
import { notify } from "@/libs/notify";

const CRITERIA_API_URL = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/qa-criteria`;

function ReadOnlyRow({
  label,
  value,
  onCopy,
  right,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-slate-700">
          {value}
        </span>
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="shrink-0 text-slate-400 hover:text-slate-700"
            aria-label={`Copy ${label}`}
          >
            <Copy className="h-4 w-4" />
          </button>
        )}
        {right}
      </div>
    </div>
  );
}

export function QaCriteriaSection() {
  const [config, setConfig] = useState<QaCriteriaConfig | null>(null);
  const [prompt, setPrompt] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [newItem, setNewItem] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = (next: QaCriteriaConfig) => {
    setConfig(next);
    setPrompt(next.prompt);
  };

  useEffect(() => {
    getQaCriteria()
      .then(apply)
      .catch(() => notify.error("Couldn't load QA criteria"));
  }, []);

  const run = async (fn: () => Promise<QaCriteriaConfig>, errorMsg: string) => {
    setBusy(true);
    try {
      apply(await fn());
    } catch (err) {
      notify.error(errorMsg, {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const savePrompt = async () => {
    setSavingPrompt(true);
    try {
      apply(await saveQaPrompt(prompt));
      notify.success("Prompt saved");
    } catch (err) {
      notify.error("Couldn't save prompt", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSavingPrompt(false);
    }
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      apply(await uploadQaTemplate(file));
      notify.success("Template uploaded", { description: file.name });
    } catch (err) {
      notify.error("Couldn't upload template", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <section className="app-panel rounded-xl p-5">
      <div className="mb-5 flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#e8f5ff] text-[#0b7de3]">
          <ListChecks className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">QA Criteria</h2>
          <p className="mt-1 text-sm text-gray-500">
            The editable criteria an AI checks a website against, plus the prompt
            and report template to run a scan.
          </p>
        </div>
      </div>

      {!config ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-6">
          {/* Reference: criteria API + report template */}
          <div className="grid gap-4 md:grid-cols-2">
            <ReadOnlyRow
              label="Criteria API (GET)"
              value={CRITERIA_API_URL}
              onCopy={() => {
                void navigator.clipboard?.writeText(CRITERIA_API_URL);
                notify.success("Copied");
              }}
            />
            <ReadOnlyRow
              label="Report template"
              value={config.template ? config.template.name : "No template uploaded"}
              right={
                config.template ? (
                  <a
                    href={assetUrl(config.template.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-[#0b7de3] hover:underline"
                    aria-label="Open template"
                  >
                    <FileText className="h-4 w-4" />
                  </a>
                ) : undefined
              }
            />
          </div>

          {/* Prompt + template upload */}
          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                AI scan prompt
              </label>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={6}
                className="w-full resize-y rounded-md border border-slate-200 p-3 font-mono text-sm outline-none focus:border-[#0b7de3]"
                placeholder="Paste the prompt an AI should use to run the scan…"
              />
              <p className="mt-1 text-xs text-slate-400">
                Placeholders you can use: <code>{"{{apiUrl}}"}</code>,{" "}
                <code>{"{{token}}"}</code>, <code>{"{{websiteUrl}}"}</code>.
              </p>
              <Button
                variant="primary"
                size="sm"
                className="mt-2"
                isDisabled={savingPrompt}
                onPress={() => void savePrompt()}
              >
                {savingPrompt ? "Saving…" : "Save prompt"}
              </Button>
            </div>

            <div className="md:w-56">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Document template
              </label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={(event) => void onUpload(event.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 hover:border-[#0b7de3] hover:text-[#0b7de3] disabled:opacity-60"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Upload className="h-5 w-5" />
                )}
                {uploading ? "Uploading…" : "Upload PDF / Word"}
              </button>
            </div>
          </div>

          {/* Grouped checklists */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Criteria groups</h3>
            {config.groups.map((group) => (
              <div key={group.id} className="rounded-lg border border-slate-200 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <input
                    defaultValue={group.name}
                    onBlur={(event) => {
                      const name = event.target.value.trim();
                      if (name && name !== group.name) {
                        void run(() => renameQaGroup(group.id, name), "Couldn't rename group");
                      }
                    }}
                    className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-sm font-semibold text-slate-900 hover:border-slate-200 focus:border-[#0b7de3] focus:outline-none"
                    aria-label="Group name"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete the "${group.name}" group and its criteria?`)) {
                        void run(() => deleteQaGroup(group.id), "Couldn't delete group");
                      }
                    }}
                    className="shrink-0 text-slate-400 hover:text-red-600"
                    aria-label="Delete group"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <ul className="space-y-1.5">
                  {group.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                      <input
                        defaultValue={item.text}
                        onBlur={(event) => {
                          const text = event.target.value.trim();
                          if (text && text !== item.text) {
                            void run(() => updateQaItem(item.id, text), "Couldn't update criterion");
                          }
                        }}
                        className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-sm text-slate-700 hover:border-slate-200 focus:border-[#0b7de3] focus:outline-none"
                        aria-label="Criterion"
                      />
                      <button
                        type="button"
                        onClick={() => void run(() => deleteQaItem(item.id), "Couldn't delete criterion")}
                        className="shrink-0 text-slate-300 hover:text-red-600"
                        aria-label="Delete criterion"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="mt-2 flex items-center gap-2 pl-3.5">
                  <input
                    value={newItem[group.id] ?? ""}
                    onChange={(event) =>
                      setNewItem((prev) => ({ ...prev, [group.id]: event.target.value }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        const text = (newItem[group.id] ?? "").trim();
                        if (text) {
                          void run(() => addQaItem(group.id, text), "Couldn't add criterion");
                          setNewItem((prev) => ({ ...prev, [group.id]: "" }));
                        }
                      }
                    }}
                    placeholder="Add a criterion…"
                    className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm outline-none focus:border-[#0b7de3]"
                  />
                  <Button
                    size="sm"
                    variant="tertiary"
                    isDisabled={busy || !(newItem[group.id] ?? "").trim()}
                    onPress={() => {
                      const text = (newItem[group.id] ?? "").trim();
                      if (text) {
                        void run(() => addQaItem(group.id, text), "Couldn't add criterion");
                        setNewItem((prev) => ({ ...prev, [group.id]: "" }));
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
              </div>
            ))}

            {/* Add group */}
            <div className="flex items-center gap-2">
              <input
                value={newGroup}
                onChange={(event) => setNewGroup(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && newGroup.trim()) {
                    void run(() => createQaGroup(newGroup.trim()), "Couldn't add group");
                    setNewGroup("");
                  }
                }}
                placeholder="New group name…"
                className="w-64 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0b7de3]"
              />
              <Button
                variant="secondary"
                size="sm"
                isDisabled={busy || !newGroup.trim()}
                onPress={() => {
                  if (newGroup.trim()) {
                    void run(() => createQaGroup(newGroup.trim()), "Couldn't add group");
                    setNewGroup("");
                  }
                }}
              >
                <Plus className="h-4 w-4" />
                Add group
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
