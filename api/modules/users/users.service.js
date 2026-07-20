var bcrypt = require('bcryptjs');

var env = require('../../config/env');
var db = require('../../db/pool');
var security = require('../../lib/security');
var mail = require('../auth/mail.service');
var activity = require('../auth/activity.service');
var authService = require('../auth/auth.service');
var roleConfig = require('../../config/roles');

var ROLES = roleConfig.ALL_ROLES;
var INVITABLE_ROLES = [
  roleConfig.ROLES.DEVELOPER,
  roleConfig.ROLES.STAFF,
];
var STATUSES = ['active', 'invited', 'disabled'];
var GENDERS = ['male', 'female'];

// Staff job title (designation). Blank/unknown values normalize to null; any
// role may carry one, but it's meaningful mainly for Staff.
function safeTitle(title) {
  var value = String(title || '').trim();
  return roleConfig.STAFF_TITLE_VALUES.indexOf(value) === -1 ? null : value;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function assertEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

function assertPassword(password) {
  return (
    typeof password === 'string' &&
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function fail(status, code, message) {
  var err = new Error(message);
  err.status = status;
  err.code = code;
  throw err;
}

function fullName(firstName, lastName, fallback) {
  var name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name || fallback || '';
}

function mapUser(row) {
  return security.publicUser(row);
}

function safeRole(role) {
  return ROLES.indexOf(role) === -1 ? roleConfig.ROLES.STAFF : role;
}

function safeStatus(status) {
  return STATUSES.indexOf(status) === -1 ? 'active' : status;
}

async function getUserRow(userId) {
  var rows = await db.query(
    `SELECT id, email, name, first_name, last_name, phone_e164, phone_country,
            discord_id, discord_verified_at, date_of_birth, gender, avatar_url,
            role, title, status, invited_at, invite_accepted_at, password_updated_at,
            last_login_at, created_at, updated_at
     FROM users
     WHERE id = :userId AND deleted_at IS NULL
     LIMIT 1`,
    { userId: userId }
  );
  return rows[0];
}

async function listUsers(filters) {
  var where = ['deleted_at IS NULL'];
  var params = {};

  if (filters && filters.role && filters.role !== 'all') {
    where.push('role = :role');
    params.role = safeRole(filters.role);
  }

  if (filters && filters.status && filters.status !== 'all') {
    where.push('status = :status');
    params.status = safeStatus(filters.status);
  }

  if (filters && filters.q) {
    where.push('(name LIKE :q OR email LIKE :q OR first_name LIKE :q OR last_name LIKE :q)');
    params.q = '%' + String(filters.q).trim() + '%';
  }

  var rows = await db.query(
    `SELECT id, email, name, first_name, last_name, phone_e164, phone_country,
            discord_id, discord_verified_at, date_of_birth, gender, avatar_url,
            role, title, status, invited_at, invite_accepted_at, password_updated_at,
            last_login_at, created_at, updated_at
     FROM users
     WHERE ` + where.join(' AND ') + `
     ORDER BY created_at DESC`,
    params
  );

  return rows.map(mapUser);
}

async function getUser(userId) {
  var user = await getUserRow(userId);
  if (!user) fail(404, 'USER_NOT_FOUND', 'User not found.');
  return mapUser(user);
}

async function createInvite(input, actor, context) {
  var email = normalizeEmail(input.email);
  var firstName = String(input.firstName || '').trim();
  var lastName = String(input.lastName || '').trim();
  var role = String(input.role || '');
  var title = safeTitle(input.title);

  if (!assertEmail(email)) fail(400, 'VALIDATION_ERROR', 'Valid email is required.');
  if (!firstName) fail(400, 'VALIDATION_ERROR', 'First name is required.');
  if (!lastName) fail(400, 'VALIDATION_ERROR', 'Last name is required.');
  if (ROLES.indexOf(role) === -1) fail(400, 'VALIDATION_ERROR', 'Role is invalid.');
  if (INVITABLE_ROLES.indexOf(role) === -1) {
    fail(400, 'ROLE_NOT_INVITABLE', 'Only developers and staff can be invited.');
  }
  // A title only applies to Staff; ignore it for other roles.
  if (role !== roleConfig.ROLES.STAFF) title = null;

  // Atomic invite: refuse before creating anything if we can't email it.
  if (!mail.isConfigured()) {
    fail(503, 'MAIL_NOT_CONFIGURED', 'Email delivery must be set up before you can invite users.');
  }

  // Look up by email including soft-deleted rows — email is UNIQUE, so a
  // previously deleted user still owns it and must be revived, not re-inserted.
  var existing = await db.query(
    'SELECT id, status, deleted_at FROM users WHERE email = :email LIMIT 1',
    { email: email }
  );
  if (existing[0] && !existing[0].deleted_at && existing[0].status !== 'invited') {
    fail(409, 'EMAIL_EXISTS', 'A user with this email already exists.');
  }

  var wasNewUser = !existing[0];
  var userId;
  if (existing[0]) {
    userId = existing[0].id;
    await db.query(
      `UPDATE users
       SET first_name = :firstName,
           last_name = :lastName,
           name = :name,
           role = :role,
           title = :title,
           status = 'invited',
           deleted_at = NULL,
           invited_at = UTC_TIMESTAMP()
       WHERE id = :userId`,
      {
        userId: userId,
        firstName: firstName,
        lastName: lastName,
        name: fullName(firstName, lastName, email),
        role: role,
        title: title,
      }
    );
  } else {
    var unusablePasswordHash = await bcrypt.hash(security.randomToken(32), env.auth.bcryptRounds);
    var result = await db.query(
      `INSERT INTO users
        (email, password_hash, name, first_name, last_name, role, title, status, invited_at)
       VALUES
        (:email, :passwordHash, :name, :firstName, :lastName, :role, :title, 'invited', UTC_TIMESTAMP())`,
      {
        email: email,
        passwordHash: unusablePasswordHash,
        name: fullName(firstName, lastName, email),
        firstName: firstName,
        lastName: lastName,
        role: role,
        title: title,
      }
    );
    userId = result.insertId;
  }

  await db.query(
    `UPDATE user_invites
     SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP())
     WHERE user_id = :userId AND accepted_at IS NULL AND revoked_at IS NULL`,
    { userId: userId }
  );

  var token = security.randomToken(48);
  var tokenHash = security.sha256(token);
  var inviteId = security.uuid();
  var expiresAt = new Date(Date.now() + env.auth.inviteTokenTtlHours * 60 * 60 * 1000);

  await db.query(
    `INSERT INTO user_invites
      (id, user_id, email, token_hash, role, title, invited_by, expires_at)
     VALUES
      (:id, :userId, :email, :tokenHash, :role, :title, :invitedBy, :expiresAt)`,
    {
      id: inviteId,
      userId: userId,
      email: email,
      tokenHash: tokenHash,
      role: role,
      title: title,
      invitedBy: actor && actor.id,
      expiresAt: security.mysqlDate(expiresAt),
    }
  );

  var inviteUrl =
    env.clientUrl.replace(/\/$/, '') +
    '/invite/' +
    encodeURIComponent(token);
  var user = await getUserRow(userId);
  // The invite must be emailed to count — if the send fails, roll back so we
  // never leave a dangling invite/user, and surface a clear error.
  try {
    await mail.sendInviteEmail(user, inviteUrl);
  } catch (err) {
    await db.query('DELETE FROM user_invites WHERE id = :id', { id: inviteId }).catch(function() {});
    if (wasNewUser) {
      await db.query('DELETE FROM users WHERE id = :id', { id: userId }).catch(function() {});
    }
    fail(502, 'INVITE_EMAIL_FAILED', 'The invite could not be emailed. Check the email settings and try again.');
  }

  await activity.logActivity({
    userId: actor && actor.id,
    eventType: 'users.invite_created',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { invitedUserId: String(userId), delivered: true },
  });

  return {
    invite: {
      id: inviteId,
      inviteUrl: inviteUrl,
      expiresAt: security.mysqlDate(expiresAt),
      delivered: true,
    },
    user: mapUser(user),
  };
}

async function resendInvite(inviteId, actor, context) {
  var rows = await db.query(
    `SELECT i.id, i.user_id, i.email, i.expires_at, i.accepted_at, i.revoked_at,
            u.id AS uid, u.email AS user_email, u.name, u.first_name, u.last_name
     FROM user_invites i
     JOIN users u ON u.id = i.user_id
     WHERE i.id = :inviteId
     LIMIT 1`,
    { inviteId: inviteId }
  );
  var invite = rows[0];
  if (!invite || invite.accepted_at || invite.revoked_at) {
    fail(400, 'INVITE_NOT_ACTIVE', 'Invite is not active.');
  }

  var token = security.randomToken(48);
  var tokenHash = security.sha256(token);
  var expiresAt = new Date(Date.now() + env.auth.inviteTokenTtlHours * 60 * 60 * 1000);
  await db.query(
    'UPDATE user_invites SET token_hash = :tokenHash, expires_at = :expiresAt WHERE id = :inviteId',
    { tokenHash: tokenHash, expiresAt: security.mysqlDate(expiresAt), inviteId: inviteId }
  );

  var inviteUrl =
    env.clientUrl.replace(/\/$/, '') +
    '/invite/' +
    encodeURIComponent(token);
  var delivery = await mail.sendInviteEmail({ email: invite.email }, inviteUrl);

  await activity.logActivity({
    userId: actor && actor.id,
    eventType: 'users.invite_resent',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { inviteId: inviteId, delivered: delivery.delivered },
  });

  return { inviteUrl: inviteUrl, expiresAt: security.mysqlDate(expiresAt), delivered: delivery.delivered };
}

async function listInvites() {
  var rows = await db.query(
    `SELECT i.id, i.email, i.role, i.expires_at, i.accepted_at, i.revoked_at,
            i.created_at, u.first_name, u.last_name
     FROM user_invites i
     JOIN users u ON u.id = i.user_id
     ORDER BY i.created_at DESC`
  );
  return rows.map(function(row) {
    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      role: row.role,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
    };
  });
}

async function revokeInvite(inviteId, actor, context) {
  var result = await db.query(
    `UPDATE user_invites
     SET revoked_at = UTC_TIMESTAMP()
     WHERE id = :inviteId AND accepted_at IS NULL AND revoked_at IS NULL`,
    { inviteId: inviteId }
  );
  if (!result.affectedRows) fail(404, 'INVITE_NOT_ACTIVE', 'Active invite was not found.');
  await activity.logActivity({
    userId: actor.id,
    eventType: 'users.invite_revoked',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { inviteId: inviteId },
  });
}

async function getInvite(token) {
  var tokenHash = security.sha256(token);
  var rows = await db.query(
    `SELECT i.id, i.email, i.role, i.expires_at, i.accepted_at, i.revoked_at,
            u.first_name, u.last_name, u.status
     FROM user_invites i
     JOIN users u ON u.id = i.user_id
     WHERE i.token_hash = :tokenHash
     LIMIT 1`,
    { tokenHash: tokenHash }
  );
  var invite = rows[0];
  if (
    !invite ||
    invite.status !== 'invited' ||
    invite.accepted_at ||
    invite.revoked_at ||
    new Date(invite.expires_at) <= new Date()
  ) {
    fail(404, 'INVITE_INVALID', 'Invite link is invalid or expired.');
  }

  return {
    id: invite.id,
    email: invite.email,
    firstName: invite.first_name || '',
    lastName: invite.last_name || '',
    role: invite.role,
    expiresAt: invite.expires_at,
  };
}

async function acceptInvite(token, input, context) {
  var invite = await getInvite(token);
  var password = input.password;
  var firstName = String(input.firstName || '').trim();
  var lastName = String(input.lastName || '').trim();
  var gender = input.gender || null;

  if (!firstName) fail(400, 'VALIDATION_ERROR', 'First name is required.');
  if (!lastName) fail(400, 'VALIDATION_ERROR', 'Last name is required.');
  if (!assertPassword(password)) {
    fail(400, 'VALIDATION_ERROR', 'Password does not meet the security requirements.');
  }
  if (gender && GENDERS.indexOf(gender) === -1) fail(400, 'VALIDATION_ERROR', 'Gender is invalid.');

  var tokenHash = security.sha256(token);
  var passwordHash = await bcrypt.hash(password, env.auth.bcryptRounds);
  var pool = await db.getPool();
  var connection = await pool.getConnection();
  var activeInvite;
  try {
    await connection.beginTransaction();
    var rowsResult = await connection.execute(
      `SELECT i.id, i.user_id
       FROM user_invites i
       JOIN users u ON u.id = i.user_id
       WHERE i.token_hash = :tokenHash
         AND i.accepted_at IS NULL
         AND i.revoked_at IS NULL
         AND i.expires_at > UTC_TIMESTAMP()
         AND u.status = 'invited'
       LIMIT 1 FOR UPDATE`,
      { tokenHash: tokenHash }
    );
    activeInvite = rowsResult[0][0];
    if (!activeInvite) fail(404, 'INVITE_INVALID', 'Invite link is invalid or expired.');

    await connection.execute(
      `UPDATE users
     SET password_hash = :passwordHash,
         name = :name,
         first_name = :firstName,
         last_name = :lastName,
         phone_e164 = :phoneE164,
         phone_country = :phoneCountry,
         discord_id = :discordId,
         date_of_birth = :dateOfBirth,
         gender = :gender,
         status = 'active',
         password_updated_at = UTC_TIMESTAMP(),
         invite_accepted_at = UTC_TIMESTAMP()
       WHERE id = :userId`,
    {
      passwordHash: passwordHash,
      name: fullName(firstName, lastName, invite.email),
      firstName: firstName,
      lastName: lastName,
      phoneE164: input.phoneE164 || null,
      phoneCountry: input.phoneCountry || null,
      discordId: input.discordId || null,
      dateOfBirth: input.dateOfBirth || null,
      gender: gender,
      userId: activeInvite.user_id,
    }
    );
    await connection.execute(
      'UPDATE user_invites SET accepted_at = UTC_TIMESTAMP() WHERE id = :inviteId',
      { inviteId: activeInvite.id }
    );
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  var user = await getUserRow(activeInvite.user_id);
  await activity.logActivity({
    userId: activeInvite.user_id,
    eventType: 'users.invite_accepted',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: {},
  });

  return { user: mapUser(user) };
}

async function updateUser(userId, input, actor, context) {
  var existing = await getUserRow(userId);
  if (!existing) fail(404, 'USER_NOT_FOUND', 'User not found.');

  var firstName = input.firstName == null ? existing.first_name : String(input.firstName).trim();
  var lastName = input.lastName == null ? existing.last_name : String(input.lastName).trim();
  var email = input.email == null ? existing.email : normalizeEmail(input.email);
  var role = input.role == null ? existing.role : String(input.role);
  var status = input.status == null ? existing.status : String(input.status);
  var title = input.title === undefined ? existing.title : safeTitle(input.title);

  if (ROLES.indexOf(role) === -1) fail(400, 'VALIDATION_ERROR', 'Role is invalid.');
  if (STATUSES.indexOf(status) === -1) fail(400, 'VALIDATION_ERROR', 'Status is invalid.');
  // A title only applies to Staff; clear it for any other role.
  if (role !== roleConfig.ROLES.STAFF) title = null;

  if (existing.role === roleConfig.ROLES.SUPERADMIN) {
    if (role !== roleConfig.ROLES.SUPERADMIN || status !== 'active') {
      fail(400, 'SUPERADMIN_PROTECTED', 'The superadmin cannot be demoted or disabled.');
    }
  } else if (role === roleConfig.ROLES.SUPERADMIN) {
    fail(400, 'SUPERADMIN_BOOTSTRAP_ONLY', 'Superadmin cannot be assigned through user editing.');
  }

  if (!assertEmail(email)) fail(400, 'VALIDATION_ERROR', 'Valid email is required.');

  await db.query(
    `UPDATE users
     SET email = :email,
         name = :name,
         first_name = :firstName,
         last_name = :lastName,
         role = :role,
         title = :title,
         status = :status
     WHERE id = :userId`,
    {
      email: email,
      name: fullName(firstName, lastName, email),
      firstName: firstName,
      lastName: lastName,
      role: role,
      title: title,
      status: status,
      userId: userId,
    }
  );

  await activity.logActivity({
    userId: actor && actor.id,
    eventType: 'users.updated',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: {
      userId: String(userId),
      previousRole: existing.role,
      role: role,
      previousStatus: existing.status,
      status: status,
    },
  });

  return mapUser(await getUserRow(userId));
}

async function deleteUser(userId, actor, context) {
  if (String(userId) === String(actor.id)) fail(400, 'SELF_DELETE_BLOCKED', 'You cannot delete your own account.');
  var existing = await getUserRow(userId);
  if (!existing) fail(404, 'USER_NOT_FOUND', 'User not found.');
  if (existing.role === roleConfig.ROLES.SUPERADMIN) {
    fail(400, 'SUPERADMIN_PROTECTED', 'The superadmin cannot be deleted.');
  }
  await db.query(
    "UPDATE users SET deleted_at = UTC_TIMESTAMP(), status = 'disabled' WHERE id = :userId",
    { userId: userId }
  );
  await authService.revokeAllSessions(userId, 'user_deleted');
  await activity.logActivity({
    userId: actor && actor.id,
    eventType: 'users.deleted',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { userId: String(userId) },
  });
}

async function getProfile(userId) {
  var user = await getUserRow(userId);
  if (!user) fail(404, 'USER_NOT_FOUND', 'User not found.');
  return mapUser(user);
}

async function updateProfile(userId, input, context) {
  var existing = await getUserRow(userId);
  if (!existing) fail(404, 'USER_NOT_FOUND', 'User not found.');
  var firstName = String(input.firstName || existing.first_name || '').trim();
  var lastName = String(input.lastName || existing.last_name || '').trim();
  var gender = input.gender || null;
  if (!firstName) fail(400, 'VALIDATION_ERROR', 'First name is required.');
  if (!lastName) fail(400, 'VALIDATION_ERROR', 'Last name is required.');
  if (gender && GENDERS.indexOf(gender) === -1) fail(400, 'VALIDATION_ERROR', 'Gender is invalid.');

  await db.query(
    `UPDATE users
     SET name = :name,
         first_name = :firstName,
         last_name = :lastName,
         phone_e164 = :phoneE164,
         phone_country = :phoneCountry,
         discord_id = :discordId,
         date_of_birth = :dateOfBirth,
         gender = :gender
     WHERE id = :userId`,
    {
      name: fullName(firstName, lastName, existing.email),
      firstName: firstName,
      lastName: lastName,
      phoneE164: input.phoneE164 || null,
      phoneCountry: input.phoneCountry || null,
      discordId: input.discordId || null,
      dateOfBirth: input.dateOfBirth || null,
      gender: gender,
      userId: userId,
    }
  );

  await activity.logActivity({
    userId: userId,
    eventType: 'profile.updated',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: {},
  });

  return mapUser(await getUserRow(userId));
}

async function updateAvatar(userId, input, context) {
  var avatarUrl = String(input.avatarUrl || '').trim();
  if (!avatarUrl) fail(400, 'VALIDATION_ERROR', 'Avatar URL is required.');
  await db.query('UPDATE users SET avatar_url = :avatarUrl WHERE id = :userId', {
    avatarUrl: avatarUrl,
    userId: userId,
  });
  await activity.logActivity({
    userId: userId,
    eventType: 'profile.avatar_updated',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: {},
  });
  return mapUser(await getUserRow(userId));
}

async function sendPasswordOtp(user, context) {
  var otp = security.randomDigits(6);
  var otpHash = security.sha256(otp);
  var expiresAt = new Date(Date.now() + env.auth.profileOtpTtlMinutes * 60 * 1000);

  await db.query(
    `UPDATE profile_password_otps
     SET used_at = UTC_TIMESTAMP()
     WHERE user_id = :userId AND used_at IS NULL`,
    { userId: user.id }
  );
  await db.query(
    `INSERT INTO profile_password_otps
      (user_id, otp_hash, expires_at, requested_ip, requested_user_agent)
     VALUES
      (:userId, :otpHash, :expiresAt, :ip, :userAgent)`,
    {
      userId: user.id,
      otpHash: otpHash,
      expiresAt: security.mysqlDate(expiresAt),
      ip: context.ip,
      userAgent: context.userAgent,
    }
  );

  var delivery = await mail.sendProfilePasswordOtpEmail(user, otp);
  await activity.logActivity({
    userId: user.id,
    eventType: 'profile.password_otp_requested',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { delivered: delivery.delivered },
  });
  return { delivered: delivery.delivered, expiresAt: security.mysqlDate(expiresAt) };
}

async function changePassword(user, input, context) {
  var otp = String(input.otp || '');
  var password = input.newPassword || input.password;
  if (!/^\d{6}$/.test(otp)) fail(400, 'VALIDATION_ERROR', 'Valid OTP is required.');
  if (!assertPassword(password)) {
    fail(400, 'VALIDATION_ERROR', 'Password does not meet the security requirements.');
  }

  var rows = await db.query(
    `SELECT id, expires_at, used_at
     FROM profile_password_otps
     WHERE user_id = :userId AND otp_hash = :otpHash
     ORDER BY created_at DESC
     LIMIT 1`,
    { userId: user.id, otpHash: security.sha256(otp) }
  );
  var record = rows[0];
  if (!record || record.used_at || new Date(record.expires_at) <= new Date()) {
    fail(400, 'OTP_INVALID', 'OTP is invalid or expired.');
  }

  var passwordHash = await bcrypt.hash(password, env.auth.bcryptRounds);
  await db.query(
    'UPDATE users SET password_hash = :passwordHash, password_updated_at = UTC_TIMESTAMP() WHERE id = :userId',
    { passwordHash: passwordHash, userId: user.id }
  );
  await db.query('UPDATE profile_password_otps SET used_at = UTC_TIMESTAMP() WHERE id = :id', {
    id: record.id,
  });
  await authService.revokeAllSessions(user.id, 'password_changed');
  await activity.logActivity({
    userId: user.id,
    eventType: 'profile.password_changed',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: {},
  });
}

async function testDiscord(input) {
  var discordId = String(input.discordId || '').trim();
  var valid = /^.{3,120}$/.test(discordId);
  return {
    discordId: discordId,
    valid: valid,
    connected: valid,
    message: valid ? 'Discord ID format looks valid.' : 'Enter a valid Discord username or ID.',
  };
}

// Admin-triggered password recovery: send a hardened, single-use reset link to
// an active user. Replaces the (removed) anonymous self-service flow.
async function sendResetLink(userId, actor, context) {
  var rows = await db.query(
    "SELECT id, email, name, status FROM users WHERE id = :id AND deleted_at IS NULL LIMIT 1",
    { id: userId }
  );
  var user = rows[0];
  if (!user) fail(404, 'USER_NOT_FOUND', 'User not found.');
  if (user.status !== 'active') fail(400, 'USER_NOT_ACTIVE', 'Only active users can be sent a reset link.');

  var delivery = await authService.issueResetLink(user, context);
  await activity.logActivity({
    userId: actor.id,
    eventType: 'users.reset_link_sent',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { targetUserId: String(userId), delivered: delivery.delivered },
  });
  return { delivered: delivery.delivered };
}

module.exports = {
  listUsers: listUsers,
  getUser: getUser,
  sendResetLink: sendResetLink,
  createInvite: createInvite,
  listInvites: listInvites,
  resendInvite: resendInvite,
  revokeInvite: revokeInvite,
  getInvite: getInvite,
  acceptInvite: acceptInvite,
  updateUser: updateUser,
  deleteUser: deleteUser,
  getProfile: getProfile,
  updateProfile: updateProfile,
  updateAvatar: updateAvatar,
  sendPasswordOtp: sendPasswordOtp,
  changePassword: changePassword,
  testDiscord: testDiscord,
};
