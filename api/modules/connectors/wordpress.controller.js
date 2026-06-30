var service = require('./wordpress.service');

function context(req) { return { ip: req.context && req.context.ip, userAgent: req.context && req.context.userAgent }; }

async function get(req, res, next) { try { res.json({ connection: await service.getConnection(req.params.websiteId) }); } catch (err) { next(err); } }
async function pairingCode(req, res, next) { try { res.status(201).json(await service.createPairingCode(req.params.websiteId, req.user, context(req))); } catch (err) { next(err); } }
async function pair(req, res, next) { try { res.status(201).json(await service.pair(req.body || {}, context(req))); } catch (err) { next(err); } }
async function heartbeat(req, res, next) { try { res.json(await service.heartbeat(req)); } catch (err) { next(err); } }
async function refresh(req, res, next) { try { res.json({ snapshot: await service.refreshSnapshot(req.params.websiteId) }); } catch (err) { next(err); } }
async function revoke(req, res, next) { try { await service.revoke(req.params.websiteId, req.user, context(req)); res.status(204).send(); } catch (err) { next(err); } }

module.exports = { get: get, pairingCode: pairingCode, pair: pair, heartbeat: heartbeat, refresh: refresh, revoke: revoke };
