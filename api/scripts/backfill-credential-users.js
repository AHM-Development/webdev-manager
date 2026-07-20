'use strict';

// One-time backfill: link existing website credentials to a registered user
// when the credential's stored name EXACTLY matches a single active user.
//
// Safe to run more than once — it only touches rows with user_id IS NULL, and
// it deliberately skips names that match more than one user (ambiguous) so it
// never guesses. Run it once after deploying the user_id column:
//
//   npm run credentials:backfill          apply the backfill
//   node scripts/backfill-credential-users.js --dry-run   preview only

var db = require('../db/pool');
var schema = require('../db/schema');

function hasFlag(name) {
  return process.argv.indexOf('--' + name) !== -1;
}

async function main() {
  var dryRun = hasFlag('dry-run');

  // Ensure the user_id column exists before we touch it.
  await schema.ensureSchema();

  // Candidates: unlinked credentials whose exact name maps to exactly one
  // active user. Names shared by multiple users are left custom on purpose.
  var candidates = await db.query(
    `SELECT wc.id AS credential_id, wc.name, u.user_id
     FROM website_credentials wc
     JOIN (
       SELECT name, MIN(id) AS user_id
       FROM users
       WHERE deleted_at IS NULL
       GROUP BY name
       HAVING COUNT(*) = 1
     ) u ON u.name = wc.name
     WHERE wc.user_id IS NULL AND wc.deleted_at IS NULL`
  );

  // Names that stay custom because more than one active user shares them.
  var ambiguous = await db.query(
    `SELECT DISTINCT wc.name, COUNT(DISTINCT u.id) AS user_count
     FROM website_credentials wc
     JOIN users u ON u.name = wc.name AND u.deleted_at IS NULL
     WHERE wc.user_id IS NULL AND wc.deleted_at IS NULL
     GROUP BY wc.name
     HAVING COUNT(DISTINCT u.id) > 1`
  );

  if (dryRun) {
    console.log('\n  [dry run] no changes written');
  } else if (candidates.length > 0) {
    await db.query(
      `UPDATE website_credentials wc
       JOIN (
         SELECT name, MIN(id) AS user_id
         FROM users
         WHERE deleted_at IS NULL
         GROUP BY name
         HAVING COUNT(*) = 1
       ) u ON u.name = wc.name
       SET wc.user_id = u.user_id
       WHERE wc.user_id IS NULL AND wc.deleted_at IS NULL`
    );
  }

  console.log('\n  Credential → user backfill');
  console.log('  linked (exact single-user match): ' + candidates.length);
  console.log('  left custom (ambiguous name):     ' + ambiguous.length + ' name(s)');
  if (ambiguous.length > 0) {
    ambiguous.forEach(function(row) {
      console.log('      - "' + row.name + '" matches ' + row.user_count + ' users');
    });
  }
  console.log('');
  process.exit(0);
}

main().catch(function(err) {
  console.error('Backfill failed:', err && err.message);
  process.exit(1);
});
