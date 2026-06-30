var service = require('./activity-logs.service');

function context(req) {
  return {
    ip: req.context && req.context.ip,
    userAgent: req.context && req.context.userAgent,
  };
}

async function listUserActivity(req, res, next) {
  try {
    res.json(await service.listUserActivity(req.query || {}));
  } catch (err) {
    next(err);
  }
}

async function listWebsiteActivity(req, res, next) {
  try {
    res.json(await service.listWebsiteActivity(req.query || {}));
  } catch (err) {
    next(err);
  }
}

async function userOptions(req, res, next) {
  try {
    res.json(await service.userOptions());
  } catch (err) {
    next(err);
  }
}

async function websiteOptions(req, res, next) {
  try {
    res.json(await service.websiteOptions());
  } catch (err) {
    next(err);
  }
}

async function createWebsiteActivity(req, res, next) {
  try {
    await service.logWebsiteActivity({
      ...(req.body || {}),
      user: req.user,
      ip: context(req).ip,
      userAgent: context(req).userAgent,
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listUserActivity: listUserActivity,
  listWebsiteActivity: listWebsiteActivity,
  userOptions: userOptions,
  websiteOptions: websiteOptions,
  createWebsiteActivity: createWebsiteActivity,
};
