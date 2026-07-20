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

var env = require('../../config/env');
var roles = require('../../config/roles');
var projects = require('../projects/projects.service');
var tasks = require('../tasks/tasks.service');
var notes = require('../notes/notes.service');
var issues = require('../issues/issues.service');
var health = require('../website-health/website-health.service');
var clientLogs = require('../client-logs/client-logs.service');
var insights = require('../insights/insights.service');
var taskOrganizer = require('../ai/task-organizer.service');

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

// Agent date handling: today's date (YYYY-MM-DD) in the workspace timezone,
// with an optional day offset.
function agentToday(offsetDays) {
  var d = new Date();
  if (offsetDays) d.setUTCDate(d.getUTCDate() + offsetDays);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: env.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}
// Resolve an agent-supplied date: understand today/tomorrow/yesterday, and pass
// a YYYY-MM-DD through untouched (tasks.service validates the format).
function agentDate(value) {
  var v = String(value == null ? '' : value).trim().toLowerCase();
  if (!v) return null;
  if (v === 'today') return agentToday(0);
  if (v === 'tomorrow') return agentToday(1);
  if (v === 'yesterday') return agentToday(-1);
  return value;
}
// Task input with agent-friendly dates: default the start date to today when the
// agent didn't specify one, and resolve any relative due date.
function withAgentDates(input) {
  var out = Object.assign({}, input || {});
  out.startDate = input && input.startDate ? agentDate(input.startDate) : agentToday(0);
  if (input && input.dueDate) out.dueDate = agentDate(input.dueDate);
  return out;
}

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
  'tasks.create': write(STAFF_WRITE, function(u, a, c) { return tasks.createTask(withAgentDates(a.input || {}), u, c); },
    function(a) { return 'Create task "' + ((a.input && a.input.title) || 'Untitled') + '"'; }),
  // AI-organized task request: a person asks Viktor for a task; the organizer
  // arranges it and it's saved as a PENDING request attributed to that requestor,
  // so it enters the review queue and (once approved) shows on the assignee's board.
  // Pass the requestor (their email or full name) + a brief; provided fields win.
  'tasks.createOrganized': write(STAFF_WRITE, async function(u, a, c) {
    var i = a.input || {};
    if (!i.requestor && !i.requestedByUserId) {
      var e = new Error('A requestor (email or name of the person who asked) is required.');
      e.status = 400; e.code = 'REQUESTOR_REQUIRED';
      throw e;
    }
    var organized = await taskOrganizer.organizeTask(
      { sourceText: i.description || i.brief || '', projectId: i.projectId },
      u, c
    );
    var draft = organized.draft;
    return tasks.createTask({
      projectId: i.projectId,
      title: i.title || draft.title,
      description: draft.description,
      checklist: i.checklist || draft.checklist,
      attachments: draft.attachments,
      priority: i.priority || draft.priority,
      status: i.status || draft.status,
      assigneeName: i.assignee || i.assigneeName,
      startDate: i.startDate ? agentDate(i.startDate) : agentToday(0),
      dueDate: i.dueDate ? agentDate(i.dueDate) : undefined,
      requestor: i.requestor,
      requestedByUserId: i.requestedByUserId,
    }, u, c);
  }, function(a) {
    var i = a.input || {};
    return 'Create a task request' + (i.requestor ? ' from ' + i.requestor : '') +
      (i.projectId ? ' for client ' + i.projectId : '') +
      (i.description ? ': "' + String(i.description).slice(0, 80) + '"' : '');
  }),
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

// Advertised argument shapes for GET /agent/actions. The structure mirrors what
// each action expects in `args` — note create/update actions nest their fields
// under `input`, while id/field actions take them at the top level. IDs are
// strings. This is documentation for the agent, not enforced validation.
var TASK_STATUS = 'Backlog|In Progress|Review|Blocked|Done';
var PRIORITY = 'Low|Medium|High';

var ARGS = {
  'insights.dashboard': {},
  'insights.project': { projectId: 'string id, required' },

  'projects.list': { filters: 'object, optional: { status, priority, assignee, q }' },
  'projects.get': { projectId: 'string id, required' },
  'projects.options': {},
  'projects.update': { projectId: 'string id, required', input: 'object: { clientName, type, status, priority, assigneeName, figmaLink, domainManagement, serverLocation, websites:[{name,url}] }' },
  'projects.setPriority': { projectId: 'string id, required', priority: 'High|Medium|Low, required' },
  'projects.setStatus': { projectId: 'string id, required', status: 'Live|Staging|In Progress|Site Handed Over|Churned, required' },

  'clientLogs.overview': { q: 'string, optional', status: 'string, optional', page: 'number, optional', pageSize: 'number, optional' },
  'clientLogs.stages': { projectId: 'string id, required' },
  'clientLogs.stage': { stageId: 'string id, required' },
  'clientLogs.launchReadiness': { projectId: 'string id, required' },
  'clientLogs.templates': {},
  'clientLogs.template': { templateId: 'string id, required' },
  'clientLogs.meetings': { projectId: 'string id, required', stageId: 'string id, optional' },
  'clientLogs.assignableUsers': {},
  'clientLogs.applyTemplate': { projectId: 'string id, required', templateId: 'string id, required' },
  'clientLogs.addStage': { projectId: 'string id, required', input: 'object: { name, ... }' },
  'clientLogs.reorderStages': { projectId: 'string id, required', orderedIds: 'string[] of stage ids' },
  'clientLogs.updateStage': { stageId: 'string id, required', input: 'object: { name, status, ownerUserId, reviewerUserId, dueDate, ... }' },
  'clientLogs.addStageTask': { stageId: 'string id, required', input: 'object: task fields (see tasks.create input)' },
  'clientLogs.linkStageTask': { stageId: 'string id, required', taskId: 'string id, required' },
  'clientLogs.createTemplate': { input: 'object: { name, ... }' },
  'clientLogs.updateTemplate': { templateId: 'string id, required', input: 'object' },
  'clientLogs.addTemplateStage': { templateId: 'string id, required', input: 'object: { name, ... }' },
  'clientLogs.updateTemplateStage': { templateId: 'string id, required', stageId: 'string id, required', input: 'object' },
  'clientLogs.reorderTemplateStages': { templateId: 'string id, required', orderedIds: 'string[] of stage ids' },
  'clientLogs.importMeeting': { payload: 'object: meeting import payload' },
  'clientLogs.confirmMeetingAction': { actionId: 'string id, required', input: 'object, optional' },
  'clientLogs.rejectMeetingAction': { actionId: 'string id, required' },

  'health.list': { filters: 'object, optional' },
  'health.website': { websiteId: 'string id, required' },
  'health.history': { websiteId: 'string id, required', limit: 'number, optional' },
  'health.scan': { scanId: 'string id, required' },
  'health.report': { scanId: 'string id, required' },
  'health.pages': { scanId: 'string id, required' },
  'health.capabilities': {},
  'health.startScan': { websiteId: 'string id, required', checks: 'string[], optional', sitemapUrl: 'string, optional' },
  'health.cancelScan': { scanId: 'string id, required' },
  'health.retryScan': { scanId: 'string id, required' },

  'tasks.list': { filters: 'object, optional: { projectId, status, assignee, mine, requests, requestStatus }' },
  'tasks.get': { taskId: 'string id, required' },
  'tasks.assignees': {},
  'tasks.create': { input: { title: 'string, required', description: 'string', checklist: '[{ title, completed:boolean }]', projectId: 'string id', assigneeName: 'string (person name)', dueDate: 'YYYY-MM-DD', priority: PRIORITY, status: TASK_STATUS } },
  'tasks.createOrganized': { input: { requestor: 'string, required (email or full name of who asked)', description: 'string, required (brief; AI builds title + checklist)', projectId: 'string id', assignee: 'string (person name; if set, task skips approval and goes to their board)', dueDate: 'YYYY-MM-DD', title: 'string, optional (overrides AI)', priority: PRIORITY + ', optional', status: TASK_STATUS + ', optional' } },
  'tasks.update': { taskId: 'string id, required', input: 'object: same fields as tasks.create input' },
  'tasks.setStatus': { taskId: 'string id, required', status: TASK_STATUS + ', required' },
  'tasks.move': { input: 'object: { items:[{ id, status, assignee, sortOrder }] }' },

  'notes.list': { projectId: 'string id, optional' },
  'notes.create': { input: 'object: { body, projectId, ... }' },
  'notes.update': { noteId: 'string id, required', input: 'object: { body, ... }' },

  'issues.list': { filters: 'object, optional: { status, projectId, q }' },
  'issues.get': { issueId: 'string id, required' },
  'issues.options': {},
  'issues.create': { input: 'object: { title, description, priority, status, ... }' },
  'issues.update': { issueId: 'string id, required', input: 'object' },
  'issues.setStatus': { issueId: 'string id, required', status: 'Open|In Progress|Fixed, required' },
  'issues.addApplications': { issueId: 'string id, required', input: 'object: { projectIds:[...] }' },
  'issues.updateApplication': { issueId: 'string id, required', applicationId: 'string id, required', input: 'object' },
};

function get(actionKey) {
  return Object.prototype.hasOwnProperty.call(ACTIONS, actionKey) ? ACTIONS[actionKey] : null;
}

/** Self-describing capability list (no run functions) for GET /agent/actions. */
function list() {
  return Object.keys(ACTIONS).map(function(key) {
    return {
      key: key,
      access: ACTIONS[key].access,
      roles: ACTIONS[key].roles,
      args: ARGS[key] || {},
    };
  });
}

module.exports = { ACTIONS: ACTIONS, get: get, list: list, ARGS: ARGS, agentDate: agentDate, agentToday: agentToday };
