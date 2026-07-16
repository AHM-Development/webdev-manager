"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/libs/api/notifications";
import {
  useNotificationsSocket,
  type RealtimeNotification,
} from "@/hooks/use-notifications-socket";
import { notify } from "@/libs/notify";

type NotificationsContextValue = {
  notifications: RealtimeNotification[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Latest list, so callbacks can check read state without re-subscribing.
  const listRef = useRef<RealtimeNotification[]>([]);
  useEffect(() => {
    listRef.current = notifications;
  }, [notifications]);

  const refresh = useCallback(() => {
    Promise.all([
      listNotifications().catch(() => [] as RealtimeNotification[]),
      getUnreadNotificationCount().catch(() => 0),
    ])
      .then(([list, count]) => {
        setNotifications(list);
        setUnreadCount(count);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live: a new notification arrives over the socket. Update the list + badge and
  // pop a transient toast so it announces itself (only for genuinely new, unread
  // ones — the initial fetch does not go through here).
  const onNotification = useCallback((incoming: RealtimeNotification) => {
    const isNew = !listRef.current.some((n) => n.id === incoming.id);
    setNotifications((current) => [incoming, ...current.filter((n) => n.id !== incoming.id)].slice(0, 100));
    if (!incoming.readAt) {
      setUnreadCount((count) => count + 1);
      if (isNew) {
        notify.info(incoming.title, { description: incoming.message || undefined });
      }
    }
  }, []);
  useNotificationsSocket({ onNotification });

  const markRead = useCallback(async (id: string) => {
    const target = listRef.current.find((n) => n.id === id);
    if (!target || target.readAt) return;
    setNotifications((current) =>
      current.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      await markNotificationRead(id);
    } catch {
      refresh();
    }
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    setNotifications((current) =>
      current.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
    );
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch {
      refresh();
    }
  }, [refresh]);

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, loading, markRead, markAllRead, refresh }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
}
