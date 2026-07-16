'use strict';

// Tests for the Discord webhook sender. global.fetch is stubbed so no real
// network call is made; the SSRF host guard and payload shaping are asserted.

const test = require('node:test');
const assert = require('node:assert');
const discord = require('./discord.service');

const VALID = 'https://discord.com/api/webhooks/123/token';

let fetchCalls = [];
let nextResponse = { status: 204 };
let fetchThrows = null;
const realFetch = global.fetch;

function stubFetch() {
  fetchCalls = [];
  global.fetch = async (url, options) => {
    fetchCalls.push({ url, options, body: JSON.parse(options.body) });
    if (fetchThrows) throw fetchThrows;
    return { status: nextResponse.status };
  };
}
function restoreFetch() {
  global.fetch = realFetch;
  fetchThrows = null;
  nextResponse = { status: 204 };
}

test('hasWebhook accepts only https Discord webhook URLs', () => {
  assert.equal(discord.hasWebhook(VALID), true);
  assert.equal(discord.hasWebhook('https://canary.discord.com/api/webhooks/1/t'), true);
  assert.equal(discord.hasWebhook('http://discord.com/api/webhooks/1/t'), false, 'must be https');
  assert.equal(discord.hasWebhook('https://evil.com/api/webhooks/1/t'), false, 'host allowlist');
  assert.equal(discord.hasWebhook('https://discord.com/channels/1'), false, 'must be a webhook path');
  assert.equal(discord.hasWebhook(''), false);
  assert.equal(discord.hasWebhook(null), false);
});

test('postWebhook short-circuits on an invalid URL without calling fetch', async () => {
  stubFetch();
  try {
    const result = await discord.postWebhook('https://evil.com/x', { content: 'hi' });
    assert.deepEqual(result, { delivered: false, reason: 'NO_WEBHOOK' });
    assert.equal(fetchCalls.length, 0);
  } finally {
    restoreFetch();
  }
});

test('postWebhook reports delivered on a 2xx', async () => {
  stubFetch();
  try {
    nextResponse = { status: 204 };
    const result = await discord.postWebhook(VALID, { content: 'hi' });
    assert.equal(result.delivered, true);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].options.method, 'POST');
  } finally {
    restoreFetch();
  }
});

test('postWebhook surfaces an HTTP error status', async () => {
  stubFetch();
  try {
    nextResponse = { status: 400 };
    const result = await discord.postWebhook(VALID, { content: 'hi' });
    assert.equal(result.delivered, false);
    assert.equal(result.reason, 'HTTP_400');
  } finally {
    restoreFetch();
  }
});

test('postWebhook swallows network errors', async () => {
  stubFetch();
  try {
    fetchThrows = new Error('boom');
    const result = await discord.postWebhook(VALID, { content: 'hi' });
    assert.equal(result.delivered, false);
    assert.equal(result.reason, 'NETWORK');
  } finally {
    restoreFetch();
  }
});

test('sendNotification posts a single branded embed', async () => {
  stubFetch();
  try {
    await discord.sendNotification(VALID, { title: 'Task assigned', message: 'Do it', actionUrl: '/dashboard/tasks' });
    assert.equal(fetchCalls.length, 1);
    const embed = fetchCalls[0].body.embeds[0];
    assert.equal(embed.title, 'Task assigned');
    assert.equal(embed.description, 'Do it');
    assert.match(embed.url, /\/dashboard\/tasks$/);
  } finally {
    restoreFetch();
  }
});

test('sendDigest lists items and skips an empty digest', async () => {
  stubFetch();
  try {
    const empty = await discord.sendDigest(VALID, { title: 'Daily', items: [] });
    assert.deepEqual(empty, { delivered: false, reason: 'EMPTY' });
    assert.equal(fetchCalls.length, 0);

    await discord.sendDigest(VALID, {
      title: 'Daily summary',
      items: [
        { title: 'A', actionUrl: '/a' },
        { title: 'B', actionUrl: '/b' },
      ],
    });
    assert.equal(fetchCalls.length, 1);
    const embed = fetchCalls[0].body.embeds[0];
    assert.match(embed.description, /A/);
    assert.match(embed.description, /B/);
  } finally {
    restoreFetch();
  }
});
