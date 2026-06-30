var service = require('./notifications.service');

function context(req) {
  return {
    ip: req.context && req.context.ip,
    userAgent: req.context && req.context.userAgent,
  };
}

async function getSettings(req, res, next) {
  try {
    res.json({ settings: await service.getSettings() });
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    res.json({
      settings: await service.updateSettings(req.body || {}, req.user, context(req)),
    });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    res.json({ notifications: await service.listNotifications(req.user, req.query) });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    res.status(201).json({
      notification: await service.createNotification(req.body || {}, req.user, context(req)),
    });
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    res.json({ notification: await service.markRead(req.params.notificationId, req.user) });
  } catch (err) {
    next(err);
  }
}

async function unreadCount(req, res, next) {
  try {
    res.json({ count: await service.unreadCount(req.user) });
  } catch (err) {
    next(err);
  }
}

async function test(req, res, next) {
  try {
    res.json({
      notification: await service.testNotification(req.body || {}, req.user, context(req)),
    });
  } catch (err) {
    next(err);
  }
}

async function testDiscord(req, res, next) {
  try {
    res.json({
      ok: true,
      message: 'Discord webhook test is queued. Real delivery will be wired with the Discord connector.',
    });
  } catch (err) {
    next(err);
  }
}

async function testEmail(req, res, next) {
  try {
    res.json({
      ok: true,
      message: 'Email test is queued. Real delivery will use the Google OAuth email connector.',
    });
  } catch (err) {
    next(err);
  }
}

async function runDailySummary(req, res, next) {
  try {
    res.json({ notification: await service.runJob('daily_summary', req.user, context(req)) });
  } catch (err) {
    next(err);
  }
}

async function runPreShift(req, res, next) {
  try {
    res.json({ notification: await service.runJob('pre_shift', req.user, context(req)) });
  } catch (err) {
    next(err);
  }
}

async function runWeeklyDigest(req, res, next) {
  try {
    res.json({ notification: await service.runJob('weekly_digest', req.user, context(req)) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSettings: getSettings,
  updateSettings: updateSettings,
  list: list,
  create: create,
  markRead: markRead,
  unreadCount: unreadCount,
  test: test,
  testDiscord: testDiscord,
  testEmail: testEmail,
  runDailySummary: runDailySummary,
  runPreShift: runPreShift,
  runWeeklyDigest: runWeeklyDigest,
};
