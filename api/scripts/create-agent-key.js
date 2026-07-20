'use strict';

// Create / list / revoke a Viktor agent API key (client-credentials style — no
// browser consent). Each key authenticates AS a dedicated "Viktor (AI Agent)"
// service-account user, so the role ceiling + allowlist + propose→confirm all
// still apply. The plaintext key is shown ONCE at creation.
//
//   npm run agent:key                         create a key (role: superadmin)
//   node scripts/create-agent-key.js --role developer
//   node scripts/create-agent-key.js --list
//   node scripts/create-agent-key.js --revoke <keyId>

var bcrypt = require('bcryptjs');
var db = require('../db/pool');
var schema = require('../db/schema');
var security = require('../lib/security');
var env = require('../config/env');
var tokens = require('../modules/agent/agent.tokens');
var roles = require('../config/roles');

var SERVICE_EMAIL = 'viktor-agent@ahm.internal';
var SERVICE_NAME = 'Viktor (AI Agent)';

function arg(name) {
  var i = process.argv.indexOf('--' + name);
  if (i === -1) return undefined;
  var next = process.argv[i + 1];
  return next && next.indexOf('--') !== 0 ? next : true;
}

async function ensureServiceUser(role) {
  var rows = await db.query('SELECT id FROM users WHERE email = :email LIMIT 1', { email: SERVICE_EMAIL });
  if (rows[0]) {
    await db.query(
      "UPDATE users SET role = :role, status = 'active', deleted_at = NULL, name = :name WHERE id = :id",
      { role: role, name: SERVICE_NAME, id: rows[0].id }
    );
    return rows[0].id;
  }
  var passwordHash = await bcrypt.hash(security.randomToken(32), env.auth.bcryptRounds);
  var result = await db.query(
    `INSERT INTO users (email, password_hash, name, first_name, last_name, role, status)
     VALUES (:email, :hash, :name, 'Viktor', 'Agent', :role, 'active')`,
    { email: SERVICE_EMAIL, hash: passwordHash, name: SERVICE_NAME, role: role }
  );
  return result.insertId;
}

async function main() {
  await schema.ensureSchema();

  if (arg('list')) {
    var list = await db.query(
      `SELECT k.id, k.name, u.role, k.last_used_at, k.revoked_at, k.created_at
       FROM agent_api_keys k JOIN users u ON u.id = k.user_id
       ORDER BY k.created_at DESC`
    );
    if (!list.length) console.log('No agent API keys.');
    else console.table(list);
    process.exit(0);
  }

  if (arg('revoke')) {
    var id = String(arg('revoke'));
    var res = await db.query(
      'UPDATE agent_api_keys SET revoked_at = UTC_TIMESTAMP() WHERE id = :id AND revoked_at IS NULL',
      { id: id }
    );
    console.log(res.affectedRows ? 'Revoked key ' + id : 'No active key with id ' + id);
    process.exit(0);
  }

  var role = String(arg('role') || roles.ROLES.SUPERADMIN);
  if (roles.ALL_ROLES.indexOf(role) === -1) {
    console.error('Invalid role "' + role + '". Use one of: ' + roles.ALL_ROLES.join(', '));
    process.exit(2);
  }

  var userId = await ensureServiceUser(role);
  var key = tokens.newApiKey();
  var keyId = security.uuid();
  await db.query(
    `INSERT INTO agent_api_keys (id, name, key_hash, user_id, scope)
     VALUES (:id, :name, :hash, :userId, 'agent:read agent:write')`,
    { id: keyId, name: 'Viktor key', hash: tokens.hashApiKey(key), userId: userId }
  );

  console.log('\n  Viktor agent API key created');
  console.log('  role (ceiling): ' + role);
  console.log('  key id:         ' + keyId + '   (use this to --revoke later)');
  console.log('\n  Give this to Viktor as a Bearer token — shown ONCE, not stored in plaintext:\n');
  console.log('      ' + key + '\n');
  console.log('  Viktor calls, e.g.:');
  console.log('      Authorization: Bearer ' + key);
  console.log('      POST <base>/agent/read     { "actionKey": "insights.dashboard" }');
  console.log('      POST <base>/agent/propose  { "actionKey": "tasks.setStatus", "args": {...} }');
  console.log('      POST <base>/agent/confirm  { "proposalId": "..." }\n');
  process.exit(0);
}

main().catch(function(err) {
  console.error('Failed:', err && err.message);
  process.exit(1);
});
