var service = require('./website-health.service');
var worker = require('./scan-worker');
var checklists = require('./checklist.service');
var wpConnector = require('../connectors/wordpress.service');
var uploads = require('../../lib/uploads');

function context(req) { return { ip: req.context && req.context.ip, userAgent: req.context && req.context.userAgent }; }

async function list(req, res, next) { try { res.json(await service.list(req.query || {})); } catch (err) { next(err); } }
async function latest(req, res, next) { try { res.json(await service.getLatest(req.params.websiteId)); } catch (err) { next(err); } }
async function history(req, res, next) { try { res.json({ scans: await service.history(req.params.websiteId, req.query.limit) }); } catch (err) { next(err); } }
async function createScan(req, res, next) {
  try {
    var body = req.body || {};
    var scan = await service.createScan(body.websiteId, { checks: body.checks, sitemapUrl: body.sitemapUrl }, req.user, context(req));
    await worker.enqueue(scan.id);
    res.status(202).json({ scan: scan });
  } catch (err) { next(err); }
}
async function capabilities(req, res, next) { try { res.json({ capabilities: service.capabilities() }); } catch (err) { next(err); } }
async function getScan(req, res, next) { try { res.json({ scan: await service.getScan(req.params.scanId) }); } catch (err) { next(err); } }
async function cancel(req, res, next) { try { res.json({ scan: await service.cancel(req.params.scanId, req.user, context(req)) }); } catch (err) { next(err); } }
async function retry(req, res, next) {
  try {
    var scan = await service.retry(req.params.scanId, req.user, context(req));
    await worker.enqueue(scan.id);
    res.status(202).json({ scan: scan });
  } catch (err) { next(err); }
}
async function pages(req, res, next) { try { res.json({ pages: await service.pages(req.params.scanId) }); } catch (err) { next(err); } }
async function updateFinding(req, res, next) { try { res.json({ finding: await service.updateFinding(req.params.findingId, req.body || {}, req.user) }); } catch (err) { next(err); } }
async function getProfile(req, res, next) { try { res.json({ profile: await service.getProfile(req.params.websiteId) }); } catch (err) { next(err); } }
async function updateProfile(req, res, next) { try { res.json({ profile: await service.updateProfile(req.params.websiteId, req.body || {}) }); } catch (err) { next(err); } }
async function checklistList(req, res, next) { try { res.json({ checklists: checklists.all(false) }); } catch (err) { next(err); } }
async function checklistGet(req, res, next) { try { var item = checklists.read(req.params.key); if (!item) return res.status(404).json({ error: { code: 'CHECKLIST_NOT_FOUND', message: 'Checklist not found.' } }); res.json({ checklist: item }); } catch (err) { next(err); } }
async function report(req, res, next) { try { var data = await service.report(req.params.scanId); res.setHeader('Content-Type', 'application/json'); res.setHeader('Content-Disposition', 'attachment; filename="website-health-' + req.params.scanId + '.json"'); res.send(JSON.stringify(data, null, 2)); } catch (err) { next(err); } }
async function sendFormTest(req, res, next) {
  try {
    var body = req.body || {};
    var result = await wpConnector.sendFormTest(req.params.websiteId, body.formId, body.to);
    res.json({ result: result });
  } catch (err) { next(err); }
}

async function uploadEvidence(req, res, next) {
  try {
    if (!req.file) {
      res.status(400).json({ error: { code: 'NO_FILE', message: 'No image was uploaded.' } });
      return;
    }
    res.status(201).json({ id: req.file.filename, url: uploads.formEvidenceUrl(req.file.filename), name: req.file.originalname });
  } catch (err) { next(err); }
}

async function listFormVerifications(req, res, next) {
  try { res.json({ verifications: await service.listFormVerifications(req.params.websiteId) }); } catch (err) { next(err); }
}

async function saveFormVerification(req, res, next) {
  try {
    res.json({ verification: await service.saveFormVerification(req.params.websiteId, req.params.formKey, req.body || {}, req.user) });
  } catch (err) { next(err); }
}

async function deleteFormVerification(req, res, next) {
  try { res.json(await service.deleteFormVerification(req.params.websiteId, req.params.formKey)); } catch (err) { next(err); }
}

async function listDesignVerifications(req, res, next) {
  try { res.json({ verifications: await service.listDesignVerifications(req.params.websiteId) }); } catch (err) { next(err); }
}

async function saveDesignVerification(req, res, next) {
  try {
    res.json({ verification: await service.saveDesignVerification(req.params.websiteId, req.params.pageKey, req.body || {}, req.user) });
  } catch (err) { next(err); }
}

async function deleteDesignVerification(req, res, next) {
  try { res.json(await service.deleteDesignVerification(req.params.websiteId, req.params.pageKey)); } catch (err) { next(err); }
}

module.exports = { list: list, latest: latest, history: history, createScan: createScan, capabilities: capabilities, getScan: getScan, cancel: cancel, retry: retry, pages: pages, updateFinding: updateFinding, getProfile: getProfile, updateProfile: updateProfile, checklistList: checklistList, checklistGet: checklistGet, report: report, sendFormTest: sendFormTest, uploadEvidence: uploadEvidence, listFormVerifications: listFormVerifications, saveFormVerification: saveFormVerification, deleteFormVerification: deleteFormVerification, listDesignVerifications: listDesignVerifications, saveDesignVerification: saveDesignVerification, deleteDesignVerification: deleteDesignVerification };
