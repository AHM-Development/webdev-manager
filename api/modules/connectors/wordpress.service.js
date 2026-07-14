var crypto = require('crypto');

var db = require('../../db/pool');
var env = require('../../config/env');
var security = require('../../lib/security');
var redisStore = require('../../lib/redis');
var encryption = require('../website-users/crypto');
var activity = require('../auth/activity.service');
var urlSecurity = require('../website-health/url-security');

function fail(status, code, message) {
  var err = new Error(message);
  err.status = status;
  err.code = code;
  throw err;
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (err) { return fallback; }
}

function normalizeSiteUrl(value) {
  try {
    var url = new URL(value);
    return url.origin.replace(/\/$/, '');
  } catch (err) {
    return '';
  }
}

async function website(websiteId) {
  var rows = await db.query(
    `SELECT pw.id, pw.name, pw.url, pw.project_id, p.client_name
     FROM project_websites pw
     JOIN projects p ON p.id = pw.project_id AND p.deleted_at IS NULL
     WHERE pw.id = :websiteId LIMIT 1`,
    { websiteId: websiteId }
  );
  if (!rows[0]) fail(404, 'WEBSITE_NOT_FOUND', 'Website not found.');
  return rows[0];
}

function mapConnection(row) {
  if (!row) return null;
  return {
    websiteId: String(row.website_id),
    connectionId: row.connection_id,
    status: row.status,
    pluginVersion: row.plugin_version,
    capabilities: parseJson(row.capabilities, []),
    snapshot: parseJson(row.snapshot, null),
    lastHeartbeatAt: row.last_heartbeat_at,
    lastError: row.last_error,
    updatedAt: row.updated_at,
  };
}

async function getConnection(websiteId) {
  await website(websiteId);
  var rows = await db.query('SELECT * FROM wordpress_connections WHERE website_id = :websiteId LIMIT 1', { websiteId: websiteId });
  return mapConnection(rows[0]);
}

async function createPairingCode(websiteId, user, context) {
  var site = await website(websiteId);
  var code = security.randomDigits(8);
  var id = security.uuid();
  var expiresAt = security.addSeconds(new Date(), env.websiteHealth.pairingTtlMinutes * 60);
  await db.query('DELETE FROM wordpress_pairing_codes WHERE website_id = :websiteId AND used_at IS NULL', { websiteId: websiteId });
  await db.query(
    `INSERT INTO wordpress_pairing_codes (id, website_id, code_hash, created_by, expires_at)
     VALUES (:id, :websiteId, :codeHash, :userId, :expiresAt)`,
    { id: id, websiteId: websiteId, codeHash: security.sha256(code), userId: user.id, expiresAt: security.mysqlDate(expiresAt) }
  );
  await activity.logActivity({ userId: user.id, eventType: 'wordpress.pairing_code_created', ip: context.ip, userAgent: context.userAgent, metadata: { websiteId: String(websiteId) } });
  return { code: code, expiresAt: expiresAt.toISOString(), apiUrl: env.websiteHealth.publicApiUrl, website: { id: String(site.id), name: site.name, url: site.url } };
}

async function pair(input, context) {
  var code = String(input.code || '').trim();
  var siteUrl = normalizeSiteUrl(input.siteUrl);
  if (!/^\d{8}$/.test(code) || !siteUrl) fail(400, 'PAIRING_INVALID', 'Pairing code and WordPress site URL are required.');
  var rows = await db.query(
    `SELECT pc.*, pw.url, pw.name
     FROM wordpress_pairing_codes pc
     JOIN project_websites pw ON pw.id = pc.website_id
     WHERE pc.code_hash = :codeHash AND pc.used_at IS NULL AND pc.expires_at > UTC_TIMESTAMP()
     LIMIT 1`,
    { codeHash: security.sha256(code) }
  );
  var pairing = rows[0];
  if (!pairing) fail(400, 'PAIRING_EXPIRED', 'The pairing code is invalid or expired.');
  if (normalizeSiteUrl(pairing.url) !== siteUrl) fail(400, 'PAIRING_SITE_MISMATCH', 'The WordPress URL does not match the selected project website.');
  await urlSecurity.assertSafeUrl(siteUrl);
  var connectionId = security.uuid();
  var secret = security.randomToken(48);
  var capabilities = Array.isArray(input.capabilities) ? input.capabilities : [];
  await db.query(
    `INSERT INTO wordpress_connections
       (website_id, connection_id, secret_encrypted, status, plugin_version, capabilities, snapshot, last_heartbeat_at)
     VALUES
       (:websiteId, :connectionId, :secret, 'connected', :pluginVersion, :capabilities, :snapshot, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE connection_id = VALUES(connection_id), secret_encrypted = VALUES(secret_encrypted),
       status = 'connected', plugin_version = VALUES(plugin_version), capabilities = VALUES(capabilities),
       snapshot = VALUES(snapshot), last_heartbeat_at = UTC_TIMESTAMP(), last_error = NULL`,
    {
      websiteId: pairing.website_id,
      connectionId: connectionId,
      secret: encryption.encrypt(secret),
      pluginVersion: String(input.pluginVersion || ''),
      capabilities: JSON.stringify(capabilities),
      snapshot: JSON.stringify(input.snapshot || {}),
    }
  );
  await db.query('UPDATE wordpress_pairing_codes SET used_at = UTC_TIMESTAMP() WHERE id = :id', { id: pairing.id });
  return {
    connectionId: connectionId,
    secret: secret,
    apiUrl: env.websiteHealth.publicApiUrl,
    heartbeatUrl: env.websiteHealth.publicApiUrl.replace(/\/$/, '') + '/api/v1/connectors/wordpress/heartbeat',
  };
}

function signature(secret, timestamp, nonce, method, pathname, bodyHash) {
  return crypto.createHmac('sha256', secret).update([timestamp, nonce, method.toUpperCase(), pathname, bodyHash].join('\n')).digest('hex');
}

async function verifySignedRequest(req) {
  var connectionId = String(req.headers['x-ahm-connection'] || '');
  var timestamp = String(req.headers['x-ahm-timestamp'] || '');
  var nonce = String(req.headers['x-ahm-nonce'] || '');
  var received = String(req.headers['x-ahm-signature'] || '');
  if (!connectionId || !timestamp || !nonce || !received) fail(401, 'CONNECTOR_SIGNATURE_REQUIRED', 'Connector signature is required.');
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) fail(401, 'CONNECTOR_SIGNATURE_EXPIRED', 'Connector signature expired.');
  var rows = await db.query("SELECT * FROM wordpress_connections WHERE connection_id = :id AND status <> 'revoked' LIMIT 1", { id: connectionId });
  var connection = rows[0];
  if (!connection) fail(401, 'CONNECTOR_UNKNOWN', 'Connector is not recognized.');
  var secret = encryption.decrypt(connection.secret_encrypted);
  var bodyHash = crypto.createHash('sha256').update(req.rawBody || Buffer.from('')).digest('hex');
  var requestPath = String(req.originalUrl || req.path).split('?')[0];
  var expected = signature(secret, timestamp, nonce, req.method, requestPath, bodyHash);
  var left = Buffer.from(received, 'hex');
  var right = Buffer.from(expected, 'hex');
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) fail(401, 'CONNECTOR_SIGNATURE_INVALID', 'Connector signature is invalid.');
  var redis = await redisStore.getRedis();
  var accepted = await redis.set('wordpress-connector:nonce:' + connectionId + ':' + security.sha256(nonce), '1', { NX: true, EX: 600 });
  if (!accepted) fail(401, 'CONNECTOR_REPLAY_REJECTED', 'Connector request replay rejected.');
  return connection;
}

async function heartbeat(req) {
  var connection = await verifySignedRequest(req);
  await db.query(
    `UPDATE wordpress_connections SET status = 'connected', plugin_version = :pluginVersion,
       capabilities = :capabilities, snapshot = :snapshot, last_heartbeat_at = UTC_TIMESTAMP(), last_error = NULL
     WHERE website_id = :websiteId`,
    {
      websiteId: connection.website_id,
      pluginVersion: String(req.body.pluginVersion || connection.plugin_version || ''),
      capabilities: JSON.stringify(req.body.capabilities || parseJson(connection.capabilities, [])),
      snapshot: JSON.stringify(req.body.snapshot || parseJson(connection.snapshot, {})),
    }
  );
  return { accepted: true, serverTime: new Date().toISOString() };
}

async function signedGet(connection, siteUrl, routePath) {
  var secret = encryption.decrypt(connection.secret_encrypted);
  var endpoint = new URL(routePath, siteUrl);
  await urlSecurity.assertSafeUrl(endpoint.toString());
  var timestamp = String(Math.floor(Date.now() / 1000));
  var nonce = security.randomToken(18);
  var bodyHash = crypto.createHash('sha256').update('').digest('hex');
  var response = await urlSecurity.safeFetch(endpoint.toString(), {
    headers: {
      'x-ahm-connection': connection.connection_id,
      'x-ahm-timestamp': timestamp,
      'x-ahm-nonce': nonce,
      'x-ahm-signature': signature(secret, timestamp, nonce, 'GET', endpoint.pathname, bodyHash),
    },
    signal: AbortSignal.timeout(env.websiteHealth.pageTimeoutMs),
  });
  if (!response.ok) throw new Error('AHM Core returned HTTP ' + response.status + '.');
  return response.json();
}

async function signedPost(connection, siteUrl, routePath, payload) {
  var secret = encryption.decrypt(connection.secret_encrypted);
  var endpoint = new URL(routePath, siteUrl);
  await urlSecurity.assertSafeUrl(endpoint.toString());
  var body = JSON.stringify(payload || {});
  var timestamp = String(Math.floor(Date.now() / 1000));
  var nonce = security.randomToken(18);
  var bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  var response = await urlSecurity.safeFetch(endpoint.toString(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ahm-connection': connection.connection_id,
      'x-ahm-timestamp': timestamp,
      'x-ahm-nonce': nonce,
      'x-ahm-signature': signature(secret, timestamp, nonce, 'POST', endpoint.pathname, bodyHash),
    },
    body: body,
    signal: AbortSignal.timeout(env.websiteHealth.pageTimeoutMs),
  });
  if (!response.ok) throw new Error('AHM Core returned HTTP ' + response.status + '.');
  return response.json();
}

async function refreshSnapshot(websiteId) {
  var site = await website(websiteId);
  var rows = await db.query("SELECT * FROM wordpress_connections WHERE website_id = :websiteId AND status <> 'revoked' LIMIT 1", { websiteId: websiteId });
  if (!rows[0]) return null;
  try {
    var snapshot = await signedGet(rows[0], site.url, '/wp-json/ahm-core/v1/snapshot');
    await db.query("UPDATE wordpress_connections SET snapshot = :snapshot, status = 'connected', last_heartbeat_at = UTC_TIMESTAMP(), last_error = NULL WHERE website_id = :websiteId", { websiteId: websiteId, snapshot: JSON.stringify(snapshot) });
    return snapshot;
  } catch (err) {
    await db.query("UPDATE wordpress_connections SET status = 'warning', last_error = :error WHERE website_id = :websiteId", { websiteId: websiteId, error: err.message });
    return parseJson(rows[0].snapshot, null);
  }
}

async function fetchForms(websiteId) {
  var site = await website(websiteId);
  var rows = await db.query("SELECT * FROM wordpress_connections WHERE website_id = :websiteId AND status <> 'revoked' LIMIT 1", { websiteId: websiteId });
  if (!rows[0]) return null;
  try {
    return await signedGet(rows[0], site.url, '/wp-json/ahm-core/v1/forms');
  } catch (err) {
    await db.query("UPDATE wordpress_connections SET status = 'warning', last_error = :error WHERE website_id = :websiteId", { websiteId: websiteId, error: err.message });
    return null;
  }
}

async function sendFormTest(websiteId, formId, to) {
  var site = await website(websiteId);
  var rows = await db.query("SELECT * FROM wordpress_connections WHERE website_id = :websiteId AND status <> 'revoked' LIMIT 1", { websiteId: websiteId });
  if (!rows[0]) fail(400, 'CONNECTOR_NOT_PAIRED', 'This website is not paired with a WordPress connector.');
  return signedPost(rows[0], site.url, '/wp-json/ahm-core/v1/forms/test', { formId: String(formId || ''), to: String(to || '') });
}

async function revoke(websiteId, user, context) {
  await website(websiteId);
  await db.query("UPDATE wordpress_connections SET status = 'revoked' WHERE website_id = :websiteId", { websiteId: websiteId });
  await activity.logActivity({ userId: user.id, eventType: 'wordpress.connection_revoked', ip: context.ip, userAgent: context.userAgent, metadata: { websiteId: String(websiteId) } });
}

module.exports = {
  getConnection: getConnection,
  createPairingCode: createPairingCode,
  pair: pair,
  heartbeat: heartbeat,
  refreshSnapshot: refreshSnapshot,
  fetchForms: fetchForms,
  sendFormTest: sendFormTest,
  revoke: revoke,
};
