var crypto = require('crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomToken(bytes) {
  return crypto.randomBytes(bytes || 32).toString('base64url');
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return [
    crypto.randomBytes(4).toString('hex'),
    crypto.randomBytes(2).toString('hex'),
    crypto.randomBytes(2).toString('hex'),
    crypto.randomBytes(2).toString('hex'),
    crypto.randomBytes(6).toString('hex'),
  ].join('-');
}

function randomDigits(length) {
  var size = Math.max(1, Number(length) || 6);
  var minimum = Math.pow(10, size - 1);
  return String(crypto.randomInt(minimum, minimum * 10));
}

function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000);
}

function mysqlDate(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: String(user.id),
    email: user.email,
    name: user.name,
    firstName: user.first_name || null,
    lastName: user.last_name || null,
    phoneE164: user.phone_e164 || null,
    phoneCountry: user.phone_country || null,
    discordId: user.discord_id || null,
    discordVerifiedAt: user.discord_verified_at || null,
    dateOfBirth: user.date_of_birth || null,
    gender: user.gender || null,
    avatarUrl: user.avatar_url || null,
    role: user.role,
    title: user.title || null,
    status: user.status,
    invitedAt: user.invited_at || null,
    inviteAcceptedAt: user.invite_accepted_at || null,
    passwordUpdatedAt: user.password_updated_at,
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
  };
}

module.exports = {
  sha256: sha256,
  randomToken: randomToken,
  uuid: uuid,
  randomDigits: randomDigits,
  addSeconds: addSeconds,
  mysqlDate: mysqlDate,
  publicUser: publicUser,
};
