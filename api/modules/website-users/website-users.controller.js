var service = require('./website-users.service');

function context(req) {
  return {
    ip: req.context && req.context.ip,
    userAgent: req.context && req.context.userAgent,
  };
}

async function list(req, res, next) {
  try {
    res.json({ credentials: await service.listCredentials(req.query || {}, req.user) });
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

async function create(req, res, next) {
  try {
    var credential = await service.createCredential(req.body || {}, req.user, context(req));
    res.status(201).json({ credential: credential });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    var credential = await service.updateCredential(
      req.params.credentialId,
      req.body || {},
      req.user,
      context(req)
    );
    res.json({ credential: credential });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.deleteCredential(req.params.credentialId, req.user, context(req));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function reveal(req, res, next) {
  try {
    res.json(await service.revealCredential(req.params.credentialId, req.user, context(req)));
  } catch (err) {
    next(err);
  }
}

async function copyPackage(req, res, next) {
  try {
    res.json(await service.copyPackage(req.params.credentialId, req.user, context(req)));
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

async function importCredentials(req, res, next) {
  try {
    res.status(201).json(
      await service.importCredentials(req.body || {}, req.file, req.user, context(req))
    );
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list: list,
  options: options,
  create: create,
  update: update,
  remove: remove,
  reveal: reveal,
  copyPackage: copyPackage,
  previewImport: previewImport,
  importCredentials: importCredentials,
};
