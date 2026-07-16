#!/usr/bin/env node

/**
 * Break-glass: reset an EXISTING superadmin's password from the server.
 * Use when a superadmin is locked out (there is no anonymous self-service reset).
 * Requires an interactive terminal + database access.
 *
 *   node scripts/reset-superadmin.js
 */

var bcrypt = require('bcryptjs');
var readline = require('readline');

var env = require('../config/env');
var db = require('../db/pool');

function question(rl, prompt) {
  return new Promise(function(resolve) {
    rl.question(prompt, resolve);
  });
}

function secretQuestion(prompt) {
  return new Promise(function(resolve, reject) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      reject(new Error('An interactive terminal is required to enter the password securely.'));
      return;
    }
    var value = '';
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
    }
    function onData(character) {
      var code = character.charCodeAt(0);
      if (code === 3) { cleanup(); reject(new Error('Cancelled.')); return; } // Ctrl-C
      if (character === '\r' || character === '\n') { cleanup(); resolve(value); return; }
      if (code === 127 || character === '\b') { value = value.slice(0, -1); return; } // backspace/DEL
      value += character;
    }
    process.stdin.on('data', onData);
  });
}

function validPassword(value) {
  return (
    value.length >= 12 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

async function main() {
  var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  var email;
  try {
    email = String(await question(rl, 'Superadmin email: ')).trim().toLowerCase();
  } finally {
    rl.close();
  }
  if (!email) throw new Error('Email is required.');

  var rows = await db.query(
    "SELECT id, name, email, role FROM users WHERE email = :email AND role = 'superadmin' AND deleted_at IS NULL LIMIT 1",
    { email: email }
  );
  var user = rows[0];
  if (!user) throw new Error('No superadmin found with that email.');

  console.log('Resetting password for superadmin: ' + (user.name || user.email));
  var password = await secretQuestion('New password: ');
  var confirmation = await secretQuestion('Confirm password: ');
  if (password !== confirmation) throw new Error('Passwords do not match.');
  if (!validPassword(password)) {
    throw new Error('Password must be 12+ chars with uppercase, lowercase, number, and symbol.');
  }

  var passwordHash = await bcrypt.hash(password, env.auth.bcryptRounds);
  await db.query(
    "UPDATE users SET password_hash = :hash, password_updated_at = UTC_TIMESTAMP(), status = 'active' WHERE id = :id",
    { hash: passwordHash, id: user.id }
  );
  // Force re-login everywhere for safety.
  await db.query(
    "UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP(), revoke_reason = 'superadmin_reset' WHERE user_id = :id AND revoked_at IS NULL",
    { id: user.id }
  );
  await db
    .query(
      `INSERT INTO activity_logs (user_id, user_name, user_email, event_type, action, description, severity, metadata)
       VALUES (:id, :name, :email, 'auth.superadmin_reset_cli', 'auth.superadmin_reset_cli',
               'Superadmin password reset via break-glass CLI', 'warning', JSON_OBJECT('source', 'reset_cli'))`,
      { id: user.id, name: user.name, email: user.email }
    )
    .catch(function() {});

  console.log('Password reset for ' + user.email + '. All existing sessions were revoked.');
}

main()
  .then(function() {
    process.exit(0);
  })
  .catch(function(err) {
    console.error('Reset failed:', err.message);
    process.exit(1);
  });
