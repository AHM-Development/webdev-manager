"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { assetUrl } from "@/libs/api/client";
import { uploadFormEvidence, type FormEvidence } from "@/libs/api/website-health";
import { notify } from "@/libs/notify";

export function ImageUploader({
  value,
  onChange,
  disabled = false,
}: {
  value: FormEvidence[];
  onChange: (next: FormEvidence[]) => void;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const addFiles = async (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;
    setUploading((count) => count + images.length);
    const uploaded: FormEvidence[] = [];
    await Promise.all(
      images.map(async (file) => {
        try {
          uploaded.push(await uploadFormEvidence(file));
        } catch (error) {
          notify.error("Upload failed", {
            description: error instanceof Error ? error.message : "Please try again.",
          });
        } finally {
          setUploading((count) => count - 1);
        }
      })
    );
    if (uploaded.length) onChange([...valueRef.current, ...uploaded]);
  };

  // Paste anywhere while the uploader is open (screenshots are copied, not saved).
  useEffect(() => {
    if (disabled) return;
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (files.length) {
        event.preventDefault();
        void addFiles(files);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const remove = (id: string) => onChange(value.filter((item) => item.id !== id));

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && !disabled) inputRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) void addFiles(Array.from(event.dataTransfer.files));
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-5 text-center transition-colors ${
          dragging ? "border-[#0b7de3] bg-[#f4f9ff]" : "border-slate-300 bg-slate-50 hover:bg-slate-100"
        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        <ImagePlus className="h-5 w-5 text-slate-400" />
        <p className="text-sm text-slate-600">
          <span className="font-medium text-[#0b7de3]">Click to upload</span>, drag &amp; drop, or paste a
          screenshot
        </p>
        <p className="text-[11px] text-slate-400">PNG, JPEG, WebP or GIF · up to 8&nbsp;MB</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(event) => {
          void addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />

      {(value.length > 0 || uploading > 0) && (
        <div className="flex flex-wrap gap-2">
          {value.map((item) => (
            <div key={item.id} className="group relative h-16 w-16 overflow-hidden rounded-md border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={assetUrl(item.url)} alt={item.name} className="h-full w-full object-cover" />
              {!disabled && (
                <button
                  type="button"
                  aria-label="Remove screenshot"
                  onClick={() => remove(item.id)}
                  className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {uploading > 0 && (
            <div className="grid h-16 w-16 place-items-center rounded-md border border-dashed border-slate-200 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
