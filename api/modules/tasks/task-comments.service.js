'use strict';

var db = require('../../db/pool');
var notifications = require('../notifications/notifications.service');

function fail(status, code, message) {
  var err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

// Mentions are encoded in the body as @[Full Name](userId). The stored user-id
// list is derived from the body server-side (never trusted from the client).
var MENTION_RE = /@\[[^\]]+\]\((\d+)\)/g;

function extractMentionIds(body) {
  var ids = [];
  var match;
  MENTION_RE.lastIndex = 0;
  while ((match = MENTION_RE.exec(String(body || ''))) !== null) {
    if (ids.indexOf(match[1]) === -1) ids.push(match[1]);
  }
  return ids;
}

// A plain-text version of the body for notification snippets: @[Name](id) -> @Name.
function bodyToPlainText(body) {
  return String(body || '').replace(/@\[([^\]]+)\]\(\d+\)/g, '@$1');
}

function snippet(body, max) {
  var text = bodyToPlainText(body).replace(/\s+/g, ' ').trim();
  var limit = max || 120;
  return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
}

function rowToComment(row) {
  var mentions = row.mentions;
  if (typeof mentions === 'string') {
    try { mentions = JSON.parse(mentions); } catch (err) { mentions = []; }
  }
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    parentId: row.parent_id ? String(row.parent_id) : null,
    body: row.body,
    mentions: Array.isArray(mentions) ? mentions.map(String) : [],
    author: {
      id: row.author_user_id ? String(row.author_user_id) : null,
      name: row.author_name || 'Unknown user',
      avatarUrl: row.author_avatar || null,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertTask(taskId) {
  var rows = await db.query(
    'SELECT id, title, project_id FROM tasks WHERE id = :taskId AND deleted_at IS NULL LIMIT 1',
    { taskId: taskId }
  );
  if (!rows[0]) throw fail(404, 'TASK_NOT_FOUND', 'Task not found.');
  return rows[0];
}

async function listComments(taskId) {
  await assertTask(taskId);
  var rows = await db.query(
    `SELECT c.*, u.name AS author_name, u.avatar_url AS author_avatar
     FROM task_comments c
     LEFT JOIN users u ON u.id = c.author_user_id
     WHERE c.task_id = :taskId AND c.deleted_at IS NULL
     ORDER BY c.created_at ASC, c.id ASC`,
    { taskId: taskId }
  );
  var comments = rows.map(rowToComment);

  // Nest replies under their top-level parent (two levels only).
  var byId = {};
  var roots = [];
  comments.forEach(function(comment) {
    comment.replies = [];
    byId[comment.id] = comment;
  });
  comments.forEach(function(comment) {
    if (comment.parentId && byId[comment.parentId]) {
      byId[comment.parentId].replies.push(comment);
    } else {
      roots.push(comment);
    }
  });
  return roots;
}

// Resolve mentioned ids to active users (drops anything invalid). The ids come
// from the @[Name](\d+) token regex, so they are digit-only and safe to inline.
async function resolveActiveUsers(ids) {
  var safe = ids.filter(function(id) { return /^\d+$/.test(id); });
  if (!safe.length) return [];
  var rows = await db.query(
    "SELECT id, name FROM users WHERE deleted_at IS NULL AND status = 'active' AND id IN (" +
      safe.join(',') + ")"
  );
  return rows.map(function(row) { return { id: String(row.id), name: row.name }; });
}

function taskHeadline(task, clientName) {
  var client = clientName ? ' · ' + clientName : '';
  return '"' + (task.title || 'Untitled task') + '"' + client;
}

function taskActionUrl(taskId) {
  return '/dashboard/tasks?task=' + encodeURIComponent(taskId);
}

async function createComment(taskId, input, user, context) {
  var task = await assertTask(taskId);
  var body = String((input && input.body) || '').trim();
  if (!body) throw fail(400, 'VALIDATION_ERROR', 'Comment cannot be empty.');
  if (body.length > 5000) throw fail(400, 'VALIDATION_ERROR', 'Comment is too long.');

  // Enforce exactly two levels: replying to a reply attaches to its parent.
  var parentId = null;
  var parentAuthorId = null;
  if (input && input.parentId) {
    var parentRows = await db.query(
      `SELECT id, parent_id, author_user_id FROM task_comments
       WHERE id = :id AND task_id = :taskId AND deleted_at IS NULL LIMIT 1`,
      { id: input.parentId, taskId: taskId }
    );
    if (!parentRows[0]) throw fail(400, 'PARENT_NOT_FOUND', 'The comment being replied to no longer exists.');
    var parent = parentRows[0];
    parentId = parent.parent_id ? String(parent.parent_id) : String(parent.id);
    // Notify the author of the specific comment that was replied to.
    parentAuthorId = parent.author_user_id ? String(parent.author_user_id) : null;
  }

  var mentionIds = extractMentionIds(body);
  var mentionedUsers = await resolveActiveUsers(mentionIds);
  var validMentionIds = mentionedUsers.map(function(u) { return u.id; });

  var result = await db.query(
    `INSERT INTO task_comments (task_id, parent_id, author_user_id, body, mentions)
     VALUES (:taskId, :parentId, :authorId, :body, :mentions)`,
    {
      taskId: taskId,
      parentId: parentId,
      authorId: user.id,
      body: body,
      mentions: JSON.stringify(validMentionIds),
    }
  );

  var rows = await db.query(
    `SELECT c.*, u.name AS author_name, u.avatar_url AS author_avatar
     FROM task_comments c
     LEFT JOIN users u ON u.id = c.author_user_id
     WHERE c.id = :id LIMIT 1`,
    { id: result.insertId }
  );
  var comment = rowToComment(rows[0]);
  comment.replies = [];

  // --- Notifications (best-effort) ---
  var headline = taskHeadline(task, task.client_name);
  var actorName = (user && (user.name || user.email)) || 'A teammate';
  var url = taskActionUrl(taskId);
  var text = snippet(body);
  var notified = {};
  notified[String(user.id)] = true; // never notify the author

  validMentionIds.forEach(function(uid) {
    if (notified[uid]) return;
    notified[uid] = true;
    notifications.dispatch(notifications.CATEGORY.TASK_ASSIGNMENT, {
      userId: uid, audienceType: 'user', type: 'task_comment_mention',
      title: 'You were mentioned in a comment',
      message: actorName + ' mentioned you on ' + headline + ': "' + text + '"',
      actionUrl: url, metadata: { taskId: String(taskId), commentId: comment.id },
    }, user, context).catch(function() {});
  });

  if (parentAuthorId && !notified[parentAuthorId]) {
    notified[parentAuthorId] = true;
    notifications.dispatch(notifications.CATEGORY.TASK_ASSIGNMENT, {
      userId: parentAuthorId, audienceType: 'user', type: 'task_comment_reply',
      title: 'New reply to your comment',
      message: actorName + ' replied on ' + headline + ': "' + text + '"',
      actionUrl: url, metadata: { taskId: String(taskId), commentId: comment.id },
    }, user, context).catch(function() {});
  }

  return comment;
}

async function deleteComment(taskId, commentId, user) {
  var rows = await db.query(
    'SELECT id, author_user_id FROM task_comments WHERE id = :id AND task_id = :taskId AND deleted_at IS NULL LIMIT 1',
    { id: commentId, taskId: taskId }
  );
  if (!rows[0]) throw fail(404, 'COMMENT_NOT_FOUND', 'Comment not found.');
  var isAuthor = String(rows[0].author_user_id) === String(user.id);
  var isSuperadmin = user.role === 'superadmin';
  if (!isAuthor && !isSuperadmin) {
    throw fail(403, 'FORBIDDEN', 'You can only delete your own comments.');
  }
  // Soft-delete the comment and any replies to it.
  await db.query(
    `UPDATE task_comments SET deleted_at = UTC_TIMESTAMP()
     WHERE (id = :id OR parent_id = :id) AND deleted_at IS NULL`,
    { id: commentId }
  );
}

module.exports = {
  listComments: listComments,
  createComment: createComment,
  deleteComment: deleteComment,
};
