'use strict';

var db = require('../../db/pool');

function fail(status, code, message) {
  var err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function cleanText(value, max) {
  var text = String(value == null ? '' : value).trim();
  if (max && text.length > max) text = text.slice(0, max);
  return text;
}

/** The full QA-criteria payload: grouped criteria + the editable prompt and
 *  the uploaded report template. Also serves as the public criteria API. */
async function getAll() {
  var groups = await db.query(
    'SELECT id, name FROM qa_criteria_groups ORDER BY sort_order ASC, id ASC'
  );
  var items = await db.query(
    'SELECT id, group_id, text FROM qa_criteria_items ORDER BY sort_order ASC, id ASC'
  );
  var byGroup = {};
  items.forEach(function(item) {
    var key = String(item.group_id);
    if (!byGroup[key]) byGroup[key] = [];
    byGroup[key].push({ id: String(item.id), text: item.text });
  });
  var settingsRows = await db.query('SELECT * FROM qa_criteria_settings WHERE id = 1');
  var settings = settingsRows[0] || {};
  return {
    groups: groups.map(function(group) {
      return {
        id: String(group.id),
        name: group.name,
        items: byGroup[String(group.id)] || [],
      };
    }),
    prompt: settings.ai_prompt || '',
    template: settings.template_url
      ? { url: settings.template_url, name: settings.template_name || 'Report template' }
      : null,
  };
}

async function nextSort(table, where, params) {
  var rows = await db.query(
    'SELECT COALESCE(MAX(sort_order), 0) + 100 AS next FROM ' + table + (where ? ' WHERE ' + where : ''),
    params || {}
  );
  return rows[0] ? Number(rows[0].next) : 100;
}

async function createGroup(input) {
  var name = cleanText(input && input.name, 190);
  if (!name) throw fail(400, 'VALIDATION_ERROR', 'Group name is required.');
  var sort = await nextSort('qa_criteria_groups');
  await db.query(
    'INSERT INTO qa_criteria_groups (name, sort_order) VALUES (:name, :sort)',
    { name: name, sort: sort }
  );
  return getAll();
}

async function renameGroup(groupId, input) {
  var name = cleanText(input && input.name, 190);
  if (!name) throw fail(400, 'VALIDATION_ERROR', 'Group name is required.');
  var result = await db.query(
    'UPDATE qa_criteria_groups SET name = :name WHERE id = :id',
    { name: name, id: groupId }
  );
  if (!result.affectedRows) throw fail(404, 'GROUP_NOT_FOUND', 'Group not found.');
  return getAll();
}

async function deleteGroup(groupId) {
  await db.query('DELETE FROM qa_criteria_groups WHERE id = :id', { id: groupId });
  return getAll();
}

async function addItem(groupId, input) {
  var text = cleanText(input && input.text, 500);
  if (!text) throw fail(400, 'VALIDATION_ERROR', 'Criterion text is required.');
  var group = await db.query('SELECT id FROM qa_criteria_groups WHERE id = :id LIMIT 1', { id: groupId });
  if (!group[0]) throw fail(404, 'GROUP_NOT_FOUND', 'Group not found.');
  var sort = await nextSort('qa_criteria_items', 'group_id = :gid', { gid: groupId });
  await db.query(
    'INSERT INTO qa_criteria_items (group_id, text, sort_order) VALUES (:gid, :text, :sort)',
    { gid: groupId, text: text, sort: sort }
  );
  return getAll();
}

async function updateItem(itemId, input) {
  var text = cleanText(input && input.text, 500);
  if (!text) throw fail(400, 'VALIDATION_ERROR', 'Criterion text is required.');
  var result = await db.query(
    'UPDATE qa_criteria_items SET text = :text WHERE id = :id',
    { text: text, id: itemId }
  );
  if (!result.affectedRows) throw fail(404, 'ITEM_NOT_FOUND', 'Criterion not found.');
  return getAll();
}

async function deleteItem(itemId) {
  await db.query('DELETE FROM qa_criteria_items WHERE id = :id', { id: itemId });
  return getAll();
}

async function savePrompt(input, user) {
  var prompt = cleanText(input && input.prompt, 8000);
  await db.query(
    `INSERT INTO qa_criteria_settings (id, ai_prompt, updated_by) VALUES (1, :prompt, :userId)
     ON DUPLICATE KEY UPDATE ai_prompt = :prompt, updated_by = :userId`,
    { prompt: prompt, userId: user ? user.id : null }
  );
  return getAll();
}

async function saveTemplate(url, name, user) {
  await db.query(
    `INSERT INTO qa_criteria_settings (id, template_url, template_name, updated_by)
       VALUES (1, :url, :name, :userId)
     ON DUPLICATE KEY UPDATE template_url = :url, template_name = :name, updated_by = :userId`,
    { url: url, name: name, userId: user ? user.id : null }
  );
  return getAll();
}

module.exports = {
  getAll: getAll,
  createGroup: createGroup,
  renameGroup: renameGroup,
  deleteGroup: deleteGroup,
  addItem: addItem,
  updateItem: updateItem,
  deleteItem: deleteItem,
  savePrompt: savePrompt,
  saveTemplate: saveTemplate,
};
