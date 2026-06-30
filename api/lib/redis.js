var redis = require('redis');
var env = require('../config/env');

var client;
var selectedUrl;

async function createClientForUrl(url) {
  var candidate = redis.createClient({
    url: url,
    socket: {
      reconnectStrategy: false,
    },
  });
  candidate.on('error', function(err) {
    if (selectedUrl === url && process.env.NODE_ENV !== 'test') {
      console.error('Redis error:', err.message);
    }
  });
  await candidate.connect();
  selectedUrl = url;
  return candidate;
}

async function getRedis() {
  if (client && client.isOpen) return client;

  var lastError;
  for (var i = 0; i < env.redis.urlCandidates.length; i += 1) {
    try {
      client = await createClientForUrl(env.redis.urlCandidates[i]);
      return client;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

function getSelectedUrl() {
  return selectedUrl;
}

module.exports = {
  getRedis: getRedis,
  getSelectedUrl: getSelectedUrl,
};
