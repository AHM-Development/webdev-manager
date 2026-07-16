"use client";

import {
  Button,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
  PaginationSummary,
  useOverlayState,
} from "@heroui/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { RealtimeNotification } from "@/hooks/use-notifications-socket";

import { NotificationDetailDrawer } from "./notification-detail-drawer";
import { NotificationRow } from "./notification-row";
import { useNotifications } from "./notifications-provider";

const FILTERS = ["all", "unread"] as const;
type Filter = (typeof FILTERS)[number];
const PAGE_SIZE = 12;

export function NotificationsView() {
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<RealtimeNotification | null>(null);
  const drawer = useOverlayState();
  const params = useSearchParams();
  const focusId = params.get("n");
  const handledFocusRef = useRef<string | null>(null);

  const shown = filter === "unread" ? notifications.filter((n) => !n.readAt) : notifications;
  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));

  // Keep the page in range as the filter or list changes.
  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const paged = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openDetail = (notification: RealtimeNotification) => {
    setSelected(notification);
    if (!notification.readAt) markRead(notification.id);
    drawer.open();
  };

  // Deep link from the bell (?n=<id>) opens that notification's drawer once loaded.
  useEffect(() => {
    if (!focusId || loading || handledFocusRef.current === focusId) return;
    const target = notifications.find((n) => n.id === focusId);
    if (!target) return;
    handledFocusRef.current = focusId;
    openDetail(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, loading, notifications]);

  return (
    <div className="space-y-4">
      <section className="app-toolbar flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Notifications</h1>
          <p className="mt-1 text-sm text-slate-600">
            {unreadCount ? `${unreadCount} unread` : "You're all caught up."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="app-tabbar flex gap-1">
            {FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setFilter(value);
                  setPage(1);
                }}
                className={`app-tab px-4 py-2 text-sm font-semibold capitalize ${
                  filter === value ? "app-tab-active" : "hover:bg-[#f4f7f6] hover:text-slate-950"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
          {unreadCount > 0 && (
            <Button size="sm" variant="secondary" onPress={() => void markAllRead()}>
              Mark all read
            </Button>
          )}
        </div>
      </section>

      <section className="app-panel overflow-hidden p-0">
        <div className="divide-y divide-slate-100">
          {loading ? (
            <p className="p-10 text-center text-sm text-slate-500">Loading…</p>
          ) : paged.length === 0 ? (
            <p className="p-10 text-center text-sm text-slate-400">
              {filter === "unread" ? "No unread notifications." : "No notifications yet."}
            </p>
          ) : (
            paged.map((notification) => (
              <NotificationRow key={notification.id} notification={notification} onRead={markRead} onSelect={openDetail} />
            ))
          )}
        </div>

        {shown.length > 0 && (
          <div className="border-t border-slate-100 p-3">
            <Pagination>
              <PaginationSummary>
                {`Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, shown.length)} of ${shown.length}`}
              </PaginationSummary>
              {totalPages > 1 && (
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious isDisabled={page === 1} onPress={() => setPage((p) => Math.max(1, p - 1))}>
                      Prev
                    </PaginationPrevious>
                  </PaginationItem>
                  <PaginationItem>
                    <span className="px-2 text-sm text-slate-500">
                      Page {page} of {totalPages}
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      isDisabled={page === totalPages}
                      onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </PaginationNext>
                  </PaginationItem>
                </PaginationContent>
              )}
            </Pagination>
          </div>
        )}
      </section>

      <NotificationDetailDrawer state={drawer} notification={selected} />
    </div>
  );
}
