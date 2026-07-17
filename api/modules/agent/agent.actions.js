'use strict';

// The action registry IS the agent allowlist. Every capability Viktor has is a
// key here; anything not registered is denied by default. Each action delegates
// to an existing module service — no new business logic. Deliberately, NO delete
// or clear action exists anywhere in this file: that is the agent hard-cap.
//
//   access : 'read'  -> runs directly on POST /agent/read
//            'write' -> must go through propose -> confirm
//   roles  : the same role group the underlying HTTP route enforces (user ceiling)
//   run    : (user, args, ctx) => Promise<result>   ctx = { ip, userAgent }
//   describe(args) : short human summary shown in the proposal (optional)

var roles = require('../../config/roles');
var projects = require('../projects/projects.service');
var tasks = require('../tasks/tasks.service');
var notes = require('../notes/notes.service');
var issues = require('../issues/issues.service');
var health = require('../website-health/website-health.service');
var clientLogs = require('../client-logs/client-logs.service');
var insights = require('../insights/insights.service');

var ALL = roles.ALL_ROLES;
var WRITE = roles.WRITE_ROLES;
var STAFF_WRITE = roles.STAFF_WRITE_ROLES;
var MANAGER = roles.MANAGER_ROLES;
var SUPER = [roles.ROLES.SUPERADMIN];

function def(access, roleGroup, run, describe) {
  return { access: access, roles: roleGroup, run: run, describe: describe };
}
function read(roleGroup, run) { return def('read', roleGroup, run); }
function write(roleGroup, run, describe) { return def('write', roleGroup, run, describe); }

var ACTIONS = {
  // ----- Insights (read-only aggregate rollups; no writes) -----
  'insights.dashboard': read(ALL, function(u) { return insights.dashboard(u); }),
  'insights.project': read(ALL, function(u, a) { return insights.project(a.projectId, u); }),

  // ----- Projects / Clients (read + update; no create, no delete) -----
  'projects.list': read(ALL, function(u, a) { return projects.listProjects(a.filters || {}); }),
  'projects.get': read(ALL, function(u, a) { return projects.getProject(a.projectId); }),
  'projects.options': read(ALL, function() { return projects.getOptions(); }),
  'projects.update': write(WRITE, function(u, a, c) { return projects.updateProject(a.projectId, a.input || {}, u, c); },
    function(a) { return 'Update project ' + a.projectId; }),
  'projects.setPriority': write(WRITE, function(u, a, c) { return projects.updatePriority(a.projectId, a.priority, u, c); },
    function(a) { return 'Set project ' + a.projectId + ' priority to ' + a.priority; }),
  'projects.setStatus': write(WRITE, function(u, a, c) { return projects.updateStatus(a.projectId, a.status, u, c); },
    function(a) { return 'Set project ' + a.projectId + ' status to ' + a.status; }),

  // ----- Client Logs (full management except any destructive op) -----
  'clientLogs.overview': read(ALL, function(u, a) { return clientLogs.overview(a || {}); }),
  'clientLogs.stages': read(ALL, function(u, a) { return clientLogs.listStages(a.projectId); }),
  'clientLogs.stage': read(ALL, function(u, a) { return clientLogs.getStage(a.stageId); }),
  'clientLogs.launchReadiness': read(ALL, function(u, a) { return clientLogs.computeLaunchReadiness(a.projectId); }),
  'clientLogs.templates': read(ALL, function() { return clientLogs.listTemplates(); }),
  'clientLogs.template': read(ALL, function(u, a) { return clientLogs.getTemplate(a.templateId); }),
  'clientLogs.meetings': read(ALL, function(u, a) { return clientLogs.listMeetings(a.projectId, a.stageId); }),
  'clientLogs.assignableUsers': read(ALL, function() { return clientLogs.listAssignableUsers(); }),
  'clientLogs.applyTemplate': write(MANAGER, function(u, a) { return clientLogs.applyTemplate(a.projectId, a.templateId, u); },
    function(a) { return 'Set up Client Logs for project ' + a.projectId + ' from template ' + a.templateId; }),
  'clientLogs.addStage': write(MANAGER, function(u, a) { return clientLogs.addStage(a.projectId, a.input || {}, u); },
    function(a) { return 'Add a stage to project ' + a.projectId; }),
  'clientLogs.reorderStages': write(MANAGER, function(u, a) { return clientLogs.reorderStages(a.projectId, a.orderedIds || [], u); },
    function(a) { return 'Reorder stages for project ' + a.projectId; }),
  'clientLogs.updateStage': write(STAFF_WRITE, function(u, a) { return clientLogs.updateStage(a.stageId, a.input || {}, u); },
    function(a) { return 'Update stage ' + a.stageId; }),
  'clientLogs.addStageTask': write(STAFF_WRITE, function(u, a, c) { return clientLogs.createStageTask(a.stageId, a.input || {}, u, c); },
    function(a) { return 'Add a task to stage ' + a.stageId; }),
  'clientLogs.linkStageTask': write(STAFF_WRITE, function(u, a) { return clientLogs.linkExistingTask(a.stageId, a.taskId, u); },
    function(a) { return 'Link task ' + a.taskId + ' to stage ' + a.stageId; }),
  'clientLogs.createTemplate': write(SUPER, function(u, a) { return clientLogs.createTemplate(a.input || {}, u); },
    function() { return 'Create a Client Logs template'; }),
  'clientLogs.updateTemplate': write(SUPER, function(u, a) { return clientLogs.updateTemplate(a.templateId, a.input || {}, u); },
    function(a) { return 'Update template ' + a.templateId; }),
  'clientLogs.addTemplateStage': write(SUPER, function(u, a) { return clientLogs.addTemplateStage(a.templateId, a.input || {}); },
    function(a) { return 'Add a stage to template ' + a.templateId; }),
  'clientLogs.updateTemplateStage': write(SUPER, function(u, a) { return clientLogs.updateTemplateStage(a.templateId, a.stageId, a.input || {}); },
    function(a) { return 'Update stage ' + a.stageId + ' on template ' + a.templateId; }),
  'clientLogs.reorderTemplateStages': write(SUPER, function(u, a) { return clientLogs.reorderTemplateStages(a.templateId, a.orderedIds || []); },
    function(a) { return 'Reorder template ' + a.templateId + ' stages'; }),
  'clientLogs.importMeeting': write(STAFF_WRITE, function(u, a) { return clientLogs.importMeeting(a.payload || a, u); },
    function() { return 'Import a meeting'; }),
  'clientLogs.confirmMeetingAction': write(STAFF_WRITE, function(u, a) { return clientLogs.confirmMeetingAction(a.actionId, a.input || {}, u); },
    function(a) { return 'Confirm meeting action ' + a.actionId + ' into a task'; }),
  'clientLogs.rejectMeetingAction': write(STAFF_WRITE, function(u, a) { return clientLogs.rejectMeetingAction(a.actionId, u); },
    function(a) { return 'Reject meeting action ' + a.actionId; }),

  // ----- Website Health (run scans + read results; no profile edit, no form test) -----
  'health.list': read(ALL, function(u, a) { return health.list(a || {}); }),
  'health.website': read(ALL, function(u, a) { return health.getLatest(a.websiteId); }),
  'health.history': read(ALL, function(u, a) { return health.history(a.websiteId, a.limit); }),
  'health.scan': read(ALL, function(u, a) { return health.getScan(a.scanId); }),
  'health.report': read(ALL, function(u, a) { return health.report(a.scanId); }),
  'health.pages': read(ALL, function(u, a) { return health.pages(a.scanId); }),
  'health.capabilities': read(ALL, function() { return health.capabilities(); }),
  'health.startScan': write(WRITE, function(u, a, c) { return health.createScan(a.websiteId, { checks: a.checks, sitemapUrl: a.sitemapUrl }, u, c); },
    function(a) { return 'Start a health scan for website ' + a.websiteId; }),
  'health.cancelScan': write(WRITE, function(u, a, c) { return health.cancel(a.scanId, u, c); },
    function(a) { return 'Cancel scan ' + a.scanId; }),
  'health.retryScan': write(WRITE, function(u, a, c) { return health.retry(a.scanId, u, c); },
    function(a) { return 'Retry scan ' + a.scanId; }),

  // ----- Tasks (add, assign, update, move; no delete) -----
  'tasks.list': read(ALL, function(u, a) { return tasks.listTasks(a.filters || {}, u); }),
  'tasks.get': read(ALL, function(u, a) { return tasks.getTask(a.taskId); }),
  'tasks.assignees': read(ALL, function() { return tasks.listAssignees(); }),
  'tasks.create': write(STAFF_WRITE, function(u, a, c) { return tasks.createTask(a.input || {}, u, c); },
    function(a) { return 'Create task "' + ((a.input && a.input.title) || 'Untitled') + '"'; }),
  'tasks.update': write(STAFF_WRITE, function(u, a, c) { return tasks.updateTask(a.taskId, a.input || {}, u, c); },
    function(a) { return 'Update task ' + a.taskId; }),
  'tasks.setStatus': write(STAFF_WRITE, function(u, a, c) { return tasks.updateStatus(a.taskId, a.status, u, c); },
    function(a) { return 'Set task ' + a.taskId + ' status to ' + a.status; }),
  'tasks.move': write(STAFF_WRITE, function(u, a, c) { return tasks.moveTasks(a.input || {}, u, c); },
    function() { return 'Move / reorder tasks'; }),

  // ----- Notes (requester's own only, enforced by the notes service) -----
  'notes.list': read(ALL, function(u, a) { return notes.list(a || {}, u); }),
  'notes.create': write(ALL, function(u, a, c) { return notes.create(a.input || {}, u, c); },
    function() { return 'Add a note'; }),
  'notes.update': write(ALL, function(u, a, c) { return notes.update(a.noteId, a.input || {}, u, c); },
    function(a) { return 'Update note ' + a.noteId; }),

  // ----- Issue Boards (create, apply to client, checklists; no delete) -----
  'issues.list': read(ALL, function(u, a) { return issues.listIssues(a.filters || {}); }),
  'issues.get': read(ALL, function(u, a) { return issues.getIssue(a.issueId); }),
  'issues.options': read(ALL, function() { return issues.getOptions(); }),
  'issues.create': write(WRITE, function(u, a, c) { return issues.createIssue(a.input || {}, u, c); },
    function(a) { return 'Create issue "' + ((a.input && a.input.title) || 'Untitled') + '"'; }),
  'issues.update': write(WRITE, function(u, a, c) { return issues.updateIssue(a.issueId, a.input || {}, u, c); },
    function(a) { return 'Update issue ' + a.issueId; }),
  'issues.setStatus': write(WRITE, function(u, a, c) { return issues.updateStatus(a.issueId, a.status, u, c); },
    function(a) { return 'Set issue ' + a.issueId + ' status to ' + a.status; }),
  'issues.addApplications': write(WRITE, function(u, a, c) { return issues.addApplications(a.issueId, a.input || {}, u, c); },
    function(a) { return 'Apply issue ' + a.issueId + ' to client(s)'; }),
  'issues.updateApplication': write(WRITE, function(u, a, c) { return issues.updateApplication(a.issueId, a.applicationId, a.input || {}, u, c); },
    function(a) { return 'Update application ' + a.applicationId + ' on issue ' + a.issueId; }),
};

function get(actionKey) {
  return Object.prototype.hasOwnProperty.call(ACTIONS, actionKey) ? ACTIONS[actionKey] : null;
}

/** Self-describing capability list (no run functions) for GET /agent/actions. */
function list() {
  return Object.keys(ACTIONS).map(function(key) {
    return { key: key, access: ACTIONS[key].access, roles: ACTIONS[key].roles };
  });
}

module.exports = { ACTIONS: ACTIONS, get: get, list: list };
