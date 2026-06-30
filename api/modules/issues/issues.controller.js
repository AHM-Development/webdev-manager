var service = require('./issues.service');

function context(req) {
  return {
    ip: req.context && req.context.ip,
    userAgent: req.context && req.context.userAgent,
  };
}

async function list(req, res, next) {
  try {
    res.json({ issues: await service.listIssues(req.query || {}) });
  } catch (err) {
    next(err);
  }
}

async function options(req, res, next) {
  try {
    res.json(await service.getOptions());
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    res.json({ issue: await service.getIssue(req.params.issueId) });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    res.status(201).json({
      issue: await service.createIssue(req.body || {}, req.user, context(req)),
    });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    res.json({
      issue: await service.updateIssue(
        req.params.issueId,
        req.body || {},
        req.user,
        context(req)
      ),
    });
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    res.json({
      issue: await service.updateStatus(
        req.params.issueId,
        req.body && req.body.status,
        req.user,
        context(req)
      ),
    });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.deleteIssue(req.params.issueId, req.user, context(req));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function addApplications(req, res, next) {
  try {
    res.status(201).json({
      issue: await service.addApplications(
        req.params.issueId,
        req.body || {},
        req.user,
        context(req)
      ),
    });
  } catch (err) {
    next(err);
  }
}

async function updateApplication(req, res, next) {
  try {
    res.json({
      issue: await service.updateApplication(
        req.params.issueId,
        req.params.applicationId,
        req.body || {},
        req.user,
        context(req)
      ),
    });
  } catch (err) {
    next(err);
  }
}

async function removeApplication(req, res, next) {
  try {
    res.json({
      issue: await service.removeApplication(
        req.params.issueId,
        req.params.applicationId,
        req.user,
        context(req)
      ),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list: list,
  options: options,
  get: get,
  create: create,
  update: update,
  updateStatus: updateStatus,
  remove: remove,
  addApplications: addApplications,
  updateApplication: updateApplication,
  removeApplication: removeApplication,
};
