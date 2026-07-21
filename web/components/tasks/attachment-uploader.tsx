"use client";

import { Loader2, Paperclip } from "lucide-react";
import { useRef, useState } from "react";

import { uploadTaskAttachment } from "@/libs/api/tasks";
import { notify } from "@/libs/notify";

import type { TaskAttachment } from "./data";

const ACCEPT =
  ".png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.zip";

export function AttachmentUploader({
  onAdd,
}: {
  onAdd: (attachment: TaskAttachment) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        try {
          onAdd(await uploadTaskAttachment(file));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed.";
          notify.error(`Couldn't attach ${file.name}`, { description: message });
        }
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Paperclip className="h-4 w-4" />
        )}
        {busy ? "Uploading..." : "Attach files"}
      </button>
    </>
  );
}
