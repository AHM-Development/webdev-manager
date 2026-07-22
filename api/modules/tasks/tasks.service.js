var db = require('../../db/pool');
var activity = require('../auth/activity.service');
var notifications = require('../notifications/notifications.service');
var taskBus = require('./task-bus');
var roles = require('../../config/roles');

var STATUSES = ['Backlog', 'In Progress', 'Review', 'Blocked', 'Done'];
var PRIORITIES = ['Low', 'Medium', 'High'];

function isStaff(user) {
  return !!user && user.role === roles.ROLES.STAFF;
}

// Staff may only touch their own request while it's still pending; everything
// else (approved tasks, other people's requests) is off-limits to them.
function assertStaffCanModify(task, user) {
  if (!isStaff(user)) return;
  if (String(task.requestedBy || '') !== String(user.id) || task.requestStatus !== 'pending') {
    fail(403, 'FORBIDDEN', 'Staff can only edit their own pending task requests.');
  }
}

function fail(status, code, message) {
  var err = new Error(message);
  err.status = status;
  err.code = code;
  throw err;
}

function cleanString(value) {
  return String(value || '').trim();
}

function safeStatus(value, fallback) {
  return STATUSES.indexOf(value) === -1 ? fallback : value;
}

function safePriority(value, fallback) {
  return PRIORITIES.indexOf(value) === -1 ? fallback : value;
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

function formatDate(value) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
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
    .filter(function(item) {
      return item.name;
    });
}

function normalizeDate(value) {
  var text = cleanString(value);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    fail(400, 'VALIDATION_ERROR', 'Dates must use YYYY-MM-DD format.');
  }
  return text;
}

async function assertProject(projectId) {
  var rows = await db.query(
    'SELECT id, client_name FROM projects WHERE id = :projectId AND deleted_at IS NULL LIMIT 1',
    { projectId: projectId }
  );
  if (!rows[0]) fail(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  return rows[0];
}

async function resolveAssignee(input) {
  var assigneeUserId = input.assigneeUserId || input.assignee_user_id || null;
  var assigneeName = cleanString(input.assigneeName || input.assignee || '');

  if (assigneeUserId) {
    var byId = await db.query(
      'SELECT id, name, email FROM users WHERE id = :userId AND deleted_at IS NULL LIMIT 1',
      { userId: assigneeUserId }
    );
    if (!byId[0]) fail(400, 'VALIDATION_ERROR', 'Assignee user was not found.');
    return { userId: byId[0].id, name: assigneeName || byId[0].name || byId[0].email };
  }

  if (assigneeName) {
    var byName = await db.query(
      `SELECT id, name
       FROM users
       WHERE deleted_at IS NULL AND (name = :name OR email = :name)
       LIMIT 1`,
      { name: assigneeName }
    );
    if (byName[0]) return { userId: byName[0].id, name: byName[0].name || assigneeName };
  }

  return { userId: null, name: assigneeName || 'Unassigned' };
}

function rowToTask(row) {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    clientName: row.client_name || null,
    title: row.title,
    description: row.description || '',
    checklist: normalizeChecklist(parseJson(row.checklist, [])),
    attachments: normalizeAttachments(parseJson(row.attachments, [])),
    status: row.status,
    assignee: row.assignee_name,
    assigneeUserId: row.assignee_user_id ? String(row.assignee_user_id) : undefined,
    priority: row.priority,
    startDate: formatDate(row.start_date),
    dueDate: formatDate(row.due_date),
    sortOrder: row.sort_order,
    stageId: row.stage_id ? String(row.stage_id) : null,
    websiteId: row.website_id ? String(row.website_id) : null,
    reviewerUserId: row.reviewer_user_id ? String(row.reviewer_user_id) : null,
    isCritical: !!row.is_critical,
    acceptanceCriteria: parseJson(row.acceptance_criteria, []),
    affectedUrls: parseJson(row.affected_urls, []),
    verificationStatus: row.verification_status || 'unverified',
    requestStatus: row.request_status || 'approved',
    requestedBy: row.requested_by ? String(row.requested_by) : null,
    requestedByName: row.requested_by_name || null,
    reviewedByName: row.reviewed_by_name || null,
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getTask(taskId) {
  var rows = await db.query(
    `SELECT t.*, rq.name AS requested_by_name, rv.name AS reviewed_by_name,
            p.client_name AS client_name
     FROM tasks t
     LEFT JOIN users rq ON rq.id = t.requested_by
     LEFT JOIN users rv ON rv.id = t.reviewed_by
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.id = :taskId AND t.deleted_at IS NULL LIMIT 1`,
    { taskId: taskId }
  );
  if (!rows[0]) fail(404, 'TASK_NOT_FOUND', 'Task not found.');
  return rowToTask(rows[0]);
}

async function listAssignees() {
  var rows = await db.query(
    `SELECT id, name, email, role, avatar_url
     FROM users
     WHERE deleted_at IS NULL
       AND status = 'active'
       AND role IN ('superadmin', 'developer', 'staff')
     ORDER BY name ASC, email ASC`
  );
  return rows.map(function(row) {
    return {
      id: String(row.id),
      name: row.name || row.email,
      email: row.email,
      role: row.role,
      avatarUrl: row.avatar_url || null,
    };
  });
}

async function listTasks(filters, user) {
  var where = ['t.deleted_at IS NULL'];
  var params = {};

  if (filters.projectId) {
    where.push('t.project_id = :projectId');
    params.projectId = filters.projectId;
  }

  if (filters.status) {
    where.push('t.status = :status');
    params.status = safeStatus(filters.status, 'Backlog');
  }

  if (filters.assignee) {
    where.push('t.assignee_name = :assignee');
    params.assignee = filters.assignee;
  }

  if (filters.mine) {
    where.push('(t.assignee_user_id = :userId OR t.assignee_name = :userName OR t.assignee_name = :userEmail)');
    params.userId = user.id;
    params.userName = user.name || '';
    params.userEmail = user.email || '';
  }

  if (filters.requestStatus) {
    where.push('t.request_status = :requestStatus');
    params.requestStatus = filters.requestStatus;
  }

  var rows = await db.query(
    `SELECT t.*, rq.name AS requested_by_name, rv.name AS reviewed_by_name,
            p.client_name AS client_name
     FROM tasks t
     LEFT JOIN users rq ON rq.id = t.requested_by
     LEFT JOIN users rv ON rv.id = t.reviewed_by
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE ` + where.join(' AND ') + `
     ORDER BY t.sort_order ASC, t.due_date IS NULL ASC, t.due_date ASC, t.updated_at DESC`,
    params
  );
  return rows.map(rowToTask);
}

async function nextSortOrder(projectId) {
  var rows = await db.query(
    'SELECT COALESCE(MAX(sort_order), 0) + 100 AS next_order FROM tasks WHERE project_id = :projectId',
    { projectId: projectId }
  );
  return rows[0] ? Number(rows[0].next_order) : 100;
}

async function normalizePayload(input, partial) {
  var projectId = cleanString(input.projectId || input.project_id);
  if (!partial || projectId) await assertProject(projectId);

  var title = cleanString(input.title);
  if (!partial && !title) fail(400, 'VALIDATION_ERROR', 'Title is required.');
  if (title && title.length > 255) fail(400, 'VALIDATION_ERROR', 'Title is too long.');

  var startDate = normalizeDate(input.startDate || input.start_date);
  var dueDate = normalizeDate(input.dueDate || input.due_date);
  if (startDate && dueDate && dueDate < startDate) {
    fail(400, 'VALIDATION_ERROR', 'Due date must be after the start date.');
  }

  var assignee = await resolveAssignee(input);

  return {
    projectId: projectId || null,
    title: title,
    description: cleanString(input.description),
    checklist: normalizeChecklist(input.checklist),
    attachments: normalizeAttachments(input.attachments),
    status: safeStatus(input.status, partial ? undefined : 'Backlog'),
    priority: safePriority(input.priority, partial ? undefined : 'Medium'),
    assigneeUserId: assignee.userId,
    assigneeName: assignee.name,
    startDate: startDate,
    dueDate: dueDate,
    // Client Logs linkage (all optional; a plain project task leaves these null).
    stageId: input.stageId ? String(input.stageId) : null,
    websiteId: input.websiteId ? String(input.websiteId) : null,
    reviewerUserId: input.reviewerUserId ? String(input.reviewerUserId) : null,
    isCritical: input.isCritical ? 1 : 0,
    acceptanceCriteria: Array.isArray(input.acceptanceCriteria) ? JSON.stringify(input.acceptanceCriteria) : null,
    affectedUrls: Array.isArray(input.affectedUrls) ? JSON.stringify(input.affectedUrls) : null,
    originMeetingActionId: input.originMeetingActionId ? String(input.originMeetingActionId) : null,
  };
}

/** Update only the stage-link columns that were actually provided (never wipes
 *  a task's stage on an ordinary edit that omits them). */
async function applyTaskLinkFields(taskId, input) {
  var columns = {
    stageId: 'stage_id',
    websiteId: 'website_id',
    reviewerUserId: 'reviewer_user_id',
    isCritical: 'is_critical',
    acceptanceCriteria: 'acceptance_criteria',
    affectedUrls: 'affected_urls',
  };
  var sets = [];
  var params = { taskId: taskId };
  Object.keys(columns).forEach(function(key) {
    if (!(key in input)) return;
    var column = columns[key];
    if (key === 'isCritical') params[key] = input[key] ? 1 : 0;
    else if (key === 'acceptanceCriteria' || key === 'affectedUrls') params[key] = Array.isArray(input[key]) ? JSON.stringify(input[key]) : null;
    else params[key] = input[key] ? String(input[key]) : null;
    sets.push(column + ' = :' + key);
  });
  if (!sets.length) return;
  await db.query('UPDATE tasks SET ' + sets.join(', ') + ' WHERE id = :taskId AND deleted_at IS NULL', params);
}

// --- Notification copy helpers -------------------------------------------
// Build human, detailed messages so a notification stands on its own:
//   "Fix homepage banner" · Acme Health — High priority, due 2026-07-25
function taskHeadline(task) {
  var title = (task && task.title ? String(task.title).trim() : '') || 'Untitled task';
  var client = task && task.clientName ? String(task.clientName).trim() : '';
  return '"' + title + '"' + (client ? ' · ' + client : '');
}
function taskExtras(task) {
  var bits = [];
  if (task && task.priority) bits.push(task.priority + ' priority');
  if (task && task.dueDate) bits.push('due ' + task.dueDate);
  if (task && task.assignee && task.assignee !== 'Unassigned') bits.push('assigned to ' + task.assignee);
  return bits.length ? ' — ' + bits.join(', ') : '';
}
function actorName(actor) {
  return (actor && (actor.name || actor.email)) || 'a teammate';
}
function taskActionUrl(task) {
  return '/dashboard/tasks?task=' + encodeURIComponent(task.id);
}
function taskMeta(task) {
  return { taskId: task.id, projectId: task.projectId, clientName: task.clientName || null };
}

// Best-effort notifications for task assignment / review. Never blocks or throws
// into the caller; skips notifying the actor about their own change.
// `action` ('created' | 'updated') controls the copy when the assignee is
// unchanged: a plain update tells the assignee it was updated, not re-assigned.
function notifyAssignee(task, actor, context, prevAssigneeId, action) {
  if (!task.assigneeUserId) return;
  if (String(task.assigneeUserId) === String(actor.id)) return; // don't ping the actor about their own change
  var reassigned = String(task.assigneeUserId) !== String(prevAssigneeId || '');
  if (reassigned) {
    notifications.dispatch(notifications.CATEGORY.TASK_ASSIGNMENT, {
      userId: task.assigneeUserId, audienceType: 'user', type: 'task_assigned',
      title: 'New task assigned to you',
      message: taskHeadline(task) + taskExtras(task),
      actionUrl: taskActionUrl(task), metadata: taskMeta(task),
    }, actor, context).catch(function() {});
  } else if (action === 'updated') {
    notifications.dispatch(notifications.CATEGORY.TASK_ASSIGNMENT, {
      userId: task.assigneeUserId, audienceType: 'user', type: 'task_updated',
      title: 'A task assigned to you was updated',
      message: actorName(actor) + ' updated ' + taskHeadline(task) + taskExtras(task),
      actionUrl: taskActionUrl(task), metadata: taskMeta(task),
    }, actor, context).catch(function() {});
  }
}
function notifyReviewer(task, actor, context, prevReviewerId) {
  if (task.reviewerUserId && String(task.reviewerUserId) !== String(actor.id) &&
      String(task.reviewerUserId) !== String(prevReviewerId || '')) {
    notifications.dispatch(notifications.CATEGORY.REVIEW, {
      userId: task.reviewerUserId, audienceType: 'user', type: 'task_review',
      title: 'You were added as reviewer',
      message: 'Review ' + taskHeadline(task) + taskExtras(task),
      actionUrl: taskActionUrl(task), metadata: taskMeta(task),
    }, actor, context).catch(function() {});
  }
}

// Resolve a "requestor" (an email or full name) to an active user id.
async function resolveRequestor(value) {
  var v = String(value || '').trim();
  if (!v) return null;
  var rows = await db.query(
    "SELECT id FROM users WHERE deleted_at IS NULL AND status = 'active' AND (email = :v OR name = :v) LIMIT 1",
    { v: v }
  );
  return rows[0] ? rows[0].id : null;
}

async function createTask(input, user, context) {
  input = input || {};
  var payload = await normalizePayload(input, false);
  var sortOrder = await nextSortOrder(payload.projectId);
  // Tasks go straight to the board (with an assignee → that developer's column,
  // otherwise the Unassigned/backlog column). An optional requestor (e.g. Viktor
  // acting on someone's behalf) is recorded for attribution only; there is no
  // longer an approval step.
  var requestedBy = null;
  if (input.requestedByUserId) {
    requestedBy = Number(input.requestedByUserId);
  } else if (input.requestor) {
    requestedBy = await resolveRequestor(input.requestor);
    if (!requestedBy) fail(400, 'REQUESTOR_UNKNOWN', 'Requestor "' + input.requestor + '" is not a registered active user.');
  }
  var requestStatus = 'approved';
  var result = await db.query(
    `INSERT INTO tasks
      (project_id, website_id, stage_id, title, description, checklist, attachments, status, priority,
       assignee_user_id, assignee_name, reviewer_user_id, start_date, due_date, is_critical,
       acceptance_criteria, affected_urls, origin_meeting_action_id, sort_order, created_by, updated_by,
       request_status, requested_by)
     VALUES
      (:projectId, :websiteId, :stageId, :title, :description, :checklist, :attachments, :status, :priority,
       :assigneeUserId, :assigneeName, :reviewerUserId, :startDate, :dueDate, :isCritical,
       :acceptanceCriteria, :affectedUrls, :originMeetingActionId, :sortOrder, :userId, :userId,
       :requestStatus, :requestedBy)`,
    {
      projectId: payload.projectId,
      websiteId: payload.websiteId,
      stageId: payload.stageId,
      reviewerUserId: payload.reviewerUserId,
      isCritical: payload.isCritical,
      acceptanceCriteria: payload.acceptanceCriteria,
      affectedUrls: payload.affectedUrls,
      originMeetingActionId: payload.originMeetingActionId,
      title: payload.title,
      description: payload.description || null,
      checklist: JSON.stringify(payload.checklist),
      attachments: JSON.stringify(payload.attachments),
      status: payload.status,
      priority: payload.priority,
      assigneeUserId: payload.assigneeUserId,
      assigneeName: payload.assigneeName,
      startDate: payload.startDate,
      dueDate: payload.dueDate,
      sortOrder: sortOrder,
      userId: user.id,
      requestStatus: requestStatus,
      requestedBy: requestedBy,
    }
  );
  var task = await getTask(result.insertId);
  await logTaskActivity(user, context, 'tasks.create', task);
  notifyAssignee(task, user, context, null, 'created');
  notifyReviewer(task, user, context, null);
  taskBus.emitTaskChange('created', task);
  return task;
}

async function updateTask(taskId, input, user, context) {
  var before = await getTask(taskId);
  assertStaffCanModify(before, user);
  var payload = await normalizePayload(input || {}, false);
  await db.query(
    `UPDATE tasks
     SET project_id = :projectId,
         title = :title,
         description = :description,
         checklist = :checklist,
         attachments = :attachments,
         status = :status,
         priority = :priority,
         assignee_user_id = :assigneeUserId,
         assignee_name = :assigneeName,
         start_date = :startDate,
         due_date = :dueDate,
         updated_by = :userId
     WHERE id = :taskId AND deleted_at IS NULL`,
    {
      taskId: taskId,
      projectId: payload.projectId,
      title: payload.title,
      description: payload.description || null,
      checklist: JSON.stringify(payload.checklist),
      attachments: JSON.stringify(payload.attachments),
      status: payload.status,
      priority: payload.priority,
      assigneeUserId: payload.assigneeUserId,
      assigneeName: payload.assigneeName,
      startDate: payload.startDate,
      dueDate: payload.dueDate,
      userId: user.id,
    }
  );
  await applyTaskLinkFields(taskId, input || {});
  var task = await getTask(taskId);
  await logTaskActivity(user, context, 'tasks.update', task);
  notifyAssignee(task, user, context, before.assigneeUserId, 'updated');
  notifyReviewer(task, user, context, before.reviewerUserId);
  taskBus.emitTaskChange('updated', task);
  return task;
}

async function updateStatus(taskId, status, user, context) {
  assertStaffCanModify(await getTask(taskId), user);
  var normalized = safeStatus(status, null);
  if (!normalized) fail(400, 'VALIDATION_ERROR', 'Status is invalid.');
  await db.query(
    `UPDATE tasks
     SET status = :status, updated_by = :userId
     WHERE id = :taskId AND deleted_at IS NULL`,
    { taskId: taskId, status: normalized, userId: user.id }
  );
  var task = await getTask(taskId);
  await logTaskActivity(user, context, 'tasks.status_update', task);
  // Moving to Review pings the reviewer that it's ready for them.
  if (normalized === 'Review' && task.reviewerUserId && String(task.reviewerUserId) !== String(user.id)) {
    notifications.dispatch(notifications.CATEGORY.REVIEW, {
      userId: task.reviewerUserId, audienceType: 'user', type: 'task_review_ready',
      title: 'A task is ready for your review',
      message: taskHeadline(task) + ' is ready for review' + taskExtras(task),
      actionUrl: taskActionUrl(task), metadata: taskMeta(task),
    }, user, context).catch(function() {});
  }
  taskBus.emitTaskChange('updated', task);
  return task;
}

async function moveTasks(input, user, context) {
  var items = Array.isArray(input.items) ? input.items : [];
  var updated = [];

  for (var index = 0; index < items.length; index += 1) {
    var item = items[index] || {};
    var taskId = cleanString(item.id);
    if (!taskId) continue;
    var current = await getTask(taskId);
    var status = item.status ? safeStatus(item.status, current.status) : current.status;
    var assignee = item.assignee ? await resolveAssignee({ assignee: item.assignee }) : {
      userId: current.assigneeUserId || null,
      name: current.assignee,
    };
    var sortOrder = Number.isFinite(Number(item.sortOrder))
      ? Number(item.sortOrder)
      : current.sortOrder || (index + 1) * 100;

    await db.query(
      `UPDATE tasks
       SET status = :status,
           assignee_user_id = :assigneeUserId,
           assignee_name = :assigneeName,
           sort_order = :sortOrder,
           updated_by = :userId
       WHERE id = :taskId AND deleted_at IS NULL`,
      {
        taskId: taskId,
        status: status,
        assigneeUserId: assignee.userId,
        assigneeName: assignee.name,
        sortOrder: sortOrder,
        userId: user.id,
      }
    );
    var movedTask = await getTask(taskId);
    updated.push(movedTask);
    taskBus.emitTaskChange('updated', movedTask);
  }

  if (updated.length) {
    await activity.logActivity({
      userId: user.id,
      user: user,
      eventType: 'tasks.move',
      description: updated.length + ' task(s) moved',
      targetType: 'task',
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { ids: updated.map(function(task) { return task.id; }) },
    });
  }

  return updated;
}

async function deleteTask(taskId, user, context) {
  var task = await getTask(taskId);
  assertStaffCanModify(task, user);
  await db.query(
    `UPDATE tasks
     SET deleted_at = UTC_TIMESTAMP(), updated_by = :userId
     WHERE id = :taskId AND deleted_at IS NULL`,
    { taskId: taskId, userId: user.id }
  );
  await logTaskActivity(user, context, 'tasks.delete', task);
  taskBus.emitTaskChange('deleted', task);
}

async function logTaskActivity(user, context, eventType, task) {
  await activity.logActivity({
    userId: user.id,
    user: user,
    eventType: eventType,
    description: task.title,
    targetType: 'task',
    targetId: task.id,
    targetName: task.title,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: {
      projectId: task.projectId,
      status: task.status,
      priority: task.priority,
      assignee: task.assignee,
    },
  });
}

module.exports = {
  listTasks: listTasks,
  listAssignees: listAssignees,
  getTask: getTask,
  createTask: createTask,
  updateTask: updateTask,
  updateStatus: updateStatus,
  moveTasks: moveTasks,
  deleteTask: deleteTask,
};
