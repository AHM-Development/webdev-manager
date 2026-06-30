var db = require('../../db/pool');
var activity = require('../auth/activity.service');

var COLORS = ['white', 'blue', 'green', 'yellow', 'pink'];

function fail(status, code, message) {
  var err = new Error(message);
  err.status = status;
  err.code = code;
  throw err;
}

function mapNote(row) {
  return {
    id: String(row.id),
    title: row.title,
    content: row.content,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function payload(input, partial) {
  var result = {};
  if (!partial || input.title != null) {
    result.title = String(input.title || '').trim();
    if (!result.title) fail(400, 'NOTE_TITLE_REQUIRED', 'Title is required.');
    if (result.title.length > 255) fail(400, 'NOTE_TITLE_TOO_LONG', 'Title must be 255 characters or fewer.');
  }
  if (!partial || input.content != null) {
    result.content = String(input.content || '').trim();
    if (!result.content) fail(400, 'NOTE_CONTENT_REQUIRED', 'Note content is required.');
    if (result.content.length > 50000) fail(400, 'NOTE_CONTENT_TOO_LONG', 'Note content must be 50,000 characters or fewer.');
  }
  if (!partial || input.color != null) {
    result.color = COLORS.includes(input.color) ? input.color : 'white';
  }
  return result;
}

async function getOwned(noteId, userId) {
  var rows = await db.query(
    'SELECT * FROM notes WHERE id = :noteId AND user_id = :userId AND deleted_at IS NULL LIMIT 1',
    { noteId: noteId, userId: userId }
  );
  if (!rows[0]) fail(404, 'NOTE_NOT_FOUND', 'Note not found.');
  return rows[0];
}

async function list(input, user) {
  var limit = Math.min(200, Math.max(1, Number(input.limit) || 100));
  var q = String(input.q || '').trim();
  var where = ['user_id = :userId', 'deleted_at IS NULL'];
  var params = { userId: user.id };
  if (q) {
    where.push('(title LIKE :q OR content LIKE :q)');
    params.q = '%' + q + '%';
  }
  var rows = await db.query(
    `SELECT * FROM notes WHERE ${where.join(' AND ')} ORDER BY updated_at DESC, id DESC LIMIT ${limit}`,
    params
  );
  return rows.map(mapNote);
}

async function create(input, user, context) {
  var values = payload(input || {}, false);
  var result = await db.query(
    `INSERT INTO notes (user_id, title, content, color)
     VALUES (:userId, :title, :content, :color)`,
    { userId: user.id, title: values.title, content: values.content, color: values.color }
  );
  var note = mapNote(await getOwned(result.insertId, user.id));
  await log(user, context, 'notes.create', note);
  return note;
}

async function update(noteId, input, user, context) {
  await getOwned(noteId, user.id);
  var values = payload(input || {}, true);
  var sets = [];
  var params = { noteId: noteId, userId: user.id };
  ['title', 'content', 'color'].forEach(function(key) {
    if (values[key] !== undefined) {
      sets.push(key + ' = :' + key);
      params[key] = values[key];
    }
  });
  if (!sets.length) return mapNote(await getOwned(noteId, user.id));
  await db.query(
    `UPDATE notes SET ${sets.join(', ')} WHERE id = :noteId AND user_id = :userId AND deleted_at IS NULL`,
    params
  );
  var note = mapNote(await getOwned(noteId, user.id));
  await log(user, context, 'notes.update', note);
  return note;
}

async function remove(noteId, user, context) {
  var note = mapNote(await getOwned(noteId, user.id));
  await db.query(
    'UPDATE notes SET deleted_at = UTC_TIMESTAMP() WHERE id = :noteId AND user_id = :userId AND deleted_at IS NULL',
    { noteId: noteId, userId: user.id }
  );
  await log(user, context, 'notes.delete', note, 'warning');
}

async function log(user, context, eventType, note, severity) {
  await activity.logActivity({
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    eventType: eventType,
    action: eventType,
    description: note.title,
    targetType: 'note',
    targetId: note.id,
    targetName: note.title,
    severity: severity || 'info',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { noteId: note.id },
  });
}

module.exports = { list: list, create: create, update: update, remove: remove };
