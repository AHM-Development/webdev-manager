var service = require('./projects.service');

function context(req) {
  return {
    ip: req.context && req.context.ip,
    userAgent: req.context && req.context.userAgent,
  };
}

async function list(req, res, next) {
  try {
    var projects = await service.listProjects({
      assignee: req.query.assignee,
      type: req.query.type,
      status: req.query.status,
      priority: req.query.priority,
    });
    res.json({ projects: projects });
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
    res.json({ project: await service.getProject(req.params.projectId) });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    var project = await service.createProject(req.body || {}, req.user, context(req));
    res.status(201).json({ project: project });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    var project = await service.updateProject(
      req.params.projectId,
      req.body || {},
      req.user,
      context(req)
    );
    res.json({ project: project });
  } catch (err) {
    next(err);
  }
}

async function updatePriority(req, res, next) {
  try {
    var project = await service.updatePriority(
      req.params.projectId,
      req.body && req.body.priority,
      req.user,
      context(req)
    );
    res.json({ project: project });
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    var project = await service.updateStatus(
      req.params.projectId,
      req.body && req.body.status,
      req.user,
      context(req)
    );
    res.json({ project: project });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.deleteProject(req.params.projectId, req.user, context(req));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function previewImport(req, res, next) {
  try {
    res.json(await service.previewImport(req.body || {}, req.file));
  } catch (err) {
    next(err);
  }
}

async function importProjects(req, res, next) {
  try {
    var result = await service.importProjects(
      req.body || {},
      req.file,
      req.user,
      context(req)
    );
    res.status(201).json(result);
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
  updatePriority: updatePriority,
  updateStatus: updateStatus,
  remove: remove,
  previewImport: previewImport,
  importProjects: importProjects,
};
