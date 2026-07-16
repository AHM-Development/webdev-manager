var path = require('path');
var dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true, quiet: true });

function numberFromEnv(name, fallback) {
  var value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function boolFromEnv(name, fallback) {
  if (process.env[name] == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name]).toLowerCase());
}

function parseDurationSeconds(value, fallbackSeconds) {
  if (!value) return fallbackSeconds;
  var match = String(value).trim().match(/^(\d+)([smhd])?$/i);
  if (!match) return fallbackSeconds;
  var amount = Number(match[1]);
  var unit = (match[2] || 's').toLowerCase();
  var multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * multipliers[unit];
}

function localMysqlHostCandidates() {
  var configured = process.env.DB_HOST || '127.0.0.1';
  if (configured === 'db') return ['db', '127.0.0.1', 'localhost'];
  return [configured];
}

function localRedisUrlCandidates() {
  var configured = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  if (configured.indexOf('redis://redis:') === 0) {
    return [configured, configured.replace('redis://redis:', 'redis://127.0.0.1:')];
  }
  return [configured];
}

var nodeEnv = process.env.NODE_ENV || 'development';
var jwtSecret = process.env.JWT_SECRET || 'dev-only-change-me';

if (nodeEnv === 'production') {
  var missing = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) missing.push('JWT_SECRET');
  if (!process.env.CREDENTIAL_ENCRYPTION_SECRET || process.env.CREDENTIAL_ENCRYPTION_SECRET.length < 32) {
    missing.push('CREDENTIAL_ENCRYPTION_SECRET');
  }
  if (!process.env.CLIENT_URL) missing.push('CLIENT_URL');
  if (!process.env.DB_PASSWORD) missing.push('DB_PASSWORD');
  if (!process.env.REDIS_URL) missing.push('REDIS_URL');
  if (missing.length) {
    throw new Error('Missing or insecure production environment values: ' + missing.join(', '));
  }
}

module.exports = {
  nodeEnv: nodeEnv,
  port: process.env.PORT || '4000',
  clientUrl: process.env.CLIENT_URL || 'http://localhost',
  // Wall-clock timezone for scheduled digests (daily summary / pre-shift / weekly).
  timezone: process.env.TIMEZONE || 'Europe/London',
  db: {
    hostCandidates: localMysqlHostCandidates(),
    port: numberFromEnv('DB_PORT', 3306),
    database: process.env.DB_NAME || 'wpdevmanager',
    user: process.env.DB_USER || 'wpdev',
    password: process.env.DB_PASSWORD || 'secret',
  },
  redis: {
    urlCandidates: localRedisUrlCandidates(),
  },
  auth: {
    jwtSecret: jwtSecret,
    jwtIssuer: process.env.JWT_ISSUER || 'ahm-web-manager-api',
    jwtAudience: process.env.JWT_AUDIENCE || 'ahm-web-manager-web',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
    jwtTtlSeconds: parseDurationSeconds(process.env.JWT_EXPIRES_IN, 15 * 60),
    refreshTtlSeconds: parseDurationSeconds(
      process.env.REFRESH_TOKEN_EXPIRES_IN,
      7 * 24 * 60 * 60
    ),
    bcryptRounds: numberFromEnv('BCRYPT_ROUNDS', 12),
    resetTokenTtlMinutes: numberFromEnv('PASSWORD_RESET_TOKEN_TTL_MINUTES', 30),
    inviteTokenTtlHours: numberFromEnv('INVITE_TOKEN_TTL_HOURS', 24),
    profileOtpTtlMinutes: numberFromEnv('PROFILE_OTP_TTL_MINUTES', 10),
    refreshCookieName: process.env.REFRESH_COOKIE_NAME || 'ahm_refresh',
    refreshCookieSecure: boolFromEnv('REFRESH_COOKIE_SECURE', nodeEnv === 'production'),
    refreshCookieSameSite: process.env.REFRESH_COOKIE_SAME_SITE || 'lax',
    refreshCookieDomain: process.env.REFRESH_COOKIE_DOMAIN || undefined,
  },
  security: {
    credentialEncryptionSecret:
      process.env.CREDENTIAL_ENCRYPTION_SECRET ||
      process.env.JWT_SECRET ||
      'dev-only-change-me',
  },
  // Viktor AI agent: an OAuth2 client that acts on behalf of a user via a
  // delegation token. Reads run directly; writes go through propose → confirm.
  agent: {
    clientId: process.env.VIKTOR_CLIENT_ID || 'viktor',
    clientSecret: process.env.VIKTOR_CLIENT_SECRET || '',
    redirectUris: (process.env.VIKTOR_REDIRECT_URIS || '')
      .split(',')
      .map(function(value) { return value.trim(); })
      .filter(Boolean),
    accessTtlSeconds: parseDurationSeconds(process.env.AGENT_ACCESS_TTL, 15 * 60),
    refreshTtlSeconds: parseDurationSeconds(process.env.AGENT_REFRESH_TTL, 30 * 24 * 60 * 60),
    authCodeTtlSeconds: numberFromEnv('AGENT_AUTH_CODE_TTL_SECONDS', 300),
    proposalTtlSeconds: numberFromEnv('AGENT_PROPOSAL_TTL_SECONDS', 15 * 60),
    tokenAudience: process.env.AGENT_TOKEN_AUDIENCE || 'ahm-agent',
  },
  rateLimit: {
    authWindowSeconds: numberFromEnv('AUTH_RATE_LIMIT_WINDOW_SECONDS', 15 * 60),
    authMaxRequests: numberFromEnv('AUTH_RATE_LIMIT_MAX_REQUESTS', 20),
    apiWindowSeconds: numberFromEnv('API_RATE_LIMIT_WINDOW_SECONDS', 60),
    apiMaxRequests: numberFromEnv('API_RATE_LIMIT_MAX_REQUESTS', 120),
    userWindowSeconds: numberFromEnv('USER_RATE_LIMIT_WINDOW_SECONDS', 60),
    userMaxRequests: numberFromEnv('USER_RATE_LIMIT_MAX_REQUESTS', 240),
  },
  mail: {
    host: process.env.SMTP_HOST,
    port: numberFromEnv('SMTP_PORT', 587),
    secure: boolFromEnv('SMTP_SECURE', false),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
    from: process.env.MAIL_FROM || process.env.REPORT_EMAIL || 'no-reply@localhost',
    googleEmail: process.env.GOOGLE_OAUTH_EMAIL || '',
    googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
    googleRefreshToken: process.env.GOOGLE_OAUTH_REFRESH_TOKEN || '',
  },
  ai: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '',
    anthropicModel:
      process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
    requestTimeoutMs: numberFromEnv('AI_REQUEST_TIMEOUT_MS', 60000),
    maxInputChars: numberFromEnv('AI_MAX_INPUT_CHARS', 20000),
    maxFileChars: numberFromEnv('AI_MAX_FILE_CHARS', 12000),
  },
  integrations: {
    clickupApiToken: process.env.CLICKUP_API_TOKEN || '',
    googleApiKey: process.env.GOOGLE_API_KEY || '',
    googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    googleServiceAccountPrivateKey: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  },
  websiteHealth: {
    pageSpeedApiKey: process.env.PAGESPEED_API_KEY || '',
    maxPages: numberFromEnv('WEBSITE_HEALTH_MAX_PAGES', 25),
    pageTimeoutMs: numberFromEnv('WEBSITE_HEALTH_PAGE_TIMEOUT_MS', 30000),
    scanTimeoutMs: numberFromEnv('WEBSITE_HEALTH_SCAN_TIMEOUT_MS', 20 * 60 * 1000),
    pairingTtlMinutes: numberFromEnv('AHM_CORE_PAIRING_TTL_MINUTES', 10),
    publicApiUrl: process.env.PUBLIC_API_URL || 'http://localhost:4000',
    // DANGER — SSRF escape hatch for local/staging testing ONLY. Comma-separated
    // hostnames/IPs that bypass the private-network guard (e.g. a LAN IP or a
    // *.local staging box). Leave EMPTY in production.
    allowedHosts: (process.env.WEBSITE_HEALTH_ALLOWED_HOSTS || '')
      .split(',')
      .map(function(host) { return host.trim().toLowerCase(); })
      .filter(Boolean),
  },
};
