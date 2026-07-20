var nodemailer = require('nodemailer');
var env = require('../../config/env');

var transporter;

function hasSmtpConfig() {
  return !!(env.mail.host && env.mail.user && env.mail.pass);
}

function hasGoogleOAuthConfig() {
  return !!(
    env.mail.googleEmail &&
    env.mail.googleClientId &&
    env.mail.googleClientSecret &&
    env.mail.googleRefreshToken
  );
}

function unavailable(kind, recipient, secret) {
  if (env.nodeEnv === 'production') {
    var err = new Error('Email delivery is not configured.');
    err.status = 503;
    err.code = 'MAIL_NOT_CONFIGURED';
    throw err;
  }
  console.info('%s for %s: %s', kind, recipient, secret);
  return { delivered: false, reason: 'MAIL_NOT_CONFIGURED' };
}

function getTransporter() {
  if (transporter) return transporter;

  // Fail fast instead of hanging forever if the SMTP host is unreachable
  // (e.g. a VPS with outbound SMTP ports blocked).
  var timeouts = {
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  };

  transporter = hasGoogleOAuthConfig()
    ? nodemailer.createTransport(Object.assign({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: env.mail.googleEmail,
          clientId: env.mail.googleClientId,
          clientSecret: env.mail.googleClientSecret,
          refreshToken: env.mail.googleRefreshToken,
        },
      }, timeouts))
    : nodemailer.createTransport(Object.assign({
        host: env.mail.host,
        port: env.mail.port,
        secure: env.mail.secure,
        auth: {
          user: env.mail.user,
          pass: env.mail.pass,
        },
      }, timeouts));

  return transporter;
}

// ---- Gmail API over HTTPS (port 443) ----
// VPS hosts (e.g. Hetzner) commonly block outbound SMTP, so when Google OAuth is
// configured we send through the Gmail REST API instead of SMTP. Reuses the same
// client id / secret / refresh token; needs the Gmail API enabled on the project
// and the https://mail.google.com/ scope on the refresh token.
async function gmailAccessToken() {
  var response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.mail.googleClientId,
      client_secret: env.mail.googleClientSecret,
      refresh_token: env.mail.googleRefreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    signal: AbortSignal.timeout(15000),
  });
  var data = await response.json().catch(function() { return {}; });
  if (!response.ok || !data.access_token) {
    throw new Error('Google token refresh failed: ' + (data.error_description || data.error || response.status));
  }
  return data.access_token;
}

function encodeHeader(value) {
  var text = String(value || '');
  if (/^[\x00-\x7F]*$/.test(text)) return text;
  return '=?UTF-8?B?' + Buffer.from(text, 'utf8').toString('base64') + '?=';
}

// Gmail sends AS the authenticated account, so force the From address to match
// it (like WP Mail SMTP's "Force From") — keeping any display name from MAIL_FROM.
// A From on a different domain than the signer (gmail.com) fails alignment → spam.
function gmailFromHeader() {
  var configured = String(env.mail.from || '');
  var match = configured.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/);
  var displayName = match ? match[1].trim() : '';
  return displayName ? displayName + ' <' + env.mail.googleEmail + '>' : env.mail.googleEmail;
}

function buildRawMessage(opts) {
  var domain = env.mail.googleEmail.split('@')[1] || 'gmail.com';
  var messageId = '<' + Date.now() + '.' + Math.random().toString(36).slice(2) + '@' + domain + '>';
  var lines = [
    'From: ' + gmailFromHeader(),
    'To: ' + opts.to,
    'Subject: ' + encodeHeader(opts.subject),
    'Date: ' + new Date().toUTCString(),
    'Message-ID: ' + messageId,
    'MIME-Version: 1.0',
    'Content-Type: ' + (opts.html ? 'text/html' : 'text/plain') + '; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(opts.html || opts.text || '', 'utf8').toString('base64'),
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendViaGmailApi(opts) {
  var token = await gmailAccessToken();
  var response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: buildRawMessage(opts) }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    var err = await response.json().catch(function() { return {}; });
    throw new Error('Gmail API send failed: ' + ((err.error && err.error.message) || response.status));
  }
  return { delivered: true };
}

// Route a message through the Gmail API (if Google OAuth is set) or SMTP.
async function deliver(mailOptions) {
  if (hasGoogleOAuthConfig()) return sendViaGmailApi(mailOptions);
  return getTransporter().sendMail(mailOptions);
}

async function sendPasswordResetEmail(user, resetUrl) {
  if (!hasSmtpConfig() && !hasGoogleOAuthConfig()) {
    return unavailable('Password reset link', user.email, resetUrl);
  }

  await deliver({
    from: env.mail.from,
    to: user.email,
    subject: 'Reset your AHM Web Manager password',
    text:
      'Use this link to reset your password. It expires soon and can only be used once.\n\n' +
      resetUrl,
  });

  return { delivered: true };
}

async function sendInviteEmail(user, inviteUrl) {
  if (!hasSmtpConfig() && !hasGoogleOAuthConfig()) {
    return unavailable('Invite link', user.email, inviteUrl);
  }

  await deliver({
    from: env.mail.from,
    to: user.email,
    subject: 'You have been invited to AHM Web Manager',
    text:
      'Use this link to complete your account. It expires in ' +
      env.auth.inviteTokenTtlHours +
      ' hours and can only be used once.\n\n' +
      inviteUrl,
  });

  return { delivered: true };
}

async function sendProfilePasswordOtpEmail(user, otp) {
  if (!hasSmtpConfig() && !hasGoogleOAuthConfig()) {
    return unavailable('Profile password OTP', user.email, otp);
  }

  await deliver({
    from: env.mail.from,
    to: user.email,
    subject: 'Your AHM Web Manager password change code',
    text:
      'Use this one-time passcode to change your password. It expires in ' +
      env.auth.profileOtpTtlMinutes +
      ' minutes.\n\n' +
      otp,
  });

  return { delivered: true };
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function absoluteUrl(actionUrl) {
  if (!actionUrl) return null;
  if (/^https?:\/\//i.test(actionUrl)) return actionUrl;
  var base = String(env.clientUrl || '').replace(/\/$/, '');
  return base + (actionUrl.charAt(0) === '/' ? '' : '/') + actionUrl;
}

/** Generic email for an in-app notification. Returns { delivered } and never throws
 *  in non-production when mail isn't configured (degrades like the auth emails). */
async function sendNotificationEmail(user, notification) {
  if (!user || !user.email) return { delivered: false, reason: 'NO_RECIPIENT' };
  if (!hasSmtpConfig() && !hasGoogleOAuthConfig()) {
    return unavailable('Notification email', user.email, notification && notification.title);
  }

  var title = escapeHtml((notification && notification.title) || 'Notification');
  var message = escapeHtml((notification && notification.message) || '');
  var link = absoluteUrl(notification && notification.actionUrl);
  var button = link
    ? '<p style="margin:20px 0"><a href="' + link + '" style="display:inline-block;background:#0b7de3;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Open in AHM Web Manager</a></p>'
    : '';

  await deliver({
    from: env.mail.from,
    to: user.email,
    subject: title,
    text: (notification && notification.message ? notification.message + '\n\n' : '') + (link || ''),
    html:
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#0c1728;max-width:520px">' +
      '<h2 style="font-size:18px;margin:0 0 8px">' + title + '</h2>' +
      (message ? '<p style="color:#45566f;line-height:1.5;margin:0">' + message + '</p>' : '') +
      button +
      '<p style="color:#8a97ab;font-size:12px;margin-top:24px">You can manage which notifications email you in Settings.</p>' +
      '</div>',
  });

  return { delivered: true };
}

/** Batched digest email (daily summary / pre-shift briefing / weekly digest).
 *  `digest` = { title, heading, items:[{title,message,actionUrl}], link }.
 *  Returns { delivered } and degrades like the other emails when mail is off. */
async function sendDigestEmail(user, digest) {
  if (!user || !user.email) return { delivered: false, reason: 'NO_RECIPIENT' };
  if (!hasSmtpConfig() && !hasGoogleOAuthConfig()) {
    return unavailable('Digest email', user.email, digest && digest.title);
  }

  var items = (digest && digest.items) || [];
  var title = escapeHtml((digest && digest.title) || 'Notification digest');
  var heading = escapeHtml((digest && digest.heading) || title);
  var greetingName = user.name ? escapeHtml(String(user.name).split(' ')[0]) : 'there';
  var link = absoluteUrl((digest && digest.link) || '/dashboard/notifications');

  var rowsHtml = items
    .map(function(item) {
      var itemTitle = escapeHtml(item.title || 'Notification');
      var itemMsg = item.message ? escapeHtml(item.message) : '';
      var itemLink = absoluteUrl(item.actionUrl);
      var titleHtml = itemLink
        ? '<a href="' + itemLink + '" style="color:#0b7de3;text-decoration:none;font-weight:600">' + itemTitle + '</a>'
        : '<span style="font-weight:600;color:#0c1728">' + itemTitle + '</span>';
      return (
        '<tr><td style="padding:10px 0;border-bottom:1px solid #edf1f6">' +
        titleHtml +
        (itemMsg ? '<div style="color:#45566f;font-size:14px;line-height:1.4;margin-top:2px">' + itemMsg + '</div>' : '') +
        '</td></tr>'
      );
    })
    .join('');

  var textLines = items.map(function(item) {
    return '- ' + (item.title || 'Notification') + (item.message ? ': ' + item.message : '');
  });

  await deliver({
    from: env.mail.from,
    to: user.email,
    subject: title + ' (' + items.length + ')',
    text:
      'Hi ' + (user.name ? String(user.name).split(' ')[0] : 'there') + ',\n\n' +
      heading + '\n\n' + textLines.join('\n') + '\n\n' + (link || ''),
    html:
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#0c1728;max-width:560px">' +
      '<h2 style="font-size:18px;margin:0 0 4px">' + title + '</h2>' +
      '<p style="color:#45566f;margin:0 0 16px">Hi ' + greetingName + ', ' + heading + '.</p>' +
      '<table style="width:100%;border-collapse:collapse">' + rowsHtml + '</table>' +
      (link
        ? '<p style="margin:20px 0"><a href="' + link + '" style="display:inline-block;background:#0b7de3;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">View all notifications</a></p>'
        : '') +
      '<p style="color:#8a97ab;font-size:12px;margin-top:24px">You can change your digest schedule and channels in Settings.</p>' +
      '</div>',
  });

  return { delivered: true };
}

/** True when a mailer (SMTP or Google OAuth) is configured to actually send. */
function isConfigured() {
  return hasSmtpConfig() || hasGoogleOAuthConfig();
}

/** Send a real test email to `to`. Throws on any send failure so the caller can
 *  report the exact reason (unlike the app emails, this never degrades silently). */
async function sendTestEmail(to) {
  if (!isConfigured()) {
    var err = new Error('Email delivery is not configured.');
    err.status = 400;
    err.code = 'MAIL_NOT_CONFIGURED';
    throw err;
  }
  await deliver({
    from: env.mail.from,
    to: to,
    subject: 'AHM Web Manager — test email',
    text: 'This is a test email from AHM Web Manager. If you received it, email delivery is working.',
    html:
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#0c1728;max-width:520px">' +
      '<h2 style="font-size:18px;margin:0 0 8px">Email delivery works ✅</h2>' +
      '<p style="color:#45566f;line-height:1.5;margin:0">This is a test email from AHM Web Manager. ' +
      'If you received it, your email connector is configured correctly.</p></div>',
  });
  return { delivered: true };
}

module.exports = {
  sendPasswordResetEmail: sendPasswordResetEmail,
  sendInviteEmail: sendInviteEmail,
  sendProfilePasswordOtpEmail: sendProfilePasswordOtpEmail,
  sendNotificationEmail: sendNotificationEmail,
  sendDigestEmail: sendDigestEmail,
  sendTestEmail: sendTestEmail,
  isConfigured: isConfigured,
};
