'use strict';

// Builds and sends batched notification digests (daily summary, pre-shift
// briefing, weekly digest). Each digest collects a user's *unread* notifications
// inside a rolling window and sends them as a single email, gated by the digest
// category's channel setting. The scheduler (notification-scheduler.js) drives
// this on a timer; the superadmin job endpoints can also trigger it manually.

var db = require('../../db/pool');
var env = require('../../config/env');
var mail = require('../auth/mail.service');
var discord = require('./discord.service');

// kind -> settings columns + window + copy. channelColumn / timeColumn map onto
// notification_settings; windowHours bounds which notifications are included.
var JOB_CONFIG = {
  daily_summary: {
    channelColumn: 'daily_user_summary_channel',
    timeColumn: 'daily_summary_time',
    windowHours: 24,
    weekly: false,
    title: 'Your daily summary',
    heading: 'here’s what came in today',
  },
  pre_shift: {
    channelColumn: 'pre_shift_briefing_channel',
    timeColumn: 'pre_shift_briefing_time',
    windowHours: 16,
    weekly: false,
    title: 'Pre-shift briefing',
    heading: 'here’s what’s waiting before you start',
  },
  weekly_digest: {
    channelColumn: 'weekly_digest_channel',
    timeColumn: 'daily_summary_time',
    windowHours: 168,
    weekly: true,
    weekday: 'Monday',
    title: 'Your weekly digest',
    heading: 'here’s your week in review',
  },
};

var MAX_ITEMS_PER_USER = 50;

// 'YYYY-MM-DD' for `now` in the configured timezone, matching how the scheduler
// stamps last_run_date (so due-comparisons never drift with the DB timezone).
function localDate(now, timeZone) {
  var fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || env.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now); // en-CA formats as YYYY-MM-DD
}

async function readSettingsRow() {
  var rows = await db.query('SELECT * FROM notification_settings WHERE id = 1 LIMIT 1');
  return rows[0] || {};
}

// Unread notifications addressed to this user (direct, workspace, or their role)
// created since `since`, most recent first.
async function collectForUser(user, since) {
  var rows = await db.query(
    `SELECT id, type, title, message, action_url, created_at
     FROM notifications
     WHERE read_at IS NULL
       AND created_at >= :since
       AND (
         user_id = :userId
         OR audience_type = 'workspace'
         OR (audience_type = 'role' AND audience_value = :role)
       )
     ORDER BY created_at DESC
     LIMIT ${MAX_ITEMS_PER_USER}`,
    { since: since, userId: user.id, role: user.role || null }
  );
  return rows.map(function(row) {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      actionUrl: row.action_url,
      createdAt: row.created_at,
    };
  });
}

// Recent notifications across the whole workspace in the window (any audience,
// read or not) — the shared Discord feed, distinct from personal email digests.
async function collectWorkspace(since) {
  var rows = await db.query(
    `SELECT id, type, title, message, action_url, created_at
     FROM notifications
     WHERE created_at >= :since
     ORDER BY created_at DESC
     LIMIT ${MAX_ITEMS_PER_USER}`,
    { since: since }
  );
  return rows.map(function(row) {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      actionUrl: row.action_url,
      createdAt: row.created_at,
    };
  });
}

async function getLastRunDate(kind) {
  var rows = await db.query(
    'SELECT last_run_date FROM notification_job_runs WHERE kind = :kind LIMIT 1',
    { kind: kind }
  );
  return rows[0] ? rows[0].last_run_date : null;
}

async function recordRun(kind, summary, runDate) {
  await db.query(
    `INSERT INTO notification_job_runs (kind, last_run_at, last_run_date, last_summary)
     VALUES (:kind, UTC_TIMESTAMP(), :date, :summary)
     ON DUPLICATE KEY UPDATE
       last_run_at = UTC_TIMESTAMP(),
       last_run_date = VALUES(last_run_date),
       last_summary = VALUES(last_summary)`,
    { kind: kind, date: runDate || localDate(new Date()), summary: JSON.stringify(summary) }
  );
}

/**
 * Build and send one digest run for `kind`. Emails each active user who has
 * unread notifications in the window, respecting the digest channel setting.
 * Best-effort per recipient — one failed send never aborts the run. Always
 * records the run (even when the channel is off) so the scheduler advances.
 * opts.runDate lets the scheduler pass its timezone-local date.
 */
async function runDigest(kind, opts) {
  opts = opts || {};
  var cfg = JOB_CONFIG[kind];
  if (!cfg) {
    var e = new Error('Unknown digest kind: ' + kind);
    e.status = 400;
    e.code = 'UNKNOWN_DIGEST_KIND';
    throw e;
  }

  var settings = await readSettingsRow();
  var channel = settings[cfg.channelColumn] || 'off';
  var summary = {
    kind: kind,
    channel: channel,
    recipients: 0,
    usersEmailed: 0,
    totalItems: 0,
    discordDelivered: false,
    discordItems: 0,
  };

  if (channel === 'off') {
    await recordRun(kind, summary, opts.runDate);
    return summary;
  }

  var since = new Date(Date.now() - cfg.windowHours * 3600 * 1000);
  var wantsEmail = channel === 'email' || channel === 'both';
  var wantsDiscord = channel === 'discord' || channel === 'both';

  // Email: a personal digest per active user, containing only their unread items.
  if (wantsEmail) {
    var users = await db.query(
      `SELECT id, name, email, role FROM users
       WHERE status = 'active' AND deleted_at IS NULL AND email IS NOT NULL AND email <> ''`
    );
    summary.recipients = users.length;
    for (var i = 0; i < users.length; i += 1) {
      var user = users[i];
      var items = await collectForUser(user, since);
      if (!items.length) continue;
      summary.totalItems += items.length;
      try {
        var result = await mail.sendDigestEmail(user, {
          title: cfg.title,
          heading: cfg.heading,
          items: items,
          link: '/dashboard/notifications',
        });
        if (result && result.delivered) summary.usersEmailed += 1;
      } catch (err) {
        // best-effort; skip this recipient
      }
    }
  }

  // Discord: one shared team-feed summary of the whole workspace's activity.
  if (wantsDiscord) {
    var settingsUrl = settings.discord_webhook_url;
    var teamItems = await collectWorkspace(since);
    summary.discordItems = teamItems.length;
    if (teamItems.length) {
      try {
        var discordResult = await discord.sendDigest(settingsUrl, {
          title: cfg.title,
          heading: cfg.heading,
          items: teamItems,
          link: '/dashboard/notifications',
        });
        summary.discordDelivered = !!(discordResult && discordResult.delivered);
      } catch (err) {
        // best-effort
      }
    }
  }

  await recordRun(kind, summary, opts.runDate);
  return summary;
}

module.exports = {
  JOB_CONFIG: JOB_CONFIG,
  runDigest: runDigest,
  collectForUser: collectForUser,
  readSettingsRow: readSettingsRow,
  getLastRunDate: getLastRunDate,
  localDate: localDate,
};
