#!/usr/bin/env node

var bcrypt = require('bcryptjs');
var readline = require('readline');

var env = require('../config/env');
var db = require('../db/pool');
var schema = require('../db/schema');

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
      if (character === '\u0003') {
        cleanup();
        reject(new Error('Bootstrap cancelled.'));
        return;
      }
      if (character === '\r' || character === '\n') {
        cleanup();
        resolve(value);
        return;
      }
      if (character === '\u007f' || character === '\b') {
        value = value.slice(0, -1);
        return;
      }
      value += character;
    }

    process.stdin.on('data', onData);
  });
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
  await schema.ensureSchema();

  var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  var email;
  var name;
  try {
    email = String(await question(rl, 'Email: ')).trim().toLowerCase();
    name = String(await question(rl, 'Full name: ')).trim();
  } finally {
    rl.close();
  }

  if (!validEmail(email)) throw new Error('Enter a valid email address.');
  if (name.length < 2) throw new Error('Full name is required.');

  var password = await secretQuestion('Password: ');
  var confirmation = await secretQuestion('Confirm password: ');
  if (password !== confirmation) throw new Error('Passwords do not match.');
  if (!validPassword(password)) {
    throw new Error(
      'Password must contain at least 12 characters, uppercase, lowercase, number, and symbol.'
    );
  }

  var pool = await db.getPool();
  var connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    var bootstrapResult = await connection.execute(
      'SELECT superadmin_bootstrapped_at FROM system_bootstrap WHERE id = 1 FOR UPDATE'
    );
    var bootstrap = bootstrapResult[0][0];
    var existingResult = await connection.execute(
      "SELECT id FROM users WHERE role = 'superadmin' LIMIT 1 FOR UPDATE"
    );

    if ((bootstrap && bootstrap.superadmin_bootstrapped_at) || existingResult[0][0]) {
      throw new Error('Superadmin bootstrap has already been completed.');
    }

    var duplicateResult = await connection.execute(
      'SELECT id FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE',
      [email]
    );
    if (duplicateResult[0][0]) {
      throw new Error('An account with that email already exists.');
    }

    var passwordHash = await bcrypt.hash(password, env.auth.bcryptRounds);
    var names = name.split(/\s+/);
    var firstName = names.shift();
    var lastName = names.join(' ') || null;
    var insertResult = await connection.execute(
      `INSERT INTO users
        (email, password_hash, name, first_name, last_name, role, status)
       VALUES (?, ?, ?, ?, ?, 'superadmin', 'active')`,
      [email, passwordHash, name, firstName, lastName]
    );
    var userId = insertResult[0].insertId;

    await connection.execute(
      `UPDATE system_bootstrap
       SET superadmin_bootstrapped_at = UTC_TIMESTAMP(), superadmin_user_id = ?
       WHERE id = 1`,
      [userId]
    );
    await connection.execute(
      `INSERT INTO activity_logs
        (user_id, user_name, user_email, event_type, action, description,
         target_type, target_id, target_name, severity, metadata)
       VALUES (?, ?, ?, 'system.superadmin_bootstrapped',
         'system.superadmin_bootstrapped', 'Initial superadmin created',
         'user', ?, ?, 'success', JSON_OBJECT('source', 'bootstrap_cli'))`,
      [userId, name, email, String(userId), name]
    );

    await connection.commit();
    console.log('Superadmin created for:', email);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

main()
  .then(function() {
    process.exit(0);
  })
  .catch(function(err) {
    console.error('Bootstrap failed:', err.message);
    process.exit(1);
  });
