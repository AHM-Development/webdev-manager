var service = require('./notes.service');

function context(req) {
  return { ip: req.context && req.context.ip, userAgent: req.context && req.context.userAgent };
}

async function list(req, res, next) {
  try { res.json({ notes: await service.list(req.query || {}, req.user) }); } catch (err) { next(err); }
}

async function create(req, res, next) {
  try { res.status(201).json({ note: await service.create(req.body || {}, req.user, context(req)) }); } catch (err) { next(err); }
}

async function update(req, res, next) {
  try { res.json({ note: await service.update(req.params.noteId, req.body || {}, req.user, context(req)) }); } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try { await service.remove(req.params.noteId, req.user, context(req)); res.status(204).send(); } catch (err) { next(err); }
}

module.exports = { list: list, create: create, update: update, remove: remove };
