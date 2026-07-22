var db = require('../../db/pool');
var activity = require('../auth/activity.service');
var notifications = require('../notifications/notifications.service');

var ISSUE_STATUSES = ['Open', 'In Progress', 'Fixed'];
var TARGET_TYPES = ['task', 'checklist'];
var PRIORITIES = ['Low', 'Medium', 'High'];

function badRequest(message, code) {
  var err = new Error(message);
  err.status = 400;
  err.code = code || 'VALIDATION_ERROR';
  return err;
}

function notFound() {
  var err = new Error('Issue not found.');
  err.status = 404;
  err.code = 'ISSUE_NOT_FOUND';
  return err;
}

function cleanString(value) {
  return String(value || '').trim();
}

function normalizeTitleKey(value) {
  return cleanString(value).toLowerCase();
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeStatus(value) {
  var found = ISSUE_STATUSES.find(function(status) {
    return status.toLowerCase() === String(value || '').trim().toLowerCase();
  });
  if (!found) throw badRequest('Issue status is invalid.');
  return found;
}

function safePriority(value, fallback) {
  return PRIORITIES.indexOf(value) === -1 ? fallback : value;
}

function normalizeDate(value) {
  var raw = cleanString(value);
  if (!raw) return null;
  var parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeAttachments(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(function(item, index) {
      var type = item && item.type === 'file' ? 'file' : item && item.type === 'source' ? 'source' : 'link';
      return {
        id: cleanString(item && item.id) || 'attachment-' + Date.now() + '-' + index,
        name: cleanString(item && item.name),
        type: type,
        url: cleanString(item && item.url) || undefined,
      };
    })
    .filter(function(item) { return item.name; });
}

function normalizeChecklist(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(function(item, index) {
      return {
        id: cleanString(item && item.id) || 'check-' + Date.now() + '-' + index,
        title: cleanString(item && item.title),
        completed: !!(item && item.completed),
      };
    })
    .filter(function(item) {
      return item.title;
    });
}

/** Keep an item's completed state when the task already had an item with the
 *  same title — so editing an issue's checklist does not wipe out progress. */
function mergeChecklist(issueItems, taskItems) {
  var completedTitles = new Set(
    (taskItems || [])
      .filter(function(item) { return item && item.completed; })
      .map(function(item) { return normalizeTitleKey(item.title); })
  );
  return issueItems.map(function(item) {
    return {
      id: item.id,
      title: item.title,
      completed: completedTitles.has(normalizeTitleKey(item.title)),
    };
  });
}

function issueSummaryFromRows(rows) {
  if (!rows[0]) return null;
  var base = rows[0];
  return {
    id: String(base.id),
    title: base.title,
    description: base.description || undefined,
    checklist: normalizeChecklist(parseJson(base.checklist, [])),
    priority: base.priority || 'Medium',
    status: base.status,
    assignee: base.assignee_name || 'Unassigned',
    assigneeUserId: base.assignee_user_id ? String(base.assignee_user_id) : undefined,
    dueDate: base.due_date ? new Date(base.due_date).toISOString().slice(0, 10) : undefined,
    attachments: normalizeAttachments(parseJson(base.attachments, [])),
    createdAt: base.created_at,
    updatedAt: base.updated_at,
    applied: rows
      .filter(function(row) { return row.application_id; })
      // Hide applications whose linked task has been soft-deleted.
      .filter(function(row) { return !row.application_task_id || row.linked_task_id; })
      .map(function(row) {
        var taskStatus = row.linked_task_status || null;
        return {
          id: String(row.application_id),
          projectId: String(row.project_id),
          projectName: row.project_name,
          as: 'task',
          taskId: row.application_task_id ? String(row.application_task_id) : undefined,
          taskStatus: taskStatus || undefined,
          // Derive "fixed" from the linked task being Done; fall back to the
          // stored flag for legacy rows that have no task.
          fixed: row.application_task_id ? taskStatus === 'Done' : !!row.fixed,
          fixedAt: row.fixed_at || null,
        };
      }),
  };
}

function groupIssueRows(rows) {
  var grouped = new Map();
  rows.forEach(function(row) {
    var key = String(row.id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });
  return Array.from(grouped.values()).map(issueSummaryFromRows);
}

async function getIssueRows(whereSql, params) {
  return db.query(
    `SELECT i.*,
            ia.id AS application_id,
            ia.project_id,
            ia.task_id AS application_task_id,
            ia.target_type,
            ia.fixed,
            ia.fixed_at,
            p.client_name AS project_name,
            t.id AS linked_task_id,
            t.status AS linked_task_status
     FROM issues i
     LEFT JOIN issue_applications ia ON ia.issue_id = i.id
     LEFT JOIN projects p ON p.id = ia.project_id
     LEFT JOIN tasks t ON t.id = ia.task_id AND t.deleted_at IS NULL
     ` + whereSql + `
     ORDER BY i.updated_at DESC, i.id DESC, ia.created_at ASC`,
    params || {}
  );
}

async function listIssues(filters) {
  var where = ['i.deleted_at IS NULL'];
  var params = {};

  if (filters.q) {
    where.push('(i.title LIKE :q OR i.description LIKE :q)');
    params.q = '%' + filters.q + '%';
  }
  if (filters.status && filters.status !== 'all') {
    where.push('i.status = :status');
    params.status = normalizeStatus(filters.status);
  }
  if (filters.projectId && filters.projectId !== 'all') {
    where.push('ia.project_id = :projectId');
    params.projectId = filters.projectId;
  }

  var rows = await getIssueRows('WHERE ' + where.join(' AND '), params);
  return groupIssueRows(rows);
}

async function getIssue(issueId) {
  var rows = await getIssueRows(
    'WHERE i.deleted_at IS NULL AND i.id = :issueId',
    { issueId: issueId }
  );
  var issue = issueSummaryFromRows(rows);
  if (!issue) throw notFound();
  return issue;
}

function normalizeIssuePayload(input, partial) {
  var payload = {};
  if (!partial || input.title != null) {
    payload.title = cleanString(input.title);
    if (!payload.title) throw badRequest('Title is required.');
  }
  if (!partial || input.description != null) {
    payload.description = cleanString(input.description) || null;
  }
  if (!partial || input.checklist != null) {
    payload.checklist = normalizeChecklist(input.checklist);
  }
  if (!partial || input.status != null) {
    payload.status = input.status ? normalizeStatus(input.status) : 'Open';
  }
  if (!partial || input.priority != null) {
    payload.priority = safePriority(input.priority, partial ? undefined : 'Medium');
  }
  if (!partial || input.assigneeName != null || input.assigneeUserId != null) {
    var name = cleanString(input.assigneeName);
    var hasAssignee = name && name !== 'Unassigned';
    payload.assigneeName = hasAssignee ? name : 'Unassigned';
    payload.assigneeUserId = hasAssignee && input.assigneeUserId ? String(input.assigneeUserId) : null;
  }
  if (!partial || input.dueDate !== undefined) {
    payload.dueDate = normalizeDate(input.dueDate);
  }
  if (!partial || input.attachments != null) {
    payload.attachments = normalizeAttachments(input.attachments);
  }
  return payload;
}

async function logIssueActivity(user, context, eventType, issue, metadata) {
  await activity.logActivity({
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    eventType: eventType,
    action: eventType,
    description: issue.title,
    targetType: 'issue',
    targetId: issue.id,
    targetName: issue.title,
    severity: eventType.indexOf('delete') !== -1 ? 'warning' : 'info',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: Object.assign({ issueId: issue.id }, metadata || {}),
  });
}

async function nextTaskSortOrder(projectId) {
  var rows = await db.query(
    'SELECT COALESCE(MAX(sort_order), 0) + 100 AS next_order FROM tasks WHERE project_id = :projectId',
    { projectId: projectId }
  );
  return rows[0] ? Number(rows[0].next_order) : 100;
}

/** Creates the real board task that backs an issue application for a project. */
async function createTaskForIssue(issue, projectId, user) {
  var sortOrder = await nextTaskSortOrder(projectId);
  var result = await db.query(
    `INSERT INTO tasks
      (project_id, title, description, checklist, attachments, status, priority,
       assignee_user_id, assignee_name, due_date, sort_order, created_by, updated_by)
     VALUES
      (:projectId, :title, :description, :checklist, :attachments, 'Backlog', :priority,
       :assigneeUserId, :assigneeName, :dueDate, :sortOrder, :userId, :userId)`,
    {
      projectId: projectId,
      title: issue.title,
      description: issue.description || null,
      checklist: JSON.stringify(issue.checklist || []),
      attachments: JSON.stringify(issue.attachments || []),
      priority: issue.priority || 'Medium',
      assigneeUserId: issue.assigneeUserId || null,
      assigneeName: issue.assignee && issue.assignee !== 'Unassigned' ? issue.assignee : 'Unassigned',
      dueDate: issue.dueDate || null,
      sortOrder: sortOrder,
      userId: user.id,
    }
  );
  return result.insertId;
}

async function createIssue(input, user, context) {
  var payload = normalizeIssuePayload(input || {}, false);
  var result = await db.query(
    `INSERT INTO issues
      (title, description, checklist, status, priority, assignee_user_id, assignee_name,
       due_date, attachments, created_by, updated_by)
     VALUES
      (:title, :description, :checklist, :status, :priority, :assigneeUserId, :assigneeName,
       :dueDate, :attachments, :userId, :userId)`,
    {
      title: payload.title,
      description: payload.description,
      checklist: JSON.stringify(payload.checklist || []),
      status: payload.status,
      priority: payload.priority,
      assigneeUserId: payload.assigneeUserId || null,
      assigneeName: payload.assigneeName && payload.assigneeName !== 'Unassigned' ? payload.assigneeName : null,
      dueDate: payload.dueDate || null,
      attachments: JSON.stringify(payload.attachments || []),
      userId: user.id,
    }
  );
  var issueId = result.insertId;

  // If the author already chose a scope, apply it straight away so the tasks
  // show up on the board immediately.
  var hasScope =
    (input && input.scope === 'all') ||
    (input && Array.isArray(input.projectIds) && input.projectIds.length > 0);
  if (hasScope) {
    await addApplications(
      issueId,
      { scope: input.scope, projectIds: input.projectIds },
      user,
      context
    );
  }

  var issue = await getIssue(issueId);
  await logIssueActivity(user, context, 'issues.create', issue);
  return issue;
}

/** Pushes title/description/priority into linked tasks and merges the checklist
 *  so editing an issue keeps the board tasks (and their progress) in sync. */
async function propagateToTasks(issueId, payload, user) {
  var rows = await db.query(
    `SELECT ia.task_id, t.checklist
     FROM issue_applications ia
     JOIN tasks t ON t.id = ia.task_id AND t.deleted_at IS NULL
     WHERE ia.issue_id = :issueId AND ia.task_id IS NOT NULL`,
    { issueId: issueId }
  );

  for (var index = 0; index < rows.length; index += 1) {
    var row = rows[index];
    var sets = [];
    var params = { taskId: row.task_id, userId: user.id };

    if (payload.title != null) {
      sets.push('title = :title');
      params.title = payload.title;
    }
    if (payload.description !== undefined) {
      sets.push('description = :description');
      params.description = payload.description;
    }
    if (payload.priority != null) {
      sets.push('priority = :priority');
      params.priority = payload.priority;
    }
    if (payload.checklist != null) {
      var merged = mergeChecklist(payload.checklist, parseJson(row.checklist, []));
      sets.push('checklist = :checklist');
      params.checklist = JSON.stringify(merged);
    }
    if (payload.assigneeName != null) {
      sets.push('assignee_user_id = :assigneeUserId', 'assignee_name = :assigneeName');
      params.assigneeUserId = payload.assigneeUserId || null;
      params.assigneeName = payload.assigneeName;
    }
    if (payload.dueDate !== undefined) {
      sets.push('due_date = :dueDate');
      params.dueDate = payload.dueDate || null;
    }

    if (!sets.length) continue;
    sets.push('updated_by = :userId');
    await db.query(
      'UPDATE tasks SET ' + sets.join(', ') + ' WHERE id = :taskId AND deleted_at IS NULL',
      params
    );
  }
}

async function updateIssue(issueId, input, user, context) {
  await getIssue(issueId);
  var payload = normalizeIssuePayload(input || {}, true);
  var sets = [];
  var params = { issueId: issueId, userId: user.id };

  if (payload.title != null) {
    sets.push('title = :title');
    params.title = payload.title;
  }
  if (payload.description !== undefined) {
    sets.push('description = :description');
    params.description = payload.description;
  }
  if (payload.checklist != null) {
    sets.push('checklist = :checklist');
    params.checklist = JSON.stringify(payload.checklist);
  }
  if (payload.status != null) {
    sets.push('status = :status');
    params.status = payload.status;
  }
  if (payload.priority != null) {
    sets.push('priority = :priority');
    params.priority = payload.priority;
  }
  if (payload.assigneeName != null) {
    sets.push('assignee_user_id = :assigneeUserId', 'assignee_name = :assigneeName');
    params.assigneeUserId = payload.assigneeUserId || null;
    params.assigneeName = payload.assigneeName && payload.assigneeName !== 'Unassigned' ? payload.assigneeName : null;
  }
  if (payload.dueDate !== undefined) {
    sets.push('due_date = :dueDate');
    params.dueDate = payload.dueDate || null;
  }
  if (payload.attachments != null) {
    sets.push('attachments = :attachments');
    params.attachments = JSON.stringify(payload.attachments);
  }

  if (sets.length) {
    sets.push('updated_by = :userId');
    await db.query(
      'UPDATE issues SET ' + sets.join(', ') + ' WHERE id = :issueId AND deleted_at IS NULL',
      params
    );
  }

  await propagateToTasks(issueId, payload, user);

  var issue = await getIssue(issueId);
  await logIssueActivity(user, context, 'issues.update', issue);
  return issue;
}

async function updateStatus(issueId, status, user, context) {
  var issue = await getIssue(issueId);
  var normalized = normalizeStatus(status);
  await db.query(
    `UPDATE issues
     SET status = :status, updated_by = :userId
     WHERE id = :issueId AND deleted_at IS NULL`,
    { issueId: issueId, status: normalized, userId: user.id }
  );
  issue = await getIssue(issueId);
  await logIssueActivity(user, context, 'issues.status_update', issue, { status: normalized });
  if (normalized === 'Fixed') {
    var creatorRows = await db.query('SELECT created_by, title FROM issues WHERE id = :id LIMIT 1', { id: issueId });
    var creator = creatorRows[0];
    if (creator && creator.created_by && String(creator.created_by) !== String(user.id)) {
      notifications.dispatch(notifications.CATEGORY.ISSUES, {
        userId: creator.created_by, audienceType: 'user', type: 'issue_fixed',
        title: 'An issue you raised was marked fixed', message: creator.title || 'Issue',
        actionUrl: '/dashboard/issue-boards', metadata: { issueId: String(issueId) },
      }, user, context).catch(function() {});
    }
  }
  return issue;
}

async function deleteIssue(issueId, user, context) {
  var issue = await getIssue(issueId);
  // Soft-delete the board tasks this issue created so they leave the board too.
  await db.query(
    `UPDATE tasks t
     JOIN issue_applications ia ON ia.task_id = t.id
     SET t.deleted_at = UTC_TIMESTAMP(), t.updated_by = :userId
     WHERE ia.issue_id = :issueId AND t.deleted_at IS NULL`,
    { issueId: issueId, userId: user.id }
  );
  await db.query(
    `UPDATE issues
     SET deleted_at = UTC_TIMESTAMP(), updated_by = :userId
     WHERE id = :issueId AND deleted_at IS NULL`,
    { issueId: issueId, userId: user.id }
  );
  await logIssueActivity(user, context, 'issues.delete', issue);
}

async function resolveProjectIds(input) {
  var ids = [];

  if (input.scope === 'all') {
    var projectRows = await db.query('SELECT id FROM projects WHERE deleted_at IS NULL');
    ids = projectRows.map(function(row) { return String(row.id); });
  } else if (Array.isArray(input.projectIds)) {
    ids = input.projectIds.map(String);
  }

  ids = Array.from(new Set(ids.filter(Boolean)));
  if (!ids.length) throw badRequest('Select at least one project.');

  var existing = await db.query(
    'SELECT id FROM projects WHERE deleted_at IS NULL AND id IN (' + ids.map(function(id, index) {
      return ':id' + index;
    }).join(',') + ')',
    ids.reduce(function(params, id, index) {
      params['id' + index] = id;
      return params;
    }, {})
  );

  if (!existing.length) throw badRequest('No valid projects were selected.');

  return {
    projectIds: existing.map(function(row) { return String(row.id); }),
  };
}

async function addApplications(issueId, input, user, context) {
  var issue = await getIssue(issueId);
  var resolved = await resolveProjectIds(input || {});

  // Skip projects that already have an application (one task per project).
  var existingApps = await db.query(
    "SELECT project_id FROM issue_applications WHERE issue_id = :issueId AND target_type = 'task'",
    { issueId: issueId }
  );
  var existingProjects = new Set(
    existingApps.map(function(row) { return String(row.project_id); })
  );

  var created = 0;
  for (var index = 0; index < resolved.projectIds.length; index += 1) {
    var projectId = resolved.projectIds[index];
    if (existingProjects.has(projectId)) continue;

    var taskId = await createTaskForIssue(issue, projectId, user);
    await db.query(
      `INSERT INTO issue_applications
        (issue_id, project_id, task_id, target_type, fixed, created_by, updated_by)
       VALUES
        (:issueId, :projectId, :taskId, 'task', 0, :userId, :userId)`,
      {
        issueId: issueId,
        projectId: projectId,
        taskId: taskId,
        userId: user.id,
      }
    );
    created += 1;
  }

  issue = await getIssue(issueId);
  await logIssueActivity(user, context, 'issues.apply', issue, { count: created });
  if (created > 0) {
    notifications.dispatch(notifications.CATEGORY.ISSUES, {
      audienceType: 'role', audienceValue: 'superadmin', type: 'issue_applied',
      title: 'Issue applied to a client',
      message: (issue && issue.title) || 'Issue',
      actionUrl: '/dashboard/issue-boards', metadata: { issueId: String(issueId) },
    }, user, context).catch(function() {});
  }
  return issue;
}

async function applicationBelongsToIssue(issueId, applicationId) {
  var rows = await db.query(
    `SELECT ia.*, p.client_name AS project_name
     FROM issue_applications ia
     JOIN projects p ON p.id = ia.project_id
     WHERE ia.id = :applicationId AND ia.issue_id = :issueId
     LIMIT 1`,
    { issueId: issueId, applicationId: applicationId }
  );
  if (!rows[0]) throw badRequest('Issue application not found.', 'ISSUE_APPLICATION_NOT_FOUND');
  return rows[0];
}

async function updateApplication(issueId, applicationId, input, user, context) {
  var issue = await getIssue(issueId);
  var app = await applicationBelongsToIssue(issueId, applicationId);
  var fixed = !!input.fixed;

  // "Mark fixed" drives the linked board task to Done (or back to Backlog).
  if (app.task_id) {
    await db.query(
      `UPDATE tasks
       SET status = :status, updated_by = :userId
       WHERE id = :taskId AND deleted_at IS NULL`,
      { status: fixed ? 'Done' : 'Backlog', userId: user.id, taskId: app.task_id }
    );
  }

  await db.query(
    `UPDATE issue_applications
     SET fixed = :fixed,
         fixed_at = ` + (fixed ? 'UTC_TIMESTAMP()' : 'NULL') + `,
         updated_by = :userId
     WHERE id = :applicationId AND issue_id = :issueId`,
    {
      fixed: fixed ? 1 : 0,
      userId: user.id,
      applicationId: applicationId,
      issueId: issueId,
    }
  );

  issue = await getIssue(issueId);
  await logIssueActivity(user, context, 'issues.application_fixed', issue, {
    applicationId: String(applicationId),
    projectId: String(app.project_id),
    fixed: fixed,
  });
  return issue;
}

async function removeApplication(issueId, applicationId, user, context) {
  var issue = await getIssue(issueId);
  var app = await applicationBelongsToIssue(issueId, applicationId);

  // Removing an application also removes the task it created from the board.
  if (app.task_id) {
    await db.query(
      `UPDATE tasks
       SET deleted_at = UTC_TIMESTAMP(), updated_by = :userId
       WHERE id = :taskId AND deleted_at IS NULL`,
      { taskId: app.task_id, userId: user.id }
    );
  }

  await db.query(
    'DELETE FROM issue_applications WHERE id = :applicationId AND issue_id = :issueId',
    { applicationId: applicationId, issueId: issueId }
  );
  issue = await getIssue(issueId);
  await logIssueActivity(user, context, 'issues.application_removed', issue, {
    applicationId: String(applicationId),
    projectId: String(app.project_id),
  });
  return issue;
}

async function getOptions() {
  var projects = await db.query(
    `SELECT id, client_name
     FROM projects
     WHERE deleted_at IS NULL
     ORDER BY client_name ASC`
  );
  var assignees = await db.query(
    `SELECT id, name, email FROM users
     WHERE deleted_at IS NULL AND status = 'active'
       AND role IN ('superadmin', 'developer', 'staff')
     ORDER BY name ASC, email ASC`
  );
  return {
    statuses: ISSUE_STATUSES,
    targetTypes: TARGET_TYPES,
    priorities: PRIORITIES,
    projects: projects.map(function(project) {
      return { id: String(project.id), name: project.client_name };
    }),
    assignees: assignees.map(function(row) {
      return { id: String(row.id), name: row.name || row.email };
    }),
  };
}

module.exports = {
  listIssues: listIssues,
  getIssue: getIssue,
  createIssue: createIssue,
  updateIssue: updateIssue,
  updateStatus: updateStatus,
  deleteIssue: deleteIssue,
  addApplications: addApplications,
  updateApplication: updateApplication,
  removeApplication: removeApplication,
  getOptions: getOptions,
};
