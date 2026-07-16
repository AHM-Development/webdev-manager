"use client";

import Link from "next/link";

import type { RealtimeNotification } from "@/hooks/use-notifications-socket";

function timeAgo(value: string) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

export function NotificationRow({
  notification,
  onRead,
  onNavigate,
  onSelect,
}: {
  notification: RealtimeNotification;
  onRead: (id: string) => void;
  onNavigate?: () => void;
  /** When provided, clicking opens this instead of navigating (used on the page). */
  onSelect?: (notification: RealtimeNotification) => void;
}) {
  const unread = !notification.readAt;

  const handleClick = () => {
    if (onSelect) {
      onSelect(notification);
      return;
    }
    if (unread) onRead(notification.id);
    onNavigate?.();
  };

  const inner = (
    <div className={`flex gap-3 px-4 py-3 ${unread ? "bg-[#f4f9ff]" : ""}`}>
      <span
        aria-hidden
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-[#0b7de3]" : "bg-transparent"}`}
      />
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${unread ? "font-semibold text-slate-950" : "font-medium text-slate-800"}`}>
          {notification.title}
        </p>
        {notification.message && (
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{notification.message}</p>
        )}
        <p className="mt-1 text-[11px] tabular-nums text-slate-400">{timeAgo(notification.createdAt)}</p>
      </div>
    </div>
  );

  if (onSelect) {
    return (
      <button type="button" onClick={handleClick} className="block w-full text-left hover:bg-slate-50">
        {inner}
      </button>
    );
  }

  const url = notification.actionUrl;
  if (url && url.startsWith("/")) {
    return (
      <Link href={url} onClick={handleClick} className="block hover:bg-slate-50">
        {inner}
      </Link>
    );
  }
  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" onClick={handleClick} className="block hover:bg-slate-50">
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={handleClick} className="block w-full text-left hover:bg-slate-50">
      {inner}
    </button>
  );
}
