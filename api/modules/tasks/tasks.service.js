var db = require('../../db/pool');
var activity = require('../auth/activity.service');

var STATUSES = ['Backlog', 'To Do', 'In Progress', 'Review', 'Blocked', 'Done'];
var PRIORITIES = ['Low', 'Medium', 'High'];

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getTask(taskId) {
  var rows = await db.query(
    'SELECT * FROM tasks WHERE id = :taskId AND deleted_at IS NULL LIMIT 1',
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
       AND role IN ('superadmin', 'developer')
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

  var rows = await db.query(
    `SELECT t.*
     FROM tasks t
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
  };
}

async function createTask(input, user, context) {
  var payload = await normalizePayload(input || {}, false);
  var sortOrder = await nextSortOrder(payload.projectId);
  var result = await db.query(
    `INSERT INTO tasks
      (project_id, title, description, checklist, attachments, status, priority,
       assignee_user_id, assignee_name, start_date, due_date, sort_order, created_by, updated_by)
     VALUES
      (:projectId, :title, :description, :checklist, :attachments, :status, :priority,
       :assigneeUserId, :assigneeName, :startDate, :dueDate, :sortOrder, :userId, :userId)`,
    {
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
      sortOrder: sortOrder,
      userId: user.id,
    }
  );
  var task = await getTask(result.insertId);
  await logTaskActivity(user, context, 'tasks.create', task);
  return task;
}

async function updateTask(taskId, input, user, context) {
  await getTask(taskId);
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
  var task = await getTask(taskId);
  await logTaskActivity(user, context, 'tasks.update', task);
  return task;
}

async function updateStatus(taskId, status, user, context) {
  await getTask(taskId);
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
    updated.push(await getTask(taskId));
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
  await db.query(
    `UPDATE tasks
     SET deleted_at = UTC_TIMESTAMP(), updated_by = :userId
     WHERE id = :taskId AND deleted_at IS NULL`,
    { taskId: taskId, userId: user.id }
  );
  await logTaskActivity(user, context, 'tasks.delete', task);
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
