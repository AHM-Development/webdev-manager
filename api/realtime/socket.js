var jwt = require('jsonwebtoken');
var { Server } = require('socket.io');

var env = require('../config/env');
var db = require('../db/pool');
var events = require('./events');

var io;

async function authenticateSocket(socket, next) {
  try {
    var token =
      socket.handshake.auth && socket.handshake.auth.token
        ? socket.handshake.auth.token
        : null;

    if (!token && socket.handshake.headers.authorization) {
      var match = String(socket.handshake.headers.authorization).match(/^Bearer\s+(.+)$/i);
      if (match) token = match[1];
    }

    if (!token) {
      var missing = new Error('Authentication is required.');
      missing.data = { code: 'AUTH_REQUIRED' };
      return next(missing);
    }

    var payload = jwt.verify(token, env.auth.jwtSecret, {
      issuer: env.auth.jwtIssuer,
      audience: env.auth.jwtAudience,
    });
    var rows = await db.query(
      `SELECT u.id, u.email, u.name, u.role, u.status,
              s.id AS session_id, s.revoked_at AS session_revoked_at,
              s.expires_at AS session_expires_at
       FROM users u
       JOIN user_sessions s ON s.id = :sessionId AND s.user_id = u.id
       WHERE u.id = :id AND u.deleted_at IS NULL
       LIMIT 1`,
      { id: payload.sub, sessionId: payload.sid }
    );
    var user = rows[0];

    if (
      !user ||
      user.status !== 'active' ||
      user.session_revoked_at ||
      new Date(user.session_expires_at) <= new Date()
    ) {
      var invalid = new Error('Invalid, expired, or revoked session.');
      invalid.data = { code: 'AUTH_INVALID' };
      return next(invalid);
    }

    socket.user = {
      id: String(user.id),
      email: user.email,
      name: user.name,
      role: user.role,
    };
    socket.sessionId = payload.sid;
    return next();
  } catch (err) {
    err.data = { code: 'TOKEN_INVALID' };
    return next(err);
  }
}

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: env.clientUrl,
      credentials: true,
    },
    path: '/socket.io',
  });

  io.use(authenticateSocket);

  io.on('connection', function(socket) {
    socket.join('workspace');
    socket.join('user:' + socket.user.id);
    socket.join('role:' + socket.user.role);

    socket.emit(events.CONNECTED, {
      userId: socket.user.id,
      sessionId: socket.sessionId,
    });
  });

  return io;
}

function getIo() {
  return io;
}

function emitToUser(userId, eventName, payload) {
  if (!io) return false;
  io.to('user:' + String(userId)).emit(eventName, payload);
  return true;
}

function emitToRole(role, eventName, payload) {
  if (!io) return false;
  io.to('role:' + role).emit(eventName, payload);
  return true;
}

function emitToWorkspace(eventName, payload) {
  if (!io) return false;
  io.to('workspace').emit(eventName, payload);
  return true;
}

module.exports = {
  initSocket: initSocket,
  getIo: getIo,
  emitToUser: emitToUser,
  emitToRole: emitToRole,
  emitToWorkspace: emitToWorkspace,
};
