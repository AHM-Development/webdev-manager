"use client";

import { useCallback } from "react";

import { realtimeEvents } from "@/libs/realtime/events";
import { useRealtimeEvent } from "@/hooks/use-realtime";

export type RealtimeNotification = {
  id: string;
  userId: string | null;
  audienceType: "user" | "role" | "workspace";
  audienceValue: string | null;
  type: string;
  title: string;
  message: string;
  actionUrl: string | null;
  metadata: unknown;
  readAt: string | null;
  createdAt: string;
};

export function useNotificationsSocket({
  onNotification,
}: {
  onNotification: (notification: RealtimeNotification) => void;
}) {
  const handleNotification = useCallback(
    (payload: { notification: RealtimeNotification }) => {
      onNotification(payload.notification);
    },
    [onNotification]
  );

  useRealtimeEvent(realtimeEvents.notificationCreated, handleNotification);
}
