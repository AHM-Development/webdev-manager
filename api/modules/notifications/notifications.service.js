var db = require('../../db/pool');
var security = require('../../lib/security');
var activity = require('../auth/activity.service');
var bus = require('./notification-bus');

var CHANNELS = ['off', 'email', 'discord', 'both'];

function safeChannel(value, fallback) {
  return CHANNELS.indexOf(value) === -1 ? fallback : value;
}

function mapSettings(row) {
  return {
    taskAssignments: row.task_assignments_channel,
    healthAlerts: row.health_alerts_channel,
    passwordAgeAlerts: row.password_age_alerts_channel,
    dailyUserSummary: row.daily_user_summary_channel,
    preShiftBriefing: row.pre_shift_briefing_channel,
    weeklyDigest: row.weekly_digest_channel,
    inAppRealtimeEnabled: !!row.in_app_realtime_enabled,
    dailySummaryTime: String(row.daily_summary_time || '18:00:00').slice(0, 5),
    preShiftBriefingTime: String(row.pre_shift_briefing_time || '08:30:00').slice(0, 5),
    managerNotes: row.manager_notes || '',
    discordWebhookUrl: row.discord_webhook_url || '',
    updatedAt: row.updated_at,
  };
}

function mapNotification(row) {
  return {
    id: row.id,
    userId: row.user_id ? String(row.user_id) : null,
    audienceType: row.audience_type,
    audienceValue: row.audience_value,
    type: row.type,
    title: row.title,
    message: row.message,
    actionUrl: row.action_url,
    metadata: row.metadata,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

async function getSettings() {
  var rows = await db.query('SELECT * FROM notification_settings WHERE id = 1 LIMIT 1');
  return mapSettings(rows[0]);
}

async function updateSettings(input, user, context) {
  await db.query(
    `UPDATE notification_settings
     SET task_assignments_channel = :taskAssignments,
         health_alerts_channel = :healthAlerts,
         password_age_alerts_channel = :passwordAgeAlerts,
         daily_user_summary_channel = :dailyUserSummary,
         pre_shift_briefing_channel = :preShiftBriefing,
         weekly_digest_channel = :weeklyDigest,
         in_app_realtime_enabled = :inAppRealtimeEnabled,
         daily_summary_time = :dailySummaryTime,
         pre_shift_briefing_time = :preShiftBriefingTime,
         manager_notes = :managerNotes,
         discord_webhook_url = :discordWebhookUrl
     WHERE id = 1`,
    {
      taskAssignments: safeChannel(input.taskAssignments, 'email'),
      healthAlerts: safeChannel(input.healthAlerts, 'both'),
      passwordAgeAlerts: safeChannel(input.passwordAgeAlerts, 'discord'),
      dailyUserSummary: safeChannel(input.dailyUserSummary, 'email'),
      preShiftBriefing: safeChannel(input.preShiftBriefing, 'both'),
      weeklyDigest: safeChannel(input.weeklyDigest, 'off'),
      inAppRealtimeEnabled: input.inAppRealtimeEnabled === false ? 0 : 1,
      dailySummaryTime: input.dailySummaryTime || '18:00',
      preShiftBriefingTime: input.preShiftBriefingTime || '08:30',
      managerNotes: input.managerNotes || null,
      discordWebhookUrl: input.discordWebhookUrl || null,
    }
  );

  await activity.logActivity({
    userId: user.id,
    eventType: 'notifications.settings_updated',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: {},
  });

  return getSettings();
}

async function createNotification(input, user, context) {
  var id = security.uuid();
  var audienceType = input.audienceType || (input.userId ? 'user' : 'workspace');
  var audienceValue = input.audienceValue || null;
  var userId = input.userId || null;

  await db.query(
    `INSERT INTO notifications
      (id, user_id, audience_type, audience_value, type, title, message, action_url, metadata)
     VALUES
      (:id, :userId, :audienceType, :audienceValue, :type, :title, :message, :actionUrl, :metadata)`,
    {
      id: id,
      userId: userId,
      audienceType: audienceType,
      audienceValue: audienceValue,
      type: input.type || 'general',
      title: String(input.title || 'Notification').trim(),
      message: String(input.message || '').trim(),
      actionUrl: input.actionUrl || null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    }
  );

  var notification = await getNotification(id);
  var emitted = bus.emitNotification(notification);
  await db.query(
    `INSERT INTO notification_delivery_attempts
      (notification_id, channel, status)
     VALUES
      (:notificationId, 'in_app', :status)`,
    { notificationId: id, status: emitted ? 'sent' : 'queued' }
  );

  await activity.logActivity({
    userId: user && user.id,
    eventType: 'notifications.created',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { notificationId: id, audienceType: audienceType },
  });

  return notification;
}

async function getNotification(id) {
  var rows = await db.query('SELECT * FROM notifications WHERE id = :id LIMIT 1', {
    id: id,
  });
  return rows[0] ? mapNotification(rows[0]) : null;
}

async function listNotifications(user, filters) {
  var rows = await db.query(
    `SELECT *
     FROM notifications
     WHERE
       (
         user_id = :userId
         OR audience_type = 'workspace'
         OR (audience_type = 'role' AND audience_value = :role)
       )
     ORDER BY created_at DESC
     LIMIT 100`,
    { userId: user.id, role: user.role }
  );
  return rows.map(mapNotification);
}

async function markRead(notificationId, user) {
  await db.query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, UTC_TIMESTAMP())
     WHERE id = :id
       AND (
         user_id = :userId
         OR audience_type = 'workspace'
         OR (audience_type = 'role' AND audience_value = :role)
       )`,
    { id: notificationId, userId: user.id, role: user.role }
  );
  return getNotification(notificationId);
}

async function unreadCount(user) {
  var rows = await db.query(
    `SELECT COUNT(*) AS count
     FROM notifications
     WHERE read_at IS NULL
       AND (
         user_id = :userId
         OR audience_type = 'workspace'
         OR (audience_type = 'role' AND audience_value = :role)
       )`,
    { userId: user.id, role: user.role }
  );
  return Number(rows[0].count || 0);
}

async function testNotification(input, user, context) {
  return createNotification(
    {
      userId: user.id,
      audienceType: 'user',
      type: 'test',
      title: 'Test notification',
      message: 'Realtime notifications are connected.',
      actionUrl: '/dashboard/settings',
      metadata: { channel: input.channel || 'in_app' },
    },
    user,
    context
  );
}

async function runJob(kind, user, context) {
  var titles = {
    daily_summary: 'Daily summary',
    pre_shift: 'Pre-shift briefing',
    weekly_digest: 'Weekly digest',
  };
  return createNotification(
    {
      audienceType: 'workspace',
      type: kind,
      title: titles[kind] || 'Notification job',
      message: 'Manual notification job triggered.',
      actionUrl: '/dashboard',
      metadata: { manual: true },
    },
    user,
    context
  );
}

module.exports = {
  getSettings: getSettings,
  updateSettings: updateSettings,
  createNotification: createNotification,
  listNotifications: listNotifications,
  markRead: markRead,
  unreadCount: unreadCount,
  testNotification: testNotification,
  runJob: runJob,
};
