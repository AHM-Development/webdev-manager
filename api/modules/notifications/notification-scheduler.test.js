'use strict';

// Pure-logic tests for the digest scheduler: time parsing, timezone-local parts,
// and the due decision. No DB — isDue/localParts/parseTimeToMinutes take inputs.

const test = require('node:test');
const assert = require('node:assert');
const scheduler = require('./notification-scheduler');
const { JOB_CONFIG } = require('./notification-digest.service');

const daily = { ...JOB_CONFIG.daily_summary, kind: 'daily_summary' };
const weekly = { ...JOB_CONFIG.weekly_digest, kind: 'weekly_digest' };

// A settings row with everything on and default times.
function settings(overrides) {
  return Object.assign(
    {
      daily_user_summary_channel: 'email',
      pre_shift_briefing_channel: 'both',
      weekly_digest_channel: 'email',
      daily_summary_time: '18:00:00',
      pre_shift_briefing_time: '08:30:00',
    },
    overrides || {}
  );
}

test('parseTimeToMinutes handles HH:MM:SS, HH:MM, and junk', () => {
  assert.equal(scheduler.parseTimeToMinutes('18:00:00'), 1080);
  assert.equal(scheduler.parseTimeToMinutes('08:30'), 510);
  assert.equal(scheduler.parseTimeToMinutes(''), null);
  assert.equal(scheduler.parseTimeToMinutes(null), null);
});

test('localParts renders timezone-local date, minutes, and weekday', () => {
  // 2026-07-13 07:35Z is Monday 08:35 in BST (Europe/London, UTC+1).
  const parts = scheduler.localParts(new Date('2026-07-13T07:35:00Z'), 'Europe/London');
  assert.equal(parts.date, '2026-07-13');
  assert.equal(parts.minutes, 8 * 60 + 35);
  assert.equal(parts.weekday, 'Monday');
});

test('daily job is not due before its scheduled time', () => {
  const now = { date: '2026-07-13', minutes: 17 * 60, weekday: 'Monday' }; // 17:00 < 18:00
  assert.equal(scheduler.isDue(daily, settings(), now, null), false);
});

test('daily job is due after its time when it has not run today', () => {
  const now = { date: '2026-07-13', minutes: 18 * 60 + 5, weekday: 'Monday' };
  assert.equal(scheduler.isDue(daily, settings(), now, '2026-07-12'), true);
});

test('daily job does not re-fire once it has run today', () => {
  const now = { date: '2026-07-13', minutes: 18 * 60 + 5, weekday: 'Monday' };
  assert.equal(scheduler.isDue(daily, settings(), now, '2026-07-13'), false);
});

test('a job whose channel is off is never due', () => {
  const now = { date: '2026-07-13', minutes: 18 * 60 + 5, weekday: 'Monday' };
  assert.equal(scheduler.isDue(daily, settings({ daily_user_summary_channel: 'off' }), now, null), false);
});

test('weekly digest only fires on its weekday', () => {
  const after = 18 * 60 + 5;
  assert.equal(scheduler.isDue(weekly, settings(), { date: '2026-07-14', minutes: after, weekday: 'Tuesday' }, null), false);
  assert.equal(scheduler.isDue(weekly, settings(), { date: '2026-07-13', minutes: after, weekday: 'Monday' }, null), true);
});
