'use strict';

// Read-only aggregate insights for the Viktor agent (and any future dashboard).
// Composes existing module reads into workspace- and project-level rollups — no
// new persistence, no writes. RBAC is unchanged: these run as read actions in
// the agent allowlist under the ALL_ROLES ceiling, and each underlying service
// applies its own scoping.

var projects = require('../projects/projects.service');
var tasks = require('../tasks/tasks.service');
var issues = require('../issues/issues.service');
var health = require('../website-health/website-health.service');
var clientLogs = require('../client-logs/client-logs.service');

var TASK_STATUSES = ['Backlog', 'In Progress', 'Review', 'Blocked', 'Done'];
var ISSUE_STATUSES = ['Open', 'In Progress', 'Fixed'];
var DAY = 86400000;
var SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };

function countBy(items, getKey) {
  var out = {};
  items.forEach(function(item) {
    var key = getKey(item);
    if (key == null) return;
    out[key] = (out[key] || 0) + 1;
  });
  return out;
}

function startOfTodayMs() {
  var now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function dueMs(task) {
  if (!task || !task.dueDate) return null;
  var ms = new Date(task.dueDate).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function projectInsights(list) {
  var byPriority = { High: 0, Medium: 0, Low: 0, Churned: 0 };
  var churned = 0;
  list.forEach(function(project) {
    if (project.status === 'Churned') {
      churned += 1;
      byPriority.Churned += 1;
    } else if (byPriority[project.priority] !== undefined) {
      byPriority[project.priority] += 1;
    }
  });
  return {
    total: list.length,
    active: list.length - churned,
    churned: churned,
    byPriority: byPriority,
    byStatus: countBy(list, function(p) { return p.status; }),
  };
}

function taskInsights(list) {
  var byStatus = {};
  TASK_STATUSES.forEach(function(status) { byStatus[status] = 0; });
  var overdue = 0;
  var dueSoon = 0;
  var today = startOfTodayMs();
  list.forEach(function(task) {
    if (byStatus[task.status] === undefined) byStatus[task.status] = 0;
    byStatus[task.status] += 1;
    if (task.status === 'Done') return;
    var due = dueMs(task);
    if (due == null) return;
    if (due < today) overdue += 1;
    else if (due <= today + 7 * DAY) dueSoon += 1;
  });
  return {
    total: list.length,
    byStatus: byStatus,
    blocked: byStatus.Blocked || 0,
    open: list.length - (byStatus.Done || 0),
    overdue: overdue,
    dueSoon: dueSoon,
  };
}

function issueInsights(list) {
  var byStatus = {};
  ISSUE_STATUSES.forEach(function(status) { byStatus[status] = 0; });
  list.forEach(function(issue) {
    if (byStatus[issue.status] === undefined) byStatus[issue.status] = 0;
    byStatus[issue.status] += 1;
  });
  return {
    total: list.length,
    byStatus: byStatus,
    open: (byStatus.Open || 0) + (byStatus['In Progress'] || 0),
  };
}

function stageInsights(stages) {
  var byStatus = countBy(stages, function(stage) { return stage.status; });
  return {
    total: stages.length,
    byStatus: byStatus,
    blocked: byStatus.blocked || 0,
    delayed: byStatus.delayed || 0,
  };
}

// Turn the rollups into a ranked, human-readable "what needs attention" list.
function buildAttention(taskStats, issueStats, healthOverview, clSummary) {
  var items = [];
  var push = function(area, severity, count, message) {
    if (count) items.push({ area: area, severity: severity, count: count, message: message });
  };
  push('tasks', 'critical', taskStats.overdue, taskStats.overdue + ' task' + (taskStats.overdue === 1 ? '' : 's') + ' overdue');
  push('websiteHealth', 'critical', healthOverview.criticalIssues, healthOverview.criticalIssues + ' critical website issue' + (healthOverview.criticalIssues === 1 ? '' : 's'));
  push('tasks', 'warning', taskStats.blocked, taskStats.blocked + ' task' + (taskStats.blocked === 1 ? '' : 's') + ' blocked');
  push('clientLogs', 'warning', clSummary.blocked, clSummary.blocked + ' client-log stage' + (clSummary.blocked === 1 ? '' : 's') + ' blocked');
  push('clientLogs', 'warning', clSummary.delayed, clSummary.delayed + ' client-log stage' + (clSummary.delayed === 1 ? '' : 's') + ' delayed');
  push('tasks', 'info', taskStats.dueSoon, taskStats.dueSoon + ' task' + (taskStats.dueSoon === 1 ? '' : 's') + ' due within 7 days');
  push('issues', 'info', issueStats.open, issueStats.open + ' open issue' + (issueStats.open === 1 ? '' : 's'));
  items.sort(function(a, b) { return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]; });
  return items;
}

/** Workspace-wide snapshot: project / task / issue / website-health / client-log rollups. */
async function dashboard(user) {
  var results = await Promise.all([
    projects.listProjects({}),
    tasks.listTasks({}, user),
    issues.listIssues({}),
    health.list({}),
    clientLogs.overview({ pageSize: 100 }),
  ]);
  var projectStats = projectInsights(results[0]);
  var taskStats = taskInsights(results[1]);
  var issueStats = issueInsights(results[2]);
  var healthOverview = (results[3] && results[3].overview) || {};
  var clSummary = (results[4] && results[4].summary) || {};

  return {
    generatedAt: new Date().toISOString(),
    projects: projectStats,
    tasks: taskStats,
    issues: issueStats,
    websiteHealth: {
      websites: healthOverview.websites || 0,
      scanned: healthOverview.scannedWebsites || 0,
      averageHealth: healthOverview.averageHealth != null ? healthOverview.averageHealth : null,
      criticalIssues: healthOverview.criticalIssues || 0,
    },
    clientLogs: {
      total: clSummary.total || 0,
      notCreated: clSummary.notCreated || 0,
      delayed: clSummary.delayed || 0,
      blocked: clSummary.blocked || 0,
      approachingLaunch: clSummary.approachingLaunch || 0,
      live: clSummary.live || 0,
    },
    attention: buildAttention(taskStats, issueStats, healthOverview, clSummary),
  };
}

/** Focused rollup for a single project (throws 404 via getProject if unknown). */
async function project(projectId, user) {
  var proj = await projects.getProject(projectId);
  var results = await Promise.all([
    tasks.listTasks({ projectId: projectId }, user),
    issues.listIssues({ projectId: projectId }),
    clientLogs.listStages(projectId).catch(function() { return []; }),
    clientLogs.computeLaunchReadiness(projectId).catch(function() { return null; }),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    project: proj,
    tasks: taskInsights(results[0]),
    issues: issueInsights(results[1]),
    stages: stageInsights(results[2] || []),
    launchReadiness: results[3],
  };
}

module.exports = {
  dashboard: dashboard,
  project: project,
  // exported for unit tests
  projectInsights: projectInsights,
  taskInsights: taskInsights,
  issueInsights: issueInsights,
  stageInsights: stageInsights,
  buildAttention: buildAttention,
};
