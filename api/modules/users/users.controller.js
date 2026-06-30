var service = require('./users.service');

function context(req) {
  return {
    ip: req.context && req.context.ip,
    userAgent: req.context && req.context.userAgent,
  };
}

async function listUsers(req, res, next) {
  try {
    res.json({
      users: await service.listUsers({
        q: req.query.q,
        role: req.query.role,
        status: req.query.status,
      }),
    });
  } catch (err) {
    next(err);
  }
}

async function getUser(req, res, next) {
  try {
    res.json({ user: await service.getUser(req.params.userId) });
  } catch (err) {
    next(err);
  }
}

async function createInvite(req, res, next) {
  try {
    var result = await service.createInvite(req.body || {}, req.user, context(req));
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function listInvites(req, res, next) {
  try {
    res.json({ invites: await service.listInvites() });
  } catch (err) {
    next(err);
  }
}

async function resendInvite(req, res, next) {
  try {
    res.json({
      invite: await service.resendInvite(req.params.inviteId, req.user, context(req)),
    });
  } catch (err) {
    next(err);
  }
}

async function revokeInvite(req, res, next) {
  try {
    await service.revokeInvite(req.params.inviteId, req.user, context(req));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    res.json({
      user: await service.updateUser(req.params.userId, req.body || {}, req.user, context(req)),
    });
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    await service.deleteUser(req.params.userId, req.user, context(req));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function getInvite(req, res, next) {
  try {
    res.json({ invite: await service.getInvite(req.params.token) });
  } catch (err) {
    next(err);
  }
}

async function acceptInvite(req, res, next) {
  try {
    res.json({
      user: (await service.acceptInvite(req.params.token, req.body || {}, context(req))).user,
    });
  } catch (err) {
    next(err);
  }
}

async function getProfile(req, res, next) {
  try {
    res.json({ user: await service.getProfile(req.user.id) });
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    res.json({ user: await service.updateProfile(req.user.id, req.body || {}, context(req)) });
  } catch (err) {
    next(err);
  }
}

async function updateAvatar(req, res, next) {
  try {
    res.json({ user: await service.updateAvatar(req.user.id, req.body || {}, context(req)) });
  } catch (err) {
    next(err);
  }
}

async function sendPasswordOtp(req, res, next) {
  try {
    res.json({ otp: await service.sendPasswordOtp(req.user, context(req)) });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    await service.changePassword(req.user, req.body || {}, context(req));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function testDiscord(req, res, next) {
  try {
    res.json(await service.testDiscord(req.body || {}));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listUsers: listUsers,
  getUser: getUser,
  listInvites: listInvites,
  createInvite: createInvite,
  resendInvite: resendInvite,
  revokeInvite: revokeInvite,
  updateUser: updateUser,
  deleteUser: deleteUser,
  getInvite: getInvite,
  acceptInvite: acceptInvite,
  getProfile: getProfile,
  updateProfile: updateProfile,
  updateAvatar: updateAvatar,
  sendPasswordOtp: sendPasswordOtp,
  changePassword: changePassword,
  testDiscord: testDiscord,
};
