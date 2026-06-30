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

  transporter = hasGoogleOAuthConfig()
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: env.mail.googleEmail,
          clientId: env.mail.googleClientId,
          clientSecret: env.mail.googleClientSecret,
          refreshToken: env.mail.googleRefreshToken,
        },
      })
    : nodemailer.createTransport({
        host: env.mail.host,
        port: env.mail.port,
        secure: env.mail.secure,
        auth: {
          user: env.mail.user,
          pass: env.mail.pass,
        },
      });

  return transporter;
}

async function sendPasswordResetEmail(user, resetUrl) {
  if (!hasSmtpConfig() && !hasGoogleOAuthConfig()) {
    return unavailable('Password reset link', user.email, resetUrl);
  }

  await getTransporter().sendMail({
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

  await getTransporter().sendMail({
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

  await getTransporter().sendMail({
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

module.exports = {
  sendPasswordResetEmail: sendPasswordResetEmail,
  sendInviteEmail: sendInviteEmail,
  sendProfilePasswordOtpEmail: sendProfilePasswordOtpEmail,
};
