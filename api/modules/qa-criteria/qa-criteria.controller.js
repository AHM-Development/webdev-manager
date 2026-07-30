'use strict';

var service = require('./qa-criteria.service');
var uploads = require('../../lib/uploads');

async function getAll(req, res, next) {
  try { res.json(await service.getAll()); } catch (err) { next(err); }
}
async function createGroup(req, res, next) {
  try { res.status(201).json(await service.createGroup(req.body || {})); } catch (err) { next(err); }
}
async function renameGroup(req, res, next) {
  try { res.json(await service.renameGroup(req.params.groupId, req.body || {})); } catch (err) { next(err); }
}
async function deleteGroup(req, res, next) {
  try { res.json(await service.deleteGroup(req.params.groupId)); } catch (err) { next(err); }
}
async function addItem(req, res, next) {
  try { res.status(201).json(await service.addItem(req.params.groupId, req.body || {})); } catch (err) { next(err); }
}
async function updateItem(req, res, next) {
  try { res.json(await service.updateItem(req.params.itemId, req.body || {})); } catch (err) { next(err); }
}
async function deleteItem(req, res, next) {
  try { res.json(await service.deleteItem(req.params.itemId)); } catch (err) { next(err); }
}
async function savePrompt(req, res, next) {
  try { res.json(await service.savePrompt(req.body || {}, req.user)); } catch (err) { next(err); }
}
async function uploadTemplate(req, res, next) {
  try {
    if (!req.file) {
      var err = new Error('No file was uploaded.');
      err.status = 400; err.code = 'NO_FILE';
      throw err;
    }
    res.json(await service.saveTemplate(uploads.qaTemplateUrl(req.file.filename), req.file.originalname, req.user));
  } catch (err) { next(err); }
}

module.exports = {
  getAll: getAll,
  createGroup: createGroup,
  renameGroup: renameGroup,
  deleteGroup: deleteGroup,
  addItem: addItem,
  updateItem: updateItem,
  deleteItem: deleteItem,
  savePrompt: savePrompt,
  uploadTemplate: uploadTemplate,
};
