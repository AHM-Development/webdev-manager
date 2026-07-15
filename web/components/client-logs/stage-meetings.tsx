"use client";

import { Button, Chip, Input, TextField } from "@heroui/react";
import { useEffect, useState } from "react";

import {
  addMeeting,
  confirmMeetingAction,
  listMeetings,
  rejectMeetingAction,
  type Meeting,
} from "@/libs/api/client-logs";
import { notify } from "@/libs/notify";

import { formatDate } from "./status";

const ACTION_COLOR: Record<string, "warning" | "success" | "default"> = {
  awaiting_confirmation: "warning",
  confirmed: "success",
  rejected: "default",
};

export function StageMeetings({ projectId, stageId, canEdit }: { projectId: string; stageId: string; canEdit: boolean }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fathomUrl, setFathomUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    listMeetings(projectId, stageId).then(setMeetings).catch(() => setMeetings([]));
  };

  const addManualMeeting = async () => {
    if (!fathomUrl.trim()) {
      notify.error("Paste a Fathom link");
      return;
    }
    setSaving(true);
    try {
      await addMeeting({ projectId, stageId, title: "Meeting", fathomUrl: fathomUrl.trim() });
      setFathomUrl("");
      load();
      notify.success("Meeting added");
    } catch (error) {
      notify.error("Unable to add meeting", { description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, stageId]);

  const confirm = async (actionId: string) => {
    setBusyId(actionId);
    try {
      const meeting = await confirmMeetingAction(actionId);
      setMeetings((current) => current.map((m) => (m.id === meeting.id ? meeting : m)));
      notify.success("Action confirmed — task created");
    } catch (error) {
      notify.error("Unable to confirm action", { description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (actionId: string) => {
    setBusyId(actionId);
    try {
      const meeting = await rejectMeetingAction(actionId);
      setMeetings((current) => current.map((m) => (m.id === meeting.id ? meeting : m)));
    } catch (error) {
      notify.error("Unable to reject action", { description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-950">Meetings</h3>

      {canEdit && (
        <div className="mb-3 flex items-center gap-2">
          <TextField aria-label="Fathom link" value={fathomUrl} onChange={setFathomUrl} className="flex-1">
            <Input placeholder="Paste a Fathom link…" />
          </TextField>
          <Button size="sm" variant="primary" isDisabled={saving || !fathomUrl.trim()} onPress={() => void addManualMeeting()}>
            {saving ? "Adding…" : "Add"}
          </Button>
        </div>
      )}

      {meetings.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 p-3 text-sm text-slate-400">
          No meetings linked to this stage yet. Add a Fathom link above, or summaries and action items arrive automatically from Fathom via n8n.
        </p>
      ) : (
        <ul className="space-y-3">
          {meetings.map((meeting) => (
            <li key={meeting.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-900">{meeting.title}</p>
                <span className="text-xs text-slate-400">{formatDate(meeting.meetingDate)}</span>
              </div>
              {meeting.summary && <p className="mt-1 text-xs text-slate-600">{meeting.summary}</p>}
              <div className="mt-1 flex flex-wrap gap-3">
                {meeting.fathomUrl && (
                  <a href={meeting.fathomUrl} target="_blank" rel="noreferrer" className="inline-block text-xs text-blue-600 hover:underline">
                    Watch on Fathom
                  </a>
                )}
                {meeting.recordingUrl && (
                  <a href={meeting.recordingUrl} target="_blank" rel="noreferrer" className="inline-block text-xs text-blue-600 hover:underline">
                    Recording
                  </a>
                )}
              </div>
              {meeting.actions.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {meeting.actions.map((action) => (
                    <li key={action.id} className="rounded border border-slate-100 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex-1 text-xs text-slate-800">
                          {action.title}
                          {action.priority === "Critical" && <Chip size="sm" variant="soft" color="danger" className="ml-1">Critical</Chip>}
                        </span>
                        <Chip size="sm" variant="soft" color={ACTION_COLOR[action.confirmationStatus] ?? "default"}>
                          {action.confirmationStatus.replace(/_/g, " ")}
                        </Chip>
                      </div>
                      {action.description && <p className="mt-1 text-[11px] text-slate-500">{action.description}</p>}
                      {canEdit && action.confirmationStatus === "awaiting_confirmation" && (
                        <div className="mt-1.5 flex gap-2">
                          <Button size="sm" variant="primary" isDisabled={busyId === action.id} onPress={() => void confirm(action.id)}>
                            Confirm → task
                          </Button>
                          <Button size="sm" variant="tertiary" isDisabled={busyId === action.id} onPress={() => void reject(action.id)}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
