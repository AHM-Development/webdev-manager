export const realtimeEvents = {
  connected: "realtime.connected",
  notificationCreated: "notification.created",
  notificationRead: "notification.read",
  notificationUnreadCount: "notification.unread_count",
  taskChanged: "task.changed",
  healthScanStarted: "health.scan.started",
  healthScanProgress: "health.scan.progress",
  healthScanPageCompleted: "health.scan.page.completed",
  healthScanCompleted: "health.scan.completed",
  healthScanFailed: "health.scan.failed",
} as const;
