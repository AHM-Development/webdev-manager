"use client";

import { FileText, Link2, X } from "lucide-react";

import { assetUrl } from "@/libs/api/client";

import type { TaskAttachment } from "./data";

function isImage(url?: string) {
  return !!url && /\.(png|jpe?g|webp|gif)$/i.test(url.split("?")[0]);
}

export function AttachmentCard({
  attachment,
  onRemove,
}: {
  attachment: TaskAttachment;
  onRemove?: (attachment: TaskAttachment) => void;
}) {
  const image = attachment.type !== "link" && isImage(attachment.url);
  const label = attachment.type === "link" ? "Link" : "File";
  const href = attachment.url ? assetUrl(attachment.url) : undefined;

  return (
    <div className="relative aspect-square overflow-hidden rounded-md border border-slate-200 bg-white">
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${attachment.name}`}
          className="absolute right-2 top-2 z-10 rounded-full bg-white p-1 text-slate-500 shadow-sm hover:text-slate-900"
          onClick={() => onRemove(attachment)}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <a
        href={href}
        target={href ? "_blank" : undefined}
        rel={href ? "noreferrer" : undefined}
        className="flex h-full flex-col"
        onClick={(event) => {
          if (!href) event.preventDefault();
        }}
      >
        {image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={href}
              alt={attachment.name}
              className="min-h-0 w-full flex-1 object-cover"
            />
            <p className="truncate border-t border-slate-100 px-2 py-1.5 text-[11px] font-medium text-slate-700">
              {attachment.name}
            </p>
          </>
        ) : (
          <div className="flex h-full flex-col justify-between p-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#e8f5ff] text-[#0b7de3]">
              {attachment.type === "link" ? (
                <Link2 className="h-5 w-5" />
              ) : (
                <FileText className="h-5 w-5" />
              )}
            </div>
            <div>
              <p className="line-clamp-2 break-all text-xs font-semibold text-slate-800">
                {attachment.name}
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-400">
                {label}
              </p>
            </div>
          </div>
        )}
      </a>
    </div>
  );
}
