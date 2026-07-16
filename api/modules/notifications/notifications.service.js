var db = require('../../db/pool');
var security = require('../../lib/security');
var activity = require('../auth/activity.service');
var bus = require('./notification-bus');
var mail = require('../auth/mail.service');
var digest = require('./notification-digest.service');
var discord = require('./discord.service');

// Notification categories -> notification_settings column prefix. dispatch() looks
// up "<prefix>_channel" to decide external (email/discord) delivery.
var CATEGORY = {
  TASK_ASSIGNMENT: 'task_assignments',
  REVIEW: 'reviews',
  CLIENT_LOGS: 'client_logs',
  ISSUES: 'issues',
  SECURITY: 'security',
  HEALTH: 'health_alerts',
  PASSWORD_AGE: 'password_age_alerts',
};

var CHANNELS = ['off', 'email', 'discord', 'both'];

function safeChannel(value, fallback) {
  return CHANNELS.indexOf(value) === -1 ? fallback : value;
}

function mapSettings(row) {
  return {
    taskAssignments: row.task_assignments_channel,
    reviews: row.reviews_channel,
    clientLogs: row.client_logs_channel,
    issues: row.issues_channel,
    security: row.security_channel,
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
         reviews_channel = :reviews,
         client_logs_channel = :clientLogs,
         issues_channel = :issues,
         security_channel = :security,
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
      reviews: safeChannel(input.reviews, 'both'),
      clientLogs: safeChannel(input.clientLogs, 'both'),
      issues: safeChannel(input.issues, 'email'),
      security: safeChannel(input.security, 'both'),
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

async function settingsRow() {
  var rows = await db.query('SELECT * FROM notification_settings WHERE id = 1 LIMIT 1');
  return rows[0] || {};
}

async function recipientsFor(notification) {
  if (notification.audienceType === 'user' && notification.userId) {
    return db.query(
      'SELECT id, name, email FROM users WHERE id = :id AND status = \'active\' AND deleted_at IS NULL',
      { id: notification.userId }
    );
  }
  if (notification.audienceType === 'role' && notification.audienceValue) {
    return db.query(
      'SELECT id, name, email FROM users WHERE role = :role AND status = \'active\' AND deleted_at IS NULL',
      { role: notification.audienceValue }
    );
  }
  return db.query("SELECT id, name, email FROM users WHERE status = 'active' AND deleted_at IS NULL");
}

async function deliverEmail(notification) {
  var recipients = await recipientsFor(notification);
  for (var i = 0; i < recipients.length; i += 1) {
    var user = recipients[i];
    if (!user.email) continue;
    var status = 'sent';
    try {
      var result = await mail.sendNotificationEmail(user, notification);
      if (!result || result.delivered === false) status = 'queued';
    } catch (err) {
      status = 'failed';
    }
    await db
      .query(
        'INSERT INTO notification_delivery_attempts (notification_id, channel, status) VALUES (:id, \'email\', :status)',
        { id: notification.id, status: status }
      )
      .catch(function() {});
  }
}

async function deliverDiscord(notification, webhookUrl) {
  var status = 'sent';
  try {
    var result = await discord.sendNotification(webhookUrl, notification);
    if (!result || result.delivered === false) status = result && result.reason === 'NO_WEBHOOK' ? 'queued' : 'failed';
  } catch (err) {
    status = 'failed';
  }
  await db
    .query(
      'INSERT INTO notification_delivery_attempts (notification_id, channel, status) VALUES (:id, \'discord\', :status)',
      { id: notification.id, status: status }
    )
    .catch(function() {});
}

/**
 * Create an in-app notification and fan out to email and/or Discord when the
 * category's channel setting allows. Best-effort: notification/delivery failures
 * never bubble to the caller's primary operation. `categoryKey` is from CATEGORY.
 */
async function dispatch(categoryKey, input, actor, context) {
  try {
    var notification = await createNotification(input, actor || null, context || {});
    if (!notification) return null;
    var row = await settingsRow();
    var channel = row[categoryKey + '_channel'] || 'off';
    if (channel === 'email' || channel === 'both') {
      await deliverEmail(notification).catch(function() {});
    }
    if (channel === 'discord' || channel === 'both') {
      await deliverDiscord(notification, row.discord_webhook_url).catch(function() {});
    }
    return notification;
  } catch (err) {
    return null;
  }
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

async function markAllRead(user) {
  var result = await db.query(
    `UPDATE notifications
     SET read_at = UTC_TIMESTAMP()
     WHERE read_at IS NULL
       AND (
         user_id = :userId
         OR audience_type = 'workspace'
         OR (audience_type = 'role' AND audience_value = :role)
       )`,
    { userId: user.id, role: user.role }
  );
  return { updated: result && result.affectedRows != null ? Number(result.affectedRows) : 0 };
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

// Send a real test message to the configured Discord webhook (superadmin-only).
async function testDiscord() {
  var row = await settingsRow();
  var url = row.discord_webhook_url;
  if (!discord.hasWebhook(url)) {
    return { ok: false, delivered: false, message: 'Add a valid Discord webhook URL in Settings first.' };
  }
  var result = await discord.testWebhook(url);
  return {
    ok: !!(result && result.delivered),
    delivered: !!(result && result.delivered),
    reason: result && result.reason,
    message: result && result.delivered
      ? 'Test message sent to Discord.'
      : 'Discord did not accept the message (' + ((result && result.reason) || 'unknown') + ').',
  };
}

// Manually trigger a digest run (superadmin-only endpoint). Delegates to the
// digest service — same code path the scheduler uses — and audit-logs it.
async function runJob(kind, user, context) {
  var summary = await digest.runDigest(kind, {
    actor: user,
    context: context,
    manual: true,
  });
  await activity.logActivity({
    userId: user && user.id,
    eventType: 'notifications.job_run',
    ip: context && context.ip,
    userAgent: context && context.userAgent,
    metadata: { kind: kind, usersEmailed: summary.usersEmailed, totalItems: summary.totalItems },
  });
  return summary;
}

module.exports = {
  getSettings: getSettings,
  updateSettings: updateSettings,
  createNotification: createNotification,
  dispatch: dispatch,
  CATEGORY: CATEGORY,
  listNotifications: listNotifications,
  markRead: markRead,
  markAllRead: markAllRead,
  unreadCount: unreadCount,
  testNotification: testNotification,
  testDiscord: testDiscord,
  runJob: runJob,
};
