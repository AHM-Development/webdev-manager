'use strict';

// Discord webhook delivery for notifications and digests. A single workspace
// webhook (configured in notification_settings.discord_webhook_url) receives a
// team feed: per-event embeds from dispatch(), and one summary embed per digest
// run. Best-effort — every function returns { delivered } and never throws.

var env = require('../../config/env');

var BRAND_COLOR = 0x0b7de3;
var TIMEOUT_MS = 10000;
var MAX_EMBED_DESC = 4000; // Discord hard limit is 4096; leave headroom.
var MAX_DIGEST_ITEMS = 15;

// Only allow real Discord webhook hosts — the URL is admin-entered, so this
// keeps it from being pointed at an arbitrary internal host (SSRF guard).
var ALLOWED_HOSTS = ['discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com'];

function hasWebhook(url) {
  if (!url) return false;
  try {
    var parsed = new URL(String(url));
    if (parsed.protocol !== 'https:') return false;
    if (ALLOWED_HOSTS.indexOf(parsed.hostname) === -1) return false;
    return /\/webhooks\//.test(parsed.pathname);
  } catch (err) {
    return false;
  }
}

function absoluteUrl(actionUrl) {
  if (!actionUrl) return null;
  if (/^https?:\/\//i.test(actionUrl)) return actionUrl;
  var base = String(env.clientUrl || '').replace(/\/$/, '');
  return base + (actionUrl.charAt(0) === '/' ? '' : '/') + actionUrl;
}

function truncate(value, max) {
  var text = String(value == null ? '' : value);
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

// Low-level POST. Returns { delivered, reason?, status? }; swallows all errors.
async function postWebhook(url, payload) {
  if (!hasWebhook(url)) return { delivered: false, reason: 'NO_WEBHOOK' };
  try {
    var response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Discord returns 204 (or 200 with ?wait=true) on success.
    if (response.status >= 200 && response.status < 300) return { delivered: true };
    return { delivered: false, reason: 'HTTP_' + response.status, status: response.status };
  } catch (err) {
    return { delivered: false, reason: (err && err.name === 'TimeoutError') ? 'TIMEOUT' : 'NETWORK' };
  }
}

// One notification -> one embed in the team feed.
async function sendNotification(url, notification) {
  var link = absoluteUrl(notification && notification.actionUrl);
  var embed = {
    title: truncate((notification && notification.title) || 'Notification', 256),
    color: BRAND_COLOR,
    footer: { text: 'AHM Web Manager' },
  };
  if (notification && notification.message) embed.description = truncate(notification.message, MAX_EMBED_DESC);
  if (link) embed.url = link;
  return postWebhook(url, { embeds: [embed] });
}

// One digest run -> one summary embed listing the batched items.
async function sendDigest(url, digest) {
  var items = (digest && digest.items) || [];
  if (!items.length) return { delivered: false, reason: 'EMPTY' };

  var shown = items.slice(0, MAX_DIGEST_ITEMS);
  var lines = shown.map(function(item) {
    var link = absoluteUrl(item.actionUrl);
    var title = truncate(item.title || 'Notification', 180);
    return link ? '• [' + title + '](' + link + ')' : '• ' + title;
  });
  if (items.length > shown.length) lines.push('…and ' + (items.length - shown.length) + ' more');

  var embed = {
    title: truncate((digest && digest.title) || 'Digest', 256),
    description: truncate(lines.join('\n'), MAX_EMBED_DESC),
    color: BRAND_COLOR,
    footer: { text: 'AHM Web Manager · ' + items.length + ' update' + (items.length === 1 ? '' : 's') },
  };
  return postWebhook(url, { embeds: [embed] });
}

async function testWebhook(url) {
  return postWebhook(url, {
    embeds: [
      {
        title: 'Discord notifications are connected',
        description: 'This is a test message from AHM Web Manager. Team notifications will appear here.',
        color: BRAND_COLOR,
        footer: { text: 'AHM Web Manager' },
      },
    ],
  });
}

module.exports = {
  hasWebhook: hasWebhook,
  postWebhook: postWebhook,
  sendNotification: sendNotification,
  sendDigest: sendDigest,
  testWebhook: testWebhook,
};
