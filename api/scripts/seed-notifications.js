'use strict';

/**
 * Seed one dummy notification of every wired type onto a user, so you can preview
 * the bell dropdown, the Notifications page, and (optionally) the emails.
 *
 *   node scripts/seed-notifications.js                 # first active superadmin, in-app only
 *   node scripts/seed-notifications.js 5               # user id 5
 *   node scripts/seed-notifications.js jane@ahm.co     # user by email or name
 *   node scripts/seed-notifications.js 5 --email       # also send the emails (needs mail configured)
 *
 * In-app only by default (no surprise emails). Pass --email to also deliver email.
 */

var db = require('../db/pool');
var notifications = require('../modules/notifications/notifications.service');
var mail = require('../modules/auth/mail.service');

var SAMPLES = [
  { type: 'task_assigned', title: 'New task assigned to you', message: 'Homepage hero redesign', actionUrl: '/dashboard/tasks' },
  { type: 'task_review', title: 'You were added as reviewer', message: 'Booking form integration', actionUrl: '/dashboard/tasks' },
  { type: 'task_review_ready', title: 'A task is ready for your review', message: 'Cookie consent banner', actionUrl: '/dashboard/tasks' },
  { type: 'stage_assigned', title: 'You are now the owner of a stage', message: 'Design — Homepage', actionUrl: '/dashboard/client-logs' },
  { type: 'stage_review', title: 'You are the reviewer on a stage', message: 'Development — Booking flow', actionUrl: '/dashboard/client-logs' },
  { type: 'stage_blocked', title: 'A stage you own is blocked', message: 'Content — Services page', actionUrl: '/dashboard/client-logs' },
  { type: 'meeting_actions', title: 'Meeting actions need review', message: '3 action(s) from "Kickoff call" await confirmation', actionUrl: '/dashboard/client-logs' },
  { type: 'scan_completed', title: 'Scan finished — 2 critical issue(s)', message: 'acme-dental.com scored 78/100', actionUrl: '/dashboard/website-health' },
  { type: 'scan_failed', title: 'Website scan failed', message: 'brightsmiles.co.uk — the site timed out', actionUrl: '/dashboard/website-health' },
  { type: 'issue_applied', title: 'Issue applied to a client', message: 'Broken contact form', actionUrl: '/dashboard/issue-boards' },
  { type: 'issue_fixed', title: 'An issue you raised was marked fixed', message: 'Missing SSL redirect', actionUrl: '/dashboard/issue-boards' },
  { type: 'agent_connected', title: 'Viktor was connected to your account', message: 'An AI assistant can now act on your behalf. You can revoke this anytime from your profile.', actionUrl: '/dashboard/my-profile' },
];

async function resolveUser(target) {
  if (target && /^\d+$/.test(target)) {
    var byId = await db.query('SELECT id, name, email FROM users WHERE id = :id AND deleted_at IS NULL LIMIT 1', { id: target });
    return byId[0];
  }
  if (target) {
    var byName = await db.query(
      'SELECT id, name, email FROM users WHERE (email = :t OR name = :t) AND deleted_at IS NULL LIMIT 1',
      { t: target }
    );
    return byName[0];
  }
  var admin = await db.query(
    "SELECT id, name, email FROM users WHERE role = 'superadmin' AND status = 'active' AND deleted_at IS NULL ORDER BY id ASC LIMIT 1"
  );
  return admin[0];
}

async function main() {
  var args = process.argv.slice(2);
  var wantEmail = args.indexOf('--email') !== -1;
  var target = args.filter(function(a) { return a !== '--email'; })[0];

  var user = await resolveUser(target);
  if (!user) {
    console.error('No matching user found' + (target ? ' for "' + target + '"' : '') + '.');
    return;
  }

  console.log('Seeding ' + SAMPLES.length + ' notifications for ' + (user.name || user.email) + ' (id ' + user.id + ')' + (wantEmail ? ' + email' : '') + '\n');

  for (var i = 0; i < SAMPLES.length; i += 1) {
    var sample = SAMPLES[i];
    var notification = await notifications.createNotification(
      {
        userId: user.id,
        audienceType: 'user',
        type: sample.type,
        title: sample.title,
        message: sample.message,
        actionUrl: sample.actionUrl,
        metadata: { seeded: true },
      },
      user,
      {}
    );
    var line = '  ✓ ' + sample.type + ' — ' + sample.title;
    if (wantEmail && user.email) {
      try {
        var result = await mail.sendNotificationEmail(user, notification);
        line += result && result.delivered ? '  [emailed]' : '  [email not configured]';
      } catch (err) {
        line += '  [email failed: ' + (err.message || err) + ']';
      }
    }
    console.log(line);
  }

  console.log('\nDone. Open the bell or /dashboard/notifications to see them.');
}

main()
  .then(function() {
    process.exit(0);
  })
  .catch(function(err) {
    console.error(err);
    process.exit(1);
  });
