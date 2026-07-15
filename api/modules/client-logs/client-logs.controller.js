var service = require('./client-logs.service');

// Templates
async function listTemplates(req, res, next) { try { res.json({ templates: await service.listTemplates() }); } catch (err) { next(err); } }
async function getTemplate(req, res, next) { try { res.json({ template: await service.getTemplate(req.params.templateId) }); } catch (err) { next(err); } }
async function createTemplate(req, res, next) { try { res.status(201).json({ template: await service.createTemplate(req.body || {}, req.user) }); } catch (err) { next(err); } }
async function updateTemplate(req, res, next) { try { res.json({ template: await service.updateTemplate(req.params.templateId, req.body || {}, req.user) }); } catch (err) { next(err); } }
async function deleteTemplate(req, res, next) { try { res.json(await service.deleteTemplate(req.params.templateId)); } catch (err) { next(err); } }
async function addTemplateStage(req, res, next) { try { res.status(201).json({ template: await service.addTemplateStage(req.params.templateId, req.body || {}) }); } catch (err) { next(err); } }
async function updateTemplateStage(req, res, next) { try { res.json({ template: await service.updateTemplateStage(req.params.templateId, req.params.stageId, req.body || {}) }); } catch (err) { next(err); } }
async function reorderTemplateStages(req, res, next) { try { res.json({ template: await service.reorderTemplateStages(req.params.templateId, (req.body || {}).orderedIds) }); } catch (err) { next(err); } }
async function removeTemplateStage(req, res, next) { try { res.json({ template: await service.removeTemplateStage(req.params.templateId, req.params.stageId) }); } catch (err) { next(err); } }

// Stages per website
async function applyTemplate(req, res, next) { try { res.status(201).json({ stages: await service.applyTemplate(req.params.projectId, (req.body || {}).templateId, req.user) }); } catch (err) { next(err); } }
async function listStages(req, res, next) { try { res.json({ stages: await service.listStages(req.params.projectId) }); } catch (err) { next(err); } }
async function getStage(req, res, next) { try { res.json({ stage: await service.getStage(req.params.stageId) }); } catch (err) { next(err); } }
async function updateStage(req, res, next) { try { res.json({ stage: await service.updateStage(req.params.stageId, req.body || {}, req.user) }); } catch (err) { next(err); } }
async function addStage(req, res, next) { try { res.status(201).json({ stages: await service.addStage(req.params.projectId, req.body || {}, req.user) }); } catch (err) { next(err); } }
async function removeStage(req, res, next) { try { res.json({ stages: await service.removeStage(req.params.stageId, req.user) }); } catch (err) { next(err); } }
async function reorderStages(req, res, next) { try { res.json({ stages: await service.reorderStages(req.params.projectId, (req.body || {}).orderedIds, req.user) }); } catch (err) { next(err); } }

async function assignableUsers(req, res, next) { try { res.json({ users: await service.listAssignableUsers() }); } catch (err) { next(err); } }
async function createStageTask(req, res, next) { try { res.status(201).json({ stage: await service.createStageTask(req.params.stageId, req.body || {}, req.user) }); } catch (err) { next(err); } }
async function linkStageTask(req, res, next) { try { res.json({ stage: await service.linkExistingTask(req.params.stageId, (req.body || {}).taskId, req.user) }); } catch (err) { next(err); } }
async function unlinkStageTask(req, res, next) { try { res.json({ stage: await service.unlinkTask(req.params.stageId, req.params.taskId, req.user) }); } catch (err) { next(err); } }
async function launchReadiness(req, res, next) { try { res.json({ readiness: await service.computeLaunchReadiness(req.params.projectId) }); } catch (err) { next(err); } }
async function overview(req, res, next) { try { res.json(await service.overview(req.query || {})); } catch (err) { next(err); } }
async function clearClientLogs(req, res, next) { try { res.json(await service.clearClientLogs(req.params.projectId, req.user)); } catch (err) { next(err); } }


// Meetings & actions
async function importMeeting(req, res, next) { try { res.status(201).json({ meeting: await service.importMeeting(req.body || {}, req.user) }); } catch (err) { next(err); } }
async function listMeetings(req, res, next) { try { res.json({ meetings: await service.listMeetings(req.params.projectId, req.query.stageId) }); } catch (err) { next(err); } }
async function confirmMeetingAction(req, res, next) { try { res.json({ meeting: await service.confirmMeetingAction(req.params.actionId, req.body || {}, req.user) }); } catch (err) { next(err); } }
async function rejectMeetingAction(req, res, next) { try { res.json({ meeting: await service.rejectMeetingAction(req.params.actionId, req.user) }); } catch (err) { next(err); } }

module.exports = {
  importMeeting: importMeeting,
  listMeetings: listMeetings,
  confirmMeetingAction: confirmMeetingAction,
  rejectMeetingAction: rejectMeetingAction,
  assignableUsers: assignableUsers,
  createStageTask: createStageTask,
  linkStageTask: linkStageTask,
  unlinkStageTask: unlinkStageTask,
  launchReadiness: launchReadiness,
  overview: overview,
  clearClientLogs: clearClientLogs,
  listTemplates: listTemplates,
  getTemplate: getTemplate,
  createTemplate: createTemplate,
  updateTemplate: updateTemplate,
  deleteTemplate: deleteTemplate,
  addTemplateStage: addTemplateStage,
  updateTemplateStage: updateTemplateStage,
  reorderTemplateStages: reorderTemplateStages,
  removeTemplateStage: removeTemplateStage,
  applyTemplate: applyTemplate,
  listStages: listStages,
  getStage: getStage,
  updateStage: updateStage,
  addStage: addStage,
  removeStage: removeStage,
  reorderStages: reorderStages,
};
