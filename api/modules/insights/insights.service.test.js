'use strict';

// Tests for the read-only insights rollups. Pure aggregators are tested directly;
// dashboard() has its five source services replaced in require.cache.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const projectsPath = path.resolve(__dirname, '../projects/projects.service.js');
const tasksPath = path.resolve(__dirname, '../tasks/tasks.service.js');
const issuesPath = path.resolve(__dirname, '../issues/issues.service.js');
const healthPath = path.resolve(__dirname, '../website-health/website-health.service.js');
const clientLogsPath = path.resolve(__dirname, '../client-logs/client-logs.service.js');

let projectList = [];
let taskList = [];
let issueList = [];
let healthData = { overview: {} };
let clOverview = { summary: {} };

function inject(filename, exports) {
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}
inject(projectsPath, { listProjects: async () => projectList, getProject: async (id) => ({ id, clientName: 'Acme' }) });
inject(tasksPath, { listTasks: async () => taskList });
inject(issuesPath, { listIssues: async () => issueList });
inject(healthPath, { list: async () => healthData });
inject(clientLogsPath, {
  overview: async () => clOverview,
  listStages: async () => [],
  computeLaunchReadiness: async () => ({ status: 'ready' }),
});

const service = require('./insights.service');

function daysFromNow(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- pure aggregators ----------
test('projectInsights buckets priority and separates churned', () => {
  const stats = service.projectInsights([
    { priority: 'High', status: 'Live' },
    { priority: 'Medium', status: 'In Progress' },
    { priority: 'Low', status: 'Churned' }, // churned overrides priority bucket
  ]);
  assert.equal(stats.total, 3);
  assert.equal(stats.active, 2);
  assert.equal(stats.churned, 1);
  assert.equal(stats.byPriority.High, 1);
  assert.equal(stats.byPriority.Churned, 1);
  assert.equal(stats.byPriority.Low, 0, 'a churned Low project is not also counted as Low');
});

test('taskInsights counts status buckets, overdue, and due-soon', () => {
  const stats = service.taskInsights([
    { status: 'Backlog', dueDate: daysFromNow(-2) }, // overdue
    { status: 'In Progress', dueDate: daysFromNow(3) }, // due soon
    { status: 'Blocked', dueDate: daysFromNow(30) }, // neither
    { status: 'Done', dueDate: daysFromNow(-10) }, // done never overdue
  ]);
  assert.equal(stats.total, 4);
  assert.equal(stats.byStatus.Blocked, 1);
  assert.equal(stats.blocked, 1);
  assert.equal(stats.open, 3, 'all but Done');
  assert.equal(stats.overdue, 1);
  assert.equal(stats.dueSoon, 1);
});

test('issueInsights treats Open + In Progress as open', () => {
  const stats = service.issueInsights([
    { status: 'Open' },
    { status: 'In Progress' },
    { status: 'Fixed' },
  ]);
  assert.equal(stats.total, 3);
  assert.equal(stats.open, 2);
  assert.equal(stats.byStatus.Fixed, 1);
});

test('buildAttention ranks critical before warning before info and drops zeros', () => {
  const items = service.buildAttention(
    { overdue: 2, blocked: 1, dueSoon: 0 },
    { open: 4 },
    { criticalIssues: 3 },
    { blocked: 0, delayed: 1 }
  );
  assert.equal(items[0].severity, 'critical');
  assert.ok(items.every((i) => i.count > 0), 'no zero-count rows');
  const severities = items.map((i) => i.severity);
  const rank = { critical: 0, warning: 1, info: 2 };
  for (let i = 1; i < severities.length; i += 1) {
    assert.ok(rank[severities[i - 1]] <= rank[severities[i]], 'sorted by severity');
  }
});

// ---------- dashboard composition ----------
test('dashboard composes all five sources into a single snapshot', async () => {
  projectList = [{ priority: 'High', status: 'Live' }, { priority: 'Low', status: 'Churned' }];
  taskList = [{ status: 'Blocked', dueDate: daysFromNow(-1) }, { status: 'Done' }];
  issueList = [{ status: 'Open' }];
  healthData = { overview: { websites: 5, scannedWebsites: 3, averageHealth: 82, criticalIssues: 2 } };
  clOverview = { summary: { total: 4, notCreated: 1, delayed: 1, blocked: 1, approachingLaunch: 1, live: 1 } };

  const snapshot = await service.dashboard({ id: 1, name: 'U', email: 'u@x.co' });
  assert.equal(snapshot.projects.total, 2);
  assert.equal(snapshot.projects.churned, 1);
  assert.equal(snapshot.tasks.blocked, 1);
  assert.equal(snapshot.tasks.overdue, 1);
  assert.equal(snapshot.issues.open, 1);
  assert.equal(snapshot.websiteHealth.websites, 5);
  assert.equal(snapshot.websiteHealth.averageHealth, 82);
  assert.equal(snapshot.clientLogs.blocked, 1);
  assert.ok(snapshot.attention.length > 0);
  assert.equal(snapshot.attention[0].severity, 'critical', 'overdue/critical bubbles to the top');
  assert.ok(typeof snapshot.generatedAt === 'string');
});

test('dashboard tolerates missing overview/summary shapes', async () => {
  projectList = [];
  taskList = [];
  issueList = [];
  healthData = {}; // no overview
  clOverview = {}; // no summary
  const snapshot = await service.dashboard({ id: 1 });
  assert.equal(snapshot.websiteHealth.websites, 0);
  assert.equal(snapshot.clientLogs.total, 0);
  assert.deepEqual(snapshot.attention, []);
});

test('project rollup includes the project and launch readiness', async () => {
  taskList = [{ status: 'Backlog', dueDate: daysFromNow(2) }];
  issueList = [{ status: 'Fixed' }];
  const rollup = await service.project('42', { id: 1 });
  assert.equal(rollup.project.id, '42');
  assert.equal(rollup.tasks.total, 1);
  assert.equal(rollup.issues.total, 1);
  assert.deepEqual(rollup.launchReadiness, { status: 'ready' });
});
