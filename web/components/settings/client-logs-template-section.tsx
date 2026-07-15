"use client";

import { Button, Input, TextField } from "@heroui/react";
import { Milestone } from "lucide-react";
import { useEffect, useState } from "react";

import { CheckboxField } from "@/components/client-logs/ui-fields";
import {
  addTemplateStage,
  listClientLogTemplates,
  removeTemplateStage,
  reorderTemplateStages,
  updateTemplateStage,
  type ClientLogTemplate,
  type TemplateStage,
} from "@/libs/api/client-logs";
import { notify } from "@/libs/notify";

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="app-panel rounded-xl p-5">
      <div className="mb-5 flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#e8f5ff] text-[#0b7de3]">
          <Milestone className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">Client Logs Template</h2>
          <p className="mt-1 text-sm text-gray-500">
            The base stage list that&apos;s duplicated to a client when you click <strong>Set up</strong>. Add, edit,
            reorder, or remove stages here. Changes only affect new set-ups — existing client timelines keep their own copy.
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function StageNameField({
  value,
  onSave,
}: {
  value: string;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(value);
  useEffect(() => setName(value), [value]);
  return (
    <TextField
      aria-label="Stage name"
      value={name}
      onChange={setName}
      onBlur={() => {
        if (name.trim() && name.trim() !== value) onSave(name.trim());
        else setName(value);
      }}
      className="min-w-[200px] flex-1"
    >
      <Input />
    </TextField>
  );
}

export function ClientLogsTemplateSection() {
  const [template, setTemplate] = useState<ClientLogTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    listClientLogTemplates()
      .then((templates) => setTemplate(templates.find((t) => t.isDefault) ?? templates[0] ?? null))
      .catch(() => setTemplate(null))
      .finally(() => setLoading(false));
  }, []);

  const guard = async (run: () => Promise<ClientLogTemplate>) => {
    try {
      setTemplate(await run());
    } catch (error) {
      notify.error("Unable to update template", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  if (loading) return <Panel><p className="text-sm text-gray-500">Loading template…</p></Panel>;
  if (!template) return <Panel><p className="text-sm text-gray-500">No Client Logs template found. Boot the API to seed the default.</p></Panel>;

  const stages = template.stages;
  const templateId = template.id;

  const move = (stage: TemplateStage, direction: "up" | "down") => {
    const index = stages.findIndex((s) => s.id === stage.id);
    const swap = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swap < 0 || swap >= stages.length) return;
    const order = [...stages];
    [order[index], order[swap]] = [order[swap], order[index]];
    void guard(() => reorderTemplateStages(templateId, order.map((s) => s.id)));
  };

  const add = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      setTemplate(await addTemplateStage(templateId, { name: newName.trim() }));
      setNewName("");
    } catch (error) {
      notify.error("Unable to add stage", { description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setAdding(false);
    }
  };

  return (
    <Panel>
      <ul className="space-y-2">
        {stages.map((stage, index) => (
          <li key={stage.id} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-2">
            <span className="w-6 text-xs tabular-nums text-slate-400">{index + 1}</span>
            <StageNameField value={stage.name} onSave={(name) => void guard(() => updateTemplateStage(templateId, stage.id, { name }))} />
            <CheckboxField isSelected={stage.isRequired} onChange={(v) => void guard(() => updateTemplateStage(templateId, stage.id, { isRequired: v }))} className="text-xs">Required</CheckboxField>
            <CheckboxField isSelected={stage.isMilestone} onChange={(v) => void guard(() => updateTemplateStage(templateId, stage.id, { isMilestone: v }))} className="text-xs">Milestone</CheckboxField>
            <CheckboxField isSelected={stage.isLaunchBlocker} onChange={(v) => void guard(() => updateTemplateStage(templateId, stage.id, { isLaunchBlocker: v }))} className="text-xs">Blocker</CheckboxField>
            <span className="ml-auto flex items-center gap-1">
              <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => move(stage, "up")} className="rounded border border-slate-200 px-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-30">↑</button>
              <button type="button" aria-label="Move down" disabled={index === stages.length - 1} onClick={() => move(stage, "down")} className="rounded border border-slate-200 px-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-30">↓</button>
              <button type="button" onClick={() => void guard(() => removeTemplateStage(templateId, stage.id))} className="rounded px-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50">Remove</button>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-2">
        <TextField aria-label="New stage name" value={newName} onChange={setNewName} className="flex-1">
          <Input placeholder="New stage name…" />
        </TextField>
        <Button size="sm" variant="primary" isDisabled={adding || !newName.trim()} onPress={() => void add()}>
          {adding ? "Adding…" : "Add stage"}
        </Button>
      </div>
    </Panel>
  );
}
