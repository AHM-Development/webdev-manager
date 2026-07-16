'use strict';

// Tests for the digest builder. db pool and mailer are replaced in require.cache
// so we exercise windowing, per-user collection, channel gating, and run recording
// without a live DB/mailer.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const dbPath = path.resolve(__dirname, '../../db/pool.js');
const mailPath = path.resolve(__dirname, '../auth/mail.service.js');
const discordPath = path.resolve(__dirname, './discord.service.js');

let channel = 'email';
let activeUsers = [];
let itemsByUserId = {}; // userId -> notification rows
let workspaceItems = []; // rows for the workspace (Discord) query
const digestCalls = [];
const discordCalls = [];
const runRecords = [];

function inject(filename, exports) {
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}
inject(dbPath, {
  query: async (sql, params) => {
    if (/FROM notification_settings/.test(sql)) {
      return [{
        daily_user_summary_channel: channel,
        pre_shift_briefing_channel: channel,
        weekly_digest_channel: channel,
        daily_summary_time: '18:00:00',
        pre_shift_briefing_time: '08:30:00',
        discord_webhook_url: 'https://discord.com/api/webhooks/1/token',
      }];
    }
    if (/FROM users/.test(sql)) return activeUsers;
    // Per-user digest query filters on user_id; the workspace (Discord) query does not.
    if (/FROM notifications/.test(sql)) {
      return /user_id = :userId/.test(sql) ? (itemsByUserId[params.userId] || []) : workspaceItems;
    }
    if (/FROM notification_job_runs/.test(sql)) return [];
    if (/INSERT INTO notification_job_runs/.test(sql)) { runRecords.push(params); return {}; }
    return [];
  },
});
inject(mailPath, {
  sendDigestEmail: async (user, digest) => { digestCalls.push({ user, digest }); return { delivered: true }; },
});
inject(discordPath, {
  hasWebhook: () => true,
  sendDigest: async (url, digest) => { discordCalls.push({ url, digest }); return { delivered: true }; },
});

const service = require('./notification-digest.service');

function reset() {
  channel = 'email';
  activeUsers = [
    { id: 1, name: 'Alice', email: 'a@x.co', role: 'developer' },
    { id: 2, name: 'Bob', email: 'b@x.co', role: 'designer' },
  ];
  itemsByUserId = {
    1: [{ id: 'n1', type: 't', title: 'Task assigned', message: 'Do it', action_url: '/x', created_at: '2026-07-16' }],
    2: [], // Bob has nothing unread -> should not be emailed
  };
  workspaceItems = [
    { id: 'n1', type: 't', title: 'Task assigned', message: 'Do it', action_url: '/x', created_at: '2026-07-16' },
    { id: 'n2', type: 'r', title: 'Review requested', message: '', action_url: '/y', created_at: '2026-07-16' },
  ];
  digestCalls.length = 0;
  discordCalls.length = 0;
  runRecords.length = 0;
}

test('runDigest emails only users with unread items and tallies the run', async () => {
  reset();
  const summary = await service.runDigest('daily_summary', { runDate: '2026-07-16' });
  assert.equal(summary.kind, 'daily_summary');
  assert.equal(summary.channel, 'email');
  assert.equal(summary.recipients, 2);
  assert.equal(summary.usersEmailed, 1, 'only Alice has unread items');
  assert.equal(summary.totalItems, 1);
  assert.equal(digestCalls.length, 1);
  assert.equal(digestCalls[0].user.email, 'a@x.co');
  assert.equal(digestCalls[0].digest.title, 'Your daily summary');
  assert.equal(digestCalls[0].digest.items.length, 1);
});

test('runDigest with channel off sends nothing but still records the run', async () => {
  reset();
  channel = 'off';
  const summary = await service.runDigest('daily_summary', { runDate: '2026-07-16' });
  assert.equal(summary.usersEmailed, 0);
  assert.equal(digestCalls.length, 0);
  assert.equal(runRecords.length, 1, 'run is recorded so the scheduler advances');
  assert.equal(runRecords[0].date, '2026-07-16');
});

test('runDigest on the both channel emails per-user AND posts one team digest to discord', async () => {
  reset();
  channel = 'both';
  const summary = await service.runDigest('daily_summary', { runDate: '2026-07-16' });
  assert.equal(summary.usersEmailed, 1, 'personal emails still go out');
  assert.equal(summary.discordItems, 2, 'workspace feed has both items');
  assert.equal(summary.discordDelivered, true);
  assert.equal(discordCalls.length, 1, 'exactly one shared team post, not one per user');
  assert.equal(discordCalls[0].digest.items.length, 2);
});

test('runDigest on the discord-only channel posts to discord and sends no email', async () => {
  reset();
  channel = 'discord';
  const summary = await service.runDigest('daily_summary', { runDate: '2026-07-16' });
  assert.equal(digestCalls.length, 0, 'no personal emails on discord-only');
  assert.equal(discordCalls.length, 1);
  assert.equal(summary.discordDelivered, true);
});

test('runDigest rejects an unknown kind', async () => {
  reset();
  await assert.rejects(service.runDigest('nope', {}), (err) => err.code === 'UNKNOWN_DIGEST_KIND');
});

test('weekly digest uses a 7-day window title', async () => {
  reset();
  const summary = await service.runDigest('weekly_digest', { runDate: '2026-07-16' });
  assert.equal(summary.kind, 'weekly_digest');
  assert.equal(digestCalls[0].digest.title, 'Your weekly digest');
});
