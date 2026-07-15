var db = require('../../db/pool');
var tasks = require('../tasks/tasks.service');
var websiteActivity = require('../activity-logs/activity-logs.service');

/**
 * Mirror a Client Logs action into the project-keyed website_activity_logs feed
 * so it shows in the global activity timeline. Best-effort: an audit failure must
 * never break the primary operation. Resolves the client name when not supplied.
 */
async function mirrorActivity(projectId, projectName, user, action, description, severity, metadata) {
  try {
    var name = projectName;
    if (!name && projectId) {
      var pr = await db.query('SELECT client_name FROM projects WHERE id = :id LIMIT 1', { id: projectId });
      name = pr[0] ? pr[0].client_name : null;
    }
    await websiteActivity.logWebsiteActivity({
      projectId: projectId || null,
      projectName: name || null,
      user: user ? { id: user.id, name: user.name, email: user.email } : undefined,
      action: action,
      description: description || null,
      severity: severity || 'info',
      source: 'user',
      metadata: metadata || {},
    });
  } catch (err) {
    // Audit mirroring is best-effort; swallow so the caller's operation succeeds.
  }
}

function badRequest(message, code) {
  var err = new Error(message);
  err.status = 400;
  err.code = code || 'VALIDATION_ERROR';
  return err;
}
function notFound(message, code) {
  var err = new Error(message || 'Not found.');
  err.status = 404;
  err.code = code || 'CLIENT_LOG_NOT_FOUND';
  return err;
}
function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (err) { return fallback; }
}
function intList(values) {
  return (values || []).map(function(value) { return Number(value); }).filter(function(value) { return Number.isInteger(value) && value > 0; });
}

// ---------- mappers ----------
function mapTemplate(row) {
  return {
    id: String(row.id), name: row.name, description: row.description || '',
    isDefault: !!row.is_default, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
function mapTemplateStage(row) {
  return {
    id: String(row.id), templateId: String(row.template_id), name: row.name,
    description: row.description || '', position: Number(row.position),
    isRequired: !!row.is_required, isMilestone: !!row.is_milestone, isLaunchBlocker: !!row.is_launch_blocker,
    defaultOwnerRole: row.default_owner_role || null, estimatedDurationDays: row.estimated_duration_days,
  };
}

/** Effective display status: stored lifecycle + derived upcoming/delayed. */
function effectiveStatus(row, now) {
  var base = row.status;
  if (base === 'completed' || base === 'verified') return base;
  if (row.is_on_hold || base === 'on_hold') return 'on_hold';
  var end = row.planned_end ? new Date(row.planned_end) : null;
  if (end && now > end) return 'delayed';
  if (base === 'not_started') {
    var start = row.planned_start ? new Date(row.planned_start) : null;
    if (start && start > now) return 'upcoming';
  }
  return base;
}

/** Progress is derived, not stored: a done stage is 100%, otherwise it's the
 *  share of the stage's tasks that are complete (0 when there are no tasks). */
function computeStageProgress(status, taskStats) {
  if (status === 'completed' || status === 'verified') return 100;
  if (taskStats && taskStats.total > 0) {
    return Math.round(((taskStats.total - taskStats.open) / taskStats.total) * 100);
  }
  return 0;
}

function mapStage(row, extra) {
  extra = extra || {};
  var now = new Date();
  var status = effectiveStatus(row, now);
  var taskStats = extra.taskStats || emptyTaskStats();
  return {
    id: String(row.id), projectId: String(row.project_id),
    templateId: row.template_id ? String(row.template_id) : null,
    name: row.name, description: row.description || '', position: Number(row.position),
    status: status, storedStatus: row.status, isDelayed: status === 'delayed',
    progress: computeStageProgress(row.status, taskStats),
    plannedStart: row.planned_start, plannedEnd: row.planned_end,
    actualStart: row.actual_start, actualEnd: row.actual_end,
    estimatedDurationDays: row.estimated_duration_days,
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null, ownerName: row.owner_name || null,
    reviewerUserId: row.reviewer_user_id ? String(row.reviewer_user_id) : null, reviewerName: row.reviewer_name || null,
    priority: row.priority, riskLevel: row.risk_level,
    isRequired: !!row.is_required, isMilestone: !!row.is_milestone,
    isLaunchBlocker: !!row.is_launch_blocker, isOnHold: !!row.is_on_hold,
    dependsOn: extra.dependsOn || [], taskStats: taskStats,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
function emptyTaskStats() {
  return { total: 0, open: 0, awaitingReview: 0, overdue: 0, criticalOpen: 0, verified: 0 };
}

// ---------- templates ----------
async function listTemplates() {
  var templates = await db.query('SELECT * FROM client_log_templates WHERE deleted_at IS NULL ORDER BY is_default DESC, name ASC');
  var stages = await db.query('SELECT * FROM client_log_template_stages ORDER BY position ASC');
  return templates.map(function(template) {
    return Object.assign(mapTemplate(template), {
      stages: stages.filter(function(stage) { return stage.template_id === template.id; }).map(mapTemplateStage),
    });
  });
}

async function getTemplate(templateId) {
  var rows = await db.query('SELECT * FROM client_log_templates WHERE id = :id AND deleted_at IS NULL LIMIT 1', { id: templateId });
  if (!rows[0]) throw notFound('Template not found.');
  var stages = await db.query('SELECT * FROM client_log_template_stages WHERE template_id = :id ORDER BY position ASC', { id: templateId });
  return Object.assign(mapTemplate(rows[0]), { stages: stages.map(mapTemplateStage) });
}

async function createTemplate(input, user) {
  var name = String((input && input.name) || '').trim();
  if (!name) throw badRequest('Template name is required.');
  var result = await db.query(
    'INSERT INTO client_log_templates (name, description, is_default, created_by, updated_by) VALUES (:name, :description, 0, :userId, :userId)',
    { name: name, description: String((input && input.description) || '') || null, userId: user.id }
  );
  return getTemplate(result.insertId);
}

async function updateTemplate(templateId, input, user) {
  var existing = await db.query('SELECT id FROM client_log_templates WHERE id = :id AND deleted_at IS NULL LIMIT 1', { id: templateId });
  if (!existing[0]) throw notFound('Template not found.');
  var sets = [];
  var params = { id: templateId, userId: user.id };
  if (input.name != null) { sets.push('name = :name'); params.name = String(input.name).trim(); }
  if (input.description != null) { sets.push('description = :description'); params.description = String(input.description) || null; }
  if (input.isDefault === true) {
    await db.query('UPDATE client_log_templates SET is_default = 0 WHERE is_default = 1');
    sets.push('is_default = 1');
  }
  if (sets.length) {
    sets.push('updated_by = :userId');
    await db.query('UPDATE client_log_templates SET ' + sets.join(', ') + ' WHERE id = :id', params);
  }
  return getTemplate(templateId);
}

async function deleteTemplate(templateId) {
  var rows = await db.query('SELECT is_default FROM client_log_templates WHERE id = :id AND deleted_at IS NULL LIMIT 1', { id: templateId });
  if (!rows[0]) throw notFound('Template not found.');
  if (rows[0].is_default) throw badRequest('The default template cannot be deleted.', 'TEMPLATE_DEFAULT');
  await db.query('UPDATE client_log_templates SET deleted_at = UTC_TIMESTAMP() WHERE id = :id', { id: templateId });
  return { deleted: true };
}

async function addTemplateStage(templateId, input) {
  var template = await db.query('SELECT id FROM client_log_templates WHERE id = :id AND deleted_at IS NULL LIMIT 1', { id: templateId });
  if (!template[0]) throw notFound('Template not found.');
  var name = String((input && input.name) || '').trim();
  if (!name) throw badRequest('Stage name is required.');
  var position = await db.query('SELECT COALESCE(MAX(position) + 1, 0) AS next FROM client_log_template_stages WHERE template_id = :id', { id: templateId });
  await db.query(
    `INSERT INTO client_log_template_stages
       (template_id, name, description, position, is_required, is_milestone, is_launch_blocker, default_owner_role, estimated_duration_days)
     VALUES (:templateId, :name, :description, :position, :required, :milestone, :blocker, :owner, :duration)`,
    {
      templateId: templateId, name: name, description: String((input && input.description) || '') || null,
      position: Number(position[0].next), required: input.isRequired === false ? 0 : 1,
      milestone: input.isMilestone ? 1 : 0, blocker: input.isLaunchBlocker ? 1 : 0,
      owner: input.defaultOwnerRole || null, duration: input.estimatedDurationDays != null ? Number(input.estimatedDurationDays) : null,
    }
  );
  return getTemplate(templateId);
}

async function updateTemplateStage(templateId, stageId, input) {
  var rows = await db.query('SELECT id FROM client_log_template_stages WHERE id = :id AND template_id = :templateId LIMIT 1', { id: stageId, templateId: templateId });
  if (!rows[0]) throw notFound('Template stage not found.');
  var sets = [];
  var params = { id: stageId };
  if (input.name != null) { sets.push('name = :name'); params.name = String(input.name).trim(); }
  if (input.description != null) { sets.push('description = :description'); params.description = String(input.description) || null; }
  if (input.isRequired != null) { sets.push('is_required = :required'); params.required = input.isRequired ? 1 : 0; }
  if (input.isMilestone != null) { sets.push('is_milestone = :milestone'); params.milestone = input.isMilestone ? 1 : 0; }
  if (input.isLaunchBlocker != null) { sets.push('is_launch_blocker = :blocker'); params.blocker = input.isLaunchBlocker ? 1 : 0; }
  if (input.defaultOwnerRole !== undefined) { sets.push('default_owner_role = :owner'); params.owner = input.defaultOwnerRole || null; }
  if (input.estimatedDurationDays !== undefined) { sets.push('estimated_duration_days = :duration'); params.duration = input.estimatedDurationDays != null ? Number(input.estimatedDurationDays) : null; }
  if (sets.length) await db.query('UPDATE client_log_template_stages SET ' + sets.join(', ') + ' WHERE id = :id', params);
  return getTemplate(templateId);
}

async function reorderTemplateStages(templateId, orderedIds) {
  var ids = intList(orderedIds);
  for (var i = 0; i < ids.length; i += 1) {
    await db.query('UPDATE client_log_template_stages SET position = :position WHERE id = :id AND template_id = :templateId', { position: i, id: ids[i], templateId: templateId });
  }
  return getTemplate(templateId);
}

async function removeTemplateStage(templateId, stageId) {
  await db.query('DELETE FROM client_log_template_stages WHERE id = :id AND template_id = :templateId', { id: stageId, templateId: templateId });
  return getTemplate(templateId);
}

// ---------- apply template to a client (project) ----------
async function projectRow(projectId) {
  var rows = await db.query(
    'SELECT id, client_name FROM projects WHERE id = :id AND deleted_at IS NULL LIMIT 1',
    { id: projectId }
  );
  if (!rows[0]) throw notFound('Client project not found.', 'PROJECT_NOT_FOUND');
  return rows[0];
}

async function applyTemplate(projectId, templateId, user) {
  var project = await projectRow(projectId);
  var existing = await db.query('SELECT COUNT(*) AS count FROM client_log_stages WHERE project_id = :projectId AND deleted_at IS NULL', { projectId: projectId });
  if (Number(existing[0].count) > 0) throw badRequest('This client already has a Client Logs timeline. Remove it before applying a template.', 'STAGES_EXIST');
  var template = await getTemplate(templateId);
  for (var i = 0; i < template.stages.length; i += 1) {
    var stage = template.stages[i];
    var result = await db.query(
      `INSERT INTO client_log_stages
         (project_id, template_id, name, description, position, is_required, is_milestone, is_launch_blocker, created_by, updated_by)
       VALUES (:projectId, :templateId, :name, :description, :position, :required, :milestone, :blocker, :userId, :userId)`,
      {
        projectId: projectId, templateId: templateId, name: stage.name, description: stage.description || null,
        position: stage.position, required: stage.isRequired ? 1 : 0, milestone: stage.isMilestone ? 1 : 0,
        blocker: stage.isLaunchBlocker ? 1 : 0, userId: user.id,
      }
    );
    await recordHistory(result.insertId, projectId, user, 'stage_created', null, null, stage.name, null);
  }
  await mirrorActivity(projectId, project.client_name, user, 'client_log.timeline_created',
    'Set up Client Logs from "' + template.name + '" (' + template.stages.length + ' stages)', 'success',
    { templateId: templateId, stageCount: template.stages.length });
  return listStages(projectId);
}

/** Super-admin reset: wipe a client's Client Logs timeline back to zero (stages
 *  + cascaded deps/participants/approvals/evidence/history, checks, meetings,
 *  launch readiness). Tasks are kept on the board, just unlinked from stages. */
async function clearClientLogs(projectId, user) {
  var project = await projectRow(projectId);
  await db.query('UPDATE tasks SET stage_id = NULL WHERE project_id = :projectId AND stage_id IS NOT NULL', { projectId: projectId });
  await db.query('DELETE FROM website_checks WHERE project_id = :projectId', { projectId: projectId });
  await db.query('DELETE FROM meetings WHERE project_id = :projectId', { projectId: projectId });
  await db.query('DELETE FROM launch_readiness WHERE project_id = :projectId', { projectId: projectId });
  await db.query('DELETE FROM client_log_stages WHERE project_id = :projectId', { projectId: projectId });
  await mirrorActivity(projectId, project.client_name, user, 'client_log.timeline_cleared',
    'Reset the Client Logs timeline back to zero', 'warning', {});
  return { cleared: true };
}

// ---------- stages ----------
async function taskStatsByStage(stageIds) {
  var stats = {};
  stageIds.forEach(function(id) { stats[id] = emptyTaskStats(); });
  if (!stageIds.length) return stats;
  var rows = await db.query(
    `SELECT stage_id,
       COUNT(*) AS total,
       SUM(status <> 'Done') AS open_count,
       SUM(status = 'Review' OR verification_status = 'awaiting_review') AS awaiting_review,
       SUM(due_date IS NOT NULL AND due_date < CURDATE() AND status <> 'Done') AS overdue,
       SUM(is_critical = 1 AND status <> 'Done') AS critical_open,
       SUM(verification_status = 'verified') AS verified
     FROM tasks
     WHERE stage_id IN (${stageIds.join(',')}) AND deleted_at IS NULL
     GROUP BY stage_id`
  );
  rows.forEach(function(row) {
    stats[row.stage_id] = {
      total: Number(row.total), open: Number(row.open_count), awaitingReview: Number(row.awaiting_review),
      overdue: Number(row.overdue), criticalOpen: Number(row.critical_open), verified: Number(row.verified),
    };
  });
  return stats;
}

async function listStages(projectId) {
  var rows = await db.query(
    `SELECT s.*, o.name AS owner_name, r.name AS reviewer_name
       FROM client_log_stages s
       LEFT JOIN users o ON o.id = s.owner_user_id
       LEFT JOIN users r ON r.id = s.reviewer_user_id
      WHERE s.project_id = :projectId AND s.deleted_at IS NULL
      ORDER BY s.position ASC`,
    { projectId: projectId }
  );
  var stageIds = rows.map(function(row) { return Number(row.id); });
  var deps = stageIds.length
    ? await db.query(`SELECT stage_id, depends_on_stage_id FROM client_log_stage_dependencies WHERE stage_id IN (${stageIds.join(',')})`)
    : [];
  var stats = await taskStatsByStage(stageIds);
  return rows.map(function(row) {
    return mapStage(row, {
      dependsOn: deps.filter(function(dep) { return dep.stage_id === row.id; }).map(function(dep) { return String(dep.depends_on_stage_id); }),
      taskStats: stats[row.id],
    });
  });
}

async function getStage(stageId) {
  var rows = await db.query(
    `SELECT s.*, o.name AS owner_name, r.name AS reviewer_name,
       p.client_name AS project_name
       FROM client_log_stages s
       LEFT JOIN users o ON o.id = s.owner_user_id
       LEFT JOIN users r ON r.id = s.reviewer_user_id
       LEFT JOIN projects p ON p.id = s.project_id
      WHERE s.id = :id AND s.deleted_at IS NULL LIMIT 1`,
    { id: stageId }
  );
  if (!rows[0]) throw notFound('Stage not found.');
  var stage = rows[0];
  var deps = await db.query('SELECT depends_on_stage_id FROM client_log_stage_dependencies WHERE stage_id = :id', { id: stageId });
  var stats = await taskStatsByStage([Number(stageId)]);
  var participants = await db.query('SELECT p.user_id, u.name FROM client_log_stage_participants p LEFT JOIN users u ON u.id = p.user_id WHERE p.stage_id = :id', { id: stageId });
  var approvals = await db.query('SELECT * FROM client_log_stage_approvals WHERE stage_id = :id ORDER BY created_at DESC', { id: stageId });
  var evidence = await db.query('SELECT * FROM client_log_stage_evidence WHERE stage_id = :id ORDER BY created_at DESC', { id: stageId });
  var history = await db.query('SELECT * FROM client_log_stage_history WHERE stage_id = :id ORDER BY created_at DESC LIMIT 100', { id: stageId });
  var tasks = await db.query('SELECT id, title, status, priority, is_critical, verification_status, assignee_name, due_date FROM tasks WHERE stage_id = :id AND deleted_at IS NULL ORDER BY created_at DESC', { id: stageId });
  return Object.assign(mapStage(stage, {
    dependsOn: deps.map(function(dep) { return String(dep.depends_on_stage_id); }),
    taskStats: stats[stage.id],
  }), {
    projectName: stage.project_name || null,
    participants: participants.map(function(p) { return { userId: String(p.user_id), name: p.name }; }),
    approvals: approvals.map(function(a) { return { id: String(a.id), type: a.type, decision: a.decision, approvedByName: a.approved_by_name, note: a.note, createdAt: a.created_at }; }),
    evidence: evidence.map(function(e) { return { id: String(e.id), type: e.type, url: e.url, description: e.description, createdAt: e.created_at }; }),
    history: history.map(function(h) { return { id: String(h.id), action: h.action, field: h.field, oldValue: h.old_value, newValue: h.new_value, reason: h.reason, userName: h.user_name, createdAt: h.created_at }; }),
    tasks: tasks.map(function(t) { return { id: String(t.id), title: t.title, status: t.status, priority: t.priority, isCritical: !!t.is_critical, verificationStatus: t.verification_status, assigneeName: t.assignee_name, dueDate: t.due_date }; }),
  });
}

// ---------- per-client stage management (add / remove / reorder) ----------
async function addStage(projectId, input, user) {
  var project = await projectRow(projectId);
  var name = String((input && input.name) || '').trim();
  if (!name) throw badRequest('Stage name is required.');
  var next = await db.query('SELECT COALESCE(MAX(position) + 1, 0) AS next FROM client_log_stages WHERE project_id = :projectId AND deleted_at IS NULL', { projectId: projectId });
  var result = await db.query(
    `INSERT INTO client_log_stages
       (project_id, name, description, position, is_required, is_milestone, is_launch_blocker, created_by, updated_by)
     VALUES (:projectId, :name, :description, :position, :required, :milestone, :blocker, :userId, :userId)`,
    {
      projectId: projectId, name: name, description: (input && input.description) || null,
      position: Number(next[0].next), required: input.isRequired === false ? 0 : 1,
      milestone: input.isMilestone ? 1 : 0, blocker: input.isLaunchBlocker ? 1 : 0, userId: user.id,
    }
  );
  await recordHistory(result.insertId, projectId, user, 'stage_created', null, null, name, null);
  await mirrorActivity(projectId, project.client_name, user, 'client_log.stage_added',
    'Added stage "' + name + '"', 'info', { stageId: String(result.insertId), stageName: name });
  return listStages(projectId);
}

async function removeStage(stageId, user) {
  var stage = await stageProject(stageId);
  var name = stage.name || null;
  // Keep the tasks (unlink them) and hard-delete the stage; FK cascade removes
  // its dependencies/participants/approvals/evidence/history.
  await db.query('UPDATE tasks SET stage_id = NULL WHERE stage_id = :id', { id: stageId });
  await db.query('DELETE FROM client_log_stages WHERE id = :id', { id: stageId });
  await mirrorActivity(stage.project_id, null, user, 'client_log.stage_removed',
    name ? 'Removed stage "' + name + '"' : 'Removed a stage', 'warning', { stageId: String(stageId) });
  return listStages(stage.project_id);
}

async function reorderStages(projectId, orderedIds, user) {
  var project = await projectRow(projectId);
  var ids = intList(orderedIds);
  for (var i = 0; i < ids.length; i += 1) {
    await db.query(
      'UPDATE client_log_stages SET position = :position, updated_by = :userId WHERE id = :id AND project_id = :projectId AND deleted_at IS NULL',
      { position: i, id: ids[i], projectId: projectId, userId: user.id }
    );
  }
  await mirrorActivity(projectId, project.client_name, user, 'client_log.stages_reordered',
    'Reordered timeline stages', 'info', { count: ids.length });
  return listStages(projectId);
}

var STAGE_FIELDS = {
  name: { column: 'name', label: 'name' },
  description: { column: 'description', label: 'description' },
  status: { column: 'status', label: 'status', enum: ['not_started', 'in_progress', 'awaiting_review', 'blocked', 'completed', 'verified', 'on_hold'] },
  plannedStart: { column: 'planned_start', label: 'planned start' },
  plannedEnd: { column: 'planned_end', label: 'planned end' },
  actualStart: { column: 'actual_start', label: 'actual start' },
  actualEnd: { column: 'actual_end', label: 'actual end' },
  ownerUserId: { column: 'owner_user_id', label: 'owner' },
  reviewerUserId: { column: 'reviewer_user_id', label: 'reviewer' },
  priority: { column: 'priority', label: 'priority', enum: ['Low', 'Medium', 'High', 'Critical'] },
  riskLevel: { column: 'risk_level', label: 'risk level', enum: ['Low', 'Medium', 'High'] },
  isRequired: { column: 'is_required', label: 'required', bool: true },
  isMilestone: { column: 'is_milestone', label: 'milestone', bool: true },
  isLaunchBlocker: { column: 'is_launch_blocker', label: 'launch blocker', bool: true },
  isOnHold: { column: 'is_on_hold', label: 'on hold', bool: true },
  estimatedDurationDays: { column: 'estimated_duration_days', label: 'estimated duration', number: true },
};

async function recordHistory(stageId, projectId, user, action, field, oldValue, newValue, reason) {
  await db.query(
    `INSERT INTO client_log_stage_history (stage_id, project_id, user_id, user_name, action, field, old_value, new_value, reason)
     VALUES (:stageId, :projectId, :userId, :userName, :action, :field, :oldValue, :newValue, :reason)`,
    {
      stageId: stageId, projectId: projectId || null, userId: user ? user.id : null, userName: user ? user.name : null,
      action: action, field: field || null,
      oldValue: oldValue == null ? null : String(oldValue), newValue: newValue == null ? null : String(newValue), reason: reason || null,
    }
  );
}

async function verificationBlockers(stageId) {
  var stats = (await taskStatsByStage([Number(stageId)]))[stageId] || emptyTaskStats();
  var blockers = [];
  if (stats.criticalOpen > 0) blockers.push(stats.criticalOpen + ' critical task(s) not yet verified');
  if (stats.awaitingReview > 0) blockers.push(stats.awaitingReview + ' task(s) awaiting review');
  if (stats.open > 0) blockers.push(stats.open + ' open task(s)');
  return blockers;
}

async function updateStage(stageId, input, user) {
  var current = await db.query('SELECT * FROM client_log_stages WHERE id = :id AND deleted_at IS NULL LIMIT 1', { id: stageId });
  if (!current[0]) throw notFound('Stage not found.');
  var row = current[0];

  // Completion gate: a stage may not be verified while blocking work remains.
  if (input.status === 'verified' && row.status !== 'verified') {
    // Developers cannot verify their own work.
    if (user && user.role === 'developer' && row.owner_user_id && String(row.owner_user_id) === String(user.id)) {
      throw badRequest('Developers cannot verify their own stage — ask a reviewer or manager to verify.', 'SELF_VERIFICATION');
    }
    if (input.override) {
      await recordHistory(stageId, row.project_id, user, 'blocker_overridden', 'verification', null, 'verified', input.reason || null);
    } else {
      var blockers = await verificationBlockers(stageId);
      if (blockers.length) {
        var blockedErr = badRequest('Stage cannot be verified yet — ' + blockers.join('; ') + '.', 'STAGE_BLOCKED');
        blockedErr.blockers = blockers;
        throw blockedErr;
      }
    }
  }

  var sets = [];
  var params = { id: stageId, userId: user.id };
  var changes = [];
  Object.keys(STAGE_FIELDS).forEach(function(key) {
    if (input[key] === undefined) return;
    var meta = STAGE_FIELDS[key];
    var value = input[key];
    if (meta.enum && value != null && meta.enum.indexOf(value) === -1) throw badRequest('Invalid value for ' + meta.label + '.');
    if (meta.bool) value = value ? 1 : 0;
    if (meta.number && value != null) value = Number(value);
    var oldValue = row[meta.column];
    if (String(oldValue == null ? '' : oldValue) === String(value == null ? '' : value)) return;
    sets.push(meta.column + ' = :' + key);
    params[key] = value;
    changes.push({ field: meta.label, oldValue: oldValue, newValue: value });
  });
  if (!sets.length) return getStage(stageId);
  sets.push('updated_by = :userId');
  await db.query('UPDATE client_log_stages SET ' + sets.join(', ') + ' WHERE id = :id', params);
  for (var i = 0; i < changes.length; i += 1) {
    await recordHistory(stageId, row.project_id, user, 'stage_updated', changes[i].field, changes[i].oldValue, changes[i].newValue, input.reason || null);
  }
  var severity = 'info';
  if (input.status === 'verified' || input.status === 'completed') severity = 'success';
  else if (input.status === 'blocked') severity = 'warning';
  await mirrorActivity(row.project_id, null, user, 'client_log.stage_updated',
    'Updated stage "' + row.name + '" (' + changes.map(function(c) { return c.field; }).join(', ') + ')', severity,
    { stageId: String(stageId), fields: changes.map(function(c) { return c.field; }), status: input.status || null });
  return getStage(stageId);
}

// ---------- assignable staff users ----------
async function listAssignableUsers() {
  var rows = await db.query(
    `SELECT id, name, email, role FROM users
      WHERE status = 'active'
        AND role IN ('superadmin','web_dev_manager','developer','designer','client_success_manager')
      ORDER BY name ASC`
  );
  return rows.map(function(row) { return { id: String(row.id), name: row.name, email: row.email, role: row.role }; });
}

// ---------- tasks linked to a stage ----------
async function stageProject(stageId) {
  var rows = await db.query('SELECT id, project_id, name FROM client_log_stages WHERE id = :id AND deleted_at IS NULL LIMIT 1', { id: stageId });
  if (!rows[0]) throw notFound('Stage not found.');
  return rows[0];
}

async function createStageTask(stageId, input, user, context) {
  var stage = await stageProject(stageId);
  var title = String((input && input.title) || '').trim();
  if (!title) throw badRequest('Task title is required.');
  // Delegate to the Tasks module so stage tasks are ordinary tasks (activity
  // log, validation, board visibility) — just tagged with the stage.
  var task = await tasks.createTask({
    projectId: String(stage.project_id),
    stageId: String(stageId),
    title: title,
    description: input.description || '',
    priority: ['Low', 'Medium', 'High'].indexOf(input.priority) !== -1 ? input.priority : 'Medium',
    assigneeUserId: input.assigneeUserId || undefined,
    reviewerUserId: input.reviewerUserId || undefined,
    dueDate: input.dueDate || undefined,
    isCritical: !!input.isCritical,
    acceptanceCriteria: Array.isArray(input.acceptanceCriteria) ? input.acceptanceCriteria : undefined,
    affectedUrls: Array.isArray(input.affectedUrls) ? input.affectedUrls : undefined,
  }, user, context || {});
  await recordHistory(stageId, stage.project_id, user, 'task_linked', 'task', null, title, null);
  return getStage(stageId);
}

async function linkExistingTask(stageId, taskId, user) {
  var stage = await stageProject(stageId);
  var task = await db.query('SELECT id, title FROM tasks WHERE id = :id AND deleted_at IS NULL LIMIT 1', { id: taskId });
  if (!task[0]) throw notFound('Task not found.', 'TASK_NOT_FOUND');
  await db.query('UPDATE tasks SET stage_id = :stageId WHERE id = :id', { stageId: stageId, id: taskId });
  await recordHistory(stageId, stage.project_id, user, 'task_linked', 'task', null, task[0].title, null);
  return getStage(stageId);
}

async function unlinkTask(stageId, taskId, user) {
  var stage = await stageProject(stageId);
  await db.query('UPDATE tasks SET stage_id = NULL WHERE id = :id AND stage_id = :stageId', { id: taskId, stageId: stageId });
  await recordHistory(stageId, stage.project_id, user, 'task_unlinked', 'task', String(taskId), null, null);
  return getStage(stageId);
}

// ---------- launch readiness ----------
/** Pure readiness math over an array of mapped stages (each with .taskStats). */
function computeReadinessFromStages(stages) {
  var isDone = function(stage) { return stage.status === 'completed' || stage.status === 'verified'; };
  var requiredStages = stages.filter(function(stage) { return stage.isRequired; });
  var requiredIncomplete = requiredStages.filter(function(stage) { return !isDone(stage); });
  var launchBlockerStages = stages.filter(function(stage) { return stage.isLaunchBlocker && !isDone(stage); });
  var criticalOpen = stages.reduce(function(sum, stage) { return sum + stage.taskStats.criticalOpen; }, 0);
  var awaitingReview = stages.reduce(function(sum, stage) { return sum + stage.taskStats.awaitingReview; }, 0);
  var overdue = stages.reduce(function(sum, stage) { return sum + stage.taskStats.overdue; }, 0);

  var blockers = [];
  requiredIncomplete.forEach(function(stage) { blockers.push('Required stage not complete: ' + stage.name); });
  launchBlockerStages.forEach(function(stage) { if (!stage.isRequired) blockers.push('Launch-blocker stage not complete: ' + stage.name); });
  if (criticalOpen) blockers.push(criticalOpen + ' critical task(s) still open');
  if (awaitingReview) blockers.push(awaitingReview + ' task(s) awaiting review');

  var requiredDone = requiredStages.length - requiredIncomplete.length;
  var percentage = requiredStages.length ? Math.round((requiredDone / requiredStages.length) * 100) : 100;

  var liveStage = stages.find(function(stage) { return /website live/i.test(stage.name); });
  var postLaunch = stages.find(function(stage) { return /post-launch/i.test(stage.name); });
  var status;
  if (liveStage && isDone(liveStage)) {
    status = postLaunch && !isDone(postLaunch) ? 'post_launch_review' : 'live';
  } else if (blockers.length === 0) {
    status = 'ready';
  } else if (percentage >= 80) {
    status = 'almost_ready';
  } else if (percentage >= 50) {
    status = 'at_risk';
  } else {
    status = 'not_ready';
  }
  return { percentage: percentage, status: status, blockers: blockers, criticalOpen: criticalOpen, awaitingReview: awaitingReview, overdue: overdue };
}

async function computeLaunchReadiness(projectId) {
  await projectRow(projectId);
  var stages = await listStages(projectId);
  var readiness = computeReadinessFromStages(stages);
  await db.query(
    `INSERT INTO launch_readiness (project_id, percentage, status, blockers, calculated_at)
     VALUES (:projectId, :percentage, :status, :blockers, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE percentage = VALUES(percentage), status = VALUES(status), blockers = VALUES(blockers), calculated_at = UTC_TIMESTAMP()`,
    { projectId: projectId, percentage: readiness.percentage, status: readiness.status, blockers: JSON.stringify(readiness.blockers) }
  );
  return Object.assign({ projectId: String(projectId) }, readiness);
}

// ---------- overview (one summarized row per client) ----------
function summarizeClient(project, stages) {
  var base = {
    projectId: String(project.id), clientName: project.client_name,
    projectType: project.type, projectStatus: project.status,
  };
  if (!stages.length) {
    return Object.assign(base, {
      hasTimeline: false, status: 'not_created', currentStage: null, currentOwner: null,
      progress: 0, readinessPercentage: null, readinessStatus: null, blockerCount: 0,
      nextMilestone: null, lastUpdated: null, stageCount: 0,
    });
  }
  var isDone = function(s) { return s.status === 'completed' || s.status === 'verified'; };
  var readiness = computeReadinessFromStages(stages);
  var current = stages.find(function(s) { return s.status === 'blocked'; })
    || stages.find(function(s) { return s.status === 'in_progress' || s.status === 'awaiting_review' || s.status === 'delayed'; })
    || stages.find(function(s) { return !isDone(s); })
    || null;
  var requiredTotal = stages.filter(function(s) { return s.isRequired; }).length;
  var requiredDone = stages.filter(function(s) { return s.isRequired && isDone(s); }).length;
  var progress = requiredTotal ? Math.round((requiredDone / requiredTotal) * 100) : 100;
  var anyDelayed = stages.some(function(s) { return s.status === 'delayed'; });
  var anyBlocked = stages.some(function(s) { return s.status === 'blocked'; });
  var status;
  if (readiness.status === 'live') status = 'live';
  else if (readiness.status === 'post_launch_review') status = 'post_launch_review';
  else if (anyBlocked) status = 'blocked';
  else if (anyDelayed) status = 'delayed';
  else if (readiness.status === 'at_risk' || readiness.status === 'not_ready') status = 'at_risk';
  else status = 'on_track';
  var nextMilestone = stages.find(function(s) { return s.isMilestone && !isDone(s); });
  var lastUpdated = stages.reduce(function(max, s) { return s.updatedAt > max ? s.updatedAt : max; }, stages[0].updatedAt);
  return Object.assign(base, {
    hasTimeline: true, status: status, stageCount: stages.length,
    currentStage: current ? current.name : null, currentOwner: current ? current.ownerName : null,
    progress: progress, readinessPercentage: readiness.percentage, readinessStatus: readiness.status,
    blockerCount: readiness.blockers.length,
    nextMilestone: nextMilestone ? { name: nextMilestone.name, date: nextMilestone.plannedEnd || nextMilestone.plannedStart } : null,
    lastUpdated: lastUpdated,
  });
}

async function overview(input) {
  input = input || {};
  var page = Math.max(1, Number(input.page) || 1);
  var pageSize = Math.min(100, Math.max(1, Number(input.pageSize) || 20));
  var q = String(input.q || '').trim();
  var params = q ? { q: '%' + q + '%' } : {};
  var projects = await db.query(
    'SELECT id, client_name, type, status FROM projects WHERE deleted_at IS NULL ' +
      (q ? 'AND client_name LIKE :q ' : '') + 'ORDER BY client_name ASC',
    params
  );
  var projectIds = projects.map(function(p) { return Number(p.id); });
  var stageRows = projectIds.length
    ? await db.query(
        `SELECT s.*, o.name AS owner_name, r.name AS reviewer_name
           FROM client_log_stages s
           LEFT JOIN users o ON o.id = s.owner_user_id
           LEFT JOIN users r ON r.id = s.reviewer_user_id
          WHERE s.project_id IN (${projectIds.join(',')}) AND s.deleted_at IS NULL
          ORDER BY s.position ASC`
      )
    : [];
  var stats = await taskStatsByStage(stageRows.map(function(s) { return Number(s.id); }));
  var byProject = {};
  stageRows.forEach(function(row) {
    var mapped = mapStage(row, { taskStats: stats[row.id] });
    (byProject[row.project_id] = byProject[row.project_id] || []).push(mapped);
  });

  var rows = projects.map(function(p) { return summarizeClient(p, byProject[p.id] || []); });
  if (input.status && input.status !== 'all') {
    rows = rows.filter(function(r) { return r.status === input.status; });
  }

  var summary = {
    total: rows.length,
    notCreated: rows.filter(function(r) { return r.status === 'not_created'; }).length,
    delayed: rows.filter(function(r) { return r.status === 'delayed'; }).length,
    blocked: rows.filter(function(r) { return r.status === 'blocked'; }).length,
    approachingLaunch: rows.filter(function(r) { return r.readinessStatus === 'ready' || r.readinessStatus === 'almost_ready'; }).length,
    live: rows.filter(function(r) { return r.status === 'live'; }).length,
  };

  var total = rows.length;
  var start = (page - 1) * pageSize;
  return {
    clients: rows.slice(start, start + pageSize),
    summary: summary,
    pagination: { page: page, pageSize: pageSize, total: total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

// ---------- meetings & AI-imported actions ----------
function mapMeeting(row, actions) {
  return {
    id: String(row.id), projectId: String(row.project_id), stageId: row.stage_id ? String(row.stage_id) : null,
    title: row.title, meetingDate: row.meeting_date, participants: parseJson(row.participants, []),
    fathomUrl: row.fathom_url, recordingUrl: row.recording_url, transcriptUrl: row.transcript_url,
    summary: row.summary, status: row.status, createdAt: row.created_at,
    actions: (actions || []).map(function(action) {
      return {
        id: String(action.id), title: action.title, description: action.description,
        priority: action.priority, risk: action.risk,
        affectedAreas: parseJson(action.affected_areas, []), acceptanceCriteria: parseJson(action.acceptance_criteria, []),
        suggestedOwnerId: action.suggested_owner_id ? String(action.suggested_owner_id) : null,
        suggestedReviewerId: action.suggested_reviewer_id ? String(action.suggested_reviewer_id) : null,
        dueDate: action.due_date, sourceTimestamp: action.source_timestamp,
        confirmationStatus: action.confirmation_status, taskId: action.task_id ? String(action.task_id) : null,
      };
    }),
  };
}

async function importMeeting(payload, user) {
  var projectId = payload && (payload.projectId || payload.clientId);
  if (!projectId) throw badRequest('projectId (client) is required.');
  var project = await projectRow(projectId);
  var meeting = (payload && payload.meeting) || {};
  var result = await db.query(
    `INSERT INTO meetings (project_id, stage_id, title, meeting_date, participants, fathom_url, recording_url, transcript_url, summary, status, created_by, updated_by)
     VALUES (:projectId, :stageId, :title, :meetingDate, :participants, :fathomUrl, :recordingUrl, :transcriptUrl, :summary, 'pending', :userId, :userId)`,
    {
      projectId: projectId, stageId: payload.stageId || null,
      title: String(meeting.title || 'Meeting'), meetingDate: meeting.meetingDate || null,
      participants: Array.isArray(meeting.participants) ? JSON.stringify(meeting.participants) : null,
      fathomUrl: meeting.fathomUrl || null, recordingUrl: meeting.recordingUrl || null,
      transcriptUrl: meeting.transcriptUrl || null, summary: meeting.summary || null,
      userId: user ? user.id : null,
    }
  );
  var meetingId = result.insertId;
  var actions = Array.isArray(payload.actions) ? payload.actions : [];
  for (var i = 0; i < actions.length; i += 1) {
    var action = actions[i];
    await db.query(
      `INSERT INTO meeting_actions
         (meeting_id, stage_id, title, description, priority, risk, affected_areas, acceptance_criteria,
          suggested_owner_id, suggested_reviewer_id, due_date, source_timestamp, confirmation_status)
       VALUES (:meetingId, :stageId, :title, :description, :priority, :risk, :affectedAreas, :acceptanceCriteria,
          :ownerId, :reviewerId, :dueDate, :sourceTimestamp, 'awaiting_confirmation')`,
      {
        meetingId: meetingId, stageId: payload.stageId || null,
        title: String(action.title || 'Action'), description: action.description || null,
        priority: ['Low', 'Medium', 'High', 'Critical'].indexOf(action.priority) !== -1 ? action.priority : 'Medium',
        risk: action.risk || null,
        affectedAreas: Array.isArray(action.affectedAreas) ? JSON.stringify(action.affectedAreas) : null,
        acceptanceCriteria: Array.isArray(action.acceptanceCriteria) ? JSON.stringify(action.acceptanceCriteria) : null,
        ownerId: action.suggestedOwnerId || null, reviewerId: action.suggestedReviewerId || null,
        dueDate: action.dueDate || null, sourceTimestamp: action.sourceTimestamp || null,
      }
    );
  }
  await mirrorActivity(projectId, project.client_name, user, 'client_log.meeting_imported',
    'Imported meeting "' + String(meeting.title || 'Meeting') + '" with ' + actions.length + ' proposed action(s)', 'info',
    { meetingId: String(meetingId), actionCount: actions.length });
  return getMeeting(meetingId);
}

async function getMeeting(meetingId) {
  var rows = await db.query('SELECT * FROM meetings WHERE id = :id AND deleted_at IS NULL LIMIT 1', { id: meetingId });
  if (!rows[0]) throw notFound('Meeting not found.', 'MEETING_NOT_FOUND');
  var actions = await db.query('SELECT * FROM meeting_actions WHERE meeting_id = :id ORDER BY id ASC', { id: meetingId });
  return mapMeeting(rows[0], actions);
}

async function listMeetings(projectId, stageId) {
  var params = { projectId: projectId };
  var where = 'project_id = :projectId AND deleted_at IS NULL';
  if (stageId) { where += ' AND stage_id = :stageId'; params.stageId = stageId; }
  var rows = await db.query('SELECT * FROM meetings WHERE ' + where + ' ORDER BY created_at DESC', params);
  var out = [];
  for (var i = 0; i < rows.length; i += 1) {
    var actions = await db.query('SELECT * FROM meeting_actions WHERE meeting_id = :id ORDER BY id ASC', { id: rows[i].id });
    out.push(mapMeeting(rows[i], actions));
  }
  return out;
}

/** A human confirms an AI-imported action → it becomes a real team task. */
async function confirmMeetingAction(actionId, input, user) {
  var rows = await db.query(
    `SELECT ma.*, m.project_id FROM meeting_actions ma JOIN meetings m ON m.id = ma.meeting_id WHERE ma.id = :id LIMIT 1`,
    { id: actionId }
  );
  if (!rows[0]) throw notFound('Meeting action not found.', 'ACTION_NOT_FOUND');
  var action = rows[0];
  if (action.confirmation_status === 'confirmed' && action.task_id) return getMeeting(action.meeting_id);
  var ownerId = input.assigneeUserId || action.suggested_owner_id || null;
  var task = await tasks.createTask({
    projectId: String(action.project_id),
    stageId: action.stage_id ? String(action.stage_id) : undefined,
    title: action.title,
    description: action.description || '',
    priority: action.priority === 'Critical' ? 'High' : action.priority,
    assigneeUserId: ownerId || undefined,
    reviewerUserId: action.suggested_reviewer_id || undefined,
    dueDate: action.due_date || undefined,
    isCritical: action.priority === 'Critical',
    acceptanceCriteria: parseJson(action.acceptance_criteria, undefined),
    affectedUrls: parseJson(action.affected_areas, undefined),
    originMeetingActionId: String(actionId),
  }, user, {});
  await db.query('UPDATE meeting_actions SET confirmation_status = \'confirmed\', task_id = :taskId WHERE id = :id', { taskId: task.id, id: actionId });
  if (action.stage_id) await recordHistory(action.stage_id, action.project_id, user, 'meeting_action_confirmed', 'action', null, action.title, null);
  await mirrorActivity(action.project_id, null, user, 'client_log.meeting_action_confirmed',
    'Confirmed meeting action "' + action.title + '" → task', 'success', { actionId: String(actionId), taskId: String(task.id) });
  return getMeeting(action.meeting_id);
}

async function rejectMeetingAction(actionId, user) {
  var rows = await db.query(
    'SELECT ma.meeting_id, ma.title, m.project_id FROM meeting_actions ma JOIN meetings m ON m.id = ma.meeting_id WHERE ma.id = :id LIMIT 1',
    { id: actionId }
  );
  if (!rows[0]) throw notFound('Meeting action not found.', 'ACTION_NOT_FOUND');
  await db.query('UPDATE meeting_actions SET confirmation_status = \'rejected\' WHERE id = :id', { id: actionId });
  await mirrorActivity(rows[0].project_id, null, user, 'client_log.meeting_action_rejected',
    'Rejected meeting action "' + rows[0].title + '"', 'info', { actionId: String(actionId) });
  return getMeeting(rows[0].meeting_id);
}

module.exports = {
  importMeeting: importMeeting,
  listMeetings: listMeetings,
  getMeeting: getMeeting,
  confirmMeetingAction: confirmMeetingAction,
  rejectMeetingAction: rejectMeetingAction,
  listAssignableUsers: listAssignableUsers,
  createStageTask: createStageTask,
  linkExistingTask: linkExistingTask,
  unlinkTask: unlinkTask,
  computeLaunchReadiness: computeLaunchReadiness,
  computeReadinessFromStages: computeReadinessFromStages,
  computeStageProgress: computeStageProgress,
  summarizeClient: summarizeClient,
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
