import type { RealtimeNotification } from "@/hooks/use-notifications-socket";

import { apiClient } from "./client";
import { endpoints } from "./endpoints";

export type NotificationChannel = "off" | "email" | "discord" | "both";

export type NotificationSettings = {
  taskAssignments: NotificationChannel;
  reviews: NotificationChannel;
  clientLogs: NotificationChannel;
  issues: NotificationChannel;
  security: NotificationChannel;
  healthAlerts: NotificationChannel;
  passwordAgeAlerts: NotificationChannel;
  dailyUserSummary: NotificationChannel;
  preShiftBriefing: NotificationChannel;
  weeklyDigest: NotificationChannel;
  inAppRealtimeEnabled: boolean;
  dailySummaryTime: string;
  preShiftBriefingTime: string;
  managerNotes: string;
  discordWebhookUrl: string;
  updatedAt: string;
};

export async function getNotificationSettings() {
  const { data } = await apiClient.get<{ settings: NotificationSettings }>(
    endpoints.notifications.settings
  );
  return data.settings;
}

export async function updateNotificationSettings(
  payload: Partial<NotificationSettings>
) {
  const { data } = await apiClient.patch<{ settings: NotificationSettings }>(
    endpoints.notifications.settings,
    payload
  );
  return data.settings;
}

export async function listNotifications() {
  const { data } = await apiClient.get<{ notifications: RealtimeNotification[] }>(
    endpoints.notifications.list
  );
  return data.notifications;
}

export async function getUnreadNotificationCount() {
  const { data } = await apiClient.get<{ count: number }>(
    endpoints.notifications.unreadCount
  );
  return data.count;
}

export async function markNotificationRead(notificationId: string) {
  const { data } = await apiClient.patch<{ notification: RealtimeNotification }>(
    endpoints.notifications.markRead(notificationId)
  );
  return data.notification;
}

export async function markAllNotificationsRead() {
  const { data } = await apiClient.patch<{ updated: number }>(endpoints.notifications.readAll);
  return data.updated;
}

export async function testNotification(channel: NotificationChannel = "off") {
  const { data } = await apiClient.post<{ notification: RealtimeNotification }>(
    endpoints.notifications.test,
    { channel }
  );
  return data.notification;
}

export type DiscordTestResult = {
  ok: boolean;
  delivered: boolean;
  reason?: string;
  message: string;
};

export async function testDiscordWebhook() {
  const { data } = await apiClient.post<DiscordTestResult>(
    endpoints.notifications.discordTest
  );
  return data;
}
