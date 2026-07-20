'use strict';

// Guards the self-describing capability list. Viktor discovers arg shapes from
// GET /agent/actions, so every action must advertise its args (and the create/
// update actions must show the `input` nesting that tripped up integrators).

const test = require('node:test');
const assert = require('node:assert');
const actions = require('./agent.actions');

test('every action advertises an args descriptor', () => {
  const missing = Object.keys(actions.ACTIONS).filter((k) => !(k in actions.ARGS));
  assert.deepEqual(missing, [], 'actions missing args docs: ' + missing.join(', '));
});

test('list() exposes key/access/roles/args for each action', () => {
  const list = actions.list();
  assert.equal(list.length, Object.keys(actions.ACTIONS).length);
  for (const entry of list) {
    assert.equal(typeof entry.key, 'string');
    assert.ok(entry.access === 'read' || entry.access === 'write');
    assert.ok(Array.isArray(entry.roles));
    assert.ok(entry.args && typeof entry.args === 'object');
  }
});

test('tasks.create advertises the input.title nesting (the "Untitled" footgun)', () => {
  const create = actions.list().find((a) => a.key === 'tasks.create');
  assert.ok(create.args.input, 'fields live under input, not the top level');
  assert.match(String(create.args.input.title), /required/);
  // setStatus, by contrast, is flat.
  const setStatus = actions.list().find((a) => a.key === 'tasks.setStatus');
  assert.ok(setStatus.args.taskId, 'setStatus takes taskId at the top level');
  assert.equal(setStatus.args.input, undefined);
});

test('agentDate resolves relative words and passes ISO dates through', () => {
  const today = actions.agentToday(0);
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/, 'today is YYYY-MM-DD');
  assert.equal(actions.agentDate('today'), today);
  assert.equal(actions.agentDate('TODAY'), today);
  assert.notEqual(actions.agentDate('tomorrow'), today);
  assert.equal(actions.agentDate('2026-08-01'), '2026-08-01', 'ISO passes through');
  assert.equal(actions.agentDate(''), null);
  assert.equal(actions.agentDate(null), null);
});
