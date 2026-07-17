'use strict';

/*
 * Viktor agent smoke test — exercises the OAuth delegation surface end-to-end
 * against a running API. Read-only by default; revoke and write tests are opt-in.
 *
 * The one manual step this can't do is the browser consent (login + Allow), which
 * mints the authorization code. So either:
 *   A) go through the consent page, grab the ?code= from the redirect, then run
 *      with --code, or
 *   B) if you already have an access token, run with --token.
 *
 * Client id/secret and (optionally) the base URL default from api/.env, so on the
 * prod box you usually only pass --code/--redirect.
 *
 * Examples:
 *   node scripts/agent-smoke.js --base https://host/api/v1 \
 *     --code <authcode> --redirect https://viktor.host/oauth/callback
 *   node scripts/agent-smoke.js --base https://host/api/v1 --token <accessToken>
 *   ...add --project <id>            also read insights.project
 *   ...add --revoke                  revoke the grant at the end + prove it's dead
 *   ...add --verifier <codeVerifier> if the consent URL used PKCE
 *
 * Exit code is non-zero if any step fails.
 */

var env = require('../config/env');

function parseArgs(argv) {
  var out = {};
  for (var i = 0; i < argv.length; i += 1) {
    var token = argv[i];
    if (token.indexOf('--') !== 0) continue;
    var key = token.slice(2);
    var next = argv[i + 1];
    if (next === undefined || next.indexOf('--') === 0) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

var args = parseArgs(process.argv.slice(2));
var BASE = String(args.base || process.env.AGENT_BASE_URL || process.env.PUBLIC_API_URL || '').replace(/\/$/, '');
var CLIENT_ID = String(args.clientId || env.agent.clientId || 'viktor');
var CLIENT_SECRET = String(args.clientSecret || env.agent.clientSecret || '');

var passed = 0;
var failed = 0;

function ok(label, detail) {
  passed += 1;
  console.log('  PASS  ' + label + (detail ? '  — ' + detail : ''));
}
function bad(label, detail) {
  failed += 1;
  console.log('  FAIL  ' + label + (detail ? '  — ' + detail : ''));
}

async function req(method, path, options) {
  options = options || {};
  var headers = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = 'Bearer ' + options.token;
  var res = await fetch(BASE + path, {
    method: method,
    headers: headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  var text = await res.text();
  var json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = { raw: text }; }
  return { status: res.status, json: json };
}

async function main() {
  if (!BASE) {
    console.error('Missing base URL. Pass --base https://host/api/v1 (or set PUBLIC_API_URL).');
    process.exit(2);
  }
  if (!args.code && !args.token) {
    console.error('Provide either --code <authcode> --redirect <uri>  or  --token <accessToken>.');
    console.error('See the header of this file for usage.');
    process.exit(2);
  }

  console.log('Viktor smoke test against ' + BASE + '  (client: ' + CLIENT_ID + ')\n');

  var accessToken = args.token ? String(args.token) : null;
  var refreshToken = args['refresh-token'] ? String(args['refresh-token']) : null;

  // 1. Token exchange (unless a token was supplied directly).
  if (!accessToken) {
    console.log('1) Exchange authorization code for tokens');
    var exchange = await req('POST', '/agent/oauth/token', {
      body: {
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: String(args.code),
        redirect_uri: String(args.redirect || ''),
        code_verifier: args.verifier ? String(args.verifier) : undefined,
      },
    });
    if (exchange.status === 200 && exchange.json && exchange.json.accessToken) {
      accessToken = exchange.json.accessToken;
      refreshToken = exchange.json.refreshToken || refreshToken;
      ok('token exchange', 'scope "' + exchange.json.scope + '", expires in ' + exchange.json.expiresIn + 's');
    } else {
      bad('token exchange', 'HTTP ' + exchange.status + ' ' + JSON.stringify(exchange.json));
      return finish();
    }
  } else {
    console.log('1) Using the access token provided via --token');
  }

  // 2. Capability list — must advertise the insights actions.
  console.log('\n2) GET /agent/actions');
  var actions = await req('GET', '/agent/actions', { token: accessToken });
  if (actions.status === 200 && actions.json && Array.isArray(actions.json.actions)) {
    var keys = actions.json.actions.map(function(a) { return a.key; });
    ok('actions listed', keys.length + ' actions');
    if (keys.indexOf('insights.dashboard') !== -1) ok('insights.dashboard advertised');
    else bad('insights.dashboard advertised', 'not in list');
    var destructive = keys.filter(function(k) { return /delete|remove|clear|destroy/i.test(k); });
    if (destructive.length === 0) ok('no destructive actions in allowlist');
    else bad('no destructive actions in allowlist', destructive.join(', '));
  } else {
    bad('actions listed', 'HTTP ' + actions.status + ' ' + JSON.stringify(actions.json));
  }

  // 3. Read the workspace dashboard.
  console.log('\n3) POST /agent/read  insights.dashboard');
  var read = await req('POST', '/agent/read', { token: accessToken, body: { actionKey: 'insights.dashboard', args: {} } });
  if (read.status === 200 && read.json && read.json.result) {
    var d = read.json.result;
    ok('dashboard read',
      'projects=' + (d.projects && d.projects.total) +
      ', tasks=' + (d.tasks && d.tasks.total) +
      ' (overdue ' + (d.tasks && d.tasks.overdue) + ')' +
      ', issues open=' + (d.issues && d.issues.open) +
      ', sites=' + (d.websiteHealth && d.websiteHealth.websites) +
      ', attention items=' + ((d.attention && d.attention.length) || 0));
  } else {
    bad('dashboard read', 'HTTP ' + read.status + ' ' + JSON.stringify(read.json));
  }

  // 4. Optional per-project read.
  if (args.project) {
    console.log('\n4) POST /agent/read  insights.project ' + args.project);
    var proj = await req('POST', '/agent/read', { token: accessToken, body: { actionKey: 'insights.project', args: { projectId: String(args.project) } } });
    if (proj.status === 200 && proj.json && proj.json.result) ok('project read', 'tasks=' + (proj.json.result.tasks && proj.json.result.tasks.total));
    else bad('project read', 'HTTP ' + proj.status + ' ' + JSON.stringify(proj.json));
  }

  // 5. Optional refresh-token rotation.
  if (refreshToken && (args['test-refresh'] || args.revoke)) {
    console.log('\n5) POST /agent/oauth/token  grant_type=refresh_token');
    var refreshed = await req('POST', '/agent/oauth/token', {
      body: { grant_type: 'refresh_token', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: refreshToken },
    });
    if (refreshed.status === 200 && refreshed.json && refreshed.json.accessToken) {
      accessToken = refreshed.json.accessToken;
      refreshToken = refreshed.json.refreshToken || refreshToken;
      ok('refresh rotation');
    } else {
      bad('refresh rotation', 'HTTP ' + refreshed.status + ' ' + JSON.stringify(refreshed.json));
    }
  }

  // 6. Optional kill-switch: revoke the grant and prove the token stops working.
  if (args.revoke) {
    if (!refreshToken) {
      bad('revoke', 'no refresh token available (run with --code, not --token, to test this)');
    } else {
      console.log('\n6) POST /agent/oauth/revoke  then confirm reads are rejected');
      var revoked = await req('POST', '/agent/oauth/revoke', { body: { refresh_token: refreshToken } });
      if (revoked.status === 200) ok('revoke accepted');
      else bad('revoke accepted', 'HTTP ' + revoked.status);
      var afterRevoke = await req('POST', '/agent/read', { token: accessToken, body: { actionKey: 'insights.dashboard', args: {} } });
      if (afterRevoke.status === 401 || afterRevoke.status === 403) ok('read rejected after revoke', 'HTTP ' + afterRevoke.status);
      else bad('read rejected after revoke', 'still HTTP ' + afterRevoke.status + ' — token outlived the grant');
    }
  }

  finish();
}

function finish() {
  console.log('\n' + '-'.repeat(48));
  console.log((failed === 0 ? 'ALL GOOD' : 'SOME CHECKS FAILED') + ': ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(function(err) {
  console.error('\nSmoke test crashed:', err && err.message);
  process.exit(1);
});
