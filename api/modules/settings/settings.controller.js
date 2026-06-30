var service = require('./settings.service');

function context(req) {
  return {
    ip: req.context && req.context.ip,
    userAgent: req.context && req.context.userAgent,
  };
}

async function getWorkspace(req, res, next) {
  try {
    res.json({ workspace: await service.getWorkspace() });
  } catch (err) {
    next(err);
  }
}

async function updateWorkspace(req, res, next) {
  try {
    res.json({
      workspace: await service.updateWorkspace(req.body || {}, req.user, context(req)),
    });
  } catch (err) {
    next(err);
  }
}

async function getEmailConnector(req, res, next) {
  try {
    res.json({ connector: await service.getEmailConnector() });
  } catch (err) {
    next(err);
  }
}

async function updateEmailConnector(req, res, next) {
  try {
    res.json({
      connector: await service.updateEmailConnector(req.body || {}, req.user, context(req)),
    });
  } catch (err) {
    next(err);
  }
}

async function connectGoogle(req, res, next) {
  try {
    res.json({ connector: await service.connectGoogle(req.user, context(req)) });
  } catch (err) {
    next(err);
  }
}

async function disconnectGoogle(req, res, next) {
  try {
    res.json({ connector: await service.disconnectGoogle(req.user, context(req)) });
  } catch (err) {
    next(err);
  }
}

async function testEmailConnector(req, res, next) {
  try {
    res.json({ connector: await service.testEmailConnector(req.user, context(req)) });
  } catch (err) {
    next(err);
  }
}

async function getAiPrompt(req, res, next) {
  try {
    res.json({ prompt: await service.getAiPrompt(req.params.promptKey) });
  } catch (err) {
    next(err);
  }
}

async function updateAiPrompt(req, res, next) {
  try {
    res.json({
      prompt: await service.updateAiPrompt(
        req.params.promptKey,
        req.body || {},
        req.user,
        context(req)
      ),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getWorkspace: getWorkspace,
  updateWorkspace: updateWorkspace,
  getEmailConnector: getEmailConnector,
  updateEmailConnector: updateEmailConnector,
  connectGoogle: connectGoogle,
  disconnectGoogle: disconnectGoogle,
  testEmailConnector: testEmailConnector,
  getAiPrompt: getAiPrompt,
  updateAiPrompt: updateAiPrompt,
};
