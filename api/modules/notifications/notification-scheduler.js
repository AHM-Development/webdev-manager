'use strict';

// Fires the notification digest jobs on their configured wall-clock times.
// Ticks once a minute; each job runs at most once per day (weekly digest once
// per week, on its weekday), guarded by notification_job_runs so restarts don't
// double-fire. Single-instance assumption, matching the health scan-worker.

var env = require('../../config/env');
var digest = require('./notification-digest.service');

var TICK_MS = 60 * 1000;
var started = false;
var timer = null;
var ticking = false;

// Timezone-local wall-clock parts for `now`: date 'YYYY-MM-DD', minutes since
// midnight, and long weekday name. Pure (takes `now`) so it's unit-testable.
function localParts(now, timeZone) {
  var fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZone || env.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long',
    hourCycle: 'h23',
  });
  var parts = {};
  fmt.formatToParts(now).forEach(function(p) {
    parts[p.type] = p.value;
  });
  return {
    date: parts.year + '-' + parts.month + '-' + parts.day,
    minutes: parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10),
    weekday: parts.weekday,
  };
}

// '18:00:00' / '18:00' -> minutes since midnight, or null if unparseable.
function parseTimeToMinutes(value) {
  if (!value) return null;
  var match = /^(\d{1,2}):(\d{2})/.exec(String(value));
  if (!match) return null;
  var minutes = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  return Number.isFinite(minutes) ? minutes : null;
}

// Is this job due now? Pure — no I/O — so the decision is fully testable.
function isDue(cfg, settingsRow, nowParts, lastRunDate) {
  var channel = settingsRow[cfg.channelColumn] || 'off';
  if (channel === 'off') return false;
  if (cfg.weekly && nowParts.weekday !== cfg.weekday) return false;
  var scheduled = parseTimeToMinutes(settingsRow[cfg.timeColumn]);
  if (scheduled == null) return false;
  if (nowParts.minutes < scheduled) return false;
  if (lastRunDate && lastRunDate === nowParts.date) return false;
  return true;
}

function configs() {
  return Object.keys(digest.JOB_CONFIG).map(function(kind) {
    var cfg = digest.JOB_CONFIG[kind];
    return {
      kind: kind,
      channelColumn: cfg.channelColumn,
      timeColumn: cfg.timeColumn,
      weekly: cfg.weekly,
      weekday: cfg.weekday,
    };
  });
}

// One scheduler pass. Returns the kinds that fired (mostly for tests/logging).
async function tickOnce(now) {
  var settingsRow = await digest.readSettingsRow();
  var nowParts = localParts(now, env.timezone);
  var fired = [];
  var list = configs();
  for (var i = 0; i < list.length; i += 1) {
    var cfg = list[i];
    var lastRunDate = await digest.getLastRunDate(cfg.kind);
    if (!isDue(cfg, settingsRow, nowParts, lastRunDate)) continue;
    try {
      var summary = await digest.runDigest(cfg.kind, { runDate: nowParts.date });
      fired.push(cfg.kind);
      console.log(
        '[notification-scheduler] ran ' + cfg.kind + ':',
        'emailed ' + summary.usersEmailed + '/' + summary.recipients,
        '(' + summary.totalItems + ' items)'
      );
    } catch (err) {
      console.error('[notification-scheduler] ' + cfg.kind + ' failed:', err && err.message);
    }
  }
  return fired;
}

function start() {
  if (started) return;
  started = true;
  timer = setInterval(function() {
    if (ticking) return; // never overlap ticks
    ticking = true;
    tickOnce(new Date())
      .catch(function(err) {
        console.error('[notification-scheduler] tick error:', err && err.message);
      })
      .finally(function() {
        ticking = false;
      });
  }, TICK_MS);
  if (timer.unref) timer.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

module.exports = {
  start: start,
  stop: stop,
  tickOnce: tickOnce,
  isDue: isDue,
  localParts: localParts,
  parseTimeToMinutes: parseTimeToMinutes,
};
