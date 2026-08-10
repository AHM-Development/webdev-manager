'use strict';

// The agent's tasks.update MERGES partial input over the current task, so Viktor
// can change one field (or append an attachment) without wiping the rest. The
// tasks service is mocked so we can assert exactly what updateTask receives.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const tasksPath = path.resolve(__dirname, '../tasks/tasks.service.js');
const actionsPath = path.resolve(__dirname, './agent.actions.js');

function inject(filename, exports) {
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}

let captured = null;
const currentTask = {
  id: '7', projectId: '3', title: 'Build homepage', description: 'desc',
  checklist: [{ title: 'a', completed: false }],
  attachments: [{ id: 'att1', name: 'brief.pdf', type: 'file', url: 'https://x/brief.pdf' }],
  status: 'In Progress', priority: 'High', assignee: 'Dev', assigneeUserId: '2',
  startDate: '2026-08-01', dueDate: '2026-08-10', reviewerUserId: null,
};
inject(tasksPath, {
  getTask: async () => currentTask,
  updateTask: async (id, input) => { captured = { id, input }; return Object.assign({}, currentTask, input); },
});

delete require.cache[actionsPath];
const actions = require(actionsPath);
const user = { id: 2, role: 'developer' };

test('tasks.update merges a partial change (untouched fields preserved)', async () => {
  captured = null;
  await actions.ACTIONS['tasks.update'].run(user, { taskId: '7', input: { status: 'Review' } }, {});
  assert.equal(captured.input.status, 'Review'); // changed
  assert.equal(captured.input.title, 'Build homepage'); // preserved
  assert.equal(captured.input.priority, 'High'); // preserved
  assert.deepEqual(captured.input.attachments, currentTask.attachments); // preserved
});

test('tasks.update addAttachments appends without dropping existing ones', async () => {
  captured = null;
  await actions.ACTIONS['tasks.update'].run(user, {
    taskId: '7',
    input: { addAttachments: [{ name: 'shot.png', url: 'https://x/s.png', type: 'file' }] },
  }, {});
  assert.equal(captured.input.attachments.length, 2);
  assert.equal(captured.input.attachments[0].id, 'att1');
  assert.equal(captured.input.attachments[1].name, 'shot.png');
});

test('registry exposes the new comment + notification capabilities', () => {
  assert.equal(actions.ACTIONS['tasks.comments'].access, 'read');
  assert.equal(actions.ACTIONS['tasks.comment'].access, 'write');
  assert.equal(actions.ACTIONS['tasks.deleteComment'].access, 'write');
  assert.equal(actions.ACTIONS['notifications.list'].access, 'read');
  assert.ok(actions.ARGS['tasks.comment'].input, 'comment advertises its input');
  assert.match(String(actions.ARGS['tasks.update'].input), /addAttachments/);
});
