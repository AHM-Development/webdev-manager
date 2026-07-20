'use strict';

// Tests for the agent API-key helpers. The isApiKey routing decision is
// security-critical: a JWT delegation token must never be treated as an API key
// (or vice-versa), or the middleware would send it down the wrong auth path.

const test = require('node:test');
const assert = require('node:assert');
const tokens = require('./agent.tokens');

test('newApiKey is prefixed and recognised as an API key', () => {
  const key = tokens.newApiKey();
  assert.ok(key.startsWith('ahmagent_'), 'has the routing prefix');
  assert.ok(key.length > 40, 'has real entropy after the prefix');
  assert.equal(tokens.isApiKey(key), true);
});

test('isApiKey rejects JWTs and junk (so they take the OAuth path)', () => {
  assert.equal(tokens.isApiKey('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig'), false, 'a JWT is not an API key');
  assert.equal(tokens.isApiKey(''), false);
  assert.equal(tokens.isApiKey(null), false);
  assert.equal(tokens.isApiKey('ahmagentX_nope'), false, 'prefix must match exactly');
  assert.equal(tokens.isApiKey(' ahmagent_leadingspace'), false);
});

test('hashApiKey is a deterministic 64-char hash that hides the key', () => {
  const key = tokens.newApiKey();
  const hash = tokens.hashApiKey(key);
  assert.equal(hash.length, 64);
  assert.notEqual(hash, key);
  assert.equal(hash, tokens.hashApiKey(key), 'same key -> same hash');
  assert.notEqual(hash, tokens.hashApiKey(tokens.newApiKey()), 'different key -> different hash');
});

test('two generated keys are unique', () => {
  assert.notEqual(tokens.newApiKey(), tokens.newApiKey());
});
